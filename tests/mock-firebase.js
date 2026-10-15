/* Firebase simulado en memoria (API compat mínima) para probar js/sync.js sin un proyecto real.
 * window.__mock permite simular otro dispositivo: remoteSet(path, data) / remoteDelete(path). */
(function () {
  const docs = new Map(); // ruta → datos
  const colListeners = new Map(); // ruta colección → Set(cb)
  const docListeners = new Map(); // ruta doc → Set(cb)
  const parentOf = (path) => path.split('/').slice(0, -1).join('/');
  const later = (fn) => setTimeout(fn, 5);

  function notify(path, type) {
    const col = parentOf(path);
    const data = docs.get(path);
    (colListeners.get(col) || []).forEach((cb) =>
      later(() => cb({ metadata: { fromCache: false }, docChanges: () => [{ type, doc: snapDoc(path, data) }] }))
    );
    (docListeners.get(path) || []).forEach((cb) => later(() => cb(snapDoc(path, data))));
  }
  const snapDoc = (path, data) => ({ id: path.split('/').pop(), exists: data !== undefined, data: () => data });

  function docRef(path) {
    return {
      path,
      collection: (name) => colRef(path + '/' + name),
      get: async () => snapDoc(path, docs.get(path)),
      set: async (data) => { docs.set(path, data); notify(path, 'modified'); },
      delete: async () => { docs.delete(path); notify(path, 'removed'); },
      onSnapshot: (cb) => {
        if (!docListeners.has(path)) docListeners.set(path, new Set());
        docListeners.get(path).add(cb);
        later(() => cb(snapDoc(path, docs.get(path))));
        return () => docListeners.get(path).delete(cb);
      },
    };
  }
  function colRef(path) {
    const list = () => [...docs.keys()].filter((k) => parentOf(k) === path);
    return {
      doc: (id) => docRef(path + '/' + id),
      get: async () => {
        const ks = list();
        return { empty: !ks.length, forEach: (fn) => ks.forEach((k) => fn(snapDoc(k, docs.get(k)))) };
      },
      onSnapshot: (cb) => {
        if (!colListeners.has(path)) colListeners.set(path, new Set());
        colListeners.get(path).add(cb);
        later(() => cb({ metadata: { fromCache: false }, docChanges: () => list().map((k) => ({ type: 'added', doc: snapDoc(k, docs.get(k)) })) }));
        return () => colListeners.get(path).delete(cb);
      },
    };
  }

  let authCb = null;
  const auth = {
    currentUser: null,
    setPersistence: async () => {},
    onAuthStateChanged: (cb) => { authCb = cb; later(() => cb(auth.currentUser)); },
    signInWithPopup: async () => { auth.currentUser = window.__mock.user; authCb && authCb(auth.currentUser); },
    signInWithCredential: async () => auth.signInWithPopup(),
    signOut: async () => { auth.currentUser = null; authCb && authCb(null); },
  };
  const authFn = () => auth;
  authFn.Auth = { Persistence: { LOCAL: 'local' } };
  authFn.GoogleAuthProvider = class { setCustomParameters() {} static credential(t) { return { t }; } };

  window.firebase = {
    initializeApp: () => ({}),
    auth: authFn,
    firestore: () => ({
      settings: () => {},
      collection: (name) => colRef(name),
      batch: () => {
        const ops = [];
        return {
          set: (ref, data) => ops.push(() => ref.set(data)),
          delete: (ref) => ops.push(() => ref.delete()),
          commit: async () => { for (const op of ops) await op(); },
        };
      },
    }),
  };

  window.__mock = {
    docs,
    user: { uid: 'u1', email: 'la86926@gmail.com', emailVerified: true, displayName: 'L', photoURL: null },
    remoteSet: (path, data) => { docs.set(path, data); notify(path, 'modified'); },
    remoteDelete: (path) => { docs.delete(path); notify(path, 'removed'); },
  };
  window.NOTAS_TEST_CONFIG = { firebase: { projectId: 'demo' } };
})();
