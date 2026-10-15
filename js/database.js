/* Notas de L — interfaz de bases de datos: celdas de todos los tipos, menús de propiedad
 * (fórmulas, relaciones, rollups, formatos), filtros, orden, agrupación, propiedades ocultas,
 * cálculos, subelementos y vistas Tabla, Tablero, Calendario, Galería, Lista, Cronograma,
 * Gráfico, Formulario y Panel (dashboard). El motor está en js/dbcore.js. */
(function () {
  const NC = window.NC;
  const { html } = NC;
  const A = NC.actions;
  const D = NC.dbx;
  const { useState, useRef, useEffect } = React;

  const typeInfo = NC.propTypeInfo;
  const VIEW_ICONS = { table: '▦', board: '▥', calendar: '📅', gallery: '▤', list: '☰', timeline: '⟶', chart: '📊', form: '📝', dashboard: '◫' };
  const optionOf = D.optionOf;
  const visibleProps = (db, view) => db.props.filter((p) => !(view.hidden || []).includes(p.id));
  const STATUS_GROUPS = [['todo', 'Por hacer'], ['progress', 'En curso'], ['done', 'Completado']];

  const Tag = ({ opt, onRemove }) =>
    html`<span className=${'tag tag-' + (opt.color || 'gray')}>${opt.name}${onRemove && html`<button className="tag-x" onMouseDown=${(e) => { e.stopPropagation(); e.preventDefault(); onRemove(); }}>×</button>`}</span>`;
  NC.Tag = Tag;

  /* ---------- Selector de opciones (selección, múltiple, estado) ---------- */
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
      const id = A.addOption(dbId, prop.id, name);
      if (prop.type === 'status') A.updateOption(dbId, prop.id, id, { group: 'todo' });
      toggle(id);
      setQ('');
    };
    const item = (o) => html`<div key=${o.id} className="menu-item option-row" onClick=${() => toggle(o.id)}>
      <${Tag} opt=${o} /><span className="grow"></span>
      ${selected.includes(o.id) && html`<span className="check">✓</span>`}
    </div>`;
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu option-picker">
      <div className="picker-selected">
        ${selected.map((id) => optionOf(prop, id)).filter(Boolean).map((o) => html`<${Tag} key=${o.id} opt=${o} onRemove=${() => toggle(o.id)} />`)}
        <input autoFocus placeholder=${selected.length ? '' : 'Busca o crea una opción…'} value=${q}
          onInput=${(e) => setQ(e.target.value)}
          onKeyDown=${(e) => {
            if (e.key === 'Enter') { e.preventDefault(); q.trim() && !exact ? create() : list[0] && toggle(list[0].id); }
            if (e.key === 'Backspace' && !q && selected.length) toggle(selected[selected.length - 1]);
          }} />
      </div>
      ${prop.type === 'status'
        ? STATUS_GROUPS.map(([g, label]) => html`<${React.Fragment} key=${g}><div className="menu-label">${label}</div>${list.filter((o) => (o.group || 'todo') === g).map(item)}<//>`)
        : html`<div className="menu-label">Selecciona una opción o crea una</div>${list.map(item)}`}
      ${q.trim() && !exact && html`<div className="menu-item" onClick=${create}>Crear <${Tag} opt=${{ name: q.trim(), color: 'gray' }} /></div>`}
    <//>`;
  }

  /* ---------- Selector de relación ---------- */
  function RelationPicker({ prop, row, anchor, onClose }) {
    const s = NC.useStore();
    const [q, setQ] = useState('');
    const target = D.findDb(prop.relation && prop.relation.dbId);
    if (!target) return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu"><div className="pad muted">Elige la base de datos relacionada en el menú de la propiedad.</div><//>`;
    const ids = (row.values && row.values[prop.id]) || [];
    const n = NC.normalizeStr(q);
    const list = D.rowsOf(target.db).filter((r) => r.id !== row.id && (!n || NC.normalizeStr(r.title || '').includes(n))).slice(0, 50);
    const toggle = (id) => A.setRelation(row.id, prop.id, ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
    const create = () => { const id = A.addRow(target.id, {}, null, q.trim()); A.setRelation(row.id, prop.id, [...ids, id]); setQ(''); };
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu relation-picker">
      <div className="menu-label">Vincular con ${target.title || 'Sin título'}</div>
      <input className="menu-input" autoFocus placeholder="Buscar una página…" value=${q} onInput=${(e) => setQ(e.target.value)}
        onKeyDown=${(e) => e.key === 'Enter' && q.trim() && !list.length && create()} />
      ${list.map((r) => html`<div key=${r.id} className="menu-item" onClick=${() => toggle(r.id)}>
        <span><${NC.Icon} icon=${r.icon} /></span> ${r.title || 'Sin título'}<span className="grow"></span>${ids.includes(r.id) && html`<span className="check">✓</span>`}</div>`)}
      ${q.trim() && html`<div className="menu-item" onClick=${create}><span>+</span> Crear «${q.trim()}» en ${target.title || 'la base de datos'}</div>`}
    <//>`;
  }

  /* ---------- Archivos ---------- */
  function FilesPicker({ row, prop, anchor, onClose }) {
    const ref = useRef(null);
    const files = (row.values && row.values[prop.id]) || [];
    const set = (v) => A.setValue(row.id, prop.id, v);
    const upload = async (f) => {
      if (!f) return;
      if (f.size > 3e6) return NC.toast('Máximo 3 MB por archivo');
      const data = /^image\/(png|jpe?g|webp)$/.test(f.type) ? await NC.compressImage(f) : await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
      set([...files, { name: f.name, url: await NC.assets.put(data), size: f.size }]);
    };
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu files-picker">
      ${files.map((f, i) => html`<div key=${i} className="menu-item"><span>📎</span> <${FileLink} f=${f} /><span className="grow"></span>
        <button className="mini" onClick=${() => set(files.filter((_, j) => j !== i))}>🗑</button></div>`)}
      <button className="menu-item" onClick=${() => ref.current.click()}><span>⬆</span> Subir archivo</button>
      <form className="row-form" onSubmit=${(e) => { e.preventDefault(); const u = e.target.u.value.trim(); if (/^https?:\/\//.test(u)) { set([...files, { name: u.split('/').pop() || u, url: u }]); e.target.reset(); } }}>
        <input name="u" className="menu-input" placeholder="o pega un enlace…" /><button className="btn-primary" type="submit">+</button>
      </form>
      <input type="file" hidden ref=${ref} onChange=${(e) => { upload(e.target.files[0]); e.target.value = ''; }} />
    <//>`;
  }
  function FileLink({ f }) {
    const href = NC.useAsset(f.url);
    return href ? html`<a href=${href} download=${f.name} target="_blank" rel="noopener" onClick=${(e) => e.stopPropagation()}>${f.name}</a>` : html`<span>${f.name}</span>`;
  }

  /* ---------- Celda ---------- */
  NC.Cell = function Cell({ dbId, prop, row, compact = false }) {
    const [anchor, setAnchor] = useState(null);
    const db = D.findDb(dbId).db;
    const v = row.values && row.values[prop.id];
    const set = (val) => A.setValue(row.id, prop.id, val);
    const empty = compact ? html`<span className="muted">Vacío</span>` : null;
    switch (prop.type) {
      case 'checkbox':
        return html`<label className="cell cell-check"><input type="checkbox" checked=${!!v} onChange=${() => set(!v)} /></label>`;
      case 'number':
        return html`<${NumberCell} prop=${prop} value=${v} onChange=${set} compact=${compact} />`;
      case 'date':
        return html`<input className=${'cell cell-input' + (v ? '' : ' empty')} type="date" value=${v || ''} onInput=${(e) => set(e.target.value || null)} />`;
      case 'url': case 'email': case 'phone': {
        const href = !v ? null : prop.type === 'email' ? 'mailto:' + v : prop.type === 'phone' ? 'tel:' + v.replace(/\s/g, '') : /^https?:/.test(v) ? v : 'https://' + v;
        return html`<div className="cell cell-url">
          <input className="cell-input" type=${prop.type === 'email' ? 'email' : prop.type === 'phone' ? 'tel' : 'text'} value=${v || ''} placeholder=${compact ? 'Vacío' : ''} onInput=${(e) => set(e.target.value)} />
          ${href && html`<a className="url-open" href=${href} target="_blank" rel="noopener" title="Abrir">↗</a>`}
        </div>`;
      }
      case 'select': case 'multi': case 'status': {
        const ids = prop.type === 'multi' ? v || [] : v ? [v] : [];
        return html`<div className="cell cell-select" onClick=${(e) => setAnchor(e.currentTarget)}>
          ${ids.map((id) => optionOf(prop, id)).filter(Boolean).map((o) => html`<${Tag} key=${o.id} opt=${o} />`)}
          ${!ids.length && empty}
          ${anchor && html`<${OptionPicker} dbId=${dbId} prop=${prop} row=${row} anchor=${anchor} onClose=${() => setAnchor(null)} />`}
        </div>`;
      }
      case 'relation': {
        const rel = D.relatedRows(row, prop);
        return html`<div className="cell cell-select" onClick=${(e) => setAnchor(e.currentTarget)}>
          ${rel.map((r) => html`<span key=${r.id} className="rel-chip" onClick=${(e) => { e.stopPropagation(); A.setUI({ peek: r.id }); }}><${NC.Icon} icon=${r.icon} /> ${r.title || 'Sin título'}</span>`)}
          ${!rel.length && empty}
          ${anchor && html`<${RelationPicker} prop=${prop} row=${row} anchor=${anchor} onClose=${() => setAnchor(null)} />`}
        </div>`;
      }
      case 'files':
        return html`<div className="cell cell-select" onClick=${(e) => setAnchor(e.currentTarget)}>
          ${(v || []).map((f, i) => html`<span key=${i} className="rel-chip">📎 <${FileLink} f=${f} /></span>`)}
          ${!(v || []).length && empty}
          ${anchor && html`<${FilesPicker} row=${row} prop=${prop} anchor=${anchor} onClose=${() => setAnchor(null)} />`}
        </div>`;
      case 'formula': case 'rollup': case 'created': case 'edited': case 'uid': {
        const val = D.value(db, row, prop);
        if (val && val.error) return html`<div className="cell cell-ro err" title=${val.error}>⚠ ${val.error}</div>`;
        if (typeof val === 'boolean') return html`<div className="cell cell-check"><input type="checkbox" checked=${val} disabled /></div>`;
        const t = D.text(db, row, prop);
        return html`<div className=${'cell cell-ro' + (typeof val === 'number' ? ' num' : '')}>${t || empty}</div>`;
      }
      default:
        return html`<input className="cell cell-input" value=${v || ''} placeholder=${compact ? 'Vacío' : ''} onInput=${(e) => set(e.target.value)} />`;
    }
  };

  function NumberCell({ prop, value, onChange, compact }) {
    const [editing, setEditing] = useState(false);
    if (editing || !prop.format || prop.format === 'number') {
      return html`<input className="cell cell-input num" type="number" step="any" value=${value ?? ''} placeholder=${compact ? 'Vacío' : ''} autoFocus=${editing}
        onBlur=${() => setEditing(false)} onInput=${(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />`;
    }
    return html`<div className="cell cell-ro num editable" tabIndex=${0} onClick=${() => setEditing(true)} onFocus=${() => setEditing(true)}>${D.formatNumber(value, prop.format) || (compact ? html`<span className="muted">Vacío</span>` : '')}</div>`;
  }

  /* ---------- Menú de propiedad ---------- */
  function OptionsEditor({ dbId, prop }) {
    const [name, setName] = useState('');
    return html`<div className="options-editor">
      <div className="menu-label">Opciones</div>
      ${prop.options.map((o) => html`<div key=${o.id} className="opt-edit">
        <button className=${'color-swatch c-' + o.color + '_bg'} title="Cambiar color"
          onClick=${() => { const i = NC.COLORS.indexOf(o.color); A.updateOption(dbId, prop.id, o.id, { color: NC.COLORS[(i % (NC.COLORS.length - 1)) + 1] }); }}></button>
        <input className="menu-input" defaultValue=${o.name} onBlur=${(e) => e.target.value.trim() && A.updateOption(dbId, prop.id, o.id, { name: e.target.value.trim() })} />
        ${prop.type === 'status' && html`<select className="menu-input mini-select" value=${o.group || 'todo'} onChange=${(e) => A.updateOption(dbId, prop.id, o.id, { group: e.target.value })}>
          ${STATUS_GROUPS.map(([g, l]) => html`<option key=${g} value=${g}>${l}</option>`)}</select>`}
        <button className="mini" title="Eliminar opción" onClick=${() => A.removeOption(dbId, prop.id, o.id)}>🗑</button>
      </div>`)}
      <form className="row-form" onSubmit=${(e) => { e.preventDefault(); if (name.trim()) { A.addOption(dbId, prop.id, name.trim()); setName(''); } }}>
        <input className="menu-input" placeholder="+ Añadir una opción" value=${name} onInput=${(e) => setName(e.target.value)} />
      </form>
    </div>`;
  }

  function FormulaEditor({ dbId, db, prop }) {
    const [src, setSrc] = useState(prop.formula || '');
    const err = src ? D.checkFormula(src) : null;
    const sample = D.rowsOf(db)[0];
    const preview = sample && src && !err ? D.text(db, sample, { ...prop, formula: src }) : '';
    const insert = (t) => setSrc((x) => x + t);
    return html`<div className="formula-editor">
      <div className="menu-label">Fórmula</div>
      <textarea className="menu-input mono" rows="4" value=${src} placeholder='if(prop("Estado") == "Listo", "✅", "⏳")'
        onInput=${(e) => setSrc(e.target.value)} onKeyDown=${(e) => e.stopPropagation()}></textarea>
      ${err ? html`<div className="danger small">⚠ ${err}</div>` : preview !== '' && html`<div className="muted small">Ejemplo (${sample.title || 'primera fila'}): <b>${preview}</b></div>`}
      <div className="menu-label">Propiedades</div>
      <div className="chip-row">${[db.titleName, ...db.props.filter((p) => p.id !== prop.id).map((p) => p.name)].map((n) => html`<button key=${n} className="chip" onClick=${() => insert(`prop("${n}")`)}>${n}</button>`)}</div>
      <div className="menu-label">Funciones</div>
      <div className="chip-row">${['if', 'concat', 'contains', 'round', 'sum', 'length', 'dateBetween', 'dateAdd', 'formatDate', 'today', 'now', 'empty', 'lower', 'upper'].map((f) => html`<button key=${f} className="chip" onClick=${() => insert(f + '(')}>${f}</button>`)}</div>
      <button className="btn-primary" disabled=${!!err} onClick=${() => A.updateProp(dbId, prop.id, { formula: src })}>Guardar fórmula</button>
    </div>`;
  }

  function RelationConfig({ dbId, prop }) {
    const s = NC.useStore();
    const dbs = Object.values(s.pages).filter((p) => p.type === 'database' && !A.isInTrash(p.id));
    const cfg = prop.relation || {};
    return html`<div>
      <div className="menu-label">Relacionar con</div>
      <select className="menu-input" value=${cfg.dbId || ''} onChange=${(e) => A.updateProp(dbId, prop.id, { relation: { dbId: e.target.value } })}>
        ${dbs.map((d) => html`<option key=${d.id} value=${d.id}>${NC.iconText(d.icon, '🗃️')} ${d.title || 'Sin título'}${d.id === dbId ? ' (esta base)' : ''}</option>`)}
      </select>
      ${cfg.twoWayPropId
        ? html`<div className="muted small pad-y">↔ Bidireccional: también se muestra en la otra base de datos.</div>`
        : cfg.dbId && cfg.dbId !== dbId && html`<button className="menu-item" onClick=${() => A.makeTwoWay(dbId, prop.id)}><span>↔</span> Mostrar también en ${(s.pages[cfg.dbId] || {}).title || 'la otra base'}</button>`}
    </div>`;
  }

  function RollupConfig({ dbId, db, prop }) {
    const cfg = prop.rollup || {};
    const rels = db.props.filter((p) => p.type === 'relation');
    const rel = rels.find((p) => p.id === cfg.relationPropId);
    const target = rel && D.findDb(rel.relation && rel.relation.dbId);
    const set = (patch) => A.updateProp(dbId, prop.id, { rollup: { ...cfg, ...patch } });
    if (!rels.length) return html`<div className="muted small pad">Primero crea una propiedad de tipo Relación.</div>`;
    return html`<div>
      <div className="menu-label">Relación</div>
      <select className="menu-input" value=${cfg.relationPropId || ''} onChange=${(e) => set({ relationPropId: e.target.value, targetPropId: 'title' })}>
        <option value="">Elige…</option>${rels.map((p) => html`<option key=${p.id} value=${p.id}>${p.name}</option>`)}
      </select>
      ${target && html`<div className="menu-label">Propiedad</div>
        <select className="menu-input" value=${cfg.targetPropId || 'title'} onChange=${(e) => set({ targetPropId: e.target.value })}>
          <option value="title">${target.db.titleName}</option>${target.db.props.map((p) => html`<option key=${p.id} value=${p.id}>${p.name}</option>`)}
        </select>`}
      <div className="menu-label">Calcular</div>
      <select className="menu-input" value=${cfg.fn || 'show'} onChange=${(e) => set({ fn: e.target.value })}>
        ${NC.ROLLUP_FNS.map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}
      </select>
    </div>`;
  }

  function PropMenu({ dbId, db, prop, view, anchor, onClose }) {
    const isTitle = !prop;
    const [name, setName] = useState(isTitle ? db.titleName : prop.name);
    const [tab, setTab] = useState('main');
    const commit = () => {
      if (isTitle) { db.titleName = name || 'Nombre'; A.updatePage(dbId, {}); }
      else A.updateProp(dbId, prop.id, { name: name || 'Propiedad' });
    };
    const pid = isTitle ? 'title' : prop.id;
    const sort = (dir) => { A.updateView(dbId, view.id, { sorts: [{ propId: pid, dir }, ...(view.sorts || []).filter((x) => x.propId !== pid)], sort: null }); onClose(); };
    const close = () => { commit(); onClose(); };
    const groupable = !isTitle && !['formula', 'rollup', 'files', 'uid'].includes(prop.type);
    return html`<${NC.Popover} anchor=${anchor} onClose=${close} className="menu prop-menu">
      <input className="menu-input" autoFocus value=${name} onInput=${(e) => setName(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && close()} />
      ${tab === 'type' && html`<div className="menu-label">Tipo</div>
        ${NC.PROP_TYPES.map((t) => html`<button key=${t.type} className=${'menu-item' + (prop.type === t.type ? ' selected' : '')}
          onClick=${() => { A.updateProp(dbId, prop.id, { type: t.type, ...(t.type === 'status' && !prop.options.length ? { options: NC.statusOptions() } : {}), ...(t.type === 'relation' && !prop.relation ? { relation: { dbId } } : {}), ...(t.type === 'rollup' && !prop.rollup ? { rollup: { fn: 'show' } } : {}) }); setTab('main'); }}>
          <span className="prop-icon">${t.icon}</span>${t.label}</button>`)}`}
      ${tab === 'main' && html`
        ${!isTitle && html`<button className="menu-item" onClick=${() => setTab('type')}><span className="prop-icon">${typeInfo(prop.type).icon}</span> Tipo: ${typeInfo(prop.type).label}<span className="chev">›</span></button>`}
        ${!isTitle && prop.type === 'number' && html`<div className="menu-label">Formato</div>
          <select className="menu-input" value=${prop.format || 'number'} onChange=${(e) => A.updateProp(dbId, prop.id, { format: e.target.value })}>
            ${NC.NUMBER_FORMATS.map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}</select>`}
        ${!isTitle && ['select', 'multi', 'status'].includes(prop.type) && html`<${OptionsEditor} dbId=${dbId} prop=${prop} />`}
        ${!isTitle && prop.type === 'formula' && html`<${FormulaEditor} dbId=${dbId} db=${db} prop=${prop} />`}
        ${!isTitle && prop.type === 'relation' && html`<${RelationConfig} dbId=${dbId} prop=${prop} />`}
        ${!isTitle && prop.type === 'rollup' && html`<${RollupConfig} dbId=${dbId} db=${db} prop=${prop} />`}
        ${!isTitle && prop.type === 'uid' && html`<div className="menu-label">Prefijo</div>
          <input className="menu-input" placeholder="TAR" defaultValue=${prop.prefix || ''} onBlur=${(e) => A.updateProp(dbId, prop.id, { prefix: e.target.value.trim().toUpperCase() })} />`}
        <div className="menu-sep"></div>
        <button className="menu-item" onClick=${() => sort('asc')}><span>↑</span> Ordenar ascendente</button>
        <button className="menu-item" onClick=${() => sort('desc')}><span>↓</span> Ordenar descendente</button>
        <button className="menu-item" onClick=${() => { A.updateView(dbId, view.id, { filters: [...(view.filters || []), { id: NC.uid(), propId: pid, op: defaultOp(db, pid), value: '' }] }); A.setUI({ dbFilterOpen: view.id }); onClose(); }}><span>⚲</span> Filtrar</button>
        ${groupable && html`<button className="menu-item" onClick=${() => { A.updateView(dbId, view.id, { groupBy: prop.id }); onClose(); }}><span>▤</span> Agrupar por esta propiedad</button>`}
        ${!isTitle && html`<button className="menu-item" onClick=${() => { A.updateView(dbId, view.id, { hidden: [...(view.hidden || []), prop.id] }); onClose(); }}><span>👁</span> Ocultar en esta vista</button>`}
        ${!isTitle && html`<button className="menu-item danger" onClick=${() => { if (confirm(`¿Eliminar la propiedad «${prop.name}»?`)) { A.removeProp(dbId, prop.id); onClose(); } }}><span>🗑</span> Eliminar propiedad</button>`}`}
    <//>`;
  }

  function AddPropMenu({ dbId, anchor, onClose, onAdded }) {
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu">
      <div className="menu-label">Nueva propiedad</div>
      ${NC.PROP_TYPES.map((t) => html`<button key=${t.type} className="menu-item" onClick=${() => { const id = A.addProp(dbId, t.type); onClose(); onAdded && onAdded(id); }}>
        <span className="prop-icon">${t.icon}</span>${t.label}</button>`)}
    <//>`;
  }

  /* ---------- Filtros, orden, agrupación, propiedades ---------- */
  const propsWithTitle = (db) => [{ id: 'title', name: db.titleName, type: 'text' }, ...db.props];
  const defaultOp = (db, propId) => {
    const p = db.props.find((x) => x.id === propId);
    return NC.FILTER_OPS[D.category(p)][0][0];
  };
  const NO_VALUE = ['empty', 'not_empty', 'checked', 'unchecked', 'today', 'past_week', 'next_week', 'this_month', 'overdue'];

  function FilterValue({ db, f, onChange }) {
    const prop = db.props.find((p) => p.id === f.propId);
    if (NO_VALUE.includes(f.op)) return null;
    const cat = D.category(prop);
    if (cat === 'select' || (prop && prop.type === 'multi')) {
      return html`<select className="menu-input" value=${f.value || ''} onChange=${(e) => onChange(e.target.value)}>
        <option value="">Elige…</option>${prop.options.map((o) => html`<option key=${o.id} value=${o.id}>${o.name}</option>`)}</select>`;
    }
    if (cat === 'date') return html`<input className="menu-input" type="date" value=${f.value || ''} onInput=${(e) => onChange(e.target.value)} />`;
    if (cat === 'number') return html`<input className="menu-input" type="number" value=${f.value || ''} onInput=${(e) => onChange(e.target.value)} />`;
    return html`<input className="menu-input" placeholder="Valor…" value=${f.value || ''} onInput=${(e) => onChange(e.target.value)} onKeyDown=${(e) => e.stopPropagation()} />`;
  }

  function FilterPopover({ dbId, db, view, anchor, onClose }) {
    const filters = view.filters || [];
    const set = (next) => A.updateView(dbId, view.id, { filters: next });
    const upd = (id, patch) => set(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu filter-pop">
      ${!filters.length && html`<div className="muted small pad">Sin filtros. Los filtros muestran solo las filas que cumplen las condiciones.</div>`}
      ${filters.map((f, i) => {
        const prop = db.props.find((p) => p.id === f.propId);
        const ops = NC.FILTER_OPS[D.category(f.propId === 'title' ? null : prop)];
        return html`<div key=${f.id} className="filter-row">
          <span className="filter-join">${i === 0 ? 'Donde' : html`<select className="menu-input mini-select" value=${view.filterMode || 'and'} onChange=${(e) => A.updateView(dbId, view.id, { filterMode: e.target.value })} disabled=${i > 1}><option value="and">Y</option><option value="or">O</option></select>`}</span>
          <select className="menu-input" value=${f.propId} onChange=${(e) => upd(f.id, { propId: e.target.value, op: defaultOp(db, e.target.value), value: '' })}>
            ${propsWithTitle(db).map((p) => html`<option key=${p.id} value=${p.id}>${p.name}</option>`)}</select>
          <select className="menu-input" value=${f.op} onChange=${(e) => upd(f.id, { op: e.target.value })}>
            ${ops.map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}</select>
          <${FilterValue} db=${db} f=${f} onChange=${(v) => upd(f.id, { value: v })} />
          <button className="mini" title="Quitar" onClick=${() => set(filters.filter((x) => x.id !== f.id))}>✕</button>
        </div>`;
      })}
      <button className="menu-item" onClick=${() => set([...filters, { id: NC.uid(), propId: 'title', op: 'contains', value: '' }])}><span>+</span> Añadir un filtro</button>
      ${filters.length > 0 && html`<button className="menu-item danger" onClick=${() => set([])}><span>🗑</span> Quitar todos</button>`}
    <//>`;
  }

  function SortPopover({ dbId, db, view, anchor, onClose }) {
    const sorts = view.sorts || (view.sort ? [view.sort] : []);
    const set = (next) => A.updateView(dbId, view.id, { sorts: next, sort: null });
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu filter-pop">
      ${!sorts.length && html`<div className="muted small pad">Sin orden personalizado.</div>`}
      ${sorts.map((s, i) => html`<div key=${i} className="filter-row">
        <select className="menu-input" value=${s.propId} onChange=${(e) => set(sorts.map((x, j) => (j === i ? { ...x, propId: e.target.value } : x)))}>
          ${propsWithTitle(db).map((p) => html`<option key=${p.id} value=${p.id}>${p.name}</option>`)}</select>
        <select className="menu-input" value=${s.dir} onChange=${(e) => set(sorts.map((x, j) => (j === i ? { ...x, dir: e.target.value } : x)))}>
          <option value="asc">Ascendente</option><option value="desc">Descendente</option></select>
        <button className="mini" onClick=${() => set(sorts.filter((_, j) => j !== i))}>✕</button>
      </div>`)}
      <button className="menu-item" onClick=${() => set([...sorts, { propId: 'title', dir: 'asc' }])}><span>+</span> Añadir orden</button>
      ${sorts.length > 0 && html`<button className="menu-item danger" onClick=${() => set([])}><span>🗑</span> Quitar orden</button>`}
    <//>`;
  }

  function GroupPopover({ dbId, db, view, anchor, onClose }) {
    const props = db.props.filter((p) => !['formula', 'rollup', 'files', 'uid'].includes(p.type));
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu">
      <div className="menu-label">Agrupar por</div>
      <button className=${'menu-item' + (!view.groupBy ? ' selected' : '')} onClick=${() => A.updateView(dbId, view.id, { groupBy: null })}><span>∅</span> Ninguno</button>
      ${props.map((p) => html`<button key=${p.id} className=${'menu-item' + (view.groupBy === p.id ? ' selected' : '')} onClick=${() => A.updateView(dbId, view.id, { groupBy: p.id })}>
        <span className="prop-icon">${typeInfo(p.type).icon}</span>${p.name}</button>`)}
      <label className="menu-item toggle-row"><span>👁</span> Ocultar grupos vacíos
        <input type="checkbox" checked=${!!view.hideEmptyGroups} onChange=${() => A.updateView(dbId, view.id, { hideEmptyGroups: !view.hideEmptyGroups })} /></label>
    <//>`;
  }

  function PropsPopover({ dbId, db, view, anchor, onClose }) {
    const hidden = view.hidden || [];
    const toggle = (id) => A.updateView(dbId, view.id, { hidden: hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id] });
    const move = (i, d) => { const props = [...db.props]; const j = i + d; if (j < 0 || j >= props.length) return; [props[i], props[j]] = [props[j], props[i]]; A.updateDb(dbId, { props }); };
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu">
      <div className="menu-label">Propiedades en esta vista</div>
      ${db.props.map((p, i) => html`<div key=${p.id} className="menu-item">
        <span className="prop-icon">${typeInfo(p.type).icon}</span> ${p.name}<span className="grow"></span>
        <button className="mini" title="Subir" onClick=${() => move(i, -1)}>↑</button><button className="mini" title="Bajar" onClick=${() => move(i, 1)}>↓</button>
        <button className="mini" title=${hidden.includes(p.id) ? 'Mostrar' : 'Ocultar'} onClick=${() => toggle(p.id)}>${hidden.includes(p.id) ? '🙈' : '👁'}</button>
      </div>`)}
      <div className="menu-sep"></div>
      <button className="menu-item" onClick=${() => A.updateView(dbId, view.id, { hidden: [] })}><span>👁</span> Mostrar todas</button>
      <button className="menu-item" onClick=${() => A.updateView(dbId, view.id, { hidden: db.props.map((p) => p.id) })}><span>🙈</span> Ocultar todas</button>
    <//>`;
  }

  /* ---------- Vista Tabla ---------- */
  function TableView({ dbPage, db, view, rows }) {
    const dbId = dbPage.id;
    const [menu, setMenu] = useState(null);
    const [addAnchor, setAddAnchor] = useState(null);
    const [rowMenu, setRowMenu] = useState(null);
    const [calcMenu, setCalcMenu] = useState(null);
    const [open, setOpen] = useState(() => new Set());
    const props = visibleProps(db, view);
    const groupProp = view.groupBy && db.props.find((p) => p.id === view.groupBy);
    const resize = (propId) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const prop = propId === 'title' ? null : db.props.find((p) => p.id === propId);
      const startW = prop ? prop.width || 160 : db.titleWidth || 260;
      const move = (ev) => { const w = Math.max(90, startW + ev.clientX - startX); if (prop) prop.width = w; else db.titleWidth = w; A.updatePage(dbId, {}, false); };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); A.updatePage(dbId, {}); };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    };
    const sorts = view.sorts || (view.sort ? [view.sort] : []);
    const sortMark = (id) => { const s = sorts.find((x) => x.propId === id); return s ? (s.dir === 'asc' ? ' ↑' : ' ↓') : ''; };

    // subelementos
    const ids = new Set(rows.map((r) => r.id));
    const children = {};
    if (db.subitems && !view.groupBy) rows.forEach((r) => { if (r.parentRow && ids.has(r.parentRow)) (children[r.parentRow] = children[r.parentRow] || []).push(r); });
    const nest = db.subitems && !view.groupBy; // con grupos, la lista es plana
    const topOf = (list) => (nest ? list.filter((r) => !(r.parentRow && ids.has(r.parentRow))) : list);
    const toggleOpen = (id) => { const n = new Set(open); n.has(id) ? n.delete(id) : n.add(id); setOpen(n); };

    const renderRow = (r, depth = 0) => {
      const kids = children[r.id] || [];
      return html`<${React.Fragment} key=${r.id}>
        <tr>
          <td><div className="title-cell" style=${{ paddingLeft: depth * 22 }}>
            <span className="row-handle" onClick=${(e) => setRowMenu({ anchor: e.currentTarget, row: r })}>⋮⋮</span>
            ${db.subitems && !view.groupBy && html`<button className=${'toggle-arrow small' + (open.has(r.id) ? ' open' : '') + (kids.length ? '' : ' faint')} onClick=${() => toggleOpen(r.id)}>▶</button>`}
            ${r.icon && html`<span className="row-icon"><${NC.Icon} icon=${r.icon} /></span>`}
            <input className="cell-input title-input" value=${r.title} placeholder="Sin título" onInput=${(e) => A.updatePage(r.id, { title: e.target.value })} />
            ${kids.length > 0 && html`<span className="muted small">${kids.length}</span>`}
            <button className="open-btn" onClick=${() => A.setUI({ peek: r.id })}>⤢ ABRIR</button>
          </div></td>
          ${props.map((p) => html`<td key=${p.id}><${NC.Cell} dbId=${dbId} prop=${p} row=${r} /></td>`)}
          <td></td>
        </tr>
        ${db.subitems && open.has(r.id) && html`${kids.map((k) => renderRow(k, depth + 1))}
          <tr><td colSpan=${props.length + 2}><div className="db-add-row sub" style=${{ paddingLeft: 40 + depth * 22 }}
            onClick=${() => { A.addRow(dbId, {}, null, '', r.id); }}>+ Nuevo subelemento</div></td></tr>`}
      <//>`;
    };

    const calcRow = (list) => html`<tr className="calc-row">
      <td onClick=${(e) => setCalcMenu({ anchor: e.currentTarget, key: 'title' })}>${calcText(db, list, null, (view.calcs || {}).title) || html`<span className="calc-hint">Calcular</span>`}</td>
      ${props.map((p) => html`<td key=${p.id} onClick=${(e) => setCalcMenu({ anchor: e.currentTarget, key: p.id })}>${calcText(db, list, p, (view.calcs || {})[p.id]) || html`<span className="calc-hint">Calcular</span>`}</td>`)}
      <td></td>
    </tr>`;

    const header = html`<thead><tr>
      <th style=${{ width: db.titleWidth || 260 }} onClick=${(e) => setMenu({ anchor: e.currentTarget, prop: null })}>
        <span className="prop-icon">Aa</span>${db.titleName}${sortMark('title')}<span className="col-resizer" onMouseDown=${resize('title')} onClick=${(e) => e.stopPropagation()}></span>
      </th>
      ${props.map((p) => html`<th key=${p.id} style=${{ width: p.width || 160 }} onClick=${(e) => setMenu({ anchor: e.currentTarget, prop: p })}>
        <span className="prop-icon">${typeInfo(p.type).icon}</span>${p.name}${sortMark(p.id)}
        <span className="col-resizer" onMouseDown=${resize(p.id)} onClick=${(e) => e.stopPropagation()}></span>
      </th>`)}
      <th className="add-col" onClick=${(e) => setAddAnchor(e.currentTarget)}>+</th>
    </tr></thead>`;

    const groups = groupProp ? D.groupRows(db, rows, groupProp, view.hideEmptyGroups) : null;
    const collapsed = view.collapsed || {};
    const groupDefault = (g) => {
      if (!groupProp || g.key === '__none') return {};
      if (['select', 'status'].includes(groupProp.type)) return { [groupProp.id]: g.key };
      if (groupProp.type === 'multi') return { [groupProp.id]: [g.key] };
      if (groupProp.type === 'checkbox') return { [groupProp.id]: g.key === 'true' };
      return {};
    };

    return html`<div className="db-table-wrap">
      ${!groups && html`<table className="db-table">${header}<tbody>${topOf(rows).map((r) => renderRow(r))}</tbody><tfoot>${calcRow(rows)}</tfoot></table>
        <div className="db-add-row" onClick=${() => A.addRow(dbId)}>+ Nueva</div>`}
      ${groups && groups.map((g) => html`<div key=${g.key} className="table-group">
        <div className="group-head" onClick=${() => A.updateView(dbId, view.id, { collapsed: { ...collapsed, [g.key]: !collapsed[g.key] } })}>
          <span className=${'toggle-arrow small' + (collapsed[g.key] ? '' : ' open')}>▶</span>
          ${['select', 'status', 'multi'].includes(groupProp.type) ? html`<${Tag} opt=${{ name: g.label, color: g.color }} />` : html`<b>${g.label}</b>`}
          <span className="count">${g.rows.length}</span>
        </div>
        ${!collapsed[g.key] && html`<table className="db-table">${header}<tbody>${topOf(g.rows).map((r) => renderRow(r))}</tbody><tfoot>${calcRow(g.rows)}</tfoot></table>
          <div className="db-add-row" onClick=${() => A.addRow(dbId, groupDefault(g))}>+ Nueva</div>`}
      </div>`)}
      <div className="db-count">${rows.length} ${rows.length === 1 ? 'fila' : 'filas'}</div>
      ${menu && html`<${PropMenu} dbId=${dbId} db=${db} prop=${menu.prop} view=${view} anchor=${menu.anchor} onClose=${() => setMenu(null)} />`}
      ${addAnchor && html`<${AddPropMenu} dbId=${dbId} anchor=${addAnchor} onClose=${() => setAddAnchor(null)} />`}
      ${rowMenu && html`<${RowMenu} db=${db} dbId=${dbId} row=${rowMenu.row} anchor=${rowMenu.anchor} onClose=${() => setRowMenu(null)} onSub=${(id) => setOpen(new Set([...open, id]))} />`}
      ${calcMenu && html`<${NC.Popover} anchor=${calcMenu.anchor} onClose=${() => setCalcMenu(null)} className="menu">
        <div className="menu-label">Calcular</div>
        ${NC.CALC_FNS.map(([k, l]) => html`<button key=${k} className=${'menu-item' + ((view.calcs || {})[calcMenu.key] === k ? ' selected' : '')}
          onClick=${() => { A.updateView(dbId, view.id, { calcs: { ...(view.calcs || {}), [calcMenu.key]: k } }); setCalcMenu(null); }}>${l}</button>`)}
      <//>`}
    </div>`;
  }
  const calcText = (db, rows, prop, fn) => {
    if (!fn || fn === 'none') return '';
    const label = (NC.CALC_FNS.find((x) => x[0] === fn) || [])[1];
    return html`<span className="calc-val"><span className="muted">${label}</span> ${D.calc(db, rows, prop, fn)}</span>`;
  };

  function RowMenu({ db, dbId, row, anchor, onClose, onSub }) {
    const run = (fn) => () => { fn(); onClose(); };
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu">
      <button className="menu-item" onClick=${run(() => A.setUI({ peek: row.id }))}><span>⤢</span> Abrir en vista previa</button>
      <button className="menu-item" onClick=${run(() => NC.navigate(row.id))}><span>📄</span> Abrir como página</button>
      ${db.subitems && html`<button className="menu-item" onClick=${run(() => { A.addRow(dbId, {}, null, '', row.id); onSub && onSub(row.id); })}><span>↳</span> Añadir subelemento</button>`}
      ${db.subitems && row.parentRow && html`<button className="menu-item" onClick=${run(() => A.updatePage(row.id, { parentRow: null }))}><span>↰</span> Sacar del elemento principal</button>`}
      <button className="menu-item" onClick=${run(() => A.duplicatePage(row.id))}><span>⧉</span> Duplicar</button>
      <button className="menu-item danger" onClick=${run(() => A.trashPage(row.id))}><span>🗑</span> Eliminar</button>
    <//>`;
  }

  /* ---------- Tarjeta (tablero / galería / lista) ---------- */
  function CardProps({ db, row, props, exclude }) {
    const items = props.filter((p) => p.id !== exclude).map((p) => {
      const v = row.values && row.values[p.id];
      if (['select', 'status'].includes(p.type)) { const o = optionOf(p, v); return o && html`<${Tag} key=${p.id} opt=${o} />`; }
      if (p.type === 'multi') return v && v.length ? html`<span key=${p.id} className="card-tags">${v.map((id) => optionOf(p, id)).filter(Boolean).map((o) => html`<${Tag} key=${o.id} opt=${o} />`)}</span>` : null;
      if (p.type === 'checkbox') return v ? html`<span key=${p.id} className="card-prop">☑ ${p.name}</span>` : null;
      const t = D.text(db, row, p);
      if (!t) return null;
      return html`<span key=${p.id} className="card-prop" title=${p.name}>${p.type === 'date' ? '📅 ' : p.type === 'relation' ? '↗ ' : ''}${t}</span>`;
    }).filter(Boolean);
    return items.length ? html`<div className="card-props">${items}</div>` : null;
  }
  const Title = ({ r }) => html`${r.icon && html`<span><${NC.Icon} icon=${r.icon} /> </span>`}${r.title || html`<span className="muted">Sin título</span>`}`;

  /* ---------- Vista Tablero (Kanban) ---------- */
  function BoardView({ dbPage, db, view, rows }) {
    const dbId = dbPage.id;
    const candidates = db.props.filter((p) => ['select', 'status', 'checkbox'].includes(p.type));
    const group = candidates.find((p) => p.id === view.groupBy) || candidates.find((p) => p.type === 'status') || candidates[0];
    const drag = useRef(null);
    const [over, setOver] = useState(null);
    const [newGroup, setNewGroup] = useState(null);
    if (!group) {
      return html`<div className="db-empty">
        <p>El tablero agrupa las filas por una propiedad de <b>estado</b> o <b>selección</b>.</p>
        <button className="btn-primary" onClick=${() => A.updateView(dbId, view.id, { groupBy: A.addProp(dbId, 'status', 'Estado') })}>Crear propiedad «Estado»</button>
      </div>`;
    }
    const cols = D.groupRows(db, rows, group, view.hideEmptyGroups);
    const props = visibleProps(db, view);
    const valueFor = (key) => (group.type === 'checkbox' ? key === 'true' : key === '__none' ? null : key);
    const dropOn = (key, beforeId) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = drag.current;
      drag.current = null;
      setOver(null);
      if (!id) return;
      A.setValue(id, group.id, valueFor(key));
      if (!(view.sorts || []).length) A.moveRow(dbId, id, beforeId);
    };
    return html`<div className="board">
      ${cols.map((col) => html`<div key=${col.key} className=${'board-col' + (over === col.key ? ' over' : '')}
          onDragOver=${(e) => { if (drag.current) { e.preventDefault(); setOver(col.key); } }} onDrop=${dropOn(col.key, null)}>
          <div className="board-col-head">
            <${Tag} opt=${{ name: col.label, color: col.color }} /><span className="count">${col.rows.length}</span>
            <span className="grow"></span>
            <button className="mini" title="Añadir" onClick=${() => A.setUI({ peek: A.addRow(dbId, { [group.id]: valueFor(col.key) }) })}>+</button>
          </div>
          ${col.rows.map((r) => html`<div key=${r.id} className="card" draggable=${true}
              onDragStart=${(e) => { drag.current = r.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'row'); }}
              onDragEnd=${() => { drag.current = null; setOver(null); }}
              onDrop=${dropOn(col.key, r.id)} onClick=${() => A.setUI({ peek: r.id })}>
            <div className="card-title"><${Title} r=${r} /></div>
            <${CardProps} db=${db} row=${r} props=${props} exclude=${group.id} />
          </div>`)}
          <button className="board-add" onClick=${() => A.setUI({ peek: A.addRow(dbId, { [group.id]: valueFor(col.key) }) })}>+ Nueva</button>
        </div>`)}
      ${group.type !== 'checkbox' && html`<div className="board-col ghost">
        ${newGroup == null
          ? html`<button className="board-add" onClick=${() => setNewGroup('')}>+ Añadir grupo</button>`
          : html`<input className="menu-input" autoFocus placeholder="Nombre del grupo" value=${newGroup}
              onInput=${(e) => setNewGroup(e.target.value)} onBlur=${() => setNewGroup(null)}
              onKeyDown=${(e) => {
                if (e.key === 'Enter' && newGroup.trim()) { const id = A.addOption(dbId, group.id, newGroup.trim()); if (group.type === 'status') A.updateOption(dbId, group.id, id, { group: 'todo' }); setNewGroup(null); }
                if (e.key === 'Escape') setNewGroup(null);
              }} />`}
      </div>`}
    </div>`;
  }

  /* ---------- Vista Calendario ---------- */
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const iso = D.iso;
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
    start.setDate(1 - ((month.getDay() + 6) % 7));
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
            onDragOver=${(e) => { if (drag.current) { e.preventDefault(); setOver(key); } }} onDragLeave=${() => setOver(null)}
            onDrop=${(e) => { e.preventDefault(); if (drag.current) A.setValue(drag.current, prop.id, key); drag.current = null; setOver(null); }}>
            <div className="cal-num"><span>${d.getDate()}</span>
              <button className="mini cal-add" title="Nueva" onClick=${() => A.setUI({ peek: A.addRow(dbId, { [prop.id]: key }) })}>+</button></div>
            ${(byDay[key] || []).map((r) => html`<div key=${r.id} className="cal-item" draggable=${true}
              onDragStart=${(e) => { drag.current = r.id; e.dataTransfer.setData('text/plain', 'row'); }}
              onClick=${() => A.setUI({ peek: r.id })}>${r.icon ? NC.iconText(r.icon) + ' ' : ''}${r.title || 'Sin título'}</div>`)}
          </div>`;
        })}
      </div>
    </div>`;
  }

  /* ---------- Vista Galería ---------- */
  function GalleryView({ dbPage, db, view, rows }) {
    const props = visibleProps(db, view);
    const preview = (r) => (r.blocks || []).filter((b) => b.html || b.text).slice(0, 4).map((b) => NC.htmlToText(b.html || b.text)).join('\n');
    const size = view.cardSize || 'medium';
    return html`<div className=${'gallery size-' + size}>
      ${rows.map((r) => {
        const img = (r.blocks || []).find((b) => b.type === 'image' && b.url);
        return html`<div key=${r.id} className="g-card" onClick=${() => A.setUI({ peek: r.id })}>
          <div className="g-preview">${r.cover ? html`<${GalleryCover} cover=${r.cover} />` : img ? html`<${NC.AssetImg} src=${img.url} />` : html`<pre>${preview(r)}</pre>`}</div>
          <div className="g-body"><div className="card-title"><${Title} r=${r} /></div><${CardProps} db=${db} row=${r} props=${props} /></div>
        </div>`;
      })}
      <div className="g-card g-new" onClick=${() => A.setUI({ peek: A.addRow(dbPage.id) })}>+ Nueva</div>
    </div>`;
  }
  function GalleryCover({ cover }) {
    const r = NC.useAsset(cover);
    const st = NC.coverStyle(r || cover);
    return html`<div className="g-cover" style=${st || {}}></div>`;
  }

  /* ---------- Vista Lista ---------- */
  function ListView({ dbPage, db, view, rows }) {
    const props = visibleProps(db, view);
    return html`<div className="list-view">
      ${rows.map((r) => html`<div key=${r.id} className="list-row" onClick=${() => A.setUI({ peek: r.id })}>
        <span className="list-icon"><${NC.Icon} icon=${r.icon} /></span>
        <span className="list-title">${r.title || html`<span className="muted">Sin título</span>`}</span>
        <span className="grow"></span>
        <${CardProps} db=${db} row=${r} props=${props} />
      </div>`)}
      <div className="db-add-row" onClick=${() => A.setUI({ peek: A.addRow(dbPage.id) })}>+ Nueva</div>
    </div>`;
  }

  /* ---------- Vista Cronograma (timeline) ---------- */
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const dayDiff = (a, b) => Math.round((a - b) / 864e5);
  function TimelineView({ dbPage, db, view, rows }) {
    const dbId = dbPage.id;
    const dates = db.props.filter((p) => p.type === 'date');
    const tl = view.timeline || {};
    const sp = dates.find((p) => p.id === tl.start) || dates[0];
    const ep = dates.find((p) => p.id === tl.end && p.id !== (sp && sp.id)) || null;
    const scale = view.tlScale || 'month';
    const dayW = { week: 56, month: 22, quarter: 8 }[scale];
    const span = { week: 35, month: 92, quarter: 270 }[scale];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [origin, setOrigin] = useState(() => addDays(today, -7));
    const [dragging, setDragging] = useState(null);
    if (!sp) {
      return html`<div className="db-empty"><p>El cronograma necesita propiedades de <b>fecha</b> (inicio y, opcionalmente, fin).</p>
        <button className="btn-primary" onClick=${() => { const s = A.addProp(dbId, 'date', 'Inicio'); const e = A.addProp(dbId, 'date', 'Fin'); A.updateView(dbId, view.id, { timeline: { start: s, end: e } }); }}>Crear «Inicio» y «Fin»</button></div>`;
    }
    const startOf = (r) => D.toDate(r.values && r.values[sp.id]);
    const endOf = (r) => (ep && D.toDate(r.values && r.values[ep.id])) || startOf(r);
    const days = Array.from({ length: span }, (_, i) => addDays(origin, i));
    const months = [];
    days.forEach((d, i) => { const k = d.getMonth() + '-' + d.getFullYear(); if (!months.length || months[months.length - 1].k !== k) months.push({ k, label: MONTHS[d.getMonth()] + ' ' + d.getFullYear(), from: i, n: 0 }); months[months.length - 1].n++; });

    const startDrag = (r, mode) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      const x0 = e.clientX;
      const s0 = startOf(r), e0 = endOf(r);
      let delta = 0;
      const move = (ev) => { delta = Math.round((ev.clientX - x0) / dayW); setDragging({ id: r.id, mode, delta }); };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        setDragging(null);
        if (!delta) return A.setUI({ peek: r.id });
        if (mode === 'move') {
          A.setValue(r.id, sp.id, iso(addDays(s0, delta)));
          if (ep && r.values && r.values[ep.id]) A.setValue(r.id, ep.id, iso(addDays(e0, delta)));
        } else if (mode === 'end') {
          if (!ep) return NC.toast('Elige una propiedad de fin en «··· > Cronograma» para cambiar la duración');
          const ne = addDays(e0, delta);
          A.setValue(r.id, ep.id, iso(ne < s0 ? s0 : ne));
        }
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    };
    const shift = (n) => setOrigin(addDays(origin, n));
    const todayX = dayDiff(today, origin) * dayW;
    return html`<div className="timeline">
      <div className="tl-toolbar">
        ${['week', 'month', 'quarter'].map((s) => html`<button key=${s} className=${'chip' + (scale === s ? ' active' : '')} onClick=${() => A.updateView(dbId, view.id, { tlScale: s })}>${{ week: 'Semana', month: 'Mes', quarter: 'Trimestre' }[s]}</button>`)}
        <span className="grow"></span>
        <button className="btn-ghost" onClick=${() => shift(-Math.round(span / 3))}>‹</button>
        <button className="btn-ghost" onClick=${() => setOrigin(addDays(today, -7))}>Hoy</button>
        <button className="btn-ghost" onClick=${() => shift(Math.round(span / 3))}>›</button>
      </div>
      <div className="tl-scroll">
        <div className="tl-grid" style=${{ width: 240 + span * dayW }}>
          <div className="tl-head">
            <div className="tl-label-col">${db.titleName}</div>
            <div className="tl-days" style=${{ width: span * dayW }}>
              <div className="tl-months">${months.map((m) => html`<div key=${m.k} style=${{ left: m.from * dayW, width: m.n * dayW }}>${m.label}</div>`)}</div>
              <div className="tl-ticks">${days.map((d, i) => (scale !== 'quarter' || d.getDate() === 1 || d.getDay() === 1) && html`<div key=${i} className=${'tl-tick' + (iso(d) === iso(today) ? ' today' : '') + (d.getDay() === 0 || d.getDay() === 6 ? ' weekend' : '')} style=${{ left: i * dayW, width: dayW }}>${scale === 'quarter' ? (d.getDay() === 1 ? d.getDate() : '') : d.getDate()}</div>`)}</div>
            </div>
          </div>
          ${rows.map((r) => {
            const s = startOf(r);
            const e = endOf(r);
            let left = s ? dayDiff(s, origin) * dayW : null;
            let width = s ? (dayDiff(e, s) + 1) * dayW : 0;
            if (dragging && dragging.id === r.id) { if (dragging.mode === 'move') left += dragging.delta * dayW; else width = Math.max(dayW, width + dragging.delta * dayW); }
            return html`<div key=${r.id} className="tl-row">
              <div className="tl-label-col" onClick=${() => A.setUI({ peek: r.id })}><${NC.Icon} icon=${r.icon} /> ${r.title || 'Sin título'}</div>
              <div className="tl-track" style=${{ width: span * dayW }}>
                ${s ? html`<div className="tl-bar" style=${{ left, width }} onMouseDown=${startDrag(r, 'move')} title=${(r.title || '') + ' · ' + NC.formatDate(iso(s)) + (ep ? ' → ' + NC.formatDate(iso(e)) : '')}>
                    <span>${r.title || 'Sin título'}</span><span className="tl-handle" onMouseDown=${startDrag(r, 'end')}></span></div>`
                  : html`<button className="tl-nodate" onClick=${() => A.setValue(r.id, sp.id, NC.todayISO())}>+ Programar hoy</button>`}
              </div>
            </div>`;
          })}
          ${todayX >= 0 && todayX <= span * dayW && html`<div className="tl-today" style=${{ left: 240 + todayX + dayW / 2 }}></div>`}
        </div>
      </div>
      <div className="db-add-row" onClick=${() => A.setUI({ peek: A.addRow(dbId, { [sp.id]: NC.todayISO() }) })}>+ Nueva</div>
    </div>`;
  }

  /* ---------- Gráficos ---------- */
  const PALETTE = ['blue', 'green', 'orange', 'purple', 'pink', 'red', 'yellow', 'brown', 'gray'];
  const colorVar = (c, i) => `var(--c-${c && c !== 'default' ? c : PALETTE[i % PALETTE.length]})`;
  NC.chartData = (db, rows, cfg) => {
    const gp = db.props.find((p) => p.id === cfg.groupBy) || db.props.find((p) => ['status', 'select'].includes(p.type));
    if (!gp) return { error: 'Elige una propiedad para agrupar' };
    const metric = cfg.metric || 'count';
    const [fn, pid] = metric.split(':');
    const mp = pid && db.props.find((p) => p.id === pid);
    const groups = D.groupRows(db, rows, gp, cfg.hideEmpty !== false);
    return {
      prop: gp,
      data: groups.map((g, i) => ({ label: g.label, color: g.color && g.color !== 'gray' ? g.color : PALETTE[i % PALETTE.length], value: fn === 'count' || !mp ? g.rows.length : Number(D.aggregate(g.rows.map((r) => D.value(db, r, mp)), fn)) || 0 })),
      format: mp && mp.format,
    };
  };

  NC.ChartSvg = function ChartSvg({ data, type = 'bar', format, height = 260 }) {
    if (!data.length) return html`<div className="muted pad">Sin datos para mostrar.</div>`;
    const max = Math.max(1, ...data.map((d) => d.value));
    const fmt = (v) => D.formatNumber(v, format) || '0';
    if (type === 'donut') {
      const total = data.reduce((a, d) => a + d.value, 0) || 1;
      let acc = 0;
      const R = 80, r = 50, cx = 100, cy = 100;
      const arc = (a0, a1) => {
        const p = (a, rad) => [cx + rad * Math.cos(a - Math.PI / 2), cy + rad * Math.sin(a - Math.PI / 2)];
        const big = a1 - a0 > Math.PI ? 1 : 0;
        const [x0, y0] = p(a0, R), [x1, y1] = p(a1, R), [x2, y2] = p(a1, r), [x3, y3] = p(a0, r);
        return `M${x0},${y0} A${R},${R} 0 ${big} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${big} 0 ${x3},${y3} Z`;
      };
      return html`<div className="chart donut-wrap">
        <svg viewBox="0 0 200 200" className="donut">${data.map((d, i) => {
          const a0 = (acc / total) * Math.PI * 2;
          acc += d.value;
          const a1 = Math.min((acc / total) * Math.PI * 2, Math.PI * 2 - 0.0001);
          return d.value ? html`<path key=${i} d=${arc(a0, a1)} style=${{ fill: colorVar(d.color, i) }}><title>${d.label}: ${fmt(d.value)}</title></path>` : null;
        })}<text x="100" y="98" textAnchor="middle" className="donut-total">${fmt(total)}</text><text x="100" y="116" textAnchor="middle" className="donut-sub">total</text></svg>
        <div className="legend">${data.map((d, i) => html`<div key=${i}><span className="dot" style=${{ background: colorVar(d.color, i) }}></span>${d.label} <b>${fmt(d.value)}</b> <span className="muted">${Math.round((d.value / total) * 100)}%</span></div>`)}</div>
      </div>`;
    }
    const W = 600, H = height, pad = 30, bw = (W - pad * 2) / data.length;
    const y = (v) => H - 40 - (v / max) * (H - 70);
    if (type === 'line') {
      const pts = data.map((d, i) => `${pad + bw * i + bw / 2},${y(d.value)}`).join(' ');
      return html`<svg viewBox=${`0 0 ${W} ${H}`} className="chart">
        <line x1=${pad} x2=${W - pad} y1=${H - 40} y2=${H - 40} className="axis" />
        <polyline points=${pts} className="line" />
        ${data.map((d, i) => html`<g key=${i}><circle cx=${pad + bw * i + bw / 2} cy=${y(d.value)} r="4" className="pt" /><text x=${pad + bw * i + bw / 2} y=${y(d.value) - 10} textAnchor="middle" className="val">${fmt(d.value)}</text>
          <text x=${pad + bw * i + bw / 2} y=${H - 20} textAnchor="middle" className="lbl">${String(d.label).slice(0, 14)}</text></g>`)}
      </svg>`;
    }
    return html`<svg viewBox=${`0 0 ${W} ${H}`} className="chart">
      <line x1=${pad} x2=${W - pad} y1=${H - 40} y2=${H - 40} className="axis" />
      ${data.map((d, i) => {
        const bx = pad + bw * i + bw * 0.15, w = bw * 0.7, top = y(d.value);
        return html`<g key=${i}><rect x=${bx} y=${top} width=${w} height=${H - 40 - top} rx="4" style=${{ fill: colorVar(d.color, i) }}><title>${d.label}: ${fmt(d.value)}</title></rect>
          <text x=${bx + w / 2} y=${top - 6} textAnchor="middle" className="val">${fmt(d.value)}</text>
          <text x=${bx + w / 2} y=${H - 20} textAnchor="middle" className="lbl">${String(d.label).slice(0, 14)}</text></g>`;
      })}
    </svg>`;
  };

  function ChartConfig({ db, cfg, onChange }) {
    const groupable = db.props.filter((p) => !['formula', 'rollup', 'files', 'uid'].includes(p.type));
    const numeric = db.props.filter((p) => ['number', 'formula', 'rollup'].includes(p.type));
    return html`<div className="chart-config">
      ${[['bar', '▮ Barras'], ['line', '⟋ Líneas'], ['donut', '◔ Anillo']].map(([t, l]) => html`<button key=${t} className=${'chip' + ((cfg.type || 'bar') === t ? ' active' : '')} onClick=${() => onChange({ type: t })}>${l}</button>`)}
      <span className="muted small">Agrupar por</span>
      <select className="menu-input mini-select" value=${cfg.groupBy || ''} onChange=${(e) => onChange({ groupBy: e.target.value })}>
        <option value="">(automático)</option>${groupable.map((p) => html`<option key=${p.id} value=${p.id}>${p.name}</option>`)}</select>
      <span className="muted small">Valor</span>
      <select className="menu-input mini-select" value=${cfg.metric || 'count'} onChange=${(e) => onChange({ metric: e.target.value })}>
        <option value="count">Número de filas</option>
        ${numeric.flatMap((p) => [['sum', 'Suma'], ['avg', 'Promedio'], ['max', 'Máximo']].map(([f, l]) => html`<option key=${f + p.id} value=${f + ':' + p.id}>${l} de ${p.name}</option>`))}
      </select>
    </div>`;
  }

  function ChartView({ dbPage, db, view, rows }) {
    const cfg = view.chart || {};
    const res = NC.chartData(db, rows, cfg);
    return html`<div className="chart-view">
      <${ChartConfig} db=${db} cfg=${cfg} onChange=${(p) => A.updateView(dbPage.id, view.id, { chart: { ...cfg, ...p } })} />
      ${res.error ? html`<div className="db-empty">${res.error}</div>` : html`<${NC.ChartSvg} data=${res.data} type=${cfg.type} format=${res.format} />`}
    </div>`;
  }

  /* ---------- Vista Formulario ---------- */
  function FormView({ dbPage, db, view }) {
    const dbId = dbPage.id;
    const editable = db.props.filter((p) => !NC.isReadonlyProp(p) && !['relation', 'files'].includes(p.type));
    const cfg = view.form || {};
    const fields = (cfg.fields || editable.map((p) => p.id)).map((id) => editable.find((p) => p.id === id)).filter(Boolean);
    const [draft, setDraft] = useState({ title: '', values: {} });
    const [edit, setEdit] = useState(false);
    const [sent, setSent] = useState(0);
    const setV = (pid, v) => setDraft({ ...draft, values: { ...draft.values, [pid]: v } });
    const save = (patch) => A.updateView(dbId, view.id, { form: { ...cfg, ...patch } });
    const submit = (e) => {
      e.preventDefault();
      if (!draft.title.trim()) return NC.toast(`Completa «${db.titleName}»`);
      A.addRow(dbId, draft.values, null, draft.title.trim());
      setDraft({ title: '', values: {} });
      setSent(sent + 1);
      NC.toast('Respuesta guardada en ' + (dbPage.title || 'la base de datos'));
    };
    const input = (p) => {
      const v = draft.values[p.id];
      switch (p.type) {
        case 'checkbox': return html`<input type="checkbox" checked=${!!v} onChange=${() => setV(p.id, !v)} />`;
        case 'number': return html`<input className="form-input" type="number" step="any" value=${v ?? ''} onInput=${(e) => setV(p.id, e.target.value === '' ? null : Number(e.target.value))} />`;
        case 'date': return html`<input className="form-input" type="date" value=${v || ''} onInput=${(e) => setV(p.id, e.target.value || null)} />`;
        case 'select': case 'status': return html`<div className="form-options">${p.options.map((o) => html`<label key=${o.id} className="form-opt"><input type="radio" name=${p.id} checked=${v === o.id} onChange=${() => setV(p.id, o.id)} /><${Tag} opt=${o} /></label>`)}</div>`;
        case 'multi': return html`<div className="form-options">${p.options.map((o) => html`<label key=${o.id} className="form-opt"><input type="checkbox" checked=${(v || []).includes(o.id)} onChange=${() => setV(p.id, (v || []).includes(o.id) ? v.filter((x) => x !== o.id) : [...(v || []), o.id])} /><${Tag} opt=${o} /></label>`)}</div>`;
        default: return html`<input className="form-input" type=${p.type === 'email' ? 'email' : p.type === 'phone' ? 'tel' : p.type === 'url' ? 'url' : 'text'} value=${v || ''} onInput=${(e) => setV(p.id, e.target.value)} onKeyDown=${(e) => e.stopPropagation()} />`;
      }
    };
    return html`<div className="form-view">
      <div className="form-bar"><button className="chip" onClick=${() => setEdit(!edit)}>${edit ? '✓ Terminar edición' : '✎ Editar formulario'}</button><span className="muted small">${sent ? sent + ' respuestas enviadas en esta sesión' : ''}</span></div>
      <form className="form-card" onSubmit=${submit}>
        ${edit ? html`<input className="form-title-input" defaultValue=${cfg.title || dbPage.title || 'Formulario'} onBlur=${(e) => save({ title: e.target.value })} />
              <textarea className="form-input" rows="2" placeholder="Descripción (opcional)" defaultValue=${cfg.desc || ''} onBlur=${(e) => save({ desc: e.target.value })}></textarea>`
          : html`<h2>${cfg.title || dbPage.title || 'Formulario'}</h2>${cfg.desc && html`<p className="muted">${cfg.desc}</p>`}`}
        <label className="form-field"><span>${db.titleName} <span className="danger">*</span></span>
          <input className="form-input" value=${draft.title} onInput=${(e) => setDraft({ ...draft, title: e.target.value })} onKeyDown=${(e) => e.stopPropagation()} /></label>
        ${fields.map((p) => html`<div key=${p.id} className="form-field"><span>${p.name}</span>${input(p)}</div>`)}
        ${edit && html`<div className="form-edit"><div className="menu-label">Preguntas del formulario</div>
          ${editable.map((p) => html`<label key=${p.id} className="menu-item toggle-row"><span className="prop-icon">${typeInfo(p.type).icon}</span> ${p.name}
            <input type="checkbox" checked=${fields.includes(p)} onChange=${() => save({ fields: fields.includes(p) ? fields.filter((x) => x !== p).map((x) => x.id) : [...fields.map((x) => x.id), p.id] })} /></label>`)}</div>`}
        <button className="btn-primary form-submit" type="submit">Enviar</button>
      </form>
    </div>`;
  }

  /* ---------- Vista Panel (dashboard) ---------- */
  function WidgetEditor({ w, onChange, onRemove, anchor, onClose }) {
    const s = NC.useStore();
    const dbs = Object.values(s.pages).filter((p) => p.type === 'database' && !A.isInTrash(p.id));
    const target = D.findDb(w.dbId);
    const numeric = target ? target.db.props.filter((p) => ['number', 'formula', 'rollup'].includes(p.type)) : [];
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu widget-editor" align="right">
      <div className="menu-label">Título</div>
      <input className="menu-input" defaultValue=${w.title || ''} onBlur=${(e) => onChange({ title: e.target.value })} />
      <div className="menu-label">Tipo</div>
      <select className="menu-input" value=${w.type} onChange=${(e) => onChange({ type: e.target.value })}>
        <option value="number">Número (KPI)</option><option value="chart">Gráfico</option><option value="list">Lista de filas</option></select>
      <div className="menu-label">Base de datos</div>
      <select className="menu-input" value=${w.dbId || ''} onChange=${(e) => onChange({ dbId: e.target.value, viewId: null })}>
        ${dbs.map((d) => html`<option key=${d.id} value=${d.id}>${NC.iconText(d.icon, '🗃️')} ${d.title || 'Sin título'}</option>`)}</select>
      ${target && html`<div className="menu-label">Usar los filtros de la vista</div>
        <select className="menu-input" value=${w.viewId || ''} onChange=${(e) => onChange({ viewId: e.target.value || null })}>
          <option value="">Todas las filas</option>${target.db.views.filter((v) => v.type !== 'dashboard').map((v) => html`<option key=${v.id} value=${v.id}>${v.name}</option>`)}</select>`}
      ${w.type === 'number' && html`<div className="menu-label">Valor</div>
        <select className="menu-input" value=${w.metric || 'count'} onChange=${(e) => onChange({ metric: e.target.value })}>
          <option value="count">Número de filas</option>
          ${numeric.flatMap((p) => [['sum', 'Suma'], ['avg', 'Promedio'], ['min', 'Mínimo'], ['max', 'Máximo']].map(([f, l]) => html`<option key=${f + p.id} value=${f + ':' + p.id}>${l} de ${p.name}</option>`))}</select>`}
      ${w.type === 'chart' && target && html`<${ChartConfig} db=${target.db} cfg=${w.chart || {}} onChange=${(p) => onChange({ chart: { ...(w.chart || {}), ...p } })} />`}
      <label className="menu-item toggle-row"><span>↔</span> Ancho completo<input type="checkbox" checked=${w.size === 2} onChange=${() => onChange({ size: w.size === 2 ? 1 : 2 })} /></label>
      <button className="menu-item danger" onClick=${onRemove}><span>🗑</span> Quitar widget</button>
    <//>`;
  }

  function Widget({ w, onChange, onRemove }) {
    NC.useStore();
    const [anchor, setAnchor] = useState(null);
    const target = D.findDb(w.dbId);
    let body;
    if (!target) body = html`<div className="muted">La base de datos ya no existe.</div>`;
    else {
      const v = target.db.views.find((x) => x.id === w.viewId) || { filters: [], sorts: [] };
      const rows = D.viewRows(target.db, v);
      if (w.type === 'number') {
        const [fn, pid] = (w.metric || 'count').split(':');
        const p = pid && target.db.props.find((x) => x.id === pid);
        const val = fn === 'count' || !p ? rows.length : D.aggregate(rows.map((r) => D.value(target.db, r, p)), fn);
        body = html`<div className="kpi">${D.formatNumber(typeof val === 'number' ? val : 0, p && p.format)}</div><div className="muted small">${fn === 'count' ? 'filas' : (NC.CALC_FNS.find((x) => x[0] === fn) || [])[1] + ' de ' + (p ? p.name : '')}</div>`;
      } else if (w.type === 'chart') {
        const res = NC.chartData(target.db, rows, w.chart || {});
        body = res.error ? html`<div className="muted">${res.error}</div>` : html`<${NC.ChartSvg} data=${res.data} type=${(w.chart || {}).type} format=${res.format} height=${220} />`;
      } else {
        body = html`<div className="w-list">${rows.slice(0, 8).map((r) => html`<div key=${r.id} className="w-row" onClick=${() => A.setUI({ peek: r.id })}><${NC.Icon} icon=${r.icon} /> ${r.title || 'Sin título'}</div>`)}
          ${rows.length > 8 && html`<div className="muted small">y ${rows.length - 8} más…</div>`}${!rows.length && html`<div className="muted small">Sin filas</div>`}</div>`;
      }
    }
    return html`<div className=${'widget' + (w.size === 2 ? ' wide' : '')}>
      <div className="widget-head"><b>${w.title || (target ? target.title : 'Widget')}</b><span className="grow"></span>
        <button className="mini" onClick=${(e) => setAnchor(e.currentTarget)}>⚙</button></div>
      ${body}
      ${anchor && html`<${WidgetEditor} w=${w} onChange=${onChange} onRemove=${() => { setAnchor(null); onRemove(); }} anchor=${anchor} onClose=${() => setAnchor(null)} />`}
    </div>`;
  }

  function DashboardView({ dbPage, view }) {
    const widgets = view.widgets || [];
    const save = (next) => A.updateView(dbPage.id, view.id, { widgets: next });
    const add = (type) => save([...widgets, { id: NC.uid(), type, dbId: dbPage.id, title: { number: 'Total', chart: 'Por estado', list: 'Filas' }[type], size: type === 'chart' ? 2 : 1 }]);
    return html`<div className="dashboard">
      ${!widgets.length && html`<div className="muted pad">Un panel combina indicadores, gráficos y listas de una o varias bases de datos.</div>`}
      <div className="widgets">${widgets.map((w) => html`<${Widget} key=${w.id} w=${w}
        onChange=${(p) => save(widgets.map((x) => (x.id === w.id ? { ...x, ...p } : x)))} onRemove=${() => save(widgets.filter((x) => x.id !== w.id))} />`)}</div>
      <div className="dash-add">
        <button className="chip" onClick=${() => add('number')}>+ Número</button>
        <button className="chip" onClick=${() => add('chart')}>+ Gráfico</button>
        <button className="chip" onClick=${() => add('list')}>+ Lista</button>
      </div>
    </div>`;
  }

  /* ---------- Contenedor con pestañas de vistas ---------- */
  const BODIES = { table: TableView, board: BoardView, calendar: CalendarView, gallery: GalleryView, list: ListView, timeline: TimelineView, chart: ChartView, form: FormView, dashboard: DashboardView };

  NC.DatabaseView = function DatabaseView({ page, inline = false }) {
    NC.useStore();
    const db = page.db;
    const view = db.views.find((v) => v.id === db.viewId) || db.views[0];
    const [pop, setPop] = useState(null); // {kind, anchor}
    const filterBtn = useRef(null);
    const rows = D.viewRows(db, view);
    const Body = BODIES[view.type] || TableView;
    const open = (kind) => (e) => setPop({ kind, anchor: e.currentTarget });
    const close = () => setPop(null);
    const nf = (view.filters || []).filter((f) => f.propId).length;
    const ns = (view.sorts || (view.sort ? [view.sort] : [])).length;
    const dataView = !['form', 'dashboard'].includes(view.type);
    useEffect(() => {
      // abrir el panel de filtros tras «Filtrar» en el menú de una columna
      if (NC.getState().ui.dbFilterOpen === view.id) {
        A.setUI({ dbFilterOpen: null });
        if (filterBtn.current) setPop({ kind: 'filter', anchor: filterBtn.current });
      }
    });
    return html`<div className=${'database' + (inline ? ' inline' : '')}>
      <div className="db-toolbar">
        <div className="db-tabs">
          ${db.views.map((v) => html`<button key=${v.id} className=${'db-tab' + (v.id === view.id ? ' active' : '')}
            onClick=${(e) => (v.id === view.id ? setPop({ kind: 'view', anchor: e.currentTarget }) : ((db.viewId = v.id), A.updatePage(page.id, {})))}>
            <span>${VIEW_ICONS[v.type]}</span> ${v.name}</button>`)}
          <button className="db-tab add" title="Añadir vista" onClick=${open('add')}>+</button>
        </div>
        <span className="grow"></span>
        ${dataView && html`
          <button ref=${filterBtn} className=${'tool-btn' + (nf ? ' on' : '')} onClick=${open('filter')} title="Filtrar">⚲ Filtro${nf ? ' · ' + nf : ''}</button>
          <button className=${'tool-btn' + (ns ? ' on' : '')} onClick=${open('sort')} title="Ordenar">⇅ Orden${ns ? ' · ' + ns : ''}</button>
          ${['table', 'board', 'list', 'gallery'].includes(view.type) && html`<button className=${'tool-btn' + (view.groupBy ? ' on' : '')} onClick=${open('group')}>▤ Agrupar</button>`}
          <button className="tool-btn" onClick=${open('props')}>👁 Propiedades</button>
          <input className="db-search" placeholder="🔍 Buscar…" value=${view.filter || ''} onInput=${(e) => A.updateView(page.id, view.id, { filter: e.target.value })} />`}
        <button className="tool-btn" onClick=${open('settings')} title="Configuración de la vista">···</button>
        ${view.type !== 'form' && html`<button className="btn-primary" onClick=${() => A.setUI({ peek: A.addRow(page.id) })}>Nuevo</button>`}
      </div>
      ${nf > 0 && dataView && html`<div className="active-filters">${(view.filters || []).filter((f) => f.propId).map((f) => {
        const p = f.propId === 'title' ? { name: db.titleName } : db.props.find((x) => x.id === f.propId) || { name: '?' };
        const op = (Object.values(NC.FILTER_OPS).flat().find((x) => x[0] === f.op) || [])[1];
        const val = f.value && p.options ? (p.options.find((o) => o.id === f.value) || { name: f.value }).name : f.value;
        return html`<button key=${f.id} className="chip on" onClick=${open('filter')}>${p.name}: ${op} ${val || ''}</button>`;
      })}</div>`}
      <${Body} dbPage=${page} db=${db} view=${view} rows=${rows} />
      ${pop && pop.kind === 'filter' && html`<${FilterPopover} dbId=${page.id} db=${db} view=${view} anchor=${pop.anchor} onClose=${close} />`}
      ${pop && pop.kind === 'sort' && html`<${SortPopover} dbId=${page.id} db=${db} view=${view} anchor=${pop.anchor} onClose=${close} />`}
      ${pop && pop.kind === 'group' && html`<${GroupPopover} dbId=${page.id} db=${db} view=${view} anchor=${pop.anchor} onClose=${close} />`}
      ${pop && pop.kind === 'props' && html`<${PropsPopover} dbId=${page.id} db=${db} view=${view} anchor=${pop.anchor} onClose=${close} />`}
      ${pop && pop.kind === 'add' && html`<${NC.Popover} anchor=${pop.anchor} onClose=${close} className="menu">
        <div className="menu-label">Añadir vista</div>
        ${Object.keys(VIEW_ICONS).map((t) => html`<button key=${t} className="menu-item" onClick=${() => { A.addView(page.id, t); close(); }}>
          <span>${VIEW_ICONS[t]}</span> ${NC.VIEW_NAMES[t]}</button>`)}
      <//>`}
      ${pop && (pop.kind === 'view' || pop.kind === 'settings') && html`<${ViewMenu} page=${page} view=${view} anchor=${pop.anchor} onClose=${close} />`}
    </div>`;
  };

  function ViewMenu({ page, view, anchor, onClose }) {
    const db = page.db;
    const [name, setName] = useState(view.name);
    const commit = () => name.trim() && name !== view.name && A.updateView(page.id, view.id, { name: name.trim() });
    const dates = db.props.filter((p) => p.type === 'date');
    const boardable = db.props.filter((p) => ['select', 'status', 'checkbox'].includes(p.type));
    const tl = view.timeline || {};
    return html`<${NC.Popover} anchor=${anchor} onClose=${() => { commit(); onClose(); }} className="menu view-menu">
      <input className="menu-input" autoFocus value=${name} onInput=${(e) => setName(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && (commit(), onClose())} />
      <div className="menu-label">Diseño</div>
      <div className="layout-grid">${Object.keys(VIEW_ICONS).map((t) => html`<button key=${t} className=${'layout-opt' + (view.type === t ? ' selected' : '')}
        onClick=${() => A.updateView(page.id, view.id, { type: t })}><span>${VIEW_ICONS[t]}</span>${NC.VIEW_NAMES[t]}</button>`)}</div>
      ${view.type === 'board' && boardable.length > 1 && html`<div className="menu-label">Agrupar tablero por</div>
        <select className="menu-input" value=${view.groupBy || ''} onChange=${(e) => A.updateView(page.id, view.id, { groupBy: e.target.value })}>
          ${boardable.map((p) => html`<option key=${p.id} value=${p.id}>${p.name}</option>`)}</select>`}
      ${view.type === 'calendar' && dates.length > 1 && html`<div className="menu-label">Mostrar calendario por</div>
        <select className="menu-input" value=${view.dateProp || dates[0].id} onChange=${(e) => A.updateView(page.id, view.id, { dateProp: e.target.value })}>
          ${dates.map((p) => html`<option key=${p.id} value=${p.id}>${p.name}</option>`)}</select>`}
      ${view.type === 'timeline' && dates.length > 0 && html`<div className="menu-label">Cronograma: inicio y fin</div>
        <select className="menu-input" value=${tl.start || dates[0].id} onChange=${(e) => A.updateView(page.id, view.id, { timeline: { ...tl, start: e.target.value } })}>
          ${dates.map((p) => html`<option key=${p.id} value=${p.id}>Inicio: ${p.name}</option>`)}</select>
        <select className="menu-input" value=${tl.end || ''} onChange=${(e) => A.updateView(page.id, view.id, { timeline: { ...tl, end: e.target.value || null } })}>
          <option value="">Sin fecha de fin (un día)</option>${dates.map((p) => html`<option key=${p.id} value=${p.id}>Fin: ${p.name}</option>`)}</select>`}
      ${view.type === 'gallery' && html`<div className="menu-label">Tamaño de las tarjetas</div>
        <div className="chip-row">${[['small', 'Pequeño'], ['medium', 'Mediano'], ['large', 'Grande']].map(([k, l]) => html`<button key=${k} className=${'chip' + ((view.cardSize || 'medium') === k ? ' active' : '')} onClick=${() => A.updateView(page.id, view.id, { cardSize: k })}>${l}</button>`)}</div>`}
      <div className="menu-sep"></div>
      <label className="menu-item toggle-row"><span>↳</span> Subelementos
        <input type="checkbox" checked=${!!db.subitems} onChange=${() => A.updateDb(page.id, { subitems: !db.subitems })} /></label>
      <button className="menu-item" onClick=${() => { const v = JSON.parse(JSON.stringify(view)); v.id = NC.uid(); v.name += ' (copia)'; db.views.push(v); db.viewId = v.id; A.updatePage(page.id, {}); onClose(); }}><span>⧉</span> Duplicar vista</button>
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
    const kids = db.subitems ? D.rowsOf(db).filter((r) => r.parentRow === row.id) : [];
    const parent = row.parentRow && s.pages[row.parentRow];
    return html`<div className="row-props">
      ${parent && html`<div className="row-prop"><span className="row-prop-name"><span className="prop-icon">↰</span>Elemento principal</span>
        <div className="row-prop-val"><span className="rel-chip" onClick=${() => A.setUI({ peek: parent.id })}><${NC.Icon} icon=${parent.icon} /> ${parent.title || 'Sin título'}</span></div></div>`}
      ${db.props.map((p) => html`<div key=${p.id} className="row-prop">
        <button className="row-prop-name" onClick=${(e) => setMenu({ anchor: e.currentTarget, prop: p })}><span className="prop-icon">${typeInfo(p.type).icon}</span>${p.name}</button>
        <div className="row-prop-val"><${NC.Cell} dbId=${dbPage.id} prop=${p} row=${row} compact=${true} /></div>
      </div>`)}
      ${db.subitems && html`<div className="row-prop sub-list"><span className="row-prop-name"><span className="prop-icon">↳</span>Subelementos</span>
        <div className="row-prop-val">${kids.map((k) => html`<span key=${k.id} className="rel-chip" onClick=${() => A.setUI({ peek: k.id })}><${NC.Icon} icon=${k.icon} /> ${k.title || 'Sin título'}</span>`)}
          <button className="btn-ghost small" onClick=${() => A.setUI({ peek: A.addRow(dbPage.id, {}, null, '', row.id) })}>+ Añadir</button></div></div>`}
      <button className="btn-ghost add-prop" onClick=${(e) => setAddAnchor(e.currentTarget)}>+ Añadir una propiedad</button>
      ${addAnchor && html`<${AddPropMenu} dbId=${dbPage.id} anchor=${addAnchor} onClose=${() => setAddAnchor(null)} />`}
      ${menu && html`<${PropMenu} dbId=${dbPage.id} db=${db} prop=${menu.prop} view=${view} anchor=${menu.anchor} onClose=${() => setMenu(null)} />`}
    </div>`;
  };

  NC.dbToMarkdown = (s, page) => {
    const db = page.db;
    const rows = D.rowsOf(db);
    const esc = (t) => String(t).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const head = [db.titleName, ...db.props.map((p) => p.name)];
    return [
      '| ' + head.map(esc).join(' | ') + ' |',
      '| ' + head.map(() => '---').join(' | ') + ' |',
      ...rows.map((r) => '| ' + [r.title || '', ...db.props.map((p) => D.text(db, r, p))].map(esc).join(' | ') + ' |'),
    ].join('\n');
  };
})();
