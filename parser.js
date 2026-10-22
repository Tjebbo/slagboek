// ---------- schema-lezer (Excel/CSV van de coach) ----------
const DAGEN = { ma: 0, maa: 0, maandag: 0, mon: 0, monday: 0, di: 1, din: 1, dinsdag: 1, tue: 1, tuesday: 1,
  wo: 2, woe: 2, woensdag: 2, wed: 2, wednesday: 2, do: 3, don: 3, donderdag: 3, thu: 3, thursday: 3,
  vr: 4, vrij: 4, vrijdag: 4, fri: 4, friday: 4, za: 5, zat: 5, zaterdag: 5, sat: 5, saturday: 5,
  zo: 6, zon: 6, zondag: 6, sun: 6, sunday: 6 };
const MAANDEN = { jan: 1, feb: 2, mrt: 3, maa: 3, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dec: 12 };
const LEEG = new Set(["", "-", "--", "nan", "none", "nvt", "x", "rust", "rustdag", "vrij", "off", "rest"]);
const SPORT_REGELS = [
  ["VirtualRow", /ergo|\bc2\b|concept ?2|roeimachine|\brp3\b|\bindoor/],
  ["WeightTraining", /kracht|\bgym\b|squat|deadlift|bench|\bcore\b|clean|\bpress\b|circuit|stabi/],
  ["Ride", /fiets|\bbike\b|wattbike|\bride\b|wielren|spinning|\bmtb\b|zwift/],
  ["Run", /hardlo|\blopen\b|\brun\b|\bjog/],
  ["Rowing", /roei|\bboot\b|skiff|\bwater\b|dubbel|\bacht\b|\bvier\b|\btwee\b|\brow/],
];
const SPORT_NL = { Rowing: "Roeien", VirtualRow: "Ergo", Ride: "Fietsen", WeightTraining: "Kracht", Run: "Hardlopen", Other: "Overig" };
const MOMENTEN = [["ochtend", /ochtend|morning|\bam\b|\bvroeg\b/], ["middag", /middag|afternoon|\blunch\b/], ["avond", /avond|evening|\bpm\b/]];
const MOMENT_ORDE = { ochtend: 0, middag: 1, avond: 2 };

function kiesJaar(dag, maand) {
  const nu = vandaag(), j = vanIso(nu).getFullYear();
  const opties = [j - 1, j, j + 1].map(y => geldig(y, maand, dag)).filter(Boolean);
  return opties.sort((a, b) => Math.abs(dagenTussen(nu, a)) - Math.abs(dagenTussen(nu, b)))[0] || null;
}
function alsDatum(cel) {
  if (cel == null) return null;
  if (typeof cel === "number") {
    if (cel > 40000 && cel < 60000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(cel) * 864e5); return geldig(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
    return null;
  }
  const s = String(cel).trim().toLowerCase();
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return geldig(+m[1], +m[2], +m[3]);
  m = s.match(/\b(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?\b/);
  if (m) {
    if (m[3]) return geldig(+m[3] + (m[3].length === 2 ? 2000 : 0), +m[2], +m[1]);
    return +m[2] >= 1 && +m[2] <= 12 ? kiesJaar(+m[1], +m[2]) : null;
  }
  m = s.match(/\b(\d{1,2})\s*([a-z]{3})[a-z]*\.?(?:\s+(\d{4}))?/);
  if (m && MAANDEN[m[2]]) return m[3] ? geldig(+m[3], MAANDEN[m[2]], +m[1]) : kiesJaar(+m[1], MAANDEN[m[2]]);
  return null;
}
function weekdag(cel) {
  if (typeof cel !== "string") return null;
  const w = cel.toLowerCase().match(/[a-z]+/g);
  return w && w[0] in DAGEN ? DAGEN[w[0]] : null;
}
function weekMaandag(cel) {
  if (typeof cel !== "string") return null;
  const m = cel.toLowerCase().match(/\bweek\s*(\d{1,2})\b/);
  if (!m) return null;
  const nu = vandaag(), j = vanIso(nu).getFullYear(), w = +m[1];
  const opties = [j - 1, j, j + 1].map(y => { const jan4 = iso(new Date(y, 0, 4)); const ma = plus(maandagVan(jan4), (w - 1) * 7); return isoWeek(ma) === w ? ma : null; }).filter(Boolean);
  return opties.sort((a, b) => Math.abs(dagenTussen(nu, a)) - Math.abs(dagenTussen(nu, b)))[0] || null;
}
function tekst(cel) {
  if (cel == null) return "";
  const s = String(cel).trim();
  return LEEG.has(s.toLowerCase().replace(/^[ .]+|[ .]+$/g, "")) ? "" : s;
}
function herkenSport(t) { t = t.toLowerCase(); for (const [s, r] of SPORT_REGELS) if (r.test(t)) return s; return "Rowing"; }
function herkenMoment(t) { t = (t || "").toLowerCase(); for (const [m, r] of MOMENTEN) if (r.test(t)) return m; return null; }
function schatMinuten(tx, sport) {
  let t = tx.toLowerCase().replace(/[’´]/g, "'").replace(/\b[rp]\s*\d+'(?:\d+"?)?/g, " ");
  let tot = 0;
  const uMin = /\b(\d)\s*[uh:]\s*(\d{2})\b/g;
  for (const m of t.matchAll(uMin)) tot += +m[1] * 60 + +m[2];
  t = t.replace(uMin, " ");
  const xMin = /(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:'|min\b|minuten)/g;
  for (const m of t.matchAll(xMin)) tot += +m[1] * parseFloat(m[2].replace(",", "."));
  t = t.replace(xMin, " ");
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:'|min\b|minuten)/g)) tot += parseFloat(m[1].replace(",", "."));
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:uur|hr|hours?)\b/g)) tot += parseFloat(m[1].replace(",", ".")) * 60;
  if (!tot) {
    let meters = 0;
    for (const m of t.matchAll(/(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(km|k|m)\b/g)) {
      const a = parseFloat(m[2].replace(",", "."));
      meters += (m[1] ? +m[1] : 1) * (m[3] === "m" ? a : a * 1000);
    }
    if (meters) tot = meters / 1000 / ({ Ride: 30, Run: 11 }[sport] || 15) * 60 * 1.4;
  }
  return tot ? Math.round(Math.min(Math.max(tot, 10), 300)) : null;
}
function maak(datum, tx, label, sportKol) {
  const sport = sportKol ? herkenSport(sportKol) : herkenSport(tx);
  const eerste = tx.split("\n")[0].trim();
  return { datum, tekst: tx, naam: eerste.length <= 60 ? eerste : eerste.slice(0, 57) + "...", sport,
    moment: herkenMoment(label) || herkenMoment(tx), minuten: schatMinuten(tx, sport) };
}
const roosterKoppen = rijen => rijen.map((r, i) => [i, r.filter(c => weekdag(c) != null).length]).filter(x => x[1] >= 3).map(x => x[0]);

function leesRooster(rijen, start) {
  const koppen = roosterKoppen(rijen), uit = [];
  koppen.forEach((k, n) => {
    const eind = koppen[n + 1] ?? rijen.length, kop = rijen[k], kol = {};
    kop.forEach((c, j) => { const w = weekdag(c); if (w != null) kol[j] = w; });
    let datums = {}, eerste = k + 1;
    for (const j in kol) { const d = alsDatum(kop[j]); if (d) datums[j] = d; }
    if (!Object.keys(datums).length && eerste < eind) {
      const onder = {};
      for (const j in kol) { const d = alsDatum(rijen[eerste][j]); if (d) onder[j] = d; }
      if (Object.keys(onder).length >= 2) { datums = onder; eerste++; }
    }
    let maandag = null;
    const dj = Object.keys(datums)[0];
    if (dj != null) maandag = plus(datums[dj], -kol[dj]);
    else {
      const vorige = n ? koppen[n - 1] + 1 : 0;
      for (let i = k - 1; i >= vorige && !maandag; i--)
        for (const c of rijen[i]) { const d = weekMaandag(c) || alsDatum(c); if (d) { maandag = maandagVan(d); break; } }
    }
    if (!maandag) {
      if (!start) throw new Error("Dit rooster heeft geen datums. Vul hieronder de maandag van de eerste week in en lees het bestand opnieuw.");
      maandag = plus(maandagVan(start), 7 * n);
    }
    for (const r of rijen.slice(eerste, eind)) {
      const label = r.filter((_, j) => !(j in kol)).map(tekst).join(" ");
      for (const j in kol) {
        const t = tekst(r[j]);
        if (!t || (alsDatum(r[j]) && t.length <= 10)) continue;
        uit.push(maak(datums[j] || plus(maandag, kol[j]), t, label));
      }
    }
  });
  return uit;
}
function leesLijst(rijen) {
  const past = (c, w) => typeof c === "string" && w.some(x => c.toLowerCase().includes(x));
  const DK = ["datum", "date"], TK = ["training", "workout", "omschrijving", "sessie", "programma", "inhoud", "beschrijving", "schema", "oefening"],
    SK = ["sport", "type", "soort"], MK = ["moment", "tijd", "dagdeel", "time"];
  let kopI = rijen.slice(0, 20).findIndex(r => r.some(c => past(c, DK) || String(c ?? "").trim().toLowerCase() === "dag") &&
    r.filter(c => typeof c === "string" && c.trim()).length >= 2);
  let datumJ, sportJ = null, momentJ = null, trainingJs, data;
  if (kopI >= 0) {
    const kop = rijen[kopI];
    datumJ = kop.findIndex(c => past(c, DK));
    if (datumJ < 0) datumJ = kop.findIndex(c => String(c ?? "").trim().toLowerCase() === "dag");
    sportJ = kop.findIndex((c, j) => past(c, SK) && j !== datumJ); if (sportJ < 0) sportJ = null;
    momentJ = kop.findIndex((c, j) => past(c, MK) && j !== datumJ); if (momentJ < 0) momentJ = null;
    trainingJs = kop.map((c, j) => j).filter(j => past(kop[j], TK) && ![datumJ, sportJ, momentJ].includes(j));
    if (!trainingJs.length) trainingJs = kop.map((c, j) => j).filter(j => ![datumJ, sportJ, momentJ].includes(j));
    data = rijen.slice(kopI + 1);
  } else {
    const breedte = Math.max(0, ...rijen.map(r => r.length));
    const tel = Array.from({ length: breedte }, (_, j) => rijen.filter(r => alsDatum(r[j])).length);
    if (!tel.length || Math.max(...tel) < 2) return [];
    datumJ = tel.indexOf(Math.max(...tel));
    trainingJs = tel.map((_, j) => j).filter(j => j !== datumJ);
    data = rijen;
  }
  const uit = []; let laatste = null;
  for (const r of data) {
    const cel = j => (j != null && j < r.length ? r[j] : null);
    const d = alsDatum(cel(datumJ)); if (d) laatste = d;
    const tx = trainingJs.map(j => tekst(cel(j))).filter(t => t && (weekdag(t) == null || t.length > 10)).join("\n");
    if (!tx || !laatste) continue;
    uit.push(maak(laatste, tx, tekst(cel(momentJ)), tekst(cel(sportJ))));
  }
  return uit;
}
function leesRijen(bladen, start) {
  let tr = [];
  for (const rijen of bladen) {
    if (!rijen.length) continue;
    tr = tr.concat(roosterKoppen(rijen).length ? leesRooster(rijen, start) : leesLijst(rijen));
  }
  tr.sort((a, b) => a.datum.localeCompare(b.datum) || (MOMENT_ORDE[a.moment] ?? 1) - (MOMENT_ORDE[b.moment] ?? 1));
  const tel = {};
  for (const t of tr) { tel[t.datum] = (tel[t.datum] || 0) + 1; t.nr = tel[t.datum]; t.id = `coach-${t.datum}-${t.nr}`; }
  return tr;
}

