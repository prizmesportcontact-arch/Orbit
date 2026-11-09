// Orbit — API de l'app autonome (GitHub Pages).
// Toutes les données passent ici. Protégée par la clé d'accès Orbit (en-tête x-orbit-app).
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-orbit-app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const parisDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const { data: cfg } = await db.from("orbit_pronote").select("*").eq("id", 1).single();
  if (!cfg || !req.headers.get("x-orbit-app") || req.headers.get("x-orbit-app") !== cfg.app_key) return json({ error: "Code d'accès incorrect" }, 401);
  const b = await req.json().catch(() => ({}));

  try {
    switch (b.action) {
      case "state": return json(await state(cfg, b));
      case "put_tasks": {
        const rows = (b.tasks ?? []).filter((t: any) => t?.id).map((t: any) => ({ id: String(t.id), data: t, deleted: false, updated_at: new Date().toISOString() }));
        if (rows.length) { const { error } = await db.from("orbit_tasks").upsert(rows, { onConflict: "id" }); if (error) throw error; }
        return json({ ok: true, at: new Date().toISOString() });
      }
      case "del_tasks": {
        const ids = (b.ids ?? []).map(String);
        if (ids.length) await db.from("orbit_tasks").update({ deleted: true, updated_at: new Date().toISOString() }).in("id", ids);
        return json({ ok: true });
      }
      case "put_settings":
        await db.from("orbit_kv").upsert({ key: "settings", value: b.settings ?? {}, updated_at: new Date().toISOString() });
        return json({ ok: true });
      case "rappels": {
        // Rappels des tâches perso (préfixe o:) ; les alertes et les devoirs Pronote ne sont pas touchés.
        await db.from("orbit_rappels").delete().like("id", "o:%").is("sent_at", null);
        const rows = (b.rows ?? []).slice(0, 800).map((r: any) => ({ id: String(r.id).slice(0, 200), source: "orbit", title: String(r.title).slice(0, 200), body: r.body ? String(r.body).slice(0, 800) : null, at: r.at }));
        if (rows.length) await db.from("orbit_rappels").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
        const done = (b.doneP ?? []).map(String);
        await db.from("orbit_devoirs").update({ done_local: false }).eq("done_local", true);
        if (done.length) await db.from("orbit_devoirs").update({ done_local: true }).in("id", done);
        return json({ ok: true, rappels: rows.length });
      }
      case "pronote_setup": {
        const qr = b.qr ?? {};
        if (!qr.jeton || !qr.url || !/^\d{4}$/.test(String(b.pin))) return json({ ok: false, error: "QR code ou code invalide" });
        await db.from("orbit_pronote").update({ pending_qr: { jeton: String(qr.jeton), login: String(qr.login ?? ""), url: String(qr.url) }, pending_pin: String(b.pin), token: null, last_error: null, fail_count: 0 }).eq("id", 1);
        return json(await callFn("orbit-pronote", cfg.run_key, { mode: "setup" }));
      }
      case "pronote_sync": return json(await callFn("orbit-pronote", cfg.run_key, { mode: "sync" }));
      case "test_discord": return json(await callFn("orbit-notify", cfg.run_key, { test: true }));
      case "set_secret": {
        const up: Record<string, unknown> = {};
        if (typeof b.gemini_key === "string") up.gemini_key = b.gemini_key.trim() || null;
        if (typeof b.ical_url === "string") {
          const u = b.ical_url.trim().replace(/^webcal:/i, "https:");
          if (u && !/^https:\/\/calendar\.google\.com\/calendar\/ical\/.+\.ics$/i.test(u)) return json({ ok: false, error: "Ce n'est pas une adresse iCal Google Agenda (elle finit par .ics)" });
          up.ical_url = u || null;
          await db.from("orbit_kv").delete().eq("key", "gcal");
        }
        if (up.gemini_key) { const t = await gemini(String(up.gemini_key), { prompt: "Réponds juste OK." }); if (!t.ok) return json({ ok: false, error: "Clé Gemini refusée : " + t.error }); }
        await db.from("orbit_pronote").update(up).eq("id", 1);
        if (up.ical_url) { const g = await calendar({ ...cfg, ical_url: up.ical_url }, true); if (g.error) return json({ ok: false, error: g.error }); }
        return json({ ok: true });
      }
      case "ai": {
        if (!cfg.gemini_key) return json({ ok: false, error: "no_key" });
        return json(await gemini(cfg.gemini_key, b));
      }
      default: return json({ error: "action inconnue" }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
  }
});

async function callFn(name: string, key: string, body: unknown) {
  const r = await fetch(`${SB_URL}/functions/v1/${name}`, { method: "POST", headers: { "Content-Type": "application/json", "x-orbit-key": key }, body: JSON.stringify(body) });
  return await r.json().catch(() => ({ ok: false, error: "réponse illisible" }));
}

async function state(cfg: any, b: any) {
  const today = parisDay(new Date(Date.now() - 864e5));
  let tq = db.from("orbit_tasks").select("id, data, deleted, updated_at");
  if (b.since) tq = tq.gt("updated_at", b.since); else tq = tq.eq("deleted", false);
  const [tasks, settings, devoirs, cours, gcal] = await Promise.all([
    tq.limit(5000),
    db.from("orbit_kv").select("value").eq("key", "settings").maybeSingle(),
    db.from("orbit_devoirs").select("id, subject, description, due, done").gte("due", today).order("due"),
    db.from("orbit_cours").select("id, subject, room, teacher, starts_at, ends_at, canceled, status").gte("ends_at", new Date(Date.now() - 864e5).toISOString()).lte("starts_at", new Date(Date.now() + 15 * 864e5).toISOString()).order("starts_at"),
    calendar(cfg, !!b.forceCal),
  ]);
  return {
    now: new Date().toISOString(),
    tasks: (tasks.data ?? []).map((r: any) => r.deleted ? { id: r.id, deleted: true } : r.data),
    settings: settings.data?.value ?? null,
    pronote: { connected: !!cfg.token, last_sync: cfg.last_sync, last_error: cfg.last_error },
    devoirs: devoirs.data ?? [], cours: cours.data ?? [],
    gcal: gcal.events ?? [], gcalAt: gcal.at ?? null, gcalError: gcal.error ?? null,
    flags: { ai: !!cfg.gemini_key, ical: !!cfg.ical_url, discord: !!cfg.discord_id },
  };
}

/* ---------- IA (Gemini) ---------- */
async function gemini(key: string, b: any) {
  const parts: any[] = [];
  if (b.prompt) parts.push({ text: String(b.prompt).slice(0, 60000) });
  for (const im of (b.images ?? []).slice(0, 6)) if (im?.data && im?.mime) parts.push({ inline_data: { mime_type: im.mime, data: im.data } });
  const contents = b.messages?.length
    ? b.messages.slice(-16).map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content).slice(0, 8000) }] }))
    : [{ role: "user", parts }];
  const body: any = { contents, generationConfig: { temperature: b.json ? 0.2 : 0.7, ...(b.json ? { responseMimeType: "application/json" } : {}) } };
  if (b.system) body.systemInstruction = { parts: [{ text: String(b.system).slice(0, 30000) }] };
  let last = "";
  for (const model of ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const text = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
      return { ok: true, text };
    }
    last = j.error?.message ?? `HTTP ${r.status}`;
    if (/API key|API_KEY/i.test(last)) { last = "Clé refusée par Google (" + last + ")"; break; }
    if (r.status === 429) return { ok: false, error: "rate_limited" };
  }
  return { ok: false, error: last.slice(0, 200) };
}

/* ---------- Google Agenda via l'adresse secrète iCal ---------- */
async function calendar(cfg: any, force: boolean): Promise<{ events?: any[]; at?: string; error?: string }> {
  if (!cfg.ical_url) return {};
  const { data: cache } = await db.from("orbit_kv").select("value, updated_at").eq("key", "gcal").maybeSingle();
  if (cache && !force && Date.now() - new Date(cache.updated_at).getTime() < 15 * 60e3) return { events: cache.value, at: cache.updated_at };
  try {
    const r = await fetch(cfg.ical_url);
    if (!r.ok) return { events: cache?.value ?? [], at: cache?.updated_at, error: `Google Agenda a répondu ${r.status} : vérifie l'adresse iCal` };
    const events = parseICS(await r.text(), new Date(Date.now() - 2 * 864e5), new Date(Date.now() + 22 * 864e5));
    const at = new Date().toISOString();
    await db.from("orbit_kv").upsert({ key: "gcal", value: events, updated_at: at });
    return { events, at };
  } catch (e) {
    return { events: cache?.value ?? [], at: cache?.updated_at, error: "Google Agenda injoignable" };
  }
}

function tzOffsetMs(tz: string, utc: number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(utc)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - utc;
}
function zoned(y: number, mo: number, d: number, h: number, mi: number, tz: string) {
  let t = Date.UTC(y, mo, d, h, mi);
  try { t -= tzOffsetMs(tz, t); t = Date.UTC(y, mo, d, h, mi) - tzOffsetMs(tz, t); } catch { /* fuseau inconnu : UTC */ }
  return t;
}
type Wall = { y: number; mo: number; d: number; h: number; mi: number; allDay: boolean; utc: boolean; tz: string };
function readDate(params: string, v: string): Wall | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const tz = (params.match(/TZID=([^;:]+)/)?.[1] ?? "Europe/Paris").replace(/^"|"$/g, "");
  return { y: +m[1], mo: +m[2] - 1, d: +m[3], h: +(m[4] ?? 0), mi: +(m[5] ?? 0), allDay: !m[4], utc: !!m[7], tz };
}
const wallToMs = (w: Wall) => w.utc ? Date.UTC(w.y, w.mo, w.d, w.h, w.mi) : zoned(w.y, w.mo, w.d, w.h, w.mi, w.allDay ? "Europe/Paris" : w.tz);
const dayKey = (y: number, mo: number, d: number) => `${y}-${mo}-${d}`;
const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function parseICS(text: string, from: Date, to: Date) {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const evs: any[] = []; let cur: any = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = { exdates: [] as string[] }; continue; }
    if (line === "END:VEVENT") { if (cur) evs.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const head = line.slice(0, i), val = line.slice(i + 1);
    const [name, ...pp] = head.split(";"); const params = pp.join(";");
    const unesc = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
    if (name === "SUMMARY") cur.title = unesc(val);
    else if (name === "LOCATION") cur.location = unesc(val);
    else if (name === "UID") cur.uid = val;
    else if (name === "STATUS") cur.status = val;
    else if (name === "DTSTART") cur.start = readDate(params, val);
    else if (name === "DTEND") cur.end = readDate(params, val);
    else if (name === "RRULE") cur.rrule = Object.fromEntries(val.split(";").map((kv) => kv.split("=")));
    else if (name === "EXDATE") for (const v of val.split(",")) { const w = readDate(params, v); if (w) cur.exdates.push(dayKey(w.y, w.mo, w.d)); }
    else if (name === "RECURRENCE-ID") cur.recur = readDate(params, val);
  }
  const overrides = new Map<string, any>();
  for (const e of evs) if (e.recur && e.uid) overrides.set(e.uid + "|" + dayKey(e.recur.y, e.recur.mo, e.recur.d), e);
  const out: any[] = []; const F = from.getTime(), T = to.getTime();
  const push = (e: any, s: number, en: number, allDay: boolean) => {
    if (e.status === "CANCELLED") return;
    if (en < F || s > T) return;
    out.push({ id: (e.uid ?? "") + "@" + s, title: e.title || "(sans titre)", start: new Date(s).toISOString(), end: new Date(en).toISOString(), allDay, location: e.location ?? "" });
  };
  for (const e of evs) {
    if (!e.start || e.recur) continue;
    const s0 = wallToMs(e.start), e0 = e.end ? wallToMs(e.end) : s0 + (e.start.allDay ? 864e5 : 3600e3);
    const dur = Math.max(0, e0 - s0);
    if (!e.rrule) { push(e, s0, e0, e.start.allDay); continue; }
    const r = e.rrule, freq = r.FREQ, interval = +(r.INTERVAL ?? 1) || 1, count = r.COUNT ? +r.COUNT : Infinity;
    const until = r.UNTIL ? (() => { const w = readDate("", r.UNTIL); return w ? wallToMs(w) + (w.allDay ? 864e5 - 1 : 0) : Infinity; })() : Infinity;
    const byday: string[] = r.BYDAY ? r.BYDAY.split(",") : [];
    const bymd: number[] = r.BYMONTHDAY ? r.BYMONTHDAY.split(",").map(Number) : [];
    const st = e.start; const base = Date.UTC(st.y, st.mo, st.d);
    let n = 0;
    for (let k = 0; k < 4000; k++) {
      const day = new Date(base + k * 864e5);
      const y = day.getUTCFullYear(), mo = day.getUTCMonth(), d = day.getUTCDate(), wd = day.getUTCDay();
      const occ = zoned(y, mo, d, st.h, st.mi, st.utc ? "UTC" : (st.allDay ? "Europe/Paris" : st.tz));
      if (occ > T || occ > until || n >= count) break;
      let match = false;
      if (freq === "DAILY") match = k % interval === 0 && (!byday.length || byday.some((x) => x.slice(-2) === DAYS[wd]));
      else if (freq === "WEEKLY") {
        const weeks = Math.floor((k + ((new Date(base).getUTCDay() + 6) % 7)) / 7);
        match = weeks % interval === 0 && (byday.length ? byday.some((x) => x.slice(-2) === DAYS[wd]) : wd === new Date(base).getUTCDay());
      } else if (freq === "MONTHLY") {
        const months = (y - st.y) * 12 + (mo - st.mo);
        if (months % interval === 0) {
          if (bymd.length) match = bymd.includes(d);
          else if (byday.length) match = byday.some((x) => {
            const m = x.match(/^([+-]?\d+)?(\w\w)$/); if (!m || m[2] !== DAYS[wd]) return false;
            if (!m[1]) return true; const nth = +m[1];
            const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
            return nth > 0 ? Math.ceil(d / 7) === nth : Math.ceil((dim - d + 1) / 7) === -nth;
          });
          else match = d === st.d;
        }
      } else if (freq === "YEARLY") match = (y - st.y) % interval === 0 && mo === st.mo && d === st.d;
      if (!match) continue;
      n++;
      const key = dayKey(y, mo, d);
      if (e.exdates.includes(key)) continue;
      const ov = overrides.get((e.uid ?? "") + "|" + key);
      if (ov) { if (ov.start) { const os = wallToMs(ov.start); push({ ...e, ...ov }, os, ov.end ? wallToMs(ov.end) : os + dur, ov.start.allDay); } continue; }
      push(e, occ, occ + dur, st.allDay);
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start)).slice(0, 400);
}
