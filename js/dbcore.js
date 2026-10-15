/* Notas de L — motor de bases de datos: tipos de propiedad, fórmulas (lenguaje tipo Notion),
 * relaciones, rollups, filtros, ordenación, agrupación y cálculos. Sin eval: las fórmulas se
 * analizan con un parser propio y solo pueden llamar a las funciones de esta lista. */
(function () {
  const NC = window.NC;

  NC.PROP_TYPES = [
    { type: 'text', label: 'Texto', icon: '≡' },
    { type: 'number', label: 'Número', icon: '#' },
    { type: 'select', label: 'Selección', icon: '◉' },
    { type: 'multi', label: 'Selección múltiple', icon: '☰' },
    { type: 'status', label: 'Estado', icon: '◐' },
    { type: 'date', label: 'Fecha', icon: '📅' },
    { type: 'checkbox', label: 'Casilla', icon: '☑' },
    { type: 'url', label: 'URL', icon: '🔗' },
    { type: 'email', label: 'Correo', icon: '@' },
    { type: 'phone', label: 'Teléfono', icon: '☎' },
    { type: 'files', label: 'Archivos y medios', icon: '📎' },
    { type: 'relation', label: 'Relación', icon: '↗' },
    { type: 'rollup', label: 'Rollup', icon: '∑' },
    { type: 'formula', label: 'Fórmula', icon: 'ƒ' },
    { type: 'created', label: 'Fecha de creación', icon: '🕒' },
    { type: 'edited', label: 'Última edición', icon: '🕘' },
    { type: 'uid', label: 'ID', icon: '№' },
  ];
  NC.propTypeInfo = (t) => NC.PROP_TYPES.find((p) => p.type === t) || NC.PROP_TYPES[0];
  const READONLY = ['formula', 'rollup', 'created', 'edited', 'uid'];
  NC.isReadonlyProp = (p) => READONLY.includes(p.type);

  const D = (NC.dbx = {});
  const pages = () => NC.getState().pages;
  const optionOf = (prop, id) => (prop.options || []).find((o) => o.id === id);
  D.optionOf = optionOf;
  D.rowsOf = (db) => db.rows.map((id) => pages()[id]).filter((r) => r && !r.trashed);
  D.findDb = (dbId) => { const p = pages()[dbId]; return p && p.db ? p : null; };

  /* ---------- Fechas ---------- */
  const toDate = (v) => {
    if (v instanceof Date) return v;
    if (typeof v === 'number') return new Date(v);
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) { const [y, m, d] = v.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
    return null;
  };
  D.toDate = toDate;
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  D.iso = iso;
  const fmtDate = (d, pattern) => {
    if (!d) return '';
    if (!pattern) return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    const p2 = (n) => String(n).padStart(2, '0');
    const M = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return pattern.replace(/YYYY|MMMM|MM|DD|HH|mm|D|M/g, (t) => ({ YYYY: d.getFullYear(), MMMM: M[d.getMonth()], MM: p2(d.getMonth() + 1), DD: p2(d.getDate()), HH: p2(d.getHours()), mm: p2(d.getMinutes()), D: d.getDate(), M: d.getMonth() + 1 }[t]));
  };

  /* ---------- Números ---------- */
  NC.NUMBER_FORMATS = [['number', 'Número'], ['comma', 'Número con separadores'], ['percent', 'Porcentaje'], ['pen', 'Soles (S/)'], ['usd', 'Dólares ($)'], ['eur', 'Euros (€)'], ['mxn', 'Pesos mexicanos'], ['clp', 'Pesos chilenos']];
  D.formatNumber = (n, fmt) => {
    if (n == null || n === '' || isNaN(n)) return '';
    const cur = { pen: 'PEN', usd: 'USD', eur: 'EUR', mxn: 'MXN', clp: 'CLP' }[fmt];
    if (cur) return new Intl.NumberFormat('es-PE', { style: 'currency', currency: cur }).format(n);
    if (fmt === 'percent') return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n * 100) + ' %';
    if (fmt === 'comma') return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 6 }).format(n);
    return String(Math.round(n * 1e6) / 1e6);
  };

  /* ---------- Lenguaje de fórmulas ---------- */
  function tokenize(src) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++;
        toks.push({ t: 'num', v: parseFloat(src.slice(i, j)) }); i = j; continue;
      }
      if (c === '"' || c === "'") {
        let j = i + 1, s = '';
        while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; s += src[j]; j++; }
        if (j >= src.length) throw new Error('Falta cerrar las comillas');
        toks.push({ t: 'str', v: s }); i = j + 1; continue;
      }
      if (/[A-Za-z_áéíóúñÁÉÍÓÚÑ]/.test(c)) {
        let j = i; while (j < src.length && /[A-Za-z0-9_áéíóúñÁÉÍÓÚÑ]/.test(src[j])) j++;
        toks.push({ t: 'id', v: src.slice(i, j) }); i = j; continue;
      }
      const two = src.slice(i, i + 2);
      if (['==', '!=', '>=', '<=', '&&', '||'].includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
      if ('+-*/%^><!(),.?:'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
      throw new Error(`Carácter no válido «${c}»`);
    }
    return toks;
  }

  function parse(src) {
    const toks = tokenize(src);
    let k = 0;
    const peek = () => toks[k];
    const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
    const isWord = (v) => peek() && peek().t === 'id' && peek().v.toLowerCase() === v;
    const expect = (v) => { if (!isOp(v)) throw new Error(`Se esperaba «${v}»`); k++; };
    const bin = (next, ops) => () => {
      let l = next();
      for (;;) {
        const p = peek();
        const op = p && ((p.t === 'op' && ops.includes(p.v)) || (p.t === 'id' && ops.includes(p.v.toLowerCase()))) ? (p.t === 'op' ? p.v : p.v.toLowerCase()) : null;
        if (!op) return l;
        k++;
        l = { k: 'bin', op, l, r: next() };
      }
    };
    const primary = () => {
      const p = peek();
      if (!p) throw new Error('Fórmula incompleta');
      if (p.t === 'num') { k++; return { k: 'lit', v: p.v }; }
      if (p.t === 'str') { k++; return { k: 'lit', v: p.v }; }
      if (p.t === 'op' && p.v === '(') { k++; const e = expr(); expect(')'); return e; }
      if (p.t === 'id') {
        k++;
        const low = p.v.toLowerCase();
        if (low === 'true') return { k: 'lit', v: true };
        if (low === 'false') return { k: 'lit', v: false };
        if (isOp('(')) {
          k++;
          const args = [];
          if (!isOp(')')) { do { args.push(expr()); } while (isOp(',') && ++k); }
          expect(')');
          return { k: 'call', fn: low, args };
        }
        throw new Error(`«${p.v}» no es una función conocida`);
      }
      throw new Error(`No se esperaba «${p.v}»`);
    };
    const postfix = () => {
      let e = primary();
      while (isOp('.')) {
        k++;
        const name = peek();
        if (!name || name.t !== 'id') throw new Error('Se esperaba un método después de «.»');
        k++;
        const args = [e];
        if (isOp('(')) { k++; if (!isOp(')')) { do { args.push(expr()); } while (isOp(',') && ++k); } expect(')'); }
        e = { k: 'call', fn: name.v.toLowerCase(), args };
      }
      return e;
    };
    const unary = () => {
      if (isOp('-')) { k++; return { k: 'un', op: '-', e: unary() }; }
      if (isOp('!') || isWord('not')) { k++; return { k: 'un', op: '!', e: unary() }; }
      return postfix();
    };
    const power = () => { const b = unary(); if (isOp('^')) { k++; return { k: 'bin', op: '^', l: b, r: power() }; } return b; };
    const mul = bin(power, ['*', '/', '%']);
    const add = bin(mul, ['+', '-']);
    const cmp = bin(add, ['==', '!=', '>', '<', '>=', '<=']);
    const and = bin(cmp, ['&&', 'and']);
    const or = bin(and, ['||', 'or']);
    const expr = () => {
      const c = or();
      if (isOp('?')) { k++; const a = expr(); expect(':'); return { k: 'call', fn: 'if', args: [c, a, expr()] }; }
      return c;
    };
    const ast = expr();
    if (k < toks.length) throw new Error(`Sobra «${toks[k].v}»`);
    return ast;
  }

  const parseCache = new Map();
  const compile = (src) => {
    if (!parseCache.has(src)) {
      try { parseCache.set(src, { ast: parse(src) }); } catch (e) { parseCache.set(src, { error: e.message }); }
    }
    return parseCache.get(src);
  };

  const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'number' && isNaN(v));
  const num = (v) => (v instanceof Date ? v.getTime() : typeof v === 'boolean' ? +v : v == null || v === '' ? 0 : Number(v));
  const str = (v) => (v == null ? '' : v instanceof Date ? fmtDate(v) : Array.isArray(v) ? v.map(str).join(', ') : typeof v === 'number' ? D.formatNumber(v) : typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v));
  const unitMs = { years: 0, months: 0, weeks: 6048e5, days: 864e5, hours: 36e5, minutes: 6e4, años: 0, meses: 0, semanas: 6048e5, días: 864e5, dias: 864e5, horas: 36e5, minutos: 6e4 };
  const addTo = (d, n, unit) => {
    const r = new Date(toDate(d) || Date.now());
    const u = String(unit || 'days').toLowerCase();
    if (/^(years|años)$/.test(u)) r.setFullYear(r.getFullYear() + n);
    else if (/^(months|meses)$/.test(u)) {
      const day = r.getDate();
      r.setDate(1);
      r.setMonth(r.getMonth() + n);
      r.setDate(Math.min(day, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate())); // 31 ene + 1 mes = 28 feb
    }
    else r.setTime(r.getTime() + n * (unitMs[u] || 864e5));
    return r;
  };

  const FUNCS = {
    if: (c, a, b) => (c ? a : b),
    ifs: (...a) => { for (let i = 0; i + 1 < a.length; i += 2) if (a[i]) return a[i + 1]; return a.length % 2 ? a[a.length - 1] : null; },
    and: (...a) => a.every(Boolean), or: (...a) => a.some(Boolean), not: (a) => !a,
    empty: isEmpty,
    length: (v) => (Array.isArray(v) ? v.length : str(v).length),
    concat: (...a) => (a.every(Array.isArray) ? a.flat() : a.map(str).join('')),
    join: (list, sep = ', ') => (Array.isArray(list) ? list.map(str).join(sep) : str(list)),
    contains: (v, x) => (Array.isArray(v) ? v.map(str).includes(str(x)) : str(v).toLowerCase().includes(str(x).toLowerCase())),
    replace: (v, a, b) => str(v).replace(str(a), str(b)), replaceall: (v, a, b) => str(v).split(str(a)).join(str(b)),
    lower: (v) => str(v).toLowerCase(), upper: (v) => str(v).toUpperCase(), trim: (v) => str(v).trim(),
    slice: (v, a, b) => (Array.isArray(v) ? v.slice(a, b) : str(v).slice(a, b)), substring: (v, a, b) => str(v).slice(a, b),
    format: str, tostring: str, tonumber: (v) => (v instanceof Date ? v.getTime() : parseFloat(str(v).replace(',', '.'))),
    round: (v, d = 0) => { const f = 10 ** d; return Math.round(num(v) * f) / f; },
    floor: (v) => Math.floor(num(v)), ceil: (v) => Math.ceil(num(v)), abs: (v) => Math.abs(num(v)),
    sqrt: (v) => Math.sqrt(num(v)), pow: (a, b) => num(a) ** num(b), sign: (v) => Math.sign(num(v)),
    min: (...a) => Math.min(...a.flat().map(num)), max: (...a) => Math.max(...a.flat().map(num)),
    sum: (...a) => a.flat().reduce((s, x) => s + num(x), 0),
    mean: (...a) => { const l = a.flat(); return l.length ? l.reduce((s, x) => s + num(x), 0) / l.length : 0; },
    now: () => new Date(), today: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; },
    dateadd: (d, n, u) => addTo(d, num(n), u), datesubtract: (d, n, u) => addTo(d, -num(n), u),
    datebetween: (a, b, u = 'days') => {
      const da = toDate(a), db = toDate(b);
      if (!da || !db) return null;
      const lu = String(u).toLowerCase();
      if (/^(years|años)$/.test(lu)) return da.getFullYear() - db.getFullYear();
      if (/^(months|meses)$/.test(lu)) return (da.getFullYear() - db.getFullYear()) * 12 + da.getMonth() - db.getMonth();
      return Math.trunc((da - db) / (unitMs[lu] || 864e5));
    },
    formatdate: (d, p) => fmtDate(toDate(d), p), parsedate: (s) => toDate(str(s)),
    year: (d) => (toDate(d) || {}).getFullYear && toDate(d).getFullYear(), month: (d) => toDate(d) && toDate(d).getMonth() + 1,
    day: (d) => toDate(d) && toDate(d).getDate(), weekday: (d) => toDate(d) && ((toDate(d).getDay() + 6) % 7) + 1,
    at: (l, i) => (Array.isArray(l) ? l[i] : str(l)[i]), first: (l) => (Array.isArray(l) ? l[0] : l), last: (l) => (Array.isArray(l) ? l[l.length - 1] : l),
    unique: (l) => (Array.isArray(l) ? [...new Set(l.map(str))] : l), sort: (l) => (Array.isArray(l) ? [...l].sort() : l),
    test: (v, re) => { try { return new RegExp(str(re), 'i').test(str(v)); } catch (e) { return false; } },
    style: (v) => v, id: () => null,
  };
  NC.FORMULA_FUNCS = Object.keys(FUNCS);

  function evalAst(n, ctx) {
    switch (n.k) {
      case 'lit': return n.v;
      case 'un': { const v = evalAst(n.e, ctx); return n.op === '-' ? -num(v) : !v; }
      case 'bin': {
        if (n.op === '&&' || n.op === 'and') return evalAst(n.l, ctx) && evalAst(n.r, ctx);
        if (n.op === '||' || n.op === 'or') return evalAst(n.l, ctx) || evalAst(n.r, ctx);
        const a = evalAst(n.l, ctx), b = evalAst(n.r, ctx);
        switch (n.op) {
          case '+': return typeof a === 'string' || typeof b === 'string' ? str(a) + str(b) : num(a) + num(b);
          case '-': return num(a) - num(b);
          case '*': return num(a) * num(b);
          case '/': return num(b) === 0 ? null : num(a) / num(b);
          case '%': return num(a) % num(b);
          case '^': return num(a) ** num(b);
          case '==': return a instanceof Date || b instanceof Date ? num(a) === num(b) : str(a) === str(b) && (typeof a === typeof b || str(a) === str(b));
          case '!=': return !(a instanceof Date || b instanceof Date ? num(a) === num(b) : str(a) === str(b));
          case '>': return typeof a === 'string' && typeof b === 'string' ? a > b : num(a) > num(b);
          case '<': return typeof a === 'string' && typeof b === 'string' ? a < b : num(a) < num(b);
          case '>=': return num(a) >= num(b);
          case '<=': return num(a) <= num(b);
        }
        return null;
      }
      case 'call': {
        if (n.fn === 'prop') {
          const name = str(evalAst(n.args[0], ctx));
          return ctx.prop(name);
        }
        if (n.fn === 'if') return evalAst(n.args[0], ctx) ? evalAst(n.args[1], ctx) : n.args[2] ? evalAst(n.args[2], ctx) : null;
        const f = FUNCS[n.fn];
        if (!f) throw new Error(`Función desconocida «${n.fn}»`);
        return f(...n.args.map((a) => evalAst(a, ctx)));
      }
    }
    return null;
  }

  /* ---------- Valores ---------- */
  // Valor "rico" de una propiedad para una fila (para fórmulas, filtros y orden)
  D.value = (db, row, prop, depth = 0) => {
    if (!prop) return row.title || '';
    const v = row.values ? row.values[prop.id] : undefined;
    switch (prop.type) {
      case 'number': return v == null || v === '' ? null : Number(v);
      case 'checkbox': return !!v;
      case 'date': return toDate(v);
      case 'created': return new Date(row.createdAt);
      case 'edited': return new Date(row.updatedAt || row.createdAt);
      case 'uid': return (prop.prefix ? prop.prefix + '-' : '') + (row.seq || D.seqOf(db, row));
      case 'select': case 'status': return (optionOf(prop, v) || {}).name || null;
      case 'multi': return (v || []).map((id) => (optionOf(prop, id) || {}).name).filter(Boolean);
      case 'relation': return (v || []).map((id) => pages()[id]).filter((r) => r && !r.trashed).map((r) => r.title || 'Sin título');
      case 'files': return (v || []).map((f) => f.name);
      case 'formula': return D.formula(db, row, prop, depth);
      case 'rollup': return D.rollup(db, row, prop, depth);
      default: return v == null ? '' : String(v);
    }
  };

  D.seqOf = (db, row) => {
    // filas antiguas sin número: orden de creación
    const sorted = [...db.rows].map((id) => pages()[id]).filter(Boolean).sort((a, b) => a.createdAt - b.createdAt);
    return sorted.findIndex((r) => r.id === row.id) + 1;
  };

  D.formula = (db, row, prop, depth = 0) => {
    if (depth > 8) return { error: 'Referencia circular' };
    const c = compile(prop.formula || '');
    if (!prop.formula) return null;
    if (c.error) return { error: c.error };
    const ctx = {
      prop: (name) => {
        if (name === db.titleName || /^(nombre|name|title|título)$/i.test(name)) return row.title || '';
        const p = db.props.find((x) => x.name === name) || db.props.find((x) => x.name.toLowerCase() === name.toLowerCase());
        if (!p) throw new Error(`No existe la propiedad «${name}»`);
        const v = D.value(db, row, p, depth + 1);
        if (v && v.error) throw new Error(v.error);
        return v;
      },
    };
    try { return evalAst(c.ast, ctx); } catch (e) { return { error: e.message }; }
  };
  D.checkFormula = (src) => compile(src).error || null;

  D.relatedRows = (row, prop) => ((row.values && row.values[prop.id]) || []).map((id) => pages()[id]).filter((r) => r && !r.trashed);

  NC.ROLLUP_FNS = [
    ['show', 'Mostrar originales'], ['count', 'Contar todo'], ['count_values', 'Contar valores'], ['unique', 'Contar únicos'],
    ['empty', 'Contar vacíos'], ['not_empty', 'Contar no vacíos'], ['sum', 'Suma'], ['avg', 'Promedio'], ['median', 'Mediana'],
    ['min', 'Mínimo'], ['max', 'Máximo'], ['range', 'Rango'], ['earliest', 'Fecha más antigua'], ['latest', 'Fecha más reciente'],
    ['checked', 'Marcadas'], ['percent_checked', '% marcadas'],
  ];
  D.rollup = (db, row, prop, depth = 0) => {
    const cfg = prop.rollup || {};
    const rel = db.props.find((p) => p.id === cfg.relationPropId);
    if (!rel || rel.type !== 'relation') return null;
    const target = D.findDb(rel.relation && rel.relation.dbId);
    if (!target) return null;
    const tprop = cfg.targetPropId === 'title' ? null : target.db.props.find((p) => p.id === cfg.targetPropId);
    const vals = D.relatedRows(row, rel).map((r) => D.value(target.db, r, tprop, depth + 1));
    return D.aggregate(vals, cfg.fn || 'show');
  };

  D.aggregate = (vals, fn) => {
    const flat = vals.flat();
    const filled = flat.filter((v) => !isEmpty(v));
    const nums = filled.map(num).filter((n) => !isNaN(n));
    const dates = filled.map(toDate).filter(Boolean);
    switch (fn) {
      case 'count': return vals.length;
      case 'count_values': return filled.length;
      case 'unique': return new Set(filled.map(str)).size;
      case 'empty': return flat.length - filled.length;
      case 'not_empty': return filled.length;
      case 'sum': return nums.reduce((a, b) => a + b, 0);
      case 'avg': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      case 'median': { if (!nums.length) return null; const s = [...nums].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
      case 'min': return nums.length ? Math.min(...nums) : null;
      case 'max': return nums.length ? Math.max(...nums) : null;
      case 'range': return nums.length ? Math.max(...nums) - Math.min(...nums) : null;
      case 'earliest': return dates.length ? new Date(Math.min(...dates)) : null;
      case 'latest': return dates.length ? new Date(Math.max(...dates)) : null;
      case 'checked': return flat.filter((v) => v === true).length;
      case 'unchecked': return flat.filter((v) => v === false).length;
      case 'percent_checked': return flat.length ? flat.filter((v) => v === true).length / flat.length : null;
      default: return flat;
    }
  };

  // Texto para mostrar
  D.text = (db, row, prop) => {
    const v = D.value(db, row, prop);
    if (v && v.error) return '⚠ ' + v.error;
    if (prop && prop.type === 'number') return D.formatNumber(v, prop.format);
    if (prop && (prop.type === 'rollup' || prop.type === 'formula') && typeof v === 'number') {
      const fn = prop.rollup && prop.rollup.fn;
      return fn === 'percent_checked' ? D.formatNumber(v, 'percent') : D.formatNumber(v, prop.format);
    }
    if (prop && (prop.type === 'created' || prop.type === 'edited')) return v ? v.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : '';
    return str(v);
  };
  D.str = str;
  D.isEmptyValue = isEmpty;

  /* ---------- Filtros ---------- */
  D.category = (prop) => {
    if (!prop) return 'text';
    if (['number', 'uid'].includes(prop.type)) return prop.type === 'uid' ? 'text' : 'number';
    if (['select', 'status'].includes(prop.type)) return 'select';
    if (['multi', 'relation', 'files'].includes(prop.type)) return 'multi';
    if (['date', 'created', 'edited'].includes(prop.type)) return 'date';
    if (prop.type === 'checkbox') return 'checkbox';
    if (prop.type === 'rollup' || prop.type === 'formula') return 'computed';
    return 'text';
  };
  NC.FILTER_OPS = {
    text: [['contains', 'Contiene'], ['not_contains', 'No contiene'], ['is', 'Es'], ['is_not', 'No es'], ['starts', 'Empieza por'], ['ends', 'Termina en'], ['empty', 'Está vacío'], ['not_empty', 'No está vacío']],
    number: [['eq', '='], ['neq', '≠'], ['gt', '>'], ['lt', '<'], ['gte', '≥'], ['lte', '≤'], ['empty', 'Está vacío'], ['not_empty', 'No está vacío']],
    select: [['is', 'Es'], ['is_not', 'No es'], ['empty', 'Está vacío'], ['not_empty', 'No está vacío']],
    multi: [['contains', 'Contiene'], ['not_contains', 'No contiene'], ['empty', 'Está vacío'], ['not_empty', 'No está vacío']],
    date: [['is', 'Es'], ['before', 'Antes de'], ['after', 'Después de'], ['on_or_before', 'En o antes de'], ['on_or_after', 'En o después de'], ['today', 'Es hoy'], ['past_week', 'Semana pasada'], ['next_week', 'Próxima semana'], ['this_month', 'Este mes'], ['overdue', 'Vencida'], ['empty', 'Está vacía'], ['not_empty', 'No está vacía']],
    checkbox: [['checked', 'Marcada'], ['unchecked', 'Sin marcar']],
    computed: [['contains', 'Contiene'], ['is', 'Es'], ['gt', '>'], ['lt', '<'], ['empty', 'Está vacío'], ['not_empty', 'No está vacío']],
  };

  const matchOne = (db, row, f) => {
    const prop = f.propId === 'title' ? null : db.props.find((p) => p.id === f.propId);
    if (f.propId !== 'title' && !prop) return true;
    const cat = D.category(prop);
    const raw = row.values && prop ? row.values[prop.id] : null;
    const v = D.value(db, row, prop);
    const val = f.value;
    const t = str(v).toLowerCase();
    const q = str(val).toLowerCase();
    if (f.op === 'empty') return cat === 'select' || cat === 'multi' ? isEmpty(cat === 'select' ? raw : raw) : isEmpty(v);
    if (f.op === 'not_empty') return !(cat === 'select' || cat === 'multi' ? isEmpty(raw) : isEmpty(v));
    if (val == null || val === '') return true; // filtro sin valor: no filtra
    switch (cat) {
      case 'number': case 'computed': {
        if (['eq', 'neq', 'gt', 'lt', 'gte', 'lte'].includes(f.op) || (cat === 'computed' && ['gt', 'lt'].includes(f.op))) {
          const a = num(v), b = num(val);
          return { eq: a === b, neq: a !== b, gt: a > b, lt: a < b, gte: a >= b, lte: a <= b }[f.op];
        }
        return { contains: t.includes(q), is: t === q }[f.op] ?? true;
      }
      case 'select': return f.op === 'is' ? raw === val : raw !== val;
      case 'multi': {
        const ids = Array.isArray(raw) ? raw : [];
        const has = prop.type === 'relation' || prop.type === 'multi' ? ids.includes(val) || v.map((x) => str(x).toLowerCase()).some((x) => x.includes(q)) : t.includes(q);
        return f.op === 'contains' ? has : !has;
      }
      case 'date': {
        const d = toDate(v);
        if (!d) return false;
        const day = iso(d);
        const today = NC.todayISO();
        const off = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return iso(x); };
        switch (f.op) {
          case 'is': return day === val;
          case 'before': return day < val;
          case 'after': return day > val;
          case 'on_or_before': return day <= val;
          case 'on_or_after': return day >= val;
          default: break;
        }
        return true;
      }
      case 'checkbox': return true;
      default:
        return { contains: t.includes(q), not_contains: !t.includes(q), is: t === q, is_not: t !== q, starts: t.startsWith(q), ends: t.endsWith(q) }[f.op] ?? true;
    }
  };
  // Operadores que no necesitan valor
  const matchNoValue = (db, row, f) => {
    const prop = db.props.find((p) => p.id === f.propId);
    if (!prop) return null;
    const v = D.value(db, row, prop);
    const d = toDate(v);
    const off = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return iso(x); };
    const today = NC.todayISO();
    switch (f.op) {
      case 'checked': return v === true;
      case 'unchecked': return v !== true;
      case 'today': return !!d && iso(d) === today;
      case 'past_week': return !!d && iso(d) >= off(-7) && iso(d) <= today;
      case 'next_week': return !!d && iso(d) >= today && iso(d) <= off(7);
      case 'this_month': return !!d && iso(d).slice(0, 7) === today.slice(0, 7);
      case 'overdue': return !!d && iso(d) < today;
      default: return null;
    }
  };
  D.matches = (db, row, filters, mode = 'and') => {
    const list = (filters || []).filter((f) => f.propId);
    if (!list.length) return true;
    const test = (f) => { const nv = matchNoValue(db, row, f); return nv != null ? nv : matchOne(db, row, f); };
    return mode === 'or' ? list.some(test) : list.every(test);
  };

  /* ---------- Orden ---------- */
  D.sortKey = (db, row, prop) => {
    if (!prop) return (row.title || '').toLowerCase();
    if (prop.type === 'select' || prop.type === 'status') { const i = prop.options.findIndex((o) => o.id === (row.values || {})[prop.id]); return i < 0 ? 1e9 : i; }
    if (prop.type === 'uid') return row.seq || D.seqOf(db, row);
    const v = D.value(db, row, prop);
    if (v == null || v === '' || (v && v.error)) return null;
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number' || typeof v === 'boolean') return +v;
    return str(v).toLowerCase();
  };
  D.sortRows = (db, rows, sorts) => {
    const list = (sorts || []).filter((s) => s.propId);
    if (!list.length) return rows;
    const props = list.map((s) => (s.propId === 'title' ? null : db.props.find((p) => p.id === s.propId)));
    return [...rows].sort((a, b) => {
      for (let i = 0; i < list.length; i++) {
        if (list[i].propId !== 'title' && !props[i]) continue;
        const dir = list[i].dir === 'desc' ? -1 : 1;
        const ka = D.sortKey(db, a, props[i]), kb = D.sortKey(db, b, props[i]);
        if (ka === kb) continue;
        if (ka == null) return 1; // vacíos al final
        if (kb == null) return -1;
        return (ka < kb ? -1 : 1) * dir;
      }
      return 0;
    });
  };

  /* ---------- Agrupación ---------- */
  // Devuelve [{ key, label, color, rows }] en orden
  D.groupRows = (db, rows, prop, hideEmpty = false) => {
    if (!prop) return [{ key: '__all', label: '', rows }];
    const groups = new Map();
    const add = (key, label, color, row, order = 0) => {
      if (!groups.has(key)) groups.set(key, { key, label, color, rows: [], order });
      if (row) groups.get(key).rows.push(row);
    };
    if (prop.type === 'select' || prop.type === 'status' || prop.type === 'multi') {
      prop.options.forEach((o, i) => add(o.id, o.name, o.color, null, i));
      add('__none', 'Sin ' + prop.name.toLowerCase(), 'gray', null, -1);
      rows.forEach((r) => {
        const v = (r.values || {})[prop.id];
        const ids = prop.type === 'multi' ? (v || []).filter((id) => optionOf(prop, id)) : optionOf(prop, v) ? [v] : [];
        if (!ids.length) groups.get('__none').rows.push(r);
        ids.forEach((id) => groups.get(id).rows.push(r));
      });
    } else if (prop.type === 'checkbox') {
      add('true', 'Marcada', 'green', null, 0);
      add('false', 'Sin marcar', 'gray', null, 1);
      rows.forEach((r) => groups.get(D.value(db, r, prop) ? 'true' : 'false').rows.push(r));
    } else if (['date', 'created', 'edited'].includes(prop.type)) {
      rows.forEach((r) => {
        const d = toDate(D.value(db, r, prop));
        const key = d ? iso(d).slice(0, 7) : '__none';
        const label = d ? d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) : 'Sin fecha';
        add(key, label, 'gray', r, d ? -d.getTime() : 1e15);
      });
    } else if (prop.type === 'relation') {
      rows.forEach((r) => {
        const rel = D.relatedRows(r, prop);
        if (!rel.length) add('__none', 'Sin ' + prop.name.toLowerCase(), 'gray', r, 1e15);
        rel.forEach((x) => add(x.id, x.title || 'Sin título', 'gray', r, 0));
      });
    } else {
      rows.forEach((r) => {
        const t = D.text(db, r, prop);
        add(t || '__none', t || 'Vacío', 'gray', r, t ? 0 : 1);
      });
    }
    let out = [...groups.values()];
    if (!['select', 'status', 'multi', 'checkbox'].includes(prop.type)) out.sort((a, b) => a.order - b.order || String(a.label).localeCompare(String(b.label)));
    else out.sort((a, b) => a.order - b.order);
    if (hideEmpty) out = out.filter((g) => g.rows.length);
    return out;
  };

  /* ---------- Cálculos de columna ---------- */
  NC.CALC_FNS = [
    ['none', 'Ninguno'], ['count', 'Contar todo'], ['count_values', 'Contar valores'], ['empty', 'Contar vacíos'], ['not_empty', 'Contar no vacíos'],
    ['unique', 'Contar únicos'], ['percent_empty', '% vacíos'], ['sum', 'Suma'], ['avg', 'Promedio'], ['median', 'Mediana'], ['min', 'Mínimo'],
    ['max', 'Máximo'], ['range', 'Rango'], ['earliest', 'Más antigua'], ['latest', 'Más reciente'], ['checked', 'Marcadas'], ['percent_checked', '% marcadas'],
  ];
  D.calc = (db, rows, prop, fn) => {
    if (!fn || fn === 'none') return '';
    const vals = rows.map((r) => D.value(db, r, prop)).map((v) => (v && v.error ? null : v));
    if (fn === 'percent_empty') return D.formatNumber(rows.length ? vals.filter(isEmpty).length / rows.length : 0, 'percent');
    const r = D.aggregate(vals, fn);
    if (r instanceof Date) return fmtDate(r);
    if (fn === 'percent_checked') return D.formatNumber(r || 0, 'percent');
    if (typeof r === 'number') return ['sum', 'avg', 'median', 'min', 'max', 'range'].includes(fn) && prop ? D.formatNumber(r, prop.format) : D.formatNumber(r);
    return str(r);
  };

  /* ---------- Filas visibles de una vista ---------- */
  D.viewRows = (db, view) => {
    let rows = D.rowsOf(db);
    const q = (view.filter || '').trim().toLowerCase();
    if (q) rows = rows.filter((r) => (r.title || '').toLowerCase().includes(q) || db.props.some((p) => D.text(db, r, p).toLowerCase().includes(q)));
    rows = rows.filter((r) => D.matches(db, r, view.filters, view.filterMode));
    const sorts = view.sorts || (view.sort ? [view.sort] : []);
    return D.sortRows(db, rows, sorts);
  };
})();
