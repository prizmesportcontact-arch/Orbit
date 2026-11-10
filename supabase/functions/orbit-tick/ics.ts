// Lecture d'un agenda iCal (Google Agenda), avec répétitions. Copie partagée avec orbit-api.
function tzOffsetMs(tz: string, utc: number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(utc)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - utc;
}
export function zoned(y: number, mo: number, d: number, h: number, mi: number, tz: string) {
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

export function parseICS(text: string, from: Date, to: Date) {
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
