/* Schematic view: devices as blocks with their real ports, wires between them.
   Layout runs left to right by signal flow. Positions and added wires are saved per project. */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const NODE_W = 220;
  const HEAD_H = 46;
  const ROW_H = 20;
  const COL_GAP = 150;
  const ROW_GAP = 28;

  const WIRE_TYPES = [
    { id: 'ir', label: 'IR', group: 'control' },
    { id: 'serial', label: 'Serial', group: 'control' },
    { id: 'hdmi', label: 'HDMI / video', group: 'video' },
    { id: 'audio', label: 'Audio', group: 'audio' },
    { id: 'network', label: 'Network', group: 'network' },
    { id: 'speaker', label: 'Speaker', group: 'audio' },
    { id: 'power', label: 'Power', group: 'other' },
    { id: 'other', label: 'Other', group: 'other' }
  ];
  const TYPE_BY_ID = Object.fromEntries(WIRE_TYPES.map(t => [t.id, t]));
  const GROUPS = [['control', 'Control'], ['video', 'Video'], ['audio', 'Audio'], ['network', 'Network'], ['other', 'Other']];

  function wireType(classes) {
    const c = classes || [];
    if (c.includes('IR_OUT')) return 'ir';
    if (c.includes('RS_232')) return 'serial';
    if (c.some(x => /HDMI|COMPONENT|COMPOSITE|VIDEO|VGA|DVI/.test(x))) return 'hdmi';
    if (c.some(x => /SPEAKER/.test(x)) && c.length === 1) return 'speaker';
    if (c.some(x => /STEREO|DIGITAL|AUDIO|SPEAKER/.test(x))) return 'audio';
    return 'other';
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

  // ---------- storage ----------
  function load(key) {
    try { const raw = localStorage.getItem('c4sitesheet.schematic.v1.' + key); if (raw) return JSON.parse(raw); } catch (e) {}
    return null;
  }
  function store(key, data) {
    try { localStorage.setItem('c4sitesheet.schematic.v1.' + key, JSON.stringify(data)); } catch (e) {}
  }

  // ---------- model ----------
  function blockDevice(b) {
    return { id: b.id, name: b.name, maker: b.maker || '', model: b.model || '', category: 'Added', control: '', custom: true };
  }
  function allDevices(project, saved) { return project.devices.concat((saved.blocks || []).map(blockDevice)); }

  function buildModel(project, saved) {
    const devById = Object.fromEntries(allDevices(project, saved).map(d => [d.id, d]));
    const wires = [];
    project.connections.forEach((c, i) => {
      if (!devById[c.from.id] || !devById[c.to.id]) return;
      wires.push({ id: 'p' + i, from: c.from.id, to: c.to.id, fromPort: c.from.port, toPort: c.to.port, type: wireType(c.classes), via: c.via || '', custom: false });
    });
    (saved.custom || []).forEach(w => { if (devById[w.from] && devById[w.to]) wires.push(Object.assign({ custom: true }, w)); });

    const ids = new Set();
    wires.forEach(w => { ids.add(w.from); ids.add(w.to); });
    Object.keys(saved.pos || {}).forEach(id => { if (devById[id]) ids.add(id); });
    (saved.hidden || []).forEach(id => ids.delete(id));

    const nodes = {};
    ids.forEach(id => { nodes[id] = { id, dev: devById[id], inputs: [], outputs: [] }; });
    wires.forEach(w => {
      if (!nodes[w.from] || !nodes[w.to]) return;
      if (!nodes[w.from].outputs.includes(w.fromPort)) nodes[w.from].outputs.push(w.fromPort);
      if (!nodes[w.to].inputs.includes(w.toPort)) nodes[w.to].inputs.push(w.toPort);
    });
    Object.values(nodes).forEach(n => {
      n.inputs.sort(natural); n.outputs.sort(natural);
      n.h = HEAD_H + Math.max(1, n.inputs.length, n.outputs.length) * ROW_H + 10;
    });
    return { nodes, wires: wires.filter(w => nodes[w.from] && nodes[w.to]), devById };
  }

  // Longest-path layering on the wire graph, then barycenter ordering inside each column
  function autoLayout(model) {
    const wired = new Set();
    model.wires.forEach(w => { wired.add(w.from); wired.add(w.to); });
    const loose = Object.keys(model.nodes).filter(id => !wired.has(id));
    const ids = Object.keys(model.nodes).filter(id => wired.has(id));
    const out = {}, inn = {};
    ids.forEach(id => { out[id] = new Set(); inn[id] = new Set(); });
    model.wires.forEach(w => { if (w.from !== w.to) { out[w.from].add(w.to); inn[w.to].add(w.from); } });

    // Drop back edges found by DFS so loops (zone outputs feeding a matrix) don't stretch the layout
    const state = {}, keep = {};
    ids.forEach(id => { keep[id] = new Set(); });
    function dfs(u) {
      state[u] = 1;
      out[u].forEach(v => {
        if (state[v] === 1) return;
        keep[u].add(v);
        if (!state[v]) dfs(v);
      });
      state[u] = 2;
    }
    ids.slice().sort((a, b) => inn[a].size - inn[b].size).forEach(id => { if (!state[id]) dfs(id); });

    const rank = {};
    const preds = {};
    ids.forEach(id => { preds[id] = []; });
    ids.forEach(u => keep[u].forEach(v => preds[v].push(u)));
    function r(id, seen) {
      if (rank[id] != null) return rank[id];
      if (seen.has(id)) return 0;
      seen.add(id);
      const v = preds[id].length ? Math.max(...preds[id].map(p => r(p, seen) + 1)) : 0;
      rank[id] = v;
      return v;
    }
    ids.forEach(id => r(id, new Set()));

    // Pull control-only providers (controllers, IR extenders) to the far left, and pure sinks to the far right
    const maxRank = Math.max(0, ...ids.map(id => rank[id]));
    ids.forEach(id => { if (!keep[id].size && preds[id].length && rank[id] < maxRank && model.nodes[id].dev.category === 'Display') rank[id] = maxRank; });

    const cols = [];
    ids.forEach(id => { (cols[rank[id]] = cols[rank[id]] || []).push(id); });
    for (let i = 0; i < cols.length; i++) cols[i] = (cols[i] || []).sort((a, b) => natural(model.nodes[a].dev.name, model.nodes[b].dev.name));

    const order = {};
    const setOrder = () => cols.forEach(col => col.forEach((id, i) => { order[id] = i; }));
    setOrder();
    // Position of the neighbor's port, so blocks line up with the port that feeds them
    function anchors(id) {
      const pts = [];
      model.wires.forEach(w => {
        let other, port, list;
        if (w.from === id) { other = w.to; port = w.toPort; list = model.nodes[w.to] && model.nodes[w.to].inputs; }
        else if (w.to === id) { other = w.from; port = w.fromPort; list = model.nodes[w.from] && model.nodes[w.from].outputs; }
        else return;
        if (order[other] == null || !list) return;
        pts.push(order[other] + (list.indexOf(port) + 1) / (list.length + 1));
      });
      return pts;
    }
    for (let pass = 0; pass < 6; pass++) {
      cols.forEach(col => {
        const bc = {};
        col.forEach(id => {
          const pts = anchors(id);
          bc[id] = pts.length ? pts.reduce((s, v) => s + v, 0) / pts.length : order[id];
        });
        col.sort((a, b) => bc[a] - bc[b]);
        col.forEach((id, i) => { order[id] = i; });
      });
    }

    const pos = {};
    cols.forEach((col, ci) => {
      let y = 0;
      col.forEach(id => {
        pos[id] = { x: ci * (NODE_W + COL_GAP), y };
        y += model.nodes[id].h + ROW_GAP;
      });
    });
    // Center columns vertically against the tallest one
    const heights = cols.map(col => col.reduce((s, id) => s + model.nodes[id].h + ROW_GAP, -ROW_GAP));
    const tallest = Math.max(0, ...heights);
    cols.forEach((col, ci) => { const off = (tallest - heights[ci]) / 2; col.forEach(id => { pos[id].y += off; }); });

    // Blocks with no wires: a grid under the wired drawing, grouped by category then name
    if (loose.length) {
      loose.sort((a, b) => natural(model.nodes[a].dev.category, model.nodes[b].dev.category) || natural(model.nodes[a].dev.name, model.nodes[b].dev.name));
      const wideCols = Math.max(cols.length, 1);
      const perRow = Math.max(4, Math.min(8, wideCols * 2, Math.ceil(Math.sqrt(loose.length * 2))));
      let y = ids.length ? tallest + 90 : 0;
      for (let i = 0; i < loose.length; i += perRow) {
        const row = loose.slice(i, i + perRow);
        row.forEach((id, j) => { pos[id] = { x: j * (NODE_W + 40), y }; });
        y += Math.max(...row.map(id => model.nodes[id].h)) + ROW_GAP;
      }
    }
    return pos;
  }

  // ---------- mount ----------
  function mount(container, project, opts) {
    const key = opts.key;
    let saved = load(key) || {};
    saved.pos = saved.pos || {}; saved.custom = saved.custom || []; saved.hidden = saved.hidden || []; saved.blocks = saved.blocks || [];
    const show = { control: true, video: true, audio: true, network: true, other: true };
    let newType = 'hdmi';
    let model, pos, selected = null, focusNode = null;
    let view = { x: 40, y: 40, k: 1 };

    container.innerHTML = `
      <div class="sch-toolbar">
        <div class="chips" role="group" aria-label="Show wire types">
          ${GROUPS.map(([g, l]) => `<button class="chip sch-chip" data-group="${g}" aria-pressed="true"><span class="swatch g-${g}"></span>${l}</button>`).join('')}
        </div>
        <div class="sch-actions">
          <label class="newtype"><span>New wire</span><select id="sch-newtype">${WIRE_TYPES.map(t => `<option value="${t.id}"${t.id === 'hdmi' ? ' selected' : ''}>${t.label}</option>`).join('')}</select></label>
          <button class="btn btn-small" data-sch="fit">Fit</button>
          <button class="btn btn-small" data-sch="zoomin" aria-label="Zoom in">+</button>
          <button class="btn btn-small" data-sch="zoomout" aria-label="Zoom out">−</button>
          <button class="btn btn-small" data-sch="relayout">Auto-arrange</button>
          <button class="btn btn-small" data-sch="svg">Export SVG</button>
        </div>
      </div>
      <div class="sch-wrap">
        <div class="sch-stage" tabindex="0" aria-label="Schematic. Drag blocks to move them, drag the background to pan, scroll to zoom.">
          <svg class="sch-svg" xmlns="${NS}"><g class="sch-view"><g class="sch-wires"></g><g class="sch-nodes"></g><path class="sch-temp" d="" /></g></svg>
          <div class="sch-empty" hidden>
            <p><strong>Nothing drawn yet.</strong> This project has no AV or control wiring in Composer.</p>
            <p>Add devices from the list on the right, or add your own blocks (a network switch, a patch panel), then drag between them to draw wires.</p>
          </div>
          <div class="sch-hint">Drag a block to move it. Drag from a <b>●</b> handle on the right edge of a block to another block to add a wire.</div>
        </div>
        <aside class="sch-side">
          <div class="sch-inspector"></div>
          <div class="sch-tray"></div>
        </aside>
      </div>`;

    const stage = container.querySelector('.sch-stage');
    const svg = container.querySelector('.sch-svg');
    const gView = svg.querySelector('.sch-view');
    const gWires = svg.querySelector('.sch-wires');
    const gNodes = svg.querySelector('.sch-nodes');
    const temp = svg.querySelector('.sch-temp');
    const inspector = container.querySelector('.sch-inspector');
    const tray = container.querySelector('.sch-tray');
    const emptyMsg = container.querySelector('.sch-empty');

    function persist() { store(key, saved); }
    function applyView() { gView.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`); }

    function rebuild(relayout) {
      model = buildModel(project, saved);
      const auto = autoLayout(model);
      pos = {};
      Object.keys(model.nodes).forEach(id => { pos[id] = (!relayout && saved.pos[id]) ? Object.assign({}, saved.pos[id]) : auto[id]; });
      if (relayout) {
        // Keep unwired blocks the person added by hand; everything else is re-arranged
        const keepIds = Object.keys(saved.pos).filter(id => !model.wires.some(w => w.from === id || w.to === id));
        const kept = {}; keepIds.forEach(id => { kept[id] = saved.pos[id]; });
        saved.pos = kept; persist();
      }
      draw();
      drawTray();
    }

    function portY(id, side, port) {
      const n = model.nodes[id];
      const list = side === 'in' ? n.inputs : n.outputs;
      const i = Math.max(0, list.indexOf(port));
      return pos[id].y + HEAD_H + i * ROW_H + ROW_H / 2 + 2;
    }
    function wirePath(w) {
      const x1 = pos[w.from].x + NODE_W, y1 = portY(w.from, 'out', w.fromPort);
      const x2 = pos[w.to].x, y2 = portY(w.to, 'in', w.toPort);
      const dx = Math.max(60, Math.abs(x2 - x1) * 0.45);
      if (x2 < x1 + 20) {
        // Wire runs backwards: loop out and around
        return `M${x1},${y1} C${x1 + 90},${y1} ${x2 - 90},${y2} ${x2},${y2}`;
      }
      return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
    }
    function visible(w) { return show[TYPE_BY_ID[w.type] ? TYPE_BY_ID[w.type].group : 'other']; }

    function draw() {
      gWires.textContent = '';
      gNodes.textContent = '';
      model.wires.forEach(w => {
        if (!visible(w)) return;
        const related = !focusNode || w.from === focusNode || w.to === focusNode;
        const g = el('g', { class: `wire t-${w.type}${w.custom ? ' custom' : ''}${selected === w.id ? ' selected' : ''}${related ? '' : ' dim'}`, 'data-wire': w.id }, gWires);
        el('path', { d: wirePath(w), class: 'hit' }, g);
        el('path', { d: wirePath(w), class: 'line' }, g);
        const t = el('title', {}, g);
        t.textContent = `${model.devById[w.from].name} · ${w.fromPort} → ${model.devById[w.to].name} · ${w.toPort}${w.via ? ' (via ' + w.via + ')' : ''}`;
      });
      Object.values(model.nodes).forEach(n => {
        const p = pos[n.id];
        const d = n.dev;
        const dim = focusNode && focusNode !== n.id && !model.wires.some(w => (w.from === focusNode && w.to === n.id) || (w.to === focusNode && w.from === n.id));
        const g = el('g', { class: `node cat-${d.category.replace(/\W/g, '')}${focusNode === n.id ? ' focus' : ''}${dim ? ' dim' : ''}`, 'data-node': n.id, transform: `translate(${p.x},${p.y})` }, gNodes);
        el('rect', { class: 'body', width: NODE_W, height: n.h, rx: 6 }, g);
        el('rect', { class: 'head', width: NODE_W, height: HEAD_H, rx: 6 }, g);
        el('rect', { class: 'head-fix', y: HEAD_H - 6, width: NODE_W, height: 6 }, g);
        const title = el('text', { class: 'title', x: 10, y: 19 }, g); title.textContent = clip(d.name, d.control ? 23 : 29);
        const tt = el('title', {}, g); tt.textContent = d.name + (d.hardwareName ? ' (' + d.hardwareName + ')' : '');
        const sub = el('text', { class: 'sub', x: 10, y: 36 }, g); sub.textContent = clip([d.maker, d.model].filter(Boolean).join(' ') || d.category, 33);
        const ctrl = el('text', { class: 'ctrl', x: NODE_W - 10, y: 19, 'text-anchor': 'end' }, g); ctrl.textContent = d.control || '';
        n.inputs.forEach((port, i) => {
          const y = HEAD_H + i * ROW_H + ROW_H / 2 + 2;
          el('circle', { class: 'pin in', cx: 0, cy: y, r: 3.5 }, g);
          const t = el('text', { class: 'port', x: 9, y: y + 4 }, g); t.textContent = clip(port, 16);
        });
        n.outputs.forEach((port, i) => {
          const y = HEAD_H + i * ROW_H + ROW_H / 2 + 2;
          el('circle', { class: 'pin out', cx: NODE_W, cy: y, r: 3.5 }, g);
          const t = el('text', { class: 'port', x: NODE_W - 9, y: y + 4, 'text-anchor': 'end' }, g); t.textContent = clip(port, 16);
        });
        el('circle', { class: 'handle', cx: NODE_W, cy: HEAD_H / 2, r: 7, 'data-handle': n.id }, g);
        const ht = el('title', {}, g.lastChild); ht.textContent = 'Drag to another block to add a wire';
      });
      drawInspector();
    }

    function drawTray() {
      const off = allDevices(project, saved).filter(d => !model.nodes[d.id]);
      emptyMsg.hidden = Object.keys(model.nodes).length > 0;
      tray.innerHTML = `
        <div class="eyebrow">Add a block</div>
        <label class="field"><span>Name</span><input id="sch-bname" placeholder="Network switch" maxlength="40"></label>
        <label class="field"><span>Make and model (optional)</span><input id="sch-bmodel" placeholder="Araknis AN-310" maxlength="50"></label>
        <div class="sch-row"><button class="btn btn-small" data-sch="addblock">Add block</button></div>
        ${off.length ? `
        <div class="tray-head"><span class="eyebrow">Not on the schematic <span class="count">${off.length}</span></span><button class="btn btn-small" data-sch="addall">Add all</button></div>
        <ul class="tray-list">${off.map(d => `<li><span><b>${esc(d.name)}</b><span class="dsub">${esc([d.maker, d.model].filter(Boolean).join(' ') || (d.custom ? 'Your block' : ''))}</span></span><button class="btn btn-small" data-add="${esc(d.id)}">Add</button></li>`).join('')}</ul>` : ''}`;
    }

    function drawInspector() {
      const w = selected && model.wires.find(x => x.id === selected);
      if (!w) {
        const n = focusNode && model.nodes[focusNode];
        if (n) {
          const count = model.wires.filter(x => x.from === n.id || x.to === n.id).length;
          inspector.innerHTML = `<div class="eyebrow">Block</div><div class="dname">${esc(n.dev.name)}</div><div class="dsub">${esc([n.dev.maker, n.dev.model].filter(Boolean).join(' '))}</div>
            <p class="section-note">${count} wire${count === 1 ? '' : 's'}. Other blocks are faded so you can trace this one.</p>
            <div class="sch-row"><button class="btn btn-small" data-sch="clearfocus">Show all</button><button class="btn btn-small" data-hide="${esc(n.id)}">${n.dev.custom ? 'Delete block' : 'Remove from schematic'}</button></div>`;
          return;
        }
        inspector.innerHTML = `<div class="eyebrow">Wires</div>
          <p class="section-note">${model.wires.length} wires from the project${saved.custom.length ? `, ${saved.custom.length} added by you` : ''}. Click a wire to see it, click a block to trace it.</p>
          <p class="section-note">To add a wire, pick its type under New wire, then drag from a block's <b class="accent-dot">●</b> handle to another block.</p>`;
        return;
      }
      const from = model.devById[w.from], to = model.devById[w.to];
      if (!w.custom) {
        inspector.innerHTML = `<div class="eyebrow">Wire from the project</div>
          <div class="wire-detail"><span class="swatch t-${w.type}"></span>${esc(TYPE_BY_ID[w.type].label)}</div>
          <div class="dname">${esc(from.name)}</div><div class="dsub mono">${esc(w.fromPort)}</div>
          <div class="arrow-down" aria-hidden="true">↓</div>
          <div class="dname">${esc(to.name)}</div><div class="dsub mono">${esc(w.toPort)}</div>
          ${w.via ? `<p class="section-note">Routed in Composer via ${esc(w.via)}.</p>` : ''}
          <p class="section-note">Change project wiring in Composer. Wires you add here are for documentation only.</p>`;
        return;
      }
      inspector.innerHTML = `<div class="eyebrow">Wire you added</div>
        <div class="dname">${esc(from.name)} → ${esc(to.name)}</div>
        <label class="field"><span>From port</span><input id="sch-fp" value="${esc(w.fromPort)}"></label>
        <label class="field"><span>To port</span><input id="sch-tp" value="${esc(w.toPort)}"></label>
        <label class="field"><span>Type</span><select id="sch-type">${WIRE_TYPES.map(t => `<option value="${t.id}"${t.id === w.type ? ' selected' : ''}>${t.label}</option>`).join('')}</select></label>
        <div class="sch-row"><button class="btn btn-small" data-sch="delwire">Delete wire</button></div>`;
    }

    function fit() {
      const ids = Object.keys(pos);
      const r = stage.getBoundingClientRect();
      if (!ids.length || !r.width) { view = { x: 40, y: 40, k: 1 }; applyView(); return; }
      const minX = Math.min(...ids.map(id => pos[id].x)), minY = Math.min(...ids.map(id => pos[id].y));
      const maxX = Math.max(...ids.map(id => pos[id].x + NODE_W)), maxY = Math.max(...ids.map(id => pos[id].y + model.nodes[id].h));
      const pad = 40;
      const k = Math.min(1.25, (r.width - pad * 2) / (maxX - minX || 1), (r.height - pad * 2) / (maxY - minY || 1));
      view.k = Math.max(0.2, k);
      view.x = (r.width - (maxX - minX) * view.k) / 2 - minX * view.k;
      view.y = (r.height - (maxY - minY) * view.k) / 2 - minY * view.k;
      applyView();
    }
    function zoomAt(f, cx, cy) {
      const k = Math.min(3, Math.max(0.15, view.k * f));
      view.x = cx - (cx - view.x) * (k / view.k);
      view.y = cy - (cy - view.y) * (k / view.k);
      view.k = k;
      applyView();
    }
    function toWorld(e) {
      const r = svg.getBoundingClientRect();
      return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k };
    }

    // ---------- pointer handling ----------
    let drag = null;
    svg.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const handle = e.target.closest('[data-handle]');
      const node = e.target.closest('[data-node]');
      const wire = e.target.closest('[data-wire]');
      if (handle) {
        drag = { mode: 'link', from: handle.getAttribute('data-handle') };
      } else if (node) {
        const id = node.getAttribute('data-node');
        const w = toWorld(e);
        drag = { mode: 'node', id, dx: w.x - pos[id].x, dy: w.y - pos[id].y, moved: false };
      } else if (wire) {
        selected = wire.getAttribute('data-wire'); focusNode = null; draw(); return;
      } else {
        drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
      }
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    svg.addEventListener('pointermove', e => {
      if (!drag) return;
      if (drag.mode === 'pan') {
        view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy;
        if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 3) drag.moved = true;
        applyView();
      } else if (drag.mode === 'node') {
        const w = toWorld(e);
        const nx = Math.round((w.x - drag.dx) / 10) * 10, ny = Math.round((w.y - drag.dy) / 10) * 10;
        if (nx !== pos[drag.id].x || ny !== pos[drag.id].y) {
          pos[drag.id] = { x: nx, y: ny }; drag.moved = true;
          const g = gNodes.querySelector(`[data-node="${CSS.escape(drag.id)}"]`);
          if (g) g.setAttribute('transform', `translate(${nx},${ny})`);
          gWires.querySelectorAll('[data-wire]').forEach(gw => {
            const w2 = model.wires.find(x => x.id === gw.getAttribute('data-wire'));
            if (w2 && (w2.from === drag.id || w2.to === drag.id)) gw.querySelectorAll('path').forEach(p => p.setAttribute('d', wirePath(w2)));
          });
        }
      } else if (drag.mode === 'link') {
        const w = toWorld(e);
        const x1 = pos[drag.from].x + NODE_W, y1 = pos[drag.from].y + HEAD_H / 2;
        temp.setAttribute('d', `M${x1},${y1} C${x1 + 80},${y1} ${w.x - 80},${w.y} ${w.x},${w.y}`);
        temp.setAttribute('class', 'sch-temp t-' + newType);
      }
    });
    function endDrag(e) {
      if (!drag) return;
      const d = drag; drag = null;
      if (d.mode === 'node') {
        if (d.moved) { saved.pos[d.id] = pos[d.id]; Object.keys(pos).forEach(id => { saved.pos[id] = pos[id]; }); persist(); }
        else { focusNode = focusNode === d.id ? null : d.id; selected = null; draw(); }
      } else if (d.mode === 'pan') {
        if (!d.moved && (selected || focusNode)) { selected = null; focusNode = null; draw(); }
      } else if (d.mode === 'link') {
        temp.setAttribute('d', '');
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const tn = target && target.closest && target.closest('[data-node]');
        const to = tn && tn.getAttribute('data-node');
        if (to && to !== d.from) {
          Object.keys(pos).forEach(id => { saved.pos[id] = pos[id]; });
          const id = 'c' + Date.now().toString(36);
          const fromN = model.nodes[d.from], toN = model.nodes[to];
          saved.custom.push({ id, from: d.from, to, type: newType, fromPort: TYPE_BY_ID[newType].label.split(' ')[0] + ' out ' + (fromN.outputs.length + 1), toPort: TYPE_BY_ID[newType].label.split(' ')[0] + ' in ' + (toN.inputs.length + 1) });
          persist();
          selected = id; focusNode = null;
          rebuild(false);
          opts.toast && opts.toast('Wire added. Rename its ports on the right.');
        }
      }
    }
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    stage.addEventListener('wheel', e => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    stage.addEventListener('keydown', e => {
      const step = 60;
      if (e.key === 'ArrowLeft') view.x += step; else if (e.key === 'ArrowRight') view.x -= step;
      else if (e.key === 'ArrowUp') view.y += step; else if (e.key === 'ArrowDown') view.y -= step;
      else if (e.key === '+' || e.key === '=') { const r = svg.getBoundingClientRect(); zoomAt(1.2, r.width / 2, r.height / 2); return; }
      else if (e.key === '-') { const r = svg.getBoundingClientRect(); zoomAt(1 / 1.2, r.width / 2, r.height / 2); return; }
      else return;
      e.preventDefault(); applyView();
    });

    // ---------- controls ----------
    container.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.group) {
        show[b.dataset.group] = !show[b.dataset.group];
        b.setAttribute('aria-pressed', show[b.dataset.group]);
        draw(); return;
      }
      if (b.dataset.add) {
        const r = stage.getBoundingClientRect();
        const c = { x: (r.width / 2 - view.x) / view.k - NODE_W / 2, y: (r.height / 2 - view.y) / view.k - 40 };
        saved.hidden = saved.hidden.filter(id => id !== b.dataset.add);
        Object.keys(pos).forEach(id => { saved.pos[id] = pos[id]; });
        saved.pos[b.dataset.add] = { x: Math.round(c.x / 10) * 10, y: Math.round(c.y / 10) * 10 };
        persist(); focusNode = b.dataset.add; rebuild(false); return;
      }
      if (b.dataset.hide) {
        const id = b.dataset.hide;
        delete saved.pos[id];
        saved.custom = saved.custom.filter(w => w.from !== id && w.to !== id);
        saved.blocks = saved.blocks.filter(b => b.id !== id);
        if (project.connections.some(c => c.from.id === id || c.to.id === id)) saved.hidden.push(id);
        focusNode = null; persist(); rebuild(false); return;
      }
      const a = b.dataset.sch;
      const r = svg.getBoundingClientRect();
      if (a === 'fit') fit();
      if (a === 'zoomin') zoomAt(1.2, r.width / 2, r.height / 2);
      if (a === 'zoomout') zoomAt(1 / 1.2, r.width / 2, r.height / 2);
      if (a === 'relayout') { saved.hidden = []; rebuild(true); fit(); opts.toast && opts.toast('Arranged by signal flow'); }
      if (a === 'clearfocus') { focusNode = null; draw(); }
      if (a === 'addblock') {
        const name = container.querySelector('#sch-bname').value.trim();
        if (!name) { container.querySelector('#sch-bname').focus(); opts.toast && opts.toast('Give the block a name first'); return; }
        const id = 'b' + Date.now().toString(36);
        saved.blocks.push({ id, name, maker: '', model: container.querySelector('#sch-bmodel').value.trim() });
        Object.keys(pos).forEach(nid => { saved.pos[nid] = pos[nid]; });
        const c = { x: (r.width / 2 - view.x) / view.k - NODE_W / 2, y: (r.height / 2 - view.y) / view.k - 40 };
        saved.pos[id] = { x: Math.round(c.x / 10) * 10, y: Math.round(c.y / 10) * 10 };
        persist(); focusNode = id; rebuild(false);
        opts.toast && opts.toast('Block added. Drag its handle to another block to wire it.');
      }
      if (a === 'addall') {
        const off = allDevices(project, saved).filter(d => !model.nodes[d.id]);
        Object.keys(pos).forEach(nid => { saved.pos[nid] = pos[nid]; });
        const ids = Object.keys(pos);
        const baseY = ids.length ? Math.max(...ids.map(i => pos[i].y + model.nodes[i].h)) + 60 : 0;
        const perRow = Math.max(3, Math.ceil(Math.sqrt(off.length * 1.6)));
        off.forEach((d, i) => { saved.pos[d.id] = { x: (i % perRow) * (NODE_W + 40), y: baseY + Math.floor(i / perRow) * (HEAD_H + ROW_H + 50) }; });
        saved.hidden = [];
        persist(); rebuild(false); fit();
      }
      if (a === 'delwire') { saved.custom = saved.custom.filter(w => w.id !== selected); selected = null; persist(); rebuild(false); }
      if (a === 'svg') opts.save(opts.fileBase + '_schematic.svg', exportSvg(), 'image/svg+xml');
    });
    container.addEventListener('keydown', e => {
      if ((e.target.id === 'sch-bname' || e.target.id === 'sch-bmodel') && e.key === 'Enter') { e.preventDefault(); container.querySelector('[data-sch="addblock"]').click(); }
    });
    container.addEventListener('change', e => {
      if (e.target.id === 'sch-newtype') { newType = e.target.value; return; }
      const w = saved.custom.find(x => x.id === selected);
      if (!w) return;
      if (e.target.id === 'sch-type') w.type = e.target.value;
      else if (e.target.id === 'sch-fp') w.fromPort = e.target.value.trim() || w.fromPort;
      else if (e.target.id === 'sch-tp') w.toPort = e.target.value.trim() || w.toPort;
      else return;
      persist(); rebuild(false);
    });

    // ---------- export ----------
    function exportSvg() {
      const ids = Object.keys(pos);
      const minX = Math.min(...ids.map(id => pos[id].x)) - 30, minY = Math.min(...ids.map(id => pos[id].y)) - 70;
      const maxX = Math.max(...ids.map(id => pos[id].x + NODE_W)) + 30, maxY = Math.max(...ids.map(id => pos[id].y + model.nodes[id].h)) + 30;
      const cs = getComputedStyle(container);
      const v = n => cs.getPropertyValue(n).trim();
      const clone = gView.cloneNode(true);
      clone.removeAttribute('transform');
      clone.querySelectorAll('.sch-temp, .handle, .hit, title').forEach(n => n.remove());
      clone.querySelectorAll('.dim').forEach(n => n.classList.remove('dim'));
      const style = `
        text{font-family:${v('--font-body') || 'sans-serif'}}
        .body{fill:${v('--surface')};stroke:${v('--line')};stroke-width:1}
        .head,.head-fix{fill:${v('--surface-2')}}
        .title{font-weight:600;font-size:13px;fill:${v('--ink')}}
        .sub{font-size:11px;fill:${v('--ink-3')}}
        .ctrl{font-size:10px;font-weight:600;fill:${v('--ink-3')}}
        .port{font-size:11px;fill:${v('--ink-2')};font-family:${v('--font-mono') || 'monospace'}}
        .pin{fill:${v('--ink-3')}}
        .line{fill:none;stroke-width:2}
        .custom .line{stroke-dasharray:6 4}
        ${WIRE_TYPES.map(t => `.t-${t.id} .line{stroke:${v('--w-' + t.id)}}`).join('')}
        .legend-text{font-size:12px;fill:${v('--ink-2')}}
        .heading{font-size:18px;font-weight:700;fill:${v('--ink')}}`;
      const used = WIRE_TYPES.filter(t => model.wires.some(w => w.type === t.id));
      const legend = used.map((t, i) => `<g transform="translate(${minX + 20 + i * 120},${minY + 48})"><line x1="0" y1="-4" x2="24" y2="-4" stroke="${v('--w-' + t.id)}" stroke-width="3"/><text class="legend-text" x="30" y="0">${esc(t.label)}</text></g>`).join('');
      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="${NS}" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${maxX - minX}" height="${maxY - minY}">
<style>${style}</style>
<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="${v('--bg')}"/>
<text class="heading" x="${minX + 20}" y="${minY + 26}">${esc(project.project.name)} · AV and control schematic</text>
${legend}
${clone.innerHTML}
</svg>`;
    }

    rebuild(false);
    requestAnimationFrame(fit);
  }

  window.C4Schematic = { mount };
})();
