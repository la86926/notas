/* Notas de L — archivos (imágenes subidas, iconos, adjuntos).
 * Las imágenes se comprimen en el navegador y se guardan aparte de la página, como "asset:ID":
 * en IndexedDB (este dispositivo) y en Firestore users/{uid}/assets/{id} (sincronizado).
 * Así una portada o una foto nunca vuelve a superar el límite de tamaño de una página. */
(function () {
  const NC = window.NC;
  const A = NC.actions;
  const { html } = NC;
  const MAX_ASSET = 950 * 1024; // límite práctico de un documento de Firestore

  /* ---------- Compresión de imágenes ---------- */
  const readAsDataURL = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

  NC.compressImage = (file, { maxW = 1800, maxH = 1800, quality = 0.82, target = 600 * 1024 } = {}) =>
    new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) return reject(new Error('No es una imagen'));
      // los GIF animados y SVG se guardan tal cual si son pequeños
      if ((file.type === 'image/gif' || file.type === 'image/svg+xml') && file.size < target) return readAsDataURL(file).then(resolve, reject);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        let q = quality;
        const encode = () => {
          let out = canvas.toDataURL('image/webp', q);
          if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/jpeg', q);
          return out;
        };
        let out = encode();
        while (out.length > target && q > 0.45) { q -= 0.08; out = encode(); }
        // si aún pesa demasiado, se reduce el tamaño
        let s = 0.85;
        while (out.length > target && s > 0.3) {
          canvas.width = Math.round(w * s);
          canvas.height = Math.round(h * s);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          out = encode();
          s -= 0.15;
        }
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });

  /* ---------- Almacén local (IndexedDB) ---------- */
  let dbp = null;
  const idb = () => (dbp = dbp || new Promise((res, rej) => {
    const r = indexedDB.open('notas-de-l-assets', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('assets', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const d = await idb();
    return new Promise((res, rej) => {
      const t = d.transaction('assets', mode);
      const req = fn(t.objectStore('assets'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  };

  const mem = new Map();
  const missing = new Set();
  const pending = new Map();
  const listeners = new Set();
  let version = 0;
  const bump = () => { version++; listeners.forEach((l) => l()); };

  const remote = () => (NC.sync && NC.sync._ctx ? NC.sync._ctx() : null);
  const assetDoc = (c, id) => c.db.collection('users').doc(c.uid).collection('assets').doc(id);

  async function upload(id, data) {
    const c = remote();
    if (!c || data.length > MAX_ASSET) return false;
    try {
      await assetDoc(c, id).set({ data, updatedAt: Date.now() });
      await tx('readwrite', (os) => os.put({ id, data, uploaded: true, at: Date.now() }));
      return true;
    } catch (e) {
      console.warn('No se pudo subir el archivo', e);
      return false;
    }
  }

  async function fetchAsset(id) {
    if (mem.has(id)) return mem.get(id);
    try {
      const rec = await tx('readonly', (os) => os.get(id));
      if (rec) { mem.set(id, rec.data); return rec.data; }
    } catch (e) { /* sin IndexedDB */ }
    const c = remote();
    if (!c) return null;
    try {
      const d = await assetDoc(c, id).get();
      const data = d.exists && d.data().data;
      if (typeof data === 'string' && /^data:(image|application|audio|video)\//.test(data)) {
        mem.set(id, data);
        tx('readwrite', (os) => os.put({ id, data, uploaded: true, at: Date.now() })).catch(() => {});
        return data;
      }
    } catch (e) { /* sin conexión */ }
    return null;
  }

  NC.assets = {
    /** Guarda un dataURL y devuelve la referencia "asset:ID" */
    async put(data) {
      const id = 'a' + NC.uid();
      mem.set(id, data);
      try { await tx('readwrite', (os) => os.put({ id, data, uploaded: false, at: Date.now() })); } catch (e) { /* */ }
      if (data.length > MAX_ASSET) NC.toast('Archivo grande: se guarda en este dispositivo pero no se sincronizará');
      else upload(id, data);
      bump();
      return 'asset:' + id;
    },
    /** Sube los archivos pendientes (al iniciar sesión o recuperar la conexión) */
    async flush() {
      missing.clear();
      bump();
      try {
        const all = await tx('readonly', (os) => os.getAll());
        for (const a of all || []) if (!a.uploaded) await upload(a.id, a.data);
      } catch (e) { /* */ }
    },
    get: (url) => (url && url.startsWith('asset:') ? fetchAsset(url.slice(6)) : Promise.resolve(url)),
  };

  /** Devuelve la URL utilizable (o null mientras carga) de "asset:ID", http(s) o data: */
  NC.resolveAsset = (url) => {
    if (!url || !url.startsWith('asset:')) return url;
    const id = url.slice(6);
    if (mem.has(id)) return mem.get(id);
    if (!pending.has(id) && !missing.has(id)) {
      pending.set(id, fetchAsset(id).then((d) => {
        pending.delete(id);
        if (!d) missing.add(id);
        bump();
      }));
    }
    return null;
  };
  NC.useAsset = (url) => {
    React.useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => version);
    return NC.resolveAsset(url);
  };
  NC.isImageRef = (s) => typeof s === 'string' && /^(asset:|https?:\/\/|data:image\/)/.test(s);

  NC.AssetImg = function AssetImg({ src, className = '', style, alt = '' }) {
    const r = NC.useAsset(src);
    if (!r) return html`<span className=${'asset-loading ' + className} style=${style}></span>`;
    return html`<img className=${className} src=${r} style=${style} alt=${alt} draggable=${false} />`;
  };

  // Icono de página: emoji o imagen
  NC.Icon = function Icon({ icon, fallback = '📄', className = '' }) {
    if (NC.isImageRef(icon)) return html`<${NC.AssetImg} src=${icon} className=${'icon-img ' + className} />`;
    return html`<span className=${className}>${icon || fallback}</span>`;
  };
  NC.iconText = (icon, fallback = '📄') => (icon && !NC.isImageRef(icon) ? icon : fallback);

  /* ---------- Migración: imágenes incrustadas → archivos ---------- */
  const dataUrlToBlob = (u) => {
    const [head, b64] = u.split(',');
    const mime = (head.match(/^data:([^;]+)/) || [])[1] || 'application/octet-stream';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };
  // Recomprime imágenes incrustadas grandes antes de moverlas al almacén
  const shrink = async (u, opts) => {
    if (u.startsWith('data:image/') && u.length > 600 * 1024 && !u.startsWith('data:image/gif')) {
      try { return await NC.compressImage(dataUrlToBlob(u), opts); } catch (e) { return u; }
    }
    return u;
  };

  NC.migrateInlineAssets = async () => {
    const s = NC.getState();
    let changed = 0;
    for (const p of Object.values(s.pages)) {
      let touched = false;
      if (typeof p.cover === 'string' && p.cover.startsWith('data:')) { p.cover = await NC.assets.put(await shrink(p.cover, { maxW: 2000, maxH: 1200 })); touched = true; }
      if (typeof p.icon === 'string' && p.icon.startsWith('data:')) { p.icon = await NC.assets.put(await shrink(p.icon, { maxW: 256, maxH: 256 })); touched = true; }
      for (const b of NC.allBlocks(p)) {
        if (typeof b.url === 'string' && b.url.startsWith('data:') && b.url.length > 2000) {
          b.url = await NC.assets.put(b.type === 'image' ? await shrink(b.url) : b.url);
          touched = true;
        }
      }
      if (touched) { p.updatedAt = Date.now(); changed++; }
    }
    if (changed) { A.updatePage(s.ui.current || Object.keys(s.pages)[0], {}); NC.toast(`Imágenes optimizadas en ${changed} ${changed === 1 ? 'página' : 'páginas'} para poder sincronizarlas`); }
  };
  setTimeout(() => NC.migrateInlineAssets().catch((e) => console.warn(e)), 800);
})();
