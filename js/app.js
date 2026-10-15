/* Notas de L — shell de la aplicación: barra lateral, página, búsqueda, papelera y ajustes */
(function () {
  const NC = window.NC;
  const { html } = NC;
  const A = NC.actions;
  const { useState, useRef, useEffect, useLayoutEffect } = React;

  const APP_NAME = (window.NOTAS_CONFIG && window.NOTAS_CONFIG.appName) || 'Notas de L';
  const pageIcon = (p) => p.icon || (p.type === 'database' ? '🗃️' : '📄');
  const pageTitle = (p) => p.title || 'Sin título';

  /* ---------- Menú de página (compartido por barra lateral y cabecera) ---------- */
  function PageMenu({ page, anchor, onClose, extended = false }) {
    const run = (fn) => () => { fn(); onClose(); };
    const exportMd = () => {
      const s = NC.getState();
      const md = NC.pageToMarkdown(s, page);
      NC.download((page.title || 'Sin título').replace(/[\\/:*?"<>|]/g, '-') + '.md', md);
    };
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu" align=${extended ? 'right' : 'left'}>
      <button className="menu-item" onClick=${run(() => A.updatePage(page.id, { favorite: !page.favorite }))}>
        <span>${page.favorite ? '★' : '☆'}</span> ${page.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}</button>
      <button className="menu-item" onClick=${run(() => NC.navigate(A.duplicatePage(page.id)))}><span>⧉</span> Duplicar</button>
      <button className="menu-item" onClick=${run(() => { navigator.clipboard && navigator.clipboard.writeText(location.href.split('#')[0] + '#/' + page.id); NC.toast('Enlace copiado'); })}><span>🔗</span> Copiar enlace</button>
      <button className="menu-item" onClick=${run(exportMd)}><span>⬇</span> Exportar a Markdown</button>
      ${extended && html`
        <div className="menu-sep"></div>
        <div className="menu-label">Estilo</div>
        <div className="font-picker">
          ${[['default', 'Ag', 'Predeterminada'], ['serif', 'Ag', 'Serif'], ['mono', 'Ag', 'Mono']].map(([f, s, l]) => html`
            <button key=${f} className=${'font-opt f-' + f + (page.font === f ? ' selected' : '')} onClick=${() => A.updatePage(page.id, { font: f })}>
              <span>${s}</span><small>${l}</small></button>`)}
        </div>
        <label className="menu-item toggle-row">
          <span>↔</span> Ancho completo
          <input type="checkbox" checked=${!!page.fullWidth} onChange=${() => A.updatePage(page.id, { fullWidth: !page.fullWidth })} />
        </label>`}
      <div className="menu-sep"></div>
      <button className="menu-item danger" onClick=${run(() => A.trashPage(page.id))}><span>🗑</span> Mover a la papelera</button>
      ${extended && html`<div className="menu-foot">Editado ${NC.timeAgo(page.updatedAt)}<br />Creado ${new Date(page.createdAt).toLocaleString('es-ES')}</div>`}
    <//>`;
  }

  NC.pageToMarkdown = (s, page) => {
    const out = ['# ' + pageTitle(page), ''];
    if (page.type === 'database') out.push(NC.dbToMarkdown(s, page));
    let num = {};
    (page.blocks || []).forEach((b) => {
      const pad = '  '.repeat(b.indent);
      const t = NC.htmlToMd(b.html || '');
      if (b.type !== 'numbered') num[b.indent] = 0;
      switch (b.type) {
        case 'h1': out.push('# ' + t); break;
        case 'h2': out.push('## ' + t); break;
        case 'h3': out.push('### ' + t); break;
        case 'todo': out.push(`${pad}- [${b.checked ? 'x' : ' '}] ${t}`); break;
        case 'bulleted': case 'toggle': out.push(`${pad}- ${t}`); break;
        case 'numbered': num[b.indent] = (num[b.indent] || 0) + 1; out.push(`${pad}${num[b.indent]}. ${t}`); break;
        case 'quote': out.push('> ' + t); break;
        case 'callout': out.push(`> ${b.icon || '💡'} ${t}`); break;
        case 'code': out.push('```' + (b.lang || ''), b.text || '', '```'); break;
        case 'divider': out.push('---'); break;
        case 'image': b.url && !b.url.startsWith('data:') && out.push(`![](${b.url})`); break;
        case 'page': { const p = s.pages[b.pageId]; p && out.push(`[${pageTitle(p)}](${encodeURIComponent(pageTitle(p))}.md)`); break; }
        default: out.push(pad + t);
      }
    });
    return out.join('\n') + '\n';
  };

  /* ---------- Árbol de la barra lateral ---------- */
  const treeDrag = { id: null };

  function TreeItem({ id, depth, s }) {
    const p = s.pages[id];
    const [menu, setMenu] = useState(null);
    const [drop, setDrop] = useState(null);
    if (!p || p.trashed) return null;
    const kids = p.children.filter((c) => s.pages[c] && !s.pages[c].trashed);
    const active = s.ui.current === id;
    const onDragOver = (e) => {
      if (!treeDrag.id || treeDrag.id === id) return;
      e.preventDefault();
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - r.top;
      setDrop(y < r.height * 0.28 ? 'before' : y > r.height * 0.72 ? 'after' : 'inside');
    };
    const onDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dragged = treeDrag.id;
      treeDrag.id = null;
      const where = drop;
      setDrop(null);
      if (!dragged || dragged === id) return;
      if (where === 'inside') return A.movePage(dragged, id, p.children.length);
      const list = p.parentId ? s.pages[p.parentId].children : s.rootIds;
      const idx = list.indexOf(id) + (where === 'after' ? 1 : 0);
      A.movePage(dragged, p.parentId, idx);
    };
    return html`<div>
      <div className=${'tree-item' + (active ? ' active' : '') + (drop ? ' drop-' + drop : '')}
        style=${{ paddingLeft: 8 + depth * 14 }}
        draggable=${true}
        onDragStart=${(e) => { treeDrag.id = id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'page'); }}
        onDragEnd=${() => { treeDrag.id = null; setDrop(null); }}
        onDragOver=${onDragOver} onDragLeave=${() => setDrop(null)} onDrop=${onDrop}
        onClick=${() => NC.navigate(id)}>
        <button className=${'tree-toggle' + (p.expanded ? ' open' : '') + (kids.length ? '' : ' leaf')}
          onClick=${(e) => { e.stopPropagation(); A.updatePage(id, { expanded: !p.expanded }, true); }}>▶</button>
        <span className="tree-icon">${pageIcon(p)}</span>
        <span className="tree-title">${pageTitle(p)}</span>
        <span className="tree-actions">
          <button title="Más" onClick=${(e) => { e.stopPropagation(); setMenu(e.currentTarget); }}>···</button>
          ${p.type === 'doc' && html`<button title="Añadir una página dentro" onClick=${(e) => { e.stopPropagation(); NC.navigate(A.createPage({ parentId: id })); }}>+</button>`}
        </span>
      </div>
      ${menu && html`<${PageMenu} page=${p} anchor=${menu} onClose=${() => setMenu(null)} />`}
      ${p.expanded && (kids.length
        ? kids.map((c) => html`<${TreeItem} key=${c} id=${c} depth=${depth + 1} s=${s} />`)
        : p.type === 'doc' && html`<div className="tree-empty" style=${{ paddingLeft: 30 + depth * 14 }}>Sin páginas dentro</div>`)}
    </div>`;
  }

  function Sidebar() {
    const s = NC.useStore();
    const [newMenu, setNewMenu] = useState(null);
    const [wsMenu, setWsMenu] = useState(null);
    const fileRef = useRef(null);
    const favs = Object.values(s.pages).filter((p) => p.favorite && !A.isInTrash(p.id));
    const roots = s.rootIds.filter((id) => s.pages[id] && !s.pages[id].trashed);
    const startResize = (e) => {
      e.preventDefault();
      const move = (ev) => { s.settings.sidebarWidth = Math.max(200, Math.min(480, ev.clientX)); A.setUI({}); };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); A.setSettings({}); };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    };
    const importMd = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      f.text().then((t) => NC.navigate(A.importMarkdown(f.name.replace(/\.(md|markdown|txt)$/i, ''), t)));
      e.target.value = '';
    };
    return html`<aside className="sidebar" style=${{ width: s.settings.sidebarWidth }}>
      <div className="ws-header" onClick=${(e) => setWsMenu(e.currentTarget)}>
        <span className="ws-avatar">${APP_NAME.slice(-1)}</span>
        <span className="ws-name">${APP_NAME}</span>
        <span className="chev">⌄</span>
        <button className="collapse-btn" title="Ocultar barra lateral (⌘\\)" onClick=${(e) => { e.stopPropagation(); A.setSettings({ sidebarCollapsed: true }); }}>«</button>
      </div>
      <div className="side-nav">
        <button className="side-link" onClick=${() => A.setUI({ search: true })}><span>🔍</span> Buscar <kbd>⌘K</kbd></button>
        <button className="side-link" onClick=${() => A.setUI({ settings: true })}><span>⚙️</span> Ajustes</button>
        <button className="side-link" onClick=${(e) => setNewMenu(e.currentTarget)}><span>✚</span> Nueva página</button>
      </div>
      <div className="side-scroll">
        ${favs.length > 0 && html`<div className="side-section">
          <div className="side-label">Favoritos</div>
          ${favs.map((p) => html`<div key=${p.id} className=${'tree-item' + (s.ui.current === p.id ? ' active' : '')} style=${{ paddingLeft: 8 }} onClick=${() => NC.navigate(p.id)}>
            <span className="tree-toggle leaf"></span><span className="tree-icon">${pageIcon(p)}</span><span className="tree-title">${pageTitle(p)}</span>
          </div>`)}
        </div>`}
        <div className="side-section">
          <div className="side-label">Privado
            <button className="side-label-btn" title="Añadir página" onClick=${() => NC.navigate(A.createPage())}>+</button>
          </div>
          <div onDragOver=${(e) => treeDrag.id && e.preventDefault()}
            onDrop=${(e) => { if (treeDrag.id) { A.movePage(treeDrag.id, null, s.rootIds.length); treeDrag.id = null; } }}>
            ${roots.map((id) => html`<${TreeItem} key=${id} id=${id} depth=${0} s=${s} />`)}
            <div className="tree-drop-tail"></div>
          </div>
        </div>
      </div>
      <div className="side-foot">
        <${AccountBox} />
        <button className="side-link" onClick=${() => A.setUI({ trash: true })}><span>🗑</span> Papelera</button>
      </div>
      <div className="side-resizer" onMouseDown=${startResize}></div>
      <input type="file" accept=".md,.markdown,.txt" hidden ref=${fileRef} onChange=${importMd} />
      ${newMenu && html`<${NC.Popover} anchor=${newMenu} onClose=${() => setNewMenu(null)} className="menu">
        <button className="menu-item" onClick=${() => { setNewMenu(null); NC.navigate(A.createPage()); }}><span>📄</span> Documento</button>
        ${Object.entries(NC.VIEW_NAMES).map(([t, l]) => html`<button key=${t} className="menu-item"
          onClick=${() => { setNewMenu(null); NC.navigate(A.createPage({ type: 'database', layout: t, icon: null })); }}>
          <span>${{ table: '▦', board: '▥', calendar: '📅', gallery: '▤' }[t]}</span> Base de datos · ${l}</button>`)}
        <div className="menu-sep"></div>
        <button className="menu-item" onClick=${() => { setNewMenu(null); fileRef.current.click(); }}><span>⬆</span> Importar Markdown…</button>
      <//>`}
      ${wsMenu && html`<${NC.Popover} anchor=${wsMenu} onClose=${() => setWsMenu(null)} className="menu">
        <div className="menu-label">Espacio de trabajo</div>
        <button className="menu-item" onClick=${() => { setWsMenu(null); A.setUI({ settings: true }); }}><span>⚙️</span> Ajustes y copia de seguridad</button>
        <button className="menu-item" onClick=${() => { setWsMenu(null); A.setSettings({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }); }}><span>🌓</span> Cambiar tema</button>
      <//>`}
    </aside>`;
  }

  /* ---------- Cabecera ---------- */
  function Topbar({ page }) {
    const s = NC.useStore();
    const [menu, setMenu] = useState(null);
    const crumbs = [];
    let p = page;
    while (p) {
      crumbs.unshift(p);
      p = s.pages[p.rowOf || p.parentId];
    }
    return html`<header className="topbar">
      ${s.settings.sidebarCollapsed && html`<button className="icon-btn" title="Mostrar barra lateral (⌘\\)" onClick=${() => A.setSettings({ sidebarCollapsed: false })}>☰</button>`}
      <nav className="crumbs">
        ${crumbs.map((c, i) => html`<${React.Fragment} key=${c.id}>
          ${i > 0 && html`<span className="crumb-sep">/</span>`}
          <button className="crumb" onClick=${() => NC.navigate(c.id)}>${pageIcon(c)} ${pageTitle(c)}</button>
        <//>`)}
      </nav>
      <span className="grow"></span>
      <span className="muted small edited">Editado ${NC.timeAgo(page.updatedAt)}</span>
      <button className="icon-btn" title=${page.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'} onClick=${() => A.updatePage(page.id, { favorite: !page.favorite })}>${page.favorite ? '★' : '☆'}</button>
      <button className="icon-btn" title="Más" onClick=${(e) => setMenu(e.currentTarget)}>···</button>
      ${menu && html`<${PageMenu} page=${page} anchor=${menu} onClose=${() => setMenu(null)} extended=${true} />`}
    </header>`;
  }

  /* ---------- Título ---------- */
  function Title({ page }) {
    const ref = useRef(null);
    useLayoutEffect(() => {
      if (ref.current && ref.current.textContent !== page.title) ref.current.textContent = page.title;
    });
    NC.titleFns[page.id] = () => ref.current && NC.setCaret(ref.current, 'end');
    const onKeyDown = (e) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === 'Enter' || (e.key === 'ArrowDown' && NC.caretLines(ref.current).last)) {
        e.preventDefault();
        if (page.type !== 'database') NC.firstBlockFns[page.id] && NC.firstBlockFns[page.id]();
      }
    };
    return html`<h1 ref=${ref} className="page-title" contentEditable="plaintext-only" suppressContentEditableWarning
      data-placeholder="Sin título" onKeyDown=${onKeyDown}
      onInput=${(e) => { const t = e.currentTarget.textContent.replace(/\n/g, ''); if (!t) e.currentTarget.innerHTML = ''; A.updatePage(page.id, { title: t }); }} />`;
  }

  /* ---------- Vista de página ---------- */
  function PageView({ pageId, peek = false }) {
    const s = NC.useStore();
    const page = s.pages[pageId];
    const [emoji, setEmoji] = useState(null);
    const [coverMenu, setCoverMenu] = useState(null);
    useEffect(() => {
      if (!page || peek) return;
      document.title = (page.icon ? page.icon + ' ' : '') + pageTitle(page) + ' · ' + APP_NAME;
      if (!page.title && page.type === 'doc') setTimeout(() => NC.focusTitleOf(page.id), 30);
    }, [pageId]);
    if (!page) return html`<div className="empty-state">Esta página no existe.</div>`;
    const inTrash = A.isInTrash(page.id);
    const cover = NC.coverStyle(page.cover);
    const isDb = page.type === 'database';
    return html`<div className=${'page font-' + (page.font || 'default') + (page.fullWidth || isDb ? ' full' : '')}>
      ${inTrash && html`<div className="trash-banner">Esta página está en la papelera.
        <button onClick=${() => A.restorePage(page.id)}>Restaurar</button>
        <button className="danger" onClick=${() => { if (confirm('¿Eliminar definitivamente esta página?')) A.deleteForever(page.id); }}>Eliminar definitivamente</button>
      </div>`}
      ${cover && html`<div className="cover" style=${cover}>
        <div className="cover-actions">
          <button onClick=${(e) => setCoverMenu(e.currentTarget)}>Cambiar portada</button>
          <button onClick=${() => A.updatePage(page.id, { cover: null })}>Quitar</button>
        </div>
      </div>`}
      <div className=${'page-inner' + (cover ? ' has-cover' : '')}>
        ${page.icon && html`<button className="page-icon" onClick=${(e) => setEmoji(e.currentTarget)}>${page.icon}</button>`}
        <div className="page-controls">
          ${!page.icon && html`<button onClick=${(e) => setEmoji(e.currentTarget)}>☺ Añadir icono</button>`}
          ${!cover && html`<button onClick=${() => A.updatePage(page.id, { cover: NC.COVERS[Math.floor(Math.random() * 8)] })}>🖼 Añadir portada</button>`}
        </div>
        <${Title} key=${'title-' + page.id} page=${page} />
        ${page.rowOf && html`<${NC.RowProps} row=${page} />`}
        ${isDb ? html`<${NC.DatabaseView} page=${page} />` : html`<${NC.Editor} key=${'editor-' + page.id} page=${page} />`}
      </div>
      ${emoji && html`<${NC.EmojiPicker} anchor=${emoji} onClose=${() => setEmoji(null)} onPick=${(e) => { A.updatePage(page.id, { icon: e }); setEmoji(null); }} />`}
      ${coverMenu && html`<${CoverPicker} page=${page} anchor=${coverMenu} onClose=${() => setCoverMenu(null)} />`}
    </div>`;
  }

  function CoverPicker({ page, anchor, onClose }) {
    const [url, setUrl] = useState('');
    const fileRef = useRef(null);
    const onFile = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { A.updatePage(page.id, { cover: r.result }); onClose(); };
      r.readAsDataURL(f);
    };
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu cover-picker" align="right">
      <div className="menu-label">Colores y degradados</div>
      <div className="cover-grid">
        ${NC.COVERS.map((c) => html`<button key=${c} style=${{ background: c }} onClick=${() => { A.updatePage(page.id, { cover: c }); onClose(); }}></button>`)}
      </div>
      <div className="menu-label">Imagen</div>
      <form className="row-form" onSubmit=${(e) => { e.preventDefault(); if (/^https?:\/\//.test(url)) { A.updatePage(page.id, { cover: url }); onClose(); } else NC.toast('URL no válida'); }}>
        <input className="menu-input" placeholder="https://…" value=${url} onInput=${(e) => setUrl(e.target.value)} />
        <button className="btn-primary" type="submit">OK</button>
      </form>
      <button className="menu-item" onClick=${() => fileRef.current.click()}><span>⬆</span> Subir imagen</button>
      <input type="file" accept="image/*" hidden ref=${fileRef} onChange=${onFile} />
    <//>`;
  }

  /* ---------- Vista previa de fila (row-peek de AppFlowy) ---------- */
  function Peek({ id }) {
    const close = () => A.setUI({ peek: null });
    return html`<${NC.Modal} onClose=${close} className="peek">
      <div className="peek-bar">
        <button className="icon-btn" title="Abrir como página completa" onClick=${() => NC.navigate(id)}>⤢ Abrir como página</button>
        <span className="grow"></span>
        <button className="icon-btn" title="Eliminar" onClick=${() => { A.trashPage(id); close(); }}>🗑</button>
        <button className="icon-btn" title="Cerrar (Esc)" onClick=${close}>✕</button>
      </div>
      <div className="peek-body"><${PageView} pageId=${id} peek=${true} /></div>
    <//>`;
  }

  /* ---------- Búsqueda ---------- */
  function Search() {
    const s = NC.useStore();
    const [q, setQ] = useState('');
    const [idx, setIdx] = useState(0);
    const close = () => A.setUI({ search: false });
    const nq = q.trim().toLowerCase();
    const results = Object.values(s.pages)
      .filter((p) => !A.isInTrash(p.id))
      .map((p) => {
        if (!nq) return { p, snippet: '' };
        if (pageTitle(p).toLowerCase().includes(nq)) return { p, snippet: '' };
        const b = (p.blocks || []).find((b) => NC.htmlToText(b.html || b.text || '').toLowerCase().includes(nq));
        return b ? { p, snippet: NC.htmlToText(b.html || b.text) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.p.updatedAt - a.p.updatedAt)
      .slice(0, 30);
    const open = (r) => { close(); NC.navigate(r.p.id); };
    const pathOf = (p) => {
      const parts = [];
      let cur = s.pages[p.rowOf || p.parentId];
      while (cur) { parts.unshift(pageTitle(cur)); cur = s.pages[cur.rowOf || cur.parentId]; }
      return parts.join(' / ');
    };
    return html`<${NC.Modal} onClose=${close} className="search-modal">
      <input className="search-input" autoFocus placeholder=${'Buscar en ' + APP_NAME + '…'} value=${q}
        onInput=${(e) => { setQ(e.target.value); setIdx(0); }}
        onKeyDown=${(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((idx + 1) % Math.max(1, results.length)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((idx - 1 + results.length) % Math.max(1, results.length)); }
          if (e.key === 'Enter' && results[idx]) open(results[idx]);
        }} />
      <div className="search-results">
        <div className="menu-label">${nq ? 'Resultados' : 'Recientes'}</div>
        ${results.map((r, i) => html`<div key=${r.p.id} className=${'search-item' + (i === idx ? ' active' : '')} onMouseEnter=${() => setIdx(i)} onClick=${() => open(r)}>
          <span className="tree-icon">${pageIcon(r.p)}</span>
          <div className="grow">
            <div>${pageTitle(r.p)} <span className="muted small">${pathOf(r.p)}</span></div>
            ${r.snippet && html`<div className="muted small snippet">${r.snippet}</div>`}
          </div>
          <span className="muted small">${NC.timeAgo(r.p.updatedAt)}</span>
        </div>`)}
        ${!results.length && html`<div className="muted pad">Sin resultados</div>`}
      </div>
    <//>`;
  }

  /* ---------- Papelera ---------- */
  function Trash() {
    const s = NC.useStore();
    const close = () => A.setUI({ trash: false });
    const items = Object.values(s.pages)
      .filter((p) => p.trashed && !(s.pages[p.rowOf || p.parentId] && A.isInTrash(p.rowOf || p.parentId)))
      .sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0));
    return html`<${NC.Modal} onClose=${close} className="trash-modal">
      <div className="modal-head"><h3>🗑 Papelera</h3><span className="grow"></span>
        ${items.length > 0 && html`<button className="btn-ghost danger" onClick=${() => confirm('¿Vaciar la papelera? Esta acción no se puede deshacer.') && A.emptyTrash()}>Vaciar papelera</button>`}
        <button className="icon-btn" onClick=${close}>✕</button>
      </div>
      ${!items.length && html`<div className="muted pad">La papelera está vacía.</div>`}
      ${items.map((p) => html`<div key=${p.id} className="trash-item">
        <span className="tree-icon">${pageIcon(p)}</span>
        <span className="grow link" onClick=${() => { close(); NC.navigate(p.id); }}>${pageTitle(p)}</span>
        <span className="muted small">${NC.timeAgo(p.trashedAt || p.updatedAt)}</span>
        <button className="icon-btn" title="Restaurar" onClick=${() => A.restorePage(p.id)}>↩</button>
        <button className="icon-btn" title="Eliminar definitivamente" onClick=${() => confirm('¿Eliminar definitivamente?') && A.deleteForever(p.id)}>🗑</button>
      </div>`)}
    <//>`;
  }

  /* ---------- Cuenta y sincronización ---------- */
  const SYNC_LABELS = {
    off: 'Sincronización no configurada', signedout: 'Sin iniciar sesión', connecting: 'Conectando…',
    syncing: 'Sincronizando…', synced: 'Sincronizado', offline: 'Sin conexión · se sincronizará al volver', error: 'Error de sincronización',
  };

  function GoogleButton() {
    return html`<button className="google-btn" onClick=${() => NC.sync.signIn()}>
      <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
      Iniciar sesión con Google
    </button>`;
  }

  function AccountBox() {
    const st = NC.useSync ? NC.useSync() : null;
    const [menu, setMenu] = useState(null);
    if (!st || st.state === 'off') return null;
    if (!st.user) return html`<div className="account-box"><${GoogleButton} /></div>`;
    return html`<div>
      <button className="side-link account" onClick=${(e) => setMenu(e.currentTarget)} title=${SYNC_LABELS[st.state] + (st.error ? ': ' + st.error : '')}>
        ${st.user.photo ? html`<img className="avatar" src=${st.user.photo} alt="" referrerPolicy="no-referrer" />` : html`<span className="avatar">${(st.user.email || '?')[0]}</span>`}
        <span className="account-email">${st.user.email}</span>
        <span className=${'sync-dot s-' + st.state}></span>
      </button>
      ${menu && html`<${NC.Popover} anchor=${menu} onClose=${() => setMenu(null)} className="menu">
        <div className="menu-label">${SYNC_LABELS[st.state]}${st.error ? ' · ' + st.error : ''}</div>
        <button className="menu-item" onClick=${() => { setMenu(null); NC.sync.pushNow(); }}><span>⟳</span> Sincronizar ahora</button>
        <button className="menu-item danger" onClick=${() => { setMenu(null); NC.sync.signOut(); }}><span>⎋</span> Cerrar sesión</button>
      <//>`}
    </div>`;
  }

  function SyncSettings() {
    const st = NC.useSync ? NC.useSync() : { state: 'off' };
    return html`<div className="setting">
      <div>
        <b>Cuenta y sincronización</b>
        <div className="muted small">
          ${st.state === 'off'
            ? 'Configura Firebase en js/config.js para sincronizar entre la web y el Mac.'
            : st.user ? html`${st.user.email} · ${SYNC_LABELS[st.state]}${st.lastSync ? ' · ' + NC.timeAgo(st.lastSync) : ''}${st.error ? html`<br />${st.error}` : ''}` : 'Inicia sesión con Google para sincronizar tus notas.'}
        </div>
      </div>
      ${st.state !== 'off' && (st.user
        ? html`<button className="btn-ghost" onClick=${() => NC.sync.signOut()}>Cerrar sesión</button>`
        : html`<${GoogleButton} />`)}
    </div>`;
  }

  /* ---------- Ajustes ---------- */
  function Settings() {
    const s = NC.useStore();
    const close = () => A.setUI({ settings: false });
    const fileRef = useRef(null);
    const importJson = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      f.text().then((t) => {
        try {
          const data = JSON.parse(t);
          if (!data.pages || !data.rootIds) throw new Error('formato');
          if (confirm('Esto reemplazará todo tu espacio de trabajo actual. ¿Continuar?')) { A.replaceWorkspace(data); close(); NC.toast('Copia importada'); }
        } catch (err) { NC.toast('Archivo no válido'); }
      });
    };
    const bytes = new Blob([localStorage.getItem('notioncito:v1') || '']).size;
    return html`<${NC.Modal} onClose=${close} className="settings-modal">
      <div className="modal-head"><h3>⚙️ Ajustes</h3><span className="grow"></span><button className="icon-btn" onClick=${close}>✕</button></div>
      <div className="setting">
        <div><b>Apariencia</b><div className="muted small">Tema de la interfaz</div></div>
        <select value=${s.settings.theme} onChange=${(e) => A.setSettings({ theme: e.target.value })}>
          <option value="system">Usar el del sistema</option><option value="light">Claro</option><option value="dark">Oscuro</option>
        </select>
      </div>
      <div className="setting">
        <div><b>Copia de seguridad</b><div className="muted small">Exporta o importa todo el espacio en JSON · ${(bytes / 1024).toFixed(1)} KB usados</div></div>
        <div className="btn-row">
          <button className="btn-ghost" onClick=${() => NC.download('notioncito-backup-' + NC.todayISO() + '.json', A.exportWorkspace(), 'application/json')}>Exportar</button>
          <button className="btn-ghost" onClick=${() => fileRef.current.click()}>Importar</button>
        </div>
        <input type="file" accept="application/json,.json" hidden ref=${fileRef} onChange=${importJson} />
      </div>
      <div className="setting">
        <div><b>Restablecer</b><div className="muted small">Borra todo y vuelve a las páginas de ejemplo</div></div>
        <button className="btn-ghost danger" onClick=${() => confirm('¿Borrar todo el contenido y restablecer?') && (A.resetWorkspace(), close())}>Restablecer</button>
      </div>
      <${SyncSettings} />
      ${!(NC.sync && NC.sync.isDesktop) && html`<div className="setting">
        <div><b>App para Mac</b><div className="muted small">Instalador .dmg de ${APP_NAME} para macOS 13 o superior</div></div>
        <a className="btn-ghost" href=${(window.NOTAS_CONFIG || {}).macDownloadUrl || 'dist/Notas-de-L.dmg'} download>Descargar</a>
      </div>`}
      <div className="muted small pad">${APP_NAME} · Inspirado en AppFlowy · Tus notas se guardan en este dispositivo${NC.sync && NC.sync.enabled ? ' y, si inicias sesión, en tu cuenta' : ''}.</div>
    <//>`;
  }

  /* ---------- App ---------- */
  function App() {
    const s = NC.useStore();
    const cur = s.ui.current && s.pages[s.ui.current];

    useEffect(() => {
      const apply = () => {
        const t = s.settings.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : s.settings.theme;
        document.documentElement.dataset.theme = t;
      };
      apply();
      const mq = matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }, [s.settings.theme]);

    useEffect(() => {
      const key = (e) => {
        const mod = e.metaKey || e.ctrlKey;
        if (mod && (e.key === 'k' || e.key === 'p')) { e.preventDefault(); A.setUI({ search: !NC.getState().ui.search }); }
        if (mod && e.key === '\\') { e.preventDefault(); A.setSettings({ sidebarCollapsed: !NC.getState().settings.sidebarCollapsed }); }
      };
      document.addEventListener('keydown', key);
      return () => document.removeEventListener('keydown', key);
    }, []);

    return html`<div className=${'app' + (s.settings.sidebarCollapsed ? ' collapsed' : '')}>
      ${!s.settings.sidebarCollapsed && html`<${Sidebar} />`}
      <main className="main">
        ${cur
          ? html`<${Topbar} page=${cur} /><div className="main-scroll"><${PageView} key=${cur.id} pageId=${cur.id} /></div>`
          : html`<div className="empty-state">
              ${s.settings.sidebarCollapsed && html`<button className="icon-btn" onClick=${() => A.setSettings({ sidebarCollapsed: false })}>☰</button>`}
              <div className="big">📄</div><p>No hay ninguna página abierta.</p>
              <button className="btn-primary" onClick=${() => NC.navigate(A.createPage())}>Crear una página</button>
            </div>`}
      </main>
      ${s.ui.peek && s.pages[s.ui.peek] && html`<${Peek} id=${s.ui.peek} />`}
      ${s.ui.search && html`<${Search} />`}
      ${s.ui.trash && html`<${Trash} />`}
      ${s.ui.settings && html`<${Settings} />`}
      <${NC.FormatToolbar} />
    </div>`;
  }

  NC.initRoute();
  ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
})();
