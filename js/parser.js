/* C4P parser: turns a Control4 .c4p project backup into a site inventory.
   Works in the browser (JSZip + DOMParser globals) and in Node (pass them in). */
function createC4PParser(JSZipLib, DOMParserLib) {
  const TYPE = { PROJECT: '1', SITE: '2', BUILDING: '3', FLOOR: '4', DEVICE: '6', PROXY: '7', ROOM: '8', AGENT: '9' };

  // Classes that represent real wires a tech would run or check
  const CONTROL_CLASSES = /^(IR_OUT|IR_IN|RS_232|RS_485|CONTACT|CONTACT_SENSOR|RELAY|RELAY_.*|VOLTAGE.*|IR)$/;
  const AV_CLASSES = /^(HDMI|STEREO|COMPONENT|COMPOSITE|S_VIDEO|DIGITAL_COAX|DIGITAL_OPTICAL|SPEAKER|SPEAKER_.*|VGA|DVI|HDBASET|ANALOG.*|AUDIO_.*_OUT|DISPLAYPORT)$/;

  const VIRTUAL_FILES = /^(um_|c4_av-path-setter|control4_remote_hub|uibutton|room_control_keypad|control4_digitalaudio|rf_)/i;
  const SERVICE_CONTROL = new Set(['rf_network', 'control4_digitalaudio', 'media_service', 'uibutton']);

  // ---------- small DOM helpers that work with both browser DOM and xmldom ----------
  function kids(el, tag) {
    const out = [];
    if (!el) return out;
    for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (!tag || n.nodeName === tag)) out.push(n);
    return out;
  }
  function kid(el, tag) { return kids(el, tag)[0] || null; }
  function txt(el, path) {
    let cur = el;
    for (const p of path.split('/')) { cur = kid(cur, p); if (!cur) return ''; }
    return (cur.textContent || '').trim();
  }
  function all(el, tag) { return el ? Array.from(el.getElementsByTagName(tag)) : []; }

  function decodeEntities(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
  }

  // Driver-generated properties live as XML text inside <state>
  function stateProps(stateText) {
    const props = {};
    if (!stateText || stateText.indexOf('<property>') < 0) return props;
    const re = /<property>\s*<name>([^<]*)<\/name>\s*(?:<value\s*\/>|<value>([^<]*)<\/value>)/g;
    let m;
    while ((m = re.exec(stateText))) {
      const name = decodeEntities(m[1]).trim();
      const val = decodeEntities(m[2] || '').trim();
      if (name && !(name in props)) props[name] = val;
    }
    return props;
  }

  const IP_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  function ipKey(ip) { const m = IP_RE.exec(ip || ''); return m ? m.slice(1).map(n => n.padStart(3, '0')).join('.') : 'zzz'; }

  function fmtMac(raw) {
    const h = (raw || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
    return h.length === 12 ? h.match(/../g).join(':') : (raw || '');
  }

  function pickProp(props, names) {
    for (const n of names) if (props[n]) return props[n];
    return '';
  }

  function stem(file) { return (file || '').replace(/\.(c4i|c4z)$/i, ''); }

  // ---------- driver definitions ----------
  function parseDriverXml(xmlText, file) {
    const doc = new DOMParserLib().parseFromString(xmlText, 'text/xml');
    const root = doc.documentElement;
    if (!root) return null;
    const conns = {};
    for (const c of all(root, 'connection')) {
      const id = txt(c, 'id');
      if (!id) continue;
      conns[id] = {
        name: txt(c, 'connectionname'),
        type: txt(c, 'type'),
        consumer: txt(c, 'consumer') === 'True',
        hidden: txt(c, 'hidden') === 'True',
        classes: all(c, 'classname').map(x => (x.textContent || '').trim())
      };
    }
    const proxies = all(root, 'proxy').map(p => ({ id: p.getAttribute('proxybindingid'), name: p.getAttribute('name'), type: (p.textContent || '').trim() }));
    return {
      file,
      manufacturer: txt(root, 'manufacturer'),
      model: txt(root, 'model'),
      name: txt(root, 'name'),
      control: txt(root, 'control'),
      controlMethod: txt(root, 'controlmethod').toLowerCase(),
      version: txt(root, 'version'),
      certified: txt(root, 'certified'),
      created: txt(root, 'created'),
      proxies,
      connections: conns
    };
  }

  async function loadDrivers(zip, wanted) {
    const names = Object.keys(zip.files).filter(n => n.startsWith('drivers/') && !zip.files[n].dir);
    const byLower = {};
    for (const n of names) byLower[n.slice(8).toLowerCase()] = n;
    const drivers = {};

    function resolve(file) {
      const lf = file.toLowerCase();
      if (byLower[lf]) return byLower[lf];
      // Composer sometimes stores a renamed copy, e.g. tv_x.c4i -> tv_x_0_NUE.c4i
      const s = stem(lf);
      const hit = Object.keys(byLower).find(k => stem(k).startsWith(s) && k.slice(-4) === lf.slice(-4));
      return hit ? byLower[hit] : null;
    }

    await Promise.all(Array.from(wanted).map(async file => {
      const path = resolve(file);
      if (!path) { drivers[file] = null; return; }
      try {
        let xml;
        if (/\.c4z$/i.test(path)) {
          const inner = await JSZipLib.loadAsync(await zip.file(path).async('uint8array'));
          const dx = inner.file('driver.xml') || inner.file(Object.keys(inner.files).find(n => /(^|\/)driver\.xml$/i.test(n)) || '');
          xml = dx ? await dx.async('string') : null;
        } else {
          xml = await zip.file(path).async('string');
        }
        drivers[file] = xml ? parseDriverXml(xml, file) : null;
      } catch (e) {
        drivers[file] = null;
      }
    }));
    return drivers;
  }

  // ---------- classification ----------
  const PROXY_CATEGORY = [
    [/^(tv|plasma|projector)$/, 'Display'],
    [/^(receiver|tuner|amplifier)$/, 'Audio'],
    [/^aswitch$/, 'Audio'],
    [/^(dvd|discchanger|cable|satellite|media_player|vcr)$/, 'Source'],
    [/^avswitch$/, 'Switching'],
    [/^(light|light_v2|keypad_proxy|blind|fan)/, 'Lighting'],
    [/^controller$/, 'Controller'],
    [/^(thermostat|hvac)/, 'Climate'],
    [/^(securitypanel|lock|camera|doorstation)/, 'Security'],
    [/^(relay|contact|motion)/, 'I/O']
  ];

  function categorize(drv, file) {
    const f = (file || '').toLowerCase();
    const control = (drv && drv.control || '').toLowerCase();
    if (/core|_ea\d|hc\d00|controller/.test(f) && /control4_/.test(control)) return 'Controller';
    if (/remote/.test(control) || /sr2\d0|neeo|halo/.test(f)) return 'Remote';
    if (/wattbox|pdu|ups/.test(f)) return 'Power';
    if (/iox|z2io|io_extender|zigbee_io/.test(f)) return 'I/O';
    if (/touch|t3|t4|t5|_tsc|ts_/.test(f) && /control4/.test(control)) return 'Touchscreen';
    if (/usb_mediastorage/.test(f)) return 'Storage';
    if (/roku|apple_?tv|kaleidescape|tivo|cable_|satellite|blu-?ray|dvd_|discchanger/.test(f)) return 'Source';
    if (control === 'control4_lights_gen3' || /dimmer|switch_gen|keypad|lights/.test(f)) return 'Lighting';
    const firstProxy = drv && drv.proxies && drv.proxies[0] ? drv.proxies[0].type.toLowerCase() : stem(f);
    for (const [re, cat] of PROXY_CATEGORY) if (re.test(firstProxy)) return cat;
    if (/^tv|_tv/.test(f)) return 'Display';
    if (/receiver|amp|matrix|ams|dsp/.test(f)) return 'Audio';
    return 'Other';
  }

  function isHardware(item, drv, nb) {
    const file = item.file;
    if (nb) return true;
    if (VIRTUAL_FILES.test(file)) return false;
    if (!drv) return false;
    const control = (drv.control || '').toLowerCase();
    const cm = drv.controlMethod;
    if (SERVICE_CONTROL.has(control)) return false;
    if (cm === 'ir' || cm === 'serial' || cm === 'zigbee') return true;
    if (control === 'av_gen') return true;
    if (control.startsWith('control4_') || control.startsWith('light_ip')) return true;
    if (cm === 'ip' && control === 'lua_gen') return true; // IP driver awaiting address
    if (/\.c4i$/i.test(file) && drv.manufacturer && control !== 'lua_gen') return true; // e.g. serial disc changer
    return false;
  }

  function controlLabel(drv, nb, wiredBy) {
    if (nb && nb.addresstype === '3') return 'Zigbee';
    if (nb && (nb.addresstype === '1' || nb.addresstype === '2')) return 'IP';
    if (wiredBy.has('RS_232')) return 'Serial';
    if (wiredBy.has('IR_OUT')) return 'IR';
    const cm = drv && drv.controlMethod;
    if (cm === 'ip') return 'IP';
    if (cm === 'ir') return 'IR';
    if (cm === 'serial') return 'Serial';
    if (cm === 'zigbee') return 'Zigbee';
    const control = (drv && drv.control || '').toLowerCase();
    if (control === 'control4_lights_gen3' || control === 'control4_remote_gen') return 'Zigbee';
    if (control === 'av_gen') return 'IR';
    return '';
  }

  // ---------- main ----------
  async function parse(buffer, fileName) {
    const zip = await JSZipLib.loadAsync(buffer);
    const pxFile = zip.file('project.xml');
    if (!pxFile) throw new Error('This file has no project.xml inside. Make sure it is a Composer project backup (.c4p).');
    const pxText = await pxFile.async('string');
    const doc = new DOMParserLib().parseFromString(pxText, 'text/xml');
    const root = doc.documentElement;
    if (!root || root.nodeName !== 'currentstate') throw new Error('project.xml could not be read. The backup may be damaged.');

    let manifest = null;
    try { const mf = zip.file('meta/manifest.json'); if (mf) manifest = JSON.parse(await mf.async('string')).manifest; } catch (e) {}

    const sys = kid(kid(root, 'systemitems'), 'item');
    const projectData = kid(sys, 'itemdata');

    // Flatten tree
    const items = {};
    const order = [];
    function walk(el, parent, path) {
      const it = {
        id: txt(el, 'id'),
        name: txt(el, 'name'),
        type: txt(el, 'type'),
        file: txt(el, 'itemdata/config_data_file') || txt(el, 'c4i'),
        created: txt(el, 'created_datetime'),
        parent: parent ? parent.id : null,
        path: path.slice(),
        props: stateProps(txt(el, 'state')),
        children: []
      };
      items[it.id] = it; order.push(it.id);
      if (parent) parent.children.push(it.id);
      const nextPath = (it.type === TYPE.BUILDING || it.type === TYPE.FLOOR || it.type === TYPE.ROOM) ? path.concat([{ type: it.type, name: it.name, id: it.id }]) : path;
      for (const s of kids(kid(el, 'subitems'), 'item')) walk(s, it, nextPath);
    }
    walk(sys, null, []);

    // Network bindings
    const nbs = {};
    for (const n of all(kid(root, 'networkbindings'), 'networkbinding')) {
      const id = txt(n, 'deviceid');
      if (!nbs[id]) nbs[id] = { addresstype: txt(n, 'addresstype'), addr: txt(n, 'addr'), uuid: txt(n, 'uuid'), sddp: txt(n, 'ssdptype'), status: txt(n, 'status') };
    }

    // Load driver defs that the project actually uses
    const wanted = new Set();
    for (const id of order) if (items[id].file) wanted.add(items[id].file);
    const drivers = await loadDrivers(zip, wanted);

    // Owner: a proxy under a device belongs to that device
    function ownerOf(id) {
      const it = items[id];
      if (!it) return null;
      if (it.type === TYPE.PROXY && it.parent && items[it.parent] && items[it.parent].type === TYPE.DEVICE) return items[it.parent];
      return it;
    }

    // Connections
    const connections = [];
    const wiredClasses = {}; // ownerId -> Set(classes)
    function portName(itemId, bindingId) {
      const owner = ownerOf(itemId);
      const drv = owner && drivers[owner.file];
      const c = drv && drv.connections[bindingId];
      if (c && c.name) return c.name;
      const selfDrv = items[itemId] && drivers[items[itemId].file];
      const c2 = selfDrv && selfDrv.connections[bindingId];
      return c2 && c2.name ? c2.name : '';
    }
    for (const bb of kids(kid(root, 'bindings'), 'boundbinding')) {
      const pid = txt(bb, 'deviceid');
      const pbid = txt(bb, 'bindingid');
      for (const b of all(bb, 'bound')) {
        const cid = txt(b, 'deviceid');
        const classes = all(b, 'boundclass').map(x => (x.textContent || '').trim());
        let kind = null;
        if (classes.some(c => CONTROL_CLASSES.test(c))) kind = 'control';
        else if (classes.some(c => AV_CLASSES.test(c))) kind = 'av';
        if (!kind) continue;
        const pOwner = ownerOf(pid), cOwner = ownerOf(cid);
        if (!pOwner || !cOwner) continue;
        if (pOwner.type === TYPE.ROOM || cOwner.type === TYPE.ROOM) continue;
        const conn = {
          kind,
          classes,
          from: { id: pOwner.id, item: pid, port: portName(pid, pbid) || ('Output ' + pbid) },
          to: { id: cOwner.id, item: cid, port: txt(b, 'name') || portName(cid, txt(b, 'bindingid')) }
        };
        connections.push(conn);
        for (const side of [pOwner.id, cOwner.id]) {
          (wiredClasses[side] = wiredClasses[side] || new Set());
          classes.forEach(c => wiredClasses[side].add(c));
        }
        if (kind === 'control') (wiredClasses[cOwner.id + ':in'] = wiredClasses[cOwner.id + ':in'] || new Set()).add(classes[0]);
      }
    }

    // Rooms
    const rooms = [];
    for (const id of order) {
      const it = items[id];
      if (it.type !== TYPE.ROOM) continue;
      const floor = it.path.filter(p => p.type === TYPE.FLOOR).map(p => p.name).pop() || '';
      const building = it.path.filter(p => p.type === TYPE.BUILDING).map(p => p.name).pop() || '';
      rooms.push({ id, name: it.name, floor, building });
    }
    const roomOf = it => { const r = it.path.filter(p => p.type === TYPE.ROOM).pop(); return r ? r.id : ''; };

    // Devices + services
    const devices = [];
    const services = [];
    for (const id of order) {
      const it = items[id];
      const isTop = it.type === TYPE.DEVICE || (it.type === TYPE.PROXY && it.parent && items[it.parent] && items[it.parent].type === TYPE.ROOM);
      if (!isTop) continue;
      const drv = drivers[it.file] || null;
      const nb = nbs[id] || null;
      const proxies = it.children.map(c => items[c]).filter(c => c.type === TYPE.PROXY);
      // Merge props from proxies (some drivers keep properties on the proxy)
      const props = Object.assign({}, ...proxies.map(p => p.props), it.props);

      if (!isHardware(it, drv, nb)) {
        services.push({ id, name: it.name, room: roomOf(it), maker: drv ? drv.manufacturer : '', what: drv ? (drv.model || drv.name) : stem(it.file), file: it.file });
        continue;
      }

      const inClasses = wiredClasses[id + ':in'] || new Set();
      let ip = '', zigbee = '', mac = '', addrNote = '';
      if (nb) {
        if (nb.addresstype === '3') zigbee = nb.addr;
        else if (nb.addr === '127.0.0.1') addrNote = 'Primary controller';
        else ip = nb.addr;
        const macMatch = /([0-9a-f]{12})$/i.exec(nb.uuid || '');
        // Control4 hardware SDDP ids end in the MAC, e.g. c4:control4_ea3-ea3-000FFF95094B
        if (macMatch && nb.addresstype !== '3' && /^c4:/i.test(nb.uuid || '')) mac = fmtMac(macMatch[1]);
      }
      if (!ip) {
        for (const [k, v] of Object.entries(props)) if (/\bip\b|ip address|ip addr/i.test(k) && IP_RE.test(v)) { ip = v; break; }
      }
      if (!mac) mac = fmtMac(pickProp(props, ['MAC Address', 'Ether MAC Address', 'Ethernet MAC Address', 'MAC', 'WiFi MAC Address']));

      const control = controlLabel(drv, nb, inClasses);
      const flags = [];
      const status = (nb && nb.status) || props['Device Status'] || props['Status'] || '';
      if (/offline|disconnected|not connected/i.test(status)) flags.push({ level: 'bad', text: 'Reported offline in backup' });
      if (control === 'IR' && !inClasses.has('IR_OUT')) flags.push({ level: 'warn', text: 'IR driver with no IR port bound' });
      if (control === 'Serial' && !inClasses.has('RS_232') && !nb) flags.push({ level: 'warn', text: 'Serial driver with no serial port bound' });
      if (drv && drv.controlMethod === 'ip' && !ip && !nb && !addrNote) flags.push({ level: 'warn', text: 'IP driver with no address set' });
      if (!drv) flags.push({ level: 'info', text: 'Driver file not in backup' });

      const cleanName = it.name.replace(/\s+/g, ' ').trim();
      // Prefer the device's main proxy over helper proxies (media services, app switchers, UI)
      const ranked = proxies.slice().sort((x, y) => (/media_service|avswitch|uidevice|tuner/.test(x.file) ? 1 : 0) - (/media_service|avswitch|uidevice|tuner/.test(y.file) ? 1 : 0));
      const proxyNames = ranked.map(p => p.name.replace(/\s+/g, ' ').trim()).filter(n => n && n !== cleanName);
      // Generic hardware names ("Adaptive Phase Dimmer") read better as the load or zone name
      const generic = drv && (cleanName === drv.name || cleanName.startsWith(drv.manufacturer + ' ') || /^(adaptive phase dimmer|switch|keypad dimmer|keypad|dimmer|configurable keypad)$/i.test(cleanName));
      const label = generic && proxyNames.length && !/uidevice|^ea-?\d|^core/i.test(proxyNames[0]) ? proxyNames[0] : cleanName;
      devices.push({
        id,
        name: label,
        hardwareName: label !== cleanName ? cleanName : '',
        room: roomOf(it),
        category: categorize(drv, it.file),
        maker: drv ? drv.manufacturer : '',
        model: drv ? ((m => m.toLowerCase() === (drv.manufacturer || '').toLowerCase() ? '' : m)((drv.model || '').replace(/\s*\[[^\]]*\]/g, '').trim())) : '',
        modelRaw: drv ? drv.model : '',
        driverFile: it.file,
        driverVersion: props['Driver Version'] || (drv && drv.version) || '',
        firmware: pickProp(props, ['Firmware Version', 'OS Version', 'Software Version', 'Product Version', 'Version']),
        serial: pickProp(props, ['Serial Number', 'Serial']),
        control,
        ip, zigbee, mac, addrNote,
        status,
        added: it.created ? it.created.slice(0, 10) : '',
        proxies: proxyNames.filter(n => n !== label),
        flags
      });
    }

    // Duplicate IPs
    const ipCount = {};
    devices.forEach(d => { if (d.ip) ipCount[d.ip] = (ipCount[d.ip] || 0) + 1; });
    devices.forEach(d => { if (d.ip && ipCount[d.ip] > 1) d.flags.unshift({ level: 'bad', text: 'IP ' + d.ip + ' is used by more than one device' }); });

    const ver = sys.getAttribute ? sys : null;
    const osVersion = manifest && manifest['director-version'] ? manifest['director-version'].replace(/-res$/, '') :
      [sys.getAttribute('majorversion'), sys.getAttribute('minorversion'), sys.getAttribute('buildnumber')].filter(Boolean).join('.');

    const devById = Object.fromEntries(devices.map(d => [d.id, d]));
    const nameOf = id => (devById[id] ? devById[id].name : (items[id] ? items[id].name.replace(/\s+/g, ' ') : id));

    // Stitch through virtual devices (AV Path Setters etc.) so wiring reads source -> real input
    let links = connections.filter(c => c.from.id !== c.to.id);
    for (let pass = 0; pass < 3; pass++) {
      const next = [];
      let changed = false;
      for (const c of links) {
        if (devById[c.to.id]) { next.push(c); continue; }
        const outs = links.filter(o => o.from.id === c.to.id && o.kind === c.kind);
        if (!outs.length) continue;
        changed = true;
        for (const o of outs) next.push({ kind: c.kind, classes: o.classes, from: c.from, to: o.to, via: (c.via ? c.via + ', ' : '') + nameOf(c.to.id) });
      }
      links = next;
      if (!changed) break;
    }
    const seen = new Set();
    const wiring = [];
    for (const c of links) {
      if (!devById[c.from.id] || !devById[c.to.id] || c.from.id === c.to.id) continue;
      const key = [c.kind, c.from.id, c.from.port, c.to.id, c.to.port].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      wiring.push({ kind: c.kind, classes: c.classes, via: c.via || '',
        from: { id: c.from.id, name: nameOf(c.from.id), port: c.from.port },
        to: { id: c.to.id, name: nameOf(c.to.id), port: c.to.port } });
    }

    return {
      fileName: fileName || '',
      project: {
        name: sys ? txt(sys, 'name') : '',
        city: txt(projectData, 'city_name'),
        timezone: txt(projectData, 'timezone'),
        projectVersion: txt(projectData, 'project_version'),
        osVersion,
        uuid: txt(projectData, 'uuid')
      },
      rooms,
      devices,
      services,
      connections: wiring,
      stats: {
        items: order.length,
        drivers: Object.keys(drivers).length,
        missingDrivers: Object.entries(drivers).filter(([, v]) => !v).map(([k]) => k)
      }
    };
  }

  return { parse };
}

if (typeof module !== 'undefined') module.exports = { createC4PParser };
