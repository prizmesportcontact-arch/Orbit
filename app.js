/* =========================================================
   Orbit — organisation perso (PC + iPhone)
   App autonome : les données passent par la fonction Supabase orbit-api.
   ========================================================= */
'use strict';
const API = 'https://cbbnrdfvaaikawszaysu.supabase.co/functions/v1/orbit-api';
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
  repeat: SVG('<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
};
const TABS = [['aujourdhui', "Aujourd'hui"], ['taches', 'Tâches'], ['devoirs', 'Devoirs'], ['agenda', 'Agenda'], ['ia', 'Assistant']];
const ACCENTS = { corail: ['#ff6a47', '#ff8c70', '#3a221b'], ambre: ['#ffb23f', '#ffc56e', '#3a2c16'], rose: ['#ff4f8b', '#ff86ae', '#3a1b27'], menthe: ['#4fd1a5', '#7fe0bf', '#16332a'], bleu: ['#6f9bff', '#9ab9ff', '#1c2540'] };
const REPEATS = { '': 'Jamais', daily: 'Tous les jours', weekdays: 'En semaine (lun-ven)', weekly: 'Chaque semaine', biweekly: 'Toutes les 2 semaines', monthly: 'Chaque mois' };

/* ---------- État ---------- */
let key = store.get('orbit.key', null);
let tasks = store.get('orbit.tasks', []);
let settings = Object.assign({ accent: 'corail', intensite: 'normal', pronoteDone: [] }, store.get('orbit.settings', {}));
let server = store.get('orbit.server', { devoirs: [], cours: [], gcal: [], pronote: {}, flags: {} });
let lastSince = store.get('orbit.since', null);
let outbox = store.get('orbit.outbox', { put: {}, del: [], settings: false });
let current = 'aujourdhui', taskFilter = 'actives', agendaDay = startOfDay(new Date()), chat = [];
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
const SUBJ = { 'MATHEMATIQUES': 'Maths', 'FRANCAIS': 'Français', 'ANGLAIS LV1': 'Anglais', 'ANGLAIS LV2': 'Anglais', 'ALLEMAND LV1': 'Allemand', 'ALLEMAND LV2': 'Allemand', 'ESPAGNOL LV1': 'Espagnol', 'ESPAGNOL LV2': 'Espagnol', 'PHYSIQUE-CHIMIE': 'Physique-chimie', 'PHYSIQ.CHIMIE&MATHS': 'Physique-chimie & maths', 'HISTOIRE-GEOGRAPHIE': 'Histoire-géo', 'HISTOIRE & GEOGRAPHIE': 'Histoire-géo', 'ED.PHYSIQUE & SPORT.': 'EPS', 'EPS': 'EPS', 'PHILOSOPHIE': 'Philo', 'SCIENCES ECO.& SOCIAL.': 'SES', 'SC. ECONO.& SOCIALES': 'SES', 'SCIENCES VIE & TERRE': 'SVT', 'ENS. MORAL & CIVIQUE': 'EMC', 'ENSEIGN.SCIENTIFIQUE': 'Enseignement scientifique', 'IT-INNOVATION TECHNOLOGIQUE': 'Innovation techno', 'ENS.TECHNO. EN LV1': 'ETLV', 'NUMERIQUE SC.INFORM.': 'NSI', 'ACCOMPAGNEMT. PERSO': 'Accompagnement perso', 'ACCOMPAGNEMENT PERSO': 'Accompagnement perso', 'VIE DE CLASSE': 'Vie de classe' };
function prettySubj(s) { if (!s) return null; const k = String(s).trim().toUpperCase().replace(/\s*\d+$/, ''); if (SUBJ[k]) return SUBJ[k]; return k.toLowerCase().replace(/(^|[\s\-'.&(])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()); }
const COLORS = ['#ff6a47', '#ffb23f', '#6f9bff', '#4fd1a5', '#c58cff', '#ff8fb1', '#e8c48a', '#7fd3ff'];
const SUBJ_ICONS = [
  [/math|algèbre|géom/i, '<path d="M18 5V4H6l6 8-6 8h12v-1"/>'],
  [/physique|chimie/i, '<path d="M9 3h6M10 3v6L4.6 18.4A1.8 1.8 0 0 0 6.2 21h11.6a1.8 1.8 0 0 0 1.6-2.6L14 9V3"/><path d="M7.5 15h9"/>'],
  [/svt|vie|terre|bio/i, '<path d="M11 20A7 7 0 0 1 4 13c0-6 6-9 16-9 0 10-3 16-9 16z"/><path d="M4 21c4-4 7-7 10-10"/>'],
  [/français|littér|lettres/i, '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'],
  [/philo/i, '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>'],
  [/anglais|allemand|espagnol|italien|chinois|latin|grec|langue|etlv|lv\d/i, '<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6.2A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>'],
  [/histoire|géo|geo/i, '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'],
  [/eps|sport/i, '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'],
  [/ses|éco|eco|gestion/i, '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'],
  [/techno|innovation|nsi|info|numérique|si\b|ingénie/i, '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>'],
  [/musique/i, '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'],
  [/art|dessin|plast/i, '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="16" cy="10" r="1.2"/>'],
  [/emc|moral|civique/i, '<path d="M12 3v18M6 7h12M6 7l-3 7a3.5 3.5 0 0 0 6 0zM18 7l-3 7a3.5 3.5 0 0 0 6 0z"/>'],
  [/scientifique|science/i, '<circle cx="12" cy="12" r="2"/><path d="M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20M2 12c3-3 17-3 20 0M2 12c3 3 17 3 20 0"/>'],
];
function subjIcon(name, size = 18) {
  const p = (SUBJ_ICONS.find(([re]) => re.test(name || '')) || [, '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/>'])[1];
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#100e0d" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
const subjBadge = (name, cls = 'sq', off = false) => `<span class="${cls}${off ? ' off' : ''}" style="background:${off ? '#5b5653' : subjColor(name)}" title="${esc(name || '')}">${subjIcon(name)}</span>`;
const isOff = c => !!c && (c.canceled || /absent|annul|supprim|pas de prof/i.test(c.status || ''));
function subjColor(name) { let h = 0; for (const c of String(name || '?')) h = (h * 31 + c.charCodeAt(0)) | 0; return COLORS[Math.abs(h) % COLORS.length]; }
const decode = s => { const t = document.createElement('textarea'); t.innerHTML = String(s ?? ''); return t.value; };

/* Devoirs Pronote affichés comme des tâches (ils vivent sur le serveur) */
function pronoteItems() {
  const done = new Set(settings.pronoteDone || []);
  return (server.devoirs || []).map(d => {
    const desc = decode(d.description || 'Devoir');
    return { id: 'pn:' + d.id, pronoteId: d.id, kind: 'devoir', source: 'pronote', subject: prettySubj(d.subject), due: d.due, time: null,
      title: desc.split('\n')[0].slice(0, 160), note: desc, done: !!d.done || done.has(d.id), reminders: pronoteReminders(d.due) };
  });
}
function pronoteReminders(due) {
  const d = new Date(due + 'T00:00:00'), now = new Date();
  return [[3, 18, 0, 'J-3'], [1, 18, 0, 'Demain'], [0, 7, 30, "Aujourd'hui"]].map(([n, h, m, label]) => {
    const at = addDays(d, -n); at.setHours(h, m, 0, 0); return { at: at.toISOString(), label, fired: at <= now };
  });
}
const allItems = () => [...tasks.filter(t => !t.deleted), ...pronoteItems()];
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
    server = { devoirs: r.devoirs, cours: r.cours, gcal: r.gcal, gcalAt: r.gcalAt, gcalError: r.gcalError, pronote: r.pronote, flags: r.flags };
    lastSince = r.now; store.set('orbit.since', lastSince);
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
  if (String(t.id).startsWith('pn:')) return setPronoteDone(t.pronoteId, t.done);
  const i = tasks.findIndex(x => x.id === t.id); if (i < 0) tasks.push(t); else tasks[i] = t;
  outbox.put[t.id] = t; persist(); render(); queueFlush(); scheduleRappels();
}
function removeTask(id) {
  tasks = tasks.filter(t => t.id !== id); delete outbox.put[id]; outbox.del.push(id);
  persist(); render(); queueFlush(); scheduleRappels();
}
function saveSettings() { outbox.settings = true; persist(); applyAccent(); queueFlush(); }
function setPronoteDone(pid, done) {
  const s = new Set(settings.pronoteDone || []); if (done) s.add(pid); else s.delete(pid);
  settings.pronoteDone = [...s]; saveSettings(); render(); scheduleRappels();
}
function completeTask(t, done = true) {
  if (done && t.repeat && t.due && !String(t.id).startsWith('pn:')) {
    const next = { ...t, id: uid(), due: nextOccurrence(t), done: false, doneAt: null, createdAt: new Date().toISOString() };
    next.reminders = buildReminders(next);
    saveTask({ ...t, done: true, doneAt: new Date().toISOString(), repeat: null, repeatedTo: next.id });
    saveTask(next);
    toast('Bien joué', `Prochaine fois : ${fmtDay(dueDate(next))}`);
    return;
  }
  saveTask({ ...t, done, doneAt: done ? new Date().toISOString() : null });
  if (done) toast('Bien joué', t.title);
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
- une demande de marquer quelque chose comme fait → intent "done" avec les id entre crochets.
Pour "chat", "reply" est une VRAIE réponse complète et utile, pas une phrase d'introduction : par exemple pour « organise ma semaine », donne le plan jour par jour (lundi, mardi…) en t'appuyant sur ses cours, devoirs, tâches et agenda ci-dessous, avec des créneaux concrets (ex : « 17h30-18h15 : exo de maths ») et les priorités. Mets en forme pour un téléphone : phrases courtes, un petit titre par jour ou par partie (ex : « Lundi : » seul sur sa ligne), des tirets « - » pour les listes, **gras** pour l'essentiel (matière, priorité), horaires au format 17h30-18h15. Pas de tableau, pas de #. Pour "add" et "done", "reply" est une phrase courte.
Dates : une date sans année = la PROCHAINE occurrence. « avant le X » = date limite X. Répétition : daily, weekdays, weekly, biweekly, monthly ou null.
Réponds UNIQUEMENT en JSON : {"intent":"add"|"chat"|"done","reply":"ta réponse","tasks":[{"title":"titre court, majuscule, sans la date","due":"YYYY-MM-DD"|null,"time":"HH:MM"|null,"kind":"tache"|"devoir"|"rdv","subject":null,"repeat":null,"note":null}],"done":["id"]}`;
function taskFrom(x, source) {
  const t = { id: uid(), title: cap(String(x.title || '').trim()) || 'Sans titre', due: x.due || null, time: x.time || null, kind: ['tache', 'devoir', 'rdv'].includes(x.kind) ? x.kind : 'tache', subject: x.subject || null, repeat: REPEATS[x.repeat] ? x.repeat || null : null, note: x.note || null, done: false, createdAt: new Date().toISOString(), source };
  if (t.repeat && !t.due) t.due = ymd(new Date());
  t.reminders = buildReminders(t);
  return t;
}
async function agent(text, history = []) {
  const r = await aiJSON({ system: AGENT_RULES + '\n\n' + snapshotCtx(), messages: [...history.slice(-10), { role: 'user', content: text }] });
  return { intent: r.intent || (r.tasks?.length ? 'add' : 'chat'), reply: String(r.reply || ''), tasks: Array.isArray(r.tasks) ? r.tasks.filter(x => x && x.title) : [], done: Array.isArray(r.done) ? r.done : [] };
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
$('#capForm').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('#capIn').value.trim(); if (!text) return;
  const btn = $('#capGo'); btn.disabled = true; btn.innerHTML = '<div class="spin"></div><span>…</span>';
  try {
    if (server.flags?.ai) {
      let a = null;
      try { a = await withTimeout(agent(text, chat), 50000); } catch (err) { a = null; }
      if (a && a.intent === 'chat') { $('#capIn').value = ''; toggleCapture(false); chat.push({ role: 'user', content: text }, { role: 'assistant', content: a.reply || "Je n'ai pas compris, reformule ?", q: text }); saveChat(); if ($('#chatList')) paintChat(); go('ia'); return; }
      if (a && a.intent === 'done' && a.done.length) { $('#capIn').value = ''; toggleCapture(false); for (const id of a.done) { const t = allItems().find(x => x.id === id); if (t) completeTask(t, true); } return; }
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
    <div class="m">${t.due ? fmtDay(dueDate(t)) + (t.time ? ' à ' + t.time : '') : 'Pas de date'}${t.repeat ? ' · ↻ ' + REPEATS[t.repeat] : ''}${t.subject ? ' · ' + esc(t.subject) : ''}</div>
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
  ['aujourdhui', 'taches', '+', 'devoirs', 'agenda'].forEach(k => {
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
}

/* ---------- Rendu ---------- */
function itemHTML(t, opts = {}) {
  const n = nextReminder(t), cls = dueClass(t);
  const lead = t.kind === 'devoir' && t.subject && !opts.noSq ? subjBadge(t.subject) : '';
  return `<div class="item ${t.done ? 'done' : ''}" data-id="${esc(t.id)}">
    <button class="check" data-act="toggle" aria-label="${t.done ? 'Remettre à faire' : 'Terminer'}">${ICON.check}</button>${lead}
    <div class="bd" data-act="open"><div class="tt">${esc(t.title)}</div>
      <div class="mm">${t.due && !opts.noDue ? `<span class="tag ${cls}">${dueLabel(t)}</span>` : ''}${t.kind === 'devoir' ? `<span class="tag acc">${esc(t.subject || 'Devoir')}</span>` : ''}${t.kind === 'rdv' ? '<span class="tag acc">RDV</span>' : ''}${t.repeat ? `<span class="tag rep">↻ ${esc(REPEATS[t.repeat])}</span>` : ''}${t.source === 'pronote' ? '<span class="tag">Pronote</span>' : ''}${n && !t.done && !opts.noRem ? `<span>${ICON.bell.replace('<svg', '<svg style="width:12px;height:12px;vertical-align:-2px"')} ${new Date(n.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${fmtTime(n.at)}</span>` : ''}</div></div>
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
  ({ aujourdhui: rToday, taches: rTasks, devoirs: rHomework, agenda: rAgenda, ia: rAI })[current]();
}
function coursOn(d) { return (server.cours || []).filter(c => sameDay(c.starts_at, d)); }
function eventsOn(d) { const a = startOfDay(d), b = addDays(a, 1); return (server.gcal || []).filter(e => e.allDay ? new Date(e.start) < b && new Date(e.end) > a : sameDay(e.start, d)); }
const teacherName = t => t ? String(t).split(',')[0].trim().replace(/^(\S+)\s+(\S)\.?$/, (m, a, b) => cap(a.toLowerCase()) + ' ' + b + '.') : '';
function coursHTML(c) {
  const s = prettySubj(c.subject) || 'Cours';
  const why = c.status && !/^annul/i.test(c.status) ? c.status : '';
  if (isOff(c)) return `<div class="item cours canceled">${subjBadge(s, 'sq', true)}<div class="bd"><div class="cancelTop"><span class="tag cancel">ANNULÉ</span>${why ? `<b>${esc(why)}</b>` : ''}</div><div class="tt">${esc(s)}</div><div class="mm"><span>${fmtTime(c.starts_at)} – ${fmtTime(c.ends_at)}</span>${c.teacher ? `<span>${esc(teacherName(c.teacher))}</span>` : ''}</div></div></div>`;
  return `<div class="item cours">${subjBadge(s)}<div class="bd"><div class="tt">${esc(s)}</div><div class="mm"><span class="tag cours">${fmtTime(c.starts_at)} – ${fmtTime(c.ends_at)}</span>${c.room ? `<span>${esc(c.room)}</span>` : ''}${c.teacher ? `<span>${esc(teacherName(c.teacher))}</span>` : ''}${c.status ? `<span class="tag soon">${esc(c.status)}</span>` : ''}</div></div></div>`;
}
function evHTML(e) {
  return `<div class="item"><div class="bar gbar"></div><div class="bd"><div class="tt">${esc(e.title)}</div><div class="mm"><span class="tag">${e.allDay ? 'Journée' : fmtTime(e.start) + (e.end ? ' – ' + fmtTime(e.end) : '')}</span>${e.location ? `<span>${esc(e.location)}</span>` : ''}<span class="tag ok">Google</span></div></div></div>`;
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
function updateNow() { const c = $('#nowCard'); if (c) c.innerHTML = nowCardHTML(); }

function rToday() {
  const v = $('#v-aujourdhui'), today = startOfDay(new Date()), now = new Date();
  const A = active().sort(byDue);
  const next = A.find(t => daysLeft(t) !== null && daysLeft(t) >= 0);
  const late = A.filter(t => daysLeft(t) < 0);
  const soir = A.filter(t => { const n = daysLeft(t); return (n === 0 || n === 1) && t !== next; });
  const later = A.filter(t => daysLeft(t) > 1 && t !== next).slice(0, 6);
  let hero;
  if (next) {
    const n = daysLeft(next), C = 2 * Math.PI * 54, frac = Math.max(.06, Math.min(1, 1 - n / 14));
    const rem = (next.reminders || []).filter(r => !r.fired && new Date(r.at) > now).slice(0, 2);
    hero = `<div class="hero">
      <div class="ring"><svg viewBox="0 0 132 132" role="img" aria-label="Échéance dans ${n} jour(s)"><circle class="bg" cx="66" cy="66" r="54"/><circle class="fg" cx="66" cy="66" r="54" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg>
        <div class="in"><b>${n === 0 ? 'Auj.' : 'J-' + n}</b><small>${n === 0 ? 'jour J' : n === 1 ? 'demain' : fmtShort(dueDate(next))}</small></div></div>
      <div class="info"><span class="pillTag">${esc(next.subject || (next.kind === 'devoir' ? 'Devoir' : next.kind === 'rdv' ? 'Rendez-vous' : 'Tâche'))}${next.source === 'pronote' ? ' · Pronote' : ''}</span>
        <span class="ttl">${esc(next.title)}</span>
        <span class="meta">${rem.length ? 'Rappels : ' + rem.map(x => new Date(x.at).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '') + ' ' + fmtTime(x.at)).join(' · ') : 'Échéance : ' + fmtDay(dueDate(next))}</span>
        <div class="btns"><button class="btn p" id="heroDone">Marquer fait</button>${next.source === 'pronote' ? '' : '<button class="btn" id="heroLater">Reporter</button>'}</div></div></div>`;
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
    <div class="colA"><div class="card nowCard" id="nowCard">${nowCardHTML()}</div>${hero}
      <div><div class="h2">Ta journée</div><div class="tl">${rows.join('') || '<div class="empty">Journée tranquille. Rien d\'urgent ni de prévu.</div>'}</div></div>
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
    const hl = $('#heroLater'); if (hl) hl.onclick = () => { const d = addDays(dueDate(next), 1); const nt = { ...next, due: ymd(d) }; nt.reminders = buildReminders(nt); saveTask(nt); toast('Reporté', 'au ' + fmtDay(d)); };
  }
  const br = $('#brief'); if (br) br.onclick = dailyBrief;
  $('#miniAsk').onsubmit = e => { e.preventDefault(); const q = e.target.querySelector('input').value.trim(); if (!q) return; go('ia'); ask(q); };
}

function rTasks() {
  const v = $('#v-taches');
  let html = `<div class="seg" id="tseg"><div class="pill"></div>${[['actives', 'À faire'], ['faites', 'Terminées'], ['toutes', 'Toutes']].map(([k, l]) => `<button data-f="${k}" class="${taskFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const perso = tasks.filter(t => !t.deleted);
  if (taskFilter === 'faites') {
    const d = perso.filter(t => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
    html += `<div class="dayHead"><b>Terminées</b><span class="n">${d.length}</span></div>${d.length ? '<button class="btn sm" id="clearDone" style="margin:0 0 10px 4px">Tout effacer</button>' : ''}<div class="list">${d.map(t => itemHTML(t)).join('') || '<div class="empty">Rien de terminé pour l\'instant</div>'}</div>`;
  } else {
    const L = (taskFilter === 'toutes' ? perso : perso.filter(t => !t.done)).slice().sort(byDue);
    const groups = new Map();
    for (const t of L) { const n = daysLeft(t); const k = n === null ? 'none' : n < 0 ? 'late' : n > 13 ? 'later' : t.due; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
    const order = ['late', ...[...groups.keys()].filter(k => !['late', 'later', 'none'].includes(k)).sort(), 'later', 'none'];
    for (const k of order) {
      const g = groups.get(k); if (!g) continue;
      const [b, s] = k === 'late' ? ['En retard', ''] : k === 'later' ? ['Plus tard', ''] : k === 'none' ? ['Sans date', ''] : dayTitle(new Date(k + 'T12:00'));
      html += `<div class="dayHead ${k === 'late' ? 'late' : ''}"><b>${b}</b><span>${s}</span><span class="n">${g.length}</span></div><div class="list">${g.map(t => itemHTML(t, { noDue: !['late', 'later', 'none'].includes(k) && !t.time })).join('')}</div>`;
    }
    if (!L.length) html += `<div class="empty" style="margin-top:18px">Aucune tâche. Écris-en une avec le +, ex : « payer la cantine avant vendredi » ou « sortir les poubelles chaque lundi ».</div>`;
  }
  v.innerHTML = html; bindList(v); segPill('#tseg');
  v.querySelectorAll('#tseg button').forEach(b => b.onclick = () => { taskFilter = b.dataset.f; rTasks(); });
  const cd = $('#clearDone'); if (cd) cd.onclick = () => { for (const t of tasks.filter(t => t.done)) removeTask(t.id); };
}
function segPill(sel) { requestAnimationFrame(() => { const s = $(sel); if (!s) return; const on = s.querySelector('button.on'), p = s.querySelector('.pill'); if (on) { p.style.width = on.offsetWidth + 'px'; p.style.transform = `translateX(${on.offsetLeft}px)`; p.style.left = '0'; } }); }

function rHomework() {
  const v = $('#v-devoirs');
  const H = allItems().filter(t => t.kind === 'devoir' && !t.done).sort(byDue);
  const subjects = [...new Set(H.map(t => t.subject || 'Autre'))];
  const groups = new Map(); for (const t of H) { const k = daysLeft(t) < 0 ? 'late' : t.due || 'none'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
  let list = '';
  for (const [k, g] of [...groups.entries()].sort((a, b) => a[0] === 'late' ? -1 : b[0] === 'late' ? 1 : a[0].localeCompare(b[0]))) {
    const [b, s] = k === 'late' ? ['En retard', ''] : k === 'none' ? ['Sans date', ''] : dayTitle(new Date(k + 'T12:00'));
    list += `<div class="dayHead ${k === 'late' ? 'late' : ''}"><b>${b}</b><span>${s}</span><span class="n">${g.length}</span></div><div class="list">${g.map(t => itemHTML(t, { noDue: k !== 'late' })).join('')}</div>`;
  }
  v.innerHTML = `${subjects.length ? `<div class="chipsRow" style="margin-bottom:6px">${subjects.map(s => `<span>${subjBadge(s, 'sq mini')}${esc(s)} · ${H.filter(t => (t.subject || 'Autre') === s).length}</span>`).join('')}</div>` : ''}
    ${list || '<div class="empty" style="margin-top:12px">Aucun devoir à faire 🎉</div>'}
    <div class="grid" style="margin-top:26px">${pronoteCardHTML()}
      <details class="fold"><summary>＋ Import manuel (copier-coller ou capture)</summary>
        <div class="steps"><div>Pronote → <b>Cahier de textes</b> → <b>Travail à faire</b>.</div><div>Colle le texte ou dépose une capture d'écran.</div></div>
        <textarea id="pnText" rows="4" placeholder="Colle ici le contenu de « Travail à faire »…"></textarea>
        <label class="drop" id="pnDrop" style="margin-top:10px"><input type="file" id="pnFile" accept="image/*" multiple hidden>📷 Déposer des captures d'écran</label>
        <div style="display:flex;gap:8px;margin-top:12px"><button class="btn p" id="pnGo" ${server.flags?.ai ? '' : 'disabled'}>Importer</button></div>
        <div id="pnOut" class="small muted" style="margin-top:10px">${server.flags?.ai ? '' : 'Nécessite une clé IA (Réglages). Les captures demandent Gemini.'}</div>
      </details></div>`;
  bindList(v); bindPronoteCard();
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

function rAgenda() {
  const v = $('#v-agenda'), base = startOfDay(new Date());
  const days = Array.from({ length: 14 }, (_, i) => addDays(base, i));
  const itemsOn = d => [
    ...coursOn(d).map(c => ({ t: fmtTime(c.starts_at), cls: isOff(c) ? 'cours off' : 'cours', h: coursHTML(c) })),
    ...eventsOn(d).map(e => ({ t: e.allDay ? '00:00' : fmtTime(e.start), when: e.allDay ? 'Journée' : fmtTime(e.start), cls: 'ev', h: evHTML(e) })),
    ...allItems().filter(t => t.due === ymd(d)).map(t => ({ t: t.time || '23:58', when: t.time || 'Pour', cls: t.done ? '' : 'now', h: itemHTML(t, { noDue: true }) })),
  ].sort((a, b) => a.t.localeCompare(b.t));
  const list = itemsOn(agendaDay);
  v.innerHTML = `<div class="week" id="week">${days.map(d => { const n = itemsOn(d).length; return `<button class="day ${sameDay(d, agendaDay) ? 'on' : ''} ${sameDay(d, base) ? 'today' : ''}" data-d="${ymd(d)}"><small>${d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}</small><b>${d.getDate()}</b><div class="dots">${'<i></i>'.repeat(Math.min(n, 3))}</div></button>`; }).join('')}</div>
    <div class="dayHead"><b>${dayTitle(agendaDay)[0]}</b><span>${dayTitle(agendaDay)[1]}</span><span class="n">${list.length}</span></div>
    <div class="tl">${list.map(x => `<div class="row ${x.cls}"><span class="when">${x.when || x.t}</span><span class="node"></span>${x.h}</div>`).join('') || '<div class="empty">Journée libre</div>'}</div>
    <div class="small muted" style="margin-top:16px">${server.flags?.ical ? `Google Agenda à jour${server.gcalAt ? ' · ' + fmtTime(server.gcalAt) : ''}${server.gcalError ? ' · ⚠️ ' + esc(server.gcalError) : ''} · <a href="#" id="gRef">Actualiser</a>` : 'Google Agenda pas encore relié : Réglages → Google Agenda.'}${server.pronote?.connected ? ' · Emploi du temps Pronote inclus' : ''}</div>`;
  bindList(v);
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
    if ((m = l.match(/^#{1,4}\s*(.+)$/)) || (m = l.match(/^\*\*([^*]{2,60})\*\*\s*:?$/)) || (l.length < 48 && /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|aujourd'hui|demain|ce soir|ce week-end|priorit|conseil|à faire|matin|après-midi|soir)/i.test(l) && /:$/.test(l) && (m = [l, l.replace(/:$/, '')]))) { close(); out.push(`<h4>${inline(m[1].replace(/\*\*/g, '').replace(/:$/, ''))}</h4>`); continue; }
    if ((m = l.match(/^[-•*]\s+(.+)$/))) { if (!list || list.t !== 'ul') { close(); list = { t: 'ul', items: [] }; } list.items.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = l.match(/^\d+[.)]\s+(.+)$/))) { if (!list || list.t !== 'ol') { close(); list = { t: 'ol', items: [] }; } list.items.push(`<li>${inline(m[1])}</li>`); continue; }
    close(); out.push(`<p>${inline(l)}</p>`);
  }
  close(); return out.join('');
}
const AI_AV = `<span class="aiAv">${SVG('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>')}</span>`;
function msgHTML(m, i) {
  if (m.role === 'user') return `<div class="msg u">${esc(m.content)}</div>`;
  return `<div class="msgRow">${AI_AV}<div class="msg a${m.err ? ' err' : ''}">${fmtMsg(m.content)}${m.err ? '' : `<div class="msgAct"><button data-copy="${i}">Copier</button>${m.q ? `<button data-redo="${i}">Autre réponse</button>` : ''}</div>`}</div></div>`;
}
function paintChat(stick = true) {
  const L = $('#chatList'); if (!L) return;
  const atBottom = L.scrollHeight - L.scrollTop - L.clientHeight < 80;
  L.innerHTML = (chat.length ? '' : `<div class="chatHello">${AI_AV}<h3>Salut Celyan 👋</h3><p>Écris-moi comme tu veux : « exposé à rendre vendredi » pour <b>ajouter</b> un truc, ou « qu'est-ce que je fais ce soir ? » pour un <b>conseil</b>. Je connais tes cours, devoirs et rappels.</p></div>`)
    + chat.map(msgHTML).join('')
    + (asking ? `<div class="msgRow">${AI_AV}<div class="msg a think"><i></i><i></i><i></i></div></div>` : '');
  $('#iaSugg').hidden = chat.length > 0 || asking;
  $('#iaNew').hidden = !chat.length;
  const inp = $('#chatIn'), btn = $('#chatF button'); if (inp) { inp.disabled = asking; btn.disabled = asking; }
  if (stick || atBottom) requestAnimationFrame(() => { const last = L.querySelector('.msgRow:last-child, .msg.u:last-child'); if (last && last.offsetHeight > L.clientHeight * .7 && !asking && chat.at(-1)?.role === 'assistant') L.scrollTop = last.offsetTop - 10; else L.scrollTop = L.scrollHeight; });
}
function rAI(force) {
  const v = $('#v-ia');
  if (!server.flags?.ai) { v.classList.remove('iaV'); v.innerHTML = `<div class="chatwrap"><div class="msg a">Pour discuter avec moi, ajoute une clé IA gratuite dans Réglages (Groq, 1 minute).</div><button class="btn p" id="goSet" style="align-self:flex-start">Ouvrir les réglages</button></div>`; $('#goSet').onclick = openSettings; return; }
  if ($('#chatList') && !force) return; // déjà affiché : on ne reconstruit pas (garde le défilement et la saisie)
  v.classList.add('iaV');
  v.innerHTML = `<div class="iaTop"><div><span class="liveDot"></span><span>${server.flags?.groq ? 'Groq' : 'Gemini'} · connaît ton planning</span></div><button class="btn" id="iaNew" hidden>Nouvelle conv.</button></div>
    <div class="chatList" id="chatList"></div>
    <div class="iaBottom">
      <div class="sugg" id="iaSugg">${IA_SUGG.map(([l, q]) => `<button data-q="${esc(q)}">${l}</button>`).join('')}</div>
      <form class="chatin" id="chatF"><textarea id="chatIn" rows="1" placeholder="Ajoute un truc ou pose une question…" aria-label="Message" enterkeyhint="send"></textarea><button aria-label="Envoyer">${SVG('<path d="M5 12h14M13 6l6 6-6 6"/>')}</button></form>
    </div>`;
  const inp = $('#chatIn');
  const grow = () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 130) + 'px'; };
  inp.oninput = grow;
  inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(max-width:899px)').matches) { e.preventDefault(); $('#chatF').requestSubmit(); } };
  $('#chatF').onsubmit = e => { e.preventDefault(); const q = inp.value.trim(); if (q) { inp.value = ''; grow(); ask(q); } };
  v.querySelectorAll('#iaSugg button').forEach(b => b.onclick = () => ask(b.dataset.q));
  $('#iaNew').onclick = () => { chat = []; saveChat(); paintChat(); };
  $('#chatList').onclick = e => {
    const c = e.target.closest('[data-copy]'), r = e.target.closest('[data-redo]');
    if (c) { navigator.clipboard?.writeText(chat[+c.dataset.copy].content).then(() => toast('Copié', ''), () => {}); }
    if (r && !asking) { const i = +r.dataset.redo, q = chat[i].q; chat.splice(i - 1, 2); ask(q); }
  };
  paintChat();
  if (!matchMedia('(max-width:899px)').matches) inp.focus();
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
  return `${todayCtx()} ${pos}\nTÂCHES ET DEVOIRS ACTIFS (avec leur date limite) :\n${A || '(aucun)'}\n\nEMPLOI DU TEMPS ET AGENDA DES 8 PROCHAINS JOURS :\n${W}`;
}
let asking = false;
async function ask(q) {
  if (asking || !q) return; asking = true;
  chat.push({ role: 'user', content: q }); saveChat();
  if ($('#chatList')) paintChat(); else rAI(true);
  try {
    const a = await withTimeout(agent(q, chat.slice(0, -1).filter(m => !m.err)), 55000);
    const notes = [];
    if (a.intent === 'add' && a.tasks.length) { const L = a.tasks.map(x => taskFrom(x, 'ia')); L.forEach(saveTask); notes.push(`✓ **Ajouté :**\n${L.map(t => '- ' + t.title + (t.due ? ' (' + dueLabel(t).toLowerCase() + ')' : '')).join('\n')}`); }
    if (a.done.length) { let n = 0; for (const id of a.done) { const t = allItems().find(x => x.id === id); if (t) { completeTask(t, true); n++; } } if (n) notes.push(`✓ ${n} terminé${n > 1 ? 's' : ''}`); }
    const head = a.intent === 'add' && notes.length ? '' : (a.reply || (notes.length ? '' : "Je n'ai pas compris, reformule ?"));
    chat.push({ role: 'assistant', content: [head, ...notes].filter(Boolean).join('\n\n'), q: a.intent === 'chat' ? q : undefined });
  } catch (e) { chat.push({ role: 'assistant', err: true, content: e.code === 'timeout' ? "L'IA met trop de temps à répondre. Réessaie dans un instant." : aiErr(e) }); }
  finally { asking = false; saveChat(); if (current === 'ia') { if ($('#chatList')) paintChat(); else rAI(true); } }
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
  const s = $('#sheet'), pn = t.source === 'pronote';
  const link = gcalLink(t);
  if (pn) {
    s.innerHTML = `<div class="grab"></div><h2>${esc(t.subject || 'Devoir')}</h2>
      <p class="small muted" style="margin-top:4px">Pronote · pour ${t.due ? fmtDay(dueDate(t)) : '—'}</p>
      <div style="margin-top:14px;line-height:1.55;white-space:pre-wrap">${esc(t.note || t.title)}</div>
      <label class="l">Rappels Discord</label><div class="chips">${t.reminders.map(r => `<span class="chip ${r.fired ? '' : 'acc'}">${r.label} · ${new Date(r.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${fmtTime(r.at)}</span>`).join('')}</div>
      <div class="acts"><button class="btn p" id="eDone">${t.done ? 'Remettre à faire' : 'Marquer fait'}</button>${link ? `<a class="btn" href="${link}" target="_blank" rel="noopener">Ajouter à Google Agenda</a>` : ''}<button class="btn" id="eX">Fermer</button></div>`;
    $('#eDone').onclick = () => { closeSheet(); completeTask(t, !t.done); };
    $('#eX').onclick = closeSheet; openSheet(); return;
  }
  s.innerHTML = `<div class="grab"></div><h2>${isNew ? 'Nouvelle tâche' : 'Détails'}</h2>
    <label class="l" for="eT">Titre</label><input class="inp" id="eT" value="${esc(t.title)}">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label class="l" for="eD">Date limite</label><input class="inp" type="date" id="eD" value="${t.due || ''}"></div><div><label class="l" for="eH">Heure (optionnel)</label><input class="inp" type="time" id="eH" value="${t.time || ''}"></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label class="l" for="eK">Type</label><select class="inp" id="eK"><option value="tache">Tâche</option><option value="devoir">Devoir</option><option value="rdv">Rendez-vous</option></select></div><div><label class="l" for="eR">Répéter</label><select class="inp" id="eR">${Object.entries(REPEATS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div></div>
    <label class="l" for="eS">Matière</label><input class="inp" id="eS" value="${esc(t.subject || '')}" placeholder="—">
    <label class="l" for="eN">Note</label><textarea class="inp" id="eN" rows="2">${esc(t.note || '')}</textarea>
    <label class="l">Rappels Discord</label><div class="chips">${(t.reminders || []).map(r => `<span class="chip ${r.fired ? '' : 'acc'}">${r.label} · ${new Date(r.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${fmtTime(r.at)}</span>`).join('') || `<span class="chip">${t.due ? (dueDate(t) < new Date() ? 'Date passée : plus de rappel' : 'Plus de rappel prévu') : 'Aucun (ajoute une date)'}</span>`}</div>
    <div class="acts"><button class="btn p" id="eSave">Enregistrer</button>${link ? `<a class="btn" href="${link}" target="_blank" rel="noopener">Ajouter à Google Agenda</a>` : ''}${isNew ? '' : '<button class="btn" id="eDel" style="color:#ff6b6b">Supprimer</button>'}<button class="btn" id="eX">Fermer</button></div>`;
  $('#eK').value = t.kind || 'tache'; $('#eR').value = t.repeat || '';
  $('#eSave').onclick = () => {
    const nt = { ...t, title: $('#eT').value.trim() || t.title, due: $('#eD').value || null, time: $('#eH').value || null, kind: $('#eK').value, repeat: $('#eR').value || null, subject: $('#eS').value.trim() || null, note: $('#eN').value.trim() || null };
    if (nt.repeat && !nt.due) nt.due = ymd(new Date());
    if (nt.due !== t.due || nt.time !== t.time || nt.repeat !== t.repeat || !t.reminders) nt.reminders = buildReminders(nt);
    closeSheet(); saveTask(nt); if (isNew) toast('Ajouté', `${nt.reminders.length} rappels programmés`);
  };
  const d = $('#eDel'); if (d) d.onclick = () => { closeSheet(); removeTask(t.id); toast('Supprimé', t.title); };
  $('#eX').onclick = closeSheet; openSheet();
}
function openSheet() { $('#scrim').classList.add('on'); $('#sheet').classList.add('on'); }
function closeSheet() { $('#scrim').classList.remove('on'); $('#sheet').classList.remove('on'); }
$('#scrim').onclick = closeSheet;
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

/* ---------- Réglages ---------- */
$('#setBtn').onclick = openSettings;
function openSettings() {
  const s = $('#sheet'), f = server.flags || {};
  const share = location.origin + location.pathname + '#k=' + encodeURIComponent(key || '');
  s.innerHTML = `<div class="grab"></div><h2>Réglages</h2>
  <label class="l">Couleur</label><div class="swatches">${Object.entries(ACCENTS).map(([k, [c]]) => `<button class="sw ${settings.accent === k ? 'on' : ''}" data-a="${k}" style="background:${c}" aria-label="${k}"></button>`).join('')}</div>
  <label class="l">Intensité des rappels</label><div class="seg" id="iseg"><div class="pill"></div>${[['leger', 'Léger'], ['normal', 'Normal'], ['insistant', 'Insistant']].map(([k, l]) => `<button data-i="${k}" class="${settings.intensite === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  <p class="help">${{ leger: 'J-7, la veille et le jour J.', normal: 'J-14, J-7, J-3, J-2, la veille et le jour J.', insistant: 'Presque tous les jours dans les 10 derniers jours.' }[settings.intensite]} Les tâches qui se répètent ont juste un rappel le jour même.</p>

  <label class="l">Rappels Discord</label>
  <div class="opt"><div><b>Message privé avec ping</b><p>Le bot t'envoie chaque rappel (tâches et devoirs Pronote) en MP, même quand Orbit est fermé.</p></div><button class="btn sm" id="sD">Tester</button></div>

  <label class="l" for="sGroq">Assistant IA · Groq (gratuit, rapide — recommandé)</label>
  <div class="status"><span class="dot ${f.groq ? 'on' : ''}"></span>${f.groq ? 'Clé enregistrée' : 'Pas de clé'}</div>
  <div class="inline"><input class="inp" id="sGroq" placeholder="${f.groq ? 'Coller une nouvelle clé pour la remplacer' : 'Colle ta clé Groq (gsk_…)'}" autocomplete="off" spellcheck="false"><button class="btn" id="sGroqGo">Enregistrer</button></div>
  <div class="help">Crée ta clé gratuite : <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a> → connecte-toi avec Google → <b>« Create API Key »</b> → copie la clé (gsk_…).</div>

  <label class="l" for="sAI">Assistant IA · Gemini (secours + lecture des captures)</label>
  <div class="status"><span class="dot ${f.gemini ? 'on' : ''}"></span>${f.gemini ? 'Clé enregistrée' : 'Pas de clé'}</div>
  <div class="inline"><input class="inp" id="sAI" placeholder="${f.ai ? 'Coller une nouvelle clé pour la remplacer' : 'Colle ta clé Gemini (AQ.…)'}" autocomplete="off" spellcheck="false"><button class="btn" id="sAIgo">Enregistrer</button></div>
  <div class="help">Crée ta clé gratuite : <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> → <b>« Create API key »</b> → copie la clé en entier (elle commence par <b>AQ.</b> ou AIza).</div>

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
  segPill('#iseg');
  s.querySelectorAll('#iseg button').forEach(b => b.onclick = () => {
    settings.intensite = b.dataset.i; saveSettings();
    for (const t of tasks) if (!t.done && t.due) { const nt = { ...t, reminders: buildReminders(t) }; Object.assign(t, nt); outbox.put[t.id] = t; }
    persist(); queueFlush(); scheduleRappels(); openSettings(); toast('Rappels mis à jour', b.textContent);
  });
  $('#sD').onclick = async () => { try { const r = await api('test_discord'); toast('Discord', r.ok ? 'Message de test envoyé, regarde tes MP.' : 'Le bot n\'a pas pu t\'écrire.'); } catch (e) { toast('Discord', 'Serveur injoignable.'); } };
  const secret = async (field, val, btn, ok) => {
    if (!val.trim()) return; btn.disabled = true; btn.textContent = '…';
    try { const r = await api('set_secret', { [field]: val.trim() }); if (r.ok) { toast(ok, 'C\'est bon !'); await pull(false, true); openSettings(); } else toast('Oups', r.error || 'Refusé'); }
    catch (e) { toast('Oups', 'Serveur injoignable.'); }
    btn.disabled = false; btn.textContent = 'Enregistrer';
  };
  $('#sAIgo').onclick = e => secret('gemini_key', $('#sAI').value.replace(/\s+/g, ''), e.target, 'Gemini activé');
  $('#sGroqGo').onclick = e => secret('groq_key', $('#sGroq').value.replace(/\s+/g, ''), e.target, 'Groq activé');
  $('#sCalGo').onclick = e => secret('ical_url', $('#sCal').value, e.target, 'Google Agenda relié');
  $('#sLink').onclick = async () => { try { await navigator.clipboard.writeText(share); toast('Lien copié', 'Ouvre-le sur ton autre appareil.'); } catch (e) { prompt('Copie ce lien :', share); } };
  $('#sOut').onclick = () => { if (!confirm('Déconnecter Orbit de cet appareil ?')) return; localStorage.clear(); location.hash = ''; location.reload(); };
  $('#eX').onclick = closeSheet; openSheet();
}
function applyAccent() { const [a, b, c] = ACCENTS[settings.accent] || ACCENTS.corail; const r = document.documentElement.style; r.setProperty('--acc', a); r.setProperty('--acc2', b); r.setProperty('--accSoft', c); }

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
function toast(title, sub) {
  const t = el('div', 'toast', `<div class="ic">${ICON.bell}</div><div><b>${esc(title)}</b><span>${esc(sub || '')}</span></div>`);
  $('#toasts').appendChild(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 3600);
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
  setInterval(checkReminders, 30e3); setTimeout(checkReminders, 4000);
  setInterval(() => { if (current === 'aujourdhui' && document.visibilityState === 'visible') updateNow(); }, 20e3);
  setInterval(() => { if (current === 'aujourdhui' && document.visibilityState === 'visible' && !document.querySelector('#sheet.on')) rToday(); }, 5 * 60e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
  addEventListener('online', () => pull()); addEventListener('offline', () => setOnline(false));
}
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
boot();
