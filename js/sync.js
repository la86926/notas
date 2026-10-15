/* Notas de L — sincronización en la nube (Firebase Auth con Google + Firestore).
 * Modelo local-first: la app siempre guarda en localStorage y esta capa sube/baja las
 * páginas que cambian. Cada página es un documento users/{uid}/pages/{id}; el orden raíz
 * vive en users/{uid}/meta/workspace. Conflictos: gana la última edición (updatedAt). */
(function () {
  const NC = window.NC;
  const A = NC.actions;
  const CFG = window.NOTAS_CONFIG || {};
  const SKEY = 'notioncito:sync';
  const native = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.notas;
  const MAX_DOC = 900 * 1024;

  const status = { state: CFG.firebase ? 'signedout' : 'off', user: null, error: null, lastSync: null };
  const listeners = new Set();
  let version = 0;
  const setStatus = (patch) => {
    Object.assign(status, patch);
    version++;
    listeners.forEach((l) => l());
  };

  const sync = (NC.sync = {
    enabled: !!(CFG.firebase && window.firebase),
    isDesktop: !!native,
    status,
    signIn,
    signOut,
    pushNow: () => push(),
  });
  NC.useSync = () => {
    React.useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => version);
    return status;
  };

  /* ---------- Estado de sincronización persistido ---------- */
  const loadMeta = () => {
    try { return JSON.parse(localStorage.getItem(SKEY)) || { uid: null, hashes: {}, metaHash: null }; }
    catch (e) { return { uid: null, hashes: {}, metaHash: null }; }
  };
  let meta = loadMeta();
  const saveMeta = () => { try { localStorage.setItem(SKEY, JSON.stringify(meta)); } catch (e) { /* lleno */ } };

  const hash = (str) => {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + ':' + str.length;
  };
  const pageJson = (p) => JSON.stringify(p);

  if (!sync.enabled) return;

  /* ---------- Firebase ---------- */
  firebase.initializeApp(CFG.firebase);
  const auth = firebase.auth();
  const db = firebase.firestore();
  try { db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) { /* ya inicializado */ }
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

  let unsubPages = null;
  let unsubMeta = null;
  let user = null;
  const pagesCol = () => db.collection('users').doc(user.uid).collection('pages');
  const metaDoc = () => db.collection('users').doc(user.uid).collection('meta').doc('workspace');

  const allowed = (u) => {
    const list = (CFG.allowedEmails || []).map((e) => e.toLowerCase());
    return u.emailVerified && (!list.length || list.includes((u.email || '').toLowerCase()));
  };

  auth.onAuthStateChanged(async (u) => {
    stopListeners();
    user = null;
    if (!u) {
      setStatus({ state: 'signedout', user: null });
      if (native && !silentTried) silentDesktopSignIn();
      return;
    }
    if (!allowed(u)) {
      NC.toast('Esta cuenta de Google no está autorizada');
      await auth.signOut();
      if (native) native.postMessage({ type: 'googleSignOut' });
      return;
    }
    user = u;
    setStatus({ state: 'connecting', user: { email: u.email, name: u.displayName, photo: u.photoURL }, error: null });
    try {
      await initialMerge();
      startListeners();
      schedulePush(0);
    } catch (e) {
      console.error(e);
      setStatus({ state: 'error', error: e.message });
    }
  });

  /* ---------- Inicio de sesión ---------- */
  let pendingNative = null;
  let silentTried = false;

  function nativeRequest(type) {
    return new Promise((resolve, reject) => {
      pendingNative = { resolve, reject };
      native.postMessage({ type, clientId: CFG.desktopGoogleClientId });
    });
  }
  // La app de Mac responde aquí tras el flujo OAuth nativo (ASWebAuthenticationSession + PKCE)
  sync._nativeResult = (res) => {
    const p = pendingNative;
    pendingNative = null;
    if (!p) return;
    if (res && res.idToken) p.resolve(res.idToken);
    else p.reject(new Error((res && res.error) || 'cancelado'));
  };

  async function signInWithIdToken(idToken) {
    const cred = firebase.auth.GoogleAuthProvider.credential(idToken);
    await auth.signInWithCredential(cred);
  }

  async function silentDesktopSignIn() {
    silentTried = true;
    if (!CFG.desktopGoogleClientId) return;
    try { await signInWithIdToken(await nativeRequest('googleSilent')); } catch (e) { /* sin sesión guardada */ }
  }

  async function signIn() {
    try {
      if (native) {
        if (!CFG.desktopGoogleClientId) return NC.toast('Falta desktopGoogleClientId en js/config.js');
        setStatus({ state: 'connecting' });
        await signInWithIdToken(await nativeRequest('googleSignIn'));
        return;
      }
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await auth.signInWithPopup(provider);
      } catch (e) {
        if (e.code === 'auth/popup-blocked') await auth.signInWithRedirect(provider);
        else throw e;
      }
    } catch (e) {
      if (!/cancel|closed-by-user|cancelled-popup/i.test(e.message + (e.code || ''))) {
        console.error(e);
        NC.toast('No se pudo iniciar sesión: ' + (e.code || e.message));
      }
      setStatus({ state: auth.currentUser ? status.state : 'signedout' });
    }
  }

  async function signOut() {
    const wipe = confirm('¿Borrar también las notas guardadas en este dispositivo?\n\nAceptar: borrar (recomendado en equipos compartidos).\nCancelar: conservarlas sin sincronizar.');
    await push().catch(() => {});
    await auth.signOut();
    if (native) native.postMessage({ type: 'googleSignOut' });
    meta = { uid: null, hashes: {}, metaHash: null };
    saveMeta();
    if (wipe) A.resetWorkspace();
    NC.toast('Sesión cerrada');
  }

  /* ---------- Primera sincronización en este dispositivo ---------- */
  async function initialMerge() {
    if (meta.uid === user.uid) return;
    const [snap, metaSnap] = await Promise.all([pagesCol().get(), metaDoc().get()]);
    const s = NC.getState();
    meta = { uid: user.uid, hashes: {}, metaHash: null };
    if (snap.empty) {
      saveMeta();
      return; // la cuenta está vacía: push() subirá todo lo local
    }
    const remote = {};
    snap.forEach((d) => {
      try {
        const raw = d.data().data;
        remote[d.id] = NC.sanitizePage(JSON.parse(raw));
        meta.hashes[d.id] = hash(pageJson(remote[d.id]));
      } catch (e) { /* documento dañado */ }
    });
    let remoteRoots = [];
    try { remoteRoots = metaSnap.exists ? JSON.parse(metaSnap.data().rootIds) : []; } catch (e) { /* */ }
    meta.metaHash = hash(JSON.stringify(remoteRoots));
    const replace = confirm('Tu cuenta ya tiene notas en la nube.\n\nAceptar: usar las notas de la nube en este dispositivo.\nCancelar: combinarlas con las notas de este dispositivo.');
    if (replace) {
      s.pages = remote;
      s.rootIds = remoteRoots.filter((id) => remote[id]);
    } else {
      Object.entries(remote).forEach(([id, p]) => {
        const local = s.pages[id];
        if (!local || (p.updatedAt || 0) >= (local.updatedAt || 0)) s.pages[id] = p;
      });
      const extra = s.rootIds.filter((id) => !remoteRoots.includes(id));
      s.rootIds = [...remoteRoots, ...extra].filter((id) => s.pages[id]);
    }
    saveMeta();
    A.remoteApplied();
  }

  /* ---------- Bajada: escuchar cambios remotos ---------- */
  function startListeners() {
    unsubPages = pagesCol().onSnapshot(
      (snap) => {
        const s = NC.getState();
        let changed = false;
        snap.docChanges().forEach((ch) => {
          const id = ch.doc.id;
          const local = s.pages[id];
          if (ch.type === 'removed') {
            if (local && meta.hashes[id] === hash(pageJson(local))) {
              delete s.pages[id];
              changed = true;
            }
            if (!s.pages[id]) delete meta.hashes[id];
            return;
          }
          const d = ch.doc.data();
          const rh = hash(d.data);
          if (local) {
            const lh = hash(pageJson(local));
            if (lh === rh) return void (meta.hashes[id] = rh);
            const dirty = meta.hashes[id] !== lh;
            if (dirty && (local.updatedAt || 0) > (d.updatedAt || 0)) return; // gana lo local; se subirá
          }
          try {
            s.pages[id] = NC.sanitizePage(JSON.parse(d.data));
            meta.hashes[id] = hash(pageJson(s.pages[id])); // hash de la versión local (saneada)
            changed = true;
          } catch (e) { /* documento dañado */ }
        });
        saveMeta();
        if (changed) A.remoteApplied();
        setStatus({ state: snap.metadata.fromCache ? 'offline' : 'synced', lastSync: Date.now() });
      },
      (err) => setStatus({ state: 'error', error: err.code === 'permission-denied' ? 'Permiso denegado (revisa las reglas de Firestore)' : err.message })
    );
    unsubMeta = metaDoc().onSnapshot((doc) => {
      if (!doc.exists) return;
      const s = NC.getState();
      const raw = doc.data().rootIds;
      const rh = hash(raw);
      const lh = hash(JSON.stringify(s.rootIds));
      if (rh === lh) return void ((meta.metaHash = rh), saveMeta());
      if (meta.metaHash !== lh) return; // el orden local cambió y aún no se subió
      try {
        const remoteRoots = JSON.parse(raw);
        const extra = s.rootIds.filter((id) => !remoteRoots.includes(id) && !meta.hashes[id]);
        s.rootIds = [...remoteRoots, ...extra];
        meta.metaHash = rh;
        saveMeta();
        A.remoteApplied();
      } catch (e) { /* */ }
    });
  }

  function stopListeners() {
    unsubPages && unsubPages();
    unsubMeta && unsubMeta();
    unsubPages = unsubMeta = null;
  }

  /* ---------- Subida: enviar lo que cambió localmente ---------- */
  let pushTimer = null;
  let pushing = false;
  let again = false;
  const tooBig = new Set();

  function schedulePush(delay = 900) {
    if (!user) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, delay);
  }
  NC.subscribe(() => schedulePush());
  window.addEventListener('online', () => schedulePush(0));

  async function push() {
    if (!user) return;
    if (pushing) { again = true; return; }
    const s = NC.getState();
    const ops = [];
    for (const [id, p] of Object.entries(s.pages)) {
      const json = pageJson(p);
      const h = hash(json);
      if (meta.hashes[id] === h) continue;
      if (json.length > MAX_DOC) {
        if (!tooBig.has(id)) NC.toast(`«${p.title || 'Sin título'}» es demasiado grande para sincronizar (¿imágenes subidas?). Usa imágenes por URL.`);
        tooBig.add(id);
        continue;
      }
      ops.push({ kind: 'set', id, h, data: { data: json, updatedAt: p.updatedAt || Date.now() } });
    }
    Object.keys(meta.hashes).filter((id) => !s.pages[id]).forEach((id) => ops.push({ kind: 'del', id }));
    const rootsJson = JSON.stringify(s.rootIds);
    const rootsHash = hash(rootsJson);
    const pushRoots = rootsHash !== meta.metaHash;
    if (!ops.length && !pushRoots) return;

    pushing = true;
    setStatus({ state: 'syncing' });
    try {
      // lotes pequeños: límite de Firestore de 500 operaciones y 10 MB por lote
      for (let i = 0; i < ops.length || (i === 0 && pushRoots); ) {
        const batch = db.batch();
        let bytes = 0;
        const chunk = [];
        while (i < ops.length && chunk.length < 200 && bytes < 4e6) {
          const op = ops[i++];
          chunk.push(op);
          if (op.kind === 'set') {
            bytes += op.data.data.length;
            batch.set(pagesCol().doc(op.id), op.data);
          } else batch.delete(pagesCol().doc(op.id));
        }
        const last = i >= ops.length;
        if (last && pushRoots) batch.set(metaDoc(), { rootIds: rootsJson, updatedAt: Date.now() });
        await batch.commit();
        chunk.forEach((op) => (op.kind === 'set' ? (meta.hashes[op.id] = op.h) : delete meta.hashes[op.id]));
        if (last && pushRoots) meta.metaHash = rootsHash;
        saveMeta();
        if (last) break;
      }
      setStatus({ state: 'synced', lastSync: Date.now(), error: null });
    } catch (e) {
      console.error(e);
      setStatus({ state: 'error', error: e.code === 'permission-denied' ? 'Permiso denegado (revisa las reglas de Firestore)' : e.message });
    } finally {
      pushing = false;
      if (again) { again = false; schedulePush(300); }
    }
  }
})();
