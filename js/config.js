/* Configuración de "Notas de L".
 * Los valores de Firebase NO son secretos: identifican tu proyecto. La seguridad real la dan
 * el inicio de sesión con Google y las reglas de Firestore (archivo firestore.rules). */
window.NOTAS_CONFIG = {
  appName: 'Notas de L',

  // 1) Firebase → Configuración del proyecto → Tus apps → App web → "firebaseConfig".
  //    Pega aquí el objeto completo. Mientras sea null, la app funciona solo en local.
  firebase: null,
  // firebase: {
  //   apiKey: '…',
  //   authDomain: 'tu-proyecto.firebaseapp.com',
  //   projectId: 'tu-proyecto',
  //   appId: '…',
  // },

  // 2) Solo estas cuentas de Google pueden iniciar sesión (además lo exigen las reglas de Firestore).
  allowedEmails: ['la86926@gmail.com'],

  // 3) App de Mac: ID de cliente OAuth de tipo "iOS" creado en Google Cloud (mismo proyecto que Firebase),
  //    p. ej. '1234567890-abc123.apps.googleusercontent.com'.
  desktopGoogleClientId: '',

  // Enlace de descarga del instalador para Mac que se muestra en la versión web.
  macDownloadUrl: 'dist/Notas-de-L.dmg',
};
