(function () {
  'use strict';

  const STORE_KEY = 'c4sitesheet.projects.v1';
  const parser = createC4PParser(window.JSZip, window.DOMParser);

  const state = {
    projects: [],      // parsed results; sample has .sample = true
    activeKey: null,
    tab: 'devices',
    search: '',
    category: 'All',
    control: 'All'
  };

  const $ = sel => document.querySelector(sel);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const keyOf = p => p.sample ? 'sample' : (p.project.uuid || '') + '|' + p.fileName;

  // ---------- persistence (this browser only) ----------
  function save() {
    try {
      const real = state.projects.filter(p => !p.sample);
      localStorage.setItem(STORE_KEY, JSON.stringify(real));
    } catch (e) { /* storage full or blocked: keep working in memory */ }
  }
  function restore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw) || [];
    } catch (e) {}
    return [];
  }

  // ---------- helpers ----------
  function roomMap(p) { return Object.fromEntries(p.rooms.map(r => [r.id, r])); }
  function ipSortKey(ip) { const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip || ''); return m ? m.slice(1).map(n => n.padStart(3, '0')).join('.') : 'zzz'; }
  function addressOf(d) { return d.ip || (d.zigbee ? d.zigbee : '') || d.addrNote || ''; }
  function flagCount(p, level) { return p.devices.reduce((n, d) => n + d.flags.filter(f => !level || f.level === level).length, 0); }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2200);
  }
  function active() { return state.projects.find(p => keyOf(p) === state.activeKey) || null; }

  // ---------- loading files ----------
  async function loadFiles(files) {
    const list = Array.from(files).filter(f => /\.c4p$/i.test(f.name) || f.type === 'application/zip');
    if (!list.length) { showError('Those files are not .c4p backups. Export one from Composer Pro with File → Backup Project.'); return; }
    hideError();
    const loading = $('#loading');
    loading.hidden = false;
    let lastKey = null;
    const failures = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      $('#loading-text').textContent = `Reading ${f.name}${list.length > 1 ? ` (${i + 1} of ${list.length})` : ''}…`;
      try {
        const result = await parser.parse(await f.arrayBuffer(), f.name);
        result.loadedAt = new Date().toISOString();
        const k = keyOf(result);
        state.projects = state.projects.filter(p => keyOf(p) !== k && !p.sample);
        state.projects.push(result);
        lastKey = k;
      } catch (e) {
        failures.push(`${f.name}: ${e.message || 'could not be read'}`);
      }
    }
    loading.hidden = true;
    if (failures.length) showError(failures.join(' '));
    if (lastKey) {
      state.projects.sort((a, b) => a.project.name.localeCompare(b.project.name));
      state.activeKey = lastKey;
      state.search = ''; state.category = 'All'; state.control = 'All';
      save();
      render();
      toast(list.length - failures.length === 1 ? 'Backup read' : `${list.length - failures.length} backups read`);
    }
  }
  function showError(msg) { const e = $('#error'); e.textContent = msg; e.hidden = false; }
  function hideError() { $('#error').hidden = true; }

  // ---------- exports ----------
  function csvCell(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function devicesCsv(p) {
    const rooms = roomMap(p);
    const head = ['Project', 'Floor', 'Room', 'Device', 'Hardware name', 'Category', 'Manufacturer', 'Model', 'Control', 'IP address', 'Zigbee ID', 'MAC', 'Firmware', 'Driver version', 'Driver file', 'Status', 'Added', 'Notes'];
    const rows = p.devices.map(d => {
      const r = rooms[d.room] || {};
      return [p.project.name, r.floor || '', r.name || '', d.name, d.hardwareName || '', d.category, d.maker, d.model, d.control, d.ip, d.zigbee, d.mac, d.firmware, d.driverVersion, d.driverFile, d.status, d.added, d.flags.map(f => f.text).join('; ')];
    });
    return [head].concat(rows).map(r => r.map(csvCell).join(',')).join('\r\n');
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); toast(done); }
    catch (e) { toast('Copy was blocked by the browser. Use Download instead.'); }
  }
  function safeName(p) { return (p.project.name || 'project').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_'); }

  // ---------- render ----------
  function render() {
    renderSidebar();
    renderProject();
  }

  function renderSidebar() {
    const list = $('#project-list');
    const real = state.projects.filter(p => !p.sample);
    $('#project-count').textContent = real.length;
    list.innerHTML = state.projects.map(p => {
      const k = keyOf(p);
      const bad = flagCount(p, 'bad');
      return `<li class="project-item${k === state.activeKey ? ' active' : ''}">
        <span class="led" aria-hidden="true"></span>
        <button class="open" data-key="${esc(k)}" aria-current="${k === state.activeKey}">
          <span class="pname">${esc(p.project.name || p.fileName)}${p.sample ? ' (example)' : ''}</span>
          <span class="pmeta">${p.devices.length} devices · OS ${esc((p.project.osVersion || '').split('.').slice(0, 3).join('.'))}${bad ? ` · <span class="pflag">${bad} issue${bad > 1 ? 's' : ''}</span>` : ''}</span>
        </button>
        ${p.sample ? '' : `<button class="remove" data-remove="${esc(k)}" aria-label="Remove ${esc(p.project.name)} from this list" title="Remove from list">×</button>`}
      </li>`;
    }).join('');
  }

  function renderProject() {
    const view = $('#project-view');
    const p = active();
    if (!p) { view.innerHTML = ''; return; }
    const rooms = roomMap(p);
    const ipCount = p.devices.filter(d => d.ip || d.addrNote === 'Primary controller').length;
    const zbCount = p.devices.filter(d => d.zigbee).length;
    const wiredCount = p.devices.filter(d => d.control === 'IR' || d.control === 'Serial').length;
    const issues = flagCount(p, 'bad') + flagCount(p, 'warn');
    const usedRooms = new Set(p.devices.map(d => d.room)).size;

    const tabs = [
      ['devices', 'Devices', p.devices.length],
      ['network', 'Network', ipCount + zbCount],
      ['wiring', 'Wiring', p.connections.length],
      ['attention', 'Attention', issues],
      ['services', 'Services & drivers', p.services.length]
    ];

    view.innerHTML = `
      ${p.sample ? `<div class="sample-note"><span><strong>Example project.</strong> Every name and address here is made up. Open your own .c4p files to see real data.</span><label class="btn btn-small" for="file-input">Open .c4p files</label></div>` : ''}
      <div class="project-head">
        <div>
          <span class="eyebrow">Project</span>
          <h1>${esc(p.project.name || p.fileName)}</h1>
          <div class="project-facts">
            ${p.project.city ? `<span><b>Location</b>${esc(p.project.city)}</span>` : ''}
            <span><b>OS</b>${esc(p.project.osVersion || 'unknown')}</span>
            <span><b>Project rev</b>${esc(p.project.projectVersion || '?')}</span>
            <span><b>File</b><span class="mono">${esc(p.fileName)}</span></span>
          </div>
        </div>
        <div class="export-row">
          <button class="btn btn-small" data-action="csv">Download CSV</button>
          <button class="btn btn-small" data-action="copy-csv">Copy CSV</button>
          <button class="btn btn-small" data-action="json">Download JSON</button>
        </div>
      </div>

      <div class="stats" role="list">
        <div class="stat" role="listitem"><div class="v">${p.devices.length}</div><div class="l">Devices</div></div>
        <div class="stat" role="listitem"><div class="v">${usedRooms}<span class="muted" style="font-size:15px"> / ${p.rooms.length}</span></div><div class="l">Rooms with gear</div></div>
        <div class="stat" role="listitem"><div class="v">${ipCount}</div><div class="l">On the network</div></div>
        <div class="stat" role="listitem"><div class="v">${zbCount}</div><div class="l">Zigbee</div></div>
        <div class="stat" role="listitem"><div class="v">${wiredCount}</div><div class="l">IR or serial</div></div>
        <div class="stat${issues ? ' alert' : ''}" role="listitem"><div class="v">${issues}</div><div class="l">Need attention</div></div>
      </div>

      <div class="tabs" role="tablist">
        ${tabs.map(([id, label, n]) => `<button class="tab" role="tab" id="tab-${id}" data-tab="${id}" aria-selected="${state.tab === id}" aria-controls="panel">${label}<span class="n">${n}</span></button>`).join('')}
      </div>
      <div id="panel" role="tabpanel" aria-labelledby="tab-${state.tab}"></div>
    `;
    renderPanel(p, rooms);
  }

  function renderPanel(p, rooms) {
    const panel = $('#panel');
    if (!panel) return;
    if (state.tab === 'devices') panel.innerHTML = devicesPanel(p, rooms);
    else if (state.tab === 'network') panel.innerHTML = networkPanel(p, rooms);
    else if (state.tab === 'wiring') panel.innerHTML = wiringPanel(p, rooms);
    else if (state.tab === 'attention') panel.innerHTML = attentionPanel(p, rooms);
    else panel.innerHTML = servicesPanel(p, rooms);
    panel.style.display = 'flex'; panel.style.flexDirection = 'column'; panel.style.gap = '12px';
  }

  function controlPill(c) { return c ? `<span class="pill ${esc(c)}">${esc(c)}</span>` : '<span class="pill none">None</span>'; }

  function filteredDevices(p, rooms) {
    const q = state.search.trim().toLowerCase();
    return p.devices.filter(d => {
      if (state.category !== 'All' && d.category !== state.category) return false;
      if (state.control !== 'All' && (d.control || 'None') !== state.control) return false;
      if (!q) return true;
      const r = rooms[d.room] || {};
      return [d.name, d.hardwareName, d.maker, d.model, d.ip, d.zigbee, d.mac, r.name, r.floor, d.driverFile, d.proxies.join(' ')].join(' ').toLowerCase().includes(q);
    });
  }

  function devicesPanel(p, rooms) {
    const cats = ['All'].concat(Array.from(new Set(p.devices.map(d => d.category))).sort());
    const ctrls = ['All'].concat(['IP', 'Zigbee', 'IR', 'Serial', 'None'].filter(c => p.devices.some(d => (d.control || 'None') === c)));
    const list = filteredDevices(p, rooms);
    // Group by room, in project order
    const order = p.rooms.map(r => r.id).concat(['']);
    const groups = order.map(id => ({ room: rooms[id], items: list.filter(d => d.room === id) })).filter(g => g.items.length);

    const rowsHtml = groups.map(g => `
      <tr class="room-row"><td colspan="6">${esc(g.room ? g.room.name : 'No room')}${g.room && g.room.floor ? `<span class="floor">${esc(g.room.floor)}</span>` : ''}</td></tr>
      ${g.items.map(d => `<tr>
        <td><div class="dname">${esc(d.name)}</div>${d.hardwareName ? `<div class="dsub">${esc(d.hardwareName)}</div>` : ''}${d.proxies.length ? `<div class="dsub">Also: ${esc(d.proxies.join(', '))}</div>` : ''}
          ${d.flags.map(f => `<div class="flag-inline ${f.level}"><span class="flag-dot ${f.level}"></span>${esc(f.text)}</div>`).join('')}</td>
        <td>${esc(d.maker)}<div class="dsub">${esc(d.model)}</div></td>
        <td>${controlPill(d.control)}</td>
        <td class="mono nowrap">${d.ip ? esc(d.ip) : d.zigbee ? esc(d.zigbee) : d.addrNote ? `<span class="muted">${esc(d.addrNote)}</span>` : '<span class="empty-cell">—</span>'}</td>
        <td class="mono nowrap">${d.mac ? esc(d.mac) : '<span class="empty-cell">—</span>'}</td>
        <td class="nowrap">${d.firmware ? `FW ${esc(d.firmware)}<br>` : ''}<span class="dsub">Driver ${esc(d.driverVersion || '?')}</span></td>
      </tr>`).join('')}
    `).join('');

    return `
      <div class="toolbar">
        <input class="search" id="search" type="search" placeholder="Search name, model, IP, MAC, room…" value="${esc(state.search)}" aria-label="Search devices">
      </div>
      <div class="toolbar">
        <div class="chips" role="group" aria-label="Filter by category">${cats.map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${state.category === c}">${esc(c)}</button>`).join('')}</div>
      </div>
      <div class="toolbar">
        <div class="chips" role="group" aria-label="Filter by control method">${ctrls.map(c => `<button class="chip" data-ctrl="${esc(c)}" aria-pressed="${state.control === c}">${c === 'All' ? 'Any control' : esc(c)}</button>`).join('')}</div>
      </div>
      <div class="sheet">
        <table>
          <thead><tr><th>Device</th><th>Make / model</th><th>Control</th><th>Address</th><th>MAC</th><th>Version</th></tr></thead>
          <tbody>${rowsHtml || '<tr><td colspan="6" class="empty-cell">No devices match. Clear the search or pick a different filter.</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  function networkPanel(p, rooms) {
    const ipRows = p.devices.filter(d => d.ip || d.addrNote === 'Primary controller').sort((a, b) => ipSortKey(a.ip) < ipSortKey(b.ip) ? -1 : 1);
    const zb = p.devices.filter(d => d.zigbee).sort((a, b) => ((rooms[a.room] || {}).name || '').localeCompare((rooms[b.room] || {}).name || ''));
    const dup = new Set(); const seen = new Set();
    ipRows.forEach(d => { if (d.ip) { if (seen.has(d.ip)) dup.add(d.ip); seen.add(d.ip); } });
    const noAddr = p.devices.filter(d => d.control === 'IP' && !d.ip && !d.addrNote);
    const room = d => esc((rooms[d.room] || {}).name || '');
    return `
      <h2 class="section">IP devices</h2>
      <p class="section-note">Addresses as Composer last saw them. Discovered (SDDP) devices can change address if DHCP reservations are missing.</p>
      <div class="sheet"><table>
        <thead><tr><th>IP address</th><th>Device</th><th>Room</th><th>MAC</th><th>Model</th><th>Status</th></tr></thead>
        <tbody>${ipRows.map(d => `<tr>
          <td class="mono nowrap">${d.ip ? esc(d.ip) : `<span class="muted">${esc(d.addrNote)}</span>`}${dup.has(d.ip) ? `<div class="flag-inline bad"><span class="flag-dot bad"></span>Duplicate</div>` : ''}</td>
          <td class="dname">${esc(d.name)}</td><td>${room(d)}</td>
          <td class="mono nowrap">${esc(d.mac) || '<span class="empty-cell">—</span>'}</td>
          <td>${esc(d.maker)} ${esc(d.model)}</td>
          <td>${esc(d.status) || '<span class="empty-cell">—</span>'}</td></tr>`).join('') || '<tr><td colspan="6" class="empty-cell">No IP devices in this project.</td></tr>'}
          ${noAddr.map(d => `<tr><td class="mono"><span class="flag-inline warn"><span class="flag-dot warn"></span>Not set</span></td><td class="dname">${esc(d.name)}</td><td>${room(d)}</td><td class="empty-cell">—</td><td>${esc(d.maker)} ${esc(d.model)}</td><td class="empty-cell">—</td></tr>`).join('')}
        </tbody></table></div>
      ${zb.length ? `
      <h2 class="section">Zigbee devices</h2>
      <div class="sheet"><table>
        <thead><tr><th>Zigbee ID</th><th>Device</th><th>Room</th><th>Model</th><th>Firmware</th></tr></thead>
        <tbody>${zb.map(d => `<tr><td class="mono nowrap">${esc(d.zigbee)}</td><td class="dname">${esc(d.name)}${d.hardwareName ? `<div class="dsub">${esc(d.hardwareName)}</div>` : ''}</td><td>${room(d)}</td><td>${esc(d.model)}</td><td>${esc(d.firmware) || '<span class="empty-cell">—</span>'}</td></tr>`).join('')}</tbody>
      </table></div>` : ''}`;
  }

  function kindLabel(c) {
    const cl = c.classes || [];
    if (cl.includes('IR_OUT')) return ['IR_OUT', 'IR'];
    if (cl.includes('RS_232')) return ['RS_232', 'Serial'];
    if (cl.includes('HDMI')) return ['HDMI', 'HDMI'];
    if (cl.some(x => /DIGITAL_OPTICAL/.test(x)) && cl.length === 1) return ['', 'Optical'];
    if (cl.some(x => /STEREO|SPEAKER|DIGITAL/.test(x))) return ['', 'Audio'];
    if (cl.some(x => /COMPONENT|COMPOSITE/.test(x))) return ['', 'Video'];
    if (cl.some(x => /CONTACT/.test(x))) return ['', 'Contact'];
    if (cl.some(x => /RELAY/.test(x))) return ['', 'Relay'];
    return ['', cl[0] || ''];
  }

  function wiringPanel(p, rooms) {
    if (!p.connections.length) return `<p class="section-note">No physical connections are bound in this project. Lighting-only and IP-only systems often have none.</p>`;
    const byId = Object.fromEntries(p.devices.map(d => [d.id, d]));
    function groups(kind) {
      const conns = p.connections.filter(c => c.kind === kind);
      const ids = Array.from(new Set(conns.map(c => c.from.id)));
      return ids.map(id => {
        const d = byId[id] || { name: id };
        const items = conns.filter(c => c.from.id === id).sort((a, b) => a.from.port.localeCompare(b.from.port, undefined, { numeric: true }));
        return `<div class="wire-card">
          <h3>${esc(d.name)}</h3>
          <div class="wsub">${esc([d.maker, d.model].filter(Boolean).join(' '))}${rooms[d.room] ? ' · ' + esc(rooms[d.room].name) : ''}</div>
          ${items.map(c => { const [cls, lbl] = kindLabel(c); return `<div class="wire">
            <span class="port">${esc(c.from.port)}</span><span class="arrow" aria-hidden="true">→</span>
            <span class="dest">${esc(c.to.name)} <span class="dport">· ${esc(c.to.port)}</span>${c.via ? `<div class="via">via ${esc(c.via)}</div>` : ''}</span>
            <span class="wire-kind ${cls}">${esc(lbl)}</span></div>`; }).join('')}
        </div>`;
      }).join('');
    }
    const ctl = p.connections.some(c => c.kind === 'control');
    const av = p.connections.some(c => c.kind === 'av');
    return `
      ${ctl ? `<h2 class="section">Control wiring</h2><p class="section-note">IR emitters and serial runs, grouped by the port that drives them.</p><div class="wire-groups">${groups('control')}</div>` : ''}
      ${av ? `<h2 class="section">AV connections</h2><p class="section-note">Source outputs to the inputs they feed. Virtual path setters are skipped so each line shows the real input.</p><div class="wire-groups">${groups('av')}</div>` : ''}`;
  }

  function attentionPanel(p, rooms) {
    const rank = { bad: 0, warn: 1, info: 2 };
    const items = [];
    p.devices.forEach(d => d.flags.forEach(f => items.push({ d, f })));
    items.sort((a, b) => rank[a.f.level] - rank[b.f.level]);
    if (!items.length) return `<div class="all-clear">Nothing flagged. Every device has an address or a bound port, and none were offline when this backup was taken.</div>`;
    return `<p class="section-note">Problems the backup can show on its own: offline devices, duplicate IPs, and drivers that were never bound or addressed.</p>
      <div class="attention">${items.map(({ d, f }) => `<div class="att"><span class="stripe ${f.level}"></span><div class="body">
        <div class="what">${esc(f.text)}</div>
        <div class="where">${esc(d.name)} · ${esc([d.maker, d.model].filter(Boolean).join(' '))}${rooms[d.room] ? ' · ' + esc(rooms[d.room].name) : ''}</div>
      </div></div>`).join('')}</div>`;
  }

  function servicesPanel(p, rooms) {
    const missing = (p.stats.missingDrivers || []).filter(f => !/^control4_agent_|^roomdevice/.test(f));
    return `<p class="section-note">Software drivers in the project: streaming services, agents, virtual sources and helpers. They have no hardware to inventory.</p>
      <div class="sheet"><table>
        <thead><tr><th>Name</th><th>Type</th><th>Room</th><th>Driver file</th></tr></thead>
        <tbody>${p.services.map(s => `<tr><td class="dname">${esc(s.name)}</td><td>${esc([s.maker, s.what].filter(Boolean).join(' '))}</td><td>${esc((rooms[s.room] || {}).name || '')}</td><td class="mono">${esc(s.file)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-cell">None.</td></tr>'}</tbody>
      </table></div>
      ${missing.length ? `<p class="section-note">Driver files referenced but not included in the backup: <span class="mono">${esc(missing.join(', '))}</span></p>` : ''}`;
  }

  // ---------- events ----------
  document.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.key) { state.activeKey = t.dataset.key; state.search = ''; state.category = 'All'; state.control = 'All'; render(); return; }
    if (t.dataset.remove) {
      state.projects = state.projects.filter(p => keyOf(p) !== t.dataset.remove);
      if (!state.projects.length) state.projects = [window.C4_SAMPLE];
      if (state.activeKey === t.dataset.remove) state.activeKey = keyOf(state.projects[0]);
      save(); render(); toast('Removed from this list');
      return;
    }
    if (t.dataset.tab) { state.tab = t.dataset.tab; renderProject(); document.getElementById('tab-' + state.tab).focus(); return; }
    if (t.dataset.cat) { state.category = t.dataset.cat; renderPanel(active(), roomMap(active())); return; }
    if (t.dataset.ctrl) { state.control = t.dataset.ctrl; renderPanel(active(), roomMap(active())); return; }
    const p = active();
    if (!p) return;
    if (t.dataset.action === 'csv') download(safeName(p) + '_inventory.csv', devicesCsv(p), 'text/csv');
    if (t.dataset.action === 'copy-csv') copy(devicesCsv(p), 'Inventory copied as CSV');
    if (t.dataset.action === 'json') download(safeName(p) + '_sitesheet.json', JSON.stringify(p, null, 2), 'application/json');
  });

  document.addEventListener('input', e => {
    if (e.target.id !== 'search') return;
    state.search = e.target.value;
    const pos = e.target.selectionStart;
    renderPanel(active(), roomMap(active()));
    const s = $('#search'); s.focus(); try { s.setSelectionRange(pos, pos); } catch (err) {}
  });

  document.addEventListener('keydown', e => {
    const t = e.target.closest && e.target.closest('[role="tab"]');
    if (!t || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const i = tabs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : -1);
    const next = tabs[(i + tabs.length) % tabs.length];
    state.tab = next.dataset.tab; renderProject(); document.getElementById('tab-' + state.tab).focus();
  });

  $('#file-input').addEventListener('change', e => { loadFiles(e.target.files); e.target.value = ''; });

  let dragDepth = 0;
  window.addEventListener('dragenter', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
    if (e.dataTransfer && e.dataTransfer.files.length) loadFiles(e.dataTransfer.files);
  });

  // ---------- start ----------
  const saved = restore();
  state.projects = saved.length ? saved : [window.C4_SAMPLE];
  state.activeKey = keyOf(state.projects[0]);
  if (!window.JSZip) showError('The zip reader did not load. Check your internet connection and reload the page.');
  render();
})();
