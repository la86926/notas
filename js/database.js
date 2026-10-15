/* Notas de L — bases de datos: propiedades tipadas (FieldType de AppFlowy simplificado)
 * y vistas Tabla / Tablero / Calendario / Galería sobre las mismas filas. */
(function () {
  const NC = window.NC;
  const { html } = NC;
  const A = NC.actions;
  const { useState, useRef, useEffect } = React;

  const PROP_TYPES = [
    { type: 'text', label: 'Texto', icon: '≡' },
    { type: 'number', label: 'Número', icon: '#' },
    { type: 'select', label: 'Selección', icon: '◉' },
    { type: 'multi', label: 'Selección múltiple', icon: '☰' },
    { type: 'date', label: 'Fecha', icon: '📅' },
    { type: 'checkbox', label: 'Casilla', icon: '☑' },
    { type: 'url', label: 'URL', icon: '🔗' },
    { type: 'created', label: 'Fecha de creación', icon: '🕒' },
  ];
  const typeInfo = (t) => PROP_TYPES.find((p) => p.type === t) || PROP_TYPES[0];
  const VIEW_ICONS = { table: '▦', board: '▥', calendar: '📅', gallery: '▤' };

  /* ---------- Helpers ---------- */
  const optionOf = (prop, id) => prop.options.find((o) => o.id === id);
  const valueText = (row, prop) => {
    const v = row.values && row.values[prop.id];
    switch (prop.type) {
      case 'select': return (optionOf(prop, v) || {}).name || '';
      case 'multi': return (v || []).map((id) => (optionOf(prop, id) || {}).name).filter(Boolean).join(', ');
      case 'checkbox': return v ? '✓' : '';
      case 'created': return new Date(row.createdAt).toLocaleDateString('es-ES');
      case 'date': return NC.formatDate(v);
      default: return v == null ? '' : String(v);
    }
  };
  const sortKey = (row, prop) => {
    if (!prop) return (row.title || '').toLowerCase();
    const v = row.values && row.values[prop.id];
    if (prop.type === 'number') return v == null ? -Infinity : Number(v);
    if (prop.type === 'created') return row.createdAt;
    if (prop.type === 'checkbox') return v ? 1 : 0;
    if (prop.type === 'select') { const i = prop.options.findIndex((o) => o.id === v); return i < 0 ? 999 : i; }
    return valueText(row, prop).toLowerCase();
  };

  function getRows(s, db, view) {
    let rows = db.rows.map((id) => s.pages[id]).filter((r) => r && !r.trashed);
    const q = (view.filter || '').trim().toLowerCase();
    if (q) rows = rows.filter((r) => (r.title || '').toLowerCase().includes(q) || db.props.some((p) => valueText(r, p).toLowerCase().includes(q)));
    if (view.sort) {
      const prop = view.sort.propId === 'title' ? null : db.props.find((p) => p.id === view.sort.propId);
      const dir = view.sort.dir === 'desc' ? -1 : 1;
      rows = [...rows].sort((a, b) => {
        const ka = sortKey(a, prop), kb = sortKey(b, prop);
        return ka < kb ? -dir : ka > kb ? dir : 0;
      });
    }
    return rows;
  }

  const Tag = ({ opt, onRemove }) =>
    html`<span className=${'tag tag-' + (opt.color || 'gray')}>${opt.name}${onRemove && html`<button className="tag-x" onMouseDown=${(e) => { e.stopPropagation(); e.preventDefault(); onRemove(); }}>×</button>`}</span>`;

  /* ---------- Selector de opciones ---------- */
  function OptionPicker({ dbId, prop, row, anchor, onClose }) {
    const [q, setQ] = useState('');
    const multi = prop.type === 'multi';
    const value = row.values && row.values[prop.id];
    const selected = multi ? value || [] : value ? [value] : [];
    const list = prop.options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));
    const exact = prop.options.some((o) => o.name.toLowerCase() === q.trim().toLowerCase());
    const toggle = (id) => {
      if (multi) A.setValue(row.id, prop.id, selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
      else { A.setValue(row.id, prop.id, value === id ? null : id); onClose(); }
    };
    const create = () => {
      const name = q.trim();
      if (!name) return;
      toggle(A.addOption(dbId, prop.id, name));
      setQ('');
    };
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu option-picker">
      <div className="picker-selected">
        ${selected.map((id) => optionOf(prop, id)).filter(Boolean).map((o) => html`<${Tag} key=${o.id} opt=${o} onRemove=${() => toggle(o.id)} />`)}
        <input autoFocus placeholder=${selected.length ? '' : 'Busca o crea una opción…'} value=${q}
          onInput=${(e) => setQ(e.target.value)}
          onKeyDown=${(e) => {
            if (e.key === 'Enter') { e.preventDefault(); list.length && !exact && q.trim() ? create() : list[0] ? toggle(list[0].id) : create(); }
            if (e.key === 'Backspace' && !q && selected.length) toggle(selected[selected.length - 1]);
          }} />
      </div>
      <div className="menu-label">Selecciona una opción o crea una</div>
      ${list.map((o) => html`<div key=${o.id} className="menu-item option-row" onClick=${() => toggle(o.id)}>
        <${Tag} opt=${o} />
        <span className="grow"></span>
        ${selected.includes(o.id) && html`<span className="check">✓</span>`}
        <button className="mini" title="Cambiar color" onClick=${(e) => { e.stopPropagation(); const i = NC.COLORS.indexOf(o.color); A.updateOption(dbId, prop.id, o.id, { color: NC.COLORS[(i % (NC.COLORS.length - 1)) + 1] }); }}>🎨</button>
        <button className="mini" title="Eliminar opción" onClick=${(e) => { e.stopPropagation(); A.removeOption(dbId, prop.id, o.id); }}>🗑</button>
      </div>`)}
      ${q.trim() && !exact && html`<div className="menu-item" onClick=${create}>Crear <${Tag} opt=${{ name: q.trim(), color: 'gray' }} /></div>`}
    <//>`;
  }

  /* ---------- Celda ---------- */
  NC.Cell = function Cell({ dbId, prop, row, compact = false }) {
    const [anchor, setAnchor] = useState(null);
    const v = row.values && row.values[prop.id];
    const set = (val) => A.setValue(row.id, prop.id, val);
    switch (prop.type) {
      case 'checkbox':
        return html`<label className="cell cell-check"><input type="checkbox" checked=${!!v} onChange=${() => set(!v)} /></label>`;
      case 'number':
        return html`<input className="cell cell-input num" type="number" value=${v ?? ''} placeholder=${compact ? 'Vacío' : ''}
          onInput=${(e) => set(e.target.value === '' ? null : Number(e.target.value))} />`;
      case 'date':
        return html`<input className=${'cell cell-input' + (v ? '' : ' empty')} type="date" value=${v || ''} onInput=${(e) => set(e.target.value || null)} />`;
      case 'url':
        return html`<div className="cell cell-url">
          <input className="cell-input" value=${v || ''} placeholder=${compact ? 'Vacío' : ''} onInput=${(e) => set(e.target.value)} />
          ${v && html`<a className="url-open" href=${/^https?:/.test(v) ? v : 'https://' + v} target="_blank" rel="noopener" title="Abrir">↗</a>`}
        </div>`;
      case 'created':
        return html`<div className="cell cell-ro">${new Date(row.createdAt).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}</div>`;
      case 'select':
      case 'multi': {
        const ids = prop.type === 'multi' ? v || [] : v ? [v] : [];
        return html`<div className="cell cell-select" onClick=${(e) => setAnchor(e.currentTarget)}>
          ${ids.map((id) => optionOf(prop, id)).filter(Boolean).map((o) => html`<${Tag} key=${o.id} opt=${o} />`)}
          ${!ids.length && compact && html`<span className="muted">Vacío</span>`}
          ${anchor && html`<${OptionPicker} dbId=${dbId} prop=${prop} row=${row} anchor=${anchor} onClose=${() => setAnchor(null)} />`}
        </div>`;
      }
      default:
        return html`<input className="cell cell-input" value=${v || ''} placeholder=${compact ? 'Vacío' : ''} onInput=${(e) => set(e.target.value)} />`;
    }
  };

  /* ---------- Menú de propiedad ---------- */
  function PropMenu({ dbId, db, prop, view, anchor, onClose }) {
    const isTitle = !prop;
    const [name, setName] = useState(isTitle ? db.titleName : prop.name);
    const commit = () => {
      if (isTitle) { db.titleName = name || 'Nombre'; A.updatePage(dbId, {}); }
      else A.updateProp(dbId, prop.id, { name: name || 'Propiedad' });
    };
    const sort = (dir) => { A.updateView(dbId, view.id, { sort: { propId: isTitle ? 'title' : prop.id, dir } }); onClose(); };
    return html`<${NC.Popover} anchor=${anchor} onClose=${() => { commit(); onClose(); }} className="menu prop-menu">
      <input className="menu-input" autoFocus value=${name} onInput=${(e) => setName(e.target.value)}
        onKeyDown=${(e) => e.key === 'Enter' && (commit(), onClose())} />
      ${!isTitle && html`<div className="menu-label">Tipo</div>
        ${PROP_TYPES.map((t) => html`<button key=${t.type} className=${'menu-item' + (prop.type === t.type ? ' selected' : '')}
          onClick=${() => A.updateProp(dbId, prop.id, { type: t.type })}><span className="prop-icon">${t.icon}</span>${t.label}</button>`)}`}
      <div className="menu-sep"></div>
      <button className="menu-item" onClick=${() => sort('asc')}><span>↑</span> Ordenar ascendente</button>
      <button className="menu-item" onClick=${() => sort('desc')}><span>↓</span> Ordenar descendente</button>
      ${!isTitle && html`<button className="menu-item danger" onClick=${() => { A.removeProp(dbId, prop.id); onClose(); }}><span>🗑</span> Eliminar propiedad</button>`}
    <//>`;
  }

  function AddPropMenu({ dbId, anchor, onClose, onAdded }) {
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu">
      <div className="menu-label">Nueva propiedad</div>
      ${PROP_TYPES.map((t) => html`<button key=${t.type} className="menu-item" onClick=${() => { const id = A.addProp(dbId, t.type); onClose(); onAdded && onAdded(id); }}>
        <span className="prop-icon">${t.icon}</span>${t.label}</button>`)}
    <//>`;
  }

  /* ---------- Vista Tabla ---------- */
  function TableView({ dbPage, db, view, rows }) {
    const [menu, setMenu] = useState(null); // {anchor, prop}
    const [addAnchor, setAddAnchor] = useState(null);
    const [rowMenu, setRowMenu] = useState(null);
    const resize = (propId) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const prop = propId === 'title' ? null : db.props.find((p) => p.id === propId);
      const startW = prop ? prop.width || 160 : db.titleWidth || 260;
      const move = (ev) => {
        const w = Math.max(90, startW + ev.clientX - startX);
        if (prop) prop.width = w; else db.titleWidth = w;
        A.updatePage(dbPage.id, {}, false);
      };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); A.updatePage(dbPage.id, {}); };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    };
    const sortMark = (id) => (view.sort && view.sort.propId === id ? (view.sort.dir === 'asc' ? ' ↑' : ' ↓') : '');
    return html`<div className="db-table-wrap">
      <table className="db-table">
        <thead><tr>
          <th style=${{ width: db.titleWidth || 260 }} onClick=${(e) => setMenu({ anchor: e.currentTarget, prop: null })}>
            <span className="prop-icon">Aa</span>${db.titleName}${sortMark('title')}<span className="col-resizer" onMouseDown=${resize('title')} onClick=${(e) => e.stopPropagation()}></span>
          </th>
          ${db.props.map((p) => html`<th key=${p.id} style=${{ width: p.width || 160 }} onClick=${(e) => setMenu({ anchor: e.currentTarget, prop: p })}>
            <span className="prop-icon">${typeInfo(p.type).icon}</span>${p.name}${sortMark(p.id)}
            <span className="col-resizer" onMouseDown=${resize(p.id)} onClick=${(e) => e.stopPropagation()}></span>
          </th>`)}
          <th className="add-col" onClick=${(e) => setAddAnchor(e.currentTarget)}>+</th>
        </tr></thead>
        <tbody>
          ${rows.map((r) => html`<tr key=${r.id}>
            <td><div className="title-cell">
              <span className="row-handle" onClick=${(e) => setRowMenu({ anchor: e.currentTarget, row: r })}>⋮⋮</span>
              ${r.icon && html`<span className="row-icon"><${NC.Icon} icon=${r.icon} /></span>`}
              <input className="cell-input title-input" value=${r.title} placeholder="Sin título" onInput=${(e) => A.updatePage(r.id, { title: e.target.value })} />
              <button className="open-btn" onClick=${() => A.setUI({ peek: r.id })}>⤢ ABRIR</button>
            </div></td>
            ${db.props.map((p) => html`<td key=${p.id}><${NC.Cell} dbId=${dbPage.id} prop=${p} row=${r} /></td>`)}
            <td></td>
          </tr>`)}
        </tbody>
      </table>
      <div className="db-add-row" onClick=${() => A.addRow(dbPage.id)}>+ Nueva</div>
      <div className="db-count">${rows.length} ${rows.length === 1 ? 'fila' : 'filas'}</div>
      ${menu && html`<${PropMenu} dbId=${dbPage.id} db=${db} prop=${menu.prop} view=${view} anchor=${menu.anchor} onClose=${() => setMenu(null)} />`}
      ${addAnchor && html`<${AddPropMenu} dbId=${dbPage.id} anchor=${addAnchor} onClose=${() => setAddAnchor(null)} />`}
      ${rowMenu && html`<${RowMenu} row=${rowMenu.row} anchor=${rowMenu.anchor} onClose=${() => setRowMenu(null)} />`}
    </div>`;
  }

  function RowMenu({ row, anchor, onClose }) {
    const run = (fn) => () => { fn(); onClose(); };
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu">
      <button className="menu-item" onClick=${run(() => A.setUI({ peek: row.id }))}><span>⤢</span> Abrir en vista previa</button>
      <button className="menu-item" onClick=${run(() => NC.navigate(row.id))}><span>📄</span> Abrir como página</button>
      <button className="menu-item" onClick=${run(() => A.duplicatePage(row.id))}><span>⧉</span> Duplicar</button>
      <button className="menu-item danger" onClick=${run(() => A.trashPage(row.id))}><span>🗑</span> Eliminar</button>
    <//>`;
  }

  /* ---------- Tarjeta (tablero / galería) ---------- */
  function CardProps({ db, row, exclude }) {
    const items = db.props.filter((p) => p.id !== exclude && p.type !== 'created').map((p) => {
      const v = row.values && row.values[p.id];
      if (v == null || v === '' || (Array.isArray(v) && !v.length) || v === false) return null;
      if (p.type === 'select') { const o = optionOf(p, v); return o && html`<${Tag} key=${p.id} opt=${o} />`; }
      if (p.type === 'multi') return html`<span key=${p.id} className="card-tags">${v.map((id) => optionOf(p, id)).filter(Boolean).map((o) => html`<${Tag} key=${o.id} opt=${o} />`)}</span>`;
      if (p.type === 'checkbox') return html`<span key=${p.id} className="card-prop">☑ ${p.name}</span>`;
      return html`<span key=${p.id} className="card-prop">${p.type === 'date' ? '📅 ' : ''}${valueText(row, p)}</span>`;
    }).filter(Boolean);
    return items.length ? html`<div className="card-props">${items}</div>` : null;
  }

  /* ---------- Vista Tablero (Kanban) ---------- */
  function BoardView({ dbPage, db, view, rows }) {
    const dbId = dbPage.id;
    const selectProps = db.props.filter((p) => p.type === 'select');
    const group = selectProps.find((p) => p.id === view.groupBy) || selectProps[0];
    const drag = useRef(null);
    const [over, setOver] = useState(null);
    const [newGroup, setNewGroup] = useState(null);
    if (!group) {
      return html`<div className="db-empty">
        <p>El tablero agrupa las filas por una propiedad de <b>selección</b>.</p>
        <button className="btn-primary" onClick=${() => {
          const id = A.addProp(dbId, 'select', 'Estado');
          ['Por hacer', 'En progreso', 'Hecho'].forEach((n) => A.addOption(dbId, id, n));
          A.updateView(dbId, view.id, { groupBy: id });
        }}>Crear propiedad «Estado»</button>
      </div>`;
    }
    const columns = [{ id: null, name: 'Sin ' + group.name.toLowerCase(), color: 'gray' }, ...group.options];
    const dropOn = (colId, beforeId) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = drag.current;
      drag.current = null;
      setOver(null);
      if (!id) return;
      A.setValue(id, group.id, colId);
      if (!view.sort) A.moveRow(dbId, id, beforeId);
    };
    return html`<div className="board">
      ${columns.map((col) => {
        const items = rows.filter((r) => ((r.values && r.values[group.id]) || null) === col.id || (col.id === null && !optionOf(group, r.values && r.values[group.id])));
        return html`<div key=${col.id || 'none'} className=${'board-col' + (over === (col.id || 'none') ? ' over' : '')}
          onDragOver=${(e) => { if (drag.current) { e.preventDefault(); setOver(col.id || 'none'); } }}
          onDrop=${dropOn(col.id, null)}>
          <div className="board-col-head">
            <${Tag} opt=${col} /><span className="count">${items.length}</span>
            <span className="grow"></span>
            <button className="mini" title="Añadir" onClick=${() => A.setUI({ peek: A.addRow(dbId, { [group.id]: col.id }) })}>+</button>
          </div>
          ${items.map((r) => html`<div key=${r.id} className="card" draggable=${true}
              onDragStart=${(e) => { drag.current = r.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'row'); }}
              onDragEnd=${() => { drag.current = null; setOver(null); }}
              onDrop=${dropOn(col.id, r.id)}
              onClick=${() => A.setUI({ peek: r.id })}>
            <div className="card-title">${r.icon && html`<span><${NC.Icon} icon=${r.icon} /> </span>`}${r.title || html`<span className="muted">Sin título</span>`}</div>
            <${CardProps} db=${db} row=${r} exclude=${group.id} />
          </div>`)}
          <button className="board-add" onClick=${() => A.setUI({ peek: A.addRow(dbId, { [group.id]: col.id }) })}>+ Nueva</button>
        </div>`;
      })}
      <div className="board-col ghost">
        ${newGroup == null
          ? html`<button className="board-add" onClick=${() => setNewGroup('')}>+ Añadir grupo</button>`
          : html`<input className="menu-input" autoFocus placeholder="Nombre del grupo" value=${newGroup}
              onInput=${(e) => setNewGroup(e.target.value)} onBlur=${() => setNewGroup(null)}
              onKeyDown=${(e) => {
                if (e.key === 'Enter' && newGroup.trim()) { A.addOption(dbId, group.id, newGroup.trim()); setNewGroup(null); }
                if (e.key === 'Escape') setNewGroup(null);
              }} />`}
      </div>
    </div>`;
  }

  /* ---------- Vista Calendario ---------- */
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  function CalendarView({ dbPage, db, view, rows }) {
    const dbId = dbPage.id;
    const dateProps = db.props.filter((p) => p.type === 'date');
    const prop = dateProps.find((p) => p.id === view.dateProp) || dateProps[0];
    const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
    const drag = useRef(null);
    const [over, setOver] = useState(null);
    if (!prop) {
      return html`<div className="db-empty"><p>El calendario necesita una propiedad de <b>fecha</b>.</p>
        <button className="btn-primary" onClick=${() => A.updateView(dbId, view.id, { dateProp: A.addProp(dbId, 'date', 'Fecha') })}>Crear propiedad «Fecha»</button></div>`;
    }
    const start = new Date(month);
    start.setDate(1 - ((month.getDay() + 6) % 7)); // lunes
    const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    const today = NC.todayISO();
    const byDay = {};
    rows.forEach((r) => { const v = r.values && r.values[prop.id]; if (v) (byDay[v] = byDay[v] || []).push(r); });
    const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
    const undated = rows.filter((r) => !(r.values && r.values[prop.id]));
    return html`<div className="calendar">
      <div className="cal-head">
        <h3>${MONTHS[month.getMonth()]} ${month.getFullYear()}</h3>
        <span className="grow"></span>
        ${undated.length > 0 && html`<span className="muted small">${undated.length} sin fecha</span>`}
        <button className="btn-ghost" onClick=${() => shift(-1)}>‹</button>
        <button className="btn-ghost" onClick=${() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Hoy</button>
        <button className="btn-ghost" onClick=${() => shift(1)}>›</button>
      </div>
      <div className="cal-grid">
        ${['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((d) => html`<div key=${d} className="cal-dow">${d}</div>`)}
        ${days.map((d) => {
          const key = iso(d);
          return html`<div key=${key} className=${'cal-day' + (d.getMonth() !== month.getMonth() ? ' other' : '') + (key === today ? ' today' : '') + (over === key ? ' over' : '')}
            onDragOver=${(e) => { if (drag.current) { e.preventDefault(); setOver(key); } }}
            onDragLeave=${() => setOver(null)}
            onDrop=${(e) => { e.preventDefault(); if (drag.current) A.setValue(drag.current, prop.id, key); drag.current = null; setOver(null); }}>
            <div className="cal-num"><span>${d.getDate()}</span>
              <button className="mini cal-add" title="Nueva" onClick=${() => A.setUI({ peek: A.addRow(dbId, { [prop.id]: key }) })}>+</button>
            </div>
            ${(byDay[key] || []).map((r) => html`<div key=${r.id} className="cal-item" draggable=${true}
              onDragStart=${(e) => { drag.current = r.id; e.dataTransfer.setData('text/plain', 'row'); }}
              onClick=${() => A.setUI({ peek: r.id })}>${r.icon ? NC.iconText(r.icon) + ' ' : ''}${r.title || 'Sin título'}</div>`)}
          </div>`;
        })}
      </div>
    </div>`;
  }

  /* ---------- Vista Galería ---------- */
  function GalleryView({ dbPage, db, rows }) {
    const s = NC.getState();
    const preview = (r) =>
      (r.blocks || []).filter((b) => b.html || b.text).slice(0, 4).map((b) => NC.htmlToText(b.html || b.text)).join('\n');
    return html`<div className="gallery">
      ${rows.map((r) => {
        const cover = NC.coverStyle(r.cover);
        const img = (r.blocks || []).find((b) => b.type === 'image' && b.url);
        return html`<div key=${r.id} className="g-card" onClick=${() => A.setUI({ peek: r.id })}>
          <div className="g-preview" style=${cover || {}}>
            ${img ? html`<${NC.AssetImg} src=${img.url} />` : !cover && html`<pre>${preview(r)}</pre>`}
          </div>
          <div className="g-body">
            <div className="card-title">${r.icon && html`<span><${NC.Icon} icon=${r.icon} /> </span>`}${r.title || html`<span className="muted">Sin título</span>`}</div>
            <${CardProps} db=${db} row=${r} />
          </div>
        </div>`;
      })}
      <div className="g-card g-new" onClick=${() => A.setUI({ peek: A.addRow(dbPage.id) })}>+ Nueva</div>
    </div>`;
  }

  /* ---------- Contenedor con pestañas de vistas ---------- */
  NC.DatabaseView = function DatabaseView({ page }) {
    const s = NC.useStore();
    const db = page.db;
    const view = db.views.find((v) => v.id === db.viewId) || db.views[0];
    const [addAnchor, setAddAnchor] = useState(null);
    const [viewMenu, setViewMenu] = useState(null);
    const rows = getRows(s, db, view);
    const Body = { table: TableView, board: BoardView, calendar: CalendarView, gallery: GalleryView }[view.type] || TableView;
    return html`<div className="database">
      <div className="db-toolbar">
        <div className="db-tabs">
          ${db.views.map((v) => html`<button key=${v.id} className=${'db-tab' + (v.id === view.id ? ' active' : '')}
            onClick=${(e) => (v.id === view.id ? setViewMenu(e.currentTarget) : ((db.viewId = v.id), A.updatePage(page.id, {})))}>
            <span>${VIEW_ICONS[v.type]}</span> ${v.name}</button>`)}
          <button className="db-tab add" title="Añadir vista" onClick=${(e) => setAddAnchor(e.currentTarget)}>+</button>
        </div>
        <span className="grow"></span>
        ${view.sort && html`<button className="chip" onClick=${() => A.updateView(page.id, view.id, { sort: null })}>
          ${view.sort.dir === 'asc' ? '↑' : '↓'} ${view.sort.propId === 'title' ? db.titleName : (db.props.find((p) => p.id === view.sort.propId) || {}).name} ×</button>`}
        <input className="db-search" placeholder="🔍 Buscar…" value=${view.filter || ''} onInput=${(e) => A.updateView(page.id, view.id, { filter: e.target.value })} />
        <button className="btn-primary" onClick=${() => A.setUI({ peek: A.addRow(page.id) })}>Nuevo</button>
      </div>
      <${Body} dbPage=${page} db=${db} view=${view} rows=${rows} />
      ${addAnchor && html`<${NC.Popover} anchor=${addAnchor} onClose=${() => setAddAnchor(null)} className="menu">
        <div className="menu-label">Añadir vista</div>
        ${Object.keys(VIEW_ICONS).map((t) => html`<button key=${t} className="menu-item" onClick=${() => { A.addView(page.id, t); setAddAnchor(null); }}>
          <span>${VIEW_ICONS[t]}</span> ${NC.VIEW_NAMES[t]}</button>`)}
      <//>`}
      ${viewMenu && html`<${ViewMenu} page=${page} view=${view} anchor=${viewMenu} onClose=${() => setViewMenu(null)} />`}
    </div>`;
  };

  function ViewMenu({ page, view, anchor, onClose }) {
    const db = page.db;
    const [name, setName] = useState(view.name);
    const commit = () => name.trim() && name !== view.name && A.updateView(page.id, view.id, { name: name.trim() });
    const selects = db.props.filter((p) => p.type === 'select');
    const dates = db.props.filter((p) => p.type === 'date');
    return html`<${NC.Popover} anchor=${anchor} onClose=${() => { commit(); onClose(); }} className="menu">
      <input className="menu-input" autoFocus value=${name} onInput=${(e) => setName(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && (commit(), onClose())} />
      <div className="menu-label">Diseño</div>
      ${Object.keys(VIEW_ICONS).map((t) => html`<button key=${t} className=${'menu-item' + (view.type === t ? ' selected' : '')}
        onClick=${() => A.updateView(page.id, view.id, { type: t })}><span>${VIEW_ICONS[t]}</span> ${NC.VIEW_NAMES[t]}</button>`)}
      ${view.type === 'board' && selects.length > 1 && html`<div className="menu-label">Agrupar por</div>
        ${selects.map((p) => html`<button key=${p.id} className=${'menu-item' + ((view.groupBy || selects[0].id) === p.id ? ' selected' : '')}
          onClick=${() => A.updateView(page.id, view.id, { groupBy: p.id })}><span>◉</span> ${p.name}</button>`)}`}
      ${view.type === 'calendar' && dates.length > 1 && html`<div className="menu-label">Mostrar calendario por</div>
        ${dates.map((p) => html`<button key=${p.id} className=${'menu-item' + ((view.dateProp || dates[0].id) === p.id ? ' selected' : '')}
          onClick=${() => A.updateView(page.id, view.id, { dateProp: p.id })}><span>📅</span> ${p.name}</button>`)}`}
      <div className="menu-sep"></div>
      <button className="menu-item danger" onClick=${() => { A.removeView(page.id, view.id); onClose(); }}><span>🗑</span> Eliminar vista</button>
    <//>`;
  }

  /* ---------- Propiedades en la página de una fila ---------- */
  NC.RowProps = function RowProps({ row }) {
    const s = NC.useStore();
    const dbPage = s.pages[row.rowOf];
    const [addAnchor, setAddAnchor] = useState(null);
    const [menu, setMenu] = useState(null);
    if (!dbPage) return null;
    const db = dbPage.db;
    const view = db.views.find((v) => v.id === db.viewId) || db.views[0];
    return html`<div className="row-props">
      ${db.props.map((p) => html`<div key=${p.id} className="row-prop">
        <button className="row-prop-name" onClick=${(e) => setMenu({ anchor: e.currentTarget, prop: p })}><span className="prop-icon">${typeInfo(p.type).icon}</span>${p.name}</button>
        <div className="row-prop-val"><${NC.Cell} dbId=${dbPage.id} prop=${p} row=${row} compact=${true} /></div>
      </div>`)}
      <button className="btn-ghost add-prop" onClick=${(e) => setAddAnchor(e.currentTarget)}>+ Añadir una propiedad</button>
      ${addAnchor && html`<${AddPropMenu} dbId=${dbPage.id} anchor=${addAnchor} onClose=${() => setAddAnchor(null)} />`}
      ${menu && html`<${PropMenu} dbId=${dbPage.id} db=${db} prop=${menu.prop} view=${view} anchor=${menu.anchor} onClose=${() => setMenu(null)} />`}
    </div>`;
  };

  NC.dbToMarkdown = (s, page) => {
    const db = page.db;
    const rows = db.rows.map((id) => s.pages[id]).filter((r) => r && !r.trashed);
    const esc = (t) => String(t).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const head = [db.titleName, ...db.props.map((p) => p.name)];
    return [
      '| ' + head.map(esc).join(' | ') + ' |',
      '| ' + head.map(() => '---').join(' | ') + ' |',
      ...rows.map((r) => '| ' + [r.title || '', ...db.props.map((p) => valueText(r, p))].map(esc).join(' | ') + ' |'),
    ].join('\n');
  };
})();
