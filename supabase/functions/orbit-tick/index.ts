// Orbit — tourne toutes les 5 minutes (cron orbit-rappels, en-tête x-orbit-key).
// 1. prépare les rappels (tâches, Google Agenda, révisions de contrôles, cours annulés, briefing du matin)
// 2. envoie en MP Discord (avec ping) tous les rappels arrivés à échéance.
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseICS, zoned } from "./ics.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const API = "https://discord.com/api/v10";
const TZ = "Europe/Paris";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const hm = (d: Date | string) => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(d)).replace(":", "h");
const longDay = (d: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
const shortDay = (d: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric" }).format(d);
const parisHour = (d: Date) => +new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(d);
const wall = (day: string, h: number, mi = 0) => { const [y, m, d] = day.split("-").map(Number); return new Date(zoned(y, m - 1, d, h, mi, TZ)); };
const addDay = (day: string, n: number) => { const [y, m, d] = day.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };
const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s;
const html = (s: string) => String(s ?? "").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// Noms de matières lisibles (même logique que l'app)
const SUBJ: Record<string, string> = { "ED.PHYSIQUE & SPORT.": "EPS", "PHYSIQ.CHIMIE&MATHS": "Physique-chimie & maths", "PHYSIQUE-CHIMIE": "Physique-chimie", "MATHEMATIQUES": "Maths", "FRANCAIS": "Français", "HISTOIRE-GEOGRAPHIE": "Histoire-géo", "ANGLAIS LV1": "Anglais", "ALLEMAND LV2": "Allemand", "ESPAGNOL LV2": "Espagnol", "ENS. MORAL & CIVIQUE": "EMC", "ACCOMPAGNEMT. PERSO": "Accompagnement perso", "VIE DE CLASSE": "Vie de classe", "ENS.TECHNO. EN LV1": "Techno en anglais", "PHILOSOPHIE": "Philo", "SC. ECONO.& SOCIALES": "SES", "SCIENCES VIE & TERRE": "SVT" };
const subj = (s: string | null) => { if (!s) return "Cours"; const u = s.trim().toUpperCase(), k = u.replace(/\d+$/, "").trim(); return SUBJ[u] ?? SUBJ[k] ?? cap(k.replace(/\s+LV$/, "").toLowerCase()); };
const isOff = (c: any) => !!c.canceled || /absent|annul|supprim|pas de prof/i.test(c.status ?? "");
const EXAM = /(?:^|[^\p{L}])(contr[ôo]le|ds|interro(?:gation)?|[ée]valuation|[ée]val|examen|bac blanc|partiel)(?![\p{L}])/iu;

// Plusieurs comptes : chaque ligne de orbit_pronote est un compte. Identifiants et clés des comptes ≠ 1 préfixés.
const Pf = (uid: number, id: string) => uid === 1 ? id : `u${uid}.${id}`;
const KVf = (uid: number, k: string) => uid === 1 ? k : `u${uid}:${k}`;

Deno.serve(async (req) => {
  const { data: accounts } = await db.from("orbit_pronote").select("*").order("id");
  const owner = accounts?.find((a: any) => a.id === 1);
  if (!owner || req.headers.get("x-orbit-key") !== owner.run_key) return json({ error: "non autorisé" }, 401);
  const body = await req.json().catch(() => ({}));
  const now = new Date(), today = ymd(now), tomorrow = addDay(today, 1);
  const out: any = {};

  if (body.test) {
    const acc = accounts!.find((a: any) => a.id === (Number(body.uid) || 1));
    if (!acc) return json({ ok: false, error: "compte introuvable" });
    const id = Pf(acc.id, "test:" + now.getTime());
    await db.from("orbit_rappels").insert({ id, uid: acc.id, source: "orbit", at: now.toISOString(), title: "Test Orbit : les rappels arrivent bien ici 👋", body: "Tu recevras tes rappels, devoirs et alertes Pronote dans cette conversation." });
    const log: string[] = [];
    const sent = await send(acc, log);
    return json({ ok: sent > 0, sent, error: sent ? undefined : (log.join(" ; ") || "Message non envoyé") });
  }

  for (const acc of accounts!) {
    const log: string[] = [];
    try { await plan(acc, now, today, tomorrow, log, !!body.brief && (Number(body.uid) || 1) === acc.id); } catch (e) { log.push("plan: " + (e as Error).message); }
    const sent = await send(acc, log);
    out[acc.id] = { sent, log };
  }
  return json({ ok: true, accounts: out });
});

async function plan(cfg: any, now: Date, today: string, tomorrow: string, log: string[], forceBrief: boolean) {
  const uid: number = cfg.id, P = (id: string) => Pf(uid, id), KV = (k: string) => KVf(uid, k);
  const [{ data: tasksRaw }, { data: devoirs }, { data: cours }, { data: kvBrief }, { data: kvSet }] = await Promise.all([
    db.from("orbit_tasks").select("id, data").eq("uid", uid).eq("deleted", false),
    db.from("orbit_devoirs").select("id, subject, description, due, done, done_local").eq("uid", uid).gte("due", today).order("due"),
    db.from("orbit_cours").select("id, subject, room, teacher, starts_at, ends_at, canceled, status").eq("uid", uid).gte("ends_at", now.toISOString()).lte("starts_at", new Date(now.getTime() + 4 * 864e5).toISOString()).order("starts_at"),
    db.from("orbit_kv").select("value").eq("key", KV("brief")).maybeSingle(),
    db.from("orbit_kv").select("value").eq("key", KV("settings")).maybeSingle(),
  ]);
  const revDone = new Set<string>(kvSet?.value?.revDone ?? []);
  const tasks = (tasksRaw ?? []).map((t: any) => ({ ...t.data, id: t.id })).filter((t: any) => !t.done);
  const hw = (devoirs ?? []).filter((d: any) => !d.done && !d.done_local);
  const events = await gcal(cfg, log, KV("gcal"));
  const rows: any[] = [];
  const keep = (prefix: string) => rows.filter((r) => r.id.startsWith(prefix)).map((r) => r.id);

  // 1. Tâches perso : les rappels calculés par l'app sont stockés avec la tâche → plus besoin que l'app soit ouverte
  for (const t of tasks) for (const r of t.reminders ?? []) {
    if (r.fired || new Date(r.at) <= now) continue;
    rows.push({ id: "o:" + t.id + ":" + r.at, source: "orbit", at: r.at, title: `${r.label} · ${t.title}`, body: [t.subject, t.due ? "Échéance : " + longDay(wall(t.due, 12)) + (t.time ? " à " + t.time.replace(":", "h") : "") : "", t.note].filter(Boolean).join("\n") || null });
  }

  // 2. Google Agenda : 1 h avant (ou le matin pour un événement sur la journée)
  for (const e of events) {
    const s = new Date(e.start);
    if (s <= now || s.getTime() - now.getTime() > 3 * 864e5) continue;
    if (/^📚/.test(e.title)) continue; // anciens devoirs Pronote copiés dans l'agenda : déjà rappelés
    const title = html(e.title);
    if (e.allDay) { const at = wall(ymd(s), 7, 15); if (at > now) rows.push({ id: P("g:" + e.id + ":d"), source: "gcal", at: at.toISOString(), title: `📅 Aujourd'hui · ${title}`, body: e.location ? "📍 " + e.location : null }); }
    else {
      for (const [min, label] of [[60, "Dans 1 h"], [10, "Dans 10 min"]] as const) {
        const at = new Date(s.getTime() - min * 60e3);
        if (at > now) rows.push({ id: P(`g:${e.id}:${min}`), source: "gcal", at: at.toISOString(), title: `📅 ${label} · ${title}`, body: `${hm(s)} – ${hm(e.end)}${e.location ? "\n📍 " + e.location : ""}` });
      }
    }
  }

  // 3. Contrôles : séances de révision J-3, J-2, J-1 à 18h
  const exams = [
    ...hw.filter((d: any) => EXAM.test(d.description ?? "")).map((d: any) => ({ id: "p" + d.id, subject: subj(d.subject), due: d.due, what: (d.description ?? "").slice(0, 300) })),
    ...tasks.filter((t: any) => t.due && t.kind !== "revision" && EXAM.test(t.title + " " + (t.note ?? ""))).map((t: any) => ({ id: "o" + t.id, subject: t.subject || t.title, due: t.due, what: t.title })),
  ];
  for (const x of exams) for (const n of [3, 2, 1]) {
    const day = addDay(x.due, -n), at = wall(day, 18);
    if (at <= now || revDone.has(`rv:${x.id}:${n}`)) continue;
    rows.push({ id: P(`r:${x.id}:${n}`), source: "revision", at: at.toISOString(), title: `📖 Révise ${x.subject} · contrôle ${n === 1 ? "demain" : "dans " + n + " jours"}`, body: `Séance de révision ${4 - n}/3 (30-45 min).\n${html(x.what)}` });
  }

  // 4. Cours annulés / prof absent dans les 3 prochains jours : alerte immédiate (une seule fois par cours)
  for (const c of cours ?? []) {
    if (!isOff(c)) continue;
    const s = new Date(c.starts_at);
    if (s.getTime() - now.getTime() > 3 * 864e5) continue;
    const when = ymd(s) === today ? "aujourd'hui" : ymd(s) === tomorrow ? "demain" : shortDay(s);
    rows.push({ id: P("x:" + c.id), source: "cours", at: now.toISOString(), title: `🚫 ${subj(c.subject)} annulé ${when} (${hm(s)})`, body: [c.status && !/^annul/i.test(c.status) ? c.status : "", c.teacher ? "Prof : " + c.teacher : "", `${hm(c.starts_at)} – ${hm(c.ends_at)} → temps libre`].filter(Boolean).join("\n") });
  }

  // 5. Briefing du matin (7h, une fois par jour)
  const h = parisHour(now);
  if (forceBrief || (h >= 7 && h < 11 && kvBrief?.value?.day !== today)) {
    const b = brief(now, today, tomorrow, cours ?? [], hw, tasks, events, exams);
    if (b) rows.push({ id: P("b:" + today) + (forceBrief ? ":" + now.getTime() : ""), source: "brief", at: now.toISOString(), title: b.title, body: b.body });
    if (!forceBrief) await db.from("orbit_kv").upsert({ key: KV("brief"), value: { day: today }, updated_at: now.toISOString() });
  }

  // Ménage : rappels pas encore envoyés devenus inutiles (tâche faite, événement déplacé, cours rétabli…)
  for (const p of ["o:", P("g:"), P("r:"), P("x:")]) {
    const ids = new Set(keep(p));
    const { data: old } = await db.from("orbit_rappels").select("id").eq("uid", uid).like("id", p + "%").is("sent_at", null);
    const gone = (old ?? []).map((r: any) => r.id).filter((id: string) => !ids.has(id));
    if (gone.length) await db.from("orbit_rappels").delete().in("id", gone);
  }
  if (rows.length) {
    const { error } = await db.from("orbit_rappels").upsert(rows.map((r) => ({ ...r, uid, title: r.title.slice(0, 200), body: r.body ? String(r.body).slice(0, 3800) : null })), { onConflict: "id", ignoreDuplicates: true });
    if (error) log.push("upsert: " + error.message);
  }
  log.push(`planifiés ${rows.length}`);
}

function brief(now: Date, today: string, tomorrow: string, cours: any[], hw: any[], tasks: any[], events: any[], exams: any[]) {
  const L: string[] = [];
  const cToday = cours.filter((c) => ymd(new Date(c.starts_at)) === today);
  if (cToday.length) {
    const real = cToday.filter((c) => !isOff(c));
    L.push(`**🏫 Cours** — ${real.length ? `de ${hm(real[0].starts_at)} à ${hm(real.at(-1).ends_at)}` : "tous annulés"}`);
    for (const c of cToday) L.push(isOff(c) ? `~~${hm(c.starts_at)} ${subj(c.subject)}~~ · **annulé**${c.status && !/^annul/i.test(c.status) ? " (" + c.status + ")" : ""}` : `\`${hm(c.starts_at)}\` ${subj(c.subject)}${c.room ? " · " + c.room : ""}`);
    L.push("");
  }
  const hwSoon = hw.filter((d) => d.due === today || d.due === tomorrow);
  if (hwSoon.length) {
    L.push("**📚 Devoirs**");
    for (const d of hwSoon) L.push(`• **${subj(d.subject)}** (${d.due === today ? "aujourd'hui" : "demain"}) : ${html(d.description ?? "").replace(/\s+/g, " ").slice(0, 140)}`);
    L.push("");
  }
  const tSoon = tasks.filter((t) => t.due && t.due <= tomorrow).sort((a, b) => a.due.localeCompare(b.due));
  if (tSoon.length) {
    L.push("**✅ À faire**");
    for (const t of tSoon.slice(0, 10)) L.push(`• ${t.title}${t.due < today ? " — ⚠️ en retard" : t.due === today ? (t.time ? " — à " + t.time.replace(":", "h") : " — aujourd'hui") : " — demain"}`);
    L.push("");
  }
  const evToday = events.filter((e) => ymd(new Date(e.start)) === today && !/^📚/.test(e.title));
  if (evToday.length) {
    L.push("**📅 Agenda**");
    for (const e of evToday) L.push(`• ${e.allDay ? "Toute la journée" : "`" + hm(e.start) + "`"} ${html(e.title)}`);
    L.push("");
  }
  const exSoon = exams.filter((x) => x.due > today && x.due <= addDay(today, 7));
  if (exSoon.length) {
    L.push("**📖 Contrôles qui arrivent**");
    for (const x of exSoon) L.push(`• ${x.subject} — ${shortDay(wall(x.due, 12))}`);
    L.push("");
  }
  if (!L.length) return null; // rien du tout (vacances, week-end calme) : pas de message
  return { title: `☀️ ${cap(longDay(now))} · ta journée`, body: L.join("\n").trim() };
}

async function gcal(cfg: any, log: string[], key: string) {
  if (!cfg.ical_url) return [];
  const { data: cache } = await db.from("orbit_kv").select("value, updated_at").eq("key", key).maybeSingle();
  if (cache && Date.now() - new Date(cache.updated_at).getTime() < 20 * 60e3) return cache.value ?? [];
  try {
    const r = await fetch(cfg.ical_url);
    if (!r.ok) { log.push("gcal " + r.status); return cache?.value ?? []; }
    const events = parseICS(await r.text(), new Date(Date.now() - 2 * 864e5), new Date(Date.now() + 22 * 864e5));
    await db.from("orbit_kv").upsert({ key, value: events, updated_at: new Date().toISOString() });
    return events;
  } catch { log.push("gcal injoignable"); return cache?.value ?? []; }
}

async function send(cfg: any, log: string[]) {
  const token = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!token || !cfg.discord_id) { log.push(cfg.discord_id ? "Bot Discord non configuré" : "Pas d'ID Discord pour ce compte"); return 0; }
  const { data: jobs } = await db.from("orbit_rappels").select("*").eq("uid", cfg.id)
    .is("sent_at", null).lt("attempts", 3)
    .lte("at", new Date().toISOString()).gt("at", new Date(Date.now() - 6 * 3600e3).toISOString())
    .order("at").limit(15);
  if (!jobs?.length) return 0;
  const bot = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
  const ch = await fetch(`${API}/users/@me/channels`, { method: "POST", headers: bot, body: JSON.stringify({ recipient_id: cfg.discord_id }) });
  if (!ch.ok) { log.push("ouverture MP " + ch.status); return 0; }
  const { id: channelId } = await ch.json();
  const COLORS: Record<string, number> = { pronote: 0x6f9bff, gcal: 0x5be39b, revision: 0xffb547, cours: 0xff6b6b, brief: 0xff6a47, orbit: 0xff6a47 };
  const FOOT: Record<string, string> = { pronote: "Orbit · Pronote", gcal: "Orbit · Google Agenda", revision: "Orbit · Révisions", cours: "Orbit · Emploi du temps", brief: "Orbit · Briefing du matin" };
  let sent = 0;
  for (const j of jobs) {
    const r = await fetch(`${API}/channels/${channelId}/messages`, {
      method: "POST", headers: bot,
      body: JSON.stringify({
        content: `<@${cfg.discord_id}> ${j.source === "orbit" || j.source === "pronote" ? "⏰ " : ""}**${j.title}**`,
        allowed_mentions: { users: [cfg.discord_id] },
        embeds: j.body ? [{ description: String(j.body).slice(0, 4000), color: COLORS[j.source] ?? 0xff6a47, footer: { text: FOOT[j.source] ?? "Orbit" } }] : undefined,
      }),
    });
    if (r.ok) { await db.from("orbit_rappels").update({ sent_at: new Date().toISOString(), attempts: j.attempts + 1, error: null }).eq("id", j.id); sent++; }
    else {
      const t = await r.text().catch(() => "");
      log.push(`envoi ${r.status} ${t.slice(0, 120)}`);
      await db.from("orbit_rappels").update({ attempts: r.status === 403 ? 3 : j.attempts + 1, error: `envoi ${r.status}` }).eq("id", j.id);
      if (r.status === 429) break;
    }
  }
  return sent;
}
