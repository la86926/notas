/* Notas de L — extras: pantalla de inicio de sesión, comentarios, enlaces inversos,
 * recordatorios y bandeja de entrada, plantillas y buscar/reemplazar. */
(function () {
  const NC = window.NC;
  const { html } = NC;
  const A = NC.actions;
  const { useState, useRef, useEffect } = React;
  const CFG = window.NOTAS_CONFIG || {};
  const APP = CFG.appName || 'Notas de L';

  /* ---------- Pantalla de inicio de sesión ---------- */
  const LOCAL_KEY = 'notioncito:localMode';
  NC.isLocalMode = () => { try { return localStorage.getItem(LOCAL_KEY) === '1'; } catch (e) { return false; } };
  NC.setLocalMode = (v) => { try { v ? localStorage.setItem(LOCAL_KEY, '1') : localStorage.removeItem(LOCAL_KEY); } catch (e) { /* */ } A.setUI({}); };

  NC.LoginScreen = function LoginScreen() {
    const st = NC.useSync();
    const busy = st.state === 'connecting' || st.state === 'starting';
    return html`<div className="login">
      <header className="login-top">
        <span className="login-brand"><img src="assets/icon.png" alt="" /> ${APP}</span>
      </header>
      <main className="login-main">
        <img className="login-logo" src="assets/icon.png" alt="" />
        <h1>Tus ideas, en orden.</h1>
        <p className="login-sub">Inicia sesión en tu cuenta de ${APP}</p>
        <button className="login-google" disabled=${busy} onClick=${() => NC.sync.signIn()}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
          ${st.state === 'starting' ? 'Cargando…' : busy ? 'Conectando…' : 'Continuar con Google'}
        </button>
        ${st.error && html`<div className="login-error">${st.error}</div>`}
        <div className="login-or"><span>o</span></div>
        <button className="login-local" onClick=${() => NC.setLocalMode(true)}>Usar sin cuenta en este dispositivo</button>
        <p className="login-legal">Solo la cuenta autorizada puede acceder a tus notas. Tus datos se cifran en tránsito y las reglas de seguridad de la base de datos bloquean cualquier otro acceso.</p>
      </main>
    </div>`;
  };

  /* ---------- Comentarios ---------- */
  const author = () => {
    const u = NC.sync && NC.sync.status && NC.sync.status.user;
    return u ? u.name || u.email : 'Yo';
  };

  function CommentList({ comments, onChange }) {
    const [text, setText] = useState('');
    const [showResolved, setShowResolved] = useState(false);
    const list = comments.filter((c) => showResolved || !c.resolved);
    const add = () => {
      const t = text.trim();
      if (!t) return;
      onChange([...comments, { id: NC.uid(), text: t, at: Date.now(), author: author(), resolved: false }]);
      setText('');
    };
    return html`<div className="comments">
      ${list.map((c) => html`<div key=${c.id} className=${'comment' + (c.resolved ? ' resolved' : '')}>
        <div className="comment-head">
          <span className="avatar">${(c.author || 'Y')[0]}</span>
          <b>${c.author || 'Yo'}</b>
          <span className="muted small">${NC.timeAgo(c.at)}</span>
          <span className="grow"></span>
          <button className="mini" title=${c.resolved ? 'Reabrir' : 'Resolver'} onClick=${() => onChange(comments.map((x) => (x.id === c.id ? { ...x, resolved: !x.resolved } : x)))}>${c.resolved ? '↺' : '✓'}</button>
          <button className="mini" title="Eliminar" onClick=${() => onChange(comments.filter((x) => x.id !== c.id))}>🗑</button>
        </div>
        ${c.quote && html`<div className="comment-quote">${c.quote}</div>`}
        <div className="comment-text">${c.text}</div>
      </div>`)}
      ${comments.some((c) => c.resolved) && html`<button className="btn-ghost small" onClick=${() => setShowResolved(!showResolved)}>${showResolved ? 'Ocultar resueltos' : 'Ver resueltos'}</button>`}
      <div className="comment-new">
        <span className="avatar">${author()[0]}</span>
        <textarea rows="1" placeholder="Añade un comentario…" value=${text}
          onInput=${(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
          onKeyDown=${(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add(); } }}></textarea>
        <button className="btn-primary small" disabled=${!text.trim()} onClick=${add}>↑</button>
      </div>
    </div>`;
  }

  NC.CommentThread = function CommentThread({ pageId, block, anchor, onClose, quote }) {
    NC.useStore();
    const pending = useRef(quote);
    const comments = block.comments || [];
    const onChange = (next) => {
      if (pending.current && next.length > comments.length) {
        next[next.length - 1].quote = pending.current;
        pending.current = null;
      }
      A.updateBlock(pageId, block.id, { comments: next });
    };
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu comment-pop" align="right">
      ${quote && html`<div className="comment-quote">${quote}</div>`}
      <${CommentList} comments=${comments} onChange=${onChange} />
    <//>`;
  };

  NC.openBlockComment = (blockId, quote, anchor) => A.setUI({ comment: { blockId, quote, anchor } });

  NC.PageComments = function PageComments({ page, open, setOpen }) {
    const comments = page.comments || [];
    if (!open && !comments.length) return null;
    return html`<div className="page-comments">
      <${CommentList} comments=${comments} onChange=${(next) => { A.updatePage(page.id, { comments: next }); if (!next.length) setOpen(false); }} />
    </div>`;
  };

  /* ---------- Enlaces inversos ---------- */
  NC.backlinksOf = (s, id) =>
    Object.values(s.pages).filter((p) => p.id !== id && !p.isTemplate && !A.isInTrash(p.id) && NC.allBlocks(p).some((b) =>
      (b.type === 'page' && b.pageId === id) || (b.html && b.html.includes(`data-page="${id}"`))));

  NC.Backlinks = function Backlinks({ page }) {
    const s = NC.useStore();
    const [open, setOpen] = useState(false);
    const links = NC.backlinksOf(s, page.id);
    if (!links.length) return null;
    return html`<div className="backlinks">
      <button className="btn-ghost small" onClick=${() => setOpen(!open)}>↙ ${links.length} ${links.length === 1 ? 'enlace inverso' : 'enlaces inversos'}</button>
      ${open && html`<div className="backlink-list">${links.map((p) => html`<a key=${p.id} onClick=${() => NC.navigate(p.id)}>${p.icon || '📄'} ${p.title || 'Sin título'}</a>`)}</div>`}
    </div>`;
  };

  /* ---------- Recordatorios y bandeja de entrada ---------- */
  const SEEN_KEY = 'notioncito:reminded';
  const seen = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY)) || []); } catch (e) { return new Set(); } };
  NC.allReminders = () => {
    const s = NC.getState();
    const out = [];
    Object.values(s.pages).forEach((p) => {
      if (p.isTemplate || A.isInTrash(p.id)) return;
      NC.allBlocks(p).forEach((b) => {
        if (!b.html || !b.html.includes('data-remind')) return;
        const tpl = document.createElement('template');
        tpl.innerHTML = b.html;
        tpl.content.querySelectorAll('.mention[data-remind="1"][data-date]').forEach((m) => {
          const date = m.getAttribute('data-date');
          const due = new Date(date + 'T09:00:00').getTime();
          out.push({ key: `${p.id}:${b.id}:${date}`, page: p, block: b, date, due, text: tpl.content.textContent.trim() });
        });
      });
    });
    return out.sort((a, b) => a.due - b.due);
  };
  NC.dueReminders = () => {
    const sn = seen();
    return NC.allReminders().filter((r) => r.due <= Date.now() && !sn.has(r.key));
  };
  NC.markRemindersSeen = (keys) => {
    const sn = seen();
    keys.forEach((k) => sn.add(k));
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...sn].slice(-500))); } catch (e) { /* */ }
    A.setUI({});
  };
  const notified = new Set();
  const checkReminders = () => {
    NC.dueReminders().forEach((r) => {
      if (notified.has(r.key)) return;
      notified.add(r.key);
      NC.toast(`⏰ ${r.page.title || 'Sin título'}: ${r.text.slice(0, 80)}`);
      if (window.Notification && Notification.permission === 'granted') new Notification(APP, { body: `${r.page.title || 'Sin título'}: ${r.text.slice(0, 120)}` });
    });
    A.setUI({});
  };
  setTimeout(checkReminders, 2500);
  setInterval(checkReminders, 60e3);

  NC.Inbox = function Inbox() {
    NC.useStore();
    const close = () => A.setUI({ inbox: false });
    const all = NC.allReminders();
    const sn = seen();
    const now = Date.now();
    const due = all.filter((r) => r.due <= now);
    const upcoming = all.filter((r) => r.due > now);
    const open = (r) => { close(); NC.navigate(r.page.id + '?b=' + r.block.id); };
    const item = (r) => html`<div key=${r.key} className=${'inbox-item' + (r.due <= now && !sn.has(r.key) ? ' unread' : '')} onClick=${() => open(r)}>
      <span className="tree-icon">${r.page.icon || '📄'}</span>
      <div className="grow"><div><b>${r.page.title || 'Sin título'}</b></div><div className="muted small snippet">${r.text}</div></div>
      <span className="muted small">⏰ ${NC.formatDate(r.date)}</span>
    </div>`;
    useEffect(() => () => NC.markRemindersSeen(due.map((r) => r.key)), []);
    return html`<${NC.Modal} onClose=${close} className="inbox-modal">
      <div className="modal-head"><h3>📥 Bandeja de entrada</h3><span className="grow"></span>
        ${window.Notification && Notification.permission === 'default' && !NC.sync.isDesktop && html`<button className="btn-ghost small" onClick=${() => Notification.requestPermission()}>Activar notificaciones</button>`}
        <button className="icon-btn" onClick=${close}>✕</button></div>
      ${!all.length && html`<div className="muted pad">Sin recordatorios. Escribe <b>@</b> en una página y elige «Recordarme…».</div>`}
      ${due.length > 0 && html`<div className="menu-label pad-x">Pendientes</div>${due.slice().reverse().map(item)}`}
      ${upcoming.length > 0 && html`<div className="menu-label pad-x">Próximos</div>${upcoming.map(item)}`}
    <//>`;
  };

  /* ---------- Plantillas ---------- */
  const T = (name, icon, desc, md) => ({ id: 'tpl-' + name, name, icon, desc, md });
  NC.BUILTIN_TEMPLATES = [
    T('Notas de reunión', '🗓️', 'Asistentes, agenda, notas y acciones.', `## Detalles\n- **Fecha:** {{fecha}}\n- **Asistentes:** \n## Agenda\n1. \n## Notas\n- \n## Acciones\n- [ ] \n`),
    T('Diario', '📔', 'Gratitud, objetivos del día y reflexión.', `## {{fecha}}\n### Agradezco\n- \n### Hoy quiero lograr\n- [ ] \n- [ ] \n### Reflexión\n`),
    T('Plan semanal', '📅', 'Prioridades y tareas por día.', `## Prioridades de la semana\n1. \n2. \n3. \n## Lunes\n- [ ] \n## Martes\n- [ ] \n## Miércoles\n- [ ] \n## Jueves\n- [ ] \n## Viernes\n- [ ] \n`),
    T('Documento de proyecto', '🚀', 'Contexto, objetivos, alcance e hitos.', `## Resumen\n> Una frase que explique el proyecto.\n## Problema\n\n## Objetivos\n- \n## Fuera de alcance\n- \n## Hitos\n- [ ] \n## Riesgos\n- \n`),
    T('Apuntes de clase', '🎓', 'Tema, ideas clave, dudas y resumen.', `## Tema\n\n## Ideas clave\n- \n## Dudas\n- [ ] \n## Resumen\n\n`),
    T('Lista de lectura', '📚', 'Libros por leer y leídos.', `## Leyendo\n- [ ] \n## Por leer\n- [ ] \n## Leídos\n- [x] \n`),
  ];

  NC.applyTemplate = (pageId, tpl) => {
    const s = NC.getState();
    const page = s.pages[pageId];
    const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    let blocks;
    if (tpl.pageId && s.pages[tpl.pageId]) {
      const src = s.pages[tpl.pageId];
      blocks = src.blocks.map(NC.cloneBlock);
      A.updatePage(pageId, { icon: page.icon || src.icon, cover: page.cover || src.cover, title: page.title || (src.title || '').replace(/^Plantilla:\s*/, '') });
    } else {
      blocks = NC.markdownToBlocks(tpl.md.replace(/\{\{fecha\}\}/g, today));
      A.updatePage(pageId, { icon: page.icon || tpl.icon, title: page.title || tpl.name });
    }
    page.blocks = blocks.length ? blocks : [NC.newBlock('paragraph')];
    A.updatePage(pageId, {});
  };

  NC.saveAsTemplate = (pageId) => {
    const id = A.duplicatePage(pageId);
    const s = NC.getState();
    const p = s.pages[id];
    p.isTemplate = true;
    p.title = 'Plantilla: ' + (s.pages[pageId].title || 'Sin título');
    // fuera del árbol
    const list = p.parentId ? s.pages[p.parentId].children : s.rootIds;
    list.splice(list.indexOf(id), 1);
    p.parentId = null;
    A.updatePage(id, {});
    NC.toast('Guardada como plantilla');
  };

  NC.TemplatePicker = function TemplatePicker({ pageId, onClose }) {
    const s = NC.useStore();
    const mine = Object.values(s.pages).filter((p) => p.isTemplate && !p.trashed);
    const pick = (t) => { NC.applyTemplate(pageId, t); onClose(); };
    return html`<${NC.Modal} onClose=${onClose} className="template-modal">
      <div className="modal-head"><h3>📋 Plantillas</h3><span className="grow"></span><button className="icon-btn" onClick=${onClose}>✕</button></div>
      <div className="tpl-grid">
        ${NC.BUILTIN_TEMPLATES.map((t) => html`<button key=${t.id} className="tpl-card" onClick=${() => pick(t)}>
          <span className="tpl-icon">${t.icon}</span><b>${t.name}</b><span className="muted small">${t.desc}</span></button>`)}
      </div>
      <div className="menu-label pad-x">Mis plantillas</div>
      ${!mine.length && html`<div className="muted pad">Usa «Guardar como plantilla» en el menú ··· de cualquier página.</div>`}
      <div className="tpl-grid">
        ${mine.map((p) => html`<div key=${p.id} className="tpl-card" onClick=${() => pick({ pageId: p.id })}>
          <span className="tpl-icon">${p.icon || '📄'}</span><b>${(p.title || '').replace(/^Plantilla:\s*/, '')}</b>
          <span className="tpl-actions">
            <button className="mini" title="Editar plantilla" onClick=${(e) => { e.stopPropagation(); onClose(); NC.navigate(p.id); }}>✎</button>
            <button className="mini" title="Eliminar plantilla" onClick=${(e) => { e.stopPropagation(); A.deleteForever(p.id); }}>🗑</button>
          </span></div>`)}
      </div>
    <//>`;
  };

  // Elección inicial en una página vacía (como "Empezar con…" de Notion)
  NC.EmptyPageStarter = function EmptyPageStarter({ page }) {
    const [tpl, setTpl] = useState(false);
    const empty = page.type === 'doc' && !page.rowOf && !page.isTemplate && page.blocks.length === 1 && page.blocks[0].type === 'paragraph' && !page.blocks[0].html && !page.children.length;
    if (!empty) return null;
    const toDb = (layout) => {
      const id = A.createPage({ parentId: page.parentId, type: 'database', layout, title: page.title, icon: page.icon });
      const s = NC.getState();
      const list = page.parentId ? s.pages[page.parentId].children : s.rootIds;
      list.splice(list.indexOf(id), 1);
      list.splice(list.indexOf(page.id), 0, id);
      A.deleteForever(page.id);
      NC.navigate(id);
    };
    return html`<div className="starter">
      <div className="muted small">Pulsa Enter para seguir con una página vacía, o empieza con…</div>
      <div className="starter-row">
        <button onClick=${() => setTpl(true)}>📋 Plantillas</button>
        <button onClick=${() => toDb('table')}>▦ Tabla</button>
        <button onClick=${() => toDb('board')}>▥ Tablero</button>
        <button onClick=${() => toDb('calendar')}>📅 Calendario</button>
        <button onClick=${() => toDb('gallery')}>▤ Galería</button>
        <button onClick=${() => NC.applyTemplate(page.id, NC.BUILTIN_TEMPLATES[0])}>🗓️ Notas de reunión</button>
      </div>
      ${tpl && html`<${NC.TemplatePicker} pageId=${page.id} onClose=${() => setTpl(false)} />`}
    </div>`;
  };

  /* ---------- Buscar y reemplazar en la página (⌘F) ---------- */
  NC.FindBar = function FindBar({ pageId, onClose }) {
    const [q, setQ] = useState('');
    const [rep, setRep] = useState('');
    const [idx, setIdx] = useState(0);
    const [count, setCount] = useState(0);
    const [showRep, setShowRep] = useState(false);
    const ranges = useRef([]);
    const root = () => document.querySelector('.main .editor');

    const compute = () => {
      const r = root();
      ranges.current = [];
      if (CSS.highlights) { CSS.highlights.delete('find'); CSS.highlights.delete('find-current'); }
      if (!r || !q) return setCount(0);
      const needle = q.toLowerCase();
      const walker = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (!n.parentElement.closest('.rt, .code-text, .tcell')) continue;
        const t = n.textContent.toLowerCase();
        let i = t.indexOf(needle);
        while (i >= 0) {
          const range = document.createRange();
          range.setStart(n, i);
          range.setEnd(n, i + q.length);
          ranges.current.push(range);
          i = t.indexOf(needle, i + q.length);
        }
      }
      setCount(ranges.current.length);
      if (CSS.highlights && ranges.current.length) CSS.highlights.set('find', new Highlight(...ranges.current));
    };
    useEffect(() => { compute(); setIdx(0); }, [q]);
    useEffect(() => NC.subscribe(() => setTimeout(compute, 0)), [q]);
    useEffect(() => {
      const cur = ranges.current[idx];
      if (!cur) return;
      if (CSS.highlights) CSS.highlights.set('find-current', new Highlight(cur));
      const el = cur.startContainer.parentElement;
      el && el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [idx, count]);
    useEffect(() => () => { if (CSS.highlights) { CSS.highlights.delete('find'); CSS.highlights.delete('find-current'); } }, []);

    const replaceIn = (all) => {
      const page = NC.getState().pages[pageId];
      if (!page || !q) return;
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      let done = 0;
      const target = ranges.current[idx];
      const targetRow = target && target.startContainer.parentElement.closest('[data-block-row]');
      const targetId = targetRow && targetRow.getAttribute('data-block-row');
      NC.walkBlocks(page.blocks, (b) => {
        if (!all && (b.id !== targetId || done)) return;
        if (b.type === 'code') {
          if (re.test(b.text || '')) { b.text = all ? b.text.replace(re, rep) : b.text.replace(new RegExp(re.source, 'i'), rep); done++; }
          return;
        }
        if (!b.html) return;
        const tpl = document.createElement('template');
        tpl.innerHTML = b.html;
        const w = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) {
          if (n.parentElement && n.parentElement.closest('.mention')) continue;
          if (!re.test(n.textContent)) continue;
          if (all) { n.textContent = n.textContent.replace(re, rep); done++; }
          else if (!done) { n.textContent = n.textContent.replace(new RegExp(re.source, 'i'), rep); done++; }
        }
        const div = document.createElement('div');
        div.appendChild(tpl.content);
        b.html = div.innerHTML;
      });
      A.updatePage(pageId, {});
      NC.toast(done ? `${all ? 'Reemplazadas' : 'Reemplazada'} ${all ? done + ' coincidencias' : '1 coincidencia'}` : 'Sin coincidencias');
    };

    return html`<div className="find-bar" onKeyDown=${(e) => { if (e.key === 'Escape') onClose(); }}>
      <div className="find-row">
        <input autoFocus placeholder="Buscar en la página" value=${q} onInput=${(e) => setQ(e.target.value)}
          onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); setIdx(count ? (idx + (e.shiftKey ? count - 1 : 1)) % count : 0); } }} />
        <span className="muted small">${count ? idx + 1 + '/' + count : '0/0'}</span>
        <button className="mini" onClick=${() => count && setIdx((idx + count - 1) % count)}>↑</button>
        <button className="mini" onClick=${() => count && setIdx((idx + 1) % count)}>↓</button>
        <button className="mini" title="Reemplazar" onClick=${() => setShowRep(!showRep)}>⇄</button>
        <button className="mini" onClick=${onClose}>✕</button>
      </div>
      ${showRep && html`<div className="find-row">
        <input placeholder="Reemplazar por" value=${rep} onInput=${(e) => setRep(e.target.value)} />
        <button className="btn-ghost small" onClick=${() => replaceIn(false)}>Reemplazar</button>
        <button className="btn-ghost small" onClick=${() => replaceIn(true)}>Todo</button>
      </div>`}
    </div>`;
  };
})();
