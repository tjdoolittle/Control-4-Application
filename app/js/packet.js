/* Closeout packet: a print-ready as-built for one project.
   render() returns the pages as HTML; the app shows them as a preview and prints them. */
(function () {
  'use strict';

  const SECTIONS = [
    ['cover', 'Cover page'],
    ['overview', 'System overview'],
    ['schematic', 'Schematic'],
    ['inventory', 'Inventory by room'],
    ['wiring', 'Wiring list'],
    ['network', 'Network sheet'],
    ['programming', 'Programming'],
    ['issues', 'Open issues'],
    ['changes', 'Changes since previous backup'],
    ['signoff', 'Notes and sign-off']
  ];

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dash = v => v ? esc(v) : '<span class="pk-none">none</span>';
  const ipKey = ip => { const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip || ''); return m ? m.slice(1).map(n => n.padStart(3, '0')).join('.') : 'zzz'; };

  function fmtDate(d) {
    try { return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return d; }
  }
  function fmtBackup(s) {
    if (!s) return '';
    const d = new Date(s.replace(' ', 'T'));
    return isNaN(d) ? s : d.toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function page(o, title, body, cls) {
    return `<section class="pk-page${cls ? ' ' + cls : ''}">
      <header class="pk-runhead">
        <span>${o.logo ? `<img class="pk-runlogo" src="${esc(o.logo)}" alt="">` : ''}${esc(o.company || 'System as-built')}</span>
        <span>${esc(o.project.project.name)}</span>
      </header>
      <h2 class="pk-h2">${esc(title)}</h2>
      ${body}
    </section>`;
  }

  function cover(o, toc) {
    const p = o.project;
    const ip = p.devices.filter(d => d.ip || d.addrNote === 'Primary controller').length;
    const zb = p.devices.filter(d => d.zigbee).length;
    const rooms = new Set(p.devices.map(d => d.room)).size;
    return `<section class="pk-page pk-cover">
      <div class="pk-cover-top">
        ${o.logo ? `<img class="pk-logo" src="${esc(o.logo)}" alt="${esc(o.company)}">` : ''}
        ${o.company ? `<div class="pk-company">${esc(o.company)}</div>` : ''}
      </div>
      <div class="pk-cover-main">
        <div class="pk-kicker">System as-built</div>
        <h1 class="pk-title">${esc(p.project.name)}</h1>
        ${p.project.city ? `<div class="pk-sub">${esc(p.project.city)}</div>` : ''}
        <dl class="pk-meta">
          <div><dt>Prepared</dt><dd>${esc(fmtDate(o.today))}</dd></div>
          ${o.preparedBy ? `<div><dt>Prepared by</dt><dd>${esc(o.preparedBy)}</dd></div>` : ''}
          ${o.contact ? `<div><dt>Service contact</dt><dd>${esc(o.contact)}</dd></div>` : ''}
          <div><dt>Project backup</dt><dd>${esc(fmtBackup(p.backupDate) || p.fileName)}</dd></div>
          <div><dt>Control4 OS</dt><dd>${esc(p.project.osVersion || 'unknown')}</dd></div>
          <div><dt>Project revision</dt><dd>${esc(p.project.projectVersion || '')}</dd></div>
        </dl>
        <div class="pk-figures">
          <div><b>${p.devices.length}</b><span>Devices</span></div>
          <div><b>${rooms}</b><span>Rooms</span></div>
          <div><b>${ip}</b><span>On the network</span></div>
          <div><b>${zb}</b><span>Zigbee</span></div>
          <div><b>${p.connections.length}</b><span>Connections</span></div>
        </div>
      </div>
      <div class="pk-toc">
        <div class="pk-toc-h">Contents</div>
        <ol>${toc.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
      </div>
    </section>`;
  }

  function overview(o) {
    const p = o.project;
    const rooms = Object.fromEntries(p.rooms.map(r => [r.id, r]));
    const controllers = p.devices.filter(d => d.category === 'Controller');
    const cats = {};
    p.devices.forEach(d => { cats[d.category] = (cats[d.category] || 0) + 1; });
    const byRoom = p.rooms.map(r => ({ r, n: p.devices.filter(d => d.room === r.id).length })).filter(x => x.n);
    return page(o, 'System overview', `
      ${o.notes ? `<div class="pk-notes"><div class="pk-h3">Notes</div><p>${esc(o.notes).replace(/\n/g, '<br>')}</p></div>` : ''}
      <div class="pk-h3">Controllers</div>
      <table class="pk-table"><thead><tr><th>Controller</th><th>Model</th><th>Room</th><th>Address</th><th>MAC</th></tr></thead><tbody>
        ${controllers.map(d => `<tr><td class="pk-strong">${esc(d.name)}</td><td>${esc([d.maker, d.model].filter(Boolean).join(' '))}</td><td>${esc((rooms[d.room] || {}).name || '')}</td><td class="pk-mono">${dash(d.ip || d.addrNote)}</td><td class="pk-mono">${dash(d.mac)}</td></tr>`).join('') || '<tr><td colspan="5" class="pk-none">No controllers found in this backup.</td></tr>'}
      </tbody></table>
      <div class="pk-two">
        <div>
          <div class="pk-h3">Devices by type</div>
          <table class="pk-table pk-compact"><tbody>
            ${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<tr><td>${esc(c)}</td><td class="pk-num">${n}</td></tr>`).join('')}
          </tbody></table>
        </div>
        <div>
          <div class="pk-h3">Devices by room</div>
          <table class="pk-table pk-compact"><tbody>
            ${byRoom.map(x => `<tr><td>${esc(x.r.name)}${x.r.floor ? `<span class="pk-dim"> · ${esc(x.r.floor)}</span>` : ''}</td><td class="pk-num">${x.n}</td></tr>`).join('')}
          </tbody></table>
        </div>
      </div>`);
  }

  function schematic(o) {
    const s = o.schematic;
    if (!s || !s.svg) {
      return page(o, 'Schematic', `<p class="pk-dim">This project has no AV or control wiring in Composer, and nothing has been drawn on the Schematic tab yet.</p>`, 'pk-landscape');
    }
    return page(o, 'Schematic', `
      <div class="pk-legend">${s.types.map(t => `<span><i style="background:${t.color}"></i>${esc(t.label)}</span>`).join('')}${s.customWires ? '<span><i class="pk-dashed"></i>Added by hand</span>' : ''}</div>
      <div class="pk-svg">${s.svg}</div>
      <p class="pk-caption">${s.nodes} devices and ${s.wires} connections, drawn from the project backup${s.customWires ? ` plus ${s.customWires} wire${s.customWires === 1 ? '' : 's'} added by hand` : ''}.</p>`, 'pk-landscape');
  }

  function inventory(o) {
    const p = o.project;
    const groups = p.rooms.map(r => ({ r, items: p.devices.filter(d => d.room === r.id) })).filter(g => g.items.length);
    const loose = p.devices.filter(d => !p.rooms.some(r => r.id === d.room));
    if (loose.length) groups.push({ r: { name: 'No room', floor: '' }, items: loose });
    return page(o, 'Inventory by room', `
      <table class="pk-table"><thead><tr><th>Device</th><th>Make / model</th><th>Control</th><th>Address</th><th>MAC</th><th>Version</th></tr></thead>
      ${groups.map(g => `<tbody class="pk-group"><tr class="pk-room"><td colspan="6">${esc(g.r.name)}${g.r.floor ? `<span class="pk-dim"> · ${esc(g.r.floor)}</span>` : ''}</td></tr>
        ${g.items.map(d => `<tr>
          <td class="pk-strong">${esc(d.name)}${d.hardwareName ? `<div class="pk-dim">${esc(d.hardwareName)}</div>` : ''}</td>
          <td>${esc(d.maker)}<div class="pk-dim">${esc(d.model)}</div></td>
          <td>${esc(d.control || '')}</td>
          <td class="pk-mono">${d.ip ? esc(d.ip) : d.zigbee ? esc(d.zigbee) : d.addrNote ? esc(d.addrNote) : '<span class="pk-none">none</span>'}</td>
          <td class="pk-mono">${dash(d.mac)}</td>
          <td class="pk-mono">${d.firmware ? 'FW ' + esc(d.firmware) + '<br>' : ''}<span class="pk-dim">Driver ${esc(d.driverVersion || '?')}</span></td>
        </tr>`).join('')}</tbody>`).join('')}
      </table>`);
  }

  function kindLabel(c) {
    const cl = c.classes || [];
    if (cl.includes('IR_OUT')) return 'IR';
    if (cl.includes('RS_232')) return 'Serial';
    if (cl.includes('HDMI')) return 'HDMI';
    if (cl.some(x => /STEREO|SPEAKER|DIGITAL|AUDIO/.test(x))) return 'Audio';
    if (cl.some(x => /COMPONENT|COMPOSITE|VIDEO/.test(x))) return 'Video';
    if (cl.some(x => /CONTACT/.test(x))) return 'Contact';
    if (cl.some(x => /RELAY/.test(x))) return 'Relay';
    return cl[0] || '';
  }

  function wiring(o) {
    const p = o.project;
    const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });
    const table = kind => {
      const list = p.connections.filter(c => c.kind === kind).sort((a, b) => natural(a.from.name, b.from.name) || natural(a.from.port, b.from.port));
      if (!list.length) return '<p class="pk-dim">None in this project.</p>';
      return `<table class="pk-table"><thead><tr><th>From</th><th>Port</th><th></th><th>To</th><th>Input</th><th>Type</th></tr></thead><tbody>
        ${list.map((c, i) => `<tr${i && list[i - 1].from.id === c.from.id ? ' class="pk-cont"' : ''}>
          <td class="pk-strong">${i && list[i - 1].from.id === c.from.id ? '' : esc(c.from.name)}</td>
          <td class="pk-mono">${esc(c.from.port)}</td><td class="pk-dim">→</td>
          <td>${esc(c.to.name)}${c.via ? `<div class="pk-dim">via ${esc(c.via)}</div>` : ''}</td>
          <td class="pk-mono">${esc(c.to.port)}</td><td>${esc(kindLabel(c))}</td></tr>`).join('')}
      </tbody></table>`;
    };
    return page(o, 'Wiring list', `
      <div class="pk-h3">Control wiring: IR emitters and serial</div>${table('control')}
      <div class="pk-h3">AV connections</div>${table('av')}`);
  }

  function network(o) {
    const p = o.project;
    const rooms = Object.fromEntries(p.rooms.map(r => [r.id, r.name]));
    const ip = p.devices.filter(d => d.ip || d.addrNote === 'Primary controller').sort((a, b) => ipKey(a.ip) < ipKey(b.ip) ? -1 : 1);
    const zb = p.devices.filter(d => d.zigbee).sort((a, b) => (rooms[a.room] || '').localeCompare(rooms[b.room] || '') || a.name.localeCompare(b.name));
    const unset = p.devices.filter(d => d.control === 'IP' && !d.ip && !d.addrNote);
    return page(o, 'Network sheet', `
      <div class="pk-h3">IP devices</div>
      <table class="pk-table"><thead><tr><th>IP address</th><th>Device</th><th>Room</th><th>MAC</th><th>Model</th></tr></thead><tbody>
        ${ip.map(d => `<tr><td class="pk-mono">${d.ip ? esc(d.ip) : esc(d.addrNote)}</td><td class="pk-strong">${esc(d.name)}</td><td>${esc(rooms[d.room] || '')}</td><td class="pk-mono">${dash(d.mac)}</td><td>${esc([d.maker, d.model].filter(Boolean).join(' '))}</td></tr>`).join('') || '<tr><td colspan="5" class="pk-none">No IP devices.</td></tr>'}
        ${unset.map(d => `<tr><td class="pk-mono pk-warn">Not set</td><td class="pk-strong">${esc(d.name)}</td><td>${esc(rooms[d.room] || '')}</td><td></td><td>${esc([d.maker, d.model].filter(Boolean).join(' '))}</td></tr>`).join('')}
      </tbody></table>
      ${zb.length ? `<div class="pk-h3">Zigbee devices</div>
      <table class="pk-table"><thead><tr><th>Zigbee ID</th><th>Device</th><th>Room</th><th>Model</th></tr></thead><tbody>
        ${zb.map(d => `<tr><td class="pk-mono">${esc(d.zigbee)}</td><td class="pk-strong">${esc(d.name)}</td><td>${esc(rooms[d.room] || '')}</td><td>${esc(d.model)}</td></tr>`).join('')}
      </tbody></table>` : ''}`);
  }

  function programming(o) {
    const g = o.project.programming;
    const P = window.C4Programming;
    if (!g || g.error || !P) return '';
    const ev = P.eventsForPrint(o.project);
    const lines = (ls, d) => ls.map(l => `<div class="pk-pline" style="padding-left:${d * 16}px">${l.type === 'if' ? '<b>If</b> ' : l.type === 'loop' ? '<b>Loop</b> ' : ''}${esc(l.text)}${l.enabled ? '' : ' <span class="pk-dim">(disabled)</span>'}</div>${lines(l.children, d + 1)}`).join('');
    const parts = [];
    if (ev.length) {
      parts.push(`<div class="pk-h3">When this happens, do this</div>
        <table class="pk-table"><thead><tr><th style="width:42%">When</th><th>Do</th></tr></thead><tbody>
        ${ev.map(e => `<tr><td class="pk-strong">${esc(e.when)}</td><td>${lines(e.lines, 0)}</td></tr>`).join('')}
        </tbody></table>`);
    }
    if (g.scenes.length) {
      parts.push(`<div class="pk-h3">Lighting scenes</div>
        <table class="pk-table"><thead><tr><th>Scene</th><th>Load</th><th>Level</th><th>Ramp</th></tr></thead><tbody>
        ${g.scenes.map(sc => sc.members.map((m, i) => `<tr${i ? ' class="pk-cont"' : ''}><td class="pk-strong">${i ? '' : esc(sc.name)}</td><td>${esc(m.name)}${m.room ? `<span class="pk-dim"> · ${esc(m.room)}</span>` : ''}</td><td>${m.level == null ? 'unchanged' : m.level + '%'}</td><td>${esc(P.fmtMs(m.rateMs))}</td></tr>`).join('')).join('')}
        </tbody></table>`);
    }
    if (g.keypads.length) {
      parts.push(`<div class="pk-h3">Keypads</div>
        <table class="pk-table"><thead><tr><th>Keypad</th><th>Button</th><th>Behavior</th><th>LED</th></tr></thead><tbody>
        ${g.keypads.map(k => k.buttons.map((b, i) => `<tr${i ? ' class="pk-cont"' : ''}><td class="pk-strong">${i ? '' : esc(k.name) + (k.room ? `<div class="pk-dim">${esc(k.room)}</div>` : '')}</td><td>${esc(b.engraving || b.name)}</td><td>${esc(b.behavior)}</td><td>${esc(b.led)}</td></tr>`).join('')).join('')}
        </tbody></table>`);
    }
    if (g.timers.length) {
      parts.push(`<div class="pk-h3">Timers</div><table class="pk-table pk-compact"><tbody>
        ${g.timers.map(t => `<tr><td class="pk-strong">${esc(t.name)}</td><td>${esc(P.fmtMs(t.ms))}${t.repeating ? ', repeating' : ''}</td></tr>`).join('')}</tbody></table>`);
    }
    if (g.customScreens.length) {
      parts.push(`<div class="pk-h3">Custom buttons</div><table class="pk-table pk-compact"><tbody>
        ${g.customScreens.map(sc => `<tr><td class="pk-strong">${esc(sc.name)}<span class="pk-dim"> · ${esc(sc.room)}</span></td><td>${sc.buttons.map(b => esc(b.name)).join(', ')}</td></tr>`).join('')}</tbody></table>`);
    }
    return page(o, 'Programming', parts.length ? parts.join('') : '<p class="pk-dim">No programming in this project.</p>');
  }

  function issues(o) {
    const p = o.project;
    const rooms = Object.fromEntries(p.rooms.map(r => [r.id, r.name]));
    const rank = { bad: 0, warn: 1, info: 2 };
    const list = [];
    p.devices.forEach(d => d.flags.forEach(f => list.push({ d, f })));
    list.sort((a, b) => rank[a.f.level] - rank[b.f.level]);
    return page(o, 'Open issues', list.length ? `
      <p class="pk-dim">What the backup itself shows at the time it was taken: offline devices, duplicate addresses, and drivers never bound or addressed.</p>
      <table class="pk-table"><thead><tr><th></th><th>Issue</th><th>Device</th><th>Room</th></tr></thead><tbody>
        ${list.map(({ d, f }) => `<tr><td><span class="pk-dot pk-${f.level}"></span></td><td>${esc(f.text)}</td><td class="pk-strong">${esc(d.name)}</td><td>${esc(rooms[d.room] || '')}</td></tr>`).join('')}
      </tbody></table>` : `<p>Nothing flagged. Every device has an address or a bound port, and none were offline when this backup was taken.</p>`);
  }

  function changes(o) {
    const r = o.changes;
    if (!r) return '';
    const room = (p, id) => { const x = p.rooms.find(q => q.id === id); return x ? x.name : ''; };
    const rows = [];
    r.projectChanges.forEach(c => rows.push(['~', 'Project', c.label, c.from, c.to]));
    r.added.forEach(d => rows.push(['+', d.name, 'Added' + (room(r.newer, d.room) ? ' in ' + room(r.newer, d.room) : ''), '', [d.maker, d.model].filter(Boolean).join(' ')]));
    r.removed.forEach(d => rows.push(['−', d.name, 'Removed' + (room(r.older, d.room) ? ' from ' + room(r.older, d.room) : ''), [d.maker, d.model].filter(Boolean).join(' '), '']));
    r.changed.forEach(c => c.fields.forEach(f => rows.push(['~', c.after.name, f.label, f.from, f.to])));
    r.wiring.rebound.forEach(x => rows.push(['~', `${x.before.from.name} ${x.before.from.port}`, 'Rebound', `${x.before.to.name} ${x.before.to.port}`, `${x.after.to.name} ${x.after.to.port}`]));
    r.wiring.added.forEach(c => rows.push(['+', `${c.from.name} ${c.from.port}`, 'Connected', '', `${c.to.name} ${c.to.port}`]));
    r.wiring.removed.forEach(c => rows.push(['−', `${c.from.name} ${c.from.port}`, 'Disconnected', `${c.to.name} ${c.to.port}`, '']));
    r.rooms.renamed.forEach(x => rows.push(['~', 'Room', 'Renamed', x.from, x.to]));
    r.rooms.added.forEach(x => rows.push(['+', x.name, 'Room added', '', '']));
    r.rooms.removed.forEach(x => rows.push(['−', x.name, 'Room removed', '', '']));
    r.services.added.forEach(x => rows.push(['+', x.name, 'Service added', '', '']));
    r.services.removed.forEach(x => rows.push(['−', x.name, 'Service removed', '', '']));
    const cls = m => m === '+' ? 'pk-add' : m === '−' ? 'pk-del' : 'pk-mod';
    return page(o, 'Changes since previous backup', `
      <p class="pk-dim">Compared with the backup from ${esc(fmtBackup(r.older.backupDate) || r.older.fileName)}${r.older.project.projectVersion ? ` (revision ${esc(r.older.project.projectVersion)})` : ''}.</p>
      ${rows.length ? `<table class="pk-table"><thead><tr><th></th><th>Item</th><th>Change</th><th>Before</th><th>After</th></tr></thead><tbody>
        ${rows.map(x => `<tr><td class="pk-mark ${cls(x[0])}">${x[0]}</td><td class="pk-strong">${esc(x[1])}</td><td>${esc(x[2])}</td><td class="pk-before">${x[3] ? esc(x[3]) : ''}</td><td>${x[4] ? esc(x[4]) : ''}</td></tr>`).join('')}
      </tbody></table>` : '<p>No changes between the two backups.</p>'}`);
  }

  function signoff(o) {
    return page(o, 'Notes and sign-off', `
      <div class="pk-lines">${'<div></div>'.repeat(12)}</div>
      <div class="pk-sign">
        <div><div class="pk-signline"></div><span>Client signature</span></div>
        <div><div class="pk-signline"></div><span>Date</span></div>
        <div><div class="pk-signline"></div><span>Technician${o.preparedBy ? ': ' + esc(o.preparedBy) : ''}</span></div>
        <div><div class="pk-signline"></div><span>Date</span></div>
      </div>`);
  }

  function render(o) {
    const on = id => o.sections.includes(id) && (id !== 'changes' || o.changes);
    const builders = { overview, schematic, inventory, wiring, network, programming, issues, changes, signoff };
    const order = SECTIONS.map(s => s[0]).filter(id => id !== 'cover' && on(id));
    const toc = order.map(id => SECTIONS.find(s => s[0] === id)[1]);
    return (on('cover') ? cover(o, toc) : '') + order.map(id => builders[id](o)).join('');
  }

  window.C4Packet = { render, SECTIONS };
})();
