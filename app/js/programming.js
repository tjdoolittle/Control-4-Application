/* Programming tab: what each event does, lighting scenes, keypads, timers, custom buttons, variables.
   Room events have no names in a backup, so people can name them once; names apply to every project. */
(function () {
  'use strict';

  const NAMES_KEY = 'c4sitesheet.eventnames.v1';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function loadNames() { try { return JSON.parse(localStorage.getItem(NAMES_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function saveName(eventId, name) {
    const n = loadNames();
    if (name) n['room:' + eventId] = name; else delete n['room:' + eventId];
    try { localStorage.setItem(NAMES_KEY, JSON.stringify(n)); } catch (e) {}
  }

  // The sentence shown for an event, using a name the person gave a room event if there is one
  function whenText(e, names) {
    if (e.kind === 'room') {
      const n = names['room:' + e.eventId];
      return n ? `When ${n} in ${e.sourceName}` : e.when;
    }
    return e.when;
  }

  function fmtMs(ms) {
    if (!ms) return '0 s';
    if (ms < 60000) return (Math.round(ms / 100) / 10) + ' s';
    const m = ms / 60000;
    return (Number.isInteger(m) ? m : m.toFixed(1)) + ' min';
  }

  function linesHtml(ls) {
    if (!ls.length) return '';
    return `<ol class="pg-lines">${ls.map(l => `<li class="pg-line pg-${l.type}${l.enabled ? '' : ' pg-off'}">
      <span class="pg-kind">${l.type === 'if' ? 'If' : l.type === 'loop' ? 'Loop' : l.type === 'other' ? '·' : 'Do'}</span>
      <span class="pg-text">${esc(l.text)}${l.enabled ? '' : ' <span class="pg-badge">Disabled</span>'}</span>
      ${linesHtml(l.children)}
    </li>`).join('')}</ol>`;
  }

  function involves(e, deviceId) {
    if (!deviceId) return true;
    if (e.sourceId === deviceId) return true;
    const walk = ls => ls.some(l => l.targetId === deviceId || walk(l.children));
    return walk(e.lines);
  }

  function textOf(e, names) {
    const walk = ls => ls.map(l => l.text + ' ' + l.targetName + ' ' + walk(l.children)).join(' ');
    return (whenText(e, names) + ' ' + e.sourceName + ' ' + e.room + ' ' + walk(e.lines)).toLowerCase();
  }

  function render(p, view) {
    const g = p.programming;
    if (!g) return `<p class="section-note">This backup was opened with an older version of C4 Site Sheet. Open the .c4p again to read its programming.</p>`;
    if (g.error) return `<div class="error-banner">${esc(g.error)}</div>`;
    const names = loadNames();
    const q = (view.search || '').trim().toLowerCase();
    const dev = view.device || '';

    const total = g.events.length + g.scenes.length + g.timers.length + g.customScreens.length + g.keypads.length + g.variables.length;
    if (!total) {
      return `<div class="compare-empty"><h2 class="section">No programming in this backup</h2>
        <p class="section-note">There are no events with actions, lighting scenes, timers, custom buttons, configured keypads or variables. Systems that run on room defaults and keypad behaviors often look like this.</p></div>`;
    }

    // Devices that appear anywhere in the programming, for the "involves" filter
    const devs = {};
    g.events.forEach(e => {
      devs[e.sourceId] = e.sourceName;
      const walk = ls => ls.forEach(l => { if (l.targetId) devs[l.targetId] = l.targetName; walk(l.children); });
      walk(e.lines);
    });

    const events = g.events.filter(e => involves(e, dev) && (!q || textOf(e, names).includes(q)));
    const groups = [];
    events.forEach(e => {
      const k = e.sourceName;
      let grp = groups.find(x => x.k === k);
      if (!grp) groups.push(grp = { k, kind: e.kind, room: e.room, items: [] });
      grp.items.push(e);
    });
    const unnamed = g.events.filter(e => e.kind === 'room' && !names['room:' + e.eventId]).length;

    const eventsHtml = groups.length ? groups.map(grp => `
      <div class="pg-group">
        <div class="pg-group-head"><span class="pg-src">${esc(grp.k)}</span><span class="dsub">${grp.kind === 'room' ? 'Room' : grp.kind === 'agent' ? 'Agent' : esc(grp.room || 'Device')}</span></div>
        ${grp.items.map(e => `<div class="pg-event">
          <div class="pg-when">
            <span>${esc(whenText(e, names))}</span>
            ${e.kind === 'room' ? (view.naming === e.eventId
              ? `<span class="pg-name-edit"><input id="pg-name-input" data-event="${esc(e.eventId)}" value="${esc(names['room:' + e.eventId] || '')}" placeholder="e.g. the Red button is pressed" maxlength="60" aria-label="Name for room event ${esc(e.eventId)}"><button class="btn btn-small" data-pg="save-name" data-event="${esc(e.eventId)}">Save</button></span>`
              : `<button class="pg-link" data-pg="name" data-event="${esc(e.eventId)}">${names['room:' + e.eventId] ? 'Rename' : 'Name it'}</button>`) : ''}
          </div>
          ${linesHtml(e.lines)}
        </div>`).join('')}
      </div>`).join('') : `<p class="section-note">No events match. Clear the search or pick a different device.</p>`;

    const scenes = g.scenes.filter(s => !q || (s.name + ' ' + s.members.map(m => m.name + ' ' + m.room).join(' ')).toLowerCase().includes(q))
      .filter(s => !dev || s.members.some(m => m.deviceId === dev));
    const keypads = g.keypads.filter(k => !dev || k.id === dev).filter(k => !q || (k.name + ' ' + k.room + ' ' + k.buttons.map(b => b.name + ' ' + b.engraving).join(' ')).toLowerCase().includes(q));
    const programmedKeypad = id => g.events.filter(e => e.sourceId === id).length;

    return `
      <div class="stats" role="list">
        <div class="stat" role="listitem"><div class="v">${g.events.length}</div><div class="l">Programmed events</div></div>
        <div class="stat" role="listitem"><div class="v">${g.lineCount}</div><div class="l">Lines of programming</div></div>
        <div class="stat" role="listitem"><div class="v">${g.scenes.length}</div><div class="l">Lighting scenes</div></div>
        <div class="stat" role="listitem"><div class="v">${g.keypads.length}</div><div class="l">Keypads</div></div>
        <div class="stat" role="listitem"><div class="v">${g.timers.length}</div><div class="l">Timers</div></div>
        <div class="stat" role="listitem"><div class="v">${g.customScreens.reduce((n, s) => n + s.buttons.length, 0)}</div><div class="l">Custom buttons</div></div>
      </div>
      <div class="toolbar">
        <input class="search" id="pg-search" type="search" placeholder="Search programming: a device, a command, a scene…" value="${esc(view.search || '')}" aria-label="Search programming">
        <label class="field pg-dev"><span class="visually-hidden">Only show programming that involves</span>
          <select id="pg-device"><option value="">Any device</option>${Object.entries(devs).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => `<option value="${esc(id)}"${id === dev ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
        </label>
      </div>

      ${g.events.length ? `<h2 class="section">When this happens, do this</h2>
        ${unnamed ? `<p class="section-note">Backups don't store names for room events (remote and room buttons). Use <b>Name it</b> once, from what Composer shows for that event, and the name is used for every project.</p>` : ''}
        ${eventsHtml}` : ''}

      ${scenes.length ? `<h2 class="section">Lighting scenes</h2>
        <div class="pg-scenes">${scenes.map(s => `<div class="pg-scene">
          <div class="pg-scene-head"><b>${esc(s.name)}</b><span class="dsub">${s.members.length} load${s.members.length === 1 ? '' : 's'}${s.tracking ? ' · tracks' : ''}</span></div>
          <table><thead><tr><th>Load</th><th>Room</th><th>Level</th><th>Ramp</th><th>Delay</th></tr></thead><tbody>
            ${s.members.map(m => `<tr><td class="dname">${esc(m.name)}</td><td>${esc(m.room)}</td><td class="tnum">${m.level == null ? '<span class="empty-cell">unchanged</span>' : `<span class="pg-level"><i style="width:${Math.max(0, Math.min(100, m.level))}%"></i></span>${m.level}%`}${m.color ? ' · color' : ''}</td><td class="tnum">${fmtMs(m.rateMs)}</td><td class="tnum">${fmtMs(m.delayMs)}</td></tr>`).join('')}
          </tbody></table></div>`).join('')}</div>` : ''}

      ${keypads.length ? `<h2 class="section">Keypads</h2>
        <div class="pg-keypads">${keypads.map(k => `<div class="pg-keypad">
          <div class="pg-scene-head"><b>${esc(k.name)}</b><span class="dsub">${esc(k.room)}${programmedKeypad(k.id) ? ` · ${programmedKeypad(k.id)} programmed event${programmedKeypad(k.id) === 1 ? '' : 's'}` : ''}</span></div>
          <ul class="pg-buttons">${k.buttons.map(b => `<li>
            <span class="pg-led" style="background:#${/^[0-9a-f]{6}$/i.test(b.onColor) ? b.onColor : '888888'}" title="LED on color"></span>
            <span class="pg-btn-name">${esc(b.engraving || b.name)}${b.engraving && b.engraving !== b.name ? `<span class="dsub"> ${esc(b.name)}</span>` : ''}</span>
            <span class="dsub">${esc(b.behavior)}${b.led ? ' · LED ' + esc(b.led.toLowerCase()) : ''}</span>
          </li>`).join('')}</ul></div>`).join('')}</div>` : ''}

      ${(!dev && (g.timers.length || g.customScreens.length)) ? `<div class="pg-two">
        ${g.timers.length ? `<div><h2 class="section">Timers</h2><div class="sheet"><table><thead><tr><th>Timer</th><th>Length</th><th>Repeats</th></tr></thead><tbody>
          ${g.timers.map(t => `<tr><td class="dname">${esc(t.name)}</td><td class="tnum">${fmtMs(t.ms)}</td><td>${t.repeating ? 'Yes' : 'No'}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
        ${g.customScreens.length ? `<div><h2 class="section">Custom buttons</h2><div class="sheet"><table><thead><tr><th>Screen</th><th>Room</th><th>Buttons</th></tr></thead><tbody>
          ${g.customScreens.map(s => `<tr><td class="dname">${esc(s.name)}</td><td>${esc(s.room)}</td><td>${s.buttons.map(b => esc(b.name)).join(', ')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      </div>` : ''}

      ${(!dev && g.variables.length) ? `<h2 class="section">Variables</h2><div class="sheet"><table><thead><tr><th>Variable</th><th>Owner</th><th>Type</th><th>Value in backup</th></tr></thead><tbody>
        ${g.variables.map(v => `<tr><td class="dname">${esc(v.name)}</td><td>${esc(v.owner)}</td><td>${esc(v.type)}${v.readonly ? ' · read only' : ''}</td><td class="mono">${esc(v.value)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    `;
  }

  // Plain text version for the closeout packet and for copying
  function eventsForPrint(p) {
    const g = p.programming;
    if (!g || g.error) return [];
    const names = loadNames();
    return g.events.map(e => ({ source: e.sourceName, when: whenText(e, names), lines: e.lines }));
  }

  window.C4Programming = { render, saveName, loadNames, whenText, eventsForPrint, linesHtml, fmtMs };
})();
