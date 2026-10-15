/* Notas de L — integración con Google Calendar (solo lectura).
 * Web: Google Identity Services pide un token de acceso con el permiso calendar.readonly.
 * Mac: la app nativa amplía su autorización OAuth y renueva el token con el Llavero.
 * La vista «Calendario» combina eventos de Google, fechas de las bases de datos y recordatorios. */
(function () {
  const NC = window.NC;
  const { html } = NC;
  const A = NC.actions;
  const D = NC.dbx;
  const { useState, useEffect } = React;
  const CFG = window.NOTAS_CONFIG || {};
  const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
  const KEY = 'notioncito:gcal';
  const native = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.notas;

  const prefs = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const savePrefs = (p) => { try { localStorage.setItem(KEY, JSON.stringify({ ...prefs(), ...p })); } catch (e) { /* */ } };

  let token = null;
  let expires = 0;
  try { const t = JSON.parse(sessionStorage.getItem(KEY + ':t')); if (t && t.expires > Date.now()) { token = t.token; expires = t.expires; } } catch (e) { /* */ }
  let pendingNative = null;
  const listeners = new Set();
  let version = 0;
  const bump = () => { version++; listeners.forEach((l) => l()); };

  /* ---------- Tokens ---------- */
  function nativeToken(type) {
    return new Promise((resolve, reject) => {
      pendingNative = { resolve, reject };
      native.postMessage({ type, clientId: CFG.desktopGoogleClientId });
    });
  }
  let gisPromise = null;
  const loadGis = () => (gisPromise = gisPromise || new Promise((res, rej) => {
    if (window.google && google.accounts && google.accounts.oauth2) return res();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => res();
    s.onerror = () => rej(new Error('No se pudo cargar Google Identity Services'));
    document.head.appendChild(s);
  }));
  async function webToken(interactive) {
    if (!CFG.googleWebClientId) throw new Error('Falta googleWebClientId en js/config.js');
    await loadGis();
    return new Promise((resolve, reject) => {
      const user = NC.sync && NC.sync.status && NC.sync.status.user;
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CFG.googleWebClientId,
        scope: SCOPE,
        login_hint: user ? user.email : undefined,
        callback: (r) => (r.error ? reject(new Error(r.error_description || r.error)) : resolve({ accessToken: r.access_token, expiresIn: r.expires_in })),
        error_callback: (e) => reject(new Error(e.message || e.type || 'Cancelado')),
      });
      client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });
  }
  async function getToken(interactive = false) {
    if (token && Date.now() < expires - 60e3) return token;
    let r;
    if (native) r = await nativeToken(interactive ? 'googleCalendarAuth' : 'googleAccessToken');
    else r = await webToken(interactive);
    if (!r.accessToken) throw new Error('Google no devolvió acceso');
    if (native && r.scope && !r.scope.includes('calendar')) throw new Error('needs-consent');
    token = r.accessToken;
    expires = Date.now() + (r.expiresIn || 3000) * 1000;
    try { sessionStorage.setItem(KEY + ':t', JSON.stringify({ token, expires })); } catch (e) { /* */ }
    return token;
  }

  async function api(path, params = {}) {
    const t = await getToken(false);
    const q = new URLSearchParams(params).toString();
    const r = await fetch('https://www.googleapis.com/calendar/v3' + path + (q ? '?' + q : ''), { headers: { Authorization: 'Bearer ' + t } });
    if (r.status === 401) { token = null; throw new Error('needs-consent'); }
    if (!r.ok) throw new Error('Google Calendar respondió ' + r.status);
    return r.json();
  }

  const G = (NC.gcal = {
    _nativeResult: (res) => {
      const p = pendingNative;
      pendingNative = null;
      if (!p) return;
      if (res && res.accessToken) p.resolve(res);
      else p.reject(new Error((res && res.error) || 'cancelado'));
    },
    connected: () => !!prefs().connected,
    async connect() {
      await getToken(true);
      savePrefs({ connected: true });
      bump();
    },
    disconnect() {
      if (token && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(token, () => {});
      token = null;
      savePrefs({ connected: false });
      bump();
    },
    async calendars() {
      const d = await api('/users/me/calendarList', { minAccessRole: 'reader' });
      return d.items || [];
    },
    async events(cals, from, to) {
      const out = [];
      await Promise.all(cals.map(async (c) => {
        const d = await api('/calendars/' + encodeURIComponent(c.id) + '/events', { timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
        (d.items || []).forEach((e) => {
          if (e.status === 'cancelled') return;
          const allDay = !!(e.start && e.start.date);
          const start = allDay ? D.toDate(e.start.date) : new Date(e.start.dateTime);
          let end = allDay ? D.toDate(e.end.date) : new Date(e.end.dateTime);
          if (allDay) end = new Date(end.getTime() - 864e5);
          out.push({ id: c.id + ':' + e.id, title: e.summary || '(Sin título)', start, end, allDay, color: e.backgroundColor || c.backgroundColor || '#4285f4', link: e.htmlLink, location: e.location, calendar: c.summary, meet: e.hangoutLink });
        });
      }));
      return out.sort((a, b) => a.start - b.start);
    },
  });
  NC.useGcal = () => { React.useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => version); return G; };

  /* ---------- Fechas de las bases de datos y recordatorios ---------- */
  function noteItems(from, to) {
    const s = NC.getState();
    const out = [];
    Object.values(s.pages).forEach((dbp) => {
      if (!dbp.db || A.isInTrash(dbp.id)) return;
      const dateProps = dbp.db.props.filter((p) => p.type === 'date');
      if (!dateProps.length) return;
      D.rowsOf(dbp.db).forEach((r) => dateProps.forEach((p) => {
        const d = D.toDate(r.values && r.values[p.id]);
        if (d && d >= from && d <= to) out.push({ id: r.id + p.id, title: r.title || 'Sin título', start: d, end: d, allDay: true, rowId: r.id, db: dbp, icon: NC.iconText(r.icon, NC.iconText(dbp.icon, '🗃️')), prop: p.name });
      }));
    });
    (NC.allReminders ? NC.allReminders() : []).forEach((rm) => {
      const d = D.toDate(rm.date);
      if (d && d >= from && d <= to) out.push({ id: 'r' + rm.key, title: rm.text.slice(0, 60) || rm.page.title, start: d, end: d, allDay: true, rowId: rm.page.id, reminder: true, icon: '⏰' });
    });
    return out;
  }

  /* ---------- Vista Calendario ---------- */
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const hhmm = (d) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const ymd = (d) => D.iso(d).replace(/-/g, '');

  NC.CalendarHome = function CalendarHome() {
    NC.useStore();
    const g = NC.useGcal();
    const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
    const [cals, setCals] = useState(null);
    const [events, setEvents] = useState([]);
    const [err, setErr] = useState(null);
    const [busy, setBusy] = useState(false);
    const [calMenu, setCalMenu] = useState(null);
    const [showNotes, setShowNotes] = useState(prefs().showNotes !== false);
    const hidden = prefs().hiddenCals || [];

    const start = new Date(month);
    start.setDate(1 - ((month.getDay() + 6) % 7));
    const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    const end = new Date(days[41]); end.setHours(23, 59, 59);

    const load = async () => {
      if (!g.connected()) return;
      setBusy(true); setErr(null);
      try {
        const list = cals || (await g.calendars());
        if (!cals) setCals(list);
        setEvents(await g.events(list.filter((c) => !hidden.includes(c.id)), start, end));
      } catch (e) {
        setErr(e.message === 'needs-consent' ? 'needs-consent' : e.message);
      }
      setBusy(false);
    };
    useEffect(() => { load(); }, [month.getTime(), g.connected(), cals && cals.length, hidden.join(',')]);

    const connect = async () => { setBusy(true); try { await g.connect(); setErr(null); setCals(null); } catch (e) { setErr(e.message); } setBusy(false); };
    const notes = showNotes ? noteItems(start, end) : [];
    const all = [...events, ...notes];
    const onDay = (d) => all.filter((e) => d >= new Date(e.start.getFullYear(), e.start.getMonth(), e.start.getDate()) && d <= e.end);
    const today = new Date();
    const agenda = all.filter((e) => e.end >= new Date(today.getFullYear(), today.getMonth(), today.getDate())).slice(0, 25);
    const open = (e) => (e.link ? window.open(e.link, '_blank', 'noopener') : e.rowId && A.setUI({ peek: e.rowId }));
    const newEvent = (d) => window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&dates=${ymd(d)}/${ymd(new Date(d.getTime() + 864e5))}`, '_blank', 'noopener');
    const chip = (e) => html`<div key=${e.id} className=${'gc-item' + (e.link ? ' g' : ' n')} title=${e.title + (e.calendar ? ' · ' + e.calendar : '') + (e.prop ? ' · ' + e.prop : '')}
      style=${e.link ? { '--gc': e.color } : {}} onClick=${(ev) => { ev.stopPropagation(); open(e); }}>
      ${e.link ? html`<span className="gc-dot"></span>${!e.allDay && html`<span className="gc-time">${hhmm(e.start)}</span>`}` : html`<span>${e.icon}</span>`} ${e.title}</div>`;

    return html`<div className="gcal-page">
      <div className="gcal-head">
        <h1>📆 Calendario</h1>
        <span className="grow"></span>
        ${g.connected() && cals && html`<button className="tool-btn" onClick=${(e) => setCalMenu(e.currentTarget)}>Calendarios ▾</button>`}
        <label className="tool-btn"><input type="checkbox" checked=${showNotes} onChange=${() => { savePrefs({ showNotes: !showNotes }); setShowNotes(!showNotes); }} /> Fechas de mis notas</label>
        ${g.connected() && html`<button className="tool-btn" onClick=${load} disabled=${busy}>${busy ? 'Cargando…' : '⟳'}</button>`}
      </div>
      ${!g.connected() && html`<div className="gcal-connect">
        <div><b>Conecta tu Google Calendar</b><div className="muted small">Verás tus eventos junto a las fechas de tus bases de datos y recordatorios. Solo lectura: Notas de L no modifica tu calendario.</div></div>
        <button className="btn-primary" disabled=${busy} onClick=${connect}>${busy ? 'Conectando…' : 'Conectar Google Calendar'}</button>
      </div>`}
      ${err && html`<div className="gcal-error">${err === 'needs-consent'
        ? html`Hace falta volver a dar permiso para leer el calendario. <button className="btn-primary small" onClick=${connect}>Dar permiso</button>`
        : '⚠ ' + err}</div>`}
      <div className="gcal-body">
        <div className="gcal-month">
          <div className="cal-head">
            <h3>${MONTHS[month.getMonth()]} ${month.getFullYear()}</h3><span className="grow"></span>
            <button className="btn-ghost" onClick=${() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
            <button className="btn-ghost" onClick=${() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Hoy</button>
            <button className="btn-ghost" onClick=${() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
          </div>
          <div className="cal-grid">
            ${['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((d) => html`<div key=${d} className="cal-dow">${d}</div>`)}
            ${days.map((d) => {
              const items = onDay(d);
              return html`<div key=${D.iso(d)} className=${'cal-day' + (d.getMonth() !== month.getMonth() ? ' other' : '') + (sameDay(d, today) ? ' today' : '')}>
                <div className="cal-num"><span>${d.getDate()}</span>${g.connected() && html`<button className="mini cal-add" title="Nuevo evento en Google Calendar" onClick=${() => newEvent(d)}>+</button>`}</div>
                ${items.slice(0, 4).map(chip)}
                ${items.length > 4 && html`<div className="muted small">+${items.length - 4} más</div>`}
              </div>`;
            })}
          </div>
        </div>
        <aside className="gcal-agenda">
          <div className="menu-label">Próximos</div>
          ${!agenda.length && html`<div className="muted small pad">Nada próximo.</div>`}
          ${agenda.map((e) => html`<div key=${e.id} className="agenda-item" onClick=${() => open(e)}>
            <div className="agenda-date">${e.start.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}${!e.allDay ? ' · ' + hhmm(e.start) : ''}</div>
            <div className="agenda-title">${e.link ? html`<span className="gc-dot" style=${{ '--gc': e.color }}></span>` : e.icon + ' '}${e.title}</div>
            ${e.location && html`<div className="muted small">📍 ${e.location}</div>`}
            ${e.meet && html`<a className="small" href=${e.meet} target="_blank" rel="noopener" onClick=${(ev) => ev.stopPropagation()}>🎥 Unirse a la videollamada</a>`}
          </div>`)}
          ${g.connected() && html`<button className="btn-ghost small danger" onClick=${() => confirm('¿Desconectar Google Calendar?') && g.disconnect()}>Desconectar Google Calendar</button>`}
        </aside>
      </div>
      ${calMenu && cals && html`<${NC.Popover} anchor=${calMenu} onClose=${() => setCalMenu(null)} className="menu" align="right">
        <div className="menu-label">Mostrar calendarios</div>
        ${cals.map((c) => html`<label key=${c.id} className="menu-item toggle-row"><span className="gc-dot" style=${{ '--gc': c.backgroundColor }}></span> ${c.summaryOverride || c.summary}
          <input type="checkbox" checked=${!hidden.includes(c.id)} onChange=${() => { savePrefs({ hiddenCals: hidden.includes(c.id) ? hidden.filter((x) => x !== c.id) : [...hidden, c.id] }); load(); setCalMenu(null); }} /></label>`)}
      <//>`}
    </div>`;
  };
})();
