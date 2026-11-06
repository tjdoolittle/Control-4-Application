/* Compare two parsed backups of the same project: what was added, removed, changed or rewired.
   Works in the browser (window.C4Compare) and in Node (module.exports). */
(function (root) {
  'use strict';

  const DEVICE_FIELDS = [
    ['name', 'Name'],
    ['room', 'Room'],
    ['model', 'Model'],
    ['driverFile', 'Driver'],
    ['driverVersion', 'Driver version'],
    ['firmware', 'Firmware'],
    ['control', 'Control'],
    ['ip', 'IP address'],
    ['mac', 'MAC'],
    ['zigbee', 'Zigbee ID'],
    ['status', 'Status']
  ];

  function sortKey(p) { return (p.backupDate || '') + '|' + String(p.project.projectVersion || '').padStart(8, '0'); }

  // Older backup first, so every change reads before → after
  function order(a, b) { return sortKey(a) <= sortKey(b) ? [a, b] : [b, a]; }

  function sameProject(a, b) { return !!(a.project.uuid && a.project.uuid === b.project.uuid); }

  function roomName(p, id) { const r = p.rooms.find(x => x.id === id); return r ? r.name : ''; }

  function wireKey(c) { return [c.kind, c.from.id, c.from.port, c.to.id, c.to.port].join('|'); }

  function compare(olderIn, newerIn) {
    const [older, newer] = order(olderIn, newerIn);
    const oldDev = Object.fromEntries(older.devices.map(d => [d.id, d]));
    const newDev = Object.fromEntries(newer.devices.map(d => [d.id, d]));

    // Match by Control4 item id. If a device was deleted and re-added with the same name and driver,
    // pair it up so it shows as a change instead of a remove plus an add.
    const pairs = [];
    const unmatchedOld = [], unmatchedNew = [];
    older.devices.forEach(d => { if (newDev[d.id]) pairs.push([d, newDev[d.id]]); else unmatchedOld.push(d); });
    newer.devices.forEach(d => { if (!oldDev[d.id]) unmatchedNew.push(d); });
    const removed = [];
    unmatchedOld.forEach(o => {
      const i = unmatchedNew.findIndex(n => n.name === o.name && n.driverFile === o.driverFile);
      if (i >= 0) { pairs.push([o, unmatchedNew[i]]); unmatchedNew.splice(i, 1); }
      else removed.push(o);
    });
    const added = unmatchedNew;

    const changed = [];
    pairs.forEach(([o, n]) => {
      const fields = [];
      DEVICE_FIELDS.forEach(([f, label]) => {
        let a = o[f] || '', b = n[f] || '';
        if (f === 'room') { a = roomName(older, o.room); b = roomName(newer, n.room); }
        if (f === 'model') { a = [o.maker, o.model].filter(Boolean).join(' '); b = [n.maker, n.model].filter(Boolean).join(' '); }
        if (f === 'status') { a = a.toLowerCase(); b = b.toLowerCase(); }
        if (a !== b) fields.push({ field: f, label, from: a, to: b });
      });
      if (o.id !== n.id) fields.push({ field: 'id', label: 'Re-added', from: 'item ' + o.id, to: 'item ' + n.id });
      if (fields.length) changed.push({ before: o, after: n, fields });
    });

    // Wiring: a port that now feeds something else is a rebind, not a remove plus an add
    const oldW = Object.fromEntries(older.connections.map(c => [wireKey(c), c]));
    const newW = Object.fromEntries(newer.connections.map(c => [wireKey(c), c]));
    const gone = older.connections.filter(c => !newW[wireKey(c)]);
    const fresh = newer.connections.filter(c => !oldW[wireKey(c)]);
    const rebound = [];
    gone.slice().forEach(g => {
      const i = fresh.findIndex(f => f.kind === g.kind && f.from.id === g.from.id && f.from.port === g.from.port);
      if (i >= 0) {
        rebound.push({ before: g, after: fresh[i] });
        fresh.splice(i, 1);
        gone.splice(gone.indexOf(g), 1);
      }
    });

    // Rooms
    const oldRooms = Object.fromEntries(older.rooms.map(r => [r.id, r]));
    const newRooms = Object.fromEntries(newer.rooms.map(r => [r.id, r]));
    const roomsAdded = newer.rooms.filter(r => !oldRooms[r.id]);
    const roomsRemoved = older.rooms.filter(r => !newRooms[r.id]);
    const roomsRenamed = newer.rooms.filter(r => oldRooms[r.id] && oldRooms[r.id].name !== r.name).map(r => ({ from: oldRooms[r.id].name, to: r.name }));

    // Services and software drivers
    const oldSvc = new Set(older.services.map(s => s.id + '|' + s.name));
    const newSvc = new Set(newer.services.map(s => s.id + '|' + s.name));
    const servicesAdded = newer.services.filter(s => !oldSvc.has(s.id + '|' + s.name));
    const servicesRemoved = older.services.filter(s => !newSvc.has(s.id + '|' + s.name));

    const projectChanges = [];
    [['name', 'Project name'], ['osVersion', 'OS version'], ['projectVersion', 'Project revision']].forEach(([f, label]) => {
      const a = older.project[f] || '', b = newer.project[f] || '';
      if (a !== b) projectChanges.push({ label, from: a, to: b });
    });

    const network = changed.filter(c => c.fields.some(f => f.field === 'ip' || f.field === 'mac' || f.field === 'zigbee'));
    const total = added.length + removed.length + changed.length + gone.length + fresh.length + rebound.length +
      roomsAdded.length + roomsRemoved.length + roomsRenamed.length + servicesAdded.length + servicesRemoved.length;

    return {
      older, newer,
      sameProject: sameProject(older, newer),
      projectChanges,
      added, removed, changed, network,
      wiring: { added: fresh, removed: gone, rebound },
      rooms: { added: roomsAdded, removed: roomsRemoved, renamed: roomsRenamed },
      services: { added: servicesAdded, removed: servicesRemoved },
      total
    };
  }

  function label(p) {
    return [p.backupDate ? p.backupDate.slice(0, 10) : '', p.project.projectVersion ? 'rev ' + p.project.projectVersion : ''].filter(Boolean).join(', ') || p.fileName;
  }

  function wireText(c) { return `${c.from.name} ${c.from.port} → ${c.to.name} ${c.to.port}`; }

  // Plain text for a service ticket or an email to the office
  function summaryText(r) {
    const L = [];
    const room = (p, d) => roomName(p, d.room);
    L.push(`${r.newer.project.name}: changes from ${label(r.older)} to ${label(r.newer)}`);
    if (!r.total && !r.projectChanges.length) { L.push('No changes found.'); return L.join('\n'); }
    if (r.projectChanges.length) { L.push(''); r.projectChanges.forEach(c => L.push(`${c.label}: ${c.from || '(none)'} → ${c.to || '(none)'}`)); }
    if (r.added.length) { L.push('', `Added (${r.added.length})`); r.added.forEach(d => L.push(`  + ${d.name} (${[d.maker, d.model].filter(Boolean).join(' ')})${room(r.newer, d) ? ', ' + room(r.newer, d) : ''}`)); }
    if (r.removed.length) { L.push('', `Removed (${r.removed.length})`); r.removed.forEach(d => L.push(`  - ${d.name} (${[d.maker, d.model].filter(Boolean).join(' ')})${room(r.older, d) ? ', ' + room(r.older, d) : ''}`)); }
    if (r.changed.length) {
      L.push('', `Changed (${r.changed.length})`);
      r.changed.forEach(c => c.fields.forEach(f => L.push(`  ~ ${c.after.name}: ${f.label} ${f.from || '(none)'} → ${f.to || '(none)'}`)));
    }
    const w = r.wiring;
    if (w.added.length + w.removed.length + w.rebound.length) {
      L.push('', 'Wiring');
      w.rebound.forEach(x => L.push(`  ~ ${x.before.from.name} ${x.before.from.port}: ${x.before.to.name} ${x.before.to.port} → ${x.after.to.name} ${x.after.to.port}`));
      w.added.forEach(c => L.push(`  + ${wireText(c)}`));
      w.removed.forEach(c => L.push(`  - ${wireText(c)}`));
    }
    const rm = r.rooms;
    if (rm.added.length + rm.removed.length + rm.renamed.length) {
      L.push('', 'Rooms');
      rm.renamed.forEach(x => L.push(`  ~ ${x.from} → ${x.to}`));
      rm.added.forEach(x => L.push(`  + ${x.name}`));
      rm.removed.forEach(x => L.push(`  - ${x.name}`));
    }
    const sv = r.services;
    if (sv.added.length + sv.removed.length) {
      L.push('', 'Services and software drivers');
      sv.added.forEach(x => L.push(`  + ${x.name}`));
      sv.removed.forEach(x => L.push(`  - ${x.name}`));
    }
    return L.join('\n');
  }

  function csv(r) {
    const rows = [['Change', 'Area', 'Item', 'Detail', 'Before', 'After']];
    const room = (p, d) => roomName(p, d.room);
    r.projectChanges.forEach(c => rows.push(['Changed', 'Project', r.newer.project.name, c.label, c.from, c.to]));
    r.added.forEach(d => rows.push(['Added', 'Device', d.name, [d.maker, d.model].filter(Boolean).join(' ') + (room(r.newer, d) ? ' · ' + room(r.newer, d) : ''), '', d.ip || d.zigbee || '']));
    r.removed.forEach(d => rows.push(['Removed', 'Device', d.name, [d.maker, d.model].filter(Boolean).join(' ') + (room(r.older, d) ? ' · ' + room(r.older, d) : ''), d.ip || d.zigbee || '', '']));
    r.changed.forEach(c => c.fields.forEach(f => rows.push(['Changed', 'Device', c.after.name, f.label, f.from, f.to])));
    r.wiring.rebound.forEach(x => rows.push(['Changed', 'Wiring', `${x.before.from.name} ${x.before.from.port}`, 'Now feeds', `${x.before.to.name} ${x.before.to.port}`, `${x.after.to.name} ${x.after.to.port}`]));
    r.wiring.added.forEach(c => rows.push(['Added', 'Wiring', `${c.from.name} ${c.from.port}`, 'Feeds', '', `${c.to.name} ${c.to.port}`]));
    r.wiring.removed.forEach(c => rows.push(['Removed', 'Wiring', `${c.from.name} ${c.from.port}`, 'Fed', `${c.to.name} ${c.to.port}`, '']));
    r.rooms.renamed.forEach(x => rows.push(['Changed', 'Room', x.to, 'Renamed', x.from, x.to]));
    r.rooms.added.forEach(x => rows.push(['Added', 'Room', x.name, x.floor || '', '', '']));
    r.rooms.removed.forEach(x => rows.push(['Removed', 'Room', x.name, x.floor || '', '', '']));
    r.services.added.forEach(x => rows.push(['Added', 'Service', x.name, x.what || '', '', '']));
    r.services.removed.forEach(x => rows.push(['Removed', 'Service', x.name, x.what || '', '', '']));
    const cell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return rows.map(r2 => r2.map(cell).join(',')).join('\r\n');
  }

  const api = { compare, summaryText, csv, label, order, sameProject };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.C4Compare = api;
})(typeof window !== 'undefined' ? window : this);
