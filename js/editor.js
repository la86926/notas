/* Notas de L — editor por bloques (modelo plano con sangría, como los "nodes" de AppFlowy)
 * Incluye: menú "/", atajos Markdown, arrastrar y soltar, menú de bloque y barra de formato. */
(function () {
  const NC = window.NC;
  const { html } = NC;
  const A = NC.actions;
  const { useState, useRef, useLayoutEffect, useEffect, useCallback } = React;

  NC.firstBlockFns = {};
  NC.titleFns = {};
  NC.focusTitleOf = (id) => NC.titleFns[id] && NC.titleFns[id]();
  const TEXT_TYPES = ['paragraph', 'h1', 'h2', 'h3', 'todo', 'bulleted', 'numbered', 'toggle', 'quote', 'callout'];
  const LIST_TYPES = ['todo', 'bulleted', 'numbered', 'toggle'];
  const isText = (b) => TEXT_TYPES.includes(b.type);
  const isEditable = (b) => isText(b) || b.type === 'code';
  NC.isEditableBlock = isEditable;

  const PLACEHOLDERS = {
    paragraph: "Escribe '/' para ver comandos…", h1: 'Encabezado 1', h2: 'Encabezado 2', h3: 'Encabezado 3',
    todo: 'Tarea', bulleted: 'Lista', numbered: 'Lista', toggle: 'Desplegable', quote: 'Cita vacía', callout: 'Escribe algo…',
  };

  /* ---------- Menú "/" (equivalente al SlashPanel de AppFlowy) ---------- */
  const SLASH_ITEMS = [
    { id: 'paragraph', group: 'Bloques básicos', label: 'Texto', desc: 'Empieza a escribir texto normal.', icon: 'Aa', kw: 'text paragraph texto parrafo' },
    { id: 'h1', group: 'Bloques básicos', label: 'Encabezado 1', desc: 'Título de sección grande.', icon: 'H1', kw: 'heading h1 titulo encabezado' },
    { id: 'h2', group: 'Bloques básicos', label: 'Encabezado 2', desc: 'Título de sección mediano.', icon: 'H2', kw: 'heading h2 subtitulo encabezado' },
    { id: 'h3', group: 'Bloques básicos', label: 'Encabezado 3', desc: 'Título de sección pequeño.', icon: 'H3', kw: 'heading h3 subtitulo encabezado' },
    { id: 'todo', group: 'Bloques básicos', label: 'Lista de tareas', desc: 'Lleva el control con casillas.', icon: '☑', kw: 'todo task checkbox tarea casilla' },
    { id: 'bulleted', group: 'Bloques básicos', label: 'Lista con viñetas', desc: 'Una lista simple.', icon: '•', kw: 'bulleted list ul viñetas lista' },
    { id: 'numbered', group: 'Bloques básicos', label: 'Lista numerada', desc: 'Una lista con números.', icon: '1.', kw: 'numbered list ol numerada lista' },
    { id: 'toggle', group: 'Bloques básicos', label: 'Lista desplegable', desc: 'Oculta y muestra contenido.', icon: '▸', kw: 'toggle desplegable plegable' },
    { id: 'quote', group: 'Bloques básicos', label: 'Cita', desc: 'Captura una cita.', icon: '❝', kw: 'quote cita blockquote' },
    { id: 'callout', group: 'Bloques básicos', label: 'Destacado', desc: 'Resalta un texto.', icon: '💡', kw: 'callout destacado aviso nota' },
    { id: 'code', group: 'Bloques básicos', label: 'Código', desc: 'Fragmento de código.', icon: '</>', kw: 'code codigo snippet' },
    { id: 'divider', group: 'Bloques básicos', label: 'Divisor', desc: 'Separa bloques visualmente.', icon: '—', kw: 'divider hr linea separador divisor' },
    { id: 'newpage', group: 'Páginas y bases de datos', label: 'Página', desc: 'Inserta una subpágina.', icon: '📄', kw: 'page pagina subpagina' },
    { id: 'db-table', group: 'Páginas y bases de datos', label: 'Tabla', desc: 'Base de datos en vista de tabla.', icon: '▦', kw: 'database table tabla grid base datos' },
    { id: 'db-board', group: 'Páginas y bases de datos', label: 'Tablero', desc: 'Base de datos tipo Kanban.', icon: '▥', kw: 'board kanban tablero base datos' },
    { id: 'db-calendar', group: 'Páginas y bases de datos', label: 'Calendario', desc: 'Base de datos con calendario.', icon: '📅', kw: 'calendar calendario base datos' },
    { id: 'db-gallery', group: 'Páginas y bases de datos', label: 'Galería', desc: 'Base de datos con tarjetas.', icon: '▤', kw: 'gallery galeria tarjetas base datos' },
    { id: 'image', group: 'Insertar', label: 'Imagen', desc: 'Sube o enlaza una imagen.', icon: '🖼', kw: 'image imagen foto picture img' },
    { id: 'date', group: 'Insertar', label: 'Fecha de hoy', desc: 'Inserta la fecha actual.', icon: '📆', kw: 'date fecha hoy today' },
  ];
  const normalizeStr = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const filterSlash = (q) => {
    const n = normalizeStr(q);
    return SLASH_ITEMS.filter((it) => !n || normalizeStr(it.label + ' ' + it.kw).includes(n));
  };

  function SlashMenu({ menu, onPick, setIndex }) {
    const items = filterSlash(menu.query);
    const listRef = useRef(null);
    useEffect(() => {
      const el = listRef.current && listRef.current.querySelector('.slash-item.active');
      el && el.scrollIntoView({ block: 'nearest' });
    }, [menu.index]);
    if (!items.length) return null;
    const top = menu.rect.bottom + 6 + 320 > window.innerHeight ? Math.max(8, menu.rect.top - 326) : menu.rect.bottom + 6;
    let lastGroup = null;
    return ReactDOM.createPortal(
      html`<div className="popover slash-menu" ref=${listRef} style=${{ top, left: Math.min(menu.rect.left, window.innerWidth - 300) }}>
        ${items.map((it, i) => {
          const header = it.group !== lastGroup ? html`<div className="menu-label" key=${'g' + it.group}>${it.group}</div>` : null;
          lastGroup = it.group;
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
  function RichText({ b, ctx, className = '', tag = 'div' }) {
    const ref = useRef(null);
    useLayoutEffect(() => {
      const el = ref.current;
      if (el && el.innerHTML !== (b.html || '')) {
        el.innerHTML = b.html || '';
        b.html = el.innerHTML; // normalizado por el navegador (sin emitir)
      }
    });
    return React.createElement(tag, {
      ref,
      className: 'rt ' + className,
      contentEditable: true,
      suppressContentEditableWarning: true,
      spellCheck: true,
      'data-editable-id': b.id,
      'data-placeholder': PLACEHOLDERS[b.type] || '',
      onInput: (e) => ctx.onInput(b, e.currentTarget),
      onKeyDown: (e) => ctx.onKeyDown(b, e),
      onPaste: (e) => ctx.onPaste(b, e),
      onBlur: () => ctx.onBlur(b),
      onClick: (e) => {
        const a = e.target.closest('a');
        if (a && (e.metaKey || e.ctrlKey)) window.open(a.href, '_blank', 'noopener');
      },
    });
  }

  function CodeText({ b, ctx }) {
    const ref = useRef(null);
    useLayoutEffect(() => {
      const el = ref.current;
      if (el && el.textContent !== (b.text || '')) el.textContent = b.text || '';
    });
    return html`<pre ref=${ref} className="code-text" contentEditable="plaintext-only" suppressContentEditableWarning
      spellCheck=${false} data-editable-id=${b.id}
      onInput=${(e) => A.updateBlock(ctx.pageId, b.id, { text: e.currentTarget.textContent })}
      onKeyDown=${(e) => ctx.onKeyDown(b, e)} />`;
  }

  /* ---------- Bloques especiales ---------- */
  function ImageBlock({ b, ctx }) {
    const [url, setUrl] = useState('');
    const fileRef = useRef(null);
    if (b.url) {
      return html`<figure className="image-block" tabIndex=${0} data-editable-id=${b.id} onKeyDown=${(e) => ctx.onKeyDown(b, e)}>
        <img src=${b.url} alt="" style=${{ width: b.width ? b.width + '%' : '100%' }} />
        <div className="image-tools">
          ${[50, 75, 100].map((w) => html`<button key=${w} onClick=${() => A.updateBlock(ctx.pageId, b.id, { width: w })}>${w}%</button>`)}
          <button onClick=${() => A.updateBlock(ctx.pageId, b.id, { url: '' })}>Cambiar</button>
        </div>
      </figure>`;
    }
    const onFile = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 1.5e6) NC.toast('Imagen grande: puede llenar el almacenamiento local');
      const reader = new FileReader();
      reader.onload = () => A.updateBlock(ctx.pageId, b.id, { url: reader.result });
      reader.readAsDataURL(f);
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
      <span className="pl-icon">${p.icon || fallback}</span>
      <span className="pl-title">${p.title || 'Sin título'}</span>
    </div>`;
  }

  /* ---------- Fila de bloque ---------- */
  function BlockRow({ b, ctx, number, drop }) {
    const [menuAnchor, setMenuAnchor] = useState(null);
    const [emojiAnchor, setEmojiAnchor] = useState(null);
    let content;
    switch (b.type) {
      case 'h1': case 'h2': case 'h3':
        content = html`<${RichText} b=${b} ctx=${ctx} className=${'heading ' + b.type} />`;
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
        content = html`<div className="list-item">
          <button className=${'toggle-arrow' + (b.collapsed ? '' : ' open')} onClick=${() => A.updateBlock(ctx.pageId, b.id, { collapsed: !b.collapsed })}>▶</button>
          <${RichText} b=${b} ctx=${ctx} />
        </div>`;
        break;
      case 'quote':
        content = html`<${RichText} b=${b} ctx=${ctx} className="quote" />`;
        break;
      case 'callout':
        content = html`<div className="callout">
          <button className="callout-icon" onClick=${(e) => setEmojiAnchor(e.currentTarget)}>${b.icon || '💡'}</button>
          <${RichText} b=${b} ctx=${ctx} />
          ${emojiAnchor && html`<${NC.EmojiPicker} anchor=${emojiAnchor} onClose=${() => setEmojiAnchor(null)}
            onPick=${(e) => { A.updateBlock(ctx.pageId, b.id, { icon: e || '💡' }); setEmojiAnchor(null); }} />`}
        </div>`;
        break;
      case 'code':
        content = html`<div className="code-block">
          <div className="code-head">
            <input className="code-lang" value=${b.lang || ''} placeholder="lenguaje" onInput=${(e) => A.updateBlock(ctx.pageId, b.id, { lang: e.target.value })} />
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
      default:
        content = html`<${RichText} b=${b} ctx=${ctx} className="paragraph" />`;
    }
    const colorCls = b.color && b.color !== 'default' ? ' c-' + b.color : '';
    return html`<div className=${'block-row type-' + b.type + (drop ? ' drop-' + drop : '')}
        data-block-row=${b.id}
        style=${{ paddingLeft: b.indent * 26 }}
        onDragOver=${(e) => ctx.onDragOver(b, e)}
        onDrop=${(e) => ctx.onDrop(b, e)}>
      <div className="gutter" style=${{ left: b.indent * 26 - 52 }}>
        <button className="gutter-btn" title="Haz clic para añadir un bloque debajo" onClick=${() => ctx.addBelow(b)}>+</button>
        <span className="gutter-btn handle" draggable=${true} title="Arrastra para mover · clic para abrir el menú"
          onDragStart=${(e) => ctx.onDragStart(b, e)} onDragEnd=${ctx.onDragEnd}
          onClick=${(e) => setMenuAnchor(e.currentTarget)}>⋮⋮</span>
      </div>
      <div className=${'block-content' + colorCls}>${content}</div>
      ${menuAnchor && html`<${BlockMenu} b=${b} ctx=${ctx} anchor=${menuAnchor} onClose=${() => setMenuAnchor(null)} />`}
    </div>`;
  }

  const TURN_INTO = ['paragraph', 'h1', 'h2', 'h3', 'todo', 'bulleted', 'numbered', 'toggle', 'quote', 'callout', 'code'];

  function BlockMenu({ b, ctx, anchor, onClose }) {
    const [tab, setTab] = useState('main');
    const run = (fn) => () => { fn(); onClose(); };
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu block-menu">
      ${tab === 'main' && html`
        <button className="menu-item" onClick=${run(() => A.removeBlock(ctx.pageId, b.id))}><span>🗑</span> Eliminar</button>
        <button className="menu-item" onClick=${run(() => { const id = A.duplicateBlock(ctx.pageId, b.id); ctx.focus(id, 'end'); })}><span>⧉</span> Duplicar<kbd>⌘D</kbd></button>
        <button className="menu-item" onClick=${() => setTab('turn')}><span>↻</span> Convertir en <span className="chev">›</span></button>
        <button className="menu-item" onClick=${() => setTab('color')}><span>🎨</span> Color <span className="chev">›</span></button>
        <button className="menu-item" onClick=${run(() => A.shiftBlock(ctx.pageId, b.id, -1))}><span>↑</span> Mover arriba<kbd>⌘⇧↑</kbd></button>
        <button className="menu-item" onClick=${run(() => A.shiftBlock(ctx.pageId, b.id, 1))}><span>↓</span> Mover abajo<kbd>⌘⇧↓</kbd></button>`}
      ${tab === 'turn' && html`
        <div className="menu-label">Convertir en</div>
        ${TURN_INTO.map((t) => {
          const it = SLASH_ITEMS.find((x) => x.id === t);
          return html`<button key=${t} className=${'menu-item' + (b.type === t ? ' selected' : '')} onClick=${run(() => ctx.setType(b, t))}>
            <span className="slash-icon small">${it.icon}</span> ${it.label}</button>`;
        })}`}
      ${tab === 'color' && html`
        <div className="menu-label">Color del texto</div>
        ${NC.COLORS.map((c) => html`<button key=${c} className="menu-item" onClick=${run(() => A.updateBlock(ctx.pageId, b.id, { color: c }))}>
          <span className=${'color-swatch c-' + c}>A</span> ${NC.COLOR_NAMES[c]}</button>`)}
        <div className="menu-label">Fondo</div>
        ${NC.COLORS.slice(1).map((c) => html`<button key=${c + 'bg'} className="menu-item" onClick=${run(() => A.updateBlock(ctx.pageId, b.id, { color: c + '_bg' }))}>
          <span className=${'color-swatch c-' + c + '_bg'}>A</span> Fondo ${NC.COLOR_NAMES[c].toLowerCase()}</button>`)}`}
    <//>`;
  }

  /* ---------- Editor ---------- */
  NC.Editor = function Editor({ page }) {
    NC.useStore();
    const pageId = page.id;
    const [slash, setSlash] = useState(null); // {blockId, query, index, rect}
    const slashRef = useRef(null);
    slashRef.current = slash;
    const [drop, setDrop] = useState(null); // {id, pos}
    const dragId = useRef(null);

    // Bloques visibles (oculta hijos de desplegables cerrados) + numeración
    const visible = [];
    const numbers = {};
    let hideBelow = null;
    const counters = [];
    const lastType = [];
    for (const b of page.blocks) {
      if (hideBelow != null && b.indent > hideBelow) continue;
      hideBelow = null;
      if (b.type === 'toggle' && b.collapsed) hideBelow = b.indent;
      for (let k = b.indent + 1; k < lastType.length; k++) lastType[k] = null;
      if (b.type === 'numbered') {
        counters[b.indent] = lastType[b.indent] === 'numbered' ? counters[b.indent] + 1 : 1;
        numbers[b.id] = counters[b.indent];
      }
      lastType[b.indent] = b.type;
      visible.push(b);
    }

    const elOf = (id) => document.querySelector(`[data-editable-id="${id}"]`);
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

    const vIndex = (b) => visible.findIndex((x) => x.id === b.id);
    const prevOf = (b) => visible[vIndex(b) - 1];
    const nextOf = (b) => visible[vIndex(b) + 1];

    const setType = (b, type) => {
      const patch = { type };
      if (type === 'code' && b.type !== 'code') patch.text = NC.htmlToText(b.html);
      if (b.type === 'code' && type !== 'code') patch.html = NC.escapeHtml(b.text || '').replace(/\n/g, '<br>');
      if (type === 'callout' && !b.icon) patch.icon = '💡';
      A.updateBlock(pageId, b.id, patch);
      focus(b.id, 'end');
    };

    const closeSlash = () => slashRef.current && setSlash(null);

    const applySlash = (item) => {
      const menu = slashRef.current;
      setSlash(null);
      if (!menu) return;
      const b = page.blocks.find((x) => x.id === menu.blockId);
      const el = elOf(menu.blockId);
      if (!b || !el) return;
      const off = NC.getCaretOffset(el);
      const r = NC.selectTextRange(el, Math.max(0, off - menu.query.length - 1), off);
      if (r) r.deleteContents();
      if (el.textContent === '') el.innerHTML = '';
      A.updateBlock(pageId, b.id, { html: el.innerHTML });
      const empty = el.textContent.trim() === '';
      const targetFor = (type, extra = {}) => {
        if (empty) {
          A.updateBlock(pageId, b.id, { type, ...extra });
          return b.id;
        }
        return A.insertBlock(pageId, b.id, type, { indent: b.indent, ...extra });
      };
      if (TURN_INTO.includes(item.id)) {
        if (empty) setType(b, item.id);
        else focus(A.insertBlock(pageId, b.id, item.id, { indent: b.indent, icon: item.id === 'callout' ? '💡' : undefined }), 0);
      } else if (item.id === 'divider') {
        const id = targetFor('divider');
        focus(A.insertBlock(pageId, id, 'paragraph', { indent: b.indent }), 0);
      } else if (item.id === 'image') {
        targetFor('image', { url: '' });
      } else if (item.id === 'date') {
        NC.setCaret(el, NC.getCaretOffset(el));
        document.execCommand('insertText', false, new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
      } else if (item.id === 'newpage' || item.id.startsWith('db-')) {
        const isDb = item.id.startsWith('db-');
        const childId = A.createPage({
          parentId: pageId && !page.rowOf ? pageId : null,
          type: isDb ? 'database' : 'doc',
          layout: isDb ? item.id.slice(3) : undefined,
        });
        targetFor('page', { pageId: childId });
        NC.navigate(childId);
      }
    };

    const MD = { '#': 'h1', '##': 'h2', '###': 'h3', '-': 'bulleted', '*': 'bulleted', '+': 'bulleted', '1.': 'numbered', '[]': 'todo', '[ ]': 'todo', '[x]': 'todo', '>': 'toggle', '"': 'quote', '```': 'code' };

    const onInput = (b, el) => {
      if (el.textContent === '' && !el.querySelector('img')) el.innerHTML = '';
      if (el.textContent === '---' && b.type !== 'code') {
        A.updateBlock(pageId, b.id, { type: 'divider', html: '' });
        focus(A.insertBlock(pageId, b.id, 'paragraph', { indent: b.indent }), 0);
        return;
      }
      const off = NC.getCaretOffset(el);
      const before = el.textContent.slice(0, off).replace(/\u00a0/g, ' ');
      // Atajos Markdown al escribir un espacio tras el prefijo (como withMarkdown de AppFlowy)
      if (before.endsWith(' ') && MD[before.slice(0, -1)]) {
        const type = MD[before.slice(0, -1)];
        if (b.type === 'paragraph' || (type !== b.type && TEXT_TYPES.includes(b.type))) {
          const r = NC.selectTextRange(el, 0, off);
          r && r.deleteContents();
          if (el.textContent === '') el.innerHTML = '';
          A.updateBlock(pageId, b.id, { html: el.innerHTML, checked: before === '[x] ' });
          closeSlash();
          setType(b, type);
          return focus(b.id, 0);
        }
      }
      A.updateBlock(pageId, b.id, { html: el.innerHTML });
      const m = before.match(/(?:^|\s)\/([^\s/]{0,24})$/);
      if (m && filterSlash(m[1]).length) {
        const rect = NC.caretRect() || el.getBoundingClientRect();
        const cur = slashRef.current;
        setSlash({ blockId: b.id, query: m[1], index: cur && cur.blockId === b.id && cur.query === m[1] ? cur.index : 0, rect });
      } else closeSlash();
    };


    const onKeyDown = (b, e) => {
      if (e.nativeEvent.isComposing) return;
      const el = e.currentTarget;
      const mod = e.metaKey || e.ctrlKey;
      const menu = slashRef.current;

      // Navegación dentro del menú "/"
      if (menu && menu.blockId === b.id) {
        const items = filterSlash(menu.query);
        if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); return setSlash({ ...menu, index: (menu.index + 1) % items.length }); }
        if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); return setSlash({ ...menu, index: (menu.index - 1 + items.length) % items.length }); }
        if (e.key === 'Enter') { e.preventDefault(); return applySlash(items[menu.index % items.length]); }
        if (e.key === 'Escape') { e.preventDefault(); return setSlash(null); }
      }

      // Bloques no editables (divisor, imagen, enlace a página)
      if (!isEditable(b)) {
        if (e.target !== el) return;
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
          if (p) { e.preventDefault(); focus(p.id, 'end'); } else { e.preventDefault(); NC.focusTitleOf(pageId); }
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          const n = nextOf(b);
          if (n) { e.preventDefault(); focus(n.id, 0); }
        }
        return;
      }

      // Atajos globales de bloque
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
        const empty = el.textContent === '';
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
        const tailHtml = tmp.textContent === '' ? '' : tmp.innerHTML;
        if (el.textContent === '') el.innerHTML = '';
        A.updateBlock(pageId, b.id, { html: el.innerHTML });
        const keep = LIST_TYPES.includes(b.type);
        // un desplegable abierto crea su primer hijo
        const childOfToggle = b.type === 'toggle' && !b.collapsed && tailHtml === '';
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
        if (!p) return el.textContent === '' && page.blocks.length > 1 ? (A.removeBlock(pageId, b.id), NC.focusTitleOf(pageId)) : NC.focusTitleOf(pageId);
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
        if (e.shiftKey) {
          if (b.indent > 0) A.updateBlock(pageId, b.id, { indent: b.indent - 1 });
        } else {
          const p = prevOf(b);
          if (p && b.indent <= p.indent) A.updateBlock(pageId, b.id, { indent: b.indent + 1 });
        }
        return focus(b.id, off);
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
      if (lines.length === 1) return document.execCommand('insertText', false, text);
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
        const m = slashRef.current;
        if (m && m.blockId === b.id && document.activeElement !== elOf(b.id)) setSlash(null);
      }, 120);
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

    // Arrastrar y soltar
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
      const r = e.currentTarget.getBoundingClientRect();
      const pos = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
      if (!drop || drop.id !== b.id || drop.pos !== pos) setDrop({ id: b.id, pos });
    };
    const onDrop = (b, e) => {
      if (!dragId.current) return;
      e.preventDefault();
      const pos = drop && drop.id === b.id ? drop.pos : 'after';
      A.moveBlock(pageId, dragId.current, b.id, pos);
      dragId.current = null;
      setDrop(null);
    };
    const onDragEnd = () => {
      dragId.current = null;
      setDrop(null);
    };

    const ctx = { pageId, onInput, onKeyDown, onPaste, onBlur, setType, focus, addBelow, onDragStart, onDragOver, onDrop, onDragEnd };

    const clickTail = () => {
      const last = page.blocks[page.blocks.length - 1];
      if (last && last.type === 'paragraph' && !last.html) return focus(last.id, 'end');
      focus(A.insertBlock(pageId, last ? last.id : null, 'paragraph'), 0);
    };

    NC.firstBlockFns[pageId] = () => {
      const first = visible[0];
      if (first && isText(first)) return focus(first.id, 0);
      focus(A.insertBlocks(pageId, null, [{ id: NC.uid(), type: 'paragraph', html: '', indent: 0 }]), 0);
    };

    return html`<div className="editor">
      ${visible.map((b) => html`<${BlockRow} key=${b.id} b=${b} ctx=${ctx} number=${numbers[b.id]} drop=${drop && drop.id === b.id ? drop.pos : null} />`)}
      <div className="editor-tail" onClick=${clickTail}></div>
      ${slash && html`<${SlashMenu} menu=${slash} onPick=${applySlash} setIndex=${(i) => setSlash({ ...slashRef.current, index: i })} />`}
    </div>`;
  };

  /* ---------- Barra de formato flotante ---------- */
  const TEXT_COLORS = { default: 'inherit', gray: '#787774', brown: '#9f6b53', orange: '#d9730d', yellow: '#cb912f', green: '#448361', blue: '#337ea9', purple: '#9065b0', pink: '#c14c8a', red: '#d44c47' };
  const BG_COLORS = { gray: '#f1f1ef', brown: '#f4eeee', orange: '#fbecdd', yellow: '#fbf3db', green: '#edf3ec', blue: '#e7f3f8', purple: '#f6f3f9', pink: '#faf1f5', red: '#fdebec' };

  NC.FormatToolbar = function FormatToolbar() {
    const [pos, setPos] = useState(null);
    const [mode, setMode] = useState(null); // null | 'link' | 'color'
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
        if (!rt || !rt.contains(sel.focusNode)) return setPos(null);
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

    return ReactDOM.createPortal(
      html`<div className="format-toolbar" style=${{ top: Math.max(8, pos.top), left: pos.left }} onMouseDown=${(e) => e.target.tagName !== 'INPUT' && e.preventDefault()}>
        <button title="Negrita (⌘B)" onMouseDown=${exec('bold')}><b>B</b></button>
        <button title="Cursiva (⌘I)" onMouseDown=${exec('italic')}><i>i</i></button>
        <button title="Subrayado (⌘U)" onMouseDown=${exec('underline')}><u>U</u></button>
        <button title="Tachado" onMouseDown=${exec('strikeThrough')}><s>S</s></button>
        <button title="Código" onMouseDown=${wrapCode}>${'</>'}</button>
        <span className="sep"></span>
        <button title="Enlace" onMouseDown=${startMode('link')}>🔗</button>
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
})();
