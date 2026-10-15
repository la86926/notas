/* Notas de L — bloques especiales: tabla simple, índice, ruta, ecuación, marcador web,
 * embed (YouTube, Vimeo, Spotify, Figma, Google Docs, Loom, CodePen), archivo y botón. */
(function () {
  const NC = window.NC;
  const { html } = NC;
  const A = NC.actions;
  const { useState, useRef, useLayoutEffect, useEffect } = React;
  const R = (NC.BLOCKS = NC.BLOCKS || {});

  /* ---------- Tabla simple ---------- */
  function Cell({ value, onChange, onKey, readOnly, header }) {
    const ref = useRef(null);
    useLayoutEffect(() => {
      if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value || '';
    });
    return html`<div ref=${ref} className=${'tcell' + (header ? ' th' : '')} contentEditable=${!readOnly} suppressContentEditableWarning
      onInput=${(e) => onChange(e.currentTarget.innerHTML)} onKeyDown=${onKey} />`;
  }

  R.table = function TableBlock({ b, ctx }) {
    const rows = b.rows && b.rows.length ? b.rows : [['']];
    const cols = Math.max(...rows.map((r) => r.length));
    const wrap = useRef(null);
    const save = (persist = true) => A.updateBlock(ctx.pageId, b.id, { rows: b.rows }, persist);
    const set = (i, j, v) => { b.rows[i][j] = NC.sanitize(v); save(); };
    const focusCell = (i, j) => setTimeout(() => {
      const el = wrap.current && wrap.current.querySelectorAll('tr')[i] && wrap.current.querySelectorAll('tr')[i].querySelectorAll('.tcell')[j];
      el && NC.setCaret(el, 'end');
    }, 0);
    const onKey = (i, j) => (e) => {
      e.stopPropagation();
      if (e.key === 'Tab') {
        e.preventDefault();
        let ni = i, nj = j + (e.shiftKey ? -1 : 1);
        if (nj >= cols) { nj = 0; ni++; }
        if (nj < 0) { nj = cols - 1; ni--; }
        if (ni >= rows.length) { addRow(); ni = rows.length; }
        if (ni >= 0) focusCell(ni, nj);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (i + 1 >= rows.length) addRow();
        focusCell(i + 1, j);
      } else if (e.key === 'ArrowUp' && NC.caretLines(e.currentTarget).first && i > 0) { e.preventDefault(); focusCell(i - 1, j); }
      else if (e.key === 'ArrowDown' && NC.caretLines(e.currentTarget).last && i < rows.length - 1) { e.preventDefault(); focusCell(i + 1, j); }
    };
    const addRow = () => { b.rows = rows.map((r) => [...r]); b.rows.push(Array(cols).fill('')); save(); };
    const addCol = () => { b.rows = rows.map((r) => [...r, '']); save(); };
    const delRow = () => { if (rows.length > 1) { b.rows = rows.slice(0, -1); save(); } };
    const delCol = () => { if (cols > 1) { b.rows = rows.map((r) => r.slice(0, -1)); save(); } };
    if (!b.rows) b.rows = rows;
    return html`<div className="simple-table" ref=${wrap}>
      <div className="st-scroll"><table><tbody>
        ${rows.map((r, i) => html`<tr key=${i}>${Array.from({ length: cols }, (_, j) => html`<td key=${j}>
          <${Cell} value=${r[j] || ''} header=${(b.header && i === 0) || (b.headerCol && j === 0)} readOnly=${ctx.readOnly}
            onChange=${(v) => set(i, j, v)} onKey=${onKey(i, j)} /></td>`)}</tr>`)}
      </tbody></table></div>
      ${!ctx.readOnly && html`<div className="st-tools">
        <button onClick=${addRow}>+ Fila</button><button onClick=${addCol}>+ Columna</button>
        <button onClick=${delRow}>− Fila</button><button onClick=${delCol}>− Columna</button>
        <label><input type="checkbox" checked=${!!b.header} onChange=${() => A.updateBlock(ctx.pageId, b.id, { header: !b.header })} /> Fila de encabezado</label>
        <label><input type="checkbox" checked=${!!b.headerCol} onChange=${() => A.updateBlock(ctx.pageId, b.id, { headerCol: !b.headerCol })} /> Columna de encabezado</label>
      </div>`}
    </div>`;
  };

  /* ---------- Índice ---------- */
  R.toc = function Toc({ ctx }) {
    const s = NC.useStore();
    const page = s.pages[ctx.pageId];
    const heads = NC.allBlocks(page).filter((x) => /^h[123]$/.test(x.type) && NC.htmlToText(x.html).trim());
    if (!heads.length) return html`<div className="muted toc-empty">Añade encabezados para crear un índice.</div>`;
    return html`<nav className="toc">${heads.map((h) => html`<a key=${h.id} className=${'toc-' + h.type}
      onClick=${() => { const el = document.querySelector(`[data-block-row="${h.id}"]`); el && el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>${NC.htmlToText(h.html)}</a>`)}</nav>`;
  };

  /* ---------- Ruta de navegación ---------- */
  R.breadcrumb = function Breadcrumb({ ctx }) {
    const s = NC.useStore();
    const chain = [];
    let p = s.pages[ctx.pageId];
    while (p) { chain.unshift(p); p = s.pages[p.rowOf || p.parentId]; }
    return html`<div className="breadcrumb-block">${chain.map((c, i) => html`<${React.Fragment} key=${c.id}>
      ${i > 0 && html`<span className="crumb-sep">/</span>`}
      <a onClick=${() => NC.navigate(c.id)}><${NC.Icon} icon=${c.icon} /> ${c.title || 'Sin título'}</a>
    <//>`)}</div>`;
  };

  /* ---------- Ecuación (KaTeX) ---------- */
  const renderTex = (tex) => {
    try { return window.katex ? katex.renderToString(tex, { displayMode: true, throwOnError: false, trust: false, strict: 'ignore' }) : NC.escapeHtml(tex); }
    catch (e) { return '<span class="muted">' + NC.escapeHtml(e.message) + '</span>'; }
  };
  R.equation = function Equation({ b, ctx }) {
    const [editing, setEditing] = useState(!b.text);
    const [val, setVal] = useState(b.text || '');
    const done = () => { A.updateBlock(ctx.pageId, b.id, { text: val }); if (val.trim()) setEditing(false); };
    if (editing && !ctx.readOnly) {
      return html`<div className="equation editing">
        <textarea autoFocus rows=${Math.max(2, val.split('\n').length)} placeholder="E = mc^2" value=${val}
          onInput=${(e) => setVal(e.target.value)}
          onKeyDown=${(e) => { e.stopPropagation(); if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey)) || e.key === 'Escape') { e.preventDefault(); done(); } }}
          onBlur=${done} />
        <div className="eq-preview" dangerouslySetInnerHTML=${{ __html: val.trim() ? renderTex(val) : '<span class="muted">Vista previa</span>' }}></div>
        <div className="muted small">LaTeX · ⌘Enter para terminar</div>
      </div>`;
    }
    return html`<div className="equation" onClick=${() => !ctx.readOnly && setEditing(true)} dangerouslySetInnerHTML=${{ __html: renderTex(b.text || '') }}></div>`;
  };

  /* ---------- Marcador web ---------- */
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
  function UrlForm({ placeholder, onSubmit }) {
    const [v, setV] = useState('');
    return html`<form className="url-form" onSubmit=${(e) => {
      e.preventDefault();
      const u = v.trim();
      if (!u) return;
      onSubmit(/^https?:\/\//.test(u) ? u : 'https://' + u);
    }}>
      <input placeholder=${placeholder} value=${v} onInput=${(e) => setV(e.target.value)} onKeyDown=${(e) => e.stopPropagation()} />
      <button className="btn-primary" type="submit">Insertar</button>
    </form>`;
  }
  R.bookmark = function Bookmark({ b, ctx }) {
    if (!b.url) return html`<div className="block-empty">🔖 Marcador web <${UrlForm} placeholder="Pega un enlace…" onSubmit=${(u) => A.updateBlock(ctx.pageId, b.id, { url: u })} /></div>`;
    const host = hostOf(b.url);
    return html`<a className="bookmark" href=${b.url} target="_blank" rel="noopener noreferrer">
      <div className="bm-text">
        <div className="bm-title">${b.title || host}</div>
        <div className="bm-url"><img src=${'https://www.google.com/s2/favicons?sz=32&domain=' + encodeURIComponent(host)} alt="" referrerPolicy="no-referrer" /> ${b.url}</div>
      </div>
      ${!ctx.readOnly && html`<button className="bm-edit" title="Editar título" onClick=${(e) => { e.preventDefault(); const t = prompt('Título del marcador', b.title || host); if (t !== null) A.updateBlock(ctx.pageId, b.id, { title: t }); }}>✎</button>`}
    </a>`;
  };

  /* ---------- Embed ---------- */
  NC.embedSrc = (url) => {
    let m;
    try {
      const u = new URL(url);
      const h = u.hostname.replace(/^www\./, '');
      if (h === 'youtu.be') return { src: 'https://www.youtube-nocookie.com/embed/' + u.pathname.slice(1), ratio: 56.25 };
      if (h.endsWith('youtube.com')) {
        const id = u.searchParams.get('v') || ((m = u.pathname.match(/\/(embed|shorts|live)\/([\w-]+)/)) && m[2]);
        if (id) return { src: 'https://www.youtube-nocookie.com/embed/' + id, ratio: 56.25 };
      }
      if (h === 'vimeo.com' && (m = u.pathname.match(/\/(\d+)/))) return { src: 'https://player.vimeo.com/video/' + m[1], ratio: 56.25 };
      if (h === 'open.spotify.com' && (m = u.pathname.match(/\/(track|album|playlist|episode|show|artist)\/(\w+)/))) return { src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, height: m[1] === 'track' ? 152 : 380 };
      if (h.endsWith('figma.com')) return { src: 'https://www.figma.com/embed?embed_host=share&url=' + encodeURIComponent(url), height: 450 };
      if (h === 'loom.com' && (m = u.pathname.match(/\/share\/(\w+)/))) return { src: 'https://www.loom.com/embed/' + m[1], ratio: 56.25 };
      if (h === 'codepen.io' && (m = u.pathname.match(/^\/([\w-]+)\/pen\/(\w+)/))) return { src: `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result`, height: 400 };
      if (h === 'docs.google.com' && (m = u.pathname.match(/^\/(document|spreadsheets|presentation|forms)\/d\/([\w-]+)/)))
        return { src: `https://docs.google.com/${m[1]}/d/${m[2]}/${m[1] === 'forms' ? 'viewform?embedded=true' : 'preview'}`, height: 480 };
      if (h === 'google.com' && u.pathname.startsWith('/maps/embed')) return { src: url, height: 400 };
      if (h === 'calendar.google.com' && u.pathname.startsWith('/calendar/embed')) return { src: url, height: 500 };
    } catch (e) { /* URL no válida */ }
    return null;
  };
  R.embed = function Embed({ b, ctx }) {
    if (!b.url) return html`<div className="block-empty">▶ Insertar contenido <${UrlForm} placeholder="Enlace de YouTube, Vimeo, Spotify, Figma, Google Docs…" onSubmit=${(u) => A.updateBlock(ctx.pageId, b.id, { url: u })} /></div>`;
    const e = NC.embedSrc(b.url);
    if (!e) return html`<div><${R.bookmark} b=${b} ctx=${ctx} /><div className="muted small">Este sitio no permite insertarse; se muestra como marcador.</div></div>`;
    return html`<div className="embed" style=${e.ratio ? { paddingTop: e.ratio + '%' } : { height: e.height }}>
      <iframe src=${e.src} title="Contenido insertado" loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-forms"
        allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen></iframe>
      ${!ctx.readOnly && html`<button className="embed-change" onClick=${() => A.updateBlock(ctx.pageId, b.id, { url: '' })}>Cambiar</button>`}
    </div>`;
  };

  /* ---------- Archivo ---------- */
  const fmtSize = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
  R.file = function FileBlock({ b, ctx }) {
    const ref = useRef(null);
    const href = NC.useAsset(b.url);
    const pick = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 3e6) return NC.toast('El archivo es demasiado grande (máx. 3 MB)');
      const save = (data) => NC.assets.put(data).then((u) => A.updateBlock(ctx.pageId, b.id, { url: u, name: f.name, size: f.size }));
      if (/^image\/(png|jpe?g|webp)$/.test(f.type)) NC.compressImage(f).then(save);
      else {
        if (f.size > 700e3) NC.toast('Archivo grande: se guardará en este dispositivo pero no se sincronizará');
        const r = new FileReader();
        r.onload = () => save(r.result);
        r.readAsDataURL(f);
      }
    };
    if (!b.url) return html`<div className="block-empty">📎 Archivo
      <button className="btn-primary" onClick=${() => ref.current.click()}>Elegir archivo</button>
      <input type="file" hidden ref=${ref} onChange=${pick} /></div>`;
    return html`<div className="file-block">
      <span className="file-icon">📎</span>
      ${href ? html`<a href=${href} download=${b.name || 'archivo'}>${b.name || 'archivo'}</a>` : html`<span className="muted">${b.name || 'archivo'} (cargando…)</span>`}
      <span className="muted small">${b.size ? fmtSize(b.size) : ''}</span>
    </div>`;
  };

  /* ---------- Botón ---------- */
  R.button = function ButtonBlock({ b, ctx }) {
    const [cfg, setCfg] = useState(null);
    const s = NC.getState();
    const dbs = Object.values(s.pages).filter((p) => p.type === 'database' && !A.isInTrash(p.id));
    const run = () => {
      if (b.action === 'row' && s.pages[b.dbId]) {
        const id = A.addRow(b.dbId, {}, null, b.rowTitle || '');
        return A.setUI({ peek: id });
      }
      const today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
      const blocks = NC.markdownToBlocks((b.template || '').replace(/\{\{fecha\}\}/g, today));
      if (!blocks.length) return NC.toast('Configura qué inserta este botón (⚙)');
      blocks.forEach((x) => (x.indent += b.indent));
      const r = NC.locateBlock(ctx.pageId, b.id);
      const last = r ? r.arr[NC.subtreeRange(r.arr, r.index)[1] - 1] : b;
      A.insertBlocks(ctx.pageId, last.id, blocks);
    };
    return html`<div className="button-block">
      <button className="nb-button" onClick=${run}>${b.label || 'Botón'}</button>
      ${!ctx.readOnly && html`<button className="mini" title="Configurar" onClick=${(e) => setCfg(e.currentTarget)}>⚙</button>`}
      ${cfg && html`<${NC.Popover} anchor=${cfg} onClose=${() => setCfg(null)} className="menu button-cfg">
        <div className="menu-label">Texto del botón</div>
        <input className="menu-input" defaultValue=${b.label} onInput=${(e) => A.updateBlock(ctx.pageId, b.id, { label: e.target.value })} />
        <div className="menu-label">Al hacer clic</div>
        <select className="menu-input" value=${b.action || 'insert'} onChange=${(e) => A.updateBlock(ctx.pageId, b.id, { action: e.target.value })}>
          <option value="insert">Insertar bloques debajo</option>
          <option value="row">Añadir una fila a una base de datos</option>
        </select>
        ${(b.action || 'insert') === 'insert'
          ? html`<div className="menu-label">Contenido (Markdown, {{fecha}} = hoy)</div>
              <textarea className="menu-input" rows="5" defaultValue=${b.template || ''} onInput=${(e) => A.updateBlock(ctx.pageId, b.id, { template: e.target.value })}></textarea>`
          : html`<div className="menu-label">Base de datos</div>
              <select className="menu-input" value=${b.dbId || ''} onChange=${(e) => A.updateBlock(ctx.pageId, b.id, { dbId: e.target.value })}>
                <option value="">Elige…</option>
                ${dbs.map((d) => html`<option key=${d.id} value=${d.id}>${NC.iconText(d.icon, '🗃️')} ${d.title || 'Sin título'}</option>`)}
              </select>
              <div className="menu-label">Título de la nueva fila</div>
              <input className="menu-input" defaultValue=${b.rowTitle || ''} onInput=${(e) => A.updateBlock(ctx.pageId, b.id, { rowTitle: e.target.value })} />`}
      <//>`}
    </div>`;
  };
})();
