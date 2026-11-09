// Orbit — synchro Pronote (Supabase Edge Function)
// Lit les devoirs et l'emploi du temps de l'élève (lecture seule) et les range dans
// public.orbit_devoirs et public.orbit_cours. Appelée par le cron (x-orbit-key = run_key).
import { createClient } from "npm:@supabase/supabase-js@2";
import * as pronote from "npm:@blockshub/pawnote-lts@1.6.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const clean = (html: string) =>
  (html || "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#0*39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim();

const sha = async (t: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");

// Date "jour" vue de Paris (les échéances Pronote sont des jours, pas des heures)
const parisDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);

Deno.serve(async (req) => {
  const { data: row, error } = await db.from("orbit_pronote").select("*").eq("id", 1).single();
  if (error || !row) return json({ ok: false, error: "config introuvable" }, 500);
  if (req.headers.get("x-orbit-key") !== row.run_key) return json({ ok: false, error: "non autorisé" }, 401);

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === "setup" ? "setup" : "sync";

  // Trace des échanges (sans contenu chiffré) pour comprendre une panne
  const trace: string[] = [];
  const fetcher = async (r: any) => {
    const res = await fetch(r.url.href, { redirect: r.redirect ?? "follow", headers: r.headers ?? {}, method: r.method ?? "GET", body: r.content });
    const content = await res.text();
    const txt = /<|Erreur|page|Impossible/i.test(content.slice(0, 400))
      ? " « " + content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) + " »" : "";
    trace.push(`${r.method ?? "GET"} ${r.url.pathname} -> ${res.status}${txt}`);
    return { status: res.status, content, headers: res.headers };
  };
  const session = pronote.createSessionHandle(fetcher);

  try {
    let refresh: pronote.RefreshInformation;
    let deviceUUID = row.device_uuid as string | null;

    if (mode === "setup" || (row.pending_qr && row.pending_pin)) {
      if (!row.pending_qr || !row.pending_pin) throw new Error("QR code ou code PIN manquant");
      deviceUUID = crypto.randomUUID();
      await db.from("orbit_pronote").update({ qr_url: String(row.pending_qr.url || "") }).eq("id", 1);
      refresh = await pronote.loginQrCode(session, { deviceUUID, pin: String(row.pending_pin), qr: row.pending_qr });
    } else {
      if (!row.token || !row.username || !row.url || !deviceUUID) throw new Error("Pronote pas encore connecté");
      refresh = await pronote.loginToken(session, {
        url: row.url, kind: row.kind ?? pronote.AccountKind.STUDENT, username: row.username,
        token: row.token, deviceUUID, navigatorIdentifier: row.navigator_identifier ?? undefined,
      });
    }

    // Pronote donne un nouveau jeton à chaque connexion : on le garde tout de suite.
    await db.from("orbit_pronote").update({
      url: refresh.url, username: refresh.username, token: refresh.token, kind: refresh.kind,
      navigator_identifier: refresh.navigatorIdentifier, device_uuid: deviceUUID,
      pending_qr: null, pending_pin: null, updated_at: new Date().toISOString(),
    }).eq("id", 1);

    const now = new Date();
    const start = new Date(now.getTime() - 864e5), end = new Date(now.getTime() + 28 * 864e5);

    // Devoirs
    // Pronote change l'identifiant des devoirs à chaque session : on fabrique un identifiant
    // stable (matière + date + consigne) pour ne jamais créer de doublon.
    const list = await pronote.assignmentsFromIntervals(session, start, end);
    const byId = new Map<string, any>();
    for (const a of list) {
      const subject = a.subject?.name ?? null, description = clean(a.description).slice(0, 2000), due = parisDay(new Date(a.deadline));
      const id = "d" + (await sha(`${subject}|${due}|${description}`)).slice(0, 24);
      const prev = byId.get(id);
      byId.set(id, { id, subject, description, due, done: !!a.done || !!prev?.done, updated_at: now.toISOString() });
    }
    const rows = [...byId.values()];
    if (rows.length) {
      const { error: e } = await db.from("orbit_devoirs").upsert(rows, { onConflict: "id" });
      if (e) throw new Error("base : " + e.message);
    }
    // Devoirs disparus de Pronote sur la période lue (ou anciens identifiants) : on les retire
    const keep = rows.map((r) => r.id);
    let del = db.from("orbit_devoirs").delete().gte("due", parisDay(start));
    if (keep.length) del = del.not("id", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
    await del;
    await db.from("orbit_devoirs").delete().lt("due", parisDay(new Date(now.getTime() - 30 * 864e5)));

    // Emploi du temps (14 jours). Une panne ici ne bloque pas les devoirs.
    let cours = 0;
    try {
      const tt = await pronote.timetableFromIntervals(session, new Date(now.getTime() - 864e5), new Date(now.getTime() + 14 * 864e5));
      pronote.parseTimetable(session, tt, { withCanceledClasses: true, withPlannedClasses: true, withSuperposedCanceledClasses: false });
      const cr = tt.classes.map((c: any) => ({
        id: c.id + "@" + new Date(c.startDate).toISOString(),
        subject: c.is === "lesson" ? (c.subject?.name ?? null) : (c.title ?? (c.is === "detention" ? "Retenue" : "Activité")),
        room: (c.classrooms ?? []).join(", ") || null,
        teacher: (c.teacherNames ?? []).join(", ") || null,
        starts_at: new Date(c.startDate).toISOString(), ends_at: new Date(c.endDate).toISOString(),
        canceled: !!c.canceled, status: c.status ?? null, updated_at: now.toISOString(),
      }));
      await db.from("orbit_cours").delete().gte("starts_at", new Date(now.getTime() - 864e5).toISOString());
      if (cr.length) await db.from("orbit_cours").upsert(cr, { onConflict: "id" });
      await db.from("orbit_cours").delete().lt("starts_at", new Date(now.getTime() - 7 * 864e5).toISOString());
      cours = cr.length;
    } catch (e) {
      trace.push("emploi du temps : " + String((e as Error)?.message ?? e).slice(0, 120));
    }

    await db.from("orbit_pronote").update({ last_sync: now.toISOString(), last_error: null, fail_count: 0 }).eq("id", 1);
    return json({ ok: true, mode, devoirs: rows.length, cours });
  } catch (e) {
    let msg = (e as Error)?.name ? `${(e as Error).name}: ${(e as Error).message}` : String(e);
    if (trace.length) msg += " | trace " + trace.slice(-6).join(" || ");
    const fails = (row.fail_count ?? 0) + 1;
    await db.from("orbit_pronote").update({
      last_error: msg.slice(0, 3000), fail_count: fails,
      ...(mode === "setup" ? { pending_qr: null, pending_pin: null } : {}),
    }).eq("id", 1);

    // Alerte Discord : la synchro marchait et échoue 2 fois de suite (max 1 alerte / 12 h)
    const wasConnected = !!row.token && !/pas encore connecté/.test(msg);
    const lastAlert = row.last_alert ? new Date(row.last_alert).getTime() : 0;
    if (mode === "sync" && wasConnected && fails >= 2 && Date.now() - lastAlert > 12 * 3600e3) {
      const expired = /SessionExpired|Authenticate|BadCredentials|token/i.test(msg);
      await db.from("orbit_rappels").upsert({
        id: "alert:pronote:" + new Date().toISOString().slice(0, 13), source: "orbit",
        title: expired ? "Pronote déconnecté : rescanne le QR code dans Orbit" : "La synchro Pronote ne marche plus",
        body: expired ? "Orbit → Devoirs → Pronote automatique → Reconnecter." : "Je réessaie toutes les 30 min. Si ça dure, préviens Claude avec le message d'erreur affiché dans Orbit.",
        at: new Date().toISOString(),
      }, { onConflict: "id" });
      await db.from("orbit_pronote").update({ last_alert: new Date().toISOString() }).eq("id", 1);
    }
    return json({ ok: false, mode, error: msg }, 200);
  }
});
