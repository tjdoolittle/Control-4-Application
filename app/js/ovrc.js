/* OvrC device list import.
   Matches each OvrC row to at most one Composer device (MAC first, then a unique IP), never the reverse
   twice, so nothing is listed twice. Rows that could belong to more than one device wait for a decision.
   Works in the browser (window.C4Ovrc) and in Node (module.exports). */
(function (root) {
  'use strict';

  // ---------- CSV ----------
  function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    text = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(c => c.trim() !== '')) rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell);
    if (row.some(c => c.trim() !== '')) rows.push(row);
    return rows;
  }

  function normMac(m) {
    const h = String(m || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
    return h.length === 12 ? h.match(/../g).join(':') : '';
  }

  // Reads an OvrC "Device Management List" export. Column names are matched loosely in case OvrC renames them.
  function readOvrcCsv(text, fileName) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error('That CSV has no device rows.');
    const head = rows[0].map(h => h.trim().toLowerCase());
    const col = (...names) => { for (const n of names) { const i = head.findIndex(h => h === n); if (i >= 0) return i; } for (const n of names) { const i = head.findIndex(h => h.includes(n)); if (i >= 0) return i; } return -1; };
    const c = {
      status: col('status'), name: col('device name', 'name'), room: col('room', 'location'),
      ip: col('ip address', 'ip'), mac: col('mac address', 'mac'), maker: col('manufacturer', 'vendor', 'make'),
      message: col('status message', 'message'), update: col('update'), model: col('model'), firmware: col('firmware', 'version'), serial: col('serial')
    };
    // "status" also matches "status message"; keep the exact column
    c.status = head.indexOf('status') >= 0 ? head.indexOf('status') : c.status;
    if (c.mac < 0 && c.ip < 0) throw new Error('This CSV has no MAC or IP column, so it does not look like an OvrC device list. In OvrC, open the site\'s Devices page and export the list as CSV.');
    const get = (r, i) => (i >= 0 && r[i] != null ? String(r[i]).trim() : '');
    const out = [];
    const seenMac = new Set();
    for (const r of rows.slice(1)) {
      const mac = normMac(get(r, c.mac));
      const ip = get(r, c.ip);
      if (!mac && !ip) continue;
      if (mac && seenMac.has(mac)) continue;      // the same device listed twice in the export
      if (mac) seenMac.add(mac);
      out.push({
        key: mac || ('ip:' + ip + ':' + out.length),
        status: get(r, c.status), name: get(r, c.name), room: get(r, c.room), ip, mac,
        maker: get(r, c.maker), message: get(r, c.message), update: get(r, c.update),
        model: get(r, c.model), firmware: get(r, c.firmware), serial: get(r, c.serial)
      });
    }
    if (!out.length) throw new Error('No devices with a MAC or IP address were found in that CSV.');
    return { fileName: fileName || 'OvrC export.csv', importedAt: new Date().toISOString(), rows: out, links: {} };
  }

  // ---------- classification of devices only OvrC knows about ----------
  // A locally administered MAC (second hex digit 2, 6, A or E) is a phone, tablet or laptop using a private Wi-Fi address
  const privateMac = mac => /^.[26AE]/i.test(mac || '');
  const RULES = [
    ['Network', /ubiquiti|araknis|luxul|netgear|cisco|tp-?link|eero|aruba|ruckus|meraki|pakedge|access networks|mikrotik/i, /router|switch|access point|\bap\b|gateway|dream-?machine|udm|usw|uap/i],
    ['Control4', /control4|snap ?one|episode|triad|binary|pakedge/i, /\bcore\d?\b|\bea-?\d\b|halo/i],
    ['Power', /wattbox|panamax|apc|furman|cyberpower/i, /wattbox|ups|pdu/i],
    ['AV', /roku|sonos|samsung|lg electronics|sony|d&m|denon|marantz|nuvyyo|kaleidescape|apple tv|vizio|hisense|tcl|bose|yamaha|onkyo|sonance|nvidia|amazon/i, /roku|sonos|tv|apple-?tv|shield|fire|marantz|denon/i],
    ['Smart home', /ring|qolsys|espressif|ting|whisker|lennox|ecobee|nest|google|ge appliances|midea|dyson|roborock|select comfort|nanit|hui zhou|ampak|murata|microchip|texas instruments|lutron|chamberlain|myq|august|yale|rachio|philips|signify|wyze|eufy|arlo|honeywell|resideo/i, /thermostat|camera|doorbell|lock|sensor|vacuum|bed/i],
    ['Printer', /hewlett|hp inc|brother|canon|epson|xerox/i, /printer|^hp/i]
  ];
  const PERSONAL_NAME = /iphone|ipad|macbook|imac|android|galaxy|pixel|laptop|desktop-|surface|watch|airpods|phone/i;

  function classify(row) {
    const maker = row.maker || '', name = row.name || '';
    if (PERSONAL_NAME.test(name) && !/tv|roku|sonos/i.test(name)) return 'Personal';
    for (const [cat, makerRe, nameRe] of RULES) if (makerRe.test(maker) && !/unknown/i.test(maker)) return cat;
    for (const [cat, , nameRe] of RULES) if (nameRe.test(name)) return cat;
    if (privateMac(row.mac)) return 'Personal';
    if (/apple|microsoft|intel|liteon|azurewave|unknown/i.test(maker) || !maker) return 'Personal';
    return 'Other';
  }

  function displayName(row) {
    const n = (row.name || '').trim();
    const junk = !n || /^unspecified$/i.test(n) || /[^\x20-\x7e]/.test(n) || /\.{2,}.*\.{2,}/.test(n);
    if (!junk) return n;
    const maker = (row.maker || '').replace(/,?\s*(inc|ltd|llc|co|corp|corporation|technology|technologies)\.?/gi, '').replace(/\s+/g, ' ').trim();
    return (maker && !/unknown/i.test(maker) ? maker : 'Unknown') + ' device';
  }

  const isOffline = row => /critical|offline|down/i.test(row.status || '') || /disconnected/i.test(row.message || '');

  // ---------- matching ----------
  function match(project, data) {
    const devices = project.devices;
    const links = (data && data.links) || {};
    const rows = (data && data.rows) || [];
    const byMac = {}, byIp = {};
    devices.forEach(d => {
      const m = normMac(d.mac);
      if (m) byMac[m] = d;
      if (d.ip) (byIp[d.ip] = byIp[d.ip] || []).push(d);
    });
    const rowsByIp = {};
    rows.forEach(r => { if (r.ip) (rowsByIp[r.ip] = rowsByIp[r.ip] || []).push(r); });

    const matched = {};        // deviceId -> { row, by }
    const usedRows = new Set();
    const decisions = [];      // rows that could be more than one device
    const extras = [];         // rows that are not in Composer

    const take = (d, r, by) => { matched[d.id] = { row: r, by }; usedRows.add(r.key); };

    // 1. Choices the person already made
    rows.forEach(r => {
      const l = links[r.key];
      if (!l || l === 'separate') return;
      const d = devices.find(x => x.id === l);
      if (d && !matched[d.id]) take(d, r, 'you');
    });
    // 2. Same MAC address
    rows.forEach(r => {
      if (usedRows.has(r.key) || links[r.key] === 'separate' || !r.mac) return;
      const d = byMac[r.mac];
      if (d && !matched[d.id]) take(d, r, 'mac');
    });
    // 3. Same IP address, only when it is one device and one row on both sides and the MACs don't disagree.
    //    Rows already placed by MAC or by a choice don't count; rows still unplaced at that IP all do.
    const placed = new Set(usedRows);
    rows.forEach(r => {
      if (usedRows.has(r.key) || links[r.key] === 'separate' || !r.ip) return;
      const cands = (byIp[r.ip] || []).filter(d => !matched[d.id]);
      const sameIpRows = (rowsByIp[r.ip] || []).filter(x => !placed.has(x.key) && links[x.key] !== 'separate');
      if (!cands.length) return;
      const macClash = d => normMac(d.mac) && r.mac && normMac(d.mac) !== r.mac;
      if (cands.length === 1 && sameIpRows.length === 1 && !macClash(cands[0])) { take(cands[0], r, 'ip'); return; }
      const options = cands.filter(d => !macClash(d));
      if (options.length) {
        decisions.push({ row: r, options: options.map(d => d.id), reason: cands.length > 1 ? `${cands.length} Composer devices use ${r.ip}` : `${sameIpRows.length} OvrC devices use ${r.ip}` });
        usedRows.add(r.key);
      }
    });
    // 4. Everything left is a device Composer doesn't know about
    rows.forEach(r => { if (!usedRows.has(r.key)) extras.push({ row: r, category: classify(r) }); });

    return { matched, decisions, extras };
  }

  // A copy of the project with OvrC merged in: matched devices gain status, IP and MAC; OvrC-only devices are
  // added under a "Network (OvrC)" room. Phones and personal devices are left out unless asked for.
  function apply(project, opts) {
    const data = project.ovrc;
    if (!data || !data.rows || !data.rows.length) return project;
    opts = opts || {};
    const m = match(project, data);
    const devices = project.devices.map(d => {
      const hit = m.matched[d.id];
      if (!hit) return d;
      const r = hit.row;
      const nd = Object.assign({}, d, { flags: d.flags.slice(), source: 'Composer + OvrC', ovrc: { status: r.status, message: r.message, name: r.name, ip: r.ip, mac: r.mac, by: hit.by, update: r.update } });
      if (!nd.mac && r.mac) nd.mac = r.mac;
      if (!nd.ip && r.ip && !nd.addrNote) { nd.ip = r.ip; nd.flags = nd.flags.filter(f => !/no address set/.test(f.text)); }
      else if (nd.ip && r.ip && nd.ip !== r.ip) nd.flags.push({ level: 'warn', text: `Composer has ${nd.ip}, OvrC sees it at ${r.ip}` });
      if (!nd.firmware && r.firmware) nd.firmware = r.firmware;
      if (!nd.serial && r.serial) nd.serial = r.serial;
      if (r.status) nd.status = isOffline(r) ? 'offline (OvrC)' : 'online (OvrC)';
      if (isOffline(r)) nd.flags.unshift({ level: 'bad', text: 'Offline in OvrC' + (r.message ? ': ' + r.message : '') });
      if (/true/i.test(r.update)) nd.flags.push({ level: 'info', text: 'OvrC has an update available' });
      return nd;
    });
    const room = { id: 'ovrc', name: 'Network (from OvrC)', floor: 'Not in Control4' };
    const shown = m.extras.filter(x => opts.showPersonal || x.category !== 'Personal');
    shown.forEach(x => {
      const r = x.row;
      const flags = [];
      if (isOffline(r)) flags.push({ level: x.category === 'Personal' ? 'info' : 'bad', text: 'Offline in OvrC' + (r.message ? ': ' + r.message : '') });
      devices.push({
        id: 'ovrc:' + r.key, name: displayName(r), hardwareName: r.name && displayName(r) !== r.name ? '' : '', room: 'ovrc',
        category: x.category, maker: (r.maker && !/unknown/i.test(r.maker)) ? r.maker : '', model: r.model || '', modelRaw: r.model || '',
        driverFile: '', driverVersion: '', firmware: r.firmware || '', serial: r.serial || '', control: 'IP',
        ip: r.ip, zigbee: '', mac: r.mac, addrNote: '', status: r.status ? (isOffline(r) ? 'offline (OvrC)' : 'online (OvrC)') : '',
        added: '', proxies: [], flags, source: 'OvrC', ovrcOnly: true
      });
    });
    // Duplicate IPs across the merged list
    const count = {};
    devices.forEach(d => { if (d.ip) count[d.ip] = (count[d.ip] || 0) + 1; });
    devices.forEach(d => {
      if (d.ovrcOnly && d.ip && count[d.ip] > 1) d.flags = d.flags.concat({ level: 'warn', text: `${d.ip} is also used by another device` });
    });
    const out = Object.assign({}, project, { devices, rooms: project.rooms.concat(shown.length ? [room] : []) });
    out.ovrcSummary = {
      fileName: data.fileName, importedAt: data.importedAt, rows: data.rows.length,
      matched: Object.keys(m.matched).length, decisions: m.decisions, extras: m.extras,
      added: shown.length, personalHidden: opts.showPersonal ? 0 : m.extras.filter(x => x.category === 'Personal').length,
      byHow: Object.values(m.matched).reduce((a, x) => { a[x.by] = (a[x.by] || 0) + 1; return a; }, {})
    };
    return out;
  }

  const api = { parseCsv, readOvrcCsv, match, apply, classify, displayName, normMac };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.C4Ovrc = api;
})(typeof window !== 'undefined' ? window : this);
