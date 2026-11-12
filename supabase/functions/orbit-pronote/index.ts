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

// Pronote donne des heures « murales » françaises (8:30 = 8:30 à Paris). Le serveur étant en UTC,
// la Date reçue porte ces chiffres en UTC : on les réinterprète comme heure de Paris.
function parisWall(d: Date) {
  const y = d.getUTCFullYear(), mo = d.getUTCMonth(), da = d.getUTCDate(), h = d.getUTCHours(), mi = d.getUTCMinutes();
  const guess = Date.UTC(y, mo, da, h, mi);
  const off = (t: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - t;
  };
  let t = guess - off(guess); t = guess - off(t);
  return new Date(t);
}

// Date "jour" vue de Paris (les échéances Pronote sont des jours, pas des heures)
const parisDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  // Compte concerné (1 = propriétaire). Les identifiants des autres comptes sont préfixés pour ne jamais se mélanger.
  const uid = Number(body?.uid) || 1;
  const P = (id: string) => uid === 1 ? id : `u${uid}.${id}`;
  const KV = (k: string) => uid === 1 ? k : `u${uid}:${k}`;
  const { data: owner } = await db.from("orbit_pronote").select("run_key").eq("id", 1).single();
  if (!owner || req.headers.get("x-orbit-key") !== owner.run_key) return json({ ok: false, error: "non autorisé" }, 401);
  const { data: row, error } = await db.from("orbit_pronote").select("*").eq("id", uid).single();
  if (error || !row) return json({ ok: false, error: "compte introuvable" }, 404);
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
      await db.from("orbit_pronote").update({ qr_url: String(row.pending_qr.url || "") }).eq("id", uid);
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
    }).eq("id", uid);

    const now = new Date();
    const start = new Date(now.getTime() - 864e5), end = new Date(now.getTime() + 28 * 864e5);

    // Devoirs
    // Pronote change l'identifiant des devoirs à chaque session : on fabrique un identifiant
    // stable (matière + date + consigne) pour ne jamais créer de doublon.
    const list = await pronote.assignmentsFromIntervals(session, start, end);
    const byId = new Map<string, any>();
    for (const a of list) {
      const subject = a.subject?.name ?? null, description = clean(a.description).slice(0, 2000), due = new Date(a.deadline).toISOString().slice(0, 10);
      const id = P("d" + (await sha(`${subject}|${due}|${description}`)).slice(0, 24));
      const prev = byId.get(id);
      byId.set(id, { id, uid, subject, description, due, done: !!a.done || !!prev?.done, updated_at: now.toISOString() });
    }
    const rows = [...byId.values()];
    if (rows.length) {
      const { error: e } = await db.from("orbit_devoirs").upsert(rows, { onConflict: "id" });
      if (e) throw new Error("base : " + e.message);
    }
    // Devoirs disparus de Pronote sur la période lue (ou anciens identifiants) : on les retire
    const keep = rows.map((r) => r.id);
    let del = db.from("orbit_devoirs").delete().eq("uid", uid).gte("due", parisDay(start));
    if (keep.length) del = del.not("id", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
    await del;
    await db.from("orbit_devoirs").delete().eq("uid", uid).lt("due", parisDay(new Date(now.getTime() - 30 * 864e5)));

    // Emploi du temps (14 jours). Une panne ici ne bloque pas les devoirs.
    let cours = 0;
    try {
      const tt = await pronote.timetableFromIntervals(session, new Date(now.getTime() - 864e5), new Date(now.getTime() + 14 * 864e5));
      pronote.parseTimetable(session, tt, { withCanceledClasses: true, withPlannedClasses: true, withSuperposedCanceledClasses: false });
      const cr = tt.classes.map((c: any) => ({
        id: P(c.id + "@" + parisWall(new Date(c.startDate)).toISOString()), uid,
        subject: c.is === "lesson" ? (c.subject?.name ?? null) : (c.title ?? (c.is === "detention" ? "Retenue" : "Activité")),
        room: (c.classrooms ?? []).join(", ") || null,
        teacher: (c.teacherNames ?? []).join(", ") || null,
        starts_at: parisWall(new Date(c.startDate)).toISOString(), ends_at: parisWall(new Date(c.endDate)).toISOString(),
        canceled: !!c.canceled, status: c.status ?? null, updated_at: now.toISOString(),
      }));
      await db.from("orbit_cours").delete().eq("uid", uid).gte("starts_at", new Date(now.getTime() - 2 * 864e5).toISOString());
      if (cr.length) await db.from("orbit_cours").upsert(cr, { onConflict: "id" });
      await db.from("orbit_cours").delete().eq("uid", uid).lt("starts_at", new Date(now.getTime() - 7 * 864e5).toISOString());
      cours = cr.length;
    } catch (e) {
      trace.push("emploi du temps : " + String((e as Error)?.message ?? e).slice(0, 120));
    }

    // Contenu des cours (cahier de textes) des 3 dernières semaines. Une panne ici ne bloque rien.
    let contenus = 0;
    try {
      const res = await pronote.resourcesFromIntervals(session, new Date(now.getTime() - 21 * 864e5), new Date(now.getTime() + 864e5));
      const CAT: Record<number, string> = { 1: "Cours", 2: "Correction", 3: "Devoir sur table", 4: "Interrogation orale", 5: "Travaux dirigés", 6: "Travaux pratiques", 7: "Évaluation de compétences", 8: "EPI", 9: "AP" };
      const list = [];
      for (const r of res as any[]) {
        const start = parisWall(new Date(r.startDate)), end = parisWall(new Date(r.endDate));
        const items = (r.contents ?? []).map((c: any) => ({
          title: clean(c.title ?? "").slice(0, 200), text: clean(c.description ?? "").slice(0, 2500),
          cat: c.categoryText || CAT[c.category] || "",
          files: (c.files ?? []).filter((f: any) => f?.url).slice(0, 6).map((f: any) => ({ name: String(f.name ?? "Fichier").slice(0, 120), url: String(f.url) })),
        })).filter((c: any) => c.title || c.text || c.files.length);
        if (!items.length) continue;
        list.push({ id: "c" + (await sha(`${r.subject?.name}|${start.toISOString()}`)).slice(0, 20), subject: r.subject?.name ?? null, start: start.toISOString(), end: end.toISOString(), teachers: (r.teachers ?? []).join(", "), items });
      }
      list.sort((a: any, b: any) => b.start.localeCompare(a.start));
      await db.from("orbit_kv").upsert({ key: KV("contenus"), value: list.slice(0, 80), updated_at: now.toISOString() });
      contenus = list.length;
    } catch (e) {
      trace.push("contenus : " + String((e as Error)?.message ?? e).slice(0, 120));
    }

    // Notes (période en cours). Une panne ici ne bloque rien.
    let notes = 0;
    try {
      const tab = session.userResource.tabs.get(pronote.TabLocation.Grades);
      const periods = tab?.periods ?? [];
      const period = periods.find((p: any) => new Date(p.startDate) <= now && now <= new Date(p.endDate) && /trim|sem/i.test(p.name)) ?? tab?.defaultPeriod ?? periods[0];
      if (period) {
        const ov: any = await pronote.gradesOverview(session, period);
        const val = (v: any) => !v ? null : v.kind === 0 ? Math.round(v.points * 100) / 100 : ({ 1: "Abs", 2: "Disp", 3: "NN", 4: "Inapte", 5: "Non rendu", 6: "Abs (0)", 7: "Non rendu (0)", 8: "Félicitations" } as any)[v.kind] ?? null;
        // Identifiant stable (Pronote change ses id à chaque session) : sinon chaque synchro « découvrirait » de nouvelles notes
        const gids = await Promise.all((ov.grades ?? []).map(async (g: any) => "n" + (await sha(`${g.subject?.name}|${new Date(g.date).toISOString().slice(0, 10)}|${g.value?.kind}:${g.value?.points}|${g.outOf?.points}|${g.comment ?? ""}|${g.coefficient}`)).slice(0, 24)));
        const grades = (ov.grades ?? []).map((g: any, i: number) => ({
          id: gids[i], subject: g.subject?.name ?? null, value: val(g.value), outOf: val(g.outOf) ?? 20, coef: g.coefficient ?? 1,
          date: parisDay(new Date(g.date)), comment: clean(g.comment ?? "").slice(0, 200), avg: val(g.average), max: val(g.max), min: val(g.min),
        })).sort((a: any, b: any) => b.date.localeCompare(a.date));
        const value = {
          v: 2, period: period.name, overall: val(ov.overallAverage), classOverall: val(ov.classAverage),
          subjects: (ov.subjectsAverages ?? []).map((a: any) => ({ name: a.subject?.name ?? "?", avg: val(a.student), classAvg: val(a.class_average), max: val(a.max), min: val(a.min), outOf: val(a.outOf) ?? 20 })),
          grades: grades.slice(0, 80),
        };
        const { data: prev } = await db.from("orbit_kv").select("value").eq("key", KV("notes")).maybeSingle();
        // Nouvelle note → message Discord (pas au tout premier chargement)
        if (prev?.value?.v === 2 && prev.value.grades) {
          const known = new Set(prev.value.grades.map((g: any) => g.id));
          const fresh = grades.filter((g: any) => !known.has(g.id)).slice(0, 5);
          if (fresh.length) await db.from("orbit_rappels").upsert(fresh.map((g: any) => ({
            id: P("n:" + g.id), uid, source: "notes", at: now.toISOString(),
            title: `📝 Nouvelle note · ${g.subject ?? "?"} : ${g.value}${typeof g.value === "number" ? "/" + g.outOf : ""}`,
            body: [g.comment, g.avg != null ? `Moyenne de la classe : ${g.avg}/${g.outOf}` : "", g.coef && g.coef !== 1 ? `Coef ${g.coef}` : ""].filter(Boolean).join("\n") || null,
          })), { onConflict: "id", ignoreDuplicates: true });
        }
        await db.from("orbit_kv").upsert({ key: KV("notes"), value, updated_at: now.toISOString() });
        notes = grades.length;
      }
    } catch (e) {
      trace.push("notes : " + String((e as Error)?.message ?? e).slice(0, 120));
    }

    await db.from("orbit_pronote").update({ last_sync: now.toISOString(), last_error: null, fail_count: 0 }).eq("id", uid);
    return json({ ok: true, mode, devoirs: rows.length, cours, notes, contenus, ...(trace.length ? { warn: trace.slice(-2) } : {}) });
  } catch (e) {
    let msg = (e as Error)?.name ? `${(e as Error).name}: ${(e as Error).message}` : String(e);
    if (trace.length) msg += " | trace " + trace.slice(-6).join(" || ");
    const fails = (row.fail_count ?? 0) + 1;
    await db.from("orbit_pronote").update({
      last_error: msg.slice(0, 3000), fail_count: fails,
      ...(mode === "setup" ? { pending_qr: null, pending_pin: null } : {}),
    }).eq("id", uid);

    // Alerte Discord : la synchro marchait et échoue 2 fois de suite (max 1 alerte / 12 h)
    const wasConnected = !!row.token && !/pas encore connecté/.test(msg);
    const lastAlert = row.last_alert ? new Date(row.last_alert).getTime() : 0;
    if (mode === "sync" && wasConnected && fails >= 2 && Date.now() - lastAlert > 12 * 3600e3) {
      const expired = /SessionExpired|Authenticate|BadCredentials|token|Identification/i.test(msg);
      await db.from("orbit_rappels").upsert({
        id: P("alert:pronote:" + new Date().toISOString().slice(0, 13)), uid, source: "orbit",
        title: expired ? "Pronote déconnecté : rescanne le QR code dans Orbit" : "La synchro Pronote ne marche plus",
        body: expired ? "Orbit → Devoirs → Pronote automatique → Reconnecter." : "Je réessaie toutes les 30 min. Si ça dure, préviens Claude avec le message d'erreur affiché dans Orbit.",
        at: new Date().toISOString(),
      }, { onConflict: "id" });
      await db.from("orbit_pronote").update({ last_alert: new Date().toISOString() }).eq("id", uid);
    }
    return json({ ok: false, mode, error: msg }, 200);
  }
});
