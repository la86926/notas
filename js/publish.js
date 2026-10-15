/* Notas de L — publicar páginas en la web (como «Publicar» de Notion).
 * Una publicación es una copia de solo lectura en Firestore: public/{raíz} (metadatos) y
 * public/{raíz}/pages/{id} (cada página), con sus imágenes copiadas a publicAssets/{id}.
 * Las reglas permiten leerlas a cualquiera y escribirlas solo a la cuenta propietaria.
 * Mientras la página siga publicada, los cambios se vuelven a publicar solos. */
(function () {
  const NC = window.NC;
  const { html } = NC;
  const A = NC.actions;
  const { useState } = React;
  const CFG = window.NOTAS_CONFIG || {};
  const BASE = CFG.publicUrl || 'https://la86926.github.io/notas/';

  const fs = () => NC.sync && NC.sync.firestore && NC.sync.firestore();
  const signedIn = () => NC.sync && NC.sync.user && NC.sync.user();
  NC.publicUrl = (rootId, pageId) => BASE + '#/p/' + rootId + (pageId && pageId !== rootId ? '/' + pageId : '');

  // Páginas que forman la publicación
  function collect(rootId, withChildren) {
    const s = NC.getState();
    const ids = new Set();
    const add = (id, deep) => {
      const p = s.pages[id];
      if (!p || p.trashed || ids.has(id)) return;
      ids.add(id);
      if (p.db) p.db.rows.forEach((r) => add(r, false));
      NC.allBlocks(p).forEach((b) => { if (b.type === 'dbview' && b.dbId) add(b.dbId, false); });
      if (deep) p.children.forEach((c) => add(c, true));
    };
    add(rootId, withChildren);
    return [...ids];
  }

  function assetRefs(pages) {
    const out = new Set();
    const take = (v) => typeof v === 'string' && v.startsWith('asset:') && out.add(v.slice(6));
    pages.forEach((p) => {
      take(p.cover); take(p.icon);
      NC.allBlocks(p).forEach((b) => { take(b.url); take(b.icon); });
      Object.values(p.values || {}).forEach((v) => Array.isArray(v) && v.forEach((f) => f && take(f.url)));
    });
    return [...out];
  }

  // Copia limpia de una página para publicar (sin comentarios ni datos privados)
  const clean = (p) => {
    const c = JSON.parse(JSON.stringify(p));
    delete c.comments;
    delete c.published;
    NC.walkBlocks(c.blocks, (b) => delete b.comments);
    return c;
  };

  async function publish(rootId, opts = {}) {
    const db = fs();
    if (!db || !signedIn()) throw new Error('Inicia sesión con Google para publicar');
    const s = NC.getState();
    const root = s.pages[rootId];
    const withChildren = opts.withChildren ?? (root.published && root.published.withChildren) ?? true;
    const ids = collect(rootId, withChildren);
    const pages = ids.map((id) => clean(s.pages[id]));
    // imágenes
    for (const aid of assetRefs(pages)) {
      const data = await NC.assets.get('asset:' + aid);
      if (data && data.length < 1000000) await db.collection('publicAssets').doc(aid).set({ data, updatedAt: Date.now() });
    }
    const ref = db.collection('public').doc(rootId);
    const prev = await ref.get();
    const prevIds = prev.exists ? prev.data().pageIds || [] : [];
    let batch = db.batch();
    let n = 0;
    const flush = async () => { if (n) { await batch.commit(); batch = db.batch(); n = 0; } };
    batch.set(ref, { title: root.title || 'Sin título', icon: NC.iconText(root.icon, ''), pageIds: ids, at: Date.now(), withChildren });
    n++;
    for (const p of pages) {
      const data = JSON.stringify(p);
      if (data.length > 1000000) { NC.toast(`«${p.title || 'Sin título'}» es demasiado grande para publicarse`); continue; }
      batch.set(ref.collection('pages').doc(p.id), { data, updatedAt: Date.now() });
      if (++n >= 200) await flush();
    }
    prevIds.filter((id) => !ids.includes(id)).forEach((id) => { batch.delete(ref.collection('pages').doc(id)); n++; });
    await flush();
    lastHash[rootId] = hashOf(rootId, withChildren);
    if (!root.published || root.published.withChildren !== withChildren) A.updatePage(rootId, { published: { withChildren, at: Date.now() } });
    else root.published.at = Date.now();
    return NC.publicUrl(rootId);
  }

  async function unpublish(rootId) {
    const db = fs();
    if (!db || !signedIn()) throw new Error('Inicia sesión con Google');
    const ref = db.collection('public').doc(rootId);
    const prev = await ref.get();
    const batch = db.batch();
    (prev.exists ? prev.data().pageIds || [] : []).forEach((id) => batch.delete(ref.collection('pages').doc(id)));
    batch.delete(ref);
    await batch.commit();
    A.updatePage(rootId, { published: null });
  }

  NC.publishApi = { publish, unpublish };

  /* ---------- Republicar automáticamente al editar ---------- */
  const lastHash = {};
  const hashOf = (rootId, withChildren) => {
    const s = NC.getState();
    const str = collect(rootId, withChildren).map((id) => JSON.stringify(clean(s.pages[id]))).join('|');
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return h + ':' + str.length;
  };
  let timer = null;
  let running = false;
  if (!NC.publicMode) {
    NC.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (running || !signedIn()) return;
        running = true;
        const s = NC.getState();
        for (const p of Object.values(s.pages)) {
          if (!p.published || p.trashed) continue;
          const h = hashOf(p.id, p.published.withChildren);
          if (lastHash[p.id] === undefined) { lastHash[p.id] = h; continue; } // primera vez: referencia
          if (lastHash[p.id] !== h) { try { await publish(p.id); } catch (e) { console.warn(e); } }
        }
        running = false;
      }, 4000);
    });
  }

  /* ---------- Ventana «Compartir / Publicar» ---------- */
  NC.SharePopover = function SharePopover({ page, anchor, onClose }) {
    const st = NC.useSync();
    const [busy, setBusy] = useState(false);
    const [withChildren, setWithChildren] = useState(page.published ? page.published.withChildren !== false : true);
    const url = NC.publicUrl(page.id);
    const run = async (fn) => {
      setBusy(true);
      try { await fn(); } catch (e) { NC.toast(e.message); }
      setBusy(false);
    };
    const copy = () => { navigator.clipboard ? navigator.clipboard.writeText(url).then(() => NC.toast('Enlace copiado')) : prompt('Copia el enlace', url); };
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="menu share-pop" align="right">
      <div className="share-head">🌐 <b>Publicar en la web</b></div>
      ${!st.user && html`<div className="muted small pad">Inicia sesión con Google para publicar páginas.</div>`}
      ${st.user && !page.published && html`
        <p className="muted small pad-x">Crea un sitio web de solo lectura con esta página. Cualquiera con el enlace podrá verla, pero no editarla.</p>
        <label className="menu-item toggle-row"><span>📄</span> Incluir subpáginas<input type="checkbox" checked=${withChildren} onChange=${() => setWithChildren(!withChildren)} /></label>
        <button className="btn-primary share-btn" disabled=${busy} onClick=${() => run(() => publish(page.id, { withChildren }))}>${busy ? 'Publicando…' : 'Publicar'}</button>`}
      ${st.user && page.published && html`
        <div className="share-link"><input className="menu-input" readOnly value=${url} onFocus=${(e) => e.target.select()} />
          <button className="btn-primary small" onClick=${copy}>Copiar</button></div>
        <div className="muted small pad-x">Publicada ${NC.timeAgo(page.published.at || Date.now())}. Los cambios se publican solos en unos segundos.</div>
        <label className="menu-item toggle-row"><span>📄</span> Incluir subpáginas
          <input type="checkbox" checked=${withChildren} onChange=${() => { setWithChildren(!withChildren); run(() => publish(page.id, { withChildren: !withChildren })); }} /></label>
        <button className="menu-item" onClick=${() => window.open(url, '_blank', 'noopener')}><span>↗</span> Ver el sitio</button>
        <button className="menu-item" disabled=${busy} onClick=${() => run(() => publish(page.id).then(() => NC.toast('Publicación actualizada')))}><span>⟳</span> Actualizar ahora</button>
        <button className="menu-item danger" disabled=${busy} onClick=${() => confirm('¿Dejar de publicar esta página?') && run(() => unpublish(page.id).then(() => NC.toast('Ya no está publicada')))}><span>⊘</span> Dejar de publicar</button>`}
    <//>`;
  };

  /* ---------- Vista pública ---------- */
  NC.PublicApp = function PublicApp({ PageView }) {
    const s = NC.useStore();
    const [state, setState] = useState({ loading: true, error: null, meta: null });
    const root = (location.hash.match(/^#\/p\/([^/?]+)/) || [])[1];
    NC.publicRoot = root;
    React.useEffect(() => {
      (async () => {
        try {
          const db = fs();
          if (!db) throw new Error('Esta copia de la app no tiene la nube configurada');
          const ref = db.collection('public').doc(root);
          const meta = await ref.get();
          if (!meta.exists) throw new Error('Esta página no existe o ya no está publicada');
          const snap = await ref.collection('pages').get();
          const pages = {};
          snap.forEach((d) => { try { pages[d.id] = JSON.parse(d.data().data); } catch (e) { /* */ } });
          A.loadPublic(pages, root);
          setState({ loading: false, error: null, meta: meta.data() });
          const p = pages[root];
          document.title = (p && p.title ? p.title : 'Página publicada') + ' · ' + (CFG.appName || 'Notas de L');
        } catch (e) {
          setState({ loading: false, error: e.message, meta: null });
        }
      })();
    }, [root]);
    const cur = s.ui.current && s.pages[s.ui.current];
    const crumbs = [];
    let p = cur;
    while (p) { crumbs.unshift(p); p = s.pages[p.rowOf || p.parentId]; }
    return html`<div className="public-mode">
      <header className="public-bar">
        <nav className="crumbs">${crumbs.map((c, i) => html`<${React.Fragment} key=${c.id}>${i > 0 && html`<span className="crumb-sep">/</span>`}
          <button className="crumb" onClick=${() => NC.navigate(c.id)}><${NC.Icon} icon=${c.icon} /> ${c.title || 'Sin título'}</button><//>`)}</nav>
        <span className="grow"></span>
        <a className="public-brand" href=${BASE} target="_blank" rel="noopener"><img src="assets/icon.png" alt="" /> Hecho con ${CFG.appName || 'Notas de L'}</a>
      </header>
      <main className="public-main">
        ${state.loading && html`<div className="empty-state"><p className="muted">Cargando…</p></div>`}
        ${state.error && html`<div className="empty-state"><div className="big">🔒</div><p>${state.error}</p></div>`}
        ${!state.loading && !state.error && cur && html`<${PageView} key=${cur.id} pageId=${cur.id} />`}
      </main>
      ${s.ui.peek && s.pages[s.ui.peek] && html`<${NC.Modal} onClose=${() => A.setUI({ peek: null })} className="peek"><div className="peek-body"><${PageView} pageId=${s.ui.peek} peek=${true} /></div><//>`}
    </div>`;
  };
})();
