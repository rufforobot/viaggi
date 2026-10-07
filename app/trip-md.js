/* Legge un viaggio scritto in markdown (trips/NOME.md) e lo trasforma nei dati usati dall'app.
   Formato: vedi trips/_modello.md e README.md. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TripMd = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  /* chiave nel markdown → chiave interna */
  const HOTEL = { città: 'city', notti: 'nights', nome: 'name', locale: 'zh', pronuncia: 'py', 'indirizzo-locale': 'addr', indirizzo: 'en', 'indirizzo-app': 'pya',
    tel: 'tel', 'tel-mostrato': 'telShow', metro: 'metro', checkin: 'cin', checkout: 'cout', prenotazione: 'booking', verificato: 'v', avviso: 'warn', fonte: 'src' };
  const STOP = { sintesi: 'sum', locale: 'zh', pronuncia: 'py', 'indirizzo-locale': 'addr', indirizzo: 'pya', come: 'how', orari: 'hours', costi: 'cost',
    prenotazione: 'book', consigli: 'tips', attenzione: 'warn', tel: 'tel', hotel: 'h', verificato: 'v', guida: 'guide', durata: 'dur', spostamento: 'mv', modificabile: 'editable', luogo: 'luogo', mappa: 'map', varianti: 'opts', opzione: 'opt' };
  const TRANSFER = { partenza: 'dep', note: 'arr', locale: 'zh' };
  const GUIDE = { tag: 'tag', nativo: 'native', testo: 'text', curiosita: 'curiosita', tradizioni: 'tradizioni', oggi: 'oggi', particolarita: 'particolarita', osservare: 'osservare', foto: 'foto', parola: 'parola' };
  const LISTS = new Set(['tips', 'osservare', 'opts']);
  const DEFAULT_CATS = [['cibo', '🍜', 'Cibo'], ['trasporti', '🚕', 'Trasporti'], ['ingressi', '🎟️', 'Ingressi'], ['shopping', '🛍️', 'Shopping'], ['alloggio', '🏨', 'Alloggio'], ['altro', '📦', 'Altro']];

  const unesc = s => s.replace(/\\(n|\\)/g, (_, c) => c === 'n' ? '\n' : '\\');
  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
  const num = v => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : v; };
  const yes = v => /^(si|sì|true|yes|1)$/i.test(String(v).trim());
  const vOut = v => (v == null || String(v).trim() === '' || /^(ok|verificato)$/i.test(String(v).trim()) ? 'ok' : 'chk');

  /* ---- intestazione YAML semplificata ---- */
  function parseFront(text) {
    const out = {}; let cur = null;
    text.split('\n').forEach(raw => {
      if (!raw.trim() || /^\s*#/.test(raw)) return;
      const ind = raw.match(/^\s*/)[0].length, line = raw.trim();
      if (ind === 0) {
        const m = line.match(/^([\w-]+):\s*(.*)$/); if (!m) return;
        if (m[2] === '') { out[m[1]] = null; cur = m[1]; } else { out[m[1]] = unesc(m[2]); cur = null; }
      } else if (cur) {
        if (line.startsWith('- ')) { if (!Array.isArray(out[cur])) out[cur] = []; out[cur].push(unesc(line.slice(2).trim())); }
        else { const m = line.match(/^(.+?):\s*(.*)$/); if (m) { if (!out[cur] || Array.isArray(out[cur])) out[cur] = {}; out[cur][m[1].trim()] = unesc(m[2]); } }
      }
    });
    return out;
  }

  /* ---- blocchi "- chiave: valore" ---- */
  function parseFields(lines) {
    const f = {}; let key = null;
    lines.forEach(raw => {
      if (!raw.trim()) return;
      const m = raw.match(/^-\s+([\wàèéìòù-]+):\s*(.*)$/i);
      if (m && !/^\s/.test(raw)) { key = m[1].toLowerCase(); f[key] = unesc(m[2]); return; }
      const sub = raw.match(/^\s+-\s+(.*)$/);
      if (sub && key) { if (!Array.isArray(f[key])) f[key] = f[key] ? [f[key]] : []; f[key].push(unesc(sub[1].trim())); return; }
      if (/^\s+\S/.test(raw) && key && typeof f[key] === 'string') f[key] += ' ' + unesc(raw.trim());
    });
    return f;
  }
  const mapFields = (f, map) => { const o = {}; Object.keys(f).forEach(k => { const t = map[k]; if (!t) return; o[t] = f[k]; }); return o; };

  /* ---- suddivisione in sezioni ---- */
  function split(lines, level) {
    const re = new RegExp('^' + '#'.repeat(level) + '\\s+(.*)$'), parts = []; let cur = null;
    lines.forEach(l => { const m = l.match(re); if (m && !(level < 3 && /^#{3}/.test(l) && false)) { cur = { title: m[1].trim(), lines: [] }; parts.push(cur); } else if (cur) cur.lines.push(l); });
    return parts;
  }
  const isHeading = (l, n) => new RegExp('^#{' + n + '}\\s').test(l) && !new RegExp('^#{' + (n + 1) + '}').test(l);
  function splitAt(lines, n) {
    const parts = []; let cur = null, pre = [];
    lines.forEach(l => { if (isHeading(l, n)) { cur = { title: l.replace(/^#+\s+/, '').trim(), lines: [] }; parts.push(cur); } else if (cur) cur.lines.push(l); else pre.push(l); });
    return { pre, parts };
  }
  const bullets = lines => lines.filter(l => /^-\s/.test(l)).map(l => l.replace(/^-\s+/, '').trim());
  const cells = s => s.split('|').map(x => unesc(x.trim()));

  function parse(text) {
    text = text.replace(/^\uFEFF/, '').replace(/\r/g, '');
    let front = {}, body = text;
    const fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
    if (fm) { front = parseFront(fm[1]); body = text.slice(fm[0].length); }

    /* meta */
    const meta = Object.assign({}, front);
    if (meta.currency) meta.currency.rate = num(meta.currency.rate);
    meta.emergency = (front.emergency || []).map(cells);
    if (front.weather) { meta.weather = {}; Object.keys(front.weather).forEach(c => { const [a, b] = String(front.weather[c]).split(',').map(x => num(x.trim())); meta.weather[c] = [a, b]; }); }
    if (front.icon && typeof front.icon === 'object') meta.icon = front.icon;
    meta.stateKey = meta.stateKey || (meta.id + '-state-v1'); meta.wxKey = meta.wxKey || (meta.id + '-weather');
    meta.tts = meta.tts || 'en-US'; meta.tz = meta.tz || 'UTC'; meta.country = meta.country || ''; meta.countryIt = meta.countryIt || meta.country;
    meta.currency = meta.currency || { symbol: '€', name: 'Euro', rate: 1 };
    meta.assistance = meta.assistance || { label: 'Assistenza', tel: '' };
    meta.emergency = meta.emergency || []; meta.weather = meta.weather || {};

    const lines = body.split('\n');
    const { parts: sections } = splitAt(lines, 1);
    const S = {}; sections.forEach(s => { S[s.title.toLowerCase().replace(/\s+/g, ' ')] = s.lines; });

    /* città */
    const CITY_KEY = {}, cities = [];
    bullets(S['città'] || S['citta'] || []).forEach(b => {
      const [name, dates, key, days] = cells(b);
      cities.push({ name, dates, days: String(days || '').split(',').map(x => Number(x.trim())).filter(Boolean) }); CITY_KEY[name] = key;
    });

    /* hotel */
    const HOTELS = {};
    splitAt(S['hotel'] || [], 2).parts.forEach(p => {
      const o = mapFields(parseFields(p.lines), HOTEL); o.v = vOut(o.v);
      ['city', 'nights', 'name', 'zh', 'py', 'addr', 'en', 'tel', 'telShow', 'metro', 'cin', 'cout', 'booking', 'warn', 'src'].forEach(k => { if (o[k] === undefined) o[k] = ''; });
      if (o.pya === undefined) o.pya = o.en;
      HOTELS[p.title.trim()] = o;
    });

    /* itinerario */
    const days = [], DIARY = {};
    splitAt(S['itinerario'] || [], 2).parts.forEach(dp => {
      const t = dp.title.split(' · ').map(x => x.trim());
      const m = t[0].match(/(\d+)/); const n = Number(m && m[1]);
      const day = { day: n, date: t[1] || '', dow: t[2] || '', city: t[3] || '', title: t.slice(4).join(' · '), stops: [] };
      const { pre, parts } = splitAt(dp.lines, 3);
      const df = parseFields(pre);
      if (df.avviso) day.alert = df.avviso;
      days.push(day);
      const stops = parts.map(sp => {
        const i = sp.title.indexOf(' · ');
        const st = { t: i < 0 ? sp.title : sp.title.slice(0, i).trim(), title: i < 0 ? '' : sp.title.slice(i + 3).trim() };
        const f = mapFields(parseFields(sp.lines), STOP);
        if (f.luogo && /^hotel/i.test(f.luogo)) {
          const h = HOTELS[f.h || df.dorme] || {};
          st.h = f.h || df.dorme; st.zh = h.zh; st.py = h.py; st.addr = h.addr; st.pya = h.en;
          if (f.tel === undefined) st.tel = h.tel;
        }
        delete f.luogo;
        Object.keys(f).forEach(k => { if (f[k] === '' || (Array.isArray(f[k]) && !f[k].length)) return; st[k] = f[k]; });
        if (st.tel === '-') delete st.tel;
        st.sum = f.sum || ''; st.v = vOut(f.v);
        if (f.editable !== undefined) st.editable = yes(f.editable);
        if (f.tips && !Array.isArray(f.tips)) st.tips = [f.tips];
        return st;
      });
      DIARY[n] = { sleep: df.dorme && df.dorme !== '-' ? df.dorme : null, stops };
    });

    /* racconto (testo lungo per giorno, markdown semplice) */
    const RACCONTO = {};
    splitAt(S['racconto'] || [], 2).parts.forEach(p => {
      const m = p.title.match(/(\d+)\s*(?:[—–-]\s*(.*))?/); if (!m) return;
      RACCONTO[Number(m[1])] = { title: (m[2] || '').trim(), text: p.lines.join('\n').trim() };
    });

    /* trasferimenti */
    const transfers = splitAt(S['trasferimenti'] || [], 2).parts.map(p => {
      const t = p.title.split(' · ').map(x => x.trim());
      const o = mapFields(parseFields(p.lines), TRANSFER);
      return Object.assign({ id: t[0], type: t[1], title: t.slice(2).join(' · ') }, o);
    });

    /* prenotazioni */
    const reservations = bullets(S['prenotazioni'] || []).map(b => {
      const [id, type, title, date, status, ref, opens] = cells(b);
      const r = { id, type, title, date, status, ref }; if (opens) r.opens = opens; return r;
    });

    /* checklist */
    const checklistData = splitAt(S['checklist'] || [], 2).parts.map(p => ({ group: p.title, items: bullets(p.lines).map(b => { const i = b.indexOf(' | '); return [b.slice(0, i).trim(), unesc(b.slice(i + 3).trim())]; }) }));

    /* guide */
    const companionData = splitAt(S['guide'] || [], 2).parts.map(cp => ({
      name: cp.title,
      stops: splitAt(cp.lines, 3).parts.map(sp => {
        const f = mapFields(parseFields(sp.lines), GUIDE);
        const o = { tag: f.tag && f.tag !== '-' ? f.tag : null, title: sp.title };
        Object.keys(f).forEach(k => { if (k !== 'tag') o[k] = f[k]; });
        if (o.osservare && !Array.isArray(o.osservare)) o.osservare = [o.osservare];
        return o;
      })
    }));

    /* frasi */
    const phrases = []; splitAt(S['frasi'] || [], 2).parts.forEach(p => bullets(p.lines).forEach(b => { const [it, loc, pr] = cells(b); phrases.push([p.title, it, loc, pr]); }));
    const DRIVER_PHRASES = bullets(S['frasi tassista'] || []).map(cells);
    const INFO = splitAt(S['info paese'] || [], 2).parts.map(p => ({ title: p.title, items: bullets(p.lines).map(unesc) })).filter(g => g.items.length);
    const catLines = bullets(S['categorie spese'] || []);
    const CATS = catLines.length ? catLines.map(cells) : DEFAULT_CATS;

    const sISO = String(meta.start).slice(0, 10);
    const trip = { start: sISO, end: sISO, cities, days };
    if (days.length) {
      const y0 = Number(sISO.slice(0, 4)), m0 = Number(sISO.slice(5, 7)), last = days[days.length - 1].date;
      trip.end = `${Number(last.slice(3, 5)) < m0 ? y0 + 1 : y0}-${last.slice(3, 5)}-${last.slice(0, 2)}`;
    }
    return { meta, trip, RACCONTO, companionData, HOTELS, DRIVER_PHRASES, DIARY, CITY_KEY, reservations, transfers, checklistData, phrases, CATS, INFO };
  }

  return { parse, esc, FIELDS: { HOTEL, STOP, TRANSFER, GUIDE, LISTS }, DEFAULT_CATS };
});
