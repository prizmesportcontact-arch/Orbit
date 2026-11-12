// Orbit — petites fonctions en plus de l'API : notes Pronote et dictée vocale.
// Protégée par la même clé d'accès que l'app (en-tête x-orbit-app).
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-orbit-app", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const appKey = req.headers.get("x-orbit-app");
  if (!appKey) return json({ error: "Code d'accès incorrect" }, 401);
  const { data: me } = await db.from("orbit_pronote").select("id, groq_key, gemini_key").eq("app_key", appKey).maybeSingle();
  if (!me) return json({ error: "Code d'accès incorrect" }, 401);
  let cfg: any = me;
  if (me.id !== 1 && (!me.groq_key || !me.gemini_key)) {
    const { data: o } = await db.from("orbit_pronote").select("groq_key, gemini_key").eq("id", 1).single();
    cfg = { ...me, groq_key: me.groq_key ?? o?.groq_key, gemini_key: me.gemini_key ?? o?.gemini_key };
  }
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "notes") {
      const { data } = await db.from("orbit_kv").select("value, updated_at").eq("key", cfg.id === 1 ? "notes" : `u${cfg.id}:notes`).maybeSingle();
      return json({ ok: true, notes: data?.value ?? null, at: data?.updated_at ?? null });
    }
    if (b.action === "contenus") {
      const { data } = await db.from("orbit_kv").select("value, updated_at").eq("key", cfg.id === 1 ? "contenus" : `u${cfg.id}:contenus`).maybeSingle();
      return json({ ok: true, contenus: data?.value ?? [], at: data?.updated_at ?? null });
    }
    if (b.action === "study") return json(await study(cfg, b));
    if (b.action === "fiches" || b.action === "fiche_save" || b.action === "fiche_del") {
      const key = cfg.id === 1 ? "fiches" : `u${cfg.id}:fiches`;
      const { data } = await db.from("orbit_kv").select("value").eq("key", key).maybeSingle();
      let list: any[] = Array.isArray(data?.value) ? data!.value : [];
      if (b.action === "fiches") return json({ ok: true, fiches: list });
      if (b.action === "fiche_save" && b.fiche?.id) { list = [b.fiche, ...list.filter((f) => f.id !== b.fiche.id)].slice(0, 80); }
      if (b.action === "fiche_del") list = list.filter((f) => f.id !== b.id);
      await db.from("orbit_kv").upsert({ key, value: list, updated_at: new Date().toISOString() });
      return json({ ok: true });
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

/* ---------- Prof IA : explications, aide aux devoirs, fiches, quiz ---------- */
const TUTOR = `Tu es un excellent professeur particulier pour un lycéen français. Tu tutoies, tu es clair, bienveillant et précis.
Règles :
- Explique simplement, étape par étape, avec un exemple concret. Vérifie tes calculs.
- Aide aux devoirs : par défaut, GUIDE (méthode, indice, première étape, vérifie sa réponse) au lieu de donner directement la réponse finale. Donne la correction complète seulement s'il la demande clairement.
- Mise en forme Markdown pour téléphone : titres courts avec ###, listes à tirets, **gras** pour l'essentiel, tableaux simples si utile.
- Formules : en LaTeX entre $...$ (en ligne) ou $$...$$ (bloc). Ex : $\\Delta = b^2 - 4ac$.
- Schémas : quand un dessin aide (étapes, chronologie, carte mentale, circuit logique, cycle, classification), ajoute un bloc \`\`\`mermaid valide (flowchart LR/TD, mindmap, timeline ou sequenceDiagram), court (8 à 14 nœuds), textes entre guillemets, sans parenthèses ni caractères spéciaux dans les noms de nœuds.
- Termine souvent par une petite question pour vérifier qu'il a compris.
- Si tu n'es pas sûr d'un fait, dis-le.
- Style : entre directement dans l'explication, sans « Bonne question ! » ni « Bien sûr », sans phrase finale du type « En résumé » ou « N'hésite pas ». Pas d'emoji, pas de tournure « ce n'est pas X, c'est Y ». Un exemple chiffré vaut mieux qu'un adjectif.`;
const FICHE = `${TUTOR}
Tu fais une FICHE DE RÉVISION complète, fiable et synthétique (niveau lycée). Réponds UNIQUEMENT en JSON :
{"title":"titre","subject":"matière","resume":"2-3 phrases","sections":[{"titre":"…","points":["…"]}],"definitions":[{"terme":"…","def":"…"}],"formules":[{"nom":"…","latex":"formule LaTeX sans $","explication":"…"}],"schema":"code mermaid (carte mentale ou schéma) ou chaîne vide","exemples":["exemple corrigé court"],"pieges":["erreur fréquente"],"retenir":["les 3-5 choses à savoir par cœur"]}
3 à 5 sections, 3 à 6 points chacune. Vérifie chaque affirmation et chaque formule : n'écris rien dont tu n'es pas sûr. formules vide si la matière n'en a pas. Le texte des points peut contenir **gras** et $LaTeX$.`;
const QUIZ = `${TUTOR}
Fais un QUIZ de révision de 8 questions à choix multiples, de difficulté progressive, sur le sujet donné. Réponds UNIQUEMENT en JSON :
{"questions":[{"q":"question","choix":["A","B","C","D"],"bonne":0,"explication":"pourquoi, en 1-2 phrases"}]}
"bonne" = index (0-3) de la bonne réponse. Une seule bonne réponse, des pièges plausibles. Tu peux utiliser $LaTeX$.
AVANT de répondre, vérifie chaque question : la bonne réponse doit être certaine et conforme au programme du lycée. Si tu as le moindre doute sur une question, remplace-la par une autre plus sûre.`;

async function study(cfg: any, b: any) {
  const mode = ["fiche", "quiz"].includes(b.mode) ? b.mode : "chat";
  const system = (mode === "fiche" ? FICHE : mode === "quiz" ? QUIZ : TUTOR) + (b.context ? "\n\nCONTEXTE (cours de l'élève, cahier de textes, notes) :\n" + String(b.context).slice(0, 12000) : "");
  const messages = (b.messages ?? []).slice(-14).map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 12000) }));
  if (!messages.length) messages.push({ role: "user", content: String(b.prompt ?? "").slice(0, 12000) });
  const images = (b.images ?? []).filter((i: any) => i?.data && i?.mime).slice(0, 4);
  const json = mode !== "chat";
  let err = "";
  // Photo → Gemini (vision). Sinon Groq gpt-oss-120b avec raisonnement, Gemini en secours.
  if (!images.length && cfg.groq_key) {
    for (const model of ["openai/gpt-oss-120b", "moonshotai/kimi-k2-instruct", "llama-3.3-70b-versatile"]) {
      try {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.groq_key}` },
          body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...messages], temperature: json ? 0.3 : 0.5, max_completion_tokens: 5000,
            ...(model.includes("gpt-oss") ? { reasoning_effort: "medium" } : {}), ...(json ? { response_format: { type: "json_object" } } : {}) }),
          signal: AbortSignal.timeout(json ? 85000 : 55000),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok) { const text = j.choices?.[0]?.message?.content ?? ""; if (text.trim()) return { ok: true, text, model }; }
        err = j.error?.message ?? `Groq ${r.status}`;
        if (r.status === 401) break;
      } catch { err = "Groq met trop de temps"; }
    }
  }
  if (cfg.gemini_key) {
    const contents = messages.map((m: any, i: number) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }, ...(i === messages.length - 1 ? images.map((im: any) => ({ inline_data: { mime_type: im.mime, data: im.data } })) : [])] }));
    for (const model of ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite"]) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.gemini_key },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: json ? 0.3 : 0.5, ...(json ? { responseMimeType: "application/json" } : {}) } }),
          signal: AbortSignal.timeout(50000),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok) return { ok: true, text: (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join(""), model };
        err = "Gemini " + (j.error?.message ?? r.status);
      } catch { err = "Gemini met trop de temps"; }
    }
  }
  return { ok: false, error: err || "no_key" };
}
