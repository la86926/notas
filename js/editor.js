/* Notas de L — editor por bloques (modelo plano con sangría, como los "nodes" de AppFlowy).
 * Bloques anidados (columnas, pestañas), menú "/", @menciones, atajos Markdown,
 * arrastrar y soltar (también a los lados para crear columnas), selección múltiple y barra de formato. */
(function () {
  const NC = window.NC;
  const { html } = NC;
  const A = NC.actions;
  const { useState, useRef, useLayoutEffect, useEffect } = React;

  NC.firstBlockFns = {};
  NC.titleFns = {};
  NC.focusTitleOf = (id) => NC.titleFns[id] && NC.titleFns[id]();
  NC.BLOCKS = NC.BLOCKS || {}; // renderizadores de bloques especiales (js/blocks.js)

  const TEXT_TYPES = ['paragraph', 'h1', 'h2', 'h3', 'todo', 'bulleted', 'numbered', 'toggle', 'quote', 'callout'];
  const LIST_TYPES = ['todo', 'bulleted', 'numbered', 'toggle'];
  const HEADINGS = ['h1', 'h2', 'h3'];
  const isText = (b) => TEXT_TYPES.includes(b.type);
  const isEditable = (b) => isText(b) || b.type === 'code';
  const isToggle = (b) => b.type === 'toggle' || (HEADINGS.includes(b.type) && b.toggle);
  NC.isEditableBlock = isEditable;

  const PLACEHOLDERS = {
    paragraph: "Escribe '/' para comandos o '@' para mencionar…", h1: 'Encabezado 1', h2: 'Encabezado 2', h3: 'Encabezado 3',
    todo: 'Tarea', bulleted: 'Lista', numbered: 'Lista', toggle: 'Desplegable', quote: 'Cita vacía', callout: 'Escribe algo…',
  };

  /* ---------- Menú "/" (equivalente al SlashPanel de AppFlowy) ---------- */
  const B = 'Bloques básicos', P = 'Páginas y bases de datos', M = 'Multimedia e inserciones', L = 'Diseño', AV = 'Avanzado';
  const SLASH_ITEMS = [
    { id: 'paragraph', group: B, label: 'Texto', desc: 'Empieza a escribir texto normal.', icon: 'Aa', kw: 'text paragraph texto parrafo' },
    { id: 'h1', group: B, label: 'Encabezado 1', desc: 'Título de sección grande.', icon: 'H1', kw: 'heading h1 titulo encabezado' },
    { id: 'h2', group: B, label: 'Encabezado 2', desc: 'Título de sección mediano.', icon: 'H2', kw: 'heading h2 subtitulo encabezado' },
    { id: 'h3', group: B, label: 'Encabezado 3', desc: 'Título de sección pequeño.', icon: 'H3', kw: 'heading h3 subtitulo encabezado' },
    { id: 'todo', group: B, label: 'Lista de tareas', desc: 'Lleva el control con casillas.', icon: '☑', kw: 'todo task checkbox tarea casilla' },
    { id: 'bulleted', group: B, label: 'Lista con viñetas', desc: 'Una lista simple.', icon: '•', kw: 'bulleted list ul viñetas lista' },
    { id: 'numbered', group: B, label: 'Lista numerada', desc: 'Una lista con números.', icon: '1.', kw: 'numbered list ol numerada lista' },
    { id: 'toggle', group: B, label: 'Lista desplegable', desc: 'Oculta y muestra contenido.', icon: '▸', kw: 'toggle desplegable plegable' },
    { id: 'th1', group: B, label: 'Encabezado desplegable 1', desc: 'Encabezado que oculta su contenido.', icon: '▸H1', kw: 'toggle heading encabezado desplegable' },
    { id: 'th2', group: B, label: 'Encabezado desplegable 2', desc: 'Encabezado mediano desplegable.', icon: '▸H2', kw: 'toggle heading encabezado desplegable' },
    { id: 'th3', group: B, label: 'Encabezado desplegable 3', desc: 'Encabezado pequeño desplegable.', icon: '▸H3', kw: 'toggle heading encabezado desplegable' },
    { id: 'quote', group: B, label: 'Cita', desc: 'Captura una cita.', icon: '❝', kw: 'quote cita blockquote' },
    { id: 'callout', group: B, label: 'Destacado', desc: 'Resalta un texto.', icon: '💡', kw: 'callout destacado aviso nota' },
    { id: 'divider', group: B, label: 'Divisor', desc: 'Separa bloques visualmente.', icon: '—', kw: 'divider hr linea separador divisor' },
    { id: 'table', group: B, label: 'Tabla simple', desc: 'Filas y columnas de texto.', icon: '⊞', kw: 'table tabla simple filas columnas' },
    { id: 'newpage', group: P, label: 'Página', desc: 'Inserta una subpágina.', icon: '📄', kw: 'page pagina subpagina' },
    { id: 'linkpage', group: P, label: 'Enlace a página', desc: 'Enlaza una página existente.', icon: '↗', kw: 'link page enlace pagina vincular' },
    { id: 'mention', group: P, label: 'Mencionar página o fecha', desc: 'Inserta una @mención.', icon: '@', kw: 'mention mencion fecha recordatorio' },
    { id: 'db-table', group: P, label: 'Base de datos: Tabla', desc: 'Vista de tabla.', icon: '▦', kw: 'database table tabla grid base datos' },
    { id: 'db-board', group: P, label: 'Base de datos: Tablero', desc: 'Kanban por estado.', icon: '▥', kw: 'board kanban tablero base datos' },
    { id: 'db-calendar', group: P, label: 'Base de datos: Calendario', desc: 'Vista mensual.', icon: '📅', kw: 'calendar calendario base datos' },
    { id: 'db-gallery', group: P, label: 'Base de datos: Galería', desc: 'Tarjetas.', icon: '▤', kw: 'gallery galeria tarjetas base datos' },
    { id: 'image', group: M, label: 'Imagen', desc: 'Sube o enlaza una imagen.', icon: '🖼', kw: 'image imagen foto picture img' },
    { id: 'bookmark', group: M, label: 'Marcador web', desc: 'Tarjeta con un enlace.', icon: '🔖', kw: 'bookmark marcador enlace link web' },
    { id: 'embed', group: M, label: 'Insertar (embed)', desc: 'YouTube, Vimeo, Spotify, Figma, Google Docs…', icon: '▶', kw: 'embed video youtube vimeo spotify figma insertar' },
    { id: 'file', group: M, label: 'Archivo', desc: 'Adjunta un archivo.', icon: '📎', kw: 'file archivo adjunto pdf upload' },
    { id: 'date', group: M, label: 'Fecha de hoy', desc: 'Inserta la fecha actual.', icon: '📆', kw: 'date fecha hoy today' },
    { id: 'columns2', group: L, label: '2 columnas', desc: 'Divide en dos columnas.', icon: '▥', kw: 'columns columnas 2 dos layout' },
    { id: 'columns3', group: L, label: '3 columnas', desc: 'Divide en tres columnas.', icon: '▥', kw: 'columns columnas 3 tres layout' },
    { id: 'columns4', group: L, label: '4 columnas', desc: 'Divide en cuatro columnas.', icon: '▥', kw: 'columns columnas 4 cuatro layout' },
    { id: 'tabs', group: L, label: 'Pestañas', desc: 'Organiza contenido en pestañas.', icon: '⊟', kw: 'tabs pestañas pestanas' },
    { id: 'toc', group: AV, label: 'Índice', desc: 'Tabla de contenidos de la página.', icon: '☰', kw: 'toc indice tabla contenidos' },
    { id: 'breadcrumb', group: AV, label: 'Ruta de navegación', desc: 'Muestra dónde está esta página.', icon: '›', kw: 'breadcrumb ruta navegacion' },
    { id: 'equation', group: AV, label: 'Ecuación', desc: 'Fórmula matemática (LaTeX).', icon: '∑', kw: 'equation ecuacion formula latex math matematicas' },
    { id: 'code', group: AV, label: 'Código', desc: 'Fragmento de código.', icon: '</>', kw: 'code codigo snippet' },
    { id: 'button', group: AV, label: 'Botón', desc: 'Inserta bloques o crea filas con un clic.', icon: '⏺', kw: 'button boton accion plantilla automatizar' },
  ];
  NC.SLASH_ITEMS = SLASH_ITEMS;
  const normalizeStr = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  NC.normalizeStr = normalizeStr;
  const filterSlash = (q) => {
    const n = normalizeStr(q);
    return SLASH_ITEMS.filter((it) => !n || normalizeStr(it.label + ' ' + it.kw).includes(n));
  };

  // Elementos del menú "@": fechas, recordatorios y páginas
  const isoPlus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const mentionItems = (q, onlyPages = false) => {
    const n = normalizeStr(q);
    const s = NC.getState();
    const dates = onlyPages ? [] : [
      { kind: 'date', id: 'today', label: 'Hoy', desc: NC.formatDate(isoPlus(0)), icon: '📅', date: isoPlus(0) },
      { kind: 'date', id: 'tomorrow', label: 'Mañana', desc: NC.formatDate(isoPlus(1)), icon: '📅', date: isoPlus(1) },
      { kind: 'date', id: 'remind', label: 'Recordarme mañana', desc: 'Aviso a las 9:00', icon: '⏰', date: isoPlus(1), remind: true },
      { kind: 'date', id: 'nextweek', label: 'Recordarme en una semana', desc: NC.formatDate(isoPlus(7)), icon: '⏰', date: isoPlus(7), remind: true },
    ].filter((it) => !n || normalizeStr(it.label + ' fecha recordatorio hoy manana').includes(n));
    const pages = Object.values(s.pages)
      .filter((p) => !p.isTemplate && !A.isInTrash(p.id) && (!n || normalizeStr(p.title || 'sin titulo').includes(n)))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8)
      .map((p) => ({ kind: 'page', id: p.id, label: p.title || 'Sin título', desc: p.rowOf ? 'Fila de base de datos' : 'Página', icon: NC.iconText(p.icon, p.type === 'database' ? '🗃️' : '📄') }));
    return [...pages, ...dates];
  };

  function FloatingMenu({ menu, items, onPick, setIndex, width = 300 }) {
    const listRef = useRef(null);
    useEffect(() => {
      const el = listRef.current && listRef.current.querySelector('.slash-item.active');
      el && el.scrollIntoView({ block: 'nearest' });
    }, [menu.index]);
    if (!items.length) return null;
    const top = menu.rect.bottom + 6 + 320 > window.innerHeight ? Math.max(8, menu.rect.top - 326) : menu.rect.bottom + 6;
    let lastGroup = null;
    return ReactDOM.createPortal(
      html`<div className="popover slash-menu" ref=${listRef} style=${{ top, left: Math.min(menu.rect.left, window.innerWidth - width - 8), width }}>
        ${items.map((it, i) => {
          const group = it.group || (it.kind === 'page' ? 'Páginas' : 'Fechas y recordatorios');
          const header = group !== lastGroup ? html`<div className="menu-label" key=${'g' + group}>${group}</div>` : null;
          lastGroup = group;
          return html`<${React.Fragment} key=${it.id}>
            ${header}
            <div className=${'slash-item' + (i === menu.index % items.length ? ' active' : '')}
              onMouseEnter=${() => setIndex(i)}
              onMouseDown=${(e) => { e.preventDefault(); onPick(it); }}>
              <div className="slash-icon">${it.icon}</div>
              <div><div className="slash-label">${it.label}</div><div className="slash-desc">${it.desc}</div></div>
            </div>
          <//>`;
        })}
      </div>`,
      document.body
    );
  }

  /* ---------- Texto enriquecido no controlado ---------- */
  const refreshMentions = (el) => {
    const s = NC.getState();
    el.querySelectorAll('.mention[data-page]').forEach((m) => {
      const p = s.pages[m.getAttribute('data-page')];
      const text = p && !A.isInTrash(p.id) ? NC.iconText(p.icon, p.type === 'database' ? '🗃️' : '📄') + ' ' + (p.title || 'Sin título') : '⚠️ Página eliminada';
      if (m.textContent !== text) m.textContent = text;
    });
    el.querySelectorAll('.mention[data-date]').forEach((m) => {
      const text = (m.getAttribute('data-remind') === '1' ? '⏰ ' : '@') + NC.formatDate(m.getAttribute('data-date'));
      if (m.textContent !== text) m.textContent = text;
    });
  };

  function RichText({ b, ctx, className = '', tag = 'div' }) {
    const ref = useRef(null);
    useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return;
      if (el.innerHTML !== (b.html || '')) el.innerHTML = b.html || '';
      refreshMentions(el);
      if (el.innerHTML !== b.html) b.html = el.innerHTML; // normalizado (sin emitir)
    });
    return React.createElement(tag, {
      ref,
      className: 'rt ' + className,
      contentEditable: !ctx.readOnly,
      suppressContentEditableWarning: true,
      spellCheck: true,
      'data-editable-id': b.id,
      'data-placeholder': PLACEHOLDERS[b.type] || '',
      onInput: (e) => ctx.onInput(b, e.currentTarget),
      onKeyDown: (e) => ctx.onKeyDown(b, e),
      onPaste: (e) => ctx.onPaste(b, e),
      onBlur: () => ctx.onBlur(b),
      onFocus: () => ctx.onFocusBlock(b),
      onClick: (e) => {
        const mention = e.target.closest('.mention');
        if (mention && mention.dataset.page) return NC.navigate(mention.dataset.page);
        if (mention && mention.dataset.date) return ctx.editDateMention(b, mention);
        const a = e.target.closest('a');
        if (a && (e.metaKey || e.ctrlKey || ctx.readOnly)) window.open(a.href, '_blank', 'noopener');
      },
    });
  }
  NC.RichText = RichText;

  const LANG_ALIAS = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', shell: 'bash', html: 'markup', xml: 'markup', 'c++': 'cpp', yml: 'yaml', md: 'markdown', golang: 'go', rs: 'rust' };
  NC.CODE_LANGS = ['javascript', 'typescript', 'python', 'json', 'bash', 'sql', 'java', 'c', 'cpp', 'css', 'markup', 'markdown', 'yaml', 'go', 'rust', 'php'];
  const highlight = (text, lang) => {
    const l = LANG_ALIAS[(lang || '').toLowerCase()] || (lang || '').toLowerCase();
    const g = window.Prism && Prism.languages[l];
    try { return g ? Prism.highlight(text, g, l) : NC.escapeHtml(text); } catch (e) { return NC.escapeHtml(text); }
  };

  function CodeText({ b, ctx }) {
    const ref = useRef(null);
    useLayoutEffect(() => {
      const el = ref.current;
      if (el && el.textContent !== (b.text || '')) el.textContent = b.text || '';
    });
    return html`<div className="code-wrap">
      <pre className="code-hl" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: highlight(b.text || '', b.lang) + '\n' }}></pre>
      <pre ref=${ref} className="code-text" contentEditable=${ctx.readOnly ? 'false' : 'plaintext-only'} suppressContentEditableWarning
        spellCheck=${false} data-editable-id=${b.id}
        onFocus=${() => ctx.onFocusBlock(b)}
        onInput=${(e) => A.updateBlock(ctx.pageId, b.id, { text: e.currentTarget.textContent })}
        onKeyDown=${(e) => ctx.onKeyDown(b, e)} />
    </div>`;
  }

  /* ---------- Bloques especiales básicos ---------- */
  function ImageBlock({ b, ctx }) {
    const [url, setUrl] = useState('');
    const fileRef = useRef(null);
    if (b.url) {
      return html`<figure className="image-block" tabIndex=${0} data-editable-id=${b.id} onKeyDown=${(e) => ctx.onKeyDown(b, e)}>
        <${NC.AssetImg} src=${b.url} style=${{ width: b.width ? b.width + '%' : '100%' }} />
        ${!ctx.readOnly && html`<div className="image-tools">
          ${[25, 50, 75, 100].map((w) => html`<button key=${w} onClick=${() => A.updateBlock(ctx.pageId, b.id, { width: w })}>${w}%</button>`)}
          <button onClick=${() => A.updateBlock(ctx.pageId, b.id, { url: '' })}>Cambiar</button>
        </div>`}
      </figure>`;
    }
    const onFile = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      NC.toast('Optimizando imagen…');
      NC.compressImage(f).then(NC.assets.put).then((ref) => A.updateBlock(ctx.pageId, b.id, { url: ref })).catch((er) => NC.toast(er.message));
    };
    const submit = (e) => {
      e.preventDefault();
      if (/^https?:\/\//.test(url.trim())) A.updateBlock(ctx.pageId, b.id, { url: url.trim() });
      else NC.toast('Introduce una URL válida (http/https)');
    };
    return html`<div className="image-empty" data-editable-id=${b.id} tabIndex=${0} onKeyDown=${(e) => e.target === e.currentTarget && ctx.onKeyDown(b, e)}>
      <span>🖼 Añadir una imagen</span>
      <form onSubmit=${submit}>
        <input placeholder="Pega la URL de la imagen…" value=${url} onInput=${(e) => setUrl(e.target.value)} />
        <button className="btn-primary" type="submit">Insertar</button>
      </form>
      <button className="btn-ghost" onClick=${() => fileRef.current.click()}>Subir archivo</button>
      <input type="file" accept="image/*" ref=${fileRef} hidden onChange=${onFile} />
    </div>`;
  }

  function PageLink({ b, ctx }) {
    const s = NC.useStore();
    const p = s.pages[b.pageId];
    if (!p || A.isInTrash(b.pageId)) {
      return html`<div className="page-link missing" tabIndex=${0} data-editable-id=${b.id} onKeyDown=${(e) => ctx.onKeyDown(b, e)}>
        <span className="pl-icon">⚠️</span> Página eliminada o en la papelera
      </div>`;
    }
    const fallback = p.type === 'database' ? '🗃️' : '📄';
    return html`<div className="page-link" tabIndex=${0} data-editable-id=${b.id} onKeyDown=${(e) => ctx.onKeyDown(b, e)}
      onClick=${() => NC.navigate(p.id)}>
      <span className="pl-icon"><${NC.Icon} icon=${p.icon} fallback=${fallback} /></span>
      <span className="pl-title">${p.title || 'Sin título'}</span>
    </div>`;
  }

  /* ---------- Contenedores: columnas y pestañas ---------- */
  function Columns({ b, ctx }) {
    const ref = useRef(null);
    const total = b.cells.reduce((a, c) => a + (c.width || 1), 0);
    const startResize = (i) => (e) => {
      e.preventDefault();
      const w = ref.current.getBoundingClientRect().width;
      const x0 = e.clientX;
      const a0 = b.cells[i].width || 1;
      const b0 = b.cells[i + 1].width || 1;
      const move = (ev) => {
        const d = ((ev.clientX - x0) / w) * total;
        const na = Math.max(0.2, a0 + d);
        const nb = Math.max(0.2, b0 - (na - a0));
        b.cells[i].width = na;
        b.cells[i + 1].width = nb;
        A.updateBlock(ctx.pageId, b.id, {}, false);
      };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); A.updateBlock(ctx.pageId, b.id, {}); };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    };
    return html`<div className="columns" ref=${ref}>
      ${b.cells.map((c, i) => html`<${React.Fragment} key=${c.id}>
        <div className="column" style=${{ flexGrow: c.width || 1 }}>
          <${BlockList} blocks=${c.blocks} ctx=${ctx} />
        </div>
        ${i < b.cells.length - 1 && html`<div className="col-gap" onMouseDown=${ctx.readOnly ? null : startResize(i)}></div>`}
      <//>`)}
    </div>`;
  }

  function Tabs({ b, ctx }) {
    const [editing, setEditing] = useState(null);
    const active = Math.min(b.active || 0, b.cells.length - 1);
    const cell = b.cells[active];
    const addTab = () => {
      b.cells.push({ id: NC.uid(), title: `Pestaña ${b.cells.length + 1}`, width: 1, blocks: [NC.newBlock('paragraph')] });
      A.updateBlock(ctx.pageId, b.id, { active: b.cells.length - 1 });
    };
    const removeTab = (i) => {
      if (b.cells.length <= 1) return NC.toast('Debe quedar al menos una pestaña');
      const c = b.cells[i];
      const hasText = c.blocks.some((x) => x.html || x.text || x.type !== 'paragraph');
      if (hasText && !confirm(`¿Eliminar la pestaña «${c.title}» y su contenido?`)) return;
      b.cells.splice(i, 1);
      A.updateBlock(ctx.pageId, b.id, { active: Math.max(0, Math.min(active, b.cells.length - 1)) });
    };
    return html`<div className="tabs-block">
      <div className="tabs-head">
        ${b.cells.map((c, i) => editing === c.id
          ? html`<input key=${c.id} className="tab-input" autoFocus defaultValue=${c.title}
              onBlur=${(e) => { c.title = e.target.value.trim() || c.title; setEditing(null); A.updateBlock(ctx.pageId, b.id, {}); }}
              onKeyDown=${(e) => (e.key === 'Enter' || e.key === 'Escape') && e.target.blur()} />`
          : html`<button key=${c.id} className=${'tab' + (i === active ? ' active' : '')}
              onClick=${() => A.updateBlock(ctx.pageId, b.id, { active: i })}
              onDoubleClick=${() => !ctx.readOnly && setEditing(c.id)} title="Doble clic para renombrar">
              ${c.title}${!ctx.readOnly && i === active && html`<span className="tab-x" onClick=${(e) => { e.stopPropagation(); removeTab(i); }}>×</span>`}
            </button>`)}
        ${!ctx.readOnly && html`<button className="tab add" title="Añadir pestaña" onClick=${addTab}>+</button>`}
      </div>
      <div className="tabs-body"><${BlockList} key=${cell.id} blocks=${cell.blocks} ctx=${ctx} /></div>
    </div>`;
  }

  /* ---------- Fila de bloque ---------- */
  function BlockRow({ b, ctx, number }) {
    const [menuAnchor, setMenuAnchor] = useState(null);
    const [emojiAnchor, setEmojiAnchor] = useState(null);
    const [commentAnchor, setCommentAnchor] = useState(null);
    const drop = ctx.drop && ctx.drop.id === b.id ? ctx.drop.pos : null;
    const selected = ctx.selected.has(b.id);
    const arrow = (cls = '') => html`<button className=${'toggle-arrow ' + cls + (b.collapsed ? '' : ' open')} onClick=${() => A.updateBlock(ctx.pageId, b.id, { collapsed: !b.collapsed })}>▶</button>`;
    let content;
    switch (b.type) {
      case 'h1': case 'h2': case 'h3':
        content = b.toggle
          ? html`<div className=${'list-item toggle-heading ' + b.type}>${arrow()}<${RichText} b=${b} ctx=${ctx} className=${'heading ' + b.type} /></div>`
          : html`<${RichText} b=${b} ctx=${ctx} className=${'heading ' + b.type} />`;
        break;
      case 'todo':
        content = html`<div className=${'todo' + (b.checked ? ' checked' : '')}>
          <input type="checkbox" checked=${!!b.checked} onChange=${() => A.updateBlock(ctx.pageId, b.id, { checked: !b.checked })} />
          <${RichText} b=${b} ctx=${ctx} />
        </div>`;
        break;
      case 'bulleted':
        content = html`<div className="list-item"><span className="marker">${['•', '◦', '▪'][b.indent % 3]}</span><${RichText} b=${b} ctx=${ctx} /></div>`;
        break;
      case 'numbered':
        content = html`<div className="list-item"><span className="marker num">${number}.</span><${RichText} b=${b} ctx=${ctx} /></div>`;
        break;
      case 'toggle':
        content = html`<div className="list-item">${arrow()}<${RichText} b=${b} ctx=${ctx} /></div>`;
        break;
      case 'quote':
        content = html`<${RichText} b=${b} ctx=${ctx} className="quote" />`;
        break;
      case 'callout':
        content = html`<div className="callout">
          <button className="callout-icon" onClick=${(e) => !ctx.readOnly && setEmojiAnchor(e.currentTarget)}><${NC.Icon} icon=${b.icon} fallback="💡" /></button>
          <${RichText} b=${b} ctx=${ctx} />
          ${emojiAnchor && html`<${NC.IconPicker} anchor=${emojiAnchor} current=${b.icon} onClose=${() => setEmojiAnchor(null)}
            onPick=${(e) => { A.updateBlock(ctx.pageId, b.id, { icon: e || '💡' }); setEmojiAnchor(null); }} />`}
        </div>`;
        break;
      case 'code':
        content = html`<div className="code-block">
          <div className="code-head">
            <input className="code-lang" list="code-langs" value=${b.lang || ''} placeholder="lenguaje" readOnly=${ctx.readOnly} onInput=${(e) => A.updateBlock(ctx.pageId, b.id, { lang: e.target.value })} />
            <datalist id="code-langs">${NC.CODE_LANGS.map((l) => html`<option key=${l} value=${l} />`)}</datalist>
            <button className="btn-ghost small" onClick=${() => { navigator.clipboard && navigator.clipboard.writeText(b.text || ''); NC.toast('Código copiado'); }}>Copiar</button>
          </div>
          <${CodeText} b=${b} ctx=${ctx} />
        </div>`;
        break;
      case 'divider':
        content = html`<div className="divider" tabIndex=${0} data-editable-id=${b.id} onKeyDown=${(e) => ctx.onKeyDown(b, e)}><hr /></div>`;
        break;
      case 'image':
        content = html`<${ImageBlock} b=${b} ctx=${ctx} />`;
        break;
      case 'page':
        content = html`<${PageLink} b=${b} ctx=${ctx} />`;
        break;
      case 'columns':
        content = html`<${Columns} b=${b} ctx=${ctx} />`;
        break;
      case 'tabs':
        content = html`<${Tabs} b=${b} ctx=${ctx} />`;
        break;
      default: {
        const Custom = NC.BLOCKS[b.type];
        content = Custom
          ? html`<div className="custom-block" tabIndex=${0} data-editable-id=${b.id} onKeyDown=${(e) => e.target === e.currentTarget && ctx.onKeyDown(b, e)}><${Custom} b=${b} ctx=${ctx} /></div>`
          : html`<${RichText} b=${b} ctx=${ctx} className="paragraph" />`;
      }
    }
    const colorCls = b.color && b.color !== 'default' ? ' c-' + b.color : '';
    const comments = (b.comments || []).filter((c) => !c.resolved).length;
    return html`<div className=${'block-row type-' + b.type + (drop ? ' drop-' + drop : '') + (selected ? ' selected' : '')}
        data-block-row=${b.id}
        style=${{ paddingLeft: b.indent * 26 }}
        onDragOver=${(e) => ctx.onDragOver(b, e)}
        onDrop=${(e) => ctx.onDrop(b, e)}>
      ${!ctx.readOnly && html`<div className="gutter" style=${{ left: b.indent * 26 - 52 }}>
        <button className="gutter-btn" title="Haz clic para añadir un bloque debajo" onClick=${() => ctx.addBelow(b)}>+</button>
        <span className="gutter-btn handle" draggable=${true} title="Arrastra para mover (a un lado crea columnas) · clic para el menú"
          onDragStart=${(e) => ctx.onDragStart(b, e)} onDragEnd=${ctx.onDragEnd}
          onClick=${(e) => setMenuAnchor(e.currentTarget)}>⋮⋮</span>
      </div>`}
      <div className=${'block-content' + colorCls}>${content}</div>
      ${comments > 0 && html`<button className="comment-badge" title="Comentarios" onClick=${(e) => setCommentAnchor(e.currentTarget)}>💬 ${comments}</button>`}
      ${menuAnchor && html`<${BlockMenu} b=${b} ctx=${ctx} anchor=${menuAnchor} onClose=${() => setMenuAnchor(null)} onComment=${() => setCommentAnchor(menuAnchor)} />`}
      ${commentAnchor && NC.CommentThread && html`<${NC.CommentThread} pageId=${ctx.pageId} block=${b} anchor=${commentAnchor} onClose=${() => setCommentAnchor(null)} />`}
    </div>`;
  }

  const TURN_INTO = ['paragraph', 'h1', 'h2', 'h3', 'todo', 'bulleted', 'numbered', 'toggle', 'th1', 'th2', 'th3', 'quote', 'callout', 'code'];

  function BlockMenu({ b, ctx, anchor, onClose, onComment }) {
    const [tab, setTab] = useState('main');
    const many = ctx.selected.has(b.id) && ctx.selected.size > 1;
    const targets = many ? [...ctx.selected] : [b.id];
    const run = (fn) => () => { fn(); onClose(); };
    const each = (fn) => targets.forEach((id) => { const r = NC.locateBlock(ctx.pageId, id); r && fn(r.block); });
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu block-menu">
      ${tab === 'main' && html`
        ${many && html`<div className="menu-label">${targets.length} bloques seleccionados</div>`}
        <button className="menu-item" onClick=${run(() => { A.removeBlocks(ctx.pageId, targets); ctx.clearSelection(); })}><span>🗑</span> Eliminar<kbd>⌫</kbd></button>
        <button className="menu-item" onClick=${run(() => { let last; targets.forEach((id) => (last = A.duplicateBlock(ctx.pageId, id))); !many && ctx.focus(last, 'end'); })}><span>⧉</span> Duplicar<kbd>⌘D</kbd></button>
        <button className="menu-item" onClick=${() => setTab('turn')}><span>↻</span> Convertir en <span className="chev">›</span></button>
        <button className="menu-item" onClick=${() => setTab('color')}><span>🎨</span> Color <span className="chev">›</span></button>
        ${!many && html`<button className="menu-item" onClick=${() => { onClose(); onComment(); }}><span>💬</span> Comentar</button>`}
        ${!many && html`<button className="menu-item" onClick=${run(() => { navigator.clipboard && navigator.clipboard.writeText(location.href.split('#')[0] + '#/' + ctx.pageId + '?b=' + b.id); NC.toast('Enlace al bloque copiado'); })}><span>🔗</span> Copiar enlace al bloque</button>`}
        ${!many && html`<button className="menu-item" onClick=${run(() => A.shiftBlock(ctx.pageId, b.id, -1))}><span>↑</span> Mover arriba<kbd>⌘⇧↑</kbd></button>`}
        ${!many && html`<button className="menu-item" onClick=${run(() => A.shiftBlock(ctx.pageId, b.id, 1))}><span>↓</span> Mover abajo<kbd>⌘⇧↓</kbd></button>`}`}
      ${tab === 'turn' && html`
        <div className="menu-label">Convertir en</div>
        ${TURN_INTO.map((t) => {
          const it = SLASH_ITEMS.find((x) => x.id === t);
          return html`<button key=${t} className=${'menu-item' + (b.type === t && !b.toggle ? ' selected' : '')} onClick=${run(() => each((x) => ctx.setType(x, t, !many)))}>
            <span className="slash-icon small">${it.icon}</span> ${it.label}</button>`;
        })}`}
      ${tab === 'color' && html`
        <div className="menu-label">Color del texto</div>
        ${NC.COLORS.map((c) => html`<button key=${c} className="menu-item" onClick=${run(() => each((x) => A.updateBlock(ctx.pageId, x.id, { color: c })))}>
          <span className=${'color-swatch c-' + c}>A</span> ${NC.COLOR_NAMES[c]}</button>`)}
        <div className="menu-label">Fondo</div>
        ${NC.COLORS.slice(1).map((c) => html`<button key=${c + 'bg'} className="menu-item" onClick=${run(() => each((x) => A.updateBlock(ctx.pageId, x.id, { color: c + '_bg' })))}>
          <span className=${'color-swatch c-' + c + '_bg'}>A</span> Fondo ${NC.COLOR_NAMES[c].toLowerCase()}</button>`)}`}
    <//>`;
  }

  /* ---------- Lista de bloques (página, columna o pestaña) ---------- */
  function BlockList({ blocks, ctx }) {
    const visible = [];
    const numbers = {};
    let hideBelow = null;
    const counters = [];
    const lastType = [];
    for (const b of blocks) {
      if (hideBelow != null && b.indent > hideBelow) continue;
      hideBelow = null;
      if (isToggle(b) && b.collapsed) hideBelow = b.indent;
      for (let k = b.indent + 1; k < lastType.length; k++) lastType[k] = null;
      if (b.type === 'numbered') {
        counters[b.indent] = lastType[b.indent] === 'numbered' ? counters[b.indent] + 1 : 1;
        numbers[b.id] = counters[b.indent];
      }
      lastType[b.indent] = b.type;
      visible.push(b);
    }
    return visible.map((b) => html`<${BlockRow} key=${b.id} b=${b} ctx=${ctx} number=${numbers[b.id]} />`);
  }
  NC.BlockList = BlockList;

  /* ---------- Editor ---------- */
  NC.Editor = function Editor({ page, readOnly = false }) {
    NC.useStore();
    const pageId = page.id;
    const rootRef = useRef(null);
    const [slash, setSlash] = useState(null); // {blockId, query, index, rect, mode}
    const slashRef = useRef(null);
    slashRef.current = slash;
    const [mention, setMention] = useState(null); // {blockId, query, index, rect, link}
    const [emojiMenu, setEmojiMenu] = useState(null); // {blockId, query, index, rect}
    const emojiRef = useRef(null);
    emojiRef.current = emojiMenu;
    const mentionRef = useRef(null);
    mentionRef.current = mention;
    const [drop, setDrop] = useState(null);
    const dragId = useRef(null);
    const [selected, setSelected] = useState(() => new Set());
    const selRef = useRef(selected);
    selRef.current = selected;
    const anchorRef = useRef(null); // último bloque enfocado (para Shift+clic)
    const [dateEdit, setDateEdit] = useState(null);

    const getBlock = (id) => { const r = NC.locateBlock(pageId, id); return r && r.block; };
    const elOf = (id) => rootRef.current && rootRef.current.querySelector(`[data-editable-id="${id}"]`);
    const order = () => (rootRef.current ? [...rootRef.current.querySelectorAll('[data-editable-id]')].map((e) => e.getAttribute('data-editable-id')) : []);
    const rowOrder = () => (rootRef.current ? [...rootRef.current.querySelectorAll('[data-block-row]')].map((e) => e.getAttribute('data-block-row')) : []);
    const prevOf = (b) => { const o = order(); const i = o.indexOf(b.id); return i > 0 ? getBlock(o[i - 1]) : null; };
    const nextOf = (b) => { const o = order(); const i = o.indexOf(b.id); return i >= 0 && i < o.length - 1 ? getBlock(o[i + 1]) : null; };

    // Enfoca de inmediato (forzando el commit pendiente de React) para no perder pulsaciones rápidas
    const focus = (id, pos = 'end') => {
      const apply = () => {
        const el = elOf(id);
        if (!el) return false;
        if (el.isContentEditable) NC.setCaret(el, pos);
        else el.focus();
        return true;
      };
      try { ReactDOM.flushSync(() => {}); } catch (e) { /* dentro de un render */ }
      if (!apply()) setTimeout(apply, 0);
    };

    const clearSelection = () => selRef.current.size && setSelected(new Set());
    const selectIds = (ids) => {
      setSelected(new Set(ids));
      if (document.activeElement && rootRef.current && rootRef.current.contains(document.activeElement)) document.activeElement.blur();
      window.getSelection().removeAllRanges();
    };

    const setType = (b, type, doFocus = true) => {
      const patch = { type, toggle: false };
      if (/^th[123]$/.test(type)) Object.assign(patch, { type: 'h' + type[2], toggle: true, collapsed: false });
      if (patch.type === 'code' && b.type !== 'code') patch.text = NC.htmlToText(b.html);
      if (b.type === 'code' && patch.type !== 'code') patch.html = NC.escapeHtml(b.text || '').replace(/\n/g, '<br>');
      if (type === 'callout' && !b.icon) patch.icon = '💡';
      A.updateBlock(pageId, b.id, patch);
      if (doFocus) focus(b.id, 'end');
    };

    const closeMenus = () => { slashRef.current && setSlash(null); mentionRef.current && setMention(null); emojiRef.current && setEmojiMenu(null); };
    const emojiItems = (q) => NC.searchEmoji(q, 8).map((e) => ({ id: e[0], icon: e[0], label: e[1], desc: ':' + q, group: 'Emoji' }));
    const applyEmoji = (item) => {
      const menu = emojiRef.current;
      setEmojiMenu(null);
      if (!menu) return;
      const el = elOf(menu.blockId);
      if (!el) return;
      eraseTrigger(el, menu.query.length + 1);
      NC.setCaret(el, NC.getCaretOffset(el));
      document.execCommand('insertText', false, item.icon);
    };

    // Borra "/consulta" o "@consulta" antes del cursor
    const eraseTrigger = (el, len) => {
      const off = NC.getCaretOffset(el);
      const r = NC.selectTextRange(el, Math.max(0, off - len), off);
      if (r) r.deleteContents();
      if (el.textContent === '') el.innerHTML = '';
    };

    const DEFAULTS = {
      table: () => ({ rows: [['', '', ''], ['', '', ''], ['', '', '']], header: true }),
      equation: () => ({ text: '' }),
      bookmark: () => ({ url: '' }),
      embed: () => ({ url: '' }),
      file: () => ({ url: '', name: '' }),
      button: () => ({ label: 'Nuevo botón', action: 'insert', template: '- [ ] Nueva tarea {{fecha}}' }),
      toc: () => ({}),
      breadcrumb: () => ({}),
    };

    const applySlash = (item) => {
      const menu = slashRef.current;
      setSlash(null);
      if (!menu) return;
      const b = getBlock(menu.blockId);
      const el = elOf(menu.blockId);
      if (!b || !el) return;
      eraseTrigger(el, menu.query.length + 1);
      A.updateBlock(pageId, b.id, { html: el.innerHTML });
      const empty = el.textContent.trim() === '' && !el.querySelector('.mention');
      const targetFor = (type, extra = {}) => {
        if (empty) {
          A.updateBlock(pageId, b.id, { type, html: '', ...extra });
          return b.id;
        }
        return A.insertBlock(pageId, b.id, type, { indent: b.indent, ...extra });
      };
      const replaceWith = (block) => {
        if (empty) {
          const r = NC.locateBlock(pageId, b.id);
          block.indent = b.indent;
          r.arr.splice(r.index, 1, block);
          A.updateBlock(pageId, block.id, {});
        } else A.insertBlocks(pageId, b.id, [Object.assign(block, { indent: b.indent })]);
        return block;
      };
      const id = item.id;
      if (TURN_INTO.includes(id)) {
        if (empty) setType(b, id);
        else {
          const nid = A.insertBlock(pageId, b.id, 'paragraph', { indent: b.indent });
          setType(getBlock(nid), id);
          focus(nid, 0);
        }
      } else if (id === 'divider') {
        const did = targetFor('divider');
        focus(A.insertBlock(pageId, did, 'paragraph', { indent: b.indent }), 0);
      } else if (id === 'image') {
        targetFor('image', { url: '' });
      } else if (DEFAULTS[id]) {
        const nid = targetFor(id, DEFAULTS[id]());
        setTimeout(() => {
          const e2 = elOf(nid);
          const input = e2 && e2.querySelector('input, textarea, [contenteditable="true"]');
          input ? input.focus() : e2 && e2.focus();
        }, 30);
      } else if (/^columns\d$/.test(id)) {
        const c = replaceWith(NC.newContainer('columns', Number(id.slice(7))));
        focus(c.cells[0].blocks[0].id, 0);
      } else if (id === 'tabs') {
        const c = replaceWith(NC.newContainer('tabs', 2));
        focus(c.cells[0].blocks[0].id, 0);
      } else if (id === 'date') {
        NC.setCaret(el, NC.getCaretOffset(el));
        document.execCommand('insertText', false, new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
      } else if (id === 'mention' || id === 'linkpage') {
        NC.setCaret(el, NC.getCaretOffset(el));
        document.execCommand('insertText', false, '@');
        const rect = NC.caretRect() || el.getBoundingClientRect();
        setMention({ blockId: b.id, query: '', index: 0, rect, link: id === 'linkpage' });
      } else if (id === 'newpage' || id.startsWith('db-')) {
        const isDb = id.startsWith('db-');
        const childId = A.createPage({
          parentId: pageId && !page.rowOf ? pageId : null,
          type: isDb ? 'database' : 'doc',
          layout: isDb ? id.slice(3) : undefined,
        });
        targetFor('page', { pageId: childId });
        NC.navigate(childId);
      }
    };

    const applyMention = (item) => {
      const menu = mentionRef.current;
      setMention(null);
      if (!menu) return;
      const b = getBlock(menu.blockId);
      const el = elOf(menu.blockId);
      if (!b || !el) return;
      eraseTrigger(el, menu.query.length + 1);
      if (menu.link && item.kind === 'page') {
        A.updateBlock(pageId, b.id, { html: el.innerHTML });
        if (!el.textContent.trim()) A.updateBlock(pageId, b.id, { type: 'page', pageId: item.id, html: '' });
        else A.insertBlock(pageId, b.id, 'page', { pageId: item.id, indent: b.indent });
        return;
      }
      NC.setCaret(el, NC.getCaretOffset(el));
      const span = item.kind === 'page'
        ? `<span class="mention" data-page="${item.id}" contenteditable="false">${NC.escapeHtml(item.icon + ' ' + item.label)}</span>&nbsp;`
        : `<span class="mention mention-date" data-date="${item.date}"${item.remind ? ' data-remind="1"' : ''} contenteditable="false">${item.remind ? '⏰ ' : '@'}${NC.escapeHtml(NC.formatDate(item.date))}</span>&nbsp;`;
      document.execCommand('insertHTML', false, span);
      A.updateBlock(pageId, b.id, { html: el.innerHTML });
      if (item.remind) NC.toast('Recordatorio creado para el ' + NC.formatDate(item.date));
    };

    const editDateMention = (b, span) => setDateEdit({ b, span, rect: span.getBoundingClientRect() });

    const MD = { '#': 'h1', '##': 'h2', '###': 'h3', '-': 'bulleted', '*': 'bulleted', '+': 'bulleted', '1.': 'numbered', '[]': 'todo', '[ ]': 'todo', '[x]': 'todo', '>': 'toggle', '"': 'quote', '```': 'code' };

    const onInput = (b, el) => {
      if (el.textContent === '' && !el.querySelector('img, .mention')) el.innerHTML = '';
      if (el.textContent === '---' && b.type !== 'code') {
        A.updateBlock(pageId, b.id, { type: 'divider', html: '' });
        focus(A.insertBlock(pageId, b.id, 'paragraph', { indent: b.indent }), 0);
        return;
      }
      const off = NC.getCaretOffset(el);
      const before = el.textContent.slice(0, off).replace(/ /g, ' ');
      // Atajos Markdown al escribir un espacio tras el prefijo (como withMarkdown de AppFlowy)
      if (before.endsWith(' ') && MD[before.slice(0, -1)]) {
        const type = MD[before.slice(0, -1)];
        if (b.type === 'paragraph' || (type !== b.type && TEXT_TYPES.includes(b.type))) {
          const r = NC.selectTextRange(el, 0, off);
          r && r.deleteContents();
          if (el.textContent === '') el.innerHTML = '';
          A.updateBlock(pageId, b.id, { html: el.innerHTML, checked: before === '[x] ' });
          closeMenus();
          setType(b, type);
          return focus(b.id, 0);
        }
      }
      A.updateBlock(pageId, b.id, { html: el.innerHTML });
      const ms = before.match(/(?:^|\s)\/([^/\n]{0,24})$/);
      const mm = before.match(/(?:^|\s)@([^\s@]{0,30})$/);
      if (ms && filterSlash(ms[1]).length) {
        const rect = NC.caretRect() || el.getBoundingClientRect();
        const cur = slashRef.current;
        setSlash({ blockId: b.id, query: ms[1], index: cur && cur.blockId === b.id && cur.query === ms[1] ? cur.index : 0, rect });
        mentionRef.current && setMention(null);
      } else if (before.match(/(?:^|\s):([a-záéíóúñü]{2,24})$/i)) {
        const q = before.match(/(?:^|\s):([a-záéíóúñü]{2,24})$/i)[1];
        if (!NC.searchEmoji(q, 1).length) return closeMenus();
        const rect = NC.caretRect() || el.getBoundingClientRect();
        const cur = emojiRef.current;
        setEmojiMenu({ blockId: b.id, query: q, index: cur && cur.query === q ? cur.index : 0, rect });
      } else if (mm) {
        const rect = NC.caretRect() || el.getBoundingClientRect();
        const cur = mentionRef.current;
        setMention({ blockId: b.id, query: mm[1], index: cur && cur.query === mm[1] ? cur.index : 0, rect, link: cur && cur.blockId === b.id ? cur.link : false });
        slashRef.current && setSlash(null);
      } else closeMenus();
    };

    const menuKeys = (e, menu, setMenu, items, apply) => {
      if (!items.length) return false;
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); setMenu({ ...menu, index: (menu.index + 1) % items.length }); return true; }
      if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); setMenu({ ...menu, index: (menu.index - 1 + items.length) % items.length }); return true; }
      if (e.key === 'Enter') { e.preventDefault(); apply(items[menu.index % items.length]); return true; }
      if (e.key === 'Escape') { e.preventDefault(); setMenu(null); return true; }
      return false;
    };

    const onKeyDown = (b, e) => {
      if (e.nativeEvent.isComposing) return;
      const el = e.currentTarget;
      const mod = e.metaKey || e.ctrlKey;
      clearSelection();

      const sm = slashRef.current;
      if (sm && sm.blockId === b.id && menuKeys(e, sm, setSlash, filterSlash(sm.query), applySlash)) return;
      const mm = mentionRef.current;
      if (mm && mm.blockId === b.id && menuKeys(e, mm, setMention, mentionItems(mm.query, mm.link), applyMention)) return;
      const em = emojiRef.current;
      if (em && em.blockId === b.id && menuKeys(e, em, setEmojiMenu, emojiItems(em.query), applyEmoji)) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        return selectIds([b.id]);
      }

      // Bloques no editables (divisor, imagen, enlace, tabla, ecuación…)
      if (!isEditable(b)) {
        if (e.target !== el) return;
        if (readOnly) return;
        if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          const p = prevOf(b);
          A.removeBlock(pageId, b.id);
          if (p) focus(p.id, 'end');
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (b.type === 'page') return NC.navigate(b.pageId);
          focus(A.insertBlock(pageId, b.id, 'paragraph', { indent: b.indent }), 0);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          const p = prevOf(b);
          e.preventDefault();
          p ? focus(p.id, 'end') : NC.focusTitleOf(pageId);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          const n = nextOf(b);
          if (n) { e.preventDefault(); focus(n.id, 0); }
        }
        return;
      }
      if (readOnly) return;

      // Atajos de bloque
      if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        A.shiftBlock(pageId, b.id, e.key === 'ArrowUp' ? -1 : 1);
        const off = b.type === 'code' ? 'end' : NC.getCaretOffset(el);
        return focus(b.id, off);
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        return focus(A.duplicateBlock(pageId, b.id), 'end');
      }
      if (mod && e.altKey && /^[0-9]$/.test(e.key)) {
        // ⌘⌥0..9: convertir (0 texto, 1-3 encabezados, 4 tarea, 5 viñeta, 6 numerada, 7 desplegable, 8 código)
        e.preventDefault();
        const map = ['paragraph', 'h1', 'h2', 'h3', 'todo', 'bulleted', 'numbered', 'toggle', 'code'];
        if (map[+e.key]) setType(b, map[+e.key]);
        return;
      }
      if (mod && e.key === 'Enter' && b.type === 'todo') {
        e.preventDefault();
        return A.updateBlock(pageId, b.id, { checked: !b.checked });
      }
      if (mod && e.key === 'Enter' && isToggle(b)) {
        e.preventDefault();
        return A.updateBlock(pageId, b.id, { collapsed: !b.collapsed });
      }

      if (b.type === 'code') {
        if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
        else if (e.key === 'Enter' && !mod) { e.preventDefault(); document.execCommand('insertText', false, '\n'); }
        else if (e.key === 'Enter' && mod) { e.preventDefault(); focus(A.insertBlock(pageId, b.id, 'paragraph', { indent: b.indent }), 0); }
        else if (e.key === 'Backspace' && !el.textContent) { e.preventDefault(); setType(b, 'paragraph'); }
        else if (e.key === 'ArrowUp' && NC.caretLines(el).first) { const p = prevOf(b); if (p) { e.preventDefault(); focus(p.id, 'end'); } }
        else if (e.key === 'ArrowDown' && NC.caretLines(el).last) { const n = nextOf(b); if (n) { e.preventDefault(); focus(n.id, 0); } }
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const empty = el.textContent === '' && !el.querySelector('.mention');
        if (empty && b.type !== 'paragraph') {
          if (LIST_TYPES.includes(b.type) && b.indent > 0) A.updateBlock(pageId, b.id, { indent: b.indent - 1 });
          else setType(b, 'paragraph');
          return;
        }
        const sel = window.getSelection();
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const tail = document.createRange();
        tail.selectNodeContents(el);
        tail.setStart(range.startContainer, range.startOffset);
        const frag = tail.extractContents();
        const tmp = document.createElement('div');
        tmp.appendChild(frag);
        const tailHtml = tmp.textContent === '' && !tmp.querySelector('.mention') ? '' : tmp.innerHTML;
        if (el.textContent === '' && !el.querySelector('.mention')) el.innerHTML = '';
        A.updateBlock(pageId, b.id, { html: el.innerHTML });
        const keep = LIST_TYPES.includes(b.type);
        // un desplegable abierto crea su primer hijo
        const childOfToggle = isToggle(b) && !b.collapsed && tailHtml === '';
        const newId = A.insertBlock(pageId, b.id, childOfToggle ? 'paragraph' : keep ? b.type : 'paragraph', {
          indent: b.indent + (childOfToggle ? 1 : 0),
          checked: false,
        });
        A.updateBlock(pageId, newId, { html: tailHtml });
        return focus(newId, 0);
      }

      if (e.key === 'Backspace' && NC.isCaretAtStart(el)) {
        e.preventDefault();
        if (b.type !== 'paragraph') return setType(b, 'paragraph');
        if (b.indent > 0) return A.updateBlock(pageId, b.id, { indent: b.indent - 1 });
        const p = prevOf(b);
        if (!p) {
          if (el.textContent === '' && page.blocks.length > 1) A.removeBlock(pageId, b.id);
          return NC.focusTitleOf(pageId);
        }
        if (!isText(p)) {
          if (el.textContent === '') A.removeBlock(pageId, b.id);
          return focus(p.id);
        }
        const prevLen = NC.htmlToText(p.html).length;
        A.updateBlock(pageId, p.id, { html: (p.html || '') + (el.innerHTML || '') });
        A.removeBlock(pageId, b.id);
        return focus(p.id, prevLen);
      }

      if (e.key === 'Delete' && NC.isCaretAtEnd(el)) {
        const n = nextOf(b);
        if (n && isText(n)) {
          e.preventDefault();
          const len = el.textContent.length;
          A.updateBlock(pageId, b.id, { html: el.innerHTML + (n.html || '') });
          A.removeBlock(pageId, n.id);
          return focus(b.id, len);
        }
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const off = NC.getCaretOffset(el);
        const r = NC.locateBlock(pageId, b.id);
        const p = r && r.arr[r.index - 1];
        if (e.shiftKey) {
          if (b.indent > 0) A.updateBlock(pageId, b.id, { indent: b.indent - 1 });
        } else if (p && b.indent <= p.indent) A.updateBlock(pageId, b.id, { indent: b.indent + 1 });
        return focus(b.id, off);
      }

      // Shift+↑/↓ en el borde del bloque: pasar a selección de bloques
      if (e.shiftKey && e.key === 'ArrowUp' && NC.isCaretAtStart(el)) {
        e.preventDefault();
        const p = prevOf(b);
        return selectIds(p ? [p.id, b.id] : [b.id]);
      }
      if (e.shiftKey && e.key === 'ArrowDown' && NC.isCaretAtEnd(el)) {
        e.preventDefault();
        const n = nextOf(b);
        return selectIds(n ? [b.id, n.id] : [b.id]);
      }

      if (e.key === 'ArrowUp' && !e.shiftKey && NC.caretLines(el).first) {
        const p = prevOf(b);
        e.preventDefault();
        return p ? focus(p.id, 'end') : NC.focusTitleOf(pageId);
      }
      if (e.key === 'ArrowDown' && !e.shiftKey && NC.caretLines(el).last) {
        const n = nextOf(b);
        if (n) { e.preventDefault(); return focus(n.id, 0); }
      }
      if (e.key === 'ArrowLeft' && !e.shiftKey && NC.isCaretAtStart(el)) {
        const p = prevOf(b);
        if (p) { e.preventDefault(); return focus(p.id, 'end'); }
      }
      if (e.key === 'ArrowRight' && !e.shiftKey && NC.isCaretAtEnd(el)) {
        const n = nextOf(b);
        if (n) { e.preventDefault(); return focus(n.id, 0); }
      }
    };

    const onPaste = (b, e) => {
      const text = e.clipboardData.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      const lines = text.replace(/\r/g, '').split('\n');
      if (lines.length === 1) {
        // Pegar una URL sobre texto seleccionado crea un enlace
        if (/^https?:\/\/\S+$/.test(text.trim()) && !window.getSelection().isCollapsed) return document.execCommand('createLink', false, text.trim());
        return document.execCommand('insertText', false, text);
      }
      const blocks = NC.markdownToBlocks(text).filter((x, i, arr) => !(x.type === 'paragraph' && !x.html && i === arr.length - 1));
      const el = e.currentTarget;
      if (el.textContent === '' && blocks.length) {
        const first = blocks.shift();
        A.updateBlock(pageId, b.id, { type: first.type, html: first.html, checked: first.checked, text: first.text, url: first.url });
      }
      blocks.forEach((x) => (x.indent += b.indent));
      if (blocks.length) {
        A.insertBlocks(pageId, b.id, blocks);
        focus(blocks[blocks.length - 1].id, 'end');
      }
    };

    const onBlur = (b) => {
      setTimeout(() => {
        if (document.activeElement === elOf(b.id)) return;
        const s = slashRef.current;
        if (s && s.blockId === b.id) setSlash(null);
        const m = mentionRef.current;
        if (m && m.blockId === b.id) setMention(null);
      }, 150);
    };

    const onFocusBlock = (b) => {
      anchorRef.current = b.id;
      clearSelection();
    };

    const addBelow = (b) => {
      const id = A.insertBlock(pageId, b.id, 'paragraph', { indent: b.indent });
      setTimeout(() => {
        const el = elOf(id);
        if (!el) return;
        NC.setCaret(el, 0);
        document.execCommand('insertText', false, '/');
      }, 0);
    };

    // Arrastrar y soltar (arriba/abajo, o a izquierda/derecha para crear columnas)
    const onDragStart = (b, e) => {
      dragId.current = b.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'block');
      const row = e.currentTarget.closest('.block-row');
      if (row) e.dataTransfer.setDragImage(row, 20, 12);
    };
    const onDragOver = (b, e) => {
      if (!dragId.current) return;
      e.preventDefault();
      e.stopPropagation();
      if (dragId.current === b.id) return setDrop(null);
      const content = e.currentTarget.querySelector('.block-content') || e.currentTarget;
      const r = content.getBoundingClientRect();
      let pos = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
      if (!NC.CONTAINERS.includes(b.type)) {
        if (e.clientX < r.left + 36) pos = 'left';
        else if (e.clientX > r.right - 36) pos = 'right';
      }
      if (!drop || drop.id !== b.id || drop.pos !== pos) setDrop({ id: b.id, pos });
    };
    const onDrop = (b, e) => {
      if (!dragId.current) return;
      e.preventDefault();
      e.stopPropagation();
      const pos = drop && drop.id === b.id ? drop.pos : 'after';
      const ids = selRef.current.has(dragId.current) && selRef.current.size > 1 ? null : dragId.current;
      if (pos === 'left' || pos === 'right') A.dropBeside(pageId, dragId.current, b.id, pos);
      else if (ids) A.moveBlock(pageId, ids, b.id, pos);
      else {
        // mover varios bloques seleccionados, conservando el orden
        const ordered = rowOrder().filter((id) => selRef.current.has(id));
        (pos === 'after' ? [...ordered].reverse() : ordered).forEach((id) => id !== b.id && A.moveBlock(pageId, id, b.id, pos));
      }
      dragId.current = null;
      setDrop(null);
    };
    const onDragEnd = () => {
      dragId.current = null;
      setDrop(null);
    };

    // Selección múltiple: arrastrar desde el margen, Shift+clic, Esc
    const onMouseDown = (e) => {
      if (readOnly || e.button !== 0) return;
      const row = e.target.closest('[data-block-row]');
      if (e.shiftKey && row && anchorRef.current) {
        const o = rowOrder();
        const a = o.indexOf(anchorRef.current);
        const z = o.indexOf(row.getAttribute('data-block-row'));
        if (a >= 0 && z >= 0) {
          e.preventDefault();
          return selectIds(o.slice(Math.min(a, z), Math.max(a, z) + 1));
        }
      }
      const inContent = e.target.closest('.block-content, .gutter, .comment-badge, input, button, textarea, a');
      if (inContent) return;
      // arrastre de selección desde zonas vacías
      const y0 = e.clientY;
      let moved = false;
      const move = (ev) => {
        if (Math.abs(ev.clientY - y0) < 6 && !moved) return;
        moved = true;
        const top = Math.min(y0, ev.clientY);
        const bottom = Math.max(y0, ev.clientY);
        const ids = [...rootRef.current.querySelectorAll('[data-block-row]')]
          .filter((r) => { const rr = r.getBoundingClientRect(); return rr.bottom > top && rr.top < bottom; })
          .map((r) => r.getAttribute('data-block-row'));
        // si se selecciona un contenedor entero, sobran sus hijos
        selectIds(ids.filter((id) => !ids.some((other) => other !== id && rootRef.current.querySelector(`[data-block-row="${other}"] [data-block-row="${id}"]`))));
        ev.preventDefault();
      };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    };

    // Teclado con bloques seleccionados
    useEffect(() => {
      if (!selected.size) return;
      const key = (e) => {
        const ids = rowOrder().filter((id) => selRef.current.has(id));
        if (!ids.length) return;
        const mod = e.metaKey || e.ctrlKey;
        if (e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]') && !rootRef.current.contains(e.target)) return;
        if (e.key === 'Escape') { e.preventDefault(); return setSelected(new Set()); }
        if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); A.removeBlocks(pageId, ids); return setSelected(new Set()); }
        if (e.key === 'Enter') { e.preventDefault(); setSelected(new Set()); return focus(ids[ids.length - 1], 'end'); }
        if (mod && (e.key === 'c' || e.key === 'x')) {
          e.preventDefault();
          const blocks = ids.map(getBlock).filter(Boolean);
          const md = NC.blocksToMarkdown ? NC.blocksToMarkdown(NC.getState(), blocks) : blocks.map((x) => NC.htmlToText(x.html)).join('\n');
          navigator.clipboard ? navigator.clipboard.writeText(md) : null;
          NC.clipboardBlocks = blocks.map(NC.cloneBlock);
          if (e.key === 'x') { A.removeBlocks(pageId, ids); setSelected(new Set()); }
          return NC.toast(e.key === 'x' ? 'Bloques cortados' : 'Bloques copiados');
        }
        if (mod && e.key === 'd') { e.preventDefault(); [...ids].reverse().forEach((id) => A.duplicateBlock(pageId, id)); return; }
        if (e.key === 'Tab') {
          e.preventDefault();
          ids.forEach((id) => { const b = getBlock(id); b && A.updateBlock(pageId, id, { indent: Math.max(0, b.indent + (e.shiftKey ? -1 : 1)) }); });
          return;
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const o = rowOrder();
          const edge = e.key === 'ArrowUp' ? o.indexOf(ids[0]) - 1 : o.indexOf(ids[ids.length - 1]) + 1;
          if (edge < 0 || edge >= o.length) return;
          return setSelected(new Set(e.shiftKey ? [...ids, o[edge]] : [o[edge]]));
        }
        if (e.key.length === 1 && !mod) setSelected(new Set());
      };
      const outside = (e) => { if (!e.target.closest('.block-row.selected, .popover')) setSelected(new Set()); };
      // ignora el mismo evento que creó la selección (sigue propagándose hasta document)
      const since = performance.now();
      const keyG = (e) => e.timeStamp > since && key(e);
      const outG = (e) => e.timeStamp > since && outside(e);
      document.addEventListener('keydown', keyG);
      document.addEventListener('mousedown', outG, true);
      return () => { document.removeEventListener('keydown', keyG); document.removeEventListener('mousedown', outG, true); };
    }, [selected]);

    // Ir a un bloque enlazado (#/pagina?b=bloque)
    useEffect(() => {
      const m = location.hash.match(/[?&]b=([a-z0-9]+)/i);
      if (!m) return;
      setTimeout(() => {
        const row = rootRef.current && rootRef.current.querySelector(`[data-block-row="${m[1]}"]`);
        if (row) { row.scrollIntoView({ block: 'center' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 1600); }
      }, 100);
    }, [pageId]);

    const ctx = {
      pageId, page, readOnly, selected, drop, onInput, onKeyDown, onPaste, onBlur, onFocusBlock, setType, focus, addBelow,
      onDragStart, onDragOver, onDrop, onDragEnd, clearSelection, editDateMention,
    };

    const clickTail = () => {
      if (readOnly) return;
      const last = page.blocks[page.blocks.length - 1];
      if (last && last.type === 'paragraph' && !last.html) return focus(last.id, 'end');
      focus(A.insertBlock(pageId, last ? last.id : null, 'paragraph'), 0);
    };

    NC.firstBlockFns[pageId] = () => {
      const o = order();
      const first = o[0] && getBlock(o[0]);
      if (first && isText(first)) return focus(first.id, 0);
      focus(A.insertBlocks(pageId, null, [NC.newBlock('paragraph')]), 0);
    };

    return html`<div className=${'editor' + (readOnly ? ' read-only' : '')} ref=${rootRef} onMouseDown=${onMouseDown}>
      <${BlockList} blocks=${page.blocks} ctx=${ctx} />
      <div className="editor-tail" onClick=${clickTail}></div>
      ${slash && html`<${FloatingMenu} menu=${slash} items=${filterSlash(slash.query)} onPick=${applySlash} setIndex=${(i) => setSlash({ ...slashRef.current, index: i })} />`}
      ${mention && html`<${FloatingMenu} menu=${mention} items=${mentionItems(mention.query, mention.link)} onPick=${applyMention} setIndex=${(i) => setMention({ ...mentionRef.current, index: i })} />`}
      ${emojiMenu && html`<${FloatingMenu} menu=${emojiMenu} items=${emojiItems(emojiMenu.query)} onPick=${applyEmoji} setIndex=${(i) => setEmojiMenu({ ...emojiRef.current, index: i })} width=${260} />`}
      ${dateEdit && html`<${DateMentionEditor} edit=${dateEdit} pageId=${pageId} onClose=${() => setDateEdit(null)} />`}
    </div>`;
  };

  function DateMentionEditor({ edit, pageId, onClose }) {
    const { b, span } = edit;
    const save = () => {
      const el = span.closest('.rt');
      el && A.updateBlock(pageId, b.id, { html: el.innerHTML });
    };
    return html`<${NC.Popover} anchor=${span} onClose=${onClose} className="menu date-mention">
      <div className="menu-label">Fecha</div>
      <input className="menu-input" type="date" defaultValue=${span.dataset.date}
        onChange=${(e) => { if (e.target.value) { span.dataset.date = e.target.value; refreshMentions(span.parentElement); save(); } }} />
      <label className="menu-item toggle-row">
        <span>⏰</span> Recordatorio a las 9:00
        <input type="checkbox" defaultChecked=${span.dataset.remind === '1'}
          onChange=${(e) => { if (e.target.checked) span.dataset.remind = '1'; else delete span.dataset.remind; refreshMentions(span.parentElement); save(); }} />
      </label>
      <button className="menu-item danger" onClick=${() => { const el = span.closest('.rt'); span.remove(); el && A.updateBlock(pageId, b.id, { html: el.innerHTML }); onClose(); }}><span>🗑</span> Quitar fecha</button>
    <//>`;
  }

  /* ---------- Barra de formato flotante ---------- */
  const TEXT_COLORS = { default: 'inherit', gray: '#787774', brown: '#9f6b53', orange: '#d9730d', yellow: '#cb912f', green: '#448361', blue: '#337ea9', purple: '#9065b0', pink: '#c14c8a', red: '#d44c47' };
  const BG_COLORS = { gray: '#f1f1ef', brown: '#f4eeee', orange: '#fbecdd', yellow: '#fbf3db', green: '#edf3ec', blue: '#e7f3f8', purple: '#f6f3f9', pink: '#faf1f5', red: '#fdebec' };

  NC.FormatToolbar = function FormatToolbar() {
    const [pos, setPos] = useState(null);
    const [mode, setMode] = useState(null); // null | 'link' | 'color' | 'turn'
    const [link, setLink] = useState('');
    const saved = useRef(null);
    const modeRef = useRef(null);
    modeRef.current = mode;

    useEffect(() => {
      const onSel = () => {
        if (modeRef.current) return;
        const sel = window.getSelection();
        if (!sel.rangeCount || sel.isCollapsed) return setPos(null);
        const node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
        const rt = node && node.closest('.rt');
        if (!rt || !rt.isContentEditable || !rt.contains(sel.focusNode)) return setPos(null);
        const r = sel.getRangeAt(0).getBoundingClientRect();
        if (!r.width) return setPos(null);
        setPos({ top: r.top - 44, left: r.left + r.width / 2 });
      };
      document.addEventListener('selectionchange', onSel);
      return () => document.removeEventListener('selectionchange', onSel);
    }, []);

    if (!pos) return null;
    const exec = (cmd, val = null) => (e) => {
      e.preventDefault();
      document.execCommand('styleWithCSS', false, cmd === 'foreColor' || cmd === 'hiliteColor');
      document.execCommand(cmd, false, val);
    };
    const wrapCode = (e) => {
      e.preventDefault();
      const sel = window.getSelection();
      const text = sel.toString();
      const node = sel.anchorNode && sel.anchorNode.parentElement;
      if (node && node.closest('code')) {
        const code = node.closest('code');
        code.replaceWith(document.createTextNode(code.textContent));
        code.ownerDocument.activeElement.dispatchEvent(new Event('input', { bubbles: true }));
      } else document.execCommand('insertHTML', false, '<code>' + NC.escapeHtml(text) + '</code>');
    };
    const restore = () => {
      const r = saved.current;
      if (!r) return null;
      const node = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
      const rt = node && node.closest('.rt');
      rt && rt.focus();
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      return rt;
    };
    const applyLink = (e) => {
      e.preventDefault();
      restore();
      const url = link.trim();
      if (!url) document.execCommand('unlink');
      else if (/^(https?:|mailto:)/.test(url)) document.execCommand('createLink', false, url);
      else document.execCommand('createLink', false, 'https://' + url);
      setMode(null);
      setLink('');
      setPos(null);
    };
    const startMode = (m) => (e) => {
      e.preventDefault();
      const sel = window.getSelection();
      saved.current = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      setMode(mode === m ? null : m);
    };
    const color = (cmd, val) => (e) => {
      e.preventDefault();
      restore();
      document.execCommand('styleWithCSS', false, true);
      document.execCommand(cmd, false, val);
      setMode(null);
    };
    const comment = (e) => {
      e.preventDefault();
      const sel = window.getSelection();
      const node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
      const row = node && node.closest('[data-block-row]');
      const quote = sel.toString().slice(0, 140);
      if (row && NC.openBlockComment) NC.openBlockComment(row.getAttribute('data-block-row'), quote, row);
      setPos(null);
    };

    return ReactDOM.createPortal(
      html`<div className="format-toolbar" style=${{ top: Math.max(8, pos.top), left: pos.left }} onMouseDown=${(e) => e.target.tagName !== 'INPUT' && e.preventDefault()}>
        <button title="Comentar" onMouseDown=${comment}>💬</button>
        <span className="sep"></span>
        <button title="Negrita (⌘B)" onMouseDown=${exec('bold')}><b>B</b></button>
        <button title="Cursiva (⌘I)" onMouseDown=${exec('italic')}><i>i</i></button>
        <button title="Subrayado (⌘U)" onMouseDown=${exec('underline')}><u>U</u></button>
        <button title="Tachado (⌘⇧S)" onMouseDown=${exec('strikeThrough')}><s>S</s></button>
        <button title="Código (⌘E)" onMouseDown=${wrapCode}>${'</>'}</button>
        <span className="sep"></span>
        <button title="Enlace (⌘K)" onMouseDown=${startMode('link')}>🔗</button>
        <button title="Color" onMouseDown=${startMode('color')}><span className="color-a">A</span>▾</button>
        <button title="Quitar formato" onMouseDown=${exec('removeFormat')}>⨯</button>
        ${mode === 'link' && html`<form className="tb-pop" onSubmit=${applyLink}>
          <input autoFocus placeholder="Pega un enlace…" value=${link} onInput=${(e) => setLink(e.target.value)}
            onKeyDown=${(e) => e.key === 'Escape' && (setMode(null), restore())} />
          <button className="btn-primary" type="submit">OK</button>
        </form>`}
        ${mode === 'color' && html`<div className="tb-pop color-pop">
          <div className="menu-label">Texto</div>
          <div className="swatches">${Object.entries(TEXT_COLORS).map(([k, v]) => html`<button key=${k} title=${NC.COLOR_NAMES[k]} className=${'color-swatch c-' + k} onMouseDown=${color('foreColor', v === 'inherit' ? 'currentColor' : v)}>A</button>`)}</div>
          <div className="menu-label">Fondo</div>
          <div className="swatches">
            <button className="color-swatch" title="Sin fondo" onMouseDown=${color('hiliteColor', 'transparent')}>∅</button>
            ${Object.entries(BG_COLORS).map(([k, v]) => html`<button key=${k} title=${NC.COLOR_NAMES[k]} className=${'color-swatch c-' + k + '_bg'} onMouseDown=${color('hiliteColor', v)}>A</button>`)}
          </div>
        </div>`}
      </div>`,
      document.body
    );
  };

  // Atajos de formato extra dentro del texto: ⌘E código, ⌘⇧S tachado, ⌘K enlace
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod || !e.target.closest || !e.target.closest('.rt[contenteditable="true"]')) return;
    if (e.key.toLowerCase() === 'e' && !e.shiftKey) {
      e.preventDefault();
      const t = window.getSelection().toString();
      if (t) document.execCommand('insertHTML', false, '<code>' + NC.escapeHtml(t) + '</code>');
    } else if (e.key.toLowerCase() === 's' && e.shiftKey) {
      e.preventDefault();
      document.execCommand('strikeThrough');
    } else if (e.key.toLowerCase() === 'k' && !window.getSelection().isCollapsed) {
      e.preventDefault();
      e.stopPropagation();
      const url = window.prompt('Enlace');
      if (url) document.execCommand('createLink', false, /^(https?:|mailto:)/.test(url) ? url : 'https://' + url);
    }
  }, true);
})();
