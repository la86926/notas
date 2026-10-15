/* Notas de L — utilidades compartidas (caret, HTML, popovers, emojis, markdown) */
(function () {
  const NC = (window.NC = window.NC || {});
  const { useEffect, useLayoutEffect, useRef, useState } = React;
  const html = (NC.html = htm.bind(React.createElement));

  NC.uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

  NC.escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // <template> no ejecuta scripts ni carga imágenes: seguro para parsear HTML guardado
  const parseFragment = (h) => {
    const t = document.createElement('template');
    t.innerHTML = h || '';
    return t.content;
  };

  NC.htmlToText = (h) => {
    const frag = parseFragment(String(h || '').replace(/<br\s*\/?>/gi, '\n'));
    return frag.textContent || '';
  };

  // Lista blanca del formato inline que produce el editor
  const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'CODE', 'A', 'BR', 'SPAN', 'FONT', 'MARK']);
  const SAFE_URL = /^(https?:|mailto:|#)/i;
  const SAFE_COLOR = /^[#a-z0-9(),.\s%-]{1,40}$/i;
  NC.sanitize = (h) => {
    const frag = parseFragment(h);
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) return;
        if (child.nodeType !== 1) return child.remove();
        walk(child);
        if (!ALLOWED.has(child.tagName)) {
          child.replaceWith(...child.childNodes);
          return;
        }
        const keep = {};
        if (child.tagName === 'A' && SAFE_URL.test(child.getAttribute('href') || '')) keep.href = child.getAttribute('href');
        if (child.tagName === 'FONT' && SAFE_COLOR.test(child.getAttribute('color') || '')) keep.color = child.getAttribute('color');
        // Menciones (@página, @fecha, recordatorios)
        if (child.tagName === 'SPAN' && /(^|\s)mention(\s|$)/.test(child.getAttribute('class') || '')) {
          const pid = child.getAttribute('data-page') || '';
          const date = child.getAttribute('data-date') || '';
          if (/^[a-z0-9]{4,20}$/i.test(pid)) keep['data-page'] = pid;
          if (/^\d{4}-\d{2}-\d{2}$/.test(date)) keep['data-date'] = date;
          if (keep['data-page'] || keep['data-date']) {
            keep.class = 'mention' + (keep['data-date'] ? ' mention-date' : '');
            keep.contenteditable = 'false';
            if (child.getAttribute('data-remind') === '1') keep['data-remind'] = '1';
          }
        }
        const st = child.style;
        const style = [];
        if (st && st.color && SAFE_COLOR.test(st.color)) style.push(`color:${st.color}`);
        if (st && st.backgroundColor && SAFE_COLOR.test(st.backgroundColor)) style.push(`background-color:${st.backgroundColor}`);
        [...child.attributes].forEach((a) => child.removeAttribute(a.name));
        Object.entries(keep).forEach(([k, v]) => child.setAttribute(k, v));
        if (style.length) child.setAttribute('style', style.join(';'));
      });
    };
    walk(frag);
    const div = document.createElement('div');
    div.appendChild(frag);
    return div.innerHTML;
  };

  /* ---------- Caret ---------- */
  NC.getCaretOffset = (el) => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return 0;
    const r = sel.getRangeAt(0);
    if (!el.contains(r.startContainer)) return 0;
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString().length;
  };

  const pointAt = (el, offset) => {
    let rem = offset;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (rem <= n.length) return [n, rem];
      rem -= n.length;
    }
    return null;
  };

  NC.setCaret = (el, offset) => {
    if (!el) return;
    el.focus({ preventScroll: false });
    const sel = window.getSelection();
    const r = document.createRange();
    const p = offset === 'end' || offset == null ? null : pointAt(el, offset);
    if (p) {
      r.setStart(p[0], p[1]);
      r.collapse(true);
    } else {
      r.selectNodeContents(el);
      r.collapse(offset === 0 || offset === 'start');
    }
    sel.removeAllRanges();
    sel.addRange(r);
  };

  NC.selectTextRange = (el, start, end) => {
    const a = pointAt(el, start);
    const b = pointAt(el, end);
    if (!a || !b) return null;
    const r = document.createRange();
    r.setStart(a[0], a[1]);
    r.setEnd(b[0], b[1]);
    return r;
  };

  NC.caretRect = () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const r = sel.getRangeAt(0).cloneRange();
    r.collapse(true);
    const rect = r.getClientRects()[0];
    if (rect) return rect;
    const node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    return node ? node.getBoundingClientRect() : null;
  };

  // ¿El caret está en la primera / última línea visual del elemento?
  NC.caretLines = (el) => {
    const sel = window.getSelection();
    const len = el.textContent.length;
    const off = NC.getCaretOffset(el);
    if (!sel.rangeCount || len === 0) return { first: true, last: true };
    const r = sel.getRangeAt(0).cloneRange();
    r.collapse(true);
    const rect = r.getClientRects()[0];
    if (!rect) return { first: off === 0, last: off === len };
    const er = el.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
    return { first: rect.top - er.top < lh * 0.8, last: er.bottom - rect.bottom < lh * 0.8 };
  };

  NC.isCaretAtStart = (el) => {
    const sel = window.getSelection();
    return sel.rangeCount && sel.isCollapsed && NC.getCaretOffset(el) === 0;
  };
  NC.isCaretAtEnd = (el) => {
    const sel = window.getSelection();
    return sel.rangeCount && sel.isCollapsed && NC.getCaretOffset(el) === el.textContent.length;
  };

  /* ---------- Tiempo ---------- */
  NC.timeAgo = (ts) => {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 45) return 'justo ahora';
    const m = Math.round(s / 60);
    if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    if (d < 30) return `hace ${d} d`;
    return new Date(ts).toLocaleDateString('es-ES');
  };
  NC.todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  NC.formatDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  /* ---------- Colores ---------- */
  NC.COLORS = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
  NC.COLOR_NAMES = {
    default: 'Predeterminado', gray: 'Gris', brown: 'Marrón', orange: 'Naranja', yellow: 'Amarillo',
    green: 'Verde', blue: 'Azul', purple: 'Morado', pink: 'Rosa', red: 'Rojo',
  };
  NC.randomColor = () => NC.COLORS[1 + Math.floor(Math.random() * (NC.COLORS.length - 1))];

  NC.COVERS = [
    'linear-gradient(135deg,#f6d365 0%,#fda085 100%)',
    'linear-gradient(135deg,#a1c4fd 0%,#c2e9fb 100%)',
    'linear-gradient(135deg,#d4fc79 0%,#96e6a1 100%)',
    'linear-gradient(135deg,#fbc2eb 0%,#a6c1ee 100%)',
    'linear-gradient(135deg,#667eea 0%,#764ba2 100%)',
    'linear-gradient(135deg,#ff9a9e 0%,#fecfef 100%)',
    'linear-gradient(135deg,#30cfd0 0%,#330867 100%)',
    'linear-gradient(135deg,#434343 0%,#000000 100%)',
    '#e3e2e0', '#fadec9', '#dbeddb', '#d3e5ef', '#e8deee', '#ffe2dd',
  ];
  NC.coverStyle = (cover) => {
    if (!cover) return null;
    if (/^asset:[a-z0-9]+$/i.test(cover)) return { background: 'var(--bg-hover)' }; // se resuelve en la portada
    if (/^(https?:|data:image\/)/.test(cover)) return { backgroundImage: `url(${JSON.stringify(cover)})` };
    return NC.COVERS.includes(cover) ? { background: cover } : null;
  };

  NC.EMOJIS = (
    '📄 📝 📒 📓 📔 📕 📗 📘 📙 📚 📖 🔖 🏷️ 📌 📍 📎 🗂️ 📁 📂 🗃️ 🗄️ 📊 📈 📉 🗓️ 📅 ⏰ ⌛ ✅ ☑️ ✔️ ❌ ⭐ 🌟 ✨ 💡 🔥 ⚡ 🎯 🚀 🛠️ 🔧 ⚙️ 🧪 🧠 💭 💬 📣 🔔 🔒 🔑 🏠 🏢 🏫 🌍 🗺️ ✈️ 🚗 🍎 🍕 ☕ 🍰 🎉 🎁 🎨 🎵 🎮 🏆 ⚽ 🏃 💪 🧘 ❤️ 💜 💙 💚 💛 🧡 🤍 🖤 😀 😎 🤓 🥳 😴 🤔 🙌 👍 👀 🐶 🐱 🦊 🐼 🐢 🦋 🌱 🌵 🌸 🌻 🍀 🌙 ☀️ 🌈 ❄️ 💼 💰 💳 🧾 🛒 📦 ✏️ 🖊️ 🖥️ 💻 📱 🧩 🔬 🩺 💊 🧭 🏝️'
  ).split(' ');

  /* ---------- Popover genérico (portal + clic fuera + Esc) ---------- */
  NC.Popover = function Popover({ anchor, onClose, children, className = '', align = 'left', offset = 4 }) {
    const ref = useRef(null);
    const [pos, setPos] = useState({ top: -9999, left: -9999 });
    useLayoutEffect(() => {
      if (!anchor || !ref.current) return;
      const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
      const pw = ref.current.offsetWidth;
      const ph = ref.current.offsetHeight;
      let left = align === 'right' ? r.right - pw : r.left;
      let top = r.bottom + offset;
      if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - offset);
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
      setPos({ top, left });
    }, [anchor]);
    useEffect(() => {
      const down = (e) => {
        if (ref.current && !ref.current.contains(e.target)) onClose && onClose();
      };
      const key = (e) => e.key === 'Escape' && onClose && onClose();
      const t = setTimeout(() => document.addEventListener('mousedown', down), 0);
      document.addEventListener('keydown', key);
      return () => {
        clearTimeout(t);
        document.removeEventListener('mousedown', down);
        document.removeEventListener('keydown', key);
      };
    }, [onClose]);
    return ReactDOM.createPortal(
      html`<div ref=${ref} className=${'popover ' + className} style=${{ top: pos.top, left: pos.left }}>${children}</div>`,
      document.body
    );
  };

  NC.Modal = function Modal({ onClose, children, className = '' }) {
    useEffect(() => {
      const key = (e) => e.key === 'Escape' && onClose();
      document.addEventListener('keydown', key);
      return () => document.removeEventListener('keydown', key);
    }, [onClose]);
    return ReactDOM.createPortal(
      html`<div className="modal-overlay" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
        <div className=${'modal ' + className}>${children}</div>
      </div>`,
      document.body
    );
  };

  NC.EmojiPicker = function EmojiPicker({ anchor, onPick, onClose }) {
    return html`<${NC.Popover} anchor=${anchor} onClose=${onClose} className="emoji-picker">
      <div className="emoji-head">
        <button className="btn-ghost" onClick=${() => onPick(NC.EMOJIS[Math.floor(Math.random() * NC.EMOJIS.length)])}>🎲 Aleatorio</button>
        <button className="btn-ghost" onClick=${() => onPick(null)}>Quitar</button>
      </div>
      <div className="emoji-grid">
        ${NC.EMOJIS.map((e) => html`<button key=${e} className="emoji-btn" onClick=${() => onPick(e)}>${e}</button>`)}
      </div>
    <//>`;
  };

  /* ---------- Toasts ---------- */
  let toastTimer;
  NC.toast = (msg) => {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  };

  NC.download = (filename, content, type = 'text/markdown') => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  /* ---------- Markdown ---------- */
  NC.htmlToMd = (h) => {
    const frag = parseFragment(h);
    const conv = (node) =>
      [...node.childNodes]
        .map((n) => {
          if (n.nodeType === 3) return n.textContent;
          if (n.nodeType !== 1) return '';
          const inner = conv(n);
          switch (n.tagName) {
            case 'B': case 'STRONG': return inner ? `**${inner}**` : '';
            case 'I': case 'EM': return inner ? `*${inner}*` : '';
            case 'S': case 'STRIKE': return inner ? `~~${inner}~~` : '';
            case 'CODE': return inner ? '`' + inner + '`' : '';
            case 'A': return `[${inner}](${n.getAttribute('href') || ''})`;
            case 'BR': return '\n';
            default: return inner;
          }
        })
        .join('');
    return conv(frag);
  };

  const inlineMd = (s) =>
    NC.escapeHtml(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
      .replace(/~~([^~]+)~~/g, '<s>$1</s>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');

  // Convierte texto markdown en bloques (para pegar e importar)
  NC.markdownToBlocks = (text) => {
    const lines = String(text).replace(/\r/g, '').split('\n');
    const blocks = [];
    let code = null;
    for (const raw of lines) {
      if (code) {
        if (/^\s*```/.test(raw)) { blocks.push(code); code = null; } else code.text += (code.text ? '\n' : '') + raw;
        continue;
      }
      const m0 = raw.match(/^(\s*)(.*)$/);
      const indent = Math.min(6, Math.floor(m0[1].replace(/\t/g, '  ').length / 2));
      const line = m0[2];
      let m;
      const b = (type, body, extra = {}) => blocks.push({ id: NC.uid(), type, html: inlineMd(body), indent, ...extra });
      if (/^```/.test(line)) code = { id: NC.uid(), type: 'code', text: '', html: '', indent, lang: line.slice(3).trim() };
      else if ((m = line.match(/^(#{1,3})\s+(.*)$/))) b('h' + m[1].length, m[2]);
      else if ((m = line.match(/^[-*+]\s+\[( |x|X)\]\s*(.*)$/))) b('todo', m[2], { checked: m[1] !== ' ' });
      else if ((m = line.match(/^[-*+]\s+(.*)$/))) b('bulleted', m[1]);
      else if ((m = line.match(/^\d+[.)]\s+(.*)$/))) b('numbered', m[1]);
      else if ((m = line.match(/^>\s?(.*)$/))) b('quote', m[1]);
      else if (/^(-{3,}|\*{3,})$/.test(line.trim())) blocks.push({ id: NC.uid(), type: 'divider', html: '', indent });
      else if ((m = line.match(/^!\[[^\]]*\]\((https?:[^)\s]+)\)$/))) blocks.push({ id: NC.uid(), type: 'image', html: '', url: m[1], indent });
      else b('paragraph', line);
    }
    if (code) blocks.push(code);
    return blocks;
  };
})();
