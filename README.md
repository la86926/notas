# Notas de L

Tu espacio de notas tipo Notion, en dos versiones que se sincronizan entre sí:

- **Web:** https://la86926.github.io/notas/ (GitHub Pages).
- **Mac:** app nativa **Notas de L**. El instalador es [`dist/Notas-de-L.dmg`](dist/Notas-de-L.dmg) y funciona en Apple Silicon e Intel con macOS 13 o superior.

Inicias sesión con tu cuenta de Google y tus cambios se sincronizan en la nube (Firebase). Sin sesión, todo funciona igual, pero las notas se quedan solo en el dispositivo.

## Funciones

- **Editor por bloques**: texto, encabezados (también desplegables), tareas, viñetas, listas numeradas, desplegables, citas, destacados, código, divisores, tablas simples, ecuaciones LaTeX, imágenes, archivos, marcadores web, embeds (YouTube, Vimeo, Spotify, Figma, Loom, CodePen, Google Docs/Sheets/Slides/Maps), índice, ruta de navegación y botones.
- **Diseño**: columnas (arrastra un bloque al lado de otro o usa `/2 columnas`) y pestañas.
- **Menú `/`**, **@menciones** de páginas y fechas, **recordatorios** con bandeja de entrada y atajos Markdown.
- **Selección múltiple** (Esc, Shift+↑/↓, arrastrar desde el margen), **⌘Z/⌘⇧Z** deshacer y rehacer, **⌘F** buscar y reemplazar, **historial de versiones**.
- **Comentarios** en bloques, en texto seleccionado y en la página. **Enlaces inversos**.
- **Plantillas** (incluidas y propias), **bloquear página**, texto pequeño, ancho completo, tipografías, **exportar a PDF/Markdown**.
- **Portadas como en Notion**: galería de colores y fotos de Unsplash, subir (se comprime sola), enlace y buscador de fotos. Se puede mover y cambiar la altura.
- **Iconos**: emojis con buscador en español, recientes, o una imagen propia. Escribe `:` en el texto para insertar emojis.
- **Imágenes y archivos** comprimidos y sincronizados aparte de la página (sin límite por página).
- **Sincronización en tiempo real** con fusión por bloque: si editas bloques distintos en el Mac y en la web a la vez, se conservan ambos cambios.
- **Código** con colores de sintaxis, **Mover a…** otra página, modo oscuro.
- **Bases de datos** con vistas Tabla, Tablero, Calendario y Galería.

## Instalar en un Mac

1. Abre `Notas-de-L.dmg` y arrastra **Notas de L** a **Aplicaciones**.
2. La primera vez, haz **clic derecho → Abrir → Abrir**. macOS lo pide porque la app no está notarizada por Apple, ya que eso requiere una cuenta de desarrollador de pago. Si aun así no abre, ve a *Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente*.

## Activar la sincronización (una sola vez, unos 10 minutos)

Mientras `firebase` sea `null` en [`js/config.js`](js/config.js), la app funciona solo en local.

1. Entra en <https://console.firebase.google.com> con tu cuenta de Google y pulsa **Crear proyecto** (por ejemplo, `notas-de-l`). Analytics no hace falta.
2. **Authentication → Comenzar → Google → Habilitar → Guardar.**
3. **Authentication → Configuración → Dominios autorizados → Agregar dominio:** `la86926.github.io`.
4. **Firestore Database → Crear base de datos** (modo producción, ubicación cercana, p. ej. `us-central` o `southamerica-east1`). Después, en **Reglas**, pega el contenido de [`firestore.rules`](firestore.rules) y pulsa **Publicar**.
5. **Configuración del proyecto (⚙️) → Tus apps → `</>` (Web)**, registra la app y copia el objeto `firebaseConfig` en `firebase:` dentro de `js/config.js`.
6. **Solo para la app de Mac:** abre <https://console.cloud.google.com>, selecciona el mismo proyecto y ve a **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**.
   - Tipo: **iOS**. Bundle ID: `com.la86926.notasdel`.
   - Copia el ID de cliente en `desktopGoogleClientId` de `js/config.js`.
   - Añádelo también en Firebase: **Authentication → Google → Lista de IDs de clientes de proyectos externos**.
7. Recompila el instalador y sube los cambios:

   ```bash
   ./mac/build.sh
   ```

   ```bash
   git add -A && git commit -m "Configurar Firebase" && git push
   ```

## Publicar la web (una sola vez)

En GitHub, entra en **Settings → Pages**. En **Source** elige *Deploy from a branch*, rama `main`, carpeta `/ (root)` y pulsa **Save**. En uno o dos minutos la web estará en `https://la86926.github.io/notas/`.

## Seguridad

- **Login solo con Google.** No hay contraseñas propias que robar.
- **Reglas de Firestore** ([`firestore.rules`](firestore.rules)): el servidor de Google rechaza cualquier lectura o escritura que no venga de `la86926@gmail.com` con el correo verificado, y solo dentro de su carpeta `users/{uid}`. Aunque alguien copie la web o la configuración, no puede leer tus notas. Para cambiar de cuenta, edita el correo en `firestore.rules` y en `allowedEmails` de `js/config.js`.
- **Los valores de `firebaseConfig` no son secretos:** identifican el proyecto, igual que una dirección web. La protección real son las reglas anteriores.
- **Content-Security-Policy** en `index.html`: solo se ejecutan los scripts de la app (incluidos en `vendor/`, sin CDNs) y los de Google para el login. El HTML de las notas se sanea al cargarlo, también el que llega de la nube.
- **App de Mac:** el login usa la ventana segura del sistema (`ASWebAuthenticationSession`) con PKCE. La sesión se guarda en el **Llavero de macOS**, no en archivos.
- Al **cerrar sesión** puedes borrar las notas locales, algo recomendable en equipos compartidos.

## Cómo funciona la sincronización

La sincronización es *local-first*: la app guarda siempre en el dispositivo y sube solo las páginas que cambian. Cada página es un documento en `users/{tu-uid}/pages/{id}`, y el orden de la barra lateral está en `users/{tu-uid}/meta/workspace`. Los cambios de otro dispositivo llegan en tiempo real.

Si editas la misma página en dos sitios a la vez, se queda la edición más reciente. Sin conexión puedes seguir trabajando y los cambios se suben al volver. La primera vez que entras en un dispositivo nuevo, la app pregunta si usar las notas de la nube o combinarlas con las locales.

Las imágenes subidas se comprimen en el dispositivo y se guardan como archivos aparte (`users/{tu-uid}/assets`), así que una página nunca supera el límite de tamaño.

**Buscar portadas en Unsplash:** crea una app gratuita en <https://unsplash.com/developers>, copia su *Access Key* en `unsplashAccessKey` de `js/config.js`, recompila y sube. Sin clave se usa Openverse.

## Desarrollo

```bash
python3 -m http.server 5173
```

Abre <http://127.0.0.1:5173>. Para la prueba de sincronización con un Firebase simulado, abre <http://127.0.0.1:5173/tests/sync-test.html>.

```
index.html            página principal (con CSP)
css/styles.css        estilos, tema claro y oscuro
js/config.js          configuración (Firebase, cuentas permitidas, cliente OAuth del Mac)
js/sync.js            sincronización: Firebase Auth (Google) + Firestore
js/store.js           estado y persistencia local
js/editor.js          editor por bloques, columnas, pestañas, menú "/", @menciones, selección
js/blocks.js          tabla, índice, ecuación, embed, marcador, archivo, botón
js/extras.js          login, comentarios, enlaces inversos, recordatorios, plantillas, buscar
js/history.js         deshacer/rehacer e historial de versiones
js/database.js        bases de datos: tabla, tablero, calendario y galería
js/app.js             barra lateral, páginas, búsqueda, papelera, ajustes y cuenta
vendor/               React 18.3.1, htm 3.1.1, KaTeX 0.16.11 y Firebase 10.12.2 (compat)
mac/NotasDeL/main.swift   app nativa (WKWebView + login de Google + Llavero)
mac/build.sh          compila la app universal y genera dist/Notas-de-L.dmg
firestore.rules       reglas de seguridad de la base de datos
```

Arquitectura inspirada en [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy), analizado con REA: tipos de bloque, menú `/`, atajos Markdown, vistas de base de datos y tipos de campo.
