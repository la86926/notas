/* Notas de L — selectores de portada e icono al estilo de Notion.
 * Portada: Galería (colores, degradados y fotos de Unsplash), Subir, Enlace y búsqueda en Unsplash
 * (con clave de API) u Openverse (fotos libres, sin clave). Icono: emojis con buscador en español,
 * recientes, subir imagen o enlace. */
(function () {
  const NC = window.NC;
  const { html } = NC;
  const A = NC.actions;
  const { useState, useEffect, useRef } = React;
  const CFG = window.NOTAS_CONFIG || {};

  /* ---------- Galería de portadas (fotos de Unsplash, con crédito al autor) ---------- */
  const U = (id, name, user) => ({ url: `https://images.unsplash.com/${id}?auto=format&fit=crop&w=2000&q=80`, thumb: `https://images.unsplash.com/${id}?auto=format&fit=crop&w=320&h=120&q=60`, credit: { name, url: `https://unsplash.com/@${user}?utm_source=notas_de_l&utm_medium=referral` } });
  NC.UNSPLASH_GALLERY = [
    ['Naturaleza', [
      U('photo-1465056836041-7f43ac27dcb5', 'Tobias Keller', 'tokeller'), U('photo-1500964757637-c85e8a162699', 'simon', 'simon_berger'),
      U('photo-1604223190546-a43e4c7f29d7', 'Sven Pieren', 'sven_pieren'), U('photo-1612441804231-77a36b284856', 'Simon Lohmann', 'slohmann'),
      U('photo-1760301269447-fbc82b5a8d14', 'Gantavya Bhatt', 'gbhatt_2'), U('photo-1507525428034-b723cf961d3e', 'Sean Oulashin', 'oulashin'),
      U('photo-1471922694854-ff1b63b20054', 'frank mckenna', 'frankiefoto'), U('photo-1585130401366-fe05a8d813c4', 'Jessica Pamp', 'yessijes'),
    ]],
    ['Espacio', [
      U('photo-1464802686167-b939a6910659', 'Jeremy Thomas', 'jeremythomasphoto'), U('photo-1444703686981-a3abbc4d4fe3', 'Greg Rakozy', 'grakozy'),
      U('photo-1538370965046-79c0d6907d47', 'Graham Holtshausen', 'freedomstudios'), U('photo-1651746605872-66fec1defdb5', 'Pawel Czerwinski', 'pawel_czerwinski'),
    ]],
    ['Abstracto', [
      U('photo-1623150502742-6a849aa94be4', 'Milad Fakurian', 'fakurian'), U('photo-1624359136353-f60129a367b9', 'Milad Fakurian', 'fakurian'),
      U('photo-1690127137880-1ad0871a83bd', 'yared lopez', 'aysl'),
    ]],
    ['Ciudad y trabajo', [
      U('photo-1599939571322-792a326991f2', 'Thula Na', 'thula25'), U('photo-1664353655151-9d94a9170eb0', 'Diane Picchiottino', 'diane_soko'),
      U('photo-1500632907344-a073709b2448', 'Kai Pilger', 'kaip'), U('photo-1499750310107-5fef28a66643', 'Andrew Neel', 'andrewtneel'),
      U('photo-1487017159836-4e23ece2e4cf', 'Luca Bravo', 'lucabravo'), U('photo-1505330622279-bf7d7fc918f4', 'Arnel Hasanovic', 'arnelhasanovic'),
      U('photo-1589362281138-e3f7ebe47f1a', 'Minh Pham', 'minhphamdesign'),
    ]],
  ];
  NC.randomCover = () => {
    const all = NC.UNSPLASH_GALLERY.flatMap(([, l]) => l);
    return all[Math.floor(Math.random() * all.length)];
  };

  const setCover = (page, url, credit = null) => A.updatePage(page.id, { cover: url, coverCredit: credit, coverY: 50 });

  function UploadZone({ onFile, label, accept = 'image/*' }) {
    const ref = useRef(null);
    const [over, setOver] = useState(false);
    const [busy, setBusy] = useState(false);
    const handle = async (f) => {
      if (!f) return;
      setBusy(true);
      try { await onFile(f); } catch (e) { NC.toast(e.message); }
      setBusy(false);
    };
    return html`<div className=${'upload-zone' + (over ? ' over' : '')}
      onDragOver=${(e) => { e.preventDefault(); setOver(true); }} onDragLeave=${() => setOver(false)}
      onDrop=${(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files[0]); }}>
      <button className="btn-primary" disabled=${busy} onClick=${() => ref.current.click()}>${busy ? 'Optimizando…' : label}</button>
      <div className="muted small">o arrastra una imagen aquí. Se optimiza automáticamente para que se sincronice.</div>
      <input type="file" accept=${accept} hidden ref=${ref} onChange=${(e) => { handle(e.target.files[0]); e.target.value = ''; }} />
    </div>`;
  }

  function LinkForm({ placeholder, onSubmit }) {
    const [v, setV] = useState('');
    return html`<form className="link-form" onSubmit=${(e) => {
      e.preventDefault();
      const u = v.trim();
      if (!/^https?:\/\/\S+$/.test(u)) return NC.toast('Pega un enlace http(s) a una imagen');
      onSubmit(u);
    }}>
      <input autoFocus className="menu-input" placeholder=${placeholder} value=${v} onInput=${(e) => setV(e.target.value)} />
      <button className="btn-primary" type="submit">Enviar</button>
      <div className="muted small">Funciona con cualquier imagen de la web.</div>
    </form>`;
  }

  /* ---------- Búsqueda de fotos: Unsplash (con clave) u Openverse (libre) ---------- */
  async function searchPhotos(q, page = 1) {
    if (CFG.unsplashAccessKey) {
      const r = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=24&page=${page}&orientation=landscape&content_filter=high`, {
        headers: { Authorization: 'Client-ID ' + CFG.unsplashAccessKey, 'Accept-Version': 'v1' },
      });
      if (!r.ok) throw new Error('Unsplash respondió ' + r.status);
      const d = await r.json();
      return (d.results || []).map((p) => ({
        id: p.id, thumb: p.urls.small, url: p.urls.raw + '&auto=format&fit=crop&w=2000&q=80', alt: p.alt_description,
        credit: { name: p.user.name, url: p.user.links.html + '?utm_source=notas_de_l&utm_medium=referral' },
        track: p.links.download_location,
      }));
    }
    const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=24&page=${page}&aspect_ratio=wide&mature=false`);
    if (!r.ok) throw new Error('El buscador respondió ' + r.status);
    const d = await r.json();
    return (d.results || []).filter((p) => /^https:/.test(p.url)).map((p) => ({
      id: p.id, thumb: p.thumbnail, url: p.url, alt: p.title,
      credit: { name: (p.creator || 'Autor desconocido') + (p.license ? ' · CC ' + p.license.toUpperCase() : ''), url: p.foreign_landing_url || p.creator_url || p.url },
    }));
  }

  function PhotoSearch({ onPick }) {
    const [q, setQ] = useState('');
    const [res, setRes] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const run = async (e) => {
      e && e.preventDefault();
      if (!q.trim()) return;
      setBusy(true); setErr(null);
      try { setRes(await searchPhotos(q.trim())); } catch (er) { setErr(er.message); }
      setBusy(false);
    };
    const pick = (p) => {
      if (p.track && CFG.unsplashAccessKey) fetch(p.track, { headers: { Authorization: 'Client-ID ' + CFG.unsplashAccessKey } }).catch(() => {});
      onPick(p.url, p.credit);
    };
    return html`<div className="photo-search">
      <form className="link-form" onSubmit=${run}>
        <input autoFocus className="menu-input" placeholder=${CFG.unsplashAccessKey ? 'Busca imágenes en Unsplash…' : 'Busca fotos libres…'} value=${q} onInput=${(e) => setQ(e.target.value)} />
        <button className="btn-primary" type="submit" disabled=${busy}>${busy ? '…' : 'Buscar'}</button>
      </form>
      ${!CFG.unsplashAccessKey && html`<div className="muted small">Buscando en Openverse (fotos con licencia libre). Para buscar en Unsplash añade <code>unsplashAccessKey</code> en js/config.js.</div>`}
      ${err && html`<div className="danger small">${err}</div>`}
      ${res && !res.length && html`<div className="muted small pad">Sin resultados.</div>`}
      ${res && html`<div className="photo-grid">${res.map((p) => html`<button key=${p.id} className="photo-thumb" title=${(p.alt || '') + ' — ' + p.credit.name} onClick=${() => pick(p)}>
        <img src=${p.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /><span>${p.credit.name}</span></button>`)}</div>`}
    </div>`;
  }

  /* ---------- Selector de portada ---------- */
  NC.CoverPicker = function CoverPicker({ page, anchor, onClose }) {
    const [tab, setTab] = useState('gallery');
    const done = (url, credit) => { setCover(page, url, credit); onClose(); };
    const upload = async (f) => done(await NC.assets.put(await NC.compressImage(f, { maxW: 2400, maxH: 1400, target: 650 * 1024 })));
    const TABS = [['gallery', 'Galería'], ['upload', 'Subir'], ['link', 'Enlace'], ['unsplash', CFG.unsplashAccessKey ? 'Unsplash' : 'Buscar fotos']];
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="media-picker cover-picker" align="right">
      <div className="mp-tabs">
        ${TABS.map(([k, l]) => html`<button key=${k} className=${'mp-tab' + (tab === k ? ' active' : '')} onClick=${() => setTab(k)}>${l}</button>`)}
        <span className="grow"></span>
        ${page.cover && html`<button className="mp-tab" onClick=${() => { A.updatePage(page.id, { cover: null, coverCredit: null }); onClose(); }}>Quitar</button>`}
      </div>
      <div className="mp-body">
        ${tab === 'gallery' && html`
          <div className="menu-label">Colores y degradados</div>
          <div className="cover-grid">${NC.COVERS.map((c) => html`<button key=${c} style=${{ background: c }} onClick=${() => done(c)}></button>`)}</div>
          ${NC.UNSPLASH_GALLERY.map(([title, list]) => html`<${React.Fragment} key=${title}>
            <div className="menu-label">${title} <span className="muted">· Unsplash</span></div>
            <div className="cover-grid">${list.map((p) => html`<button key=${p.url} title=${'Foto de ' + p.credit.name} style=${{ backgroundImage: `url(${JSON.stringify(p.thumb)})` }} onClick=${() => done(p.url, p.credit)}></button>`)}</div>
          <//>`)}`}
        ${tab === 'upload' && html`<${UploadZone} label="Subir archivo" onFile=${upload} />
          <div className="muted small">Recomendado: imágenes de más de 1500 px de ancho.</div>`}
        ${tab === 'link' && html`<${LinkForm} placeholder="Pega el enlace de una imagen…" onSubmit=${(u) => done(u)} />`}
        ${tab === 'unsplash' && html`<${PhotoSearch} onPick=${done} />`}
      </div>
    <//>`;
  };

  /* ---------- Emojis con buscador en español ---------- */
  let emojiData = null;
  let emojiPromise = null;
  NC.loadEmojis = () => (emojiPromise = emojiPromise || fetch('vendor/emoji-es.min.json').then((r) => r.json()).then((d) => (emojiData = d)).catch(() => (emojiData = NC.EMOJIS.map((e) => [e, '', '', 6]))));
  NC.searchEmoji = (q, n = 60) => {
    if (!emojiData) { NC.loadEmojis(); return []; }
    const k = NC.normalizeStr ? NC.normalizeStr(q.trim()) : q.trim().toLowerCase();
    if (!k) return emojiData.slice(0, n);
    const norm = (s) => (NC.normalizeStr ? NC.normalizeStr(s) : s.toLowerCase());
    const starts = [], has = [];
    for (const e of emojiData) {
      const label = norm(e[1]);
      if (label.startsWith(k)) starts.push(e);
      else if (label.includes(k) || norm(e[2]).includes(k)) has.push(e);
      if (starts.length >= n) break;
    }
    return starts.concat(has).slice(0, n);
  };
  const GROUPS = [[0, 'Caras y emociones', '😀'], [1, 'Personas', '👋'], [3, 'Animales y naturaleza', '🐻'], [4, 'Comida y bebida', '🍔'], [5, 'Viajes y lugares', '✈️'], [6, 'Actividades', '⚽'], [7, 'Objetos', '💡'], [8, 'Símbolos', '❤️'], [9, 'Banderas', '🏳️']];
  const RECENT_KEY = 'notioncito:recentEmoji';
  const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; } };
  const pushRecent = (e) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...recent().filter((x) => x !== e)].slice(0, 24))); } catch (er) { /* */ } };

  function EmojiTab({ onPick }) {
    const [q, setQ] = useState('');
    const [, force] = useState(0);
    const bodyRef = useRef(null);
    useEffect(() => { NC.loadEmojis().then(() => force((x) => x + 1)); }, []);
    const pick = (e) => { pushRecent(e); onPick(e); };
    const random = () => { const all = emojiData || NC.EMOJIS.map((e) => [e]); pick(all[Math.floor(Math.random() * all.length)][0]); };
    const rec = recent();
    return html`<div className="emoji-tab">
      <div className="emoji-search-row">
        <input autoFocus className="menu-input" placeholder="Filtrar…" value=${q} onInput=${(e) => setQ(e.target.value)} />
        <button className="mini" title="Aleatorio" onClick=${random}>🎲</button>
      </div>
      ${!q && html`<div className="emoji-cats">${GROUPS.map(([g, , icon]) => html`<button key=${g} className="mini" title=${GROUPS.find((x) => x[0] === g)[1]}
        onClick=${() => { const el = bodyRef.current && bodyRef.current.querySelector('[data-g="' + g + '"]'); el && el.scrollIntoView({ block: 'start' }); }}>${icon}</button>`)}</div>`}
      <div className="emoji-body" ref=${bodyRef}>
        ${!emojiData && html`<div className="muted small pad">Cargando emojis…</div>`}
        ${emojiData && q && html`<div className="emoji-grid">${NC.searchEmoji(q, 200).map((e) => html`<button key=${e[0]} className="emoji-btn" title=${e[1]} onClick=${() => pick(e[0])}>${e[0]}</button>`)}</div>`}
        ${emojiData && !q && html`
          ${rec.length > 0 && html`<div className="menu-label">Recientes</div><div className="emoji-grid">${rec.map((e) => html`<button key=${'r' + e} className="emoji-btn" onClick=${() => pick(e)}>${e}</button>`)}</div>`}
          ${GROUPS.map(([g, label]) => html`<${React.Fragment} key=${g}>
            <div className="menu-label" data-g=${g}>${label}</div>
            <div className="emoji-grid">${emojiData.filter((e) => e[3] === g).map((e) => html`<button key=${e[0]} className="emoji-btn" title=${e[1]} onClick=${() => pick(e[0])}>${e[0]}</button>`)}</div>
          <//>`)}`}
      </div>
    </div>`;
  }

  /* ---------- Selector de icono (página o destacado) ---------- */
  NC.IconPicker = function IconPicker({ anchor, onPick, onClose, allowImage = true, current }) {
    const [tab, setTab] = useState('emoji');
    const upload = async (f) => onPick(await NC.assets.put(await NC.compressImage(f, { maxW: 280, maxH: 280, target: 120 * 1024 })));
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="media-picker icon-picker">
      <div className="mp-tabs">
        <button className=${'mp-tab' + (tab === 'emoji' ? ' active' : '')} onClick=${() => setTab('emoji')}>Emoji</button>
        ${allowImage && html`<button className=${'mp-tab' + (tab === 'upload' ? ' active' : '')} onClick=${() => setTab('upload')}>Subir</button>`}
        ${allowImage && html`<button className=${'mp-tab' + (tab === 'link' ? ' active' : '')} onClick=${() => setTab('link')}>Enlace</button>`}
        <span className="grow"></span>
        ${current && html`<button className="mp-tab" onClick=${() => onPick(null)}>Quitar</button>`}
      </div>
      <div className="mp-body">
        ${tab === 'emoji' && html`<${EmojiTab} onPick=${onPick} />`}
        ${tab === 'upload' && html`<${UploadZone} label="Subir una imagen" onFile=${upload} />
          <div className="muted small">Recomendado: imagen cuadrada de 280 × 280 px.</div>`}
        ${tab === 'link' && html`<${LinkForm} placeholder="Pega el enlace de una imagen…" onSubmit=${(u) => onPick(u)} />`}
      </div>
    <//>`;
  };
  // Compatibilidad: el antiguo selector de emojis usa ahora el nuevo
  NC.EmojiPicker = (props) => html`<${NC.IconPicker} ...${props} allowImage=${false} />`;
})();
