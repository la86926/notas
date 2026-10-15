/* Notas de L — deshacer/rehacer global (⌘Z / ⌘⇧Z) e historial de versiones por página.
 * Deshacer: instantáneas en memoria tras cada pausa de edición. Historial: copias guardadas
 * en IndexedDB como mucho cada 10 minutos de edición (se conservan 60 por página). */
(function () {
  const NC = window.NC;
  const { html } = NC;
  const A = NC.actions;
  const { useState, useEffect } = React;

  const FIELDS = ['title', 'icon', 'cover', 'coverY', 'coverH', 'blocks', 'comments', 'values'];
  const snap = (p) => JSON.stringify(FIELDS.reduce((o, k) => ((o[k] = p[k]), o), {}));
  const stacks = {};
  const st = (id) => (stacks[id] = stacks[id] || { undo: [], redo: [], last: null });

  const activeIds = () => {
    const s = NC.getState();
    return [s.ui.peek, s.ui.current].filter((id) => id && s.pages[id]);
  };

  function record(id) {
    const p = NC.getState().pages[id];
    if (!p) return;
    const json = snap(p);
    const t = st(id);
    if (t.last === null) { t.last = json; return; }
    if (json === t.last) return;
    t.undo.push(t.last);
    if (t.undo.length > 100) t.undo.shift();
    t.redo = [];
    t.last = json;
    maybeSaveVersion(id, json);
  }

  let timer = null;
  NC.subscribe(() => {
    activeIds().forEach((id) => { if (st(id).last === null) record(id); });
    clearTimeout(timer);
    timer = setTimeout(() => activeIds().forEach(record), 450);
  });

  function apply(id, json) {
    const p = NC.getState().pages[id];
    const data = JSON.parse(json);
    FIELDS.forEach((k) => (p[k] = data[k]));
    NC.sanitizePage(p);
    st(id).last = snap(p);
    A.updatePage(id, {});
  }

  const H = (NC.history = {
    undo(id = activeIds()[0]) {
      if (!id) return;
      clearTimeout(timer);
      record(id);
      const t = st(id);
      if (!t.undo.length) return NC.toast('Nada que deshacer');
      t.redo.push(t.last);
      apply(id, t.undo.pop());
    },
    redo(id = activeIds()[0]) {
      if (!id) return;
      const t = st(id);
      if (!t.redo.length) return NC.toast('Nada que rehacer');
      t.undo.push(t.last);
      apply(id, t.redo.pop());
    },
  });

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k !== 'z' && k !== 'y') return;
    // en campos normales (inputs, celdas de tabla de base de datos) se usa el deshacer del navegador
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    e.preventDefault();
    e.stopPropagation();
    if (k === 'y' || e.shiftKey) H.redo();
    else H.undo();
  }, true);

  /* ---------- Historial de versiones (IndexedDB) ---------- */
  let dbp = null;
  const db = () =>
    (dbp = dbp || new Promise((res, rej) => {
      const r = indexedDB.open('notas-de-l-history', 1);
      r.onupgradeneeded = () => {
        const os = r.result.createObjectStore('versions', { keyPath: 'id', autoIncrement: true });
        os.createIndex('page', 'pageId');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('versions', mode);
      const out = fn(t.objectStore('versions'));
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      t.onerror = () => rej(t.error);
    });
  };
  const lastSaved = {};
  const words = (json) => { const d = JSON.parse(json); return NC.htmlToText((d.blocks || []).map((b) => b.html || b.text || '').join(' ')).split(/\s+/).filter(Boolean).length; };

  function maybeSaveVersion(id, json) {
    if (NC.publicMode) return;
    const now = Date.now();
    if (lastSaved[id] && now - lastSaved[id] < 10 * 60e3) return;
    lastSaved[id] = now;
    tx('readwrite', (os) => os.add({ pageId: id, at: now, data: json, words: words(json) })).then(prune.bind(null, id)).catch(() => {});
  }
  async function prune(id) {
    const all = await H.versions(id);
    if (all.length <= 60) return;
    const old = all.slice(60);
    await tx('readwrite', (os) => old.forEach((v) => os.delete(v.id)));
  }
  H.versions = async (id) => {
    try {
      const list = await tx('readonly', (os) => os.index('page').getAll(id));
      return (list || []).sort((a, b) => b.at - a.at);
    } catch (e) { return []; }
  };
  H.saveNow = (id) => { const p = NC.getState().pages[id]; if (p) { lastSaved[id] = 0; maybeSaveVersion(id, snap(p)); } };

  NC.VersionHistory = function VersionHistory({ pageId, onClose }) {
    const [list, setList] = useState(null);
    const [sel, setSel] = useState(null);
    useEffect(() => { H.saveNow(pageId); setTimeout(() => H.versions(pageId).then((l) => { setList(l); setSel(l[0] || null); }), 150); }, [pageId]);
    const preview = sel ? JSON.parse(sel.data) : null;
    const restore = () => {
      record(pageId);
      const t = st(pageId);
      t.undo.push(t.last);
      apply(pageId, sel.data);
      NC.toast('Versión restaurada (⌘Z para deshacer)');
      onClose();
    };
    return html`<${NC.Modal} onClose=${onClose} className="history-modal">
      <div className="history">
        <div className="history-preview">
          ${preview ? html`<h1>${NC.iconText(preview.icon, '')} ${preview.title || 'Sin título'}</h1>
            ${(preview.blocks || []).map((b, i) => html`<div key=${i} className=${'hp-' + b.type} style=${{ paddingLeft: (b.indent || 0) * 20 }}>
              ${b.type === 'todo' ? (b.checked ? '☑ ' : '☐ ') : b.type === 'bulleted' ? '• ' : ''}${NC.htmlToText(b.html || b.text || '') || (b.type === 'divider' ? '———' : '')}</div>`)}`
            : html`<div className="muted pad">${list ? 'Aún no hay versiones guardadas.' : 'Cargando…'}</div>`}
        </div>
        <div className="history-side">
          <div className="modal-head"><h3>Historial</h3><span className="grow"></span><button className="icon-btn" onClick=${onClose}>✕</button></div>
          <div className="history-list">
            ${(list || []).map((v) => html`<button key=${v.id} className=${'history-item' + (sel && sel.id === v.id ? ' active' : '')} onClick=${() => setSel(v)}>
              <b>${new Date(v.at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}</b>
              <span className="muted small">${NC.timeAgo(v.at)} · ${v.words} palabras</span></button>`)}
          </div>
          <div className="history-foot">
            <span className="muted small">Se guarda una versión cada 10 min de edición, en este dispositivo.</span>
            <button className="btn-primary" disabled=${!sel} onClick=${restore}>Restaurar</button>
          </div>
        </div>
      </div>
    <//>`;
  };
})();
