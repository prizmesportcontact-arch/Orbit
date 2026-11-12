// Orbit — trajets en bus (Île-de-France Mobilités, plateforme PRIM).
// Itinéraires maison ↔ lycée (calculateur IDFM) + prochains passages en temps réel à l'arrêt de départ.
// Protégée par la clé d'accès de l'app (en-tête x-orbit-app). La clé PRIM est dans orbit_kv (prim_key).
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-orbit-app", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const PLACES: Record<string, { name: string; coord: string }> = {
  ponthevrard: { name: "Ponthévrard", coord: "1.911998;48.553743" },
  starnoult: { name: "Saint-Arnoult", coord: "1.940435;48.574109" },
  lycee: { name: "Lycée Louis Bascan", coord: "1.821368;48.638575" },
};
const BASE = "https://prim.iledefrance-mobilites.fr/marketplace";

let primKey = "";
async function prim(path: string) {
  if (!primKey) {
    const { data } = await db.from("orbit_kv").select("value").eq("key", "prim_key").maybeSingle();
    primKey = String(data?.value ?? "");
  }
  const r = await fetch(BASE + path, { headers: { apikey: primKey, Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  const t = await r.text();
  let j: any = null; try { j = JSON.parse(t); } catch { /* */ }
  if (!r.ok) throw new Error(`PRIM ${r.status} ${(j?.error?.message ?? j?.message ?? t).toString().slice(0, 160)}`);
  return j;
}

// "20261113T074500" -> ISO avec fuseau Paris
const nav2iso = (s: string) => {
  if (!s) return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}`;
  // décalage Paris à cette date
  const d = new Date(iso + "Z");
  const paris = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const off = Math.round((paris.getTime() - utc.getTime()) / 60000), sg = off >= 0 ? "+" : "-", a = Math.abs(off);
  return `${iso}${sg}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
};
const placeName = (p: any) => p?.stop_point?.name ?? p?.name?.replace(/\s*\(.*\)$/, "") ?? "";

function simplify(j: any) {
  return {
    dep: nav2iso(j.departure_date_time), arr: nav2iso(j.arrival_date_time), duration: j.duration, transfers: j.nb_transfers ?? 0,
    status: j.status || "",
    sections: (j.sections ?? []).filter((s: any) => s.type !== "waiting" || s.duration > 60).map((s: any) => {
      const di = s.display_informations;
      const out: any = { type: s.type === "public_transport" ? "pt" : s.type === "street_network" || s.type === "transfer" ? "walk" : s.type, dep: nav2iso(s.departure_date_time), arr: nav2iso(s.arrival_date_time), duration: s.duration, from: placeName(s.from), to: placeName(s.to) };
      if (s.mode && out.type === "walk") out.mode = s.mode;
      if (di) {
        out.line = { code: di.code || di.label || "", color: di.color ? "#" + di.color : null, text: di.text_color ? "#" + di.text_color : null, mode: di.commercial_mode || di.physical_mode || "", direction: (di.direction || "").replace(/\s*\(.*\)$/, ""), network: di.network || "" };
        out.stopId = s.from?.stop_point?.id ?? null;
        out.lineId = (s.links ?? []).find((l: any) => l.type === "line")?.id ?? null;
        out.realtime = s.data_freshness === "realtime";
        out.disrupted = !!(s.display_informations?.links?.length);
      }
      return out;
    }),
  };
}

async function journeys(b: any) {
  const from = PLACES[b.from], to = PLACES[b.to];
  if (!from || !to) return { ok: false, error: "Lieu inconnu" };
  const dt = String(b.datetime ?? "").replace(/[^0-9T]/g, "").slice(0, 15);
  const q = new URLSearchParams({ from: from.coord, to: to.coord, count: String(Math.min(5, b.count ?? 3)), datetime_represents: b.represents === "arrival" ? "arrival" : "departure", data_freshness: "realtime", max_walking_duration_to_pt: "1500", min_nb_journeys: "2" });
  if (dt) q.set("datetime", dt);
  const j = await prim("/v2/navitia/journeys?" + q.toString());
  const list = (j?.journeys ?? []).filter((x: any) => (x.sections ?? []).some((s: any) => s.type === "public_transport")).map(simplify);
  list.sort((a: any, c: any) => String(a.dep).localeCompare(String(c.dep)));
  const disruptions = (j?.disruptions ?? []).slice(0, 4).map((d: any) => ({ cause: d.cause, severity: d.severity?.name, text: (d.messages?.[0]?.text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400) }));
  return { ok: true, from: from.name, to: to.name, journeys: list, disruptions, error: list.length ? undefined : (j?.error?.message ?? null) };
}

// Prochains passages en temps réel (SIRI stop-monitoring) à l'arrêt de départ, filtré sur la ligne
async function next(b: any) {
  const sp = String(b.stopId ?? "").match(/IDFM:(?:monomodalStopPlace:)?(\d+)/)?.[1];
  if (!sp) return { ok: false, error: "Arrêt inconnu" };
  const ln = String(b.lineId ?? "").match(/IDFM:(C\d+)/)?.[1];
  const q = new URLSearchParams({ MonitoringRef: `STIF:StopPoint:Q:${sp}:` });
  if (ln) q.set("LineRef", `STIF:Line::${ln}:`);
  const j = await prim("/stop-monitoring?" + q.toString());
  const visits = j?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit ?? [];
  const passes = visits.map((v: any) => {
    const mj = v.MonitoredVehicleJourney, c = mj?.MonitoredCall ?? {};
    return { line: mj?.LineRef?.value ?? "", dest: mj?.DestinationName?.[0]?.value ?? c?.DestinationDisplay?.[0]?.value ?? "", expected: c.ExpectedDepartureTime ?? c.ExpectedArrivalTime ?? null, aimed: c.AimedDepartureTime ?? c.AimedArrivalTime ?? null, status: c.DepartureStatus ?? c.ArrivalStatus ?? "" };
  }).filter((p: any) => p.expected || p.aimed).sort((a: any, c: any) => String(a.expected ?? a.aimed).localeCompare(String(c.expected ?? c.aimed))).slice(0, 6);
  return { ok: true, passes };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const appKey = req.headers.get("x-orbit-app");
  if (!appKey) return json({ error: "Code d'accès incorrect" }, 401);
  const { data: me } = await db.from("orbit_pronote").select("id").eq("app_key", appKey).maybeSingle();
  if (!me) return json({ error: "Code d'accès incorrect" }, 401);
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "journeys") return json(await journeys(b));
    if (b.action === "next") return json(await next(b));
    if (b.action === "places") return json({ ok: true, places: Object.fromEntries(Object.entries(PLACES).map(([k, v]) => [k, v.name])) });
    return json({ error: "action inconnue" }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e).slice(0, 300) }, 200);
  }
});
