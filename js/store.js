/* Notas de L — store global con persistencia en localStorage.
 * Modelo inspirado en AppFlowy: páginas (ViewLayout Document / Database) con bloques planos
 * (type + indent) y bases de datos con propiedades tipadas, filas-página y vistas. */
(function () {
  const NC = window.NC;
  const KEY = 'notioncito:v1';

  let state;
  let version = 0;
  const listeners = new Set();
  let saveTimer = null;

  const now = () => Date.now();
  const blk = (type, html = '', extra = {}) => ({ id: NC.uid(), type, html, indent: 0, ...extra });

  /* ---------- Persistencia ---------- */
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...state, ui: { current: state.ui.current } }));
    } catch (e) {
      NC.toast('No se pudo guardar: almacenamiento lleno (¿imágenes muy grandes?)');
    }
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 250);
  }
  window.addEventListener('beforeunload', () => {
    clearTimeout(saveTimer);
    save();
  });

  function sanitizeState(s) {
    Object.values(s.pages).forEach((p) => {
      NC.walkBlocks(p.blocks || [], (b) => {
        b.html = NC.sanitize(b.html || '');
        if (b.url && !/^(https?:|asset:[a-z0-9]+$|data:(image|application|audio|video)\/|data:text\/plain)/i.test(b.url)) b.url = '';
        if (Array.isArray(b.rows)) b.rows = b.rows.map((row) => (Array.isArray(row) ? row.map((c) => NC.sanitize(String(c || ''))) : []));
      });
      if (p.cover && !NC.coverStyle(p.cover)) p.cover = null;
    });
    return s;
  }

  function normalize(s) {
    s.pages = s.pages || {};
    s.rootIds = s.rootIds || [];
    s.settings = { theme: 'system', sidebarWidth: 260, sidebarCollapsed: false, ...(s.settings || {}) };
    s.ui = { current: s.ui && s.ui.current, peek: null, search: false, trash: false, settings: false };
    return s;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return normalize(sanitizeState(JSON.parse(raw)));
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  /* ---------- Suscripción React ---------- */
  function emit(persist = true) {
    version++;
    listeners.forEach((l) => l());
    if (persist) scheduleSave();
  }
  const subscribe = (l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  NC.useStore = () => {
    React.useSyncExternalStore(subscribe, () => version);
    return state;
  };
  NC.getState = () => state;
  NC.subscribe = subscribe;
  NC.sanitizePage = (p) => {
    sanitizeState({ pages: { [p.id || 'x']: p } });
    p.children = Array.isArray(p.children) ? p.children : [];
    p.blocks = Array.isArray(p.blocks) ? p.blocks : [];
    return p;
  };

  /* ---------- Páginas ---------- */
  function newPage({ parentId = null, type = 'doc', title = '', icon = null, rowOf = null } = {}) {
    const p = {
      id: NC.uid(), type, title, icon, cover: null, parentId, rowOf,
      children: [], blocks: type === 'doc' ? [blk('paragraph')] : [],
      favorite: false, trashed: false, createdAt: now(), updatedAt: now(),
      fullWidth: false, font: 'default', expanded: false,
    };
    if (rowOf) p.values = {};
    if (type === 'database') p.db = newDb();
    return p;
  }

  function newDb(layout = 'table') {
    const status = {
      id: NC.uid(), name: 'Estado', type: 'select', width: 160,
      options: [
        { id: NC.uid(), name: 'Por hacer', color: 'red' },
        { id: NC.uid(), name: 'En progreso', color: 'yellow' },
        { id: NC.uid(), name: 'Hecho', color: 'green' },
      ],
    };
    const date = { id: NC.uid(), name: 'Fecha', type: 'date', width: 160, options: [] };
    const views = [{ id: NC.uid(), name: 'Tabla', type: 'table', filter: '', sort: null }];
    if (layout !== 'table') views.unshift({ id: NC.uid(), name: VIEW_NAMES[layout], type: layout, filter: '', sort: null });
    return { titleName: 'Nombre', titleWidth: 260, props: [status, date], rows: [], views, viewId: views[0].id };
  }
  const VIEW_NAMES = { table: 'Tabla', board: 'Tablero', calendar: 'Calendario', gallery: 'Galería' };
  NC.VIEW_NAMES = VIEW_NAMES;

  const A = (NC.actions = {});

  A.createPage = ({ parentId = null, type = 'doc', layout = 'table', title = '', icon = null, index = null } = {}) => {
    const p = newPage({ parentId, type, title, icon });
    if (type === 'database') p.db = newDb(layout);
    state.pages[p.id] = p;
    const list = parentId ? state.pages[parentId].children : state.rootIds;
    if (index == null) list.push(p.id);
    else list.splice(index, 0, p.id);
    if (parentId) state.pages[parentId].expanded = true;
    emit();
    return p.id;
  };

  A.updatePage = (id, patch, persist = true) => {
    const p = state.pages[id];
    if (!p) return;
    Object.assign(p, patch, { updatedAt: now() });
    emit(persist);
  };

  const descendants = (id, acc = []) => {
    const p = state.pages[id];
    if (!p) return acc;
    acc.push(id);
    p.children.forEach((c) => descendants(c, acc));
    if (p.db) p.db.rows.forEach((r) => acc.push(r));
    return acc;
  };

  A.trashPage = (id) => {
    const p = state.pages[id];
    if (!p) return;
    p.trashed = true;
    p.trashedAt = now();
    if (state.ui.current && descendants(id).includes(state.ui.current)) {
      const fallback = p.rowOf || p.parentId || state.rootIds.find((r) => r !== id && !state.pages[r].trashed) || null;
      NC.navigate(fallback);
    }
    if (state.ui.peek === id) state.ui.peek = null;
    emit();
    NC.toast('Movido a la papelera');
  };

  A.restorePage = (id) => {
    const p = state.pages[id];
    if (!p) return;
    p.trashed = false;
    const parent = p.parentId && state.pages[p.parentId];
    if (p.parentId && (!parent || parent.trashed)) {
      if (parent) parent.children = parent.children.filter((c) => c !== id);
      p.parentId = null;
      state.rootIds.push(id);
    }
    emit();
  };

  A.deleteForever = (id) => {
    const p = state.pages[id];
    if (!p) return;
    if (p.rowOf && state.pages[p.rowOf]) {
      const db = state.pages[p.rowOf].db;
      db.rows = db.rows.filter((r) => r !== id);
    } else if (p.parentId && state.pages[p.parentId]) {
      const par = state.pages[p.parentId];
      par.children = par.children.filter((c) => c !== id);
    } else state.rootIds = state.rootIds.filter((r) => r !== id);
    descendants(id).forEach((d) => delete state.pages[d]);
    emit();
  };

  A.emptyTrash = () => {
    Object.values(state.pages)
      .filter((p) => p.trashed)
      .forEach((p) => state.pages[p.id] && A.deleteForever(p.id));
  };

  A.isInTrash = (id) => {
    let p = state.pages[id];
    while (p) {
      if (p.trashed) return true;
      p = state.pages[p.rowOf || p.parentId];
    }
    return false;
  };

  A.movePage = (id, targetParentId, index) => {
    const p = state.pages[id];
    if (!p || p.rowOf) return;
    // evitar mover dentro de sí misma
    let cur = targetParentId;
    while (cur) {
      if (cur === id) return;
      cur = state.pages[cur] && state.pages[cur].parentId;
    }
    const from = p.parentId ? state.pages[p.parentId].children : state.rootIds;
    const oldIdx = from.indexOf(id);
    from.splice(oldIdx, 1);
    const to = targetParentId ? state.pages[targetParentId].children : state.rootIds;
    if (from === to && oldIdx < index) index--;
    to.splice(Math.max(0, Math.min(index, to.length)), 0, id);
    p.parentId = targetParentId;
    if (targetParentId) state.pages[targetParentId].expanded = true;
    emit();
  };

  const clonePage = (id, parentId, rowOf) => {
    const src = state.pages[id];
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = NC.uid();
    copy.parentId = parentId;
    copy.rowOf = rowOf;
    copy.createdAt = copy.updatedAt = now();
    copy.favorite = false;
    copy.blocks.forEach((b) => (b.id = NC.uid()));
    state.pages[copy.id] = copy;
    copy.children = src.children.filter((c) => !state.pages[c].trashed).map((c) => clonePage(c, copy.id, null));
    if (copy.db) copy.db.rows = src.db.rows.filter((r) => !state.pages[r].trashed).map((r) => clonePage(r, null, copy.id));
    return copy.id;
  };

  A.duplicatePage = (id) => {
    const p = state.pages[id];
    const cid = clonePage(id, p.parentId, p.rowOf);
    state.pages[cid].title = (p.title || 'Sin título') + ' (copia)';
    if (p.rowOf) {
      const rows = state.pages[p.rowOf].db.rows;
      rows.splice(rows.indexOf(id) + 1, 0, cid);
    } else {
      const list = p.parentId ? state.pages[p.parentId].children : state.rootIds;
      list.splice(list.indexOf(id) + 1, 0, cid);
    }
    emit();
    return cid;
  };

  A.importMarkdown = (title, text, parentId = null) => {
    const id = A.createPage({ parentId, title });
    const blocks = NC.markdownToBlocks(text);
    if (blocks[0] && blocks[0].type === 'h1') {
      state.pages[id].title = NC.htmlToText(blocks.shift().html);
    }
    state.pages[id].blocks = blocks.length ? blocks : [blk('paragraph')];
    emit();
    return id;
  };

  /* ---------- Bloques ----------
   * Los bloques son una lista plana con sangría. Los bloques contenedor ("columns", "tabs")
   * tienen cells: [{ id, title?, width?, blocks: [...] }] y cada celda tiene al menos un bloque. */
  const CONTAINERS = ['columns', 'tabs', 'synced'];
  NC.CONTAINERS = CONTAINERS;

  // Recorre todos los bloques (incluidos los anidados)
  NC.walkBlocks = (blocks, fn, parent = null) => {
    (blocks || []).forEach((b) => {
      fn(b, parent);
      (b.cells || []).forEach((c) => NC.walkBlocks(c.blocks, fn, { block: b, cell: c }));
    });
  };
  NC.allBlocks = (page) => {
    const out = [];
    NC.walkBlocks(page && page.blocks, (b) => out.push(b));
    return out;
  };

  // Localiza un bloque: { arr, index, block, cell, owner, ownerArr }
  const locateIn = (arr, id, cell = null, owner = null, ownerArr = null) => {
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      if (b.id === id) return { arr, index: i, block: b, cell, owner, ownerArr };
      for (const c of b.cells || []) {
        const r = locateIn(c.blocks, id, c, b, arr);
        if (r) return r;
      }
    }
    return null;
  };
  const locate = (pageId, blockId) => {
    const p = state.pages[pageId];
    return p ? locateIn(p.blocks, blockId) : null;
  };
  NC.locateBlock = locate;

  const touch = (pageId) => {
    if (state.pages[pageId]) state.pages[pageId].updatedAt = now();
  };

  A.updateBlock = (pageId, blockId, patch, persist = true) => {
    const r = locate(pageId, blockId);
    if (!r) return;
    Object.assign(r.block, patch);
    touch(pageId);
    emit(persist);
  };

  A.insertBlocks = (pageId, afterId, blocks) => {
    const p = state.pages[pageId];
    if (afterId == null) p.blocks.splice(0, 0, ...blocks);
    else {
      const r = locate(pageId, afterId);
      if (!r) p.blocks.push(...blocks);
      else r.arr.splice(r.index + 1, 0, ...blocks);
    }
    touch(pageId);
    emit();
    return blocks[0] && blocks[0].id;
  };

  A.insertBlock = (pageId, afterId, type = 'paragraph', extra = {}) => {
    const b = blk(type, '', extra);
    A.insertBlocks(pageId, afterId, [b]);
    return b.id;
  };

  // Tras sacar bloques de una celda: elimina columnas vacías y deshace columnas de una sola celda
  const cleanupContainer = (r) => {
    if (!r.cell || r.arr.length) return;
    const owner = r.owner;
    if (owner.type === 'columns') {
      owner.cells = owner.cells.filter((c) => c.blocks.length);
      if (owner.cells.length === 1) {
        const i = r.ownerArr.indexOf(owner);
        r.ownerArr.splice(i, 1, ...owner.cells[0].blocks);
      } else if (!owner.cells.length) r.ownerArr.splice(r.ownerArr.indexOf(owner), 1);
    } else r.arr.push(blk('paragraph'));
  };

  A.removeBlock = (pageId, blockId) => {
    const p = state.pages[pageId];
    const r = locate(pageId, blockId);
    if (!r) return;
    r.arr.splice(r.index, 1);
    if (r.cell && !r.arr.length) r.arr.push(blk('paragraph'));
    if (!p.blocks.length) p.blocks.push(blk('paragraph'));
    touch(pageId);
    emit();
  };

  A.removeBlocks = (pageId, ids) => {
    ids.forEach((id) => {
      const r = locate(pageId, id);
      if (r) r.arr.splice(r.index, 1), r.cell && !r.arr.length && r.arr.push(blk('paragraph'));
    });
    const p = state.pages[pageId];
    if (!p.blocks.length) p.blocks.push(blk('paragraph'));
    touch(pageId);
    emit();
  };

  const cloneBlock = (b) => {
    const c = JSON.parse(JSON.stringify(b));
    NC.walkBlocks([c], (x) => (x.id = NC.uid()));
    (c.cells || []).forEach((cell) => (cell.id = NC.uid()));
    NC.walkBlocks([c], (x) => (x.cells || []).forEach((cell) => (cell.id = NC.uid())));
    return c;
  };
  NC.cloneBlock = cloneBlock;

  A.duplicateBlock = (pageId, blockId) => {
    const r = locate(pageId, blockId);
    if (!r) return null;
    const copy = cloneBlock(r.block);
    r.arr.splice(r.index + 1, 0, copy);
    touch(pageId);
    emit();
    return copy.id;
  };

  // Rango de un bloque + sus "hijos" (bloques siguientes con mayor sangría)
  const subtreeRange = (blocks, i) => {
    let j = i + 1;
    while (j < blocks.length && blocks[j].indent > blocks[i].indent) j++;
    return [i, j];
  };
  NC.subtreeRange = subtreeRange;

  const takeSubtree = (pageId, blockId, targetId) => {
    const r = locate(pageId, blockId);
    if (!r || blockId === targetId) return null;
    const [s, e] = subtreeRange(r.arr, r.index);
    const moving = r.arr.slice(s, e);
    // no se puede mover un bloque dentro de sí mismo
    let inside = false;
    NC.walkBlocks(moving, (x) => { if (x.id === targetId) inside = true; });
    if (inside) return null;
    r.arr.splice(s, e - s);
    cleanupContainer(r);
    return moving;
  };

  A.moveBlock = (pageId, blockId, targetId, position) => {
    const moving = takeSubtree(pageId, blockId, targetId);
    if (!moving) return;
    const t = locate(pageId, targetId);
    let ti = t.index;
    if (position === 'after') ti = subtreeRange(t.arr, ti)[1];
    const delta = t.block.indent - moving[0].indent;
    moving.forEach((b) => (b.indent = Math.max(0, b.indent + delta)));
    t.arr.splice(ti, 0, ...moving);
    touch(pageId);
    emit();
  };

  // Soltar un bloque a la izquierda/derecha de otro crea (o amplía) columnas, como en Notion
  A.dropBeside = (pageId, blockId, targetId, side) => {
    const moving = takeSubtree(pageId, blockId, targetId);
    if (!moving) return;
    moving.forEach((b, i) => (b.indent = i === 0 ? 0 : Math.max(1, b.indent - moving[0].indent)));
    const t = locate(pageId, targetId);
    const newCell = { id: NC.uid(), blocks: moving, width: 1 };
    if (t.owner && t.owner.type === 'columns') {
      const ci = t.owner.cells.indexOf(t.cell);
      t.owner.cells.splice(side === 'left' ? ci : ci + 1, 0, newCell);
      t.owner.cells.forEach((c) => (c.width = 1));
    } else {
      const [s, e] = subtreeRange(t.arr, t.index);
      const targetBlocks = t.arr.slice(s, e);
      const base = targetBlocks[0].indent;
      targetBlocks.forEach((b) => (b.indent -= base));
      const cols = blk('columns', '', { indent: base, cells: [] });
      const oldCell = { id: NC.uid(), blocks: targetBlocks, width: 1 };
      cols.cells = side === 'left' ? [newCell, oldCell] : [oldCell, newCell];
      t.arr.splice(s, e - s, cols);
    }
    touch(pageId);
    emit();
  };

  A.shiftBlock = (pageId, blockId, dir) => {
    const r = locate(pageId, blockId);
    if (!r) return;
    const arr = r.arr;
    const [s, e] = subtreeRange(arr, r.index);
    if (dir < 0) {
      let k = s - 1;
      while (k > 0 && arr[k].indent > arr[s].indent) k--;
      if (k < 0) return;
      A.moveBlock(pageId, blockId, arr[k].id, 'before');
    } else {
      if (e >= arr.length) return;
      A.moveBlock(pageId, blockId, arr[e].id, 'after');
    }
  };

  // Crea un bloque contenedor con N celdas
  NC.newContainer = (type, n, extra = {}) =>
    blk(type, '', {
      cells: Array.from({ length: n }, (_, i) => ({ id: NC.uid(), title: type === 'tabs' ? `Pestaña ${i + 1}` : undefined, width: 1, blocks: [blk('paragraph')] })),
      active: 0,
      ...extra,
    });
  NC.newBlock = blk;

  /* ---------- Base de datos ---------- */
  const dbOf = (dbId) => state.pages[dbId].db;

  A.addRow = (dbId, values = {}, index = null, title = '') => {
    const row = newPage({ rowOf: dbId, title });
    row.blocks = [blk('paragraph')];
    row.values = { ...values };
    state.pages[row.id] = row;
    const rows = dbOf(dbId).rows;
    if (index == null) rows.push(row.id);
    else rows.splice(index, 0, row.id);
    emit();
    return row.id;
  };

  A.moveRow = (dbId, rowId, beforeRowId) => {
    const rows = dbOf(dbId).rows;
    rows.splice(rows.indexOf(rowId), 1);
    const i = beforeRowId ? rows.indexOf(beforeRowId) : -1;
    rows.splice(i < 0 ? rows.length : i, 0, rowId);
    emit();
  };

  A.setValue = (rowId, propId, value) => {
    const r = state.pages[rowId];
    r.values = { ...(r.values || {}), [propId]: value };
    r.updatedAt = now();
    emit();
  };

  A.addProp = (dbId, type = 'text', name) => {
    const db = dbOf(dbId);
    const labels = { text: 'Texto', number: 'Número', select: 'Selección', multi: 'Etiquetas', date: 'Fecha', checkbox: 'Casilla', url: 'URL', created: 'Creado' };
    const prop = { id: NC.uid(), name: name || labels[type] || 'Propiedad', type, width: 160, options: [] };
    db.props.push(prop);
    emit();
    return prop.id;
  };

  A.updateProp = (dbId, propId, patch) => {
    const prop = dbOf(dbId).props.find((p) => p.id === propId);
    if (!prop) return;
    if (patch.type && patch.type !== prop.type) convertValues(dbId, prop, patch.type);
    Object.assign(prop, patch);
    emit();
  };

  function convertValues(dbId, prop, toType) {
    const db = dbOf(dbId);
    const nameOf = (id) => (prop.options.find((o) => o.id === id) || {}).name || '';
    db.rows.forEach((rid) => {
      const r = state.pages[rid];
      if (!r || !r.values) return;
      let v = r.values[prop.id];
      if (v == null) return;
      // a texto plano primero
      let text = Array.isArray(v) ? v.map(nameOf).join(', ') : prop.type === 'select' ? nameOf(v) : String(v);
      if (prop.type === 'checkbox') text = v ? 'Sí' : '';
      let out = null;
      if (['text', 'url'].includes(toType)) out = text;
      else if (toType === 'number') out = isNaN(parseFloat(text)) ? null : parseFloat(text);
      else if (toType === 'checkbox') out = !!text && text !== 'false';
      else if (toType === 'date') out = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
      else if (toType === 'select' || toType === 'multi') {
        const names = text.split(',').map((s) => s.trim()).filter(Boolean);
        const ids = names.map((n) => {
          let o = prop.options.find((x) => x.name === n);
          if (!o) prop.options.push((o = { id: NC.uid(), name: n, color: NC.randomColor() }));
          return o.id;
        });
        out = toType === 'select' ? ids[0] || null : ids;
      }
      r.values[prop.id] = out;
    });
  }

  A.removeProp = (dbId, propId) => {
    const db = dbOf(dbId);
    db.props = db.props.filter((p) => p.id !== propId);
    db.views.forEach((v) => {
      if (v.groupBy === propId) v.groupBy = null;
      if (v.dateProp === propId) v.dateProp = null;
      if (v.sort && v.sort.propId === propId) v.sort = null;
    });
    emit();
  };

  A.addOption = (dbId, propId, name) => {
    const prop = dbOf(dbId).props.find((p) => p.id === propId);
    const opt = { id: NC.uid(), name, color: NC.randomColor() };
    prop.options.push(opt);
    emit();
    return opt.id;
  };

  A.updateOption = (dbId, propId, optId, patch) => {
    const prop = dbOf(dbId).props.find((p) => p.id === propId);
    Object.assign(prop.options.find((o) => o.id === optId), patch);
    emit();
  };

  A.removeOption = (dbId, propId, optId) => {
    const db = dbOf(dbId);
    const prop = db.props.find((p) => p.id === propId);
    prop.options = prop.options.filter((o) => o.id !== optId);
    db.rows.forEach((rid) => {
      const r = state.pages[rid];
      const v = r && r.values && r.values[propId];
      if (v === optId) r.values[propId] = null;
      if (Array.isArray(v)) r.values[propId] = v.filter((x) => x !== optId);
    });
    emit();
  };

  A.addView = (dbId, type) => {
    const db = dbOf(dbId);
    const v = { id: NC.uid(), name: VIEW_NAMES[type], type, filter: '', sort: null };
    db.views.push(v);
    db.viewId = v.id;
    emit();
  };
  A.updateView = (dbId, viewId, patch) => {
    Object.assign(dbOf(dbId).views.find((v) => v.id === viewId), patch);
    emit();
  };
  A.removeView = (dbId, viewId) => {
    const db = dbOf(dbId);
    if (db.views.length <= 1) return NC.toast('Una base de datos necesita al menos una vista');
    db.views = db.views.filter((v) => v.id !== viewId);
    if (db.viewId === viewId) db.viewId = db.views[0].id;
    emit();
  };

  /* ---------- UI / ajustes ---------- */
  A.setUI = (patch) => {
    Object.assign(state.ui, patch);
    emit(false);
  };
  A.setSettings = (patch) => {
    Object.assign(state.settings, patch);
    emit();
  };
  A.replaceWorkspace = (data) => {
    state = normalize(sanitizeState(data));
    emit();
    NC.navigate(state.rootIds[0] || null);
  };
  A.resetWorkspace = () => {
    state = seed();
    emit();
    NC.navigate(state.rootIds[0]);
  };
  // Llamado por la sincronización tras aplicar cambios remotos
  A.remoteApplied = () => {
    if (state.ui.current && !state.pages[state.ui.current]) {
      const first = state.rootIds.find((r) => state.pages[r] && !state.pages[r].trashed);
      history.replaceState(null, '', first ? '#/' + first : '#/');
      state.ui.current = first || null;
    }
    if (state.ui.peek && !state.pages[state.ui.peek]) state.ui.peek = null;
    emit();
  };
  A.exportWorkspace = () => JSON.stringify({ ...state, ui: {} }, null, 2);

  /* ---------- Navegación (hash) ---------- */
  NC.navigate = (id) => {
    const target = id ? '#/' + id : '#/';
    if (location.hash !== target) location.hash = target;
    else syncHash();
  };
  function syncHash() {
    const id = location.hash.replace(/^#\/?/, '').split('?')[0];
    state.ui.current = id && state.pages[id] ? id : null;
    state.ui.peek = null;
    emit(false);
    scheduleSave();
  }
  window.addEventListener('hashchange', syncHash);

  /* ---------- Datos de ejemplo ---------- */
  function seed() {
    const s = normalize({ pages: {}, rootIds: [] });
    const add = (p) => ((s.pages[p.id] = p), p);
    const welcome = add(newPage({ title: 'Bienvenido a Notas de L', icon: '👋' }));
    welcome.cover = NC.COVERS[3];
    welcome.expanded = true;
    s.rootIds.push(welcome.id);

    const guide = add(newPage({ parentId: welcome.id, title: 'Atajos de teclado', icon: '⌨️' }));
    welcome.children.push(guide.id);

    const tasks = add(newPage({ type: 'database', title: 'Tareas', icon: '✅' }));
    tasks.db = newDb('board');
    s.rootIds.push(tasks.id);
    const [status, date] = tasks.db.props;
    const prio = { id: NC.uid(), name: 'Prioridad', type: 'select', width: 140, options: [
      { id: NC.uid(), name: 'Alta', color: 'red' }, { id: NC.uid(), name: 'Media', color: 'orange' }, { id: NC.uid(), name: 'Baja', color: 'blue' },
    ] };
    tasks.db.props.push(prio);
    tasks.db.views.push({ id: NC.uid(), name: 'Calendario', type: 'calendar', filter: '', sort: null });
    tasks.db.views.push({ id: NC.uid(), name: 'Galería', type: 'gallery', filter: '', sort: null });
    const day = (n) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    [
      ['Diseñar la página de inicio', 1, 0, 2, '🎨'],
      ['Escribir documentación', 0, 1, 5, '📝'],
      ['Revisar pull requests', 1, 0, 0, '👀'],
      ['Preparar presentación', 0, 2, 9, '📊'],
      ['Lanzar versión 1.0', 2, 0, -3, '🚀'],
    ].forEach(([t, st, pr, d, ic]) => {
      const r = add(newPage({ rowOf: tasks.id, title: t, icon: ic }));
      r.blocks = [blk('paragraph', 'Notas de la tarea…')];
      r.values = { [status.id]: status.options[st].id, [prio.id]: prio.options[pr].id, [date.id]: day(d) };
      tasks.db.rows.push(r.id);
    });

    const notes = add(newPage({ title: 'Notas rápidas', icon: '💡' }));
    notes.blocks = [blk('paragraph', 'Un lugar para ideas sueltas. Escribe <code>/</code> para insertar bloques.')];
    s.rootIds.push(notes.id);

    const link = blk('page', '', { pageId: guide.id });
    welcome.blocks = [
      blk('paragraph', 'Notas de L es un espacio de trabajo tipo <b>Notion</b>, inspirado en la arquitectura de <a href="https://github.com/AppFlowy-IO/AppFlowy">AppFlowy</a>: páginas anidadas, un editor por bloques y bases de datos con varias vistas.'),
      blk('callout', 'Todo se guarda automáticamente. Inicia sesión con Google (abajo a la izquierda) para sincronizar la web y la app de Mac.', { icon: '💾', color: 'blue_bg' }),
      blk('h2', 'Lo básico'),
      blk('todo', 'Escribe <code>/</code> para abrir el menú de bloques', { checked: true }),
      blk('todo', 'Selecciona texto para darle <b>negrita</b>, <i>cursiva</i>, <u>subrayado</u>, color o un enlace'),
      blk('todo', 'Arrastra el asa <b>⋮⋮</b> a la izquierda de un bloque para reordenarlo'),
      blk('todo', 'Pulsa <code>Tab</code> / <code>Shift+Tab</code> para anidar bloques'),
      blk('todo', 'Abre la base de datos <b>Tareas</b> y prueba las vistas Tablero, Calendario y Galería'),
      blk('h2', 'Novedades'),
      blk('bulleted', '<b>Columnas</b>: arrastra un bloque al lado de otro, o escribe <code>/2 columnas</code>'),
      blk('bulleted', '<b>Menciones y recordatorios</b>: escribe <code>@</code> para enlazar una página o poner una fecha con aviso'),
      blk('bulleted', '<b>Pestañas, tablas, índice, ecuaciones, botones, embeds de YouTube/Figma/Google Docs</b> en el menú <code>/</code>'),
      blk('bulleted', '<b>Selección múltiple</b>: pulsa <code>Esc</code> o arrastra desde el margen; luego borra, duplica o mueve'),
      blk('bulleted', '<b>⌘Z / ⌘⇧Z</b> deshacer y rehacer · <b>⌘F</b> buscar y reemplazar · <b>Historial de versiones</b> en el menú ···'),
      blk('bulleted', '<b>Comentarios</b>, <b>plantillas</b>, <b>bloquear página</b>, <b>exportar a PDF</b> y portada que puedes mover y redimensionar'),
      blk('h2', 'Atajos de Markdown'),
      blk('bulleted', '<code>#</code>, <code>##</code>, <code>###</code> + espacio → encabezados'),
      blk('bulleted', '<code>-</code> o <code>*</code> + espacio → lista con viñetas'),
      blk('bulleted', '<code>1.</code> + espacio → lista numerada'),
      blk('bulleted', '<code>[]</code> + espacio → tarea'),
      blk('bulleted', '<code>&gt;</code> + espacio → lista desplegable, <code>"</code> + espacio → cita'),
      blk('bulleted', '<code>```</code> + espacio → código, <code>---</code> → divisor'),
      blk('toggle', 'Haz clic en la flecha para desplegar', { collapsed: true }),
      { ...blk('paragraph', '¡Sorpresa! Los bloques con sangría debajo de un desplegable son sus hijos.'), indent: 1 },
      blk('divider'),
      blk('quote', 'La simplicidad es la máxima sofisticación.'),
      blk('h3', 'Subpáginas'),
      link,
    ];
    guide.blocks = [
      blk('h2', 'Generales'),
      blk('bulleted', '<code>⌘/Ctrl + K</code> — Buscar'),
      blk('bulleted', '<code>⌘/Ctrl + \\</code> — Mostrar/ocultar barra lateral'),
      blk('h2', 'Editor'),
      blk('bulleted', '<code>Enter</code> — Nuevo bloque · <code>Shift+Enter</code> — salto de línea'),
      blk('bulleted', '<code>⌘/Ctrl + B / I / U</code> — Negrita, cursiva, subrayado'),
      blk('bulleted', '<code>⌘/Ctrl + Shift + ↑/↓</code> — Mover bloque'),
      blk('bulleted', '<code>⌘/Ctrl + D</code> — Duplicar bloque'),
      blk('bulleted', '<code>⌘/Ctrl + clic</code> — Abrir un enlace'),
      blk('code', '', { text: 'function hola() {\n  console.log("¡Hola, Notas de L!");\n}', lang: 'javascript' }),
    ];
    s.ui.current = welcome.id;
    return s;
  }

  state = load();
  if (!state) {
    state = seed();
    save();
  }
  NC.initRoute = () => {
    const id = location.hash.replace(/^#\/?/, '').split('?')[0];
    if (id && state.pages[id]) state.ui.current = id;
    else {
      const cur = state.ui.current && state.pages[state.ui.current] ? state.ui.current : state.rootIds.find((r) => !state.pages[r].trashed);
      history.replaceState(null, '', cur ? '#/' + cur : '#/');
      state.ui.current = cur || null;
    }
  };
})();
