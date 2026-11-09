// Orbit — envoie les rappels dus en message privé Discord, avec un ping (@mention).
// Appelée par la base (cron orbit-rappels) avec l'en-tête x-orbit-key.
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://discord.com/api/v10";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await db.from("orbit_pronote").select("run_key, discord_id").eq("id", 1).single();
  if (!cfg || req.headers.get("x-orbit-key") !== cfg.run_key) return json({ error: "non autorisé" }, 401);
  const token = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!token || !cfg.discord_id) return json({ error: "bot ou compte Discord manquant" }, 503);
  const bot = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
  const body = await req.json().catch(() => ({}));

  const ch = await fetch(`${API}/users/@me/channels`, { method: "POST", headers: bot, body: JSON.stringify({ recipient_id: cfg.discord_id }) });
  if (!ch.ok) return json({ error: `ouverture MP ${ch.status}` }, 502);
  const { id: channelId } = await ch.json();
  const send = (payload: unknown) => fetch(`${API}/channels/${channelId}/messages`, { method: "POST", headers: bot, body: JSON.stringify(payload) });

  if (body?.test) {
    const r = await send({ content: `<@${cfg.discord_id}> 👋 Orbit est branché : tes rappels arriveront ici.`, allowed_mentions: { users: [cfg.discord_id] } });
    return json({ ok: r.ok, status: r.status });
  }

  const { data: jobs } = await db.from("orbit_rappels").select("*")
    .is("sent_at", null).lt("attempts", 3)
    .lte("at", new Date().toISOString()).gt("at", new Date(Date.now() - 6 * 3600e3).toISOString())
    .order("at").limit(20);
  let sent = 0;
  for (const j of jobs ?? []) {
    const color = j.source === "pronote" ? 0x6f9bff : 0xff6a47;
    const r = await send({
      content: `<@${cfg.discord_id}> ⏰ **${j.title}**`,
      allowed_mentions: { users: [cfg.discord_id] },
      embeds: j.body ? [{ description: String(j.body).slice(0, 1500), color, footer: { text: j.source === "pronote" ? "Orbit · Pronote" : "Orbit" } }] : undefined,
    });
    if (r.ok) { await db.from("orbit_rappels").update({ sent_at: new Date().toISOString(), attempts: j.attempts + 1, error: null }).eq("id", j.id); sent++; }
    else await db.from("orbit_rappels").update({ attempts: r.status === 403 ? 3 : j.attempts + 1, error: `envoi ${r.status}` }).eq("id", j.id);
  }
  return json({ ok: true, sent });
});
