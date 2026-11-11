// Orbit — petites fonctions en plus de l'API : notes Pronote et dictée vocale.
// Protégée par la même clé d'accès que l'app (en-tête x-orbit-app).
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-orbit-app", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const { data: cfg } = await db.from("orbit_pronote").select("app_key, groq_key, gemini_key").eq("id", 1).single();
  if (!cfg || !req.headers.get("x-orbit-app") || req.headers.get("x-orbit-app") !== cfg.app_key) return json({ error: "Code d'accès incorrect" }, 401);
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "notes") {
      const { data } = await db.from("orbit_kv").select("value, updated_at").eq("key", "notes").maybeSingle();
      return json({ ok: true, notes: data?.value ?? null, at: data?.updated_at ?? null });
    }
    if (b.action === "transcribe") return json(await transcribe(cfg, b));
    return json({ error: "action inconnue" }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
  }
});

// Dictée : Whisper chez Groq (gratuit), Gemini en secours
async function transcribe(cfg: any, b: any) {
  const b64 = String(b.audio ?? ""), mime = String(b.mime ?? "audio/webm").split(";")[0];
  if (!b64 || b64.length > 14_000_000) return { ok: false, error: "Enregistrement vide ou trop long" };
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const ext = /mp4|m4a|aac/.test(mime) ? "m4a" : /ogg/.test(mime) ? "ogg" : /wav/.test(mime) ? "wav" : /mpeg|mp3/.test(mime) ? "mp3" : "webm";
  let err = "";
  if (cfg.groq_key) {
    for (const model of ["whisper-large-v3-turbo", "whisper-large-v3"]) {
      const fd = new FormData();
      fd.append("file", new Blob([bytes], { type: mime }), "voix." + ext);
      fd.append("model", model); fd.append("language", "fr"); fd.append("response_format", "json");
      const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${cfg.groq_key}` }, body: fd, signal: AbortSignal.timeout(30000) });
      if (r.ok) { const j = await r.json(); return { ok: true, text: String(j.text ?? "").trim() }; }
      err = `Groq ${r.status} ${(await r.text().catch(() => "")).slice(0, 120)}`;
      if (r.status === 401) break;
    }
  }
  if (cfg.gemini_key) {
    const body = { contents: [{ role: "user", parts: [{ text: "Transcris exactement ce message vocal en français. Réponds uniquement avec le texte." }, { inline_data: { mime_type: mime, data: b64 } }] }] };
    for (const model of ["gemini-flash-latest", "gemini-2.5-flash"]) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.gemini_key }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return { ok: true, text: (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("").trim() };
      err = "Gemini " + (j.error?.message ?? r.status);
    }
  }
  return { ok: false, error: err || "no_key" };
}
