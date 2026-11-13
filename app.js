/* =========================================================
   Orbit — organisation perso (PC + iPhone)
   App autonome : les données passent par la fonction Supabase orbit-api.
   ========================================================= */
'use strict';
const API = 'https://cbbnrdfvaaikawszaysu.supabase.co/functions/v1/orbit-api';
const EXTRA = 'https://cbbnrdfvaaikawszaysu.supabase.co/functions/v1/orbit-extra';
const BUSFN = 'https://cbbnrdfvaaikawszaysu.supabase.co/functions/v1/orbit-bus';
const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage plein ou bloqué */ } },
};

const SVG = (p, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  book: SVG('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/>'),
  file: SVG('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>'),
  play: SVG('<path d="M7 5v14l11-7z" fill="currentColor" stroke="none"/>'),
  undo: SVG('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  aujourdhui: SVG('<path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  taches: SVG('<path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>'),
  devoirs: SVG('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>'),
  agenda: SVG('<rect x="3" y="4" width="18" height="17" rx="4"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  ia: SVG('<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  check: SVG('<path d="M5 12l5 5L20 7"/>', 3.2),
  dots: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  bell: SVG('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>'),
  plus: SVG('<path d="M12 5v14M5 12h14"/>', 2.6),
  send: SVG('<path d="M5 12h14M13 6l6 6-6 6"/>', 2.4),
  bus: SVG('<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 18v3M16 18v3"/><circle cx="8.5" cy="14.5" r=".6" fill="currentColor"/><circle cx="15.5" cy="14.5" r=".6" fill="currentColor"/>'),
  walk: SVG('<circle cx="13" cy="4" r="2"/><path d="M9 21l2.5-6.5L14 17v4M7.5 11.5L10 8l3.5 1 2 3.5H18M10 8l1.5 6.5"/>'),
  repeat: SVG('<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
};
const TABS = [['aujourdhui', "Aujourd'hui"], ['taches', 'Tâches'], ['devoirs', 'Devoirs'], ['agenda', 'Agenda'], ['bus', 'Bus'], ['ia', 'Assistant']];
const ACCENTS = { corail: ['#ff6a47', '#ff8c70', '#3a221b'], ambre: ['#ffb23f', '#ffc56e', '#3a2c16'], rose: ['#ff4f8b', '#ff86ae', '#3a1b27'], menthe: ['#4fd1a5', '#7fe0bf', '#16332a'], bleu: ['#6f9bff', '#9ab9ff', '#1c2540'] };
const REPEATS = { '': 'Jamais', daily: 'Tous les jours', weekdays: 'En semaine (lun-ven)', weekly: 'Chaque semaine', biweekly: 'Toutes les 2 semaines', monthly: 'Chaque mois' };

/* ---------- État ---------- */
let key = store.get('orbit.key', null);
let tasks = store.get('orbit.tasks', []);
let settings = Object.assign({ accent: 'corail', style: 'profond', intensite: 'normal', pronoteDone: [], revDone: [] }, store.get('orbit.settings', {}));
let synced = !!store.get('orbit.server', null);
let server = store.get('orbit.server', { devoirs: [], cours: [], gcal: [], pronote: {}, flags: {} });
const skel = (n = 3, h = 64) => `<div class="skel">${Array.from({ length: n }, (_, i) => `<i style="height:${i ? h : h * 2}px;animation-delay:${i * .12}s"></i>`).join('')}</div>`;
let notesLoading = false;
let lastSince = store.get('orbit.since', null);
let outbox = store.get('orbit.outbox', { put: {}, del: [], settings: false });
let agendaMode = store.get('orbit.agendaMode', 'jour');
let current = 'aujourdhui', taskFilter = 'semaine', agendaDay = startOfDay(new Date()), chat = [];
let online = true;

/* ---------- Dates ---------- */
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function ymd(d) { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
const sameDay = (a, b) => ymd(a) === ymd(b);
const fmtDay = d => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = d => new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
const fmtTime = d => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
function dueDate(t) { if (!t.due) return null; const d = new Date(t.due + 'T' + (t.time || '23:59') + ':00'); return isNaN(d) ? null : d; }
function daysLeft(t) { const d = dueDate(t); return d ? Math.round((startOfDay(d) - startOfDay(new Date())) / 864e5) : null; }
function dueLabel(t) {
  const n = daysLeft(t); if (n === null) return '';
  if (n < 0) return `En retard (${-n} j)`;
  if (n === 0) return t.time ? `Aujourd'hui ${t.time}` : "Aujourd'hui";
  if (n === 1) return 'Demain' + (t.time ? ' ' + t.time : '');
  if (n < 7) return cap(fmtShort(dueDate(t)));
  return new Date(dueDate(t)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ` · J-${n}`;
}
function dueClass(t) { const n = daysLeft(t); if (n === null || t.done) return ''; return n < 0 ? 'late' : n <= 2 ? 'soon' : ''; }
function dayTitle(d) {
  const n = Math.round((startOfDay(d) - startOfDay(new Date())) / 864e5);
  if (n === 0) return ["Aujourd'hui", fmtShort(d)];
  if (n === 1) return ['Demain', fmtShort(d)];
  if (n === -1) return ['Hier', fmtShort(d)];
  return [cap(new Date(d).toLocaleDateString('fr-FR', { weekday: 'long' })), new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })];
}

/* ---------- Matières Pronote ---------- */
const SUBJ = { 'MATHEMATIQUES': 'Maths', 'FRANCAIS': 'Français', 'ANGLAIS LV1': 'Anglais', 'ANGLAIS LV2': 'Anglais', 'ALLEMAND LV1': 'Allemand', 'ALLEMAND LV2': 'Allemand', 'ESPAGNOL LV1': 'Espagnol', 'ESPAGNOL LV2': 'Espagnol', 'PHYSIQUE-CHIMIE': 'Physique-chimie', 'PHYSIQ.CHIMIE&MATHS': 'Physique-chimie & maths', 'HISTOIRE-GEOGRAPHIE': 'Histoire-géo', 'HISTOIRE & GEOGRAPHIE': 'Histoire-géo', 'ED.PHYSIQUE & SPORT.': 'EPS', 'EPS': 'EPS', 'PHILOSOPHIE': 'Philo', 'SCIENCES ECO.& SOCIAL.': 'SES', 'SC. ECONO.& SOCIALES': 'SES', 'SCIENCES VIE & TERRE': 'SVT', 'ENS. MORAL & CIVIQUE': 'EMC', 'ENSEIGN.SCIENTIFIQUE': 'Enseignement scientifique', 'IT-INNOVATION TECHNOLOGIQUE': 'Innovation techno', 'ENS.TECHNO. EN LV1': 'ETLV', 'INGENIER.&DEV.DURAB.': 'I2D', 'INGENIERIE & DEV. DURABLE': 'I2D', 'NUMERIQUE SC.INFORM.': 'NSI', 'ACCOMPAGNEMT. PERSO': 'Accompagnement perso', 'ACCOMPAGNEMENT PERSO': 'Accompagnement perso', 'VIE DE CLASSE': 'Vie de classe' };
function prettySubj(s) { if (!s) return null; const u = String(s).trim().toUpperCase(), k = u.replace(/\s*\d+$/, '').replace(/\s+LV$/, ''); if (SUBJ[u]) return SUBJ[u]; if (SUBJ[k]) return SUBJ[k]; return k.toLowerCase().replace(/(^|[\s\-'.&(])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()); }
const COLORS = ['#ff6a47', '#ffb23f', '#6f9bff', '#4fd1a5', '#c58cff', '#ff8fb1', '#e8c48a', '#7fd3ff'];
/* Chaque matière a SA couleur et SON icône (les langues : leurs lettres) — l'ordre compte */
const SUBJECTS = [
  [/physique.*math|chimie.*math/i, '#8f5bff', '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(-60 12 12)"/>'],
  [/math|algèbre|géom/i, '#3b7bff', '<path d="M7 4v6M4 7h6M14 7h6M5 15l4 4M9 15l-4 4M14 15h6M14 19h6"/>'],
  [/physique|chimie/i, '#a36bff', '<path d="M9 3h6M10 3v6L4.6 18.4A1.8 1.8 0 0 0 6.2 21h11.6a1.8 1.8 0 0 0 1.6-2.6L14 9V3"/><path d="M7.5 15h9"/>'],
  [/vie de classe/i, '#ff8f6b', '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.8.3 5 2.6 5 5.8"/>'],
  [/svt|biolog|sciences vie/i, '#1fd67a', '<path d="M11 20A7 7 0 0 1 4 13c0-6 6-9 16-9 0 10-3 16-9 16z"/><path d="M4 21c4-4 7-7 10-10"/>'],
  [/français|littér|lettres/i, '#ff3b4e', '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'],
  [/philo/i, '#ffe08a', '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>'],
  [/etlv|techno.*anglais|ens\.?techno/i, '#00d9b5', 'ETLV'],
  [/anglais/i, '#00b4ff', 'EN'],
  [/allemand/i, '#ffc800', 'DE'],
  [/espagnol/i, '#ff8a3d', 'ES'],
  [/italien/i, '#62dc1e', 'IT'],
  [/latin/i, '#e8c48a', 'LA'],
  [/histoire|géo|geo/i, '#d9944a', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'],
  [/eps|sport/i, '#ff3d9a', '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>'],
  [/ingénier|ingenier|i2d|dév.*durab|dev.*durab/i, '#62dc1e', '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>'],
  [/innovation|^it\b|it-/i, '#ff8800', '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>'],
  [/nsi|numérique|informatique/i, '#22d3ee', '<path d="M8 6l-6 6 6 6M16 6l6 6-6 6M14 4l-4 16"/>'],
  [/ses|éco|eco|gestion/i, '#f5b8ff', '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'],
  [/accompagn|aide perso|soutien/i, '#7fb2e0', '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'],
  [/emc|moral|civique/i, '#e266ff', '<path d="M12 3v18M6 7h12M6 7l-3 7a3.5 3.5 0 0 0 6 0zM18 7l-3 7a3.5 3.5 0 0 0 6 0z"/>'],
  [/scientifique|science/i, '#7dd3fc', '<circle cx="12" cy="12" r="2"/><path d="M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20M2 12c3-3 17-3 20 0M2 12c3 3 17 3 20 0"/>'],
  [/musique/i, '#ffcf5c', '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'],
  [/art|dessin|plast/i, '#ff7a90', '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="16" cy="10" r="1.2"/>'],
];
const subjDef = name => SUBJECTS.find(([re]) => re.test(name || ''));
function subjIcon(name, size = 18) {
  const d = subjDef(name), p = d ? d[2] : '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/>';
  if (!p.startsWith('<')) return `<b class="sqTxt${p.length > 2 ? ' long' : ''}">${p}</b>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#100e0d" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
const subjBadge = (name, cls = 'sq', off = false) => `<span class="${cls}${off ? ' off' : ''}" style="background-color:${off ? '#5b5653' : subjColor(name)};--sc:${off ? 'transparent' : subjColor(name) + '99'}" title="${esc(name || '')}">${subjIcon(name)}</span>`;
const isOff = c => !!c && (c.canceled || /absent|annul|supprim|pas de prof/i.test(c.status || ''));
function subjColor(name) { const d = subjDef(name); if (d) return d[1]; let h = 0; for (const c of String(name || '?')) h = (h * 31 + c.charCodeAt(0)) | 0; return COLORS[Math.abs(h) % COLORS.length]; }
const decode = s => { const t = document.createElement('textarea'); t.innerHTML = String(s ?? ''); return t.value; };

/* Devoirs Pronote affichés comme des tâches (ils vivent sur le serveur) */
/* Pronote renvoie parfois le même devoir plusieurs fois (donné sur 2 cours, texte retouché, espaces…) :
   on fusionne ceux qui ont la même matière, la même date et (presque) la même consigne. */
const normTxt = t => decode(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function uniqueDevoirs() {
  const out = [];
  for (const d of server.devoirs || []) {
    const subj = (prettySubj(d.subject) || '').toLowerCase(), txt = normTxt(d.description);
    const twin = out.find(o => o.due === d.due && o._s === subj && (o._t === txt || (txt.length > 12 && o._t.length > 12 && (o._t.startsWith(txt) || txt.startsWith(o._t)))));
    if (twin) { twin.done = twin.done || d.done; twin._ids.push(d.id); if (txt.length > twin._t.length) { twin.description = d.description; twin._t = txt; } continue; }
    out.push({ ...d, _s: subj, _t: txt, _ids: [d.id] });
  }
  return out;
}
function pronoteItems() {
  const done = new Set(settings.pronoteDone || []);
  return uniqueDevoirs().map(d => {
    const desc = decode(d.description || 'Devoir');
    return { id: 'pn:' + d.id, pronoteId: d.id, kind: 'devoir', source: 'pronote', subject: prettySubj(d.subject), due: d.due, time: null,
      title: desc.split('\n')[0].slice(0, 160), note: desc, done: !!d.done || d._ids.some(i => done.has(i)), allIds: d._ids, reminders: pronoteReminders(d.due) };
  });
}
function pronoteReminders(due) {
  const d = new Date(due + 'T00:00:00'), now = new Date();
  return [[3, 18, 0, 'J-3'], [1, 18, 0, 'Demain'], [0, 7, 30, "Aujourd'hui"]].map(([n, h, m, label]) => {
    const at = addDays(d, -n); at.setHours(h, m, 0, 0); return { at: at.toISOString(), label, fired: at <= now };
  });
}
/* Contrôles repérés dans les devoirs/tâches → 3 séances de révision (J-3, J-2, J-1 à 18h) */
const EXAM_RE = /(?:^|[^\p{L}])(contr[ôo]le|ds|interro(?:gation)?|[ée]valuation|[ée]val|examen|bac blanc|partiel)(?![\p{L}])/iu;
function examList() {
  const P = uniqueDevoirs().filter(d => !d.done && EXAM_RE.test(decode(d.description || ''))).map(d => ({ id: 'p' + d.id, subject: prettySubj(d.subject), due: d.due, what: decode(d.description || '').split('\n')[0].slice(0, 200) }));
  const T = tasks.filter(t => !t.deleted && !t.done && t.due && t.kind !== 'revision' && EXAM_RE.test(t.title + ' ' + (t.note || ''))).map(t => ({ id: 'o' + t.id, subject: t.subject || t.title, due: t.due, what: t.title }));
  return [...P, ...T];
}
function revisionItems() {
  const done = new Set(settings.revDone || []), today = ymd(new Date()), out = [];
  for (const x of examList()) for (const n of [3, 2, 1]) {
    const day = ymd(addDays(new Date(x.due + 'T12:00:00'), -n)), id = `rv:${x.id}:${n}`;
    if (day < today && !done.has(id)) continue; // séance passée : on ne la compte pas en retard
    const at = new Date(day + 'T18:00:00');
    out.push({ id, kind: 'revision', source: 'revision', examId: x.id, examDue: x.due, examWhat: x.what, subject: x.subject, due: day, time: '18:00', title: `Réviser ${x.subject} · contrôle ${n === 1 ? 'demain' : 'dans ' + n + ' j'}`,
      note: `Séance ${4 - n}/3, 30-45 min.\nContrôle le ${fmtDay(new Date(x.due + 'T12:00:00'))} : ${x.what}`, done: done.has(id), reminders: [{ at: at.toISOString(), label: 'Révision', fired: at <= new Date() }] });
  }
  return out;
}
const allItems = () => [...tasks.filter(t => !t.deleted), ...pronoteItems(), ...revisionItems()];
const active = () => allItems().filter(t => !t.done);
const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.time || '').localeCompare(b.time || '');

/* ---------- Rappels réguliers ---------- */
function buildReminders(t) {
  const due = dueDate(t); if (!due) return [];
  const now = new Date();
  let plan = { leger: [7, 1, 0], normal: [14, 7, 3, 2, 1, 0], insistant: [21, 14, 10, 7, 5, 4, 3, 2, 1, 0] }[settings.intensite] || [14, 7, 3, 1, 0];
  if (t.repeat === 'daily' || t.repeat === 'weekdays') plan = [0];
  else if (t.repeat) plan = [1, 0];
  const out = [];
  for (const n of plan) {
    const at = startOfDay(addDays(due, -n));
    if (n === 0) {
      at.setHours(7, 30, 0, 0);
      if (t.time) { const pre = new Date(due.getTime() - (t.repeat ? 30 * 60e3 : 2 * 3600e3)); if (pre > now && pre > at) out.push({ at: pre.toISOString(), label: t.repeat ? 'Dans 30 min' : 'Dans 2 h', fired: false }); if (t.repeat) continue; }
    } else at.setHours(18, 0, 0, 0);
    if (at > now && at < due) out.push({ at: at.toISOString(), label: n === 0 ? "Aujourd'hui" : n === 1 ? 'Demain' : `J-${n}`, fired: false });
  }
  if (!out.length && due > now) { const soon = new Date(Math.min(now.getTime() + 3600e3, due.getTime() - 600e3)); if (soon > now) out.push({ at: soon.toISOString(), label: 'Bientôt', fired: false }); }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
const nextReminder = t => (t.reminders || []).find(r => !r.fired && new Date(r.at) > new Date());
function nextOccurrence(t) {
  const d = new Date(t.due + 'T12:00:00');
  const step = { daily: 1, weekly: 7, biweekly: 14 }[t.repeat];
  let n = step ? addDays(d, step) : t.repeat === 'monthly' ? new Date(d.getFullYear(), d.getMonth() + 1, d.getDate(), 12) : addDays(d, 1);
  if (t.repeat === 'weekdays') while (n.getDay() === 0 || n.getDay() === 6) n = addDays(n, 1);
  // si on coche en retard, on saute directement à la prochaine date à venir
  while (startOfDay(n) < startOfDay(new Date())) n = step ? addDays(n, step) : t.repeat === 'monthly' ? new Date(n.getFullYear(), n.getMonth() + 1, n.getDate(), 12) : addDays(n, 1);
  return ymd(n);
}

/* ---------- Serveur ---------- */
async function api(action, body = {}) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-orbit-app': key || '' }, body: JSON.stringify({ action, ...body }) });
  if (r.status === 401) { const e = new Error('Code d\'accès incorrect'); e.code = 401; throw e; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Serveur injoignable');
  return j;
}
async function extra(action, body = {}) {
  const r = await fetch(EXTRA, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-orbit-app': key || '' }, body: JSON.stringify({ action, ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Serveur injoignable');
  return j;
}
function setOnline(v) { online = v; $('#offline').classList.toggle('on', !v); }
function persist() { store.set('orbit.tasks', tasks); store.set('orbit.settings', settings); store.set('orbit.server', server); store.set('orbit.outbox', outbox); }

let pulling = false;
async function pull(full = false, forceCal = false) {
  if (!key || pulling) return; pulling = true;
  try {
    await flush();
    const r = await api('state', { since: full ? null : lastSince, forceCal });
    setOnline(true);
    if (full || !lastSince) tasks = r.tasks.filter(t => !t.deleted);
    else for (const t of r.tasks) {
      if (outbox.put[t.id]) continue; // un changement local plus récent attend d'être envoyé
      const i = tasks.findIndex(x => x.id === t.id);
      if (t.deleted) { if (i >= 0) tasks.splice(i, 1); } else if (i >= 0) tasks[i] = t; else tasks.push(t);
    }
    if (r.settings && !outbox.settings) { settings = Object.assign(settings, r.settings); applyAccent(); }
    server = { devoirs: r.devoirs, cours: r.cours, gcal: r.gcal, gcalAt: r.gcalAt, gcalError: r.gcalError, pronote: r.pronote, flags: r.flags, me: r.me };
    lastSince = r.now; store.set('orbit.since', lastSince); synced = true;
    persist(); render(); scheduleRappels();
  } catch (e) {
    if (e.code === 401) showGate("Ce code ne marche plus. Entre le nouveau code d'accès.");
    else setOnline(false);
  } finally { pulling = false; }
}
let flushing = null;
async function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    const put = Object.values(outbox.put), sent = put.map(t => JSON.stringify(t)), del = [...outbox.del], st = outbox.settings;
    if (!put.length && !del.length && !st) return;
    try {
      if (put.length) await api('put_tasks', { tasks: put });
      if (del.length) await api('del_tasks', { ids: del });
      if (st) await api('put_settings', { settings });
      put.forEach((t, i) => { if (outbox.put[t.id] && JSON.stringify(outbox.put[t.id]) === sent[i]) delete outbox.put[t.id]; });
      outbox.del = outbox.del.filter(id => !del.includes(id));
      if (st) outbox.settings = false;
      persist(); setOnline(true);
    } catch (e) { setOnline(false); }
  })();
  try { await flushing; } finally { flushing = null; }
}
let flushTimer = null;
const queueFlush = () => { clearTimeout(flushTimer); flushTimer = setTimeout(flush, 600); };

function saveTask(t) {
  if (String(t.id).startsWith('pn:')) return setPronoteDone(t.allIds || t.pronoteId, t.done);
  if (String(t.id).startsWith('rv:')) { const s = new Set(settings.revDone || []); if (t.done) s.add(t.id); else s.delete(t.id); settings.revDone = [...s].slice(-200); saveSettings(); render(); return; }
  const i = tasks.findIndex(x => x.id === t.id); if (i < 0) tasks.push(t); else tasks[i] = t;
  outbox.put[t.id] = t; persist(); render(); queueFlush(); scheduleRappels();
}
function removeTask(id) {
  tasks = tasks.filter(t => t.id !== id); delete outbox.put[id]; outbox.del.push(id);
  persist(); render(); queueFlush(); scheduleRappels();
}
function saveSettings() { outbox.settings = true; persist(); applyAccent(); queueFlush(); }
function setPronoteDone(pid, done) {
  const s = new Set(settings.pronoteDone || []); for (const id of [].concat(pid)) { if (done) s.add(id); else s.delete(id); }
  settings.pronoteDone = [...s]; saveSettings(); render(); scheduleRappels();
}
function completeTask(t, done = true) {
  if (done && t.repeat && t.due && !/^(pn|rv):/.test(String(t.id))) {
    const next = { ...t, id: uid(), due: nextOccurrence(t), done: false, doneAt: null, createdAt: new Date().toISOString() };
    next.reminders = buildReminders(next);
    saveTask({ ...t, done: true, doneAt: new Date().toISOString(), repeat: null, repeatedTo: next.id });
    saveTask(next);
    toast('Fait', `Prochaine fois : ${fmtDay(dueDate(next))}`, { ok: true });
    return;
  }
  saveTask({ ...t, done, doneAt: done ? new Date().toISOString() : null });
  if (done) toast('Fait', t.title, { ok: true, undo: () => saveTask({ ...t, done: false, doneAt: null }) });
}

/* Rappels Discord : envoyés au serveur, qui t'envoie un MP même app fermée */
let rappelTimer = null, rappelLast = '';
const scheduleRappels = () => { clearTimeout(rappelTimer); rappelTimer = setTimeout(syncRappels, 3000); };
async function syncRappels() {
  if (!key) return;
  const now = new Date(), rows = [];
  for (const t of tasks) {
    if (t.done || !t.reminders) continue;
    for (const r of t.reminders) {
      if (r.fired || new Date(r.at) <= now) continue;
      rows.push({ id: 'o:' + t.id + ':' + r.at, title: `${r.label} · ${t.title}`, body: (t.subject ? t.subject + ' · ' : '') + 'Échéance : ' + fmtDay(dueDate(t)) + (t.time ? ' à ' + t.time : '') + (t.note ? '\n' + t.note : ''), at: r.at });
    }
  }
  const body = { rows, doneP: settings.pronoteDone || [] }, sig = JSON.stringify(body);
  if (sig === rappelLast) return;
  try { await api('rappels', body); rappelLast = sig; } catch (e) { /* réessai au prochain changement */ }
}

/* ---------- IA (Gemini via le serveur) ---------- */
async function ai(opts) {
  const r = await api('ai', opts);
  if (!r.ok) { const e = new Error(r.error); e.code = r.error; throw e; }
  return r.text || '';
}
async function aiJSON(opts) {
  const t = await ai({ ...opts, json: true });
  try { return JSON.parse(t); } catch (e) { const m = t.match(/[\[{][\s\S]*[\]}]/); if (m) return JSON.parse(m[0]); throw e; }
}
const todayCtx = () => { const d = new Date(); return `Nous sommes le ${fmtDay(d)} ${d.getFullYear()} (${ymd(d)}), il est ${fmtTime(d)}. Fuseau Europe/Paris.`; };

/* Une seule entrée : Orbit comprend si tu ajoutes quelque chose ou si tu poses une question. */
const AGENT_RULES = `Tu es l'assistant d'organisation intégré à l'appli « Orbit » d'un lycéen français. Tu tutoies, tu es concret et bref.
Le message peut être :
- un AJOUT (ex : « exposé à rendre vendredi », « sortir les poubelles chaque lundi », « rappelle-moi d'appeler le dentiste jeudi ») → intent "add" avec la ou les tâches ;
- une QUESTION ou une demande de conseil (ex : « qu'est-ce que je fais ce soir ? », « organise ma semaine ») → intent "chat" ;
- une demande de marquer quelque chose comme fait → intent "done" avec les id entre crochets ;
- une QUESTION DE COURS, une demande d'explication, d'aide sur un exercice ou de révision (ex : « explique-moi le discriminant », « c'est quoi le prétérit », « aide-moi sur l'exo 3 », « comment on calcule une moyenne pondérée ») → intent "cours" (laisse "reply" vide, un prof spécialisé répondra) ;
- une demande de FICHE de révision (ex : « fais-moi une fiche sur la forme canonique ») → intent "fiche" avec "study":{"subject":"matière ou null","topic":"sujet"} ;
- une demande d'être INTERROGÉ ou de QUIZ (ex : « interroge-moi sur l'allemand », « quiz sur la Boétie ») → intent "quiz" avec "study":{"subject":"matière ou null","topic":"sujet ou null"} ;
- une question de TRAJET, BUS ou TRANSPORT (ex : « je veux rentrer à 17h », « comment aller à la gare de Rambouillet samedi à 14h », « quel bus pour être au lycée avant 9h demain », « je suis chez un pote à Clairefontaine, comment je rentre ? ») → intent "trajet" avec "trip":{"from":"…","to":"…","datetime":"YYYY-MM-DDTHH:MM" ou null (null = maintenant),"represents":"departure" ou "arrival"}. Pour from/to, mets "maison" (là où il dort ce jour-là, l'app le sait), "lycee", "ici" (sa position GPS : seulement s'il dit « d'ici », « où je suis », « ma position », ou s'il ne dit pas d'où il part alors qu'il n'est visiblement pas chez lui), ou un lieu précis en texte avec la ville (ex : "Gare de Rambouillet", "Mairie, Clairefontaine-en-Yvelines", "Paris Montparnasse"). « rentrer » = vers "maison". « arriver avant/pour 9h » = represents "arrival". Sans heure ni lieu de départ précisés pour « rentrer » après les cours, part du "lycee" à la fin de ses cours. Laisse "reply" vide ;
- une demande de MODIFIER, DÉCALER ou SUPPRIMER (ex : « décale tout à demain », « mets le dentiste à 17h », « supprime le rappel poubelles », « renomme X ») → intent "edit" : "edits" liste les changements [{"id":"…","due":"YYYY-MM-DD","time":"HH:MM"|null,"title":"…"}] (ne mets que les champs qui changent ; "time":null enlève l'heure) et "remove" les id à supprimer. « tout » = toutes les tâches concernées de la liste ci-dessous. Les devoirs Pronote (id qui commence par pn:) et les révisions (rv:) ne peuvent être ni décalés ni supprimés : dis-le dans "reply" et propose de les marquer faits.
Pour "chat", "reply" est une VRAIE réponse complète et utile, pas une phrase d'introduction : par exemple pour « organise ma semaine », donne le plan jour par jour (lundi, mardi…) en t'appuyant sur ses cours, devoirs, tâches et agenda ci-dessous, avec des créneaux concrets (ex : « 17h30-18h15 : exo de maths ») et les priorités. Mets en forme pour un téléphone : phrases courtes, un petit titre par jour ou par partie (ex : « Lundi : » seul sur sa ligne), des tirets « - » pour les listes, **gras** pour l'essentiel (matière, priorité), horaires au format 17h30-18h15. Pas de tableau, pas de #. Pour "add", "done" et "edit", "reply" est une phrase courte qui dit ce que tu as fait.
Style de "reply" : commence directement par l'info ou le plan, sans phrase d'intro (« Voici… », « Bien sûr ! », « Super question »). Pas de formule de fin (« N'hésite pas… », « Bon courage ! », « En résumé »), pas d'emoji, pas de tournure « ce n'est pas X, c'est Y », pas de listes de trois adjectifs. Donne des faits vérifiables : heure, matière, durée estimée, date. Une question de relance au maximum, seulement si elle est utile.
Dates : une date sans année = la PROCHAINE occurrence. « avant le X » = date limite X. Répétition : daily, weekdays, weekly, biweekly, monthly ou null.
Réponds UNIQUEMENT en JSON : {"intent":"add"|"chat"|"done"|"edit"|"cours"|"fiche"|"quiz"|"trajet","reply":"ta réponse","study":null,"trip":null,"tasks":[{"title":"titre court, majuscule, sans la date","due":"YYYY-MM-DD"|null,"time":"HH:MM"|null,"kind":"tache"|"devoir"|"rdv","subject":null,"repeat":null,"note":null}],"done":["id"],"edits":[],"remove":[]}`;
function taskFrom(x, source) {
  const t = { id: uid(), title: cap(String(x.title || '').trim()) || 'Sans titre', due: x.due || null, time: x.time || null, kind: ['tache', 'devoir', 'rdv'].includes(x.kind) ? x.kind : 'tache', subject: x.subject || null, repeat: REPEATS[x.repeat] ? x.repeat || null : null, note: x.note || null, done: false, createdAt: new Date().toISOString(), source };
  if (t.repeat && !t.due) t.due = ymd(new Date());
  t.reminders = buildReminders(t);
  return t;
}
async function agent(text, history = []) {
  const r = await aiJSON({ system: AGENT_RULES + '\n\n' + snapshotCtx() + busCtx(), messages: [...history.slice(-10), { role: 'user', content: text }] });
  return { intent: r.intent || (r.tasks?.length ? 'add' : 'chat'), reply: String(r.reply || ''), tasks: Array.isArray(r.tasks) ? r.tasks.filter(x => x && x.title) : [], done: Array.isArray(r.done) ? r.done : [], edits: Array.isArray(r.edits) ? r.edits.filter(x => x && x.id) : [], remove: Array.isArray(r.remove) ? r.remove.map(String) : [], study: r.study && typeof r.study === 'object' ? r.study : {}, trip: r.trip && typeof r.trip === 'object' ? r.trip : null };
}
// Applique les modifications demandées à l'IA ; renvoie un résumé lisible.
function applyEdits(a) {
  const notes = [], moved = [], gone = [], locked = [];
  for (const e of a.edits) {
    const t = tasks.find(x => x.id === e.id && !x.deleted);
    if (!t) { if (/^(pn|rv):/.test(e.id)) locked.push(allItems().find(x => x.id === e.id)?.title || e.id); continue; }
    const nt = { ...t };
    if (typeof e.title === 'string' && e.title.trim()) nt.title = cap(e.title.trim());
    if (/^\d{4}-\d{2}-\d{2}$/.test(e.due || '')) nt.due = e.due;
    if (e.time === null || /^\d{2}:\d{2}$/.test(e.time || '')) { if ('time' in e) nt.time = e.time; }
    if (nt.due !== t.due || nt.time !== t.time) nt.reminders = buildReminders(nt);
    saveTask(nt); moved.push(nt.title + (nt.due ? ' → ' + dueLabel(nt).toLowerCase() + (nt.time ? ' à ' + nt.time.replace(':', 'h') : '') : ''));
  }
  for (const id of a.remove) { const t = tasks.find(x => x.id === id && !x.deleted); if (t) { removeTask(id); gone.push(t.title); } else if (/^(pn|rv):/.test(id)) locked.push(allItems().find(x => x.id === id)?.title || id); }
  if (moved.length) notes.push(`✓ **Modifié :**\n${moved.map(x => '- ' + x).join('\n')}`);
  if (gone.length) notes.push(`✓ **Supprimé :**\n${gone.map(x => '- ' + x).join('\n')}`);
  if (locked.length) notes.push(`Pas modifiable ici (Pronote / révision) : ${locked.join(', ')}. Tu peux les marquer faits.`);
  return notes;
}
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const noAcc = s => s.normalize('NFD').replace(/\p{M}/gu, '');
function localParse(text) {
  const s = text.toLowerCase(), now = startOfDay(new Date()); let due = null, time = null, repeat = null, m;
  if (/tous les (jours|soirs|matins)|chaque (jour|soir|matin)/.test(s)) { repeat = 'daily'; due = now; }
  else if (/en semaine/.test(s)) { repeat = 'weekdays'; due = now; }
  else if (/toutes les 2 semaines|une semaine sur deux/.test(s)) repeat = 'biweekly';
  else if (/chaque mois|tous les mois/.test(s)) repeat = 'monthly';
  else if (/chaque (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)|tous les (lundis|mardis|mercredis|jeudis|vendredis|samedis|dimanches)|chaque semaine|toutes les semaines/.test(s)) repeat = 'weekly';
  if (!due) {
    if (/après[- ]demain/.test(s)) due = addDays(now, 2);
    else if (/\bdemain\b/.test(s)) due = addDays(now, 1);
    else if (/aujourd'?hui|ce soir/.test(s)) due = now;
    else if ((m = s.match(/dans (\d+) jours?/))) due = addDays(now, +m[1]);
    else if ((m = s.match(/(\d{1,2})(?:er)? (janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)/))) {
      const mi = MOIS.findIndex(x => noAcc(x) === noAcc(m[2])); due = new Date(now.getFullYear(), mi, +m[1]); if (due < now) due.setFullYear(due.getFullYear() + 1);
    } else if ((m = s.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/))) {
      due = new Date(m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.getFullYear(), +m[2] - 1, +m[1]); if (!m[3] && due < now) due.setFullYear(due.getFullYear() + 1);
    } else for (let i = 0; i < 7; i++) if (s.includes(JOURS[i])) { due = addDays(now, (i - now.getDay() + 7) % 7 || 7); break; }
  }
  if (repeat && !due) due = now;
  if ((m = s.match(/(\d{1,2})h(\d{2})?/))) time = String(m[1]).padStart(2, '0') + ':' + (m[2] || '00');
  let title = text.replace(/\b(avant|pour|le|d'ici|à rendre|tous les|toutes les|chaque)\b.*$/i, '').trim() || text;
  return { title: cap(title), due: due ? ymd(due) : null, time, repeat, kind: /(devoir|exo|exercice|dm|dissert|exposé|réviser|contrôle|interro|bac)/.test(s) ? 'devoir' : 'tache', subject: null, note: null };
}

/* ---------- Saisie rapide ---------- */
let pendingList = [];
const GO_HTML = `${ICON.plus}<span>Ajouter</span>`;
$('#capMic').onclick = e => toggleVoice(e.currentTarget, $('#capIn'));
$('#capForm').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('#capIn').value.trim(); if (!text) return;
  const btn = $('#capGo'); btn.disabled = true; btn.innerHTML = '<div class="spin"></div><span>…</span>';
  try {
    if (server.flags?.ai) {
      let a = null;
      try { a = await withTimeout(agent(text, chat), 50000); } catch (err) { a = null; }
      if (a && ['cours', 'fiche', 'quiz', 'trajet'].includes(a.intent)) { $('#capIn').value = ''; toggleCapture(false); go('ia'); ask(text, a); return; }
      if (a && a.intent === 'chat') { $('#capIn').value = ''; toggleCapture(false); chat.push({ role: 'user', content: text }, { role: 'assistant', content: a.reply || "Je n'ai pas compris, reformule ?", q: text }); saveChat(); if ($('#chatList')) paintChat(); go('ia'); return; }
      if (a && a.intent === 'done' && a.done.length) { $('#capIn').value = ''; toggleCapture(false); for (const id of a.done) { const t = allItems().find(x => x.id === id); if (t) completeTask(t, true); } return; }
      if (a && a.intent === 'edit' && (a.edits.length || a.remove.length)) { $('#capIn').value = ''; toggleCapture(false); const n = applyEdits(a); toast('C\'est fait', (a.reply || n.join(' ')).replace(/\*\*/g, '').slice(0, 120)); return; }
      if (a && a.tasks.length) { pendingList = a.tasks.map(x => taskFrom(x, 'rapide')); showPreview(true); return; }
    }
    const p = localParse(text);
    pendingList = [taskFrom({ ...p }, 'rapide')]; showPreview(false);
  } finally { btn.disabled = false; btn.innerHTML = GO_HTML; }
});
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, ko) => setTimeout(() => { const e = new Error('Trop long'); e.code = 'timeout'; ko(e); }, ms))]);
function showPreview(isAI) {
  const L = pendingList, pv = $('#preview'), nRem = L.reduce((n, t) => n + t.reminders.length, 0);
  pv.innerHTML = L.map(t => `<div class="pvItem"><div class="t">${esc(t.title)}</div>
    <div class="m">${t.due ? fmtDay(dueDate(t)) + (t.time ? ' à ' + t.time : '') : 'Pas de date'}${t.repeat ? ' · ' + REPEATS[t.repeat] : ''}${t.subject ? ' · ' + esc(t.subject) : ''}</div>
    <div class="m small">${t.reminders.length ? '🔔 ' + t.reminders.map(r => r.label).join(' · ') : 'Aucun rappel'}</div></div>`).join('')
    + `${isAI ? '' : '<div class="m small" style="margin-top:6px">Analyse simple (IA indisponible) : vérifie la date.</div>'}
    <div class="row"><button class="btn p" id="pvOk">${L.length > 1 ? `Ajouter les ${L.length}` : 'Ajouter'}${nRem ? ` · ${nRem} rappel${nRem > 1 ? 's' : ''}` : ''}</button>${L.length === 1 ? '<button class="btn" id="pvEdit">Modifier</button>' : ''}<button class="btn" id="pvNo">Annuler</button></div>`;
  pv.classList.add('show');
  const close = () => { pendingList = []; pv.classList.remove('show'); $('#capIn').value = ''; toggleCapture(false); };
  $('#pvOk').onclick = () => { const l = pendingList; close(); l.forEach(saveTask); toast(l.length > 1 ? `${l.length} tâches ajoutées` : 'Ajouté', nRem ? `${nRem} rappels programmés (Discord)` : 'Enregistré'); };
  $('#pvNo').onclick = () => { pendingList = []; pv.classList.remove('show'); toggleCapture(false); };
  const ed = $('#pvEdit'); if (ed) ed.onclick = () => { const t = pendingList[0]; close(); openEditor(t, true); };
}
function toggleCapture(force) {
  const on = typeof force === 'boolean' ? force : !document.body.classList.contains('capOpen');
  document.body.classList.toggle('capOpen', on);
  if (on) setTimeout(() => $('#capIn').focus(), 120); else $('#capIn').blur();
}

/* ---------- Navigation ---------- */
function buildNav() {
  const side = $('#sidenav'), bar = $('#tabbar');
  TABS.forEach(([k, label]) => {
    const b = el('button', '', `${ICON[k]}<span>${label}</span><span class="badge" data-badge="${k}" hidden></span>`);
    b.dataset.k = k; b.setAttribute('aria-label', label); b.onclick = () => go(k); side.appendChild(b);
  });
  ['aujourdhui', 'taches', 'devoirs', '+', 'agenda', 'bus', 'ia'].forEach(k => {
    if (k === '+') { const p = el('button', 'plus', ICON.plus); p.setAttribute('aria-label', 'Ajouter'); p.onclick = () => toggleCapture(); bar.appendChild(p); return; }
    const label = TABS.find(t => t[0] === k)[1];
    const b = el('button', '', `${ICON[k]}<span>${label}</span>`); b.dataset.k = k; b.setAttribute('aria-label', label); b.onclick = () => go(k); bar.appendChild(b);
  });
  $('#iaBtn').onclick = () => go('ia');
  addEventListener('resize', movePills);
  addEventListener('hashchange', () => { const h = location.hash.slice(1); if (TABS.some(t => t[0] === h) && h !== current) go(h, false); });
}
function movePills() {
  const sb = $(`#sidenav button[data-k="${current}"]`), sp = $('#sidenav .pill');
  if (sb) sp.style.transform = `translateY(${sb.offsetTop}px)`;
  const tb = $(`#tabbar button[data-k="${current}"]`), tp = $('#tabbar .pill');
  tp.style.opacity = tb ? 1 : 0;
  if (tb) { tp.style.width = tb.offsetWidth + 'px'; tp.style.transform = `translateX(${tb.offsetLeft}px)`; }
}
function go(k, push = true) {
  current = k;
  document.querySelectorAll('#sidenav button,#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + k));
  document.body.classList.toggle('onIA', k === 'ia');
  if (push) history.replaceState(null, '', '#' + k);
  movePills(); render();
}
function setHeader() {
  const top = $('#top'), d = new Date();
  if (current === 'aujourdhui') {
    const n = active().filter(t => { const x = daysLeft(t); return x !== null && x <= 1; }).length;
    top.classList.add('big');
    $('#title').textContent = cap(d.toLocaleDateString('fr-FR', { weekday: 'long' })) + ' ' + d.getDate();
    $('#date').textContent = d.toLocaleDateString('fr-FR', { month: 'long' }) + (n ? ` · ${n} chose${n > 1 ? 's' : ''} à faire` : " · rien d'urgent");
  } else {
    top.classList.remove('big');
    $('#title').textContent = TABS.find(t => t[0] === current)[1];
    $('#date').textContent = cap(fmtDay(d));
  }
  renderRibbon();
  fitTitle();
}
/* Signature : le ruban de ta journée (un segment coloré par cours, curseur blanc = maintenant) */
let ribbonSig = '', ribbonDrawn = false;
function renderRibbon() {
  const r = $('#ribbon'); if (!r) return;
  const now = new Date(), sortC = L => L.slice().sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  // Journée de cours finie (ou pas de cours aujourd'hui) : on affiche le prochain jour de cours
  let C = sortC(coursOn(startOfDay(now))), ahead = null;
  if (!C.length || now >= new Date(Math.max(...C.map(c => new Date(c.ends_at).getTime())))) {
    C = [];
    for (let i = 1; i <= 7 && !C.length; i++) { const d = addDays(startOfDay(now), i); C = sortC(coursOn(d)); if (C.length) ahead = { d, i }; }
  }
  if (!C.length) { r.hidden = true; ribbonSig = ''; return; }
  const t0 = new Date(C[0].starts_at).getTime(), t1 = Math.max(...C.map(c => new Date(c.ends_at).getTime())), span = Math.max(1, t1 - t0);
  const pc = t => Math.max(0, Math.min(100, (t - t0) / span * 100));
  const real = C.filter(c => !isOff(c)), cur = real.find(c => new Date(c.starts_at) <= now && now < new Date(c.ends_at)), nxt = real.find(c => new Date(c.starts_at) > now);
  const segs = C.map((c, i) => { const a = new Date(c.starts_at).getTime(), b = new Date(c.ends_at).getTime(), off = isOff(c), n = prettySubj(c.subject) || 'Cours';
    return `<i class="rbSeg${off ? ' off' : ''}${!off && b <= now ? ' past' : ''}" style="--i:${i};left:${pc(a)}%;width:calc(${pc(b) - pc(a)}% - 2px);--c:${subjColor(n)}" title="${esc(n)} ${fmtTime(c.starts_at)}"></i>`; }).join('');
  const inDay = !ahead && now.getTime() >= t0 && now.getTime() <= t1;
  const dayName = ahead ? (ahead.i === 1 ? 'Demain' : cap(ahead.d.toLocaleDateString('fr-FR', { weekday: 'long' }))) : '';
  const mid = ahead ? `<b>${dayName}, ${real.length} cours${real[0] ? ', début à ' + fmtTime(real[0].starts_at) : ''}</b>` : cur ? `<b>${esc(prettySubj(cur.subject) || 'Cours')}${cur.room ? ' en ' + esc(cur.room) : ''}, jusqu'à ${fmtTime(cur.ends_at)}</b>` : nxt ? `<b>Ensuite ${esc(prettySubj(nxt.subject) || 'cours')} à ${fmtTime(nxt.starts_at)}</b>` : now.getTime() > t1 ? '<b>Cours finis</b>' : '';
  const sig = segs + mid;
  if (sig !== ribbonSig) {
    ribbonSig = sig;
    r.innerHTML = `<div class="rbTrack" role="img" aria-label="${real.length} cours ${ahead ? dayName.toLowerCase() : "aujourd'hui"}, de ${fmtTime(C[0].starts_at)} à ${fmtTime(new Date(t1))}">${segs}<b class="rbNow" id="rbNow"></b></div><div class="rbLbl"><span>${fmtTime(C[0].starts_at)}</span>${mid}<span>${fmtTime(new Date(t1))}</span></div>`;
    if (!ribbonDrawn) { ribbonDrawn = true; r.classList.add('draw'); setTimeout(() => r.classList.remove('draw'), 1600); }
  }
  r.hidden = false;
  const k = $('#rbNow'); k.style.display = inDay ? '' : 'none'; k.style.left = pc(now.getTime()) + '%';
}
setInterval(() => { if (document.visibilityState === 'visible') renderRibbon(); }, 30e3);
// Le grand titre rétrécit pour toujours tenir à côté des boutons (« Dimanche 15 » sur téléphone)
function fitTitle() {
  const h = $('#title'); h.style.transition = 'none'; h.style.fontSize = '';
  let fs = parseFloat(getComputedStyle(h).fontSize), n = 0;
  while (h.scrollWidth > h.clientWidth + 1 && fs > 26 && n++ < 40) { fs -= 2; h.style.fontSize = fs + 'px'; }
  void h.offsetWidth; h.style.transition = '';
}
addEventListener('resize', () => fitTitle());
document.fonts?.ready.then(() => fitTitle());

/* ---------- Rendu ---------- */
function itemHTML(t, opts = {}) {
  const n = nextReminder(t), cls = dueClass(t);
  const lead = (t.kind === 'devoir' || t.kind === 'revision') && t.subject && !opts.noSq ? subjBadge(t.subject) : '';
  return `<div class="item ${t.done ? 'done' : ''}" data-id="${esc(t.id)}">
    <button class="check" data-act="toggle" aria-label="${t.done ? 'Remettre à faire' : 'Terminer'}">${ICON.check}</button>${lead}
    <div class="bd" data-act="open"><div class="tt">${esc(t.title)}</div>
      <div class="mm">${t.due && !opts.noDue ? `<span class="tag ${cls}">${dueLabel(t)}</span>` : ''}${t.kind === 'devoir' && !lead ? `<span class="tag acc">${esc(t.subject || 'Devoir')}</span>` : ''}${t.kind === 'rdv' ? '<span class="tag acc">RDV</span>' : ''}${t.repeat ? `<span class="tag rep">${ICON.repeat.replace('<svg', '<svg class="ti"')}${esc(REPEATS[t.repeat])}</span>` : ''}${n && !t.done && !opts.noRem ? `<span class="rem">${ICON.bell.replace('<svg', '<svg class="ti"')}${new Date(n.at).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')} ${fmtTime(n.at)}</span>` : ''}</div></div>
    <button class="more" data-act="open" aria-label="Détails">${ICON.dots}</button></div>`;
}
function bindList(root) {
  root.querySelectorAll('.item[data-id]').forEach(it => {
    const t = allItems().find(x => x.id === it.dataset.id); if (!t) return;
    it.querySelectorAll('[data-act]').forEach(b => b.onclick = ev => {
      ev.stopPropagation();
      if (b.dataset.act === 'toggle') { it.classList.toggle('done'); setTimeout(() => completeTask(t, !t.done), 260); }
      else openEditor(t);
    });
  });
}
function render() {
  setHeader();
  const late = active().filter(t => daysLeft(t) < 0).length;
  const b = $('[data-badge="taches"]'); if (b) { b.hidden = !late; b.textContent = late; }
  const hw = active().filter(t => t.kind === 'devoir').length;
  const b2 = $('[data-badge="devoirs"]'); if (b2) { b2.hidden = !hw; b2.textContent = hw; }
  const st = [[online, 'Synchro'], [server.flags?.ai, 'IA'], [server.flags?.ical, 'Google Agenda'], [server.pronote?.connected && !server.pronote?.last_error, 'Pronote']];
  $('#status').innerHTML = st.map(([on, l]) => `<span class="dot ${on ? 'on' : ''}" title="${l} : ${on ? 'actif' : 'inactif'}"></span>`).join('');
  if (current === 'ia' && asking) return; // la conversation se met à jour toute seule à la réponse
  ({ aujourdhui: rToday, taches: rTasks, devoirs: rHomework, agenda: rAgenda, ia: rAI, bus: rBus })[current]();
}
function coursOn(d) { return (server.cours || []).filter(c => sameDay(c.starts_at, d)); }
// Les « 📚 … (MATIÈRE) » de Google Agenda sont d'anciennes copies des devoirs Pronote faites par la 1re version d'Orbit : on les masque (doublons)
const gcalEvents = () => (server.gcal || []).filter(e => !/^📚/u.test(e.title || ''));
function eventsOn(d) { const a = startOfDay(d), b = addDays(a, 1); return gcalEvents().filter(e => e.allDay ? new Date(e.start) < b && new Date(e.end) > a : sameDay(e.start, d)); }
const teacherName = t => t ? String(t).split(',')[0].trim().replace(/^(\S+)\s+(\S)\.?$/, (m, a, b) => cap(a.toLowerCase()) + ' ' + b + '.') : '';
function coursHTML(c) {
  const s = prettySubj(c.subject) || 'Cours';
  const why = c.status && !/^annul/i.test(c.status) ? c.status : '';
  const ct = contenuFor(c), ck = ct ? ` data-ck="${ct.id}"` : '';
  if (isOff(c)) return `<div class="item cours canceled"${ck}>${subjBadge(s, 'sq', true)}<div class="bd"><div class="cancelTop"><span class="tag cancel">Annulé</span>${why ? `<b>${esc(why)}</b>` : ''}</div><div class="tt">${esc(s)}</div><div class="mm"><span>${fmtTime(c.starts_at)} – ${fmtTime(c.ends_at)}</span>${c.teacher ? `<span>${esc(teacherName(c.teacher))}</span>` : ''}</div></div></div>`;
  return `<div class="item cours${ct ? ' hasC' : ''}"${ck}>${subjBadge(s)}<div class="bd"><div class="tt">${esc(s)}${ct ? `<span class="cBadge">${ICON.book}Cours</span>` : ''}</div><div class="mm"><span class="tag cours">${fmtTime(c.starts_at)} – ${fmtTime(c.ends_at)}</span>${c.room ? `<span>${esc(c.room)}</span>` : ''}${c.teacher ? `<span>${esc(teacherName(c.teacher))}</span>` : ''}${c.status ? `<span class="tag soon">${esc(c.status)}</span>` : ''}</div></div></div>`;
}
function evHTML(e) {
  return `<div class="item"><div class="bar gbar"></div><div class="bd"><div class="tt">${esc(e.title)}</div><div class="mm"><span class="tag">${e.allDay ? 'Journée' : fmtTime(e.start) + (e.end ? ' – ' + fmtTime(e.end) : '')}</span>${e.location ? `<span>${esc(e.location)}</span>` : ''}<span class="tag ok">Google</span></div></div></div>`;
}


/* ---------- Bus : trajets maison ↔ lycée (Île-de-France Mobilités) ---------- */
const HOMES = { ponthevrard: 'Ponthévrard', starnoult: 'Saint-Arnoult' };
// Garde alternée : la semaine change le vendredi soir (après les cours).
// Période = du vendredi soir au vendredi soir suivant. Réf. : vendredi 5 janvier 2024.
const daysFromRef = d => Math.round((startOfDay(d) - new Date(2024, 0, 5)) / 864e5);
const periodOfDay = d => Math.floor((daysFromRef(d) - 0.5) / 7); // le vendredi (journée) appartient encore à l'ancienne semaine
const periodNow = (t = new Date()) => periodOfDay(t) + (t.getDay() === 5 && t.getHours() >= 16 ? 1 : 0);
function homeFor(d, leg = 'aller') {
  const b = settings.bus; if (!b || !HOMES[b.ref]) return null;
  if (b.period == null) { b.period = periodNow(); delete b.week; saveSettings(); } // ancien réglage (semaine du lundi)
  const p = leg === 'now' ? periodNow(d) : periodOfDay(d) + (leg === 'retour' && d.getDay() === 5 ? 1 : 0);
  const odd = ((p - b.period) % 2 + 2) % 2;
  return odd ? (b.ref === 'ponthevrard' ? 'starnoult' : 'ponthevrard') : b.ref;
}
// Trajet habituel du matin (arrêt de départ + heure du 1er bus)
const HABIT = { starnoult: { stop: /mairie/i, time: '07:38' }, ponthevrard: { stop: /mairie/i, time: '07:21' } };
const isHabit = (j, home) => { const h = HABIT[home], f = j.sections.find(x => x.type === 'pt'); if (!h || !f || !h.stop.test(f.from)) return false; const [H, M] = h.time.split(':').map(Number), t = new Date(f.dep); return Math.abs(t.getHours() * 60 + t.getMinutes() - H * 60 - M) <= 4; };
const navDT = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`; };
const busCache = new Map();
async function busCall(action, body, ttl = 180e3) {
  const k = action + JSON.stringify(body), hit = busCache.get(k);
  if (hit && Date.now() - hit.t < ttl) return hit.p;
  const p = fetch(BUSFN, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-orbit-app': key || '' }, body: JSON.stringify({ action, ...body }) })
    .then(r => r.json()).then(j => { if (!j.ok) throw new Error(j.error || 'Bus indisponible'); return j; });
  busCache.set(k, { t: Date.now(), p }); p.catch(() => busCache.delete(k));
  return p;
}
// Le jour de cours qui compte : aujourd'hui tant que ce n'est pas fini (+1 h 30 pour rentrer), sinon le prochain
function busDay(now = new Date()) {
  for (let i = 0; i <= 7; i++) {
    const d = addDays(startOfDay(now), i), C = coursOn(d).filter(c => !isOff(c)).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    if (!C.length) continue;
    const first = new Date(C[0].starts_at), last = new Date(Math.max(...C.map(c => new Date(c.ends_at).getTime())));
    if (i === 0 && now > new Date(last.getTime() + 90 * 6e4)) continue;
    return { d, i, first, last, firstSubj: prettySubj(C[0].subject) || 'Cours' };
  }
  return null;
}
async function busTrips(day) {
  const home = homeFor(day.d, 'aller'), homeBack = homeFor(day.d, 'retour'); if (!home) return null;
  const now = new Date();
  const goTarget = new Date(day.first.getTime() - 5 * 6e4);
  let aller = null;
  if (now < day.first) {
    const h = HABIT[home], [H, M] = (h?.time || '07:00').split(':').map(Number);
    const habitAt = new Date(day.d); habitAt.setHours(H, M - 15, 0, 0);
    const [A, B] = await Promise.all([
      busCall('journeys', { from: home, to: 'lycee', datetime: navDT(goTarget), represents: 'arrival', count: 3 }).catch(() => ({ journeys: [], disruptions: [] })),
      busCall('journeys', { from: home, to: 'lycee', datetime: navDT(habitAt < goTarget ? habitAt : new Date(day.first.getTime() - 3 * 36e5)), represents: 'departure', count: 3 }).catch(() => ({ journeys: [], disruptions: [] })),
    ]);
    const seen = new Set(), all = [...A.journeys, ...B.journeys].filter(j => { const k = j.dep + j.arr; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => a.dep.localeCompare(b.dep));
    all.forEach(j => { j.habit = isHabit(j, home); });
    aller = { journeys: all.filter(j => new Date(j.dep) > new Date(now.getTime() - 2 * 6e4)).slice(0, 4), disruptions: [...(A.disruptions || []), ...(B.disruptions || [])] };
    aller.late = !all.some(j => new Date(j.arr) <= day.first);
  }
  const back = new Date(Math.max(day.last.getTime() + 5 * 6e4, now.getTime()));
  const retour = await busCall('journeys', { from: 'lycee', to: homeBack, datetime: navDT(back), represents: 'departure', count: 3 });
  return { home, homeBack, aller, retour, target: day.first };
}
// Le trajet à mettre en avant le matin : l'habituel s'il existe, sinon le dernier qui arrive à l'heure
const bestAller = (L, first) => L.journeys.find(j => j.habit) || L.journeys.filter(j => new Date(j.arr) <= first).pop() || L.journeys[0];
const minsTo = t => Math.round((new Date(t) - Date.now()) / 6e4);
const inMin = m => m <= 0 ? 'maintenant' : m < 60 ? `dans ${m} min` : `dans ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
const lineChip = l => `<span class="lnChip" style="--lc:${l?.color || '#5B8CFF'};--lt:${l?.text || '#fff'}">${ICON.bus}${esc(l?.code || 'Bus')}</span>`;
const firstPt = j => j.sections.find(x => x.type === 'pt');
// Résumé lisible d'un trajet : les bus (où monter, où descendre), les correspondances, la marche au début et à la fin
function tripPlan(j) {
  const S = j.sections, pts = S.filter(x => x.type === 'pt');
  if (!pts.length) return null;
  const i0 = S.indexOf(pts[0]), iN = S.indexOf(pts[pts.length - 1]);
  const walkBefore = S.slice(0, i0).filter(x => x.type === 'walk').reduce((n, x) => n + x.duration, 0);
  const walkAfter = S.slice(iN + 1).filter(x => x.type === 'walk').reduce((n, x) => n + x.duration, 0);
  const legs = pts.map((x, k) => ({ ...x, wait: k ? Math.round((new Date(x.dep) - new Date(pts[k - 1].arr)) / 6e4) : 0 }));
  return { legs, walkBefore: Math.round(walkBefore / 60), walkAfter: Math.round(walkAfter / 60), board: new Date(pts[0].dep), arr: new Date(j.arr), leave: new Date(j.dep) };
}
const destLbl = t => !t ? '' : /square pierre fite|lyc[ée]e/i.test(t) ? 'au lycée' : /grande rue|rue du louvre/i.test(t) ? 'chez toi' : 'à ' + t;
function journeyHTML(j, target, open, toLbl = '') {
  const P = tripPlan(j); if (!P) return '';
  const late = target && P.arr > target, m = Math.round((P.board - Date.now()) / 6e4), f = P.legs[0];
  const chain = P.legs.map(x => lineChip(x.line)).join('<i class="jrSep"></i>');
  const steps = [
    P.walkBefore >= 3 ? `<li class="w"><i>${ICON.walk}</i><span>Pars à <b>${fmtTime(P.leave)}</b> : ${P.walkBefore} min à pied jusqu'à l'arrêt ${esc(f.from)}</span></li>` : '',
    ...P.legs.map((x, k) => `${k ? `<li class="w"><i></i><span>Correspondance : ${x.wait} min d'attente${x.from !== P.legs[k - 1].to ? `, va à l'arrêt ${esc(x.from)}` : ''}</span></li>` : ''}
      <li class="b"><i>${lineChip(x.line)}</i><span>Monte à <b>${fmtTime(x.dep)}</b> à l'arrêt <b>${esc(x.from)}</b>${x.line?.direction ? `<small>direction ${esc(x.line.direction)}</small>` : ''}<br>Descends à <b>${esc(x.to)}</b><small>vers ${fmtTime(x.arr)}</small></span></li>`),
    `<li class="w"><i>${P.walkAfter >= 1 ? ICON.walk : ''}</i><span>${P.walkAfter >= 1 ? `${P.walkAfter} min à pied, ` : ''}arrivée ${esc(toLbl || destLbl(j.sections.at(-1)?.to))} à <b>${fmtTime(P.arr)}</b></span></li>`,
  ].join('');
  return `<details class="jr${late ? ' late' : ''}${j.habit ? ' hab' : ''}"${open ? ' open' : ''}><summary>
      <div class="jrT"><b>${fmtTime(f.dep)}</b><span>à ${esc(f.from)}</span></div>
      <div class="jrM"><div class="jrC">${chain}${j.habit ? '<span class="habit">habituel</span>' : ''}</div><small>Arrivée ${fmtTime(P.arr)}${late ? ' <em>(en retard pour le cours)</em>' : ''}</small></div>
      <div class="jrIn">${m > -2 && m < 600 ? inMin(m) : ''}</div></summary>
    ${sameDay(f.dep, new Date()) && f.stopId ? `<div class="jrRT" data-stop="${esc(f.stopId)}" data-line="${esc(f.lineId || '')}" data-dep="${esc(f.dep)}" data-code="${esc(f.line?.code || '')}"></div>` : ''}
    <ol class="jrSteps">${steps}</ol></details>`;
}
// Temps réel : une seule phrase sur TON bus (à l'heure / en retard)
async function fillRealtime(root) {
  for (const el of root.querySelectorAll('.jrRT[data-stop]:empty')) {
    try {
      const r = await busCall('next', { stopId: el.dataset.stop, lineId: el.dataset.line }, 30e3);
      const want = new Date(el.dataset.dep).getTime();
      const P = r.passes.map(p => ({ t: new Date(p.expected || p.aimed).getTime(), a: p.aimed ? new Date(p.aimed).getTime() : null }));
      const match = P.length ? P.reduce((b, p) => Math.abs((p.a ?? p.t) - want) < Math.abs((b.a ?? b.t) - want) ? p : b) : null;
      if (!match || Math.abs((match.a ?? match.t) - want) > 15 * 6e4) { el.remove(); continue; }
      const delay = match.a ? Math.round((match.t - match.a) / 6e4) : 0;
      el.innerHTML = `<i class="liveDot"></i>En direct : le ${esc(el.dataset.code)} passe à <b>${fmtTime(match.t)}</b>${delay >= 2 ? ` <em>${delay} min de retard</em>` : delay <= -2 ? ` <em>${-delay} min d'avance</em>` : ', à l\'heure'}`;
      el.classList.toggle('bad', Math.abs(delay) >= 2);
    } catch { el.remove(); }
  }
}
function busWeekSeg() {
  const cur = homeFor(new Date(), 'now');
  return `<div class="busWhere"><span>Cette semaine, je pars de</span><div class="seg" id="busSeg"><div class="pill"></div>${Object.entries(HOMES).map(([k, l]) => `<button data-h="${k}" class="${cur === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
}
let busBusy = false;
async function rBus() {
  const v = $('#v-bus'), day = busDay();
  const bindSeg = () => { segPill('#busSeg'); v.querySelectorAll('#busSeg button').forEach(b => b.onclick = () => { settings.bus = { ref: b.dataset.h, period: periodNow() }; saveSettings(); rBus(); }); };
  if (!settings.bus) { v.innerHTML = busWeekSeg() + `<div class="empty" style="margin-top:14px">Choisis où tu dors cette semaine. Orbit alterne tout seul chaque vendredi soir entre Ponthévrard et Saint-Arnoult. Tu pourras corriger à tout moment ici.</div>`; bindSeg(); return; }
  if (!day) { v.innerHTML = busWeekSeg() + `<div class="empty" style="margin-top:14px">Pas de cours dans les 7 prochains jours, donc pas de trajet à prévoir.</div>`; bindSeg(); return; }
  const dayLbl = day.i === 0 ? "aujourd'hui" : day.i === 1 ? 'demain' : day.d.toLocaleDateString('fr-FR', { weekday: 'long' });
  const home = homeFor(day.d, 'aller'), homeBack = homeFor(day.d, 'retour');
  if (!v.querySelector('.busWrap')) v.innerHTML = busWeekSeg() + `<div class="busWrap">${skel(3, 84)}</div>`;
  else v.querySelector('.busWhere').outerHTML = busWeekSeg();
  bindSeg();
  if (busBusy) return; busBusy = true;
  try {
    const T = await busTrips(day);
    const W = v.querySelector('.busWrap'); if (!W) return;
    const changeNote = home !== homeFor(new Date(), 'now') ? `, depuis ${HOMES[home]}` : '';
    const al = T.aller, re = T.retour;
    const dis = [...(al?.disruptions || []), ...(re?.disruptions || [])].filter((d, i, A) => d.text && A.findIndex(x => x.text === d.text) === i).slice(0, 3);
    const html = `${dis.length ? `<div class="pnWarn"><b>Perturbations sur le réseau</b>${dis.map(d => `<span>${esc(d.text)}</span>`).join('')}</div>` : ''}
      ${al ? `<div class="dayHead"><b>Aller ${dayLbl}</b><span>${esc(day.firstSubj)} à ${fmtTime(day.first)}${changeNote}</span></div>
        ${al.late ? `<div class="busNote">Aucun bus n'arrive avant ${fmtTime(day.first)} depuis ${HOMES[home]}.</div>` : ''}
        <div class="jrList">${al.journeys.map(j => journeyHTML(j, day.first, j === bestAller(al, day.first), 'au lycée')).join('') || '<div class="empty">Aucun trajet trouvé.</div>'}</div>` : ''}
      <div class="dayHead"><b>Retour ${dayLbl}</b><span>fin des cours à ${fmtTime(day.last)}, vers ${HOMES[homeBack]}${homeBack !== home ? ' (changement de semaine)' : ''}</span></div>
      <div class="jrList">${re.journeys.map((j, i) => journeyHTML(j, null, !al && i === 0, 'chez toi')).join('') || '<div class="empty">Aucun trajet trouvé.</div>'}</div>
      <div class="small muted" style="margin-top:16px">Horaires et temps réel : Île-de-France Mobilités. Touche un bus pour voir où monter et où descendre.</div>`;
    if (W.dataset.sig === html) return; W.dataset.sig = html; W.innerHTML = html;
    fillRealtime(W);
    W.querySelectorAll('details.jr').forEach(d => d.ontoggle = () => { if (d.open) fillRealtime(d); });
  } catch (e) {
    const W = v.querySelector('.busWrap'); if (W) W.innerHTML = `<div class="empty">Impossible de charger les bus : ${esc(e.message || 'erreur')}. <a href="#" id="busRetry">Réessayer</a></div>`;
    const r = $('#busRetry'); if (r) r.onclick = ev => { ev.preventDefault(); rBus(); };
  } finally { busBusy = false; }
}
// Accueil : la carte bus apparaît le matin avant les cours et à la sortie
let busHomeSig = '';
async function busHome() {
  const box = $('#busHome'); if (!box) return;
  const now = new Date(), day = busDay(now);
  if (!day) { box.innerHTML = ''; return; }
  if (!settings.bus) { box.innerHTML = `<button class="card busCard" id="busCardBtn"><div class="bcTop"><span>Bus</span></div><div class="bcMain"><b>Où es-tu cette semaine ?</b></div><small>Choisis Ponthévrard ou Saint-Arnoult pour voir tes bus ici.</small></button>`; $('#busCardBtn').onclick = () => go('bus'); return; }
  const morning = now < day.first; // avant les cours (aujourd'hui ou un prochain jour) : l'aller ; sinon : le retour
  const when = day.i === 0 ? '' : day.i === 1 ? ' demain' : ' ' + day.d.toLocaleDateString('fr-FR', { weekday: 'long' });
  try {
    const T = await busTrips(day); const L = morning ? T.aller : T.retour; if (!L) return;
    const J = L.journeys.filter(j => minsTo(j.dep) >= -1);
    const j = morning ? bestAller({ journeys: J }, day.first) : J[0];
    if (!j) { box.innerHTML = ''; return; }
    const P = tripPlan(j); if (!P) return;
    const f = P.legs[0], m = Math.round((P.board - Date.now()) / 6e4), sig = j.dep + j.arr + m + when;
    if (sig === busHomeSig && box.innerHTML) return; busHomeSig = sig;
    const rest = P.legs.slice(1).map(x => `puis ${lineChip(x.line)} à ${esc(x.from)}`).join(' ');
    box.innerHTML = `<button class="card busCard${m >= 0 && m <= 10 ? ' hot' : ''}" id="busCardBtn">
      <div class="bcTop"><span>${morning ? `Bus pour le lycée${when}` : `Bus pour rentrer à ${HOMES[T.homeBack]}`}</span><b>${m >= 0 && m < 720 ? inMin(m) : ''}</b></div>
      <div class="bcMain">${lineChip(f.line)}<b>${fmtTime(f.dep)}</b><span>à l'arrêt ${esc(f.from)}</span></div>
      <small>${rest ? rest + ', ' : ''}arrivée ${fmtTime(P.arr)}${morning && P.arr > day.first ? ` <em>(cours à ${fmtTime(day.first)})</em>` : ''}</small></button>`;
    $('#busCardBtn').onclick = () => go('bus');
  } catch { box.innerHTML = ''; }
}
/* ---------- Trajets demandés à l'assistant ---------- */
function busCtx() {
  if (!settings.bus) return '\nTRANSPORT : lieu de la semaine pas encore choisi (onglet Bus).';
  const n = new Date(), h = homeFor(n, 'now'), d = busDay(n);
  return `\nTRANSPORT : il habite en alternance à Ponthévrard (3 Grande Rue) et à Saint-Arnoult-en-Yvelines (5 rue du Louvre), changement le vendredi soir. En ce moment il est à ${HOMES[h]}. Lycée Louis Bascan à Rambouillet.${d ? ` Prochain jour de cours : ${fmtDay(d.d)}, de ${fmtTime(d.first)} à ${fmtTime(d.last)}.` : ''}`;
}
const myPosition = () => new Promise((ok, ko) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => ok(p.coords), ko, { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 }) : ko(new Error('geo')));
async function tripPlace(x, when) {
  const s = String(x || '').trim(), l = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!s || /^(maison|chez moi|domicile|home)$/.test(l)) { const h = homeFor(when, 'now'); if (!h) throw new Error("Dis-moi d'abord dans l'onglet **Bus** où tu es cette semaine."); return h; }
  if (/^(lycee|le lycee|lycee louis bascan|louis bascan)$/.test(l)) return 'lycee';
  if (/^ponthevrard$/.test(l)) return 'ponthevrard';
  if (/^(saint|st)[- ]arnoult/.test(l) && !/,/.test(s)) return 'starnoult';
  if (/^(ici|ma position|position|la ou je suis)$/.test(l)) {
    try { const c = await myPosition(); return { coord: `${c.longitude.toFixed(6)};${c.latitude.toFixed(6)}`, name: 'ta position' }; }
    catch { throw new Error("Je n'ai pas accès à ta position. Autorise la localisation pour Orbit, ou dis-moi d'où tu pars (ex : « depuis la gare de Rambouillet »)."); }
  }
  return { q: s };
}
const placeLbl = x => typeof x === 'string' ? (x === 'lycee' ? 'le lycée' : HOMES[x]) : x.name || x.q;
async function tripAnswer(t) {
  let when = t.datetime ? new Date(t.datetime) : new Date();
  if (isNaN(when)) when = new Date();
  try {
    const [from, to] = await Promise.all([tripPlace(t.from || 'ici', when), tripPlace(t.to || 'maison', when)]);
    const arrival = t.represents === 'arrival';
    const r = await busCall('journeys', { from, to, datetime: navDT(when), represents: arrival ? 'arrival' : 'departure', count: 4 }, 60e3);
    if (!r.journeys.length) return `Aucun trajet en transports trouvé de **${r.from}** à **${r.to}** ${arrival ? 'pour arriver avant' : 'à partir de'} ${fmtTime(when)}${sameDay(when, new Date()) ? '' : ' ' + fmtDay(when)}.`;
    const J = r.journeys, best = arrival ? (J.filter(j => new Date(j.arr) <= when).pop() || J[0]) : J.find(j => new Date(j.dep) >= new Date(when.getTime() - 6e4)) || J[0];
    const P = tripPlan(best), f = P.legs[0];
    const day = sameDay(best.dep, new Date()) ? '' : ` ${fmtDay(new Date(best.dep))}`;
    const toTxt = typeof to === 'string' ? (to === 'lycee' ? 'au lycée' : 'chez toi') : 'à ' + r.to;
    const steps = [
      P.walkBefore >= 3 ? `${P.walkBefore} min à pied jusqu'à l'arrêt **${f.from}** (pars à ${fmtTime(P.leave)})` : '',
      ...P.legs.map((x, k) => `${k ? `Descends à **${P.legs[k - 1].to}** et prends le` : 'Prends le'} **${x.line?.code || 'bus'}** à **${fmtTime(x.dep)}**${k ? '' : ` à l'arrêt **${x.from}**`}${x.line?.direction ? ` (direction ${x.line.direction})` : ''}`),
      `Descends à **${P.legs.at(-1).to}**${P.walkAfter >= 1 ? `, puis ${P.walkAfter} min à pied` : ''} : arrivée ${toTxt} à **${fmtTime(P.arr)}**`,
    ].filter(Boolean).map((x, i) => `${i + 1}. ${x}`).join('\n');
    const m = Math.round((P.board - Date.now()) / 6e4), soon = m >= 0 && m < 120 ? ` (${inMin(m)})` : '';
    const others = J.filter(j => j !== best).slice(0, 3).map(j => { const q = tripPlan(j); return q ? `${fmtTime(q.legs[0].dep)} (arrivée ${fmtTime(q.arr)})` : ''; }).filter(Boolean).join(', ');
    const late = arrival && P.arr > when ? `\n\n> Aucun bus n'arrive avant ${fmtTime(when)} : c'est le premier possible.` : '';
    const dis = (r.disruptions || []).filter(d => d.text).slice(0, 1).map(d => `\n\n> Perturbation : ${d.text.slice(0, 220)}`).join('');
    return `#### ${f.line?.code || 'Bus'} à ${fmtTime(f.dep)}${day}${soon}\n${steps}${late}${others ? `\n\nAutres bus : ${others}.` : ''}${dis}`;
  } catch (e) { return e.message && !/fetch|network/i.test(e.message) ? e.message : 'Impossible de calculer le trajet pour le moment, réessaie.'; }
}

/* ---------- « Maintenant » : où j'en suis dans ma journée ---------- */
function daySchedule(d) {
  const cours = coursOn(d).filter(c => !isOff(c)).map(c => ({ kind: 'cours', title: prettySubj(c.subject) || 'Cours', room: c.room, start: new Date(c.starts_at), end: new Date(c.ends_at) }));
  const ev = eventsOn(d).filter(e => !e.allDay).map(e => ({ kind: 'event', title: e.title, room: e.location, start: new Date(e.start), end: new Date(e.end || e.start) }));
  return [...cours, ...ev].sort((a, b) => a.start - b.start);
}
const mins = ms => Math.max(0, Math.round(ms / 60000));
function dur(ms) { const m = mins(ms); if (m < 60) return `${m} min`; const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`; }
function nowCardHTML() {
  const now = new Date(), today = startOfDay(now);
  const S = daySchedule(today);
  const cours = coursOn(today).map(c => ({ kind: 'cours', title: prettySubj(c.subject) || 'Cours', start: new Date(c.starts_at), end: new Date(c.ends_at), off: !!isOff(c) })).sort((a, b) => a.start - b.start);
  const cur = S.find(x => x.start <= now && now < x.end);
  const canc = coursOn(today).filter(c => isOff(c)).map(c => ({ title: prettySubj(c.subject) || 'Cours', start: new Date(c.starts_at), end: new Date(c.ends_at), why: c.status && !/^annul/i.test(c.status) ? c.status : '' }));
  const freeNow = !cur && canc.find(c => c.start <= now && now < c.end);
  const next = S.find(x => x.start > now);
  const badge = x => x.kind === 'cours' ? subjBadge(x.title) : `<span class="sq" style="background:var(--blue)">${SVG('<rect x="3" y="4" width="18" height="17" rx="4"/><path d="M16 2v4M8 2v4M3 10h18"/>').replace('stroke="currentColor"', 'stroke="#100e0d"')}</span>`;
  const where = x => [x.room && esc(x.room), `${fmtTime(x.start)} – ${fmtTime(x.end)}`].filter(Boolean).join(' · ');
  // barre de la journée : un segment par cours
  let bar = '';
  if (cours.length) {
    const real = cours.filter(c => !c.off), doneN = real.filter(c => c.end <= now).length;
    bar = `<div class="dayBar" aria-label="${doneN} cours sur ${real.length} terminés">${cours.map(c => {
      const st = c.off ? 'off' : c.end <= now ? 'done' : (c.start <= now ? 'cur' : '');
      const pct = st === 'cur' ? Math.round((now - c.start) / (c.end - c.start) * 100) : 0;
      return `<i class="${st}" title="${esc(c.title)} ${fmtTime(c.start)}"${st === 'cur' ? ` style="--p:${pct}%"` : ''}></i>`;
    }).join('')}</div>
    <div class="dayBarTxt"><span>${doneN}/${real.length} cours${cours.length > real.length ? ` · ${cours.length - real.length} annulé${cours.length - real.length > 1 ? 's' : ''}` : ''}</span><span>${real.length && now < real[real.length - 1].end ? `fin des cours à ${fmtTime(real[real.length - 1].end)}` : 'cours finis'}</span></div>`;
  }
  let main;
  if (cur) {
    const pct = Math.round((now - cur.start) / (cur.end - cur.start) * 100);
    main = `<div class="nowLbl"><span class="live"></span>En ce moment</div>
      <div class="nowRow">${badge(cur)}<div class="nowTxt"><b>${esc(cur.title)}</b><span>${where(cur)}</span></div><div class="nowLeft"><b>${dur(cur.end - now)}</b><span>restantes</span></div></div>
      <div class="prog"><i style="width:${pct}%"></i></div>`;
  } else if (freeNow) {
    main = `<div class="nowLbl" style="color:#ff8a8a">Libre · cours annulé</div>
      <div class="nowRow">${subjBadge(freeNow.title, 'sq', true)}<div class="nowTxt"><b style="text-decoration:line-through;opacity:.7">${esc(freeNow.title)}</b><span>${freeNow.why ? esc(freeNow.why) + ' · ' : ''}${fmtTime(freeNow.start)} – ${fmtTime(freeNow.end)}</span></div><div class="nowLeft"><b>${dur(freeNow.end - now)}</b><span>de libre</span></div></div>
      ${next && sameDay(next.start, now) ? `<div class="nowNext">Ensuite · <b>${esc(next.title)}</b> à ${fmtTime(next.start)}${next.room ? ' · ' + esc(next.room) : ''}</div>` : ''}`;
  } else if (next && sameDay(next.start, now)) {
    const inMs = next.start - now;
    main = `<div class="nowLbl">${S.some(x => x.end <= now) ? 'Pause' : 'Prochain'} · ${inMs < 60e3 ? 'ça commence' : 'dans ' + dur(inMs)}</div>
      <div class="nowRow">${badge(next)}<div class="nowTxt"><b>${esc(next.title)}</b><span>${where(next)}</span></div><div class="nowLeft"><b>${fmtTime(next.start)}</b><span>début</span></div></div>`;
  } else {
    // journée finie ou sans cours : prochain jour de cours
    let nd = null;
    for (let i = 1; i <= 7 && !nd; i++) { const d = addDays(today, i); const c = daySchedule(d).filter(x => x.kind === 'cours'); if (c.length) nd = { d, c }; }
    main = `<div class="nowLbl">${cours.some(c => !c.off) ? 'Cours finis pour aujourd\'hui' : cours.length ? 'Tous tes cours sont annulés aujourd\'hui' : 'Pas de cours aujourd\'hui'}</div>
      ${nd ? `<div class="nowRow">${badge(nd.c[0])}<div class="nowTxt"><b>${dayTitle(nd.d)[0]} : ${esc(nd.c[0].title)}</b><span>${nd.c.length} cours · de ${fmtTime(nd.c[0].start)} à ${fmtTime(nd.c[nd.c.length - 1].end)}${nd.c[0].room ? ' · ' + esc(nd.c[0].room) : ''}</span></div></div>` : `<div class="small muted" style="margin-top:4px">${server.pronote?.connected ? 'Aucun cours dans les 7 prochains jours.' : 'Connecte Pronote pour voir ton emploi du temps.'}</div>`}`;
  }
  const after = cur && next && sameDay(next.start, now) ? `<div class="nowNext">Ensuite · <b>${esc(next.title)}</b> à ${fmtTime(next.start)}${next.room ? ' · ' + esc(next.room) : ''}${next.start - cur.end > 5 * 60e3 ? ` <span class="muted">(pause de ${dur(next.start - cur.end)})</span>` : ''}</div>` : '';
  const upC = canc.filter(c => c.end > now);
  const cancHTML = upC.length ? `<div class="cancelBox"><b>${upC.length} cours annulé${upC.length > 1 ? 's' : ''} aujourd'hui</b>${upC.map(c => `<span>${fmtTime(c.start)} · ${esc(c.title)}${c.why ? ' — ' + esc(c.why) : ''}</span>`).join('')}</div>` : '';
  return main + after + cancHTML + bar;
}
function updateNow() { const c = $('#nowCard'); if (c) c.innerHTML = nowCardHTML(); busHome(); }

function rToday() {
  const v = $('#v-aujourdhui'), today = startOfDay(new Date()), now = new Date();
  if (!synced) { v.innerHTML = skel(4); return; }
  const A = active().sort(byDue);
  const next = A.find(t => daysLeft(t) !== null && daysLeft(t) >= 0);
  const late = A.filter(t => daysLeft(t) < 0);
  const soir = A.filter(t => { const n = daysLeft(t); return (n === 0 || n === 1) && t !== next; });
  const later = A.filter(t => daysLeft(t) > 1 && t !== next).slice(0, 6);
  let hero;
  if (next) {
    const n = daysLeft(next), C = 2 * Math.PI * 54, frac = Math.max(.06, Math.min(1, 1 - n / 14));
    const rem = (next.reminders || []).filter(r => !r.fired && new Date(r.at) > now).slice(0, 2);
    const rc = next.subject ? subjColor(next.subject) : 'var(--acc)';
    hero = `<div class="hero" style="--rc:${rc}">
      <div class="ring"><svg viewBox="0 0 132 132" role="img" aria-label="Échéance dans ${n} jour(s)"><circle class="bg" cx="66" cy="66" r="54"/><circle class="fg" cx="66" cy="66" r="54" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg>
        <div class="in"><b>${n === 0 ? 'Auj.' : 'J-' + n}</b><small>${n === 0 ? 'jour J' : n === 1 ? 'demain' : fmtShort(dueDate(next))}</small></div></div>
      <div class="info"><span class="pillTag">${esc(next.subject || (next.kind === 'devoir' ? 'Devoir' : next.kind === 'rdv' ? 'Rendez-vous' : 'Tâche'))}</span>
        <span class="ttl">${esc(next.title)}</span>
        <span class="meta">${rem.length ? 'Rappels : ' + rem.map(x => new Date(x.at).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '') + ' ' + fmtTime(x.at)).join(' · ') : 'Échéance : ' + fmtDay(dueDate(next))}</span>
        <div class="btns"><button class="btn p" id="heroDone">Marquer fait</button><button class="btn ic" id="heroFocus">${ICON.play}Focus</button>${next.source === 'pronote' || next.source === 'revision' ? '' : '<button class="btn" id="heroLater">Reporter</button>'}</div></div></div>`;
  } else hero = `<div class="hero"><div class="info"><span class="ttl">Rien à l'horizon 🙌</span><span class="meta">Ajoute une tâche avec le + ou connecte Pronote.</span></div></div>`;

  const row = (cls, when, inner, sort) => ({ sort, h: `<div class="row ${cls}"><span class="when">${when}</span><span class="node"></span>${inner}</div>` });
  const timed = [
    ...coursOn(today).filter(c => new Date(c.ends_at) > now).map(c => row(isOff(c) ? 'cours off' : 'cours', fmtTime(c.starts_at), coursHTML(c), fmtTime(c.starts_at))),
    ...eventsOn(today).filter(e => e.allDay || new Date(e.end || e.start) > now).map(e => row('ev', e.allDay ? 'Journée' : fmtTime(e.start), evHTML(e), e.allDay ? '00:00' : fmtTime(e.start))),
    ...soir.filter(t => daysLeft(t) === 0 && t.time).map(t => row('now', t.time, itemHTML(t), t.time)),
  ].sort((a, b) => a.sort.localeCompare(b.sort));
  const rows = [
    ...late.map(t => row('late', 'Retard', itemHTML(t))),
    ...timed,
    ...soir.filter(t => !(daysLeft(t) === 0 && t.time)).map(t => row('now', daysLeft(t) === 0 ? 'Auj.' : 'Soir', itemHTML(t))),
  ].map(r => r.h);

  const subjects = {};
  A.filter(t => t.kind === 'devoir').forEach(t => { (subjects[t.subject || 'Autre'] ||= []).push(t); });
  const subjHTML = Object.entries(subjects).slice(0, 6).map(([k, L]) => { const n = Math.min(...L.map(t => daysLeft(t) ?? 99)); return `<div class="subj">${subjBadge(k, 'sq')}<span>${esc(k)} <small class="muted" style="font-weight:500">· ${L.length}</small></span><b>${n < 0 ? '!' : n === 0 ? 'Auj.' : n === 1 ? 'Dem.' : 'J-' + n}</b></div>`; }).join('');
  const tomorrowCours = coursOn(addDays(today, 1)).filter(c => !isOff(c));
  v.innerHTML = `<div class="today">
    <div class="colA"><div class="card nowCard" id="nowCard">${nowCardHTML()}</div><div id="busHome"></div>${hero}
      <div><div class="h2">Ta journée <span class="h2s">${(() => { const nc = coursOn(today).filter(c => !isOff(c)).length, nt = late.length + soir.length; return [nc ? nc + ' cours' : '', nt ? nt + ' à faire' : ''].filter(Boolean).join(' · ') || 'libre'; })()}</span></div><div class="tl">${rows.join('') || '<div class="empty">Journée tranquille. Rien d\'urgent ni de prévu.</div>'}</div></div>
      ${later.length ? `<div class="upchips">${later.map(t => `<span><i style="background:${t.kind === 'devoir' ? subjColor(t.subject) : 'var(--dim)'}"></i>${esc(t.title.length > 22 ? t.title.slice(0, 21) + '…' : t.title)} · J-${daysLeft(t)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="colB">
      <div class="card subjCard"><h3>Par matière</h3><div class="list">${subjHTML || '<div class="empty">Aucun devoir en cours</div>'}</div></div>
      ${tomorrowCours.length ? `<div class="card agendaCard"><h3>Demain</h3><div class="small muted">${tomorrowCours.length} cours · de ${fmtTime(tomorrowCours[0].starts_at)} à ${fmtTime(tomorrowCours[tomorrowCours.length - 1].ends_at)}</div></div>` : ''}
      <div class="card agendaCard"><h3>À venir</h3><div class="list">${later.map(t => itemHTML(t, { noRem: true })).join('') || '<div class="empty">Rien de prévu après</div>'}</div></div>
      <div class="card assist"><h3 style="color:var(--acc2)">✦ Assistant</h3><div id="briefOut" class="small" style="line-height:1.55;white-space:pre-wrap">${server.flags?.ai ? 'Demande-moi ton plan pour ce soir.' : 'Ajoute une clé IA gratuite dans Réglages pour activer l\'assistant.'}</div>
        <form id="miniAsk"><input placeholder="Demande-moi…" aria-label="Demander à l'assistant"><button aria-label="Envoyer">${ICON.send}</button></form>
        ${server.flags?.ai ? '<button class="btn sm" id="brief" style="margin-top:10px">Mon plan du jour</button>' : ''}</div>
    </div></div>`;
  bindList(v);
  if (next) {
    $('#heroDone').onclick = () => completeTask(next, true);
    $('#heroFocus').onclick = () => startFocus(next);
    const hl = $('#heroLater'); if (hl) hl.onclick = () => { const d = addDays(dueDate(next), 1); const nt = { ...next, due: ymd(d) }; nt.reminders = buildReminders(nt); saveTask(nt); toast('Reporté', 'au ' + fmtDay(d)); };
  }
  const br = $('#brief'); if (br) br.onclick = dailyBrief;
  busHome();
  $('#miniAsk').onsubmit = e => { e.preventDefault(); const q = e.target.querySelector('input').value.trim(); if (!q) return; go('ia'); ask(q); };
}

function rTasks() {
  const v = $('#v-taches');
  const perso = tasks.filter(t => !t.deleted), open = perso.filter(t => !t.done).sort(byDue);
  const isWeek = t => { const n = daysLeft(t); return n !== null && n <= 6; };
  const week = open.filter(isWeek), later = open.filter(t => !isWeek(t)), done = perso.filter(t => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  if (!['semaine', 'plus', 'faites'].includes(taskFilter)) taskFilter = 'semaine';
  const cnt = n => n ? ` <i class="segN">${n}</i>` : '';
  let html = `<div class="seg" id="tseg"><div class="pill"></div>${[['semaine', 'Cette semaine', week.length], ['plus', 'Plus tard', later.length], ['faites', 'Faites', 0]].map(([k, l, n]) => `<button data-f="${k}" class="${taskFilter === k ? 'on' : ''}">${l}${cnt(n)}</button>`).join('')}</div>`;
  const group = (L, keyOf, titleOf) => {
    const groups = new Map(); for (const t of L) { const k = keyOf(t); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
    return [...groups.entries()].map(([k, g]) => { const [b, sub, cls] = titleOf(k); return `<div class="dayHead ${cls || ''}"><b>${b}</b><span>${sub || ''}</span><span class="n">${g.length}</span></div><div class="list">${g.map(t => itemHTML(t, { noDue: /^\d{4}/.test(k) && !t.time })).join('')}</div>`; }).join('');
  };
  if (taskFilter === 'semaine') {
    html += week.length ? group(week, t => daysLeft(t) < 0 ? 'late' : t.due, k => k === 'late' ? ['En retard', 'à rattraper', 'late'] : dayTitle(new Date(k + 'T12:00')))
      : `<div class="empty" style="margin-top:18px">Rien cette semaine.${later.length ? ` ${later.length} tâche${later.length > 1 ? 's' : ''} plus tard.` : ''} Ajoute-en une avec le +, ex : « payer la cantine avant vendredi ».</div>`;
  } else if (taskFilter === 'plus') {
    const monday = d => { const x = startOfDay(d); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
    html += later.length ? group(later, t => t.due ? 'w' + ymd(monday(dueDate(t))) : 'none', k => k === 'none' ? ['Sans date', 'quand tu veux'] : (() => { const m = new Date(k.slice(1) + 'T12:00'), n = Math.round((m - monday(new Date())) / 864e5 / 7); return [n === 1 ? 'Semaine prochaine' : `Dans ${n} semaines`, 'semaine du ' + m.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })]; })())
      : `<div class="empty" style="margin-top:18px">Rien de prévu plus tard.</div>`;
  } else {
    html += `<div class="dayHead"><b>Faites</b><span>les plus récentes d'abord</span><span class="n">${done.length}</span></div>${done.length ? '<button class="btn sm" id="clearDone" style="margin:0 0 10px 4px">Tout effacer</button>' : ''}<div class="list">${done.slice(0, 60).map(t => itemHTML(t)).join('') || '<div class="empty">Rien de terminé pour l\'instant</div>'}</div>`;
  }
  v.innerHTML = html; bindList(v); segPill('#tseg');
  v.querySelectorAll('#tseg button').forEach(b => b.onclick = () => { taskFilter = b.dataset.f; rTasks(); });
  const cd = $('#clearDone'); if (cd) cd.onclick = () => { for (const t of tasks.filter(t => t.done)) removeTask(t.id); };
}
function segPill(sel) { requestAnimationFrame(() => { const s = $(sel); if (!s) return; const on = s.querySelector('button.on'), p = s.querySelector('.pill'); if (on) { p.style.width = on.offsetWidth + 'px'; p.style.transform = `translateX(${on.offsetLeft}px)`; p.style.left = '0'; } }); }

/* ---------- Notes Pronote ---------- */
let notes = store.get('orbit.notes', null), hwTab = 'devoirs', hwSubj = null;
async function loadNotes() {
  notesLoading = true;
  try { const r = await extra('notes'); if (r.notes) { notes = r.notes; store.set('orbit.notes', notes); } } catch { /* hors ligne */ } finally { notesLoading = false; if (current === 'devoirs' && hwTab === 'notes') rHomework(); }
}
const num = v => typeof v === 'number' ? v : null;
const on20 = (v, out) => num(v) == null ? null : v * 20 / (num(out) || 20);
const gradeCls = v => v == null ? '' : v >= 14 ? 'g4' : v >= 12 ? 'g3' : v >= 10 ? 'g2' : v >= 8 ? 'g1' : 'g0';
const fmtN = v => num(v) == null ? (v ?? '—') : String(Math.round(v * 100) / 100).replace('.', ',');
function subjParts(name) { const [m, ...rest] = String(name || '').split(' > '); const main = prettySubj(m) || m; const sub = rest.join(' › ').replace(/"/g, '').trim(); return { main, sub: sub && prettySubj(sub) !== main ? sub : '' }; }
function notesHTML() {
  if (!notes) return notesLoading ? skel(3, 60) : `<div class="empty" style="margin-top:12px">Les notes arrivent à la prochaine synchro Pronote.</div>`;
  const ov = num(notes.overall), co = num(notes.classOverall);
  const S = (notes.subjects || []).filter(x => num(x.avg) != null).map(x => ({ ...x, ...subjParts(x.name), a20: on20(x.avg, x.outOf), c20: on20(x.classAvg, x.outOf) })).sort((a, b) => a.a20 - b.a20);
  const subj = S.map(x => `<div class="nRow"><span class="nB">${subjBadge(x.main)}</span><div class="nTx"><b>${esc(x.main)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}
      <div class="nBar"><i class="${gradeCls(x.a20)}" style="width:${Math.max(3, x.a20 * 5)}%"></i>${x.c20 != null ? `<u style="left:${x.c20 * 5}%" title="Moyenne de la classe"></u>` : ''}</div></div>
      <div class="nV"><b class="${gradeCls(x.a20)}">${fmtN(x.avg)}</b><small>classe ${fmtN(x.classAvg)}</small></div></div>`).join('');
  const G = (notes.grades || []).slice(0, 25).map(g => { const p = subjParts(g.subject), v20 = on20(g.value, g.outOf); return `<div class="gRow">${subjBadge(p.main, 'sq')}<div class="nTx"><b>${esc(g.comment || p.main)}</b><small>${esc(p.main)} · ${new Date(g.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}${g.coef && g.coef !== 1 ? ' · coef ' + fmtN(g.coef) : ''}</small></div>
      <div class="nV"><b class="${gradeCls(v20)}">${fmtN(g.value)}<span>/${fmtN(g.outOf)}</span></b>${g.avg != null ? `<small>classe ${fmtN(g.avg)}</small>` : ''}</div></div>`; }).join('');
  return `<div class="nHero card"><div><span class="nLbl">${esc(notes.period || 'Moyenne')}</span><b class="nBig ${gradeCls(ov)}">${fmtN(ov)}</b><span class="nCls">Classe : ${fmtN(co)}${ov != null && co != null ? ` · <i class="${ov >= co ? 'up' : 'dn'}">${ov >= co ? '+' : ''}${fmtN(Math.round((ov - co) * 100) / 100)}</i>` : ''}</span></div>
      <button class="btn" id="nAsk">${ICON.ia} Où bosser ?</button></div>
    <div class="dayHead"><b>Moyennes par matière</b><span>les plus fragiles d'abord</span></div><div class="card nList">${subj || '<div class="empty">Pas encore de moyenne</div>'}</div>
    <div class="dayHead"><b>Dernières notes</b></div><div class="card nList">${G || '<div class="empty">Aucune note</div>'}</div>`;
}
function notesCtx() {
  if (!notes) return '';
  const S = (notes.subjects || []).filter(x => num(x.avg) != null).map(x => `${subjParts(x.name).main}${subjParts(x.name).sub ? ' (' + subjParts(x.name).sub + ')' : ''} ${fmtN(x.avg)}/${x.outOf} (classe ${fmtN(x.classAvg)})`).join(' ; ');
  const G = (notes.grades || []).slice(0, 8).map(g => `${subjParts(g.subject).main} ${fmtN(g.value)}/${fmtN(g.outOf)} le ${g.date}${g.comment ? ' « ' + g.comment + ' »' : ''}`).join(' ; ');
  return `\n\nNOTES PRONOTE (${notes.period}) : moyenne générale ${fmtN(notes.overall)} (classe ${fmtN(notes.classOverall)}). Par matière : ${S}. Dernières notes : ${G}.`;
}

/* ---------- Contenu des cours (cahier de textes Pronote) ---------- */
let contenus = store.get('orbit.contenus', []);
async function loadContenus() {
  try { const r = await extra('contenus'); if (Array.isArray(r.contenus)) { contenus = r.contenus; store.set('orbit.contenus', contenus); if (current === 'devoirs' && hwTab === 'cours') rHomework(); } } catch { }
}
function contenuFor(c) {
  if (!contenus.length) return null; const t = new Date(c.starts_at).getTime(), sub = (c.subject || '').toUpperCase();
  return contenus.find(x => Math.abs(new Date(x.start).getTime() - t) < 6e5 && (x.subject || '').toUpperCase() === sub) || null;
}
function contenuHTML(x, full = true) {
  const s = prettySubj(x.subject) || 'Cours', d = new Date(x.start);
  return `<div class="card cCard"><div class="exTop">${subjBadge(s)}<div class="nTx"><b>${esc(s)}</b><small>${esc(cap(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })))} · ${fmtTime(x.start)}${x.teachers ? ' · ' + esc(x.teachers.split(',')[0]) : ''}</small></div></div>
    ${x.items.map(i => `<div class="cItem">${i.cat || i.title ? `<div class="cHead">${i.cat ? `<span class="tag">${esc(i.cat)}</span>` : ''}${i.title ? `<b>${esc(i.title)}</b>` : ''}</div>` : ''}${i.text ? `<div class="cTxt${full ? '' : ' clamp'}">${esc(i.text).replace(/\n/g, '<br>')}</div>` : ''}${i.files?.length ? `<div class="cFiles">${i.files.map(f => `<a href="${esc(f.url)}" target="_blank" rel="noopener">${ICON.file}${esc(f.name)}</a>`).join('')}</div>` : ''}</div>`).join('')}</div>`;
}
function openContenu(id) {
  const x = contenus.find(c => c.id === id); if (!x) return;
  const s = $('#sheet'); s.innerHTML = `<div class="grab"></div>${contenuHTML(x)}<div class="acts"><button class="btn p ic" id="cAsk">${ICON.ia}Réviser ce cours</button><button class="btn" id="cClose">Fermer</button></div>`;
  openSheet(); $('#cClose').onclick = closeSheet;
  $('#cAsk').onclick = () => { closeSheet(); go('ia'); ask(`Aide-moi à réviser ce cours de ${prettySubj(x.subject)} du ${new Date(x.start).toLocaleDateString('fr-FR')} : ${x.items.map(i => [i.title, i.text].filter(Boolean).join(' — ')).join(' / ')}. Explique l'essentiel simplement puis pose-moi 3 questions.`); };
}
document.addEventListener('click', e => { const it = e.target.closest('.item.cours[data-ck], .gBlk[data-ck]'); if (it && !e.target.closest('[data-act]')) openContenu(it.dataset.ck); });
function contenusCtx() {
  if (!contenus.length) return '';
  return '\n\nCONTENU DES DERNIERS COURS (cahier de textes) : ' + contenus.slice(0, 12).map(x => `${prettySubj(x.subject)} le ${x.start.slice(0, 10)} : ${x.items.map(i => [i.title, i.text].filter(Boolean).join(' — ')).join(' / ').replace(/\s+/g, ' ').slice(0, 220)}`).join(' ; ');
}

/* ---------- Mode focus (Pomodoro) ---------- */
let focus = store.get('orbit.focus', null), focusTimer = null;
const FOCUS_WORK = 25, FOCUS_BREAK = 5;
function startFocus(t) {
  focus = { id: t?.id || null, title: t?.title || 'Séance de travail', subject: t?.subject || null, phase: 'work', end: Date.now() + FOCUS_WORK * 60e3, paused: null, done: 0 };
  store.set('orbit.focus', focus); closeSheet(); showFocus(); beep(660, .08);
}
function focusLeft() { return Math.max(0, (focus.paused ?? focus.end) - (focus.paused ? 0 : Date.now())) ; }
function showFocus() {
  let o = $('#focus'); if (!o) { o = document.createElement('div'); o.id = 'focus'; o.className = 'focusO'; document.body.appendChild(o); }
  const C = 2 * Math.PI * 120;
  o.innerHTML = `<div class="fBg"></div><div class="fBox">
    <span class="fPh" id="fPh"></span>
    <div class="fRing"><svg viewBox="0 0 280 280"><circle class="bg" cx="140" cy="140" r="120"/><circle class="fg" id="fArc" cx="140" cy="140" r="120" stroke-dasharray="${C}"/></svg><div class="fIn"><b id="fTime">25:00</b><small id="fEnd"></small></div></div>
    <div class="fTitle">${focus.subject ? subjBadge(focus.subject, 'sq mini') : ''}<span>${esc(focus.title)}</span></div>
    <div class="fDots" id="fDots"></div>
    <div class="fBtns"><button class="btn" id="fPause"></button><button class="btn" id="fSkip">Passer</button>${focus.id ? `<button class="btn p ic" id="fDone">${ICON.check}C'est fini</button>` : ''}<button class="btn" id="fStop">Arrêter</button></div></div>`;
  requestAnimationFrame(() => o.classList.add('on'));
  $('#fPause').onclick = () => { if (focus.paused) { focus.end = Date.now() + focus.paused; focus.paused = null; } else focus.paused = focus.end - Date.now(); store.set('orbit.focus', focus); tickFocus(); };
  $('#fSkip').onclick = () => nextPhase(true);
  $('#fStop').onclick = stopFocus;
  const fd = $('#fDone'); if (fd) fd.onclick = () => { const t = allItems().find(x => x.id === focus.id); stopFocus(); if (t && !t.done) completeTask(t, true); };
  clearInterval(focusTimer); focusTimer = setInterval(tickFocus, 500); tickFocus();
}
function tickFocus() {
  if (!focus || !$('#focus')) return;
  const left = focus.paused ?? (focus.end - Date.now());
  if (left <= 0 && !focus.paused) return nextPhase(false);
  const tot = (focus.phase === 'work' ? FOCUS_WORK : FOCUS_BREAK) * 60e3, C = 2 * Math.PI * 120;
  $('#fTime').textContent = `${String(Math.floor(left / 60e3)).padStart(2, '0')}:${String(Math.floor(left / 1e3) % 60).padStart(2, '0')}`;
  $('#fArc').style.strokeDashoffset = C * (1 - left / tot);
  $('#fPh').textContent = focus.paused ? 'En pause' : focus.phase === 'work' ? 'Concentration' : 'Pause';
  $('#fEnd').textContent = focus.paused ? '' : 'fin à ' + fmtTime(new Date(focus.end));
  $('#fPause').textContent = focus.paused ? 'Reprendre' : 'Pause';
  $('#focus').classList.toggle('brk', focus.phase === 'break');
  $('#fDots').innerHTML = Array.from({ length: Math.max(4, focus.done + 1) }, (_, i) => `<i class="${i < focus.done ? 'on' : ''}"></i>`).join('');
  document.title = `${$('#fTime').textContent} · ${focus.phase === 'work' ? 'Focus' : 'Pause'}`;
}
function nextPhase(skip) {
  if (focus.phase === 'work') { focus.done++; focus.phase = 'break'; focus.end = Date.now() + FOCUS_BREAK * 60e3; if (!skip) { toast('Bien joué', `${focus.done} séance${focus.done > 1 ? 's' : ''} · 5 min de pause`); chime(); } }
  else { focus.phase = 'work'; focus.end = Date.now() + FOCUS_WORK * 60e3; if (!skip) { toast('C\'est reparti', '25 min de concentration'); chime(); } }
  focus.paused = null; store.set('orbit.focus', focus); tickFocus();
}
function stopFocus() { clearInterval(focusTimer); focus = null; store.set('orbit.focus', null); const o = $('#focus'); if (o) { o.classList.remove('on'); setTimeout(() => o.remove(), 350); } document.title = 'Orbit'; }
let actx = null;
function beep(f = 880, d = .15, when = 0) { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(.0001, actx.currentTime + when); g.gain.exponentialRampToValueAtTime(.3, actx.currentTime + when + .02); g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + when + d); o.connect(g).connect(actx.destination); o.start(actx.currentTime + when); o.stop(actx.currentTime + when + d + .05); } catch { } }
function chime() { beep(660, .25, 0); beep(880, .25, .22); beep(1100, .4, .44); try { navigator.vibrate?.([200, 100, 200]); } catch { } }

/* ---------- Dictée vocale ---------- */
let rec = null;
async function toggleVoice(btn, input) {
  if (rec) { rec.stop(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Micro indisponible', 'Utilise le micro du clavier de ton téléphone');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return toast('Micro refusé', 'Autorise le micro pour Orbit dans les réglages'); }
  const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
  const chunks = []; rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const stopT = setTimeout(() => rec?.state === 'recording' && rec.stop(), 60e3);
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = async () => {
    clearTimeout(stopT); stream.getTracks().forEach(t => t.stop()); rec = null; btn.classList.remove('rec'); btn.classList.add('busy');
    try {
      const blob = new Blob(chunks, { type: chunks[0]?.type || type || 'audio/webm' });
      if (blob.size < 1500) { btn.classList.remove('busy'); return; }
      const b64 = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
      const r = await extra('transcribe', { audio: b64, mime: blob.type });
      if (r.ok && r.text) { input.value = (input.value ? input.value.trim() + ' ' : '') + r.text; input.dispatchEvent(new Event('input')); input.focus(); }
      else toast('Pas compris', r.error === 'no_key' ? 'Ajoute la clé Groq dans Réglages' : 'Réessaie en parlant plus près');
    } catch { toast('Dictée impossible', 'Réessaie dans un instant'); }
    btn.classList.remove('busy');
  };
  rec.start(); btn.classList.add('rec'); try { navigator.vibrate?.(30); } catch { }
}
const MIC_SVG = SVG('<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>');

function rHomework() {
  const v = $('#v-devoirs');
  if (!synced) { v.innerHTML = skel(4, 76); return; }
  const H = allItems().filter(t => t.kind === 'devoir' && !t.done).sort(byDue);
  // Séances de révision : à part, regroupées par contrôle (sinon on croit à un devoir « pour dimanche »)
  const R = allItems().filter(t => t.kind === 'revision' && !t.done).sort(byDue), exams = new Map();
  for (const t of R) { if (!exams.has(t.examId)) exams.set(t.examId, []); exams.get(t.examId).push(t); }
  const revHTML = exams.size ? `<div class="dayHead"><b>Contrôles</b><span>révisions proposées</span></div>` + [...exams.values()].map(L => { const e = L[0], d = new Date(e.examDue + 'T12:00'); return `<div class="card examCard"><div class="exTop">${subjBadge(e.subject)}<div class="nTx"><b>Contrôle de ${esc(e.subject)}</b><small>${esc(cap(fmtDay(d)))} · ${esc(e.examWhat.slice(0, 90))}</small></div></div><div class="list">${L.map(t => itemHTML({ ...t, title: 'Révision ' + (4 - +t.id.split(':').pop()) + '/3' }, { noSq: true, noRem: true })).join('')}</div></div>`; }).join('') : '';
  const subjects = [...new Set(H.map(t => t.subject || 'Autre'))];
  const groups = new Map(); for (const t of H) { const k = daysLeft(t) < 0 ? 'late' : t.due || 'none'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
  let list = '';
  for (const [k, g] of [...groups.entries()].sort((a, b) => a[0] === 'late' ? -1 : b[0] === 'late' ? 1 : a[0].localeCompare(b[0]))) {
    const [b, s] = k === 'late' ? ['En retard', ''] : k === 'none' ? ['Sans date', ''] : dayTitle(new Date(k + 'T12:00'));
    list += `<div class="dayHead ${k === 'late' ? 'late' : ''}"><b>${b}</b><span>${s}</span><span class="n">${g.length}</span></div><div class="list">${g.map(t => itemHTML(t, { noDue: k !== 'late' })).join('')}</div>`;
  }
  const seg = `<div class="seg hwSeg" id="hwSeg"><div class="pill"></div><button data-h="devoirs" class="${hwTab === 'devoirs' ? 'on' : ''}">Devoirs</button><button data-h="notes" class="${hwTab === 'notes' ? 'on' : ''}">Notes${notes && num(notes.overall) != null ? ' · ' + fmtN(notes.overall) : ''}</button><button data-h="cours" class="${hwTab === 'cours' ? 'on' : ''}">Cours</button></div>`;
  const bindSeg = () => { v.querySelectorAll('#hwSeg button').forEach(b => b.onclick = () => { hwTab = b.dataset.h; rHomework(); if (hwTab === 'notes') loadNotes(); if (hwTab === 'cours') loadContenus(); }); segPill('#hwSeg'); };
  if (hwTab === 'cours') {
    const subs = [...new Set(contenus.map(x => prettySubj(x.subject)))];
    const L = contenus.filter(x => !hwSubj || prettySubj(x.subject) === hwSubj);
    v.innerHTML = seg + (subs.length > 1 ? `<div class="chipsRow" style="margin-bottom:10px"><span class="${!hwSubj ? 'on' : ''}" data-cs="">Tout</span>${subs.map(n => `<span class="${hwSubj === n ? 'on' : ''}" data-cs="${esc(n)}">${subjBadge(n, 'sq mini')}${esc(n)}</span>`).join('')}</div>` : '') + (L.map(x => contenuHTML(x, false)).join('') || `<div class="empty" style="margin-top:12px">${contenus.length ? 'Rien pour cette matière.' : 'Le contenu des cours arrive à la prochaine synchro Pronote.'}</div>`);
    bindSeg(); v.querySelectorAll('[data-cs]').forEach(b => b.onclick = () => { hwSubj = b.dataset.cs || null; rHomework(); });
    v.querySelectorAll('.cCard').forEach((c, i) => c.onclick = e => { if (!e.target.closest('a')) openContenu(L[i].id); });
    return;
  }
  if (hwTab === 'notes') { v.innerHTML = seg + notesHTML(); bindSeg(); const na = $('#nAsk'); if (na) na.onclick = () => { go('ia'); ask('Regarde mes notes et dis-moi dans quelles matières je dois bosser en priorité, avec un plan concret pour cette semaine.'); }; return; }
  const pe = server.pronote?.connected && server.pronote?.last_error;
  const warn = pe ? `<div class="pnWarn"><b>Pronote ne se synchronise plus</b><span>Dernière mise à jour : ${server.pronote.last_sync ? new Date(server.pronote.last_sync).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : '—'}. Reconnecte-toi avec le QR code.</span><button class="btn p sm" id="pnWarnBtn">Reconnecter</button></div>` : '';
  v.innerHTML = seg + warn + `${subjects.length ? `<div class="chipsRow" style="margin-bottom:6px">${subjects.map(s => `<span>${subjBadge(s, 'sq mini')}${esc(s)} · ${H.filter(t => (t.subject || 'Autre') === s).length}</span>`).join('')}</div>` : ''}
    ${list || '<div class="empty" style="margin-top:12px">Aucun devoir à faire. Profite.</div>'}${revHTML}
    <div class="grid" style="margin-top:26px">${pronoteCardHTML()}
      <details class="fold"><summary>＋ Import manuel (copier-coller ou capture)</summary>
        <div class="steps"><div>Pronote → <b>Cahier de textes</b> → <b>Travail à faire</b>.</div><div>Colle le texte ou dépose une capture d'écran.</div></div>
        <textarea id="pnText" rows="4" placeholder="Colle ici le contenu de « Travail à faire »…"></textarea>
        <label class="drop" id="pnDrop" style="margin-top:10px"><input type="file" id="pnFile" accept="image/*" multiple hidden>📷 Déposer des captures d'écran</label>
        <div style="display:flex;gap:8px;margin-top:12px"><button class="btn p" id="pnGo" ${server.flags?.ai ? '' : 'disabled'}>Importer</button></div>
        <div id="pnOut" class="small muted" style="margin-top:10px">${server.flags?.ai ? '' : 'Nécessite une clé IA (Réglages). Les captures demandent Gemini.'}</div>
      </details></div>`;
  bindList(v); bindPronoteCard(); bindSeg();
  const pw = $('#pnWarnBtn'); if (pw) pw.onclick = () => { const r = $('#pnRelink'); if (r) { r.scrollIntoView({ behavior: 'smooth', block: 'center' }); r.click(); } };
  let files = [];
  const dz = $('#pnDrop'), take = fs => { files = [...fs].filter(f => f.type.startsWith('image/')); dz.textContent = `📷 ${files.length} capture${files.length > 1 ? 's' : ''} prête${files.length > 1 ? 's' : ''}`; };
  $('#pnFile').onchange = e => take(e.target.files);
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); take(e.dataTransfer.files); };
  $('#pnGo').onclick = () => importPronote($('#pnText').value, files);
}
const toB64 = f => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = ko; r.readAsDataURL(f); });
async function importPronote(text, files) {
  const out = $('#pnOut'); if (!text.trim() && !files.length) { out.textContent = 'Colle du texte ou ajoute une capture.'; return; }
  out.innerHTML = '<span class="spin" style="display:inline-block;vertical-align:-3px;border-top-color:var(--acc)"></span> Lecture des devoirs…';
  try {
    const images = []; for (const f of files.slice(0, 6)) images.push({ mime: f.type, data: await toB64(f) });
    const r = await aiJSON({ images, prompt: `${todayCtx()}
Voici le contenu du cahier de textes Pronote (« Travail à faire ») d'un élève${files.length ? ' (texte et/ou captures jointes)' : ''}.
Extrais CHAQUE devoir. « Pour mardi 12 nov. » ou « Pour le 12/11 » = date limite ; prends la prochaine occurrence logique. Ignore les devoirs marqués « Fait ».
Réponds UNIQUEMENT en JSON : {"devoirs":[{"subject":"Matière","title":"consigne courte et claire","due":"YYYY-MM-DD"}]}
Texte :
"""${text.slice(0, 12000)}"""` });
    let added = 0;
    for (const d of (r?.devoirs || []).filter(d => d.title)) {
      if (allItems().some(t => t.kind === 'devoir' && t.due === d.due && t.title.toLowerCase() === d.title.toLowerCase())) continue;
      const t = { id: uid(), title: d.title, subject: d.subject || null, due: d.due || null, time: null, kind: 'devoir', done: false, createdAt: new Date().toISOString(), source: 'import' };
      t.reminders = buildReminders(t); saveTask(t); added++;
    }
    toast('Import terminé', `${added} nouveau${added > 1 ? 'x' : ''} devoir${added > 1 ? 's' : ''}`);
  } catch (e) { out.textContent = e.code === 'rate_limited' ? 'Trop de demandes, réessaie dans une minute.' : "L'import n'a pas marché, réessaie avec moins de texte."; }
}

/* ---------- Emploi du temps en grille (semaine, façon Pronote) ---------- */
const SHORT_SUBJ = { 'Physique-chimie & maths': 'PC-Maths', 'Physique-chimie': 'PC', 'Histoire-géo': 'Hist-géo', 'Allemand': 'Allem.', 'Anglais': 'Anglais', 'Français': 'Français', 'Accompagnement perso': 'AP', 'Vie de classe': 'VDC', 'Innovation techno': 'IT', 'Techno en anglais': 'ETLV', 'Espagnol': 'Espa.' };
const shortSubj = n => SHORT_SUBJ[n] || (/ingénier|ingenier|i2d/i.test(n) ? 'I2D' : n.length > 11 ? n.split(/[\s,'-]+/).filter(w => w.length > 2 && !/^(et|des|les|aux)$/i.test(w)).map(w => w[0].toUpperCase()).join('').slice(0, 4) : n);
function weekGridHTML() {
  const mon = startOfDay(agendaDay); mon.setDate(mon.getDate() - (mon.getDay() + 6) % 7);
  let days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const has = d => coursOn(d).length || eventsOn(d).some(e => !e.allDay);
  days = days.filter((d, i) => i < 5 || has(d));
  const C = days.flatMap(d => coursOn(d)), E = days.flatMap(d => eventsOn(d).filter(e => !e.allDay));
  const hrs = [...C.map(c => [new Date(c.starts_at), new Date(c.ends_at)]), ...E.map(e => [new Date(e.start), new Date(e.end)])];
  const h0 = Math.min(8, ...hrs.map(([a]) => a.getHours())), h1 = Math.max(17, ...hrs.map(([, b]) => b.getHours() + (b.getMinutes() ? 1 : 0)));
  const PX = 54, top = d => ((d.getHours() - h0) * 60 + d.getMinutes()) / 60 * PX, now = new Date();
  const block = (a, b, inner, cls, style, attr = '') => { const h = Math.max(20, top(b) - top(a) - 2); return `<div class="gBlk ${cls}${h < 44 ? ' short' : ''}" style="top:${top(a)}px;height:${h}px;${style}"${attr} title="${esc(inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())}">${inner}</div>`; };
  const cols = days.map(d => {
    const cs = coursOn(d).map(c => { const n = prettySubj(c.subject) || 'Cours', off = isOff(c), ct = contenuFor(c), col = subjColor(n);
      return block(new Date(c.starts_at), new Date(c.ends_at), `<b><span class="gL">${esc(n)}</span><span class="gS">${esc(shortSubj(n))}</span></b>${!off ? `<small><span class="gL">${fmtTime(c.starts_at)}${c.room ? ' · ' : ''}</span>${esc(c.room || '')}</small>` : ''}${off ? '<small>Annulé</small>' : ''}${ct ? `<i class="gC">${ICON.book}</i>` : ''}`, off ? 'off' : '', off ? '' : `--c:${col}`, ct ? ` data-ck="${ct.id}"` : ''); }).join('');
    const es = eventsOn(d).filter(e => !e.allDay).map(e => block(new Date(e.start), new Date(e.end), `<b>${esc(e.title)}</b>`, 'ev', '')).join('');
    const nowL = sameDay(d, now) && now.getHours() >= h0 && now.getHours() < h1 ? `<div class="gNow" style="top:${top(now)}px"></div>` : '';
    return `<div class="gCol ${sameDay(d, now) ? 'isToday' : ''}"><div class="gHead"><small>${d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}</small><b>${d.getDate()}</b></div><div class="gBody" style="height:${(h1 - h0) * PX}px">${cs}${es}${nowL}</div></div>`;
  }).join('');
  const lbl = `${mon.getDate()} – ${addDays(mon, 4).getDate()} ${addDays(mon, 4).toLocaleDateString('fr-FR', { month: 'long' })}`;
  return `<div class="gNav"><button class="iconbtn" id="gPrev" aria-label="Semaine précédente">${SVG('<path d="M15 6l-6 6 6 6"/>')}</button><b>${lbl}</b><button class="iconbtn" id="gNext" aria-label="Semaine suivante">${SVG('<path d="M9 6l6 6-6 6"/>')}</button></div>
    <div class="grid" style="--cols:${days.length}"><div class="gHours"><div class="gHead"></div><div class="gBody" style="height:${(h1 - h0) * PX}px">${Array.from({ length: h1 - h0 }, (_, i) => `<span style="top:${i * PX}px">${h0 + i}h</span>`).join('')}</div></div>${cols}</div>
    ${C.length ? '' : '<div class="empty" style="margin-top:12px">Pas de cours cette semaine (vacances ?).</div>'}`;
}
function rAgenda() {
  const v = $('#v-agenda'), base = startOfDay(new Date());
  const days = Array.from({ length: 14 }, (_, i) => addDays(base, i));
  const itemsOn = d => [
    ...coursOn(d).map(c => ({ t: fmtTime(c.starts_at), cls: isOff(c) ? 'cours off' : 'cours', h: coursHTML(c) })),
    ...eventsOn(d).map(e => ({ t: e.allDay ? '00:00' : fmtTime(e.start), when: e.allDay ? 'Journée' : fmtTime(e.start), cls: 'ev', h: evHTML(e) })),
    ...allItems().filter(t => t.due === ymd(d)).map(t => ({ t: t.time || '23:58', when: t.time || 'Pour', cls: t.done ? '' : 'now', h: itemHTML(t, { noDue: true }) })),
  ].sort((a, b) => a.t.localeCompare(b.t));
  const list = itemsOn(agendaDay);
  const modeSeg = `<div class="seg" id="aseg" style="margin-bottom:12px"><div class="pill"></div><button data-m="jour" class="${agendaMode === 'jour' ? 'on' : ''}">Jour</button><button data-m="semaine" class="${agendaMode === 'semaine' ? 'on' : ''}">Semaine</button></div>`;
  const bindMode = () => { segPill('#aseg'); v.querySelectorAll('#aseg button').forEach(b => b.onclick = () => { agendaMode = b.dataset.m; store.set('orbit.agendaMode', agendaMode); rAgenda(); }); };
  if (agendaMode === 'semaine') {
    v.innerHTML = modeSeg + weekGridHTML(); bindMode();
    $('#gPrev').onclick = () => { agendaDay = addDays(agendaDay, -7); rAgenda(); };
    $('#gNext').onclick = () => { agendaDay = addDays(agendaDay, 7); rAgenda(); };
    return;
  }
  v.innerHTML = modeSeg + `<div class="week" id="week">${days.map(d => { const n = itemsOn(d).length; return `<button class="day ${sameDay(d, agendaDay) ? 'on' : ''} ${sameDay(d, base) ? 'today' : ''}" data-d="${ymd(d)}"><small>${d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}</small><b>${d.getDate()}</b><div class="dots">${'<i></i>'.repeat(Math.min(n, 3))}</div></button>`; }).join('')}</div>
    <div class="dayHead"><b>${dayTitle(agendaDay)[0]}</b><span>${dayTitle(agendaDay)[1]}</span><span class="n">${list.length}</span></div>
    <div class="tl">${list.map(x => `<div class="row ${x.cls}"><span class="when">${x.when || x.t}</span><span class="node"></span>${x.h}</div>`).join('') || '<div class="empty">Journée libre</div>'}</div>
    <div class="small muted" style="margin-top:16px">${server.flags?.ical ? `Google Agenda à jour${server.gcalAt ? ' · ' + fmtTime(server.gcalAt) : ''}${server.gcalError ? ' · ⚠️ ' + esc(server.gcalError) : ''} · <a href="#" id="gRef">Actualiser</a>` : 'Google Agenda pas encore relié : Réglages → Google Agenda.'}${server.pronote?.connected ? ' · Emploi du temps Pronote inclus' : ''}</div>`;
  bindList(v); bindMode();
  v.querySelectorAll('.day').forEach(b => b.onclick = () => { agendaDay = startOfDay(new Date(b.dataset.d + 'T12:00')); rAgenda(); });
  const gr = $('#gRef'); if (gr) gr.onclick = e => { e.preventDefault(); pull(false, true).then(() => toast('Google Agenda', 'Actualisé')); };
  const on = v.querySelector('.day.on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}

// ---------- Assistant IA ----------
const CHAT_KEY = 'orbit.chat';
try { const c = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]'); if (Array.isArray(c)) chat = c.slice(-40); } catch {}
const saveChat = () => { try { localStorage.setItem(CHAT_KEY, JSON.stringify(chat.slice(-40))); } catch {} };
const IA_SUGG = [["Ce soir", "Qu'est-ce que je dois faire ce soir ?"], ['Ma semaine', 'Organise ma semaine'], ['En retard', "Qu'est-ce qui est en retard ?"], ['Demain', "Qu'est-ce que j'ai demain ?"], ['Réviser', 'Fais-moi un planning de révision pour mon prochain contrôle']];
// Mise en forme sûre : on échappe d'abord, puis on reconnaît titres, listes, gras et horaires.
function fmtMsg(txt) {
  const inline = x => esc(x)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])(\d{1,2}h(?:\d{2})?(?:\s?[-–à]\s?\d{1,2}h(?:\d{2})?)?)/g, '$1<span class="tm">$2</span>')
    .replace(/✓/g, '<span class="ok">✓</span>');
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`<${list.t}>${list.items.join('')}</${list.t}>`); list = null; } };
  for (let raw of String(txt || '').replace(/\r/g, '').split('\n')) {
    const l = raw.trim();
    if (!l) { close(); continue; }
    let m;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(l)) { close(); out.push('<hr>'); continue; }
    if ((m = l.match(/^>\s?(.*)$/))) { close(); if (out.length && out[out.length - 1].startsWith('<blockquote>')) out[out.length - 1] = out[out.length - 1].replace('</blockquote>', `<br>${inline(m[1])}</blockquote>`); else out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    if ((m = l.match(/^#{1,4}\s*(.+)$/)) || (m = l.match(/^\*\*([^*]{2,60})\*\*\s*:?$/)) || (l.length < 48 && /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|aujourd'hui|demain|ce soir|ce week-end|priorit|conseil|à faire|matin|après-midi|soir)/i.test(l) && /:$/.test(l) && (m = [l, l.replace(/:$/, '')]))) { close(); out.push(`<h4>${inline(m[1].replace(/\*\*/g, '').replace(/:$/, ''))}</h4>`); continue; }
    if ((m = l.match(/^[-•*]\s+(.+)$/))) { if (!list || list.t !== 'ul') { close(); list = { t: 'ul', items: [] }; } list.items.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = l.match(/^\d+[.)]\s+(.+)$/))) { if (!list || list.t !== 'ol') { close(); list = { t: 'ol', items: [] }; } list.items.push(`<li>${inline(m[1])}</li>`); continue; }
    close(); out.push(`<p>${inline(l)}</p>`);
  }
  close(); return out.join('');
}
const AI_AV = `<span class="aiAv">${SVG('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>')}</span>`;
function msgHTML(m, i) {
  if (m.role === 'user') return `<div class="msg u">${m.imgs ? `<div class="uImgs">${m.imgs.map(d => `<img src="data:image/jpeg;base64,${d}" alt="">`).join('')}</div>` : ''}${esc(m.content)}</div>`;
  return `<div class="msgRow">${AI_AV}<div class="msg a${m.err ? ' err' : ''}">${fmtRich(m.content)}${m.err ? '' : `<div class="msgAct"><button data-copy="${i}">Copier</button>${m.q ? `<button data-redo="${i}">Autre réponse</button>` : ''}${m.rich ? `<button data-mkfiche="${i}">En faire une fiche</button>` : ''}</div>`}</div></div>`;
}
const IA_ACTIONS = [['soir', 'Ma soirée', 'quoi faire ce soir'], ['semaine', 'Ma semaine', 'organisée jour par jour'], ['fiche', 'Faire une fiche', 'synthèse + schéma'], ['quiz', "M'interroger", 'quiz de 8 questions'], ['photo', 'Exercice en photo', 'il te guide pas à pas'], ['ex', "M'expliquer", 'une notion du cours']];
function helloHTML() {
  const name = server.me?.name && server.me.name !== 'Invité' ? server.me.name : '';
  const fs = fiches.slice(0, 8);
  return `<div class="chatHello">${AI_AV}<h3>Salut${name ? ' ' + esc(name) : ''} 👋</h3><p>Écris une tâche à ajouter, une question sur ta semaine, une notion à comprendre, ou envoie un exercice en photo. Je m'appuie sur ton emploi du temps, tes devoirs, tes notes et ton cahier de textes.</p>
    <div class="stGrid">${IA_ACTIONS.map(([k, t, d]) => `<button data-st="${k}"><b>${t}</b><span>${d}</span></button>`).join('')}</div>
    ${fs.length ? `<div class="dayHead" style="margin-top:6px"><b>Mes fiches</b><span class="n">${fiches.length}</span></div><div class="fStrip">${fs.map(f => `<button class="fChip" data-fiche="${f.id}">${subjBadge(f.subject || f.title, 'sq mini')}<span><b>${esc(f.title)}</b><small>${esc(f.subject || '')}${f.score != null ? ' · quiz ' + f.score + '/8' : ''}</small></span></button>`).join('')}</div>` : ''}</div>`;
}
function paintChat(stick = true) {
  const L = $('#chatList'); if (!L) return;
  const atBottom = L.scrollHeight - L.scrollTop - L.clientHeight < 80;
  L.innerHTML = (chat.length ? '' : helloHTML())
    + chat.map(msgHTML).join('')
    + (asking ? `<div class="msgRow">${AI_AV}<div class="msg a think"><i></i><i></i><i></i></div></div>` : '');
  enhance(L);
  $('#iaSugg').hidden = chat.length > 0 || asking;
  $('#iaNew').hidden = !chat.length;
  const inp = $('#chatIn'), btn = $('#chatF button:last-child'); if (inp) { inp.disabled = asking; btn.disabled = asking; }
  if (stick || atBottom) requestAnimationFrame(() => { const last = L.querySelector('.msgRow:last-child, .msg.u:last-child'); if (last && last.offsetHeight > L.clientHeight * .7 && !asking && chat.at(-1)?.role === 'assistant') L.scrollTop = last.offsetTop - 10; else L.scrollTop = L.scrollHeight; });
}
const IA_SUGG2 = [['Ce soir', "Qu'est-ce que je dois faire ce soir ?"], ['Rentrer', 'Comment je rentre après les cours ?'], ['Ma semaine', 'Organise ma semaine'], ['Fiche', '#fiche'], ['Quiz', '#quiz'], ['Photo', '#photo'], ['Mes fiches', '#list'], ['En retard', "Qu'est-ce qui est en retard ?"]];
function iaAction(k) {
  const inp = $('#chatIn');
  if (k === 'fiche') ficheSheet(); else if (k === 'quiz') quizSheet(); else if (k === 'photo') $('#stFile').click(); else if (k === 'list') fichesSheet();
  else if (k === 'ex') { inp.value = 'Explique-moi '; inp.focus(); }
  else if (k === 'soir') ask("Qu'est-ce que je dois faire ce soir ?"); else if (k === 'semaine') ask('Organise ma semaine');
}
function rAI(force) {
  const v = $('#v-ia');
  if (!server.flags?.ai) { v.classList.remove('iaV'); v.innerHTML = `<div class="chatwrap"><div class="msg a">Pour discuter avec moi, ajoute une clé IA gratuite dans Réglages (Groq, 1 minute).</div><button class="btn p" id="goSet" style="align-self:flex-start">Ouvrir les réglages</button></div>`; $('#goSet').onclick = openSettings; return; }
  if ($('#chatList') && !force) return; // déjà affiché : on ne reconstruit pas (garde le défilement et la saisie)
  v.classList.add('iaV');
  v.innerHTML = `<div class="iaTop"><div><span class="liveDot"></span><span>Organisation & révisions · connaît ton planning</span></div><button class="btn" id="iaNew" hidden>Nouvelle conv.</button></div>
    <div class="chatList" id="chatList"></div>
    <div class="iaBottom">
      <div class="sugg" id="iaSugg">${IA_SUGG2.map(([l, q]) => `<button data-q="${esc(q)}">${l}${q === '#list' && fiches.length ? ' · ' + fiches.length : ''}</button>`).join('')}</div>
      <div class="stImgs" id="stImgs"></div>
      <form class="chatin" id="chatF"><button type="button" class="mic" id="chatCam" aria-label="Ajouter une photo">${SVG('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>')}</button><textarea id="chatIn" rows="1" placeholder="Écris ou dicte…" aria-label="Message" enterkeyhint="send"></textarea><button type="button" class="mic" id="chatMic" aria-label="Dicter">${MIC_SVG}</button><button aria-label="Envoyer">${SVG('<path d="M5 12h14M13 6l6 6-6 6"/>')}</button></form>
      <input type="file" id="stFile" accept="image/*" multiple hidden>
    </div>`;
  const inp = $('#chatIn');
  const grow = () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 130) + 'px'; };
  inp.oninput = grow;
  inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(max-width:699px)').matches) { e.preventDefault(); $('#chatF').requestSubmit(); } };
  $('#chatF').onsubmit = e => { e.preventDefault(); const q = inp.value.trim(); if (q || stImgs.length) { inp.value = ''; grow(); ask(q); } };
  v.querySelectorAll('#iaSugg button').forEach(b => b.onclick = () => b.dataset.q.startsWith('#') ? iaAction(b.dataset.q.slice(1)) : ask(b.dataset.q));
  $('#iaNew').onclick = () => { chat = []; saveChat(); paintChat(); };
  $('#chatMic').onclick = e => toggleVoice(e.currentTarget, inp);
  $('#chatCam').onclick = () => $('#stFile').click();
  $('#stFile').onchange = async e => { for (const f of [...e.target.files].slice(0, 4 - stImgs.length)) stImgs.push({ mime: 'image/jpeg', data: await shrinkImg(f) }); e.target.value = ''; paintImgs(); if (!inp.value) inp.placeholder = 'Que veux-tu savoir sur cette photo ?'; inp.focus(); };
  $('#chatList').onclick = e => {
    const st = e.target.closest('[data-st]'); if (st) return iaAction(st.dataset.st);
    const f = e.target.closest('[data-fiche]'); if (f) return openFiche(f.dataset.fiche);
    const c = e.target.closest('[data-copy]'), r = e.target.closest('[data-redo]'), mk = e.target.closest('[data-mkfiche]');
    if (c) { navigator.clipboard?.writeText(chat[+c.dataset.copy].content).then(() => toast('Copié', ''), () => {}); }
    if (r && !asking) { const i = +r.dataset.redo, q = chat[i].q; chat.splice(i - 1, 2); ask(q); }
    if (mk) { const i = +mk.dataset.mkfiche; makeFiche({ topic: (chat[i - 1]?.content || '').slice(0, 300), extra: chat[i].content }); }
  };
  paintImgs(); paintChat(); loadFiches();
  if (!matchMedia('(max-width:699px)').matches) inp.focus();
}
function snapshotCtx() {
  const A = active().sort(byDue).slice(0, 60).map(t => `- [${t.id}] ${t.title}${t.kind === 'devoir' ? ' (devoir ' + (t.subject || '') + ')' : ''}${t.due ? ' — pour le ' + t.due + (t.time ? ' ' + t.time : '') : ''}${t.repeat ? ' — répétition ' + t.repeat : ''}`).join('\n');
  const days = Array.from({ length: 8 }, (_, i) => addDays(startOfDay(new Date()), i));
  const W = days.map(d => {
    const c = coursOn(d).map(x => `${fmtTime(x.starts_at)}-${fmtTime(x.ends_at)} ${isOff(x) ? 'ANNULÉ (libre) : ' : 'cours de '}${prettySubj(x.subject)}`);
    const ev = eventsOn(d).map(e => `${e.allDay ? 'toute la journée' : fmtTime(e.start) + '-' + fmtTime(e.end)} ${e.title} (agenda)`);
    const tot = [...c, ...ev];
    return `${cap(fmtDay(d))} : ${tot.length ? tot.join(' ; ') : 'rien de prévu'}`;
  }).join('\n');
  const nowS = daySchedule(new Date()), cur = nowS.find(x => x.start <= new Date() && new Date() < x.end), nx = nowS.find(x => x.start > new Date());
  const pos = cur ? `En ce moment : ${cur.title} jusqu'à ${fmtTime(cur.end)}.` : nx ? `Prochain : ${nx.title} à ${fmtTime(nx.start)}.` : 'Plus de cours aujourd\'hui.';
  return `${todayCtx()} ${pos}${notesCtx()}${contenusCtx()}\nTÂCHES ET DEVOIRS ACTIFS (avec leur date limite) :\n${A || '(aucun)'}\n\nEMPLOI DU TEMPS ET AGENDA DES 8 PROCHAINS JOURS :\n${W}`;
}
let asking = false;

/* ================= Rendu riche : Markdown + formules (KaTeX) + schémas (Mermaid) ================= */
function fmtRich(txt) {
  const parts = String(txt || '').split(/```(\w*)\n?([\s\S]*?)```/g);
  let out = '';
  for (let i = 0; i < parts.length; i += 3) {
    out += mdBlock(parts[i]);
    if (i + 2 < parts.length) {
      const lang = parts[i + 1], code = parts[i + 2].trim();
      out += lang === 'mermaid' ? `<div class="mmd" data-src="${encodeURIComponent(code)}"><div class="mmdLoad">Schéma en cours…</div></div>` : `<pre class="code">${esc(code)}</pre>`;
    }
  }
  return out;
}
function mdBlock(t) {
  if (!t.trim()) return '';
  const math = []; const keep = (tex, disp) => { math.push([tex, disp]); return `⟦${math.length - 1}⟧`; };
  t = t.replace(/\$\$([\s\S]+?)\$\$/g, (_, x) => keep(x, true)).replace(/\\\[([\s\S]+?)\\\]/g, (_, x) => keep(x, true))
       .replace(/\$([^$\n]{1,200}?)\$/g, (_, x) => keep(x, false)).replace(/\\\(([\s\S]+?)\\\)/g, (_, x) => keep(x, false));
  // tableaux Markdown simples
  t = t.replace(/((?:^\|.*\|[ \t]*\n?){2,})/gm, blk => {
    const rows = blk.trim().split('\n').filter(r => !/^\|\s*:?-{2,}/.test(r)).map(r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
    return `\n⟪${encodeURIComponent(JSON.stringify(rows))}⟫\n`;
  });
  let h = fmtMsg(t);
  h = h.replace(/<p>⟪([^⟫]+)⟫<\/p>/g, (_, j) => { const rows = JSON.parse(decodeURIComponent(j)); return `<div class="tblW"><table>${rows.map((r, i) => `<tr>${r.map(c => i ? `<td>${fmtInline(c)}</td>` : `<th>${fmtInline(c)}</th>`).join('')}</tr>`).join('')}</table></div>`; });
  h = h.replace(/\*(?!\s)([^*<]+?)\*/g, '<i>$1</i>');
  return h.replace(/⟦(\d+)⟧/g, (_, n) => { const [tex, disp] = math[+n]; return `<span class="tex${disp ? ' disp' : ''}" data-tex="${encodeURIComponent(tex)}">${esc(tex)}</span>`; });
}
const fmtInline = x => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
function loadScript(src) { return new Promise((ok, ko) => { if (document.querySelector(`script[src="${src}"]`)) { const w = () => setTimeout(ok, 50); return w(); } const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }); }
let katexP = null, mermaidP = null;
function enhance(root) {
  if (!root) return;
  const tex = root.querySelectorAll('.tex:not(.done)');
  if (tex.length) {
    katexP = katexP || (() => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'vendor/katex/katex.min.css'; document.head.appendChild(l); return loadScript('vendor/katex/katex.min.js'); })();
    katexP.then(() => tex.forEach(el => { try { window.katex.render(decodeURIComponent(el.dataset.tex), el, { displayMode: el.classList.contains('disp'), throwOnError: false }); el.classList.add('done'); } catch { } })).catch(() => { });
  }
  const mm = root.querySelectorAll('.mmd:not(.done)');
  if (mm.length) {
    mermaidP = mermaidP || loadScript('vendor/mermaid.min.js').then(() => window.mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict', fontFamily: 'Schibsted Grotesk, system-ui, sans-serif', themeVariables: { primaryColor: '#21242B', primaryBorderColor: getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#ff6a47', primaryTextColor: '#F5F5F2', lineColor: '#9C9EA6', fontSize: '15px' } }));
    mermaidP.then(async () => { for (const el of mm) { el.classList.add('done'); const src = decodeURIComponent(el.dataset.src); try { const { svg } = await window.mermaid.render('m' + Math.random().toString(36).slice(2), src); el.innerHTML = svg; } catch { el.innerHTML = `<pre class="code">${esc(src)}</pre>`; } } }).catch(() => mm.forEach(el => el.innerHTML = '<div class="mmdLoad">Schéma indisponible hors connexion</div>'));
  }
}

/* ================= Mode Réviser : prof perso, fiches, quiz, photo d'exercice ================= */
let stImgs = [];
let fiches = store.get('orbit.fiches', []);
async function loadFiches() { try { const r = await extra('fiches'); if (Array.isArray(r.fiches)) { const ch = JSON.stringify(r.fiches) !== JSON.stringify(fiches); fiches = r.fiches; store.set('orbit.fiches', fiches); if (ch && current === 'ia' && !chat.length && !asking) paintChat(false); } } catch { } }
async function studyCall(body) {
  const r = await withTimeout(extra('study', body), body.mode === 'chat' ? 70000 : 125000);
  if (!r.ok) { const e = new Error(r.error || 'erreur'); e.code = r.error === 'no_key' ? 'no_key' : /rate|429|limit/i.test(r.error || '') ? 'rate_limited' : ''; throw e; }
  return r.text;
}
const parseJSON = t => { try { return JSON.parse(t); } catch { const m = String(t).match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } };
function studyCtx(subject) {
  const sub = (subject || '').toLowerCase(); const C = contenus.filter(x => !sub || (prettySubj(x.subject) || '').toLowerCase().includes(sub) || sub.includes((prettySubj(x.subject) || '').toLowerCase()));
  const parts = [];
  if (C.length) parts.push('Cahier de textes : ' + C.slice(0, 10).map(x => `${prettySubj(x.subject)} (${x.start.slice(0, 10)}) : ${x.items.map(i => [i.title, i.text].filter(Boolean).join(' — ')).join(' / ')}`).join(' ; '));
  const D = uniqueDevoirs().filter(d => !sub || (prettySubj(d.subject) || '').toLowerCase().includes(sub)).slice(0, 8);
  if (D.length) parts.push('Devoirs à venir : ' + D.map(d => `${prettySubj(d.subject)} pour le ${d.due} : ${decode(d.description).slice(0, 200)}`).join(' ; '));
  if (notes && !sub) parts.push(notesCtx());
  return parts.join('\n');
}
function paintImgs() { const w = $('#stImgs'); if (!w) return; w.innerHTML = stImgs.map((im, i) => `<span><img src="data:${im.mime};base64,${im.data}" alt=""><button data-rm="${i}" aria-label="Retirer">×</button></span>`).join(''); w.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { stImgs.splice(+b.dataset.rm, 1); paintImgs(); }); }
function shrinkImg(file, max = 1600) {
  return new Promise((ok, ko) => { const img = new Image(); img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', .85).split(',')[1]); URL.revokeObjectURL(img.src); }; img.onerror = ko; img.src = URL.createObjectURL(file); });
}
function subjectChoices() {
  const S = new Set([...uniqueDevoirs().map(d => prettySubj(d.subject)), ...contenus.map(x => prettySubj(x.subject)), ...(notes?.subjects || []).map(x => subjParts(x.name).main), ...(server.cours || []).map(c => prettySubj(c.subject))].filter(Boolean));
  return [...S].filter(n => !/vie de classe|accompagnement/i.test(n));
}
function ficheSheet(pre = {}) {
  const subs = subjectChoices(); let subj = pre.subject || null;
  const s = $('#sheet');
  const sugg = () => { const C = contenus.filter(x => subj && prettySubj(x.subject) === subj).slice(0, 4); return C.length ? `<label class="l">D'après tes derniers cours</label><div class="chipsRow">${C.map(x => { const t = (x.items[0].title || x.items[0].text).split('\n')[0].slice(0, 60); return `<span data-t="${esc(t)}">${esc(t)}</span>`; }).join('')}</div>` : ''; };
  const paint = () => {
    s.innerHTML = `<div class="grab"></div><h2>Nouvelle fiche</h2><p class="small muted" style="margin-top:4px">L'IA résume le sujet avec définitions, formules, schéma et erreurs fréquentes. Vérifie-la avec ton cours.</p>
      <label class="l">Matière</label><div class="chipsRow">${subs.map(n => `<span class="${subj === n ? 'on' : ''}" data-s="${esc(n)}">${subjBadge(n, 'sq mini')}${esc(n)}</span>`).join('')}</div>
      <label class="l" for="fTopic">Sujet</label><input class="inp" id="fTopic" placeholder="ex : forme canonique, prétérit, la Boétie…" value="${esc(pre.topic || '')}">
      <div id="fSugg">${sugg()}</div>
      <label class="l">Photos de ton cours (facultatif)</label><div class="inline"><button class="btn" id="fPh">${SVG('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>').replace('<svg', '<svg style="width:16px;height:16px;margin-right:6px;vertical-align:-3px"')}Ajouter</button><span class="small muted" id="fPhN">${(pre.imgs || []).length ? (pre.imgs.length + ' photo(s)') : 'aucune'}</span></div><input type="file" id="fFile" accept="image/*" multiple hidden>
      <div class="acts"><button class="btn p" id="fGo">Créer la fiche</button><button class="btn" id="fX">Annuler</button></div>`;
    s.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { pre.topic = $('#fTopic').value; subj = b.dataset.s; pre.subject = subj; paint(); });
    s.querySelectorAll('#fSugg [data-t]').forEach(b => b.onclick = () => { $('#fTopic').value = b.dataset.t; });
    $('#fPh').onclick = () => $('#fFile').click();
    $('#fFile').onchange = async e => { pre.imgs = pre.imgs || []; for (const f of [...e.target.files].slice(0, 4)) pre.imgs.push({ mime: 'image/jpeg', data: await shrinkImg(f) }); $('#fPhN').textContent = pre.imgs.length + ' photo(s)'; };
    $('#fX').onclick = closeSheet;
    $('#fGo').onclick = () => { const topic = $('#fTopic').value.trim(); if (!topic && !subj && !(pre.imgs || []).length) return toast('Il manque le sujet', 'Écris de quoi parle la fiche'); closeSheet(); makeFiche({ subject: subj, topic, imgs: pre.imgs }); };
  };
  paint(); openSheet();
}
async function makeFiche({ subject, topic, imgs = [], extra: more }) {
  toast('Fiche en préparation', 'Ça prend 10 à 30 secondes');
  const ov = showOverlay(`<div class="fLoad">${AI_AV}<b>Je prépare ta fiche…</b><span>${esc([subject, topic].filter(Boolean).join(' · ') || 'à partir de tes photos')}</span><div class="skel" style="width:100%">${'<i style="height:60px"></i>'.repeat(4)}</div></div>`);
  try {
    const text = await studyCall({ mode: 'fiche', prompt: `Fiche de révision${subject ? ' de ' + subject : ''}${topic ? ' : ' + topic : ''}.${more ? '\nBase-toi aussi sur cette explication :\n' + more.slice(0, 6000) : ''}${imgs.length ? '\nLes photos jointes sont le cours de l\'élève : appuie-toi dessus en priorité.' : ''}`, images: imgs, context: studyCtx(subject) });
    const f = parseJSON(text); if (!f || !f.title) throw new Error('fiche illisible');
    f.id = 'f' + Date.now().toString(36); f.subject = subject || f.subject || ''; f.createdAt = new Date().toISOString(); f.topic = topic || '';
    fiches = [f, ...fiches].slice(0, 80); store.set('orbit.fiches', fiches); extra('fiche_save', { fiche: f }).catch(() => { });
    ov.remove(); openFiche(f.id); if ($('#chatList') && !chat.length) paintChat(false);
  } catch (e) { ov.remove(); toast('Fiche ratée', e.code === 'rate_limited' ? 'Trop de demandes, réessaie dans une minute' : 'Réessaie, ou précise le sujet'); }
}
function showOverlay(html) { const o = document.createElement('div'); o.className = 'ficheO'; o.innerHTML = `<div class="fBg2"></div><div class="fWrap">${html}</div>`; document.body.appendChild(o); requestAnimationFrame(() => o.classList.add('on')); return o; }
function ficheHTML(f) {
  const L = (arr, cls = '') => (arr || []).filter(Boolean).map(x => `<li class="${cls}">${mdInline(x)}</li>`).join('');
  return `<div class="fTop">${subjBadge(f.subject || f.title)}<div class="nTx"><small>${esc(f.subject || 'Fiche')} · ${new Date(f.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</small><h2>${esc(f.title)}</h2></div><button class="iconbtn" id="fxClose" aria-label="Fermer">${SVG('<path d="M6 6l12 12M18 6L6 18"/>')}</button></div>
    ${f.resume ? `<p class="fRes">${mdInline(f.resume)}</p>` : ''}
    ${f.retenir?.length ? `<div class="fiBox fKey"><h4>À retenir</h4><ul>${L(f.retenir)}</ul></div>` : ''}
    ${(f.sections || []).map(x => `<div class="fSec"><h3>${esc(x.titre || '')}</h3><ul>${L(x.points)}</ul></div>`).join('')}
    ${f.definitions?.length ? `<div class="fSec"><h3>Définitions</h3><div class="fDefs">${f.definitions.map(d => `<div><b>${esc(d.terme)}</b><span>${mdInline(d.def)}</span></div>`).join('')}</div></div>` : ''}
    ${f.formules?.length ? `<div class="fSec"><h3>Formules</h3>${f.formules.map(x => `<div class="fForm"><small>${esc(x.nom || '')}</small><span class="tex disp" data-tex="${encodeURIComponent(x.latex || '')}">${esc(x.latex || '')}</span>${x.explication ? `<p>${mdInline(x.explication)}</p>` : ''}</div>`).join('')}</div>` : ''}
    ${f.schema ? `<div class="fSec"><h3>Schéma</h3><div class="mmd" data-src="${encodeURIComponent(String(f.schema).replace(/^```mermaid\s*|```$/g, ''))}"><div class="mmdLoad">Schéma en cours…</div></div></div>` : ''}
    ${f.exemples?.length ? `<div class="fSec"><h3>Exemples</h3><ul>${L(f.exemples)}</ul></div>` : ''}
    ${f.pieges?.length ? `<div class="fiBox fTrap"><h4>Pièges à éviter</h4><ul>${L(f.pieges)}</ul></div>` : ''}
    <div class="fActs"><button class="btn p ic" id="fxQuiz">${ICON.ia}M'interroger${f.score != null ? ' (' + f.score + '/8)' : ''}</button><button class="btn" id="fxAsk">Poser une question</button><button class="btn" id="fxDel">Supprimer</button></div>`;
}
const mdInline = x => mdBlock(String(x || '')).replace(/^<p>|<\/p>$/g, '');
function openFiche(id) {
  const f = fiches.find(x => x.id === id); if (!f) return;
  const o = showOverlay(ficheHTML(f)); enhance(o);
  const close = () => { o.classList.remove('on'); setTimeout(() => o.remove(), 300); };
  o.querySelector('#fxClose').onclick = close;
  o.querySelector('.fBg2').onclick = close;
  o.querySelector('#fxQuiz').onclick = () => { close(); runQuiz({ fiche: f }); };
  o.querySelector('#fxAsk').onclick = () => { close(); go('ia'); const i = $('#chatIn'); if (i) { i.value = `Sur ma fiche « ${f.title} » : `; i.focus(); } };
  o.querySelector('#fxDel').onclick = () => { if (!confirmDel(o.querySelector('#fxDel'))) return; fiches = fiches.filter(x => x.id !== id); store.set('orbit.fiches', fiches); extra('fiche_del', { id }).catch(() => { }); close(); if ($('#chatList') && !chat.length) paintChat(false); toast('Fiche supprimée', f.title); };
}
function confirmDel(btn) { if (btn.dataset.sure) return true; btn.dataset.sure = '1'; btn.textContent = 'Confirmer ?'; btn.classList.add('danger'); setTimeout(() => { delete btn.dataset.sure; btn.textContent = 'Supprimer'; btn.classList.remove('danger'); }, 3000); return false; }
function fichesSheet() {
  const s = $('#sheet'), by = new Map(); for (const f of fiches) { const k = f.subject || 'Autres'; if (!by.has(k)) by.set(k, []); by.get(k).push(f); }
  s.innerHTML = `<div class="grab"></div><h2>Mes fiches</h2>${fiches.length ? [...by.entries()].map(([k, L]) => `<label class="l">${esc(k)}</label><div class="list">${L.map(f => `<button class="fRow" data-fiche="${f.id}">${subjBadge(f.subject || f.title, 'sq')}<span><b>${esc(f.title)}</b><small>${new Date(f.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}${f.score != null ? ' · quiz ' + f.score + '/8' : ''}</small></span></button>`).join('')}</div>`).join('') : '<p class="small muted" style="margin-top:10px">Pas encore de fiche.</p>'}
    <div class="acts"><button class="btn p" id="fsNew">Nouvelle fiche</button><button class="btn" id="fsX">Fermer</button></div>`;
  openSheet(); $('#fsX').onclick = closeSheet; $('#fsNew').onclick = () => ficheSheet();
  s.querySelectorAll('[data-fiche]').forEach(b => b.onclick = () => { closeSheet(); openFiche(b.dataset.fiche); });
}
function quizSheet() {
  const subs = subjectChoices(); let subj = null;
  const s = $('#sheet');
  const paint = () => {
    s.innerHTML = `<div class="grab"></div><h2>M'interroger</h2><p class="small muted" style="margin-top:4px">8 questions, de plus en plus dures, avec la correction expliquée.</p>
      ${fiches.length ? `<label class="l">Sur une de mes fiches</label><div class="chipsRow">${fiches.slice(0, 8).map(f => `<span data-qf="${f.id}">${subjBadge(f.subject || f.title, 'sq mini')}${esc(f.title.slice(0, 40))}</span>`).join('')}</div>` : ''}
      <label class="l">Ou sur une matière</label><div class="chipsRow">${subs.map(n => `<span class="${subj === n ? 'on' : ''}" data-s="${esc(n)}">${subjBadge(n, 'sq mini')}${esc(n)}</span>`).join('')}</div>
      <label class="l" for="qTopic">Sujet précis (facultatif)</label><input class="inp" id="qTopic" placeholder="ex : les fonctions du second degré">
      <div class="acts"><button class="btn p" id="qGo">C'est parti</button><button class="btn" id="qX">Annuler</button></div>`;
    s.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { subj = b.dataset.s; paint(); });
    s.querySelectorAll('[data-qf]').forEach(b => b.onclick = () => { closeSheet(); runQuiz({ fiche: fiches.find(f => f.id === b.dataset.qf) }); });
    $('#qX').onclick = closeSheet;
    $('#qGo').onclick = () => { const t = $('#qTopic').value.trim(); if (!subj && !t) return toast('Choisis une matière', 'ou écris un sujet'); closeSheet(); runQuiz({ subject: subj, topic: t }); };
  };
  paint(); openSheet();
}
async function runQuiz({ fiche, subject, topic }) {
  const ov = showOverlay(`<div class="fLoad">${AI_AV}<b>Je prépare ton quiz…</b><span>${esc(fiche ? fiche.title : [subject, topic].filter(Boolean).join(' · '))}</span><div class="skel" style="width:100%">${'<i style="height:54px"></i>'.repeat(4)}</div></div>`);
  let qs;
  try {
    const ctx = fiche ? 'FICHE : ' + JSON.stringify({ title: fiche.title, sections: fiche.sections, definitions: fiche.definitions, formules: fiche.formules, retenir: fiche.retenir, pieges: fiche.pieges }).slice(0, 9000) : studyCtx(subject);
    const text = await studyCall({ mode: 'quiz', prompt: `Quiz sur ${fiche ? 'la fiche « ' + fiche.title + ' »' : [subject, topic].filter(Boolean).join(' : ')}.`, context: ctx });
    qs = (parseJSON(text)?.questions || []).filter(q => q.q && Array.isArray(q.choix) && q.choix.length >= 2 && q.bonne >= 0 && q.bonne < q.choix.length).slice(0, 10);
    if (!qs.length) throw new Error('quiz vide');
  } catch (e) { ov.remove(); return toast('Quiz raté', e.code === 'rate_limited' ? 'Trop de demandes, réessaie dans une minute' : 'Réessaie dans un instant'); }
  let i = 0, score = 0, answered = false;
  const wrap = ov.querySelector('.fWrap');
  const close = () => { ov.classList.remove('on'); setTimeout(() => ov.remove(), 300); };
  const paint = () => {
    if (i >= qs.length) {
      const pct = score / qs.length;
      if (fiche) { fiche.score = score; store.set('orbit.fiches', fiches); extra('fiche_save', { fiche }).catch(() => { }); }
      wrap.innerHTML = `<div class="qEnd"><div class="qScore ${pct >= .75 ? 'g4' : pct >= .5 ? 'g2' : 'g0'}">${score}<span>/${qs.length}</span></div><h2>${pct >= .875 ? 'Excellent !' : pct >= .625 ? 'Bien joué' : pct >= .375 ? 'Pas mal, encore un effort' : 'À retravailler'}</h2><p class="small muted">${pct >= .75 ? `${score} bonnes réponses sur ${qs.length}.` : `${score} bonnes réponses sur ${qs.length}. Relis la fiche, puis refais le quiz demain.`}</p>
        <div class="fActs"><button class="btn p" id="qAgain">Nouveau quiz</button>${fiche ? '<button class="btn" id="qFiche">Revoir la fiche</button>' : ''}<button class="btn" id="qClose">Fermer</button></div></div>`;
      wrap.querySelector('#qAgain').onclick = () => { close(); runQuiz({ fiche, subject, topic }); };
      const qf = wrap.querySelector('#qFiche'); if (qf) qf.onclick = () => { close(); openFiche(fiche.id); };
      wrap.querySelector('#qClose').onclick = close;
      if (pct >= .75) chime();
      return;
    }
    const q = qs[i]; answered = false;
    wrap.innerHTML = `<div class="qTop"><span>Question ${i + 1}/${qs.length}</span><div class="qBar"><i style="width:${i / qs.length * 100}%"></i></div><button class="iconbtn" id="qX" aria-label="Fermer">${SVG('<path d="M6 6l12 12M18 6L6 18"/>')}</button></div>
      <h2 class="qQ">${mdInline(q.q)}</h2><div class="qChoices">${q.choix.map((c, k) => `<button data-k="${k}"><i>${'ABCD'[k] || k + 1}</i><span>${mdInline(c)}</span></button>`).join('')}</div><div class="qExp" id="qExp"></div>`;
    enhance(wrap);
    wrap.querySelector('#qX').onclick = close;
    wrap.querySelectorAll('.qChoices button').forEach(b => b.onclick = () => {
      if (answered) return; answered = true; const k = +b.dataset.k, ok = k === q.bonne; if (ok) score++;
      wrap.querySelectorAll('.qChoices button').forEach(x => { const kk = +x.dataset.k; x.classList.add(kk === q.bonne ? 'good' : kk === k ? 'bad' : 'dim'); });
      try { navigator.vibrate?.(ok ? 20 : [40, 40, 40]); } catch { }
      const ex = wrap.querySelector('#qExp'); ex.innerHTML = `<b class="${ok ? 'g4' : 'g0'}">${ok ? 'Bonne réponse' : 'Raté'}</b>${q.explication ? `<p>${mdInline(q.explication)}</p>` : ''}<button class="btn p" id="qNext">${i + 1 < qs.length ? 'Question suivante' : 'Voir mon score'}</button>`;
      enhance(ex); ex.classList.add('on'); ex.querySelector('#qNext').onclick = () => { i++; paint(); };
    });
  };
  paint();
}
// Questions de cours évidentes : on va directement au prof (une seule requête, plus rapide)
const COURS_RE = /^(explique|c'?est quoi|qu'?est[- ]ce qu|comment (on |faire |calculer|résoudre|trouver|conjuguer)|pourquoi |aide[- ]moi (sur|à comprendre|pour l'exo|avec l'exo)|résous|calcule|définition|corrige[- ]moi|traduis)/i;
async function ask(q, pre = null) {
  if (asking || (!q && !stImgs.length)) return; asking = true;
  const imgs = stImgs.slice(); stImgs = []; paintImgs();
  q = q || 'Aide-moi sur cet exercice (photo).';
  chat.push({ role: 'user', content: q, ...(imgs.length ? { imgs: imgs.map(i => i.data).slice(0, 2) } : {}) }); saveChat();
  if ($('#chatList')) paintChat(); else rAI(true);
  try {
    const hist = () => chat.filter(m => !m.err).slice(-14).map(m => ({ role: m.role, content: m.content }));
    const a = pre || (imgs.length || COURS_RE.test(q.trim()) ? { intent: 'cours' } : await withTimeout(agent(q, chat.slice(0, -1).filter(m => !m.err)), 55000));
    if (a.intent === 'cours') {
      const text = await studyCall({ mode: 'chat', messages: hist(), images: imgs, context: studyCtx('') });
      chat.push({ role: 'assistant', content: text, rich: true });
      return;
    }
    if (a.intent === 'fiche' || a.intent === 'quiz') {
      const st = a.study || {}, subject = st.subject ? (prettySubj(st.subject) || st.subject) : null, topic = st.topic || (subject ? '' : q);
      chat.push({ role: 'assistant', content: a.intent === 'fiche' ? `Je prépare ta fiche${subject ? ' de **' + subject + '**' : ''}${topic ? ' : ' + topic : ''}. Elle s'ouvrira toute seule et sera rangée dans **Mes fiches**.` : `C'est parti pour un quiz${subject ? ' de **' + subject + '**' : ''}${topic ? ' sur ' + topic : ''} : 8 questions avec la correction.` });
      setTimeout(() => a.intent === 'fiche' ? makeFiche({ subject, topic }) : runQuiz({ subject, topic }), 50);
      return;
    }
    if (a.intent === 'trajet') { chat.push({ role: 'assistant', content: await tripAnswer(a.trip || {}), q }); return; }
    const notes = [];
    if (a.intent === 'add' && a.tasks.length) { const L = a.tasks.map(x => taskFrom(x, 'ia')); L.forEach(saveTask); notes.push(`✓ **Ajouté :**\n${L.map(t => '- ' + t.title + (t.due ? ' (' + dueLabel(t).toLowerCase() + ')' : '')).join('\n')}`); }
    if (a.edits.length || a.remove.length) notes.push(...applyEdits(a));
    if (a.done.length) { let n = 0; for (const id of a.done) { const t = allItems().find(x => x.id === id); if (t) { completeTask(t, true); n++; } } if (n) notes.push(`✓ ${n} terminé${n > 1 ? 's' : ''}`); }
    const head = (a.intent === 'add' || a.intent === 'edit') && notes.length ? '' : (a.reply || (notes.length ? '' : "Je n'ai pas compris, reformule ?"));
    chat.push({ role: 'assistant', content: [head, ...notes].filter(Boolean).join('\n\n'), q: a.intent === 'chat' ? q : undefined });
  } catch (e) { chat.push({ role: 'assistant', err: true, content: e.code === 'timeout' ? "L'IA met trop de temps à répondre. Réessaie dans un instant." : aiErr(e) }); }
  finally { asking = false; chat.forEach(m => { if (m.imgs && m !== chat.at(-2)) delete m.imgs; }); saveChat(); if (current === 'ia') { if ($('#chatList')) paintChat(); else rAI(true); } }
}
function aiErr(e) {
  const c = String(e?.code || e?.message || '');
  if (c === 'rate_limited') return server.flags?.groq ? 'Les IA sont saturées en ce moment, réessaie dans une minute.' : 'Gemini est saturé en ce moment. Ajoute une clé Groq gratuite dans Réglages : Orbit basculera dessus automatiquement.';
  if (c === 'no_key') return 'Ajoute une clé IA gratuite (Groq ou Gemini) dans Réglages.';
  if (/Groq/i.test(c) && /refusée/i.test(c)) return 'Groq refuse ta clé : recrée-la sur console.groq.com/keys et colle-la dans Réglages.';
  if (/Clé refusée|API key/i.test(c)) return 'Google refuse ta clé Gemini. Recrée une clé sur aistudio.google.com/apikey, copie-la en entier et colle-la dans Réglages.';
  if (/demand|overload|unavailable/i.test(c)) return aiErr({ code: 'rate_limited' });
  if (/Failed to fetch|injoignable/i.test(c)) return 'Pas de connexion au serveur, réessaie dans un instant.';
  return "Oups, je n'ai pas pu répondre (" + c.slice(0, 120) + ').';
}
async function dailyBrief() {
  const o = $('#briefOut'); o.textContent = 'Je prépare ton plan…';
  try { o.textContent = await withTimeout(ai({ prompt: `Tu es l'assistant d'organisation d'un lycéen français. Tutoie. Fais-lui un plan pour aujourd'hui en 5 lignes max : par quoi commencer, quoi caser ce soir en tenant compte de ses cours, un rappel important. Texte simple, pas de markdown.\n${snapshotCtx()}` }), 55000); }
  catch (e) { o.textContent = aiErr(e); }
}

/* ---------- Éditeur ---------- */
function gcalLink(t) {
  const d = dueDate(t); if (!d) return null;
  const s = t.time ? d : new Date(new Date(d).setHours(17, 0, 0, 0)), e = new Date(s.getTime() + 30 * 60e3);
  const f = x => ymd(x).replace(/-/g, '') + 'T' + String(x.getHours()).padStart(2, '0') + String(x.getMinutes()).padStart(2, '0') + '00';
  const p = new URLSearchParams({ action: 'TEMPLATE', text: (t.kind === 'devoir' ? '📚 ' : '⏰ ') + t.title + (t.subject ? ' (' + t.subject + ')' : ''), dates: f(s) + '/' + f(e), details: 'Ajouté depuis Orbit' + (t.note ? ' — ' + t.note : ''), ctz: 'Europe/Paris' });
  if (t.repeat) p.set('recur', 'RRULE:' + { daily: 'FREQ=DAILY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: 'FREQ=WEEKLY', biweekly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY' }[t.repeat]);
  return 'https://calendar.google.com/calendar/render?' + p;
}
function openEditor(t, isNew = false) {
  const s = $('#sheet'), pn = t.source === 'pronote' || t.source === 'revision';
  const link = gcalLink(t);
  if (pn) {
    s.innerHTML = `<div class="grab"></div><h2>${esc(t.subject || 'Devoir')}</h2>
      <p class="small muted" style="margin-top:4px">${t.source === 'revision' ? 'Révision · ' + (t.due ? fmtDay(dueDate(t)) + ' à 18h' : '') : 'Pronote · pour ' + (t.due ? fmtDay(dueDate(t)) : '—')}</p>
      <div style="margin-top:14px;line-height:1.55;white-space:pre-wrap">${esc(t.note || t.title)}</div>
      <label class="l">Rappels Discord</label><div class="chips">${t.reminders.map(r => `<span class="chip ${r.fired ? '' : 'acc'}">${r.label} · ${new Date(r.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${fmtTime(r.at)}</span>`).join('')}</div>
      <div class="acts"><button class="btn p" id="eDone">${t.done ? 'Remettre à faire' : 'Marquer fait'}</button>${t.done ? '' : `<button class="btn ic" id="eFocus">${ICON.play}Focus 25 min</button>`}${link ? `<a class="btn" href="${link}" target="_blank" rel="noopener">Ajouter à Google Agenda</a>` : ''}<button class="btn" id="eX">Fermer</button></div>`;
    $('#eDone').onclick = () => { closeSheet(); completeTask(t, !t.done); };
    const ef = $('#eFocus'); if (ef) ef.onclick = () => startFocus(t);
    $('#eX').onclick = closeSheet; openSheet(); return;
  }
  s.innerHTML = `<div class="grab"></div><h2>${isNew ? 'Nouvelle tâche' : 'Détails'}</h2>
    <label class="l" for="eT">Titre</label><input class="inp" id="eT" value="${esc(t.title)}">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label class="l" for="eD">Date limite</label><input class="inp" type="date" id="eD" value="${t.due || ''}"></div><div><label class="l" for="eH">Heure (optionnel)</label><input class="inp" type="time" id="eH" value="${t.time || ''}"></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label class="l" for="eK">Type</label><select class="inp" id="eK"><option value="tache">Tâche</option><option value="devoir">Devoir</option><option value="rdv">Rendez-vous</option></select></div><div><label class="l" for="eR">Répéter</label><select class="inp" id="eR">${Object.entries(REPEATS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div></div>
    <label class="l" for="eS">Matière</label><input class="inp" id="eS" value="${esc(t.subject || '')}" placeholder="—">
    <label class="l" for="eN">Note</label><textarea class="inp" id="eN" rows="2">${esc(t.note || '')}</textarea>
    <label class="l">Rappels Discord</label><div class="chips">${(t.reminders || []).map(r => `<span class="chip ${r.fired ? '' : 'acc'}">${r.label} · ${new Date(r.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${fmtTime(r.at)}</span>`).join('') || `<span class="chip">${t.due ? (dueDate(t) < new Date() ? 'Date passée : plus de rappel' : 'Plus de rappel prévu') : 'Aucun (ajoute une date)'}</span>`}</div>
    <div class="acts"><button class="btn p" id="eSave">Enregistrer</button>${isNew || t.done ? '' : `<button class="btn ic" id="eFocus">${ICON.play}Focus</button>`}${link ? `<a class="btn" href="${link}" target="_blank" rel="noopener">Ajouter à Google Agenda</a>` : ''}${isNew ? '' : '<button class="btn" id="eDel" style="color:#ff6b6b">Supprimer</button>'}<button class="btn" id="eX">Fermer</button></div>`;
  $('#eK').value = t.kind || 'tache'; $('#eR').value = t.repeat || '';
  $('#eSave').onclick = () => {
    const nt = { ...t, title: $('#eT').value.trim() || t.title, due: $('#eD').value || null, time: $('#eH').value || null, kind: $('#eK').value, repeat: $('#eR').value || null, subject: $('#eS').value.trim() || null, note: $('#eN').value.trim() || null };
    if (nt.repeat && !nt.due) nt.due = ymd(new Date());
    if (nt.due !== t.due || nt.time !== t.time || nt.repeat !== t.repeat || !t.reminders) nt.reminders = buildReminders(nt);
    closeSheet(); saveTask(nt); if (isNew) toast('Ajouté', `${nt.reminders.length} rappels programmés`);
  };
  const ef = $('#eFocus'); if (ef) ef.onclick = () => startFocus(t);
  const d = $('#eDel'); if (d) d.onclick = () => { closeSheet(); removeTask(t.id); toast('Supprimé', t.title); };
  $('#eX').onclick = closeSheet; openSheet();
}
function openSheet() { const sh = $('#sheet'); sh.setAttribute('aria-label', sh.querySelector('h2')?.textContent.trim() || 'Panneau'); $('#scrim').classList.add('on'); sh.classList.add('on'); }
function closeSheet() { $('#scrim').classList.remove('on'); $('#sheet').classList.remove('on'); }
$('#scrim').onclick = closeSheet;
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

/* ---------- Réglages ---------- */
$('#setBtn').onclick = openSettings;
function openSettings() {
  const s = $('#sheet'), f = server.flags || {};
  const share = location.origin + location.pathname + '#k=' + encodeURIComponent(key || '');
  s.innerHTML = `<div class="grab"></div><h2>Réglages</h2>
  <label class="l">Style</label><div class="swatches styles">${[['profond', 'Profond'], ['glass', 'Liquid Glass']].map(([k, l]) => `<button class="styleOpt ${(settings.style || 'profond') === k ? 'on' : ''}" data-s="${k}"><span style="position:relative;z-index:1">${l}</span></button>`).join('')}</div>
  <label class="l">Couleur</label><div class="swatches">${Object.entries(ACCENTS).map(([k, [c]]) => `<button class="sw ${settings.accent === k ? 'on' : ''}" data-a="${k}" style="background:${c}" aria-label="${k}"></button>`).join('')}</div>
  <label class="l">Intensité des rappels</label><div class="seg" id="iseg"><div class="pill"></div>${[['leger', 'Léger'], ['normal', 'Normal'], ['insistant', 'Insistant']].map(([k, l]) => `<button data-i="${k}" class="${settings.intensite === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  <p class="help">${{ leger: 'J-7, la veille et le jour J.', normal: 'J-14, J-7, J-3, J-2, la veille et le jour J.', insistant: 'Presque tous les jours dans les 10 derniers jours.' }[settings.intensite]} Les tâches qui se répètent ont juste un rappel le jour même.</p>

  <label class="l">Rappels Discord</label>
  <div class="opt"><div><b>Message privé avec ping</b><p>Le bot t'envoie chaque rappel (tâches et devoirs Pronote) en MP, même quand Orbit est fermé.</p></div><button class="btn sm" id="sD">Tester</button></div>
  <div class="status"><span class="dot ${f.discord ? 'on' : ''}"></span>${f.discord ? 'ID Discord enregistré' : 'Pas encore d\'ID Discord'}</div>
  <div class="inline"><input class="inp" id="sDid" inputmode="numeric" placeholder="${f.discord ? 'Nouvel ID pour le remplacer' : 'Ton ID Discord (17 à 20 chiffres)'}" autocomplete="off"><button class="btn" id="sDidGo">Enregistrer</button></div>
  <div class="help">Discord → Paramètres → Avancés → active le <b>Mode développeur</b>, puis appuie sur ta photo de profil → <b>« Copier l'identifiant »</b>. Tu dois être sur un serveur où se trouve le bot Orbit pour qu'il puisse t'écrire.</div>
  <label class="l" for="sName">Ton prénom</label>
  <div class="inline"><input class="inp" id="sName" placeholder="${esc(server.me?.name || 'Prénom')}" autocomplete="off"><button class="btn" id="sNameGo">Enregistrer</button></div>

  ${server.me?.sharedAI ? `<label class="l">Assistant IA</label><div class="status"><span class="dot on"></span>Activé (clés partagées par Celyan)</div><div hidden>` : ''}
  <label class="l" for="sGroq">Assistant IA · Groq (gratuit et rapide, recommandé)</label>
  <div class="status"><span class="dot ${f.groq ? 'on' : ''}"></span>${f.groq ? 'Clé enregistrée' : 'Pas de clé'}</div>
  <div class="inline"><input class="inp" id="sGroq" placeholder="${f.groq ? 'Coller une nouvelle clé pour la remplacer' : 'Colle ta clé Groq (gsk_…)'}" autocomplete="off" spellcheck="false"><button class="btn" id="sGroqGo">Enregistrer</button></div>
  <div class="help">Crée ta clé gratuite : <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a> → connecte-toi avec Google → <b>« Create API Key »</b> → copie la clé (gsk_…).</div>

  <label class="l" for="sAI">Assistant IA · Gemini (secours + lecture des captures)</label>
  <div class="status"><span class="dot ${f.gemini ? 'on' : ''}"></span>${f.gemini ? 'Clé enregistrée' : 'Pas de clé'}</div>
  <div class="inline"><input class="inp" id="sAI" placeholder="${f.ai ? 'Coller une nouvelle clé pour la remplacer' : 'Colle ta clé Gemini (AQ.…)'}" autocomplete="off" spellcheck="false"><button class="btn" id="sAIgo">Enregistrer</button></div>
  <div class="help">Crée ta clé gratuite : <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> → <b>« Create API key »</b> → copie la clé en entier (elle commence par <b>AQ.</b> ou AIza).</div>

  ${server.me?.sharedAI ? '</div>' : ''}
  <label class="l" for="sCal">Google Agenda</label>
  <div class="status"><span class="dot ${f.ical ? 'on' : ''}"></span>${f.ical ? 'Relié' + (server.gcalError ? ' · ⚠️ ' + esc(server.gcalError) : '') : 'Pas relié'}</div>
  <div class="inline"><input class="inp" id="sCal" placeholder="Adresse secrète au format iCal (…/basic.ics)" autocomplete="off" spellcheck="false"><button class="btn" id="sCalGo">Relier</button></div>
  <div class="help">Sur ordi : <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noopener">Paramètres Google Agenda</a><ol><li>À gauche, clique sur ton agenda (sous « Paramètres de mes agendas »).</li><li>Tout en bas : <b>Adresse secrète au format iCal</b> → copie.</li><li>Colle-la ici. Orbit la lit toutes les 15 min.</li></ol></div>

  <label class="l">Cet appareil</label>
  <div class="opt"><div><b>Ouvrir Orbit sur un autre appareil</b><p>Copie ce lien et ouvre-le sur ton iPhone ou ton PC : il contient ton code d'accès, garde-le pour toi.</p></div><button class="btn sm" id="sLink">Copier</button></div>
  <div class="opt"><div><b>Installer comme une app</b><p>iPhone : Safari → Partager → « Sur l'écran d'accueil ». PC : Edge/Chrome → icône d'installation dans la barre d'adresse.</p></div></div>
  <div class="opt"><div><b>Se déconnecter de cet appareil</b><p>Efface le code et les données gardées ici (rien n'est supprimé sur le serveur).</p></div><button class="btn sm" id="sOut" style="color:#ff6b6b">Déconnecter</button></div>
  <div class="acts"><button class="btn" id="eX">Fermer</button></div>`;
  s.querySelectorAll('.sw').forEach(b => b.onclick = () => { settings.accent = b.dataset.a; saveSettings(); s.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === b)); });
  s.querySelectorAll('.styleOpt').forEach(b => b.onclick = () => { settings.style = b.dataset.s; saveSettings(); s.querySelectorAll('.styleOpt').forEach(x => x.classList.toggle('on', x === b)); });
  segPill('#iseg');
  s.querySelectorAll('#iseg button').forEach(b => b.onclick = () => {
    settings.intensite = b.dataset.i; saveSettings();
    for (const t of tasks) if (!t.done && t.due) { const nt = { ...t, reminders: buildReminders(t) }; Object.assign(t, nt); outbox.put[t.id] = t; }
    persist(); queueFlush(); scheduleRappels(); openSettings(); toast('Rappels mis à jour', b.textContent);
  });
  $('#sD').onclick = async () => { try { const r = await api('test_discord'); toast('Discord', r.ok ? 'Message de test envoyé, regarde tes MP.' : 'Le bot n\'a pas pu t\'écrire.'); } catch (e) { toast('Discord', 'Serveur injoignable.'); } };
  const secret = async (field, val, btn, ok) => {
    if (!val.trim()) return; btn.disabled = true; btn.textContent = '…';
    try { const r = await api('set_secret', { [field]: val.trim() }); if (r.ok) { toast(ok, 'Enregistré'); await pull(false, true); openSettings(); } else toast('Refusé', r.error || 'Vérifie ce que tu as collé'); }
    catch (e) { toast('Serveur injoignable', 'Réessaie dans un instant'); }
    btn.disabled = false; btn.textContent = 'Enregistrer';
  };
  $('#sAIgo').onclick = e => secret('gemini_key', $('#sAI').value.replace(/\s+/g, ''), e.target, 'Gemini activé');
  $('#sDidGo').onclick = e => secret('discord_id', $('#sDid').value.replace(/\D+/g, ''), e.target, 'Discord relié');
  $('#sNameGo').onclick = e => secret('name', $('#sName').value, e.target, 'Prénom enregistré');
  $('#sGroqGo').onclick = e => secret('groq_key', $('#sGroq').value.replace(/\s+/g, ''), e.target, 'Groq activé');
  $('#sCalGo').onclick = e => secret('ical_url', $('#sCal').value, e.target, 'Google Agenda relié');
  $('#sLink').onclick = async () => { try { await navigator.clipboard.writeText(share); toast('Lien copié', 'Ouvre-le sur ton autre appareil.'); } catch (e) { prompt('Copie ce lien :', share); } };
  $('#sOut').onclick = () => { if (!confirm('Déconnecter Orbit de cet appareil ?')) return; localStorage.clear(); location.hash = ''; location.reload(); };
  $('#eX').onclick = closeSheet; openSheet();
}
function applyAccent() { const [a, b, c] = ACCENTS[settings.accent] || ACCENTS.corail; const r = document.documentElement.style; r.setProperty('--acc', a); r.setProperty('--acc2', b); r.setProperty('--accSoft', c); document.body.classList.toggle('glass', settings.style === 'glass'); document.documentElement.classList.toggle('glass', settings.style === 'glass'); document.querySelector('meta[name=theme-color]')?.setAttribute('content', settings.style === 'glass' ? '#020205' : '#000000'); }

/* ---------- Pronote automatique ---------- */
let pnBusy = false, pnMsg = '', qrData = null;
function pnErr(e) {
  if (!e) return '';
  if (/pas encore connecté/i.test(e)) return 'Pas encore connecté.';
  if (/Bad|credential|Authenticate|PIN|code/i.test(e)) return 'Connexion refusée : QR code expiré ou mauvais code. Recommence avec un nouveau QR.';
  if (/SessionExpired|token/i.test(e)) return 'La connexion Pronote a expiré : appuie sur Reconnecter.';
  if (/Unreachable|PageUnavailable|fetch|network/i.test(e)) return 'Pronote ne répond pas pour l\'instant, nouvel essai automatique.';
  return 'Erreur Pronote : ' + e.split(' | ')[0].slice(0, 160);
}
function pronoteCardHTML() {
  const p = server.pronote || {};
  const head = `<h3>Pronote automatique<span class="sp"></span><span class="tag ${p.connected && !p.last_error ? 'ok' : p.connected ? 'soon' : ''}">${p.connected ? (p.last_error ? 'Erreur' : 'Actif') : 'Inactif'}</span></h3>`;
  if (p.connected && !pnRelink) return `<div class="card">${head}
    <div class="small muted" style="line-height:1.55">Devoirs et emploi du temps mis à jour toutes les 30 min (6 h – 22 h).${p.last_sync ? `<br>Dernière synchro : ${new Date(p.last_sync).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}${p.last_error ? `<br><span style="color:var(--warn)">${esc(pnErr(p.last_error))}</span>` : ''}</div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn p sm" id="pnNow" ${pnBusy ? 'disabled' : ''}>${pnBusy ? 'Synchro…' : 'Synchroniser maintenant'}</button><button class="btn sm" id="pnRelink">Reconnecter</button></div>
    <div class="small muted" id="pnMsg" style="margin-top:8px">${esc(pnMsg)}</div></div>`;
  return `<div class="card">${head}
    <div class="steps"><div>Sur ton PC, ouvre Pronote (via ton ENT) → clique sur ton profil → <b>« Code QR pour l'application mobile »</b>.</div><div>Choisis un code à 4 chiffres, puis fais une <b>capture du QR code</b> (Win + Maj + S).</div><div>Dépose la capture ici et tape le même code (le QR expire au bout de 10 min).</div></div>
    <label class="drop" id="qrDrop"><input type="file" id="qrFile" accept="image/*" hidden>${qrData ? '✅ QR code lu' : '📷 Déposer la capture du QR code'}</label>
    <label class="l" for="qrPin">Code à 4 chiffres</label><input class="inp" id="qrPin" inputmode="numeric" maxlength="4" placeholder="••••" style="letter-spacing:6px;font-weight:800">
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn p" id="qrGo" ${pnBusy ? 'disabled' : ''}>${pnBusy ? 'Connexion…' : 'Connecter Pronote'}</button>${p.connected ? '<button class="btn" id="qrCancel">Annuler</button>' : ''}</div>
    <div class="small" id="pnMsg" style="margin-top:8px;color:var(--mut)">${esc(pnMsg)}</div></div>`;
}
let pnRelink = false;
function loadJsQR() { return new Promise((ok, ko) => { if (window.jsQR) return ok(); const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }); }
async function decodeQR(file) {
  await loadJsQR();
  const img = await createImageBitmap(file);
  for (const scale of [1, 2, 0.5]) {
    const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
    const r = window.jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
    if (r?.data) return r.data;
  }
  return null;
}
function bindPronoteCard() {
  const msg = t => { pnMsg = t; const m = $('#pnMsg'); if (m) m.textContent = t; };
  const now = $('#pnNow'); if (now) now.onclick = async () => {
    pnBusy = true; msg('Le serveur interroge Pronote…'); rHomework();
    try { const r = await api('pronote_sync'); pnMsg = r.ok ? `${r.devoirs} devoirs, ${r.cours} cours récupérés.` : pnErr(r.error); } catch (e) { pnMsg = 'Serveur injoignable.'; }
    pnBusy = false; await pull(); if (current === 'devoirs') rHomework();
  };
  const rl = $('#pnRelink'); if (rl) rl.onclick = () => { pnRelink = true; pnMsg = ''; rHomework(); };
  const cc = $('#qrCancel'); if (cc) cc.onclick = () => { pnRelink = false; pnMsg = ''; rHomework(); };
  const f = $('#qrFile'), dz = $('#qrDrop'); if (!f) return;
  const take = async file => {
    msg('Lecture du QR code…');
    try { const txt = await decodeQR(file); const j = txt && JSON.parse(txt); if (!j?.jeton || !j?.url) throw 0; qrData = j; dz.textContent = '✅ QR code lu'; msg('Tape ton code à 4 chiffres puis connecte.'); }
    catch (e) { qrData = null; msg('QR code illisible : refais une capture plus nette, juste du QR code.'); }
  };
  f.onchange = e => e.target.files[0] && take(e.target.files[0]);
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); const file = [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); if (file) take(file); };
  $('#qrGo').onclick = async () => {
    const pin = ($('#qrPin').value || '').trim();
    if (!qrData) return msg("Dépose d'abord la capture du QR code.");
    if (!/^\d{4}$/.test(pin)) return msg('Le code doit faire 4 chiffres.');
    pnBusy = true; msg('Connexion à Pronote…'); $('#qrGo').disabled = true;
    try {
      const r = await api('pronote_setup', { qr: qrData, pin });
      if (r.ok) { qrData = null; pnRelink = false; pnMsg = ''; toast('Pronote connecté', `${r.devoirs} devoirs et ${r.cours} cours récupérés`); }
      else pnMsg = pnErr(r.error);
    } catch (e) { pnMsg = 'Serveur injoignable.'; }
    pnBusy = false; await pull(); if (current === 'devoirs') rHomework();
  };
}

/* ---------- Toasts & rappels dans l'app ---------- */
function toast(title, sub, opt = {}) {
  const t = el('div', 'toast' + (opt.ok ? ' ok' : ''), `<div class="ic">${opt.ok ? ICON.check : ICON.bell}</div><div class="tx"><b>${esc(title)}</b><span>${esc(sub || '')}</span></div>${opt.undo ? `<button class="undo">${ICON.undo}Annuler</button>` : ''}`);
  const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 320); };
  if (opt.undo) t.querySelector('.undo').onclick = () => { opt.undo(); close(); };
  $('#toasts').appendChild(t); setTimeout(close, opt.undo ? 5000 : 3600);
}
// Quand Orbit est ouvert, un rappel qui tombe s'affiche aussi ici (Discord reste la notification principale)
function checkReminders() {
  const now = new Date();
  for (const t of tasks) {
    if (t.done || !t.reminders) continue;
    const due = t.reminders.filter(r => !r.fired && new Date(r.at) <= now);
    if (!due.length) continue;
    const r = due[due.length - 1];
    if (now - new Date(r.at) < 3 * 3600e3) toast(r.label + ' · ' + t.title, t.due ? 'Échéance : ' + dueLabel(t) : '');
    saveTask({ ...t, reminders: t.reminders.map(x => new Date(x.at) <= now ? { ...x, fired: true } : x) });
  }
}

/* ---------- Code d'accès ---------- */
function showGate(err = '') { $('#gate').hidden = false; $('#gateErr').textContent = err; setTimeout(() => $('#gateKey').focus(), 50); }
$('#gateForm').onsubmit = async e => {
  e.preventDefault();
  const k = $('#gateKey').value.trim(); if (!k) return;
  key = k; $('#gateErr').textContent = 'Vérification…';
  try { await api('state', { since: new Date().toISOString() }); store.set('orbit.key', key); $('#gate').hidden = true; lastSince = null; pull(true); }
  catch (err) { key = null; $('#gateErr').textContent = err.code === 401 ? 'Code incorrect.' : 'Serveur injoignable, réessaie.'; }
};

/* ---------- Démarrage ---------- */
function boot() {
  const m = location.hash.match(/^#k=([^&]+)/);
  if (m) { key = decodeURIComponent(m[1]); store.set('orbit.key', key); lastSince = null; history.replaceState(null, '', location.pathname + '#aujourdhui'); }
  applyAccent(); buildNav();
  const h = location.hash.slice(1); go(TABS.some(t => t[0] === h) ? h : 'aujourdhui', false);
  if (!key) { showGate(); return; }
  pull(!lastSince);
  setInterval(() => pull(), 60e3);
  loadNotes(); setInterval(loadNotes, 10 * 60e3);
  loadContenus(); setInterval(loadContenus, 15 * 60e3);
  loadFiches();
  if (focus) showFocus();
  setInterval(checkReminders, 30e3); setTimeout(checkReminders, 4000);
  setInterval(() => { if (current === 'aujourdhui' && document.visibilityState === 'visible') updateNow(); }, 20e3);
  setInterval(() => { if (current === 'aujourdhui' && document.visibilityState === 'visible' && !document.querySelector('#sheet.on')) rToday(); }, 5 * 60e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
  addEventListener('online', () => pull()); addEventListener('offline', () => setOnline(false));
}
// Pas de zoom ni de défilement de toute la page sur téléphone (app installée)
['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
boot();
