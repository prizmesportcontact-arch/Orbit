// Orbit — API de l'app autonome (GitHub Pages).
// Toutes les données passent ici. Protégée par la clé d'accès Orbit (en-tête x-orbit-app).
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseICS } from "./ics.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-orbit-app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const parisDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
// Plusieurs comptes : chaque ligne de orbit_pronote est un compte (id = uid). Le compte 1 garde ses clés « nues ».
const K = (cfg: any, key: string) => cfg.id === 1 ? key : `u${cfg.id}:${key}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const appKey = req.headers.get("x-orbit-app");
  if (!appKey) return json({ error: "Code d'accès incorrect" }, 401);
  const { data: me } = await db.from("orbit_pronote").select("*").eq("app_key", appKey).maybeSingle();
  if (!me) return json({ error: "Code d'accès incorrect" }, 401);
  const uid: number = me.id;
  let cfg: any = me;
  if (uid !== 1 && (!me.groq_key || !me.gemini_key)) {
    // Les autres comptes utilisent les clés IA du propriétaire s'ils n'ont pas les leurs
    const { data: owner } = await db.from("orbit_pronote").select("groq_key, gemini_key, run_key").eq("id", 1).single();
    cfg = { ...me, groq_key: me.groq_key ?? owner?.groq_key ?? null, gemini_key: me.gemini_key ?? owner?.gemini_key ?? null, shared_ai: true };
  }
  const b = await req.json().catch(() => ({}));

  try {
    switch (b.action) {
      case "state": return json(await state(cfg, b));
      case "put_tasks": {
        const rows = (b.tasks ?? []).filter((t: any) => t?.id).map((t: any) => ({ id: String(t.id), uid, data: t, deleted: false, updated_at: new Date().toISOString() }));
        if (rows.length) { const { error } = await db.from("orbit_tasks").upsert(rows, { onConflict: "id" }); if (error) throw error; }
        return json({ ok: true, at: new Date().toISOString() });
      }
      case "del_tasks": {
        const ids = (b.ids ?? []).map(String);
        if (ids.length) await db.from("orbit_tasks").update({ deleted: true, updated_at: new Date().toISOString() }).eq("uid", uid).in("id", ids);
        return json({ ok: true });
      }
      case "put_settings":
        await db.from("orbit_kv").upsert({ key: K(cfg, "settings"), value: b.settings ?? {}, updated_at: new Date().toISOString() });
        return json({ ok: true });
      case "rappels": {
        // Rappels des tâches perso (préfixe o:) ; les alertes et les devoirs Pronote ne sont pas touchés.
        await db.from("orbit_rappels").delete().eq("uid", uid).like("id", "o:%").is("sent_at", null);
        const rows = (b.rows ?? []).slice(0, 800).map((r: any) => ({ id: String(r.id).slice(0, 200), uid, source: "orbit", title: String(r.title).slice(0, 200), body: r.body ? String(r.body).slice(0, 800) : null, at: r.at }));
        if (rows.length) await db.from("orbit_rappels").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
        const done = (b.doneP ?? []).map(String);
        await db.from("orbit_devoirs").update({ done_local: false }).eq("uid", uid).eq("done_local", true);
        if (done.length) await db.from("orbit_devoirs").update({ done_local: true }).eq("uid", uid).in("id", done);
        return json({ ok: true, rappels: rows.length });
      }
      case "pronote_setup": {
        const qr = b.qr ?? {};
        if (!qr.jeton || !qr.url || !/^\d{4}$/.test(String(b.pin))) return json({ ok: false, error: "QR code ou code invalide" });
        await db.from("orbit_pronote").update({ pending_qr: { jeton: String(qr.jeton), login: String(qr.login ?? ""), url: String(qr.url) }, pending_pin: String(b.pin), token: null, last_error: null, fail_count: 0 }).eq("id", uid);
        return json(await callFn("orbit-pronote", cfg.run_key, { mode: "setup", uid }));
      }
      case "pronote_sync": return json(await callFn("orbit-pronote", cfg.run_key, { mode: "sync", uid }));
      case "test_discord": return json(await callFn("orbit-tick", cfg.run_key, { test: true, uid }));
      case "set_secret": {
        const up: Record<string, unknown> = {};
        if (typeof b.gemini_key === "string") up.gemini_key = b.gemini_key.trim() || null;
        if (typeof b.groq_key === "string") up.groq_key = b.groq_key.trim() || null;
        if (typeof b.discord_id === "string") {
          const d = b.discord_id.trim();
          if (d && !/^\d{15,21}$/.test(d)) return json({ ok: false, error: "L'ID Discord est un nombre de 17 à 20 chiffres" });
          up.discord_id = d || null;
        }
        if (typeof b.name === "string") up.name = b.name.trim().slice(0, 40) || null;
        if (typeof b.ical_url === "string") {
          const u = b.ical_url.trim().replace(/^webcal:/i, "https:");
          if (u && !/^https:\/\/calendar\.google\.com\/calendar\/ical\/.+\.ics$/i.test(u)) return json({ ok: false, error: "Ce n'est pas une adresse iCal Google Agenda (elle finit par .ics)" });
          up.ical_url = u || null;
          await db.from("orbit_kv").delete().eq("key", K(cfg, "gcal"));
        }
        if (up.gemini_key) { await db.from("orbit_kv").delete().eq("key", "gemini_model"); const t = await gemini(String(up.gemini_key), { prompt: "Réponds juste OK." }); if (!t.ok && t.error !== "rate_limited" && !/demand|overload|unavailable/i.test(t.error)) return json({ ok: false, error: "Clé Gemini refusée : " + t.error }); }
        if (up.groq_key) { await db.from("orbit_kv").delete().eq("key", "groq_model"); const t = await groq(String(up.groq_key), { prompt: "Réponds juste OK." }); if (!t.ok && t.error !== "rate_limited") return json({ ok: false, error: "Clé Groq refusée : " + t.error }); }
        await db.from("orbit_pronote").update(up).eq("id", uid);
        if (up.ical_url) { const g = await calendar({ ...cfg, ical_url: up.ical_url }, true); if (g.error) return json({ ok: false, error: g.error }); }
        return json({ ok: true });
      }
      case "ai": return json(await askAI(cfg, b));
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
  const uid = cfg.id;
  let tq = db.from("orbit_tasks").select("id, data, deleted, updated_at").eq("uid", uid);
  if (b.since) tq = tq.gt("updated_at", b.since); else tq = tq.eq("deleted", false);
  const [tasks, settings, devoirs, cours, gcal] = await Promise.all([
    tq.limit(5000),
    db.from("orbit_kv").select("value").eq("key", K(cfg, "settings")).maybeSingle(),
    db.from("orbit_devoirs").select("id, subject, description, due, done").eq("uid", uid).gte("due", today).order("due"),
    db.from("orbit_cours").select("id, subject, room, teacher, starts_at, ends_at, canceled, status").eq("uid", uid).gte("ends_at", new Date(Date.now() - 864e5).toISOString()).lte("starts_at", new Date(Date.now() + 15 * 864e5).toISOString()).order("starts_at"),
    calendar(cfg, !!b.forceCal),
  ]);
  return {
    now: new Date().toISOString(),
    tasks: (tasks.data ?? []).map((r: any) => r.deleted ? { id: r.id, deleted: true } : r.data),
    settings: settings.data?.value ?? null,
    pronote: { connected: !!cfg.token, last_sync: cfg.last_sync, last_error: cfg.last_error },
    devoirs: devoirs.data ?? [], cours: cours.data ?? [],
    gcal: gcal.events ?? [], gcalAt: gcal.at ?? null, gcalError: gcal.error ?? null,
    me: { id: uid, name: cfg.name ?? null, sharedAI: !!cfg.shared_ai },
    flags: { ai: !!(cfg.gemini_key || cfg.groq_key), gemini: !!cfg.gemini_key, groq: !!cfg.groq_key, ical: !!cfg.ical_url, discord: !!cfg.discord_id },
  };
}

/* ---------- IA : Groq (rapide) puis Gemini en secours ---------- */
async function askAI(cfg: any, b: any) {
  const providers: [string, (k: string, b: any) => Promise<any>][] = [];
  const hasImages = (b.images ?? []).length > 0;
  if (cfg.groq_key && !hasImages) providers.push([cfg.groq_key, groq]);
  if (cfg.gemini_key) providers.push([cfg.gemini_key, gemini]);
  if (!providers.length) return { ok: false, error: hasImages && cfg.groq_key ? "Lire une capture demande la clé Gemini" : "no_key" };
  let last: any = null;
  for (const [key, fn] of providers) {
    const r = await fn(key, b);
    if (r.ok) return r;
    last = r;
  }
  return last;
}

const GROQ = "https://api.groq.com/openai/v1";
async function groqModels(key: string): Promise<string[]> {
  const { data: kv } = await db.from("orbit_kv").select("value, updated_at").eq("key", "groq_model").maybeSingle();
  if (kv?.value?.models?.length && Date.now() - new Date(kv.updated_at).getTime() < 24 * 3600e3) return kv.value.models;
  try {
    const r = await fetch(`${GROQ}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
    const ids: string[] = ((await r.json()).data ?? []).filter((m: any) => m.active !== false).map((m: any) => String(m.id));
    const chat = ids.filter((id) => !/whisper|guard|tts|playai|orpheus|prompt|safeguard|compound|distil/i.test(id));
    const pref = [/gpt-oss-120b/, /kimi-k2/, /llama-3\.3-70b/, /llama-4-maverick/, /qwen/, /gpt-oss-20b/, /llama-4-scout/, /llama/];
    const models = [...new Set(pref.flatMap((re) => chat.filter((id) => re.test(id))).concat(chat))].slice(0, 4);
    if (models.length) { await db.from("orbit_kv").upsert({ key: "groq_model", value: { models }, updated_at: new Date().toISOString() }); return models; }
  } catch { /* valeurs par défaut */ }
  return ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"];
}
async function groq(key: string, b: any) {
  const messages: any[] = [];
  if (b.system) messages.push({ role: "system", content: String(b.system).slice(0, 30000) });
  if (b.messages?.length) for (const m of b.messages.slice(-16)) messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 8000) });
  else messages.push({ role: "user", content: String(b.prompt ?? "").slice(0, 60000) });
  if (b.json && !messages.some((m) => /json/i.test(m.content))) messages[0].content += "\nRéponds en JSON.";
  let last = "", limited = false;
  for (const model of await groqModels(key)) {
    let r: Response;
    try {
      r = await fetch(`${GROQ}/chat/completions`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, temperature: b.json ? 0.2 : 0.7, ...(b.json ? { response_format: { type: "json_object" } } : {}) }),
        signal: AbortSignal.timeout(25000),
      });
    } catch { last = "Groq met trop de temps à répondre"; continue; }
    const j = await r.json().catch(() => ({}));
    if (r.ok) return { ok: true, text: j.choices?.[0]?.message?.content ?? "", model: "groq:" + model };
    last = j.error?.message ?? `HTTP ${r.status}`;
    if (r.status === 401) return { ok: false, error: "Clé refusée par Groq (" + last + ")" };
    if (r.status === 429) limited = true;
    if (r.status === 404 || /model/i.test(last)) await db.from("orbit_kv").delete().eq("key", "groq_model");
  }
  return { ok: false, error: limited ? "rate_limited" : last.slice(0, 200) };
}

/* ---------- IA (Gemini) ---------- */
const GAPI = "https://generativelanguage.googleapis.com/v1beta";
// Google retire régulièrement des modèles : on cherche le plus récent « flash » disponible pour cette clé et on le mémorise.
async function pickModels(key: string): Promise<string[]> {
  const { data: kv } = await db.from("orbit_kv").select("value, updated_at").eq("key", "gemini_model").maybeSingle();
  if (kv?.value?.models?.length && Date.now() - new Date(kv.updated_at).getTime() < 24 * 3600e3) return kv.value.models;
  try {
    const r = await fetch(`${GAPI}/models?pageSize=200`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    const ver = (n: string) => +(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
    const models = (j.models ?? [])
      .filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m: any) => String(m.name).replace(/^models\//, ""))
      .filter((n: string) => /^gemini-[\d.]+-flash$|^gemini-flash-latest$/.test(n))
      .sort((a: string, b: string) => ver(b) - ver(a));
    if (models.length) { await db.from("orbit_kv").upsert({ key: "gemini_model", value: { models: models.slice(0, 4) }, updated_at: new Date().toISOString() }); return models.slice(0, 4); }
  } catch { /* liste indisponible : valeurs par défaut */ }
  return ["gemini-flash-latest", "gemini-3.8-flash", "gemini-3.7-flash"];
}
async function gemini(key: string, b: any) {
  const parts: any[] = [];
  if (b.prompt) parts.push({ text: String(b.prompt).slice(0, 60000) });
  for (const im of (b.images ?? []).slice(0, 6)) if (im?.data && im?.mime) parts.push({ inline_data: { mime_type: im.mime, data: im.data } });
  const contents = b.messages?.length
    ? b.messages.slice(-16).map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content).slice(0, 8000) }] }))
    : [{ role: "user", parts }];
  const body: any = { contents, generationConfig: { temperature: b.json ? 0.2 : 0.7, ...(b.json ? { responseMimeType: "application/json" } : {}) } };
  if (b.system) body.systemInstruction = { parts: [{ text: String(b.system).slice(0, 30000) }] };
  let last = "", limited = false;
  const tried = new Set<string>();
  const queue = await pickModels(key);
  const started = Date.now();
  while (queue.length && Date.now() - started < 45000) {
    const model = queue.shift()!; if (tried.has(model)) continue; tried.add(model);
    let r: Response;
    try {
      r = await fetch(`${GAPI}/models/${model}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
      });
    } catch { last = "Gemini met trop de temps à répondre"; continue; }
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const text = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
      if (tried.size > 1) { const all = await pickModels(key); await db.from("orbit_kv").upsert({ key: "gemini_model", value: { models: [model, ...all.filter((m) => m !== model)] }, updated_at: new Date().toISOString() }); }
      return { ok: true, text, model };
    }
    last = j.error?.message ?? `HTTP ${r.status}`;
    const hint = last.match(/use models\/([\w.-]+)/i)?.[1];
    if (hint && !tried.has(hint)) queue.unshift(hint);
    if (r.status === 429 || r.status === 503 || /high demand|overloaded|unavailable/i.test(last)) { limited = true; continue; }
    if (/API key not valid|API_KEY_INVALID/i.test(last)) { last = "Clé refusée par Google (" + last + ")"; break; }
  }
  if (!limited) await db.from("orbit_kv").delete().eq("key", "gemini_model");
  return { ok: false, error: limited ? "rate_limited" : last.slice(0, 200) };
}

/* ---------- Google Agenda via l'adresse secrète iCal ---------- */
async function calendar(cfg: any, force: boolean): Promise<{ events?: any[]; at?: string; error?: string }> {
  if (!cfg.ical_url) return {};
  const { data: cache } = await db.from("orbit_kv").select("value, updated_at").eq("key", K(cfg, "gcal")).maybeSingle();
  if (cache && !force && Date.now() - new Date(cache.updated_at).getTime() < 15 * 60e3) return { events: cache.value, at: cache.updated_at };
  try {
    const r = await fetch(cfg.ical_url);
    if (!r.ok) return { events: cache?.value ?? [], at: cache?.updated_at, error: `Google Agenda a répondu ${r.status} : vérifie l'adresse iCal` };
    const events = parseICS(await r.text(), new Date(Date.now() - 2 * 864e5), new Date(Date.now() + 22 * 864e5));
    const at = new Date().toISOString();
    await db.from("orbit_kv").upsert({ key: K(cfg, "gcal"), value: events, updated_at: at });
    return { events, at };
  } catch (e) {
    return { events: cache?.value ?? [], at: cache?.updated_at, error: "Google Agenda injoignable" };
  }
}
