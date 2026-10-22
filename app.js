// ---------- grafieken (eigen SVG, met hover) ----------
const GRAFIEKEN = new Map();
function nette(min, max, n = 4) {
  if (min === max) { min -= 1; max += 1; }
  const ruw = (max - min) / n, mag = 10 ** Math.floor(Math.log10(ruw));
  const stap = [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => x >= ruw);
  const lo = Math.floor(min / stap) * stap, hi = Math.ceil(max / stap) * stap;
  const ticks = []; for (let v = lo; v <= hi + stap / 2; v += stap) ticks.push(+v.toFixed(6));
  return { lo, hi, ticks };
}
function grafiek(cfg) {
  const { id, dagen, reeksen, band, fmt = v => String(Math.round(v)), vanaf0 = false } = cfg;
  // Tekenen op de echte breedte, zodat aslabels op telefoon en laptop even groot zijn.
  const breedte = document.querySelector("main")?.clientWidth || 360;
  const W = Math.max(280, Math.min(680, breedte) - 66), H = 170, L = 34, R = 8, T = 10, B = 22, pw = W - L - R, ph = H - T - B, n = dagen.length;
  const alle = reeksen.flatMap(r => r.waarden).concat(band ? band.lo.concat(band.hi) : []).filter(v => v != null);
  if (!alle.length) return `<div class="card grafiek"><div class="titel"><b>${esc(cfg.titel)}</b></div><p class="muted small" style="margin:8px 0 0">Nog geen data voor deze periode.</p></div>`;
  let mn = Math.min(...alle), mx = Math.max(...alle);
  if (vanaf0 || reeksen.some(r => r.type === "staaf")) mn = Math.min(0, mn);
  else { const marge = (mx - mn) * .12 || 1; mn -= marge; mx += marge; }
  const { lo, hi, ticks } = nette(mn, mx);
  const x = i => L + (n === 1 ? pw / 2 : (i + .5) * pw / n), y = v => T + ph - (v - lo) / (hi - lo) * ph;
  let svg = ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${y(t) + 3}" text-anchor="end">${esc(fmt(t))}</text>`).join("");
  const labels = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  svg += labels.map(i => `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${esc(kort(dagen[i]))}</text>`).join("");
  if (band) {
    let pad = "";
    const seg = [];
    band.lo.forEach((v, i) => { if (v != null && band.hi[i] != null) seg.push(i); });
    if (seg.length) {
      pad = seg.map((i, k) => `${k ? "L" : "M"}${x(i)},${y(band.hi[i])}`).join("") + seg.slice().reverse().map(i => `L${x(i)},${y(band.lo[i])}`).join("") + "Z";
      svg += `<path d="${pad}" fill="var(--band)" stroke="none"/>`;
    }
  }
  for (const r of reeksen) {
    if (r.type === "staaf") {
      const bw = Math.max(2, pw / n - 2);
      svg += r.waarden.map((v, i) => v ? `<rect x="${x(i) - bw / 2}" y="${y(v)}" width="${bw}" height="${Math.max(0, y(lo > 0 ? lo : 0) - y(v))}" rx="${Math.min(2, bw / 2)}" fill="${r.kleur}"/>` : "").join("");
    } else {
      let d = "", pen = false;
      r.waarden.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i)},${y(v)}`; pen = true; });
      svg += `<path d="${d}" fill="none" stroke="${r.kleur}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${r.stippel ? ' stroke-dasharray="5 4"' : ""}/>`;
      const laatste = r.waarden.map((v, i) => [v, i]).filter(([v]) => v != null).pop();
      if (laatste && !r.stippel) svg += `<circle cx="${x(laatste[1])}" cy="${y(laatste[0])}" r="4" fill="${r.kleur}" stroke="var(--surface)" stroke-width="2"/>`;
    }
  }
  svg += `<line class="kruis" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="var(--muted)" stroke-width="1" visibility="hidden"/>`;
  svg += `<rect class="vang" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/>`;
  GRAFIEKEN.set(id, { cfg, x, n, L, pw, W });
  const legenda = reeksen.length > 1 ? `<div class="legenda">${reeksen.map(r => `<span><i style="border-color:${r.kleur};${r.stippel ? "border-top-style:dashed" : ""}"></i>${esc(r.naam)}</span>`).join("")}${band ? `<span><i style="border-top:8px solid var(--band)"></i>${esc(band.naam)}</span>` : ""}</div>`
    : band ? `<div class="legenda"><span><i style="border-top:8px solid var(--band)"></i>${esc(band.naam)}</span></div>` : "";
  return `<div class="card grafiek" id="${id}"><div class="titel"><b>${esc(cfg.titel)}</b><span class="nu">${esc(cfg.nu || "")}</span></div>
    ${cfg.uitleg ? `<div class="small muted">${esc(cfg.uitleg)}</div>` : ""}${legenda}
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.titel)}">${svg}</svg><div class="tooltip" hidden></div></div>`;
}
document.addEventListener("pointermove", e => {
  const vang = e.target.closest && e.target.closest("rect.vang");
  document.querySelectorAll(".grafiek .tooltip:not([hidden])").forEach(t => { if (!vang || !t.parentElement.contains(vang)) { t.hidden = true; t.parentElement.querySelector(".kruis").setAttribute("visibility", "hidden"); } });
  if (!vang) return;
  const kaart = vang.closest(".grafiek"), g = GRAFIEKEN.get(kaart.id);
  if (!g) return;
  const svg = vang.ownerSVGElement, box = svg.getBoundingClientRect(), schaal = g.W / box.width;
  const sx = (e.clientX - box.left) * schaal;
  const i = Math.max(0, Math.min(g.n - 1, Math.floor((sx - g.L) / (g.pw / g.n))));
  const { cfg } = g;
  const regels = cfg.reeksen.map(r => r.waarden[i] != null ? `${r.naam}: ${(r.tip || cfg.fmt || (v => Math.round(v)))(r.waarden[i])}` : null).filter(Boolean);
  if (cfg.band && cfg.band.lo[i] != null) regels.push(`${cfg.band.naam}: ${Math.round(cfg.band.lo[i])}–${Math.round(cfg.band.hi[i])}`);
  const tip = kaart.querySelector(".tooltip"), kruis = kaart.querySelector(".kruis");
  kruis.setAttribute("x1", g.x(i)); kruis.setAttribute("x2", g.x(i)); kruis.setAttribute("visibility", "visible");
  tip.innerHTML = `${esc(mooi(cfg.dagen[i]))}<br>${regels.length ? regels.map(esc).join("<br>") : "geen data"}`;
  tip.hidden = false;
  const kb = kaart.getBoundingClientRect(), px = g.x(i) / schaal + box.left - kb.left;
  tip.style.left = Math.max(70, Math.min(kb.width - 70, px)) + "px";
  tip.style.top = (box.top - kb.top + 8) + "px";
});

// ---------- weergave ----------
const SPORT_NL_ALLES = { ...SPORT_NL };
const IMPACT = f => f.impact === 0 ? ["goed", "goed"] : f.impact >= -8 ? ["let", "let op"] : ["slecht", "slecht"];
const trainingenOp = dag => Object.entries(S.data.trainingen).filter(([, t]) => t.datum === dag)
  .sort((a, b) => (MOMENT_ORDE[a[1].moment] ?? 1) - (MOMENT_ORDE[b[1].moment] ?? 1) || (a[1].nr || 0) - (b[1].nr || 0));
const extraOp = dag => (S.data.extra || []).filter(a => a.datum === dag);

function sessieHtml(t, opties = {}) {
  const a = t.advies || {}, g = t.gedaan;
  const kop = `<div class="kop"><span class="chip">${esc(SPORT_NL_ALLES[t.sport] || t.sport)}</span>
    ${a.zone ? `<span class="chip zone">${esc(a.zone)}</span>` : ""}
    ${t.moment ? `<span class="small muted">${esc(t.moment)}</span>` : ""}
    ${t.minuten && !g ? `<span class="small muted mono">~${t.minuten}′</span>` : ""}
    ${t.voorbeeld ? `<span class="chip vb">voorbeeld</span>` : ""}
    ${g ? `<span class="chip gedaan">gedaan</span>` : ""}</div>`;
  const tekstBlok = t.tekst && t.tekst.trim() !== t.naam ? `<div class="tekst">${esc(t.tekst)}</div>` : "";
  const feit = g ? `<div class="feit">${[g.tijd, g.min && minTekst(g.min), g.km && g.km + " km", g.hr && "gem " + Math.round(g.hr) + " bpm", g.hrMax && "max " + Math.round(g.hrMax), g.load && "load " + g.load].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join("")}</div>` : "";
  const tip = opties.tip !== false && a.tip ? `<div class="tip">${esc(a.tip)}</div>` : "";
  return `<div class="sessie">${kop}<div class="naam">${esc(t.naam)}</div>${tekstBlok}${feit}${tip}</div>`;
}
function extraHtml(a) {
  return `<div class="sessie"><div class="kop"><span class="chip">${esc(SPORT_NL_ALLES[a.sport] || a.sport)}</span><span class="small muted">niet in schema</span></div>
    <div class="naam">${esc(a.naam || "Activiteit")}</div>
    <div class="feit">${[a.tijd, minTekst(a.min), a.km && a.km + " km", a.hr && "gem " + Math.round(a.hr) + " bpm", "load " + a.load].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join("")}</div></div>`;
}

function renderVandaag() {
  const D = S.data, dag = D.vandaag, a = D.advies, ci = (D.checkins || {})[dag];
  const sessies = trainingenOp(dag), extra = extraOp(dag), morgen = trainingenOp(plus(dag, 1));
  const verouderd = dag !== vandaag();
  const status = a ? `<div class="status ${a.niveau}">
      <div class="boven"><div class="label">${esc(a.kop)}</div><div class="score">${a.score}<small>/ 100${a.garminReadiness ? ` · readiness ${a.garminReadiness}` : ""}</small></div></div>
      <p>${esc(a.uitleg)}</p>
      <div class="factoren">${a.factoren.map(f => { const [k, t] = IMPACT(f); return `<div class="factor"><span>${esc(f.naam)}${f.uitleg ? ` <span class="muted small">· ${esc(f.uitleg)}</span>` : ""}</span><span class="i ${k}">${t}</span><span class="w">${esc(f.waarde)}</span></div>`; }).join("")}</div>
    </div>` : `<div class="status"><div class="label">Nog geen data van vannacht</div><p>Open de Garmin Connect-app zodat je horloge synct; intervals.icu krijgt het dan vanzelf. Slagboek haalt elk uur nieuwe data op.</p></div>`;
  const schaal = (naam, waarde, links, rechts, titel) => `<div class="veld"><span class="lbl" id="l-${naam}">${titel}</span>
    <div class="schaal" role="radiogroup" aria-labelledby="l-${naam}">${[1, 2, 3, 4, 5].map(n => `<label class="pick"><input type="radio" name="${naam}" id="${naam}-${n}" value="${n}"${waarde === n ? " checked" : ""}>${n}</label>`).join("")}</div>
    <div class="schaal-uitleg"><span>${links}</span><span>${rechts}</span></div></div>`;
  const checkin = `<div class="stack"><h2>Hoe voel je je?</h2><form class="checkin card" id="checkin">
      ${schaal("gevoel", ci?.gevoel, "slecht", "top", "Gevoel")}${schaal("spierpijn", ci?.spierpijn, "geen", "veel", "Spierpijn")}
      <div class="row"><button class="btn primary" type="submit"${S.bezig ? " disabled" : ""}>${ci ? "Bijwerken" : "Opslaan"}</button>
      <span class="small muted">Slaap, HRV en rusthartslag komen van je Garmin. Dit voegt toe wat je horloge niet meet.</span></div>
    </form></div>`;
  const z = D.zones || {};
  const zones = Object.keys(z).length ? `<div class="stack"><h2>Jouw hartslagzones</h2><div class="card stack">
      <div class="zones">${Object.entries(z).map(([k, [lo, hi]]) => `<div class="zone"><b>${k}</b><span>${lo}–${hi}</span><small>${esc({ UT2: "rustige duur", UT1: "stevige duur", AT: "drempel", TR: "wedstrijd", AN: "sprint" }[k])}</small></div>`).join("")}</div>
      <span class="small muted">Op basis van max ${D.maxHr} bpm (${esc(D.maxHrBron)}).</span></div></div>` : "";
  return `${verouderd ? `<div class="melding info">Deze data is van ${esc(mooi(dag))}. De volgende update komt binnen een uur.</div>` : ""}
    ${status}
    <div class="stack"><h2>Vandaag · ${esc(mooi(dag))}</h2><div class="card">
      ${sessies.length || extra.length ? sessies.map(([, t]) => sessieHtml(t)).join("") + extra.map(extraHtml).join("")
        : Object.keys(D.trainingen).length ? `<span class="muted">Geen training gepland. Herstel goed.</span>`
        : `<div class="stack"><span>Nog geen schema. Zet het Excel-bestand van je coach erin.</span><div><button class="btn primary" data-tab="schema">Schema toevoegen</button></div></div>`}
    </div></div>
    ${checkin}
    <div class="stack"><h2>Morgen · ${esc(mooi(plus(dag, 1)))}</h2><div class="card">
      ${morgen.length ? morgen.map(([, t]) => sessieHtml(t, { tip: false })).join("") : `<span class="muted">Rustdag.</span>`}
      ${morgen.some(([, t]) => t.moment === "ochtend") ? `<div class="tip" style="margin-top:12px">Morgen een ochtendtraining: op tijd naar bed, dan telt je slaap mee in je score.</div>` : ""}
    </div></div>
    ${zones}
    <p class="small muted" style="margin:0">Laatste Garmin-meting: ${D.laatsteMeting ? esc(mooi(D.laatsteMeting)) : "–"} · bijgewerkt ${esc(D.gegenereerd.slice(11, 16))}${D.gegenereerd.slice(0, 10) !== vandaag() ? " op " + esc(mooi(D.gegenereerd.slice(0, 10))) : ""}. Het schema van je coach blijft leidend; Slagboek zegt hoe je het invult.</p>`;
}

function renderWeek() {
  const ma = S.weekStart, dag = vandaag(), D = S.data;
  const scores = Object.fromEntries(D.dagen.map(r => [r.d, r.score]));
  let gepland = 0, gedaan = 0;
  const kleur = s => s == null ? "" : s >= 75 ? "groen" : s >= 55 ? "geel" : "rood";
  const rijen = Array.from({ length: 7 }, (_, i) => {
    const d = plus(ma, i), s = trainingenOp(d), e = extraOp(d), sc = scores[d];
    s.forEach(([, t]) => { gepland += t.minuten || 0; if (t.gedaan) gedaan += t.gedaan.min || 0; });
    e.forEach(a => gedaan += a.min || 0);
    return `<div class="dag${d === dag ? " vandaag" : ""}"><div class="wd">${DAG_KORT[i]}<small>${vanIso(d).getDate()} ${MAAND_KORT[vanIso(d).getMonth()]}</small>
        ${sc != null ? `<span class="sc i ${kleur(sc) === "groen" ? "goed" : kleur(sc) === "geel" ? "let" : "slecht"}" title="dagscore">${sc}</span>` : ""}</div>
      <div>${s.length || e.length ? s.map(([, t]) => sessieHtml(t, { tip: d === D.vandaag })).join("") + e.map(extraHtml).join("") : `<span class="leeg">–</span>`}</div></div>`;
  }).join("");
  return `<div class="weeknav"><button class="btn" data-actie="week" data-d="-7" aria-label="Vorige week">‹</button>
      <div style="text-align:center"><strong>Week ${isoWeek(ma)}</strong><div class="small muted mono">${esc(mooi(ma))} – ${esc(mooi(plus(ma, 6)))}</div></div>
      <button class="btn" data-actie="week" data-d="7" aria-label="Volgende week">›</button></div>
    ${ma !== maandagVan(dag) ? `<div style="text-align:center"><button class="btn link" data-actie="week" data-d="0">Naar deze week</button></div>` : ""}
    <div class="card">${rijen}</div>
    <div class="small muted" style="text-align:center">Gepland <span class="mono">${minTekst(gepland)}</span> · gedaan volgens Garmin <span class="mono">${minTekst(gedaan)}</span></div>`;
}

function renderTrends() {
  const D = S.data, reeks = D.dagen.slice(-S.bereik), dagen = reeks.map(r => r.d), kol = k => reeks.map(r => r[k] ?? null);
  const laatste = k => { const r = [...reeks].reverse().find(r => r[k] != null); return r ? r[k] : null; };
  const gem = k => { const w = kol(k).filter(v => v != null); return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null; };
  const kies = `<div class="row" style="justify-content:space-between"><h2>Trends</h2><div class="seg" role="group" aria-label="Periode">
    ${[30, 90].map(n => `<button data-actie="bereik" data-n="${n}" aria-pressed="${S.bereik === n}">${n} dagen</button>`).join("")}</div></div>`;
  const ratio = laatste("ratio");
  const weken = D.weken.slice(S.bereik === 30 ? -5 : -12);
  const sporten = [...new Set(weken.flatMap(w => Object.keys(w.min)))];
  return kies + [
    grafiek({ id: "g-score", titel: "Dagscore", nu: laatste("score") != null ? `vandaag ${laatste("score")}` : "", dagen,
      reeksen: [{ naam: "Dagscore", waarden: kol("score"), kleur: "var(--accent)" }], uitleg: "75+ klaar om te knallen · 55–74 doen wat er staat · onder 55 rustig aan" }),
    grafiek({ id: "g-hrv", titel: "HRV (nacht)", nu: laatste("hrv") != null ? `${laatste("hrv")} ms` : "", dagen, fmt: v => Math.round(v),
      reeksen: [{ naam: "HRV", waarden: kol("hrv"), kleur: "var(--accent)", tip: v => `${Math.round(v)} ms` }],
      band: { naam: "je normale bereik (28 dagen)", lo: kol("hrvLaag"), hi: kol("hrvHoog") } }),
    grafiek({ id: "g-slaap", titel: "Slaap", nu: gem("slaapU") != null ? `gem ${uurMin(gem("slaapU"))}` : "", dagen, fmt: v => v + "u",
      reeksen: [{ naam: "Slaap", waarden: kol("slaapU"), kleur: "var(--accent)", type: "staaf", tip: uurMin }] }),
    grafiek({ id: "g-rhr", titel: "Rusthartslag", nu: laatste("rhr") != null ? `${laatste("rhr")} bpm` : "", dagen,
      reeksen: [{ naam: "Rusthartslag", waarden: kol("rhr"), kleur: "var(--accent)", tip: v => `${Math.round(v)} bpm` }] }),
    grafiek({ id: "g-load", titel: "Belasting", nu: ratio != null ? `×${ratio.toFixed(2)} t.o.v. gewend` : "", dagen, vanaf0: true,
      uitleg: "Trainingsload van de laatste 7 dagen, naast wat je gemiddeld per week deed in de 4 weken ervoor. Tussen ×0,8 en ×1,3 bouw je netjes op.",
      reeksen: [{ naam: "Afgelopen 7 dagen", waarden: kol("acuut"), kleur: "var(--accent)" }, { naam: "Gewend (4 weken)", waarden: kol("chronisch"), kleur: "var(--muted)", stippel: true }] }),
    kol("bb").some(v => v != null) ? grafiek({ id: "g-bb", titel: "Body Battery bij opstaan", nu: laatste("bb") != null ? String(laatste("bb")) : "", dagen,
      reeksen: [{ naam: "Body Battery", waarden: kol("bb"), kleur: "var(--accent)" }] }) : "",
    `<div class="card stack"><b>Trainingsuren per week</b><div class="tabel"><table><thead><tr><th>Week</th>${sporten.map(s => `<th>${esc(SPORT_NL_ALLES[s] || s)}</th>`).join("")}<th>Totaal</th></tr></thead><tbody>
      ${weken.slice().reverse().map(w => { const tot = Object.values(w.min).reduce((a, b) => a + b, 0); return `<tr><td class="num">wk ${w.week}</td>${sporten.map(s => `<td class="num">${w.min[s] ? minTekst(w.min[s]) : "–"}</td>`).join("")}<td class="num"><b>${tot ? minTekst(tot) : "–"}</b></td></tr>`; }).join("")}
    </tbody></table></div></div>`,
  ].join("");
}

function renderSchema() {
  const pv = S.preview, D = S.data, nu = vandaag();
  const komend = Object.values(D.trainingen).filter(t => t.datum >= nu).length;
  const voorbeelden = Object.values(D.trainingen).filter(t => t.voorbeeld).length;
  const heeftToken = !!opslag.lees("slagboek-gh");
  const melding = S.melding ? `<div class="melding ${S.melding.soort}">${esc(S.melding.tekst)}</div>` : "";
  const tabel = pv ? `<div class="stack"><h2>${pv.lijst.length} trainingen gevonden${pv.voorbeeld ? " · voorbeeld" : ""}</h2>
      <p class="small muted" style="margin:0">Check of het klopt. De sport kun je per regel aanpassen.</p>
      <div class="card tabel" style="padding:0"><table><thead><tr><th>Dag</th><th>Sport</th><th>Training</th><th>Min</th></tr></thead><tbody>
      ${pv.lijst.map((t, i) => `<tr><td class="num">${esc(mooi(t.datum))}${t.moment ? `<div class="muted small">${esc(t.moment)}</div>` : ""}</td>
        <td><select data-pv="${i}" aria-label="Sport">${Object.entries(SPORT_NL_ALLES).map(([k, v]) => `<option value="${k}"${k === t.sport ? " selected" : ""}>${v}</option>`).join("")}</select></td>
        <td>${esc(t.tekst)}</td><td class="num">${t.minuten ? "~" + t.minuten : "–"}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="row"><button class="btn primary" data-actie="opslaan"${S.bezig ? " disabled" : ""}>${S.bezig ? "Bezig met opslaan…" : "Opslaan"}</button><button class="btn" data-actie="annuleer">Annuleren</button></div></div>` : "";
  return `${heeftToken ? "" : `<div class="melding info">Om je schema op te slaan heeft Slagboek eenmalig een GitHub-token nodig. Zie Instellingen onderaan.</div>`}
    <label class="drop" id="drop" for="bestand">
      <strong>Schema van je coach</strong>
      <span class="muted">Sleep het Excel- of CSV-bestand hierheen, of tik om te kiezen.</span>
      <span class="btn">Bestand kiezen</span>
      <input type="file" id="bestand" accept=".xlsx,.xlsm,.xls,.csv" hidden>
    </label>
    <div class="row">
      <div class="veld" style="max-width:270px"><label for="startdatum">Maandag van week 1 (alleen als het rooster geen datums heeft)</label><input type="date" id="startdatum" value="${esc(S.start || "")}"></div>
      <label class="check"><input type="checkbox" id="verleden"${S.verleden ? " checked" : ""}> Ook trainingen van vóór vandaag</label>
    </div>
    ${melding}${tabel}
    <div class="card stack small">
      <div>Na opslaan rekent Slagboek alles opnieuw door met je Garmin-data. Dat duurt 1 à 2 minuten.</div>
      <div>Een nieuwe versie van hetzelfde schema werkt bestaande trainingen bij. Sessies die je coach heeft geschrapt, verdwijnen.</div>
      <div class="row muted"><span>${komend} trainingen gepland vanaf vandaag.</span>
        ${!pv ? `<button class="btn link" data-actie="voorbeeld">Probeer met een voorbeeldschema</button>` : ""}
        ${voorbeelden ? `<button class="btn link" data-actie="wis-voorbeelden"${S.bezig ? " disabled" : ""}>Voorbeeldtrainingen wissen (${voorbeelden})</button>` : ""}</div>
    </div>
    <div class="stack"><h2>Instellingen</h2><form class="card stack" id="instellingen">
      <div class="veld"><label for="gh-repo">GitHub-repository</label><input id="gh-repo" value="${esc(repo())}" placeholder="gebruikersnaam/slagboek"></div>
      <div class="veld"><label for="gh-token">GitHub-token${heeftToken ? " (ingesteld)" : ""}</label><input id="gh-token" type="password" autocomplete="off" placeholder="${heeftToken ? "•••••••• laat leeg om te houden" : "github_pat_…"}"></div>
      <div class="row"><button class="btn" type="submit">Bewaren op dit apparaat</button><button class="btn link" type="button" data-actie="vergrendel">Vergrendelen en sleutel vergeten</button></div>
      <span class="small muted">Fine-grained token met alleen deze repository en 'Contents: read and write'. Hij blijft op dit apparaat.</span>
    </form></div>`;
}

function render() {
  if (!S.data) return;
  const d = vandaag();
  document.getElementById("kopdatum").textContent = `${mooi(d)} · wk ${isoWeek(d)}`;
  document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === S.tab)));
  for (const t of TABS) document.getElementById("tab-" + t).hidden = t !== S.tab;
  const g = document.getElementById("globaal");
  g.hidden = !S.wachtOp && !S.fout;
  g.className = "melding " + (S.fout ? "fout" : "info");
  g.textContent = S.fout || "Opgeslagen. Slagboek rekent alles opnieuw door; deze pagina ververst vanzelf zodra het klaar is (1–2 minuten).";
  const el = document.getElementById("tab-" + S.tab);
  el.innerHTML = { vandaag: renderVandaag, week: renderWeek, trends: renderTrends, schema: renderSchema }[S.tab]();
}

// ---------- acties ----------
function kiesTab(tab) { S.tab = tab; opslag.zet("slagboek-tab", tab); render(); window.scrollTo(0, 0); }
document.addEventListener("click", async e => {
  const t = e.target.closest("[data-tab],[data-actie]");
  if (!t || !S.data) return;
  S.fout = null;
  if (t.dataset.tab) return kiesTab(t.dataset.tab);
  const a = t.dataset.actie;
  if (a === "week") { S.weekStart = +t.dataset.d === 0 ? maandagVan(vandaag()) : plus(S.weekStart, +t.dataset.d); render(); }
  else if (a === "bereik") { S.bereik = +t.dataset.n; render(); }
  else if (a === "voorbeeld") laadVoorbeeld();
  else if (a === "annuleer") { S.preview = null; S.melding = null; render(); }
  else if (a === "opslaan") opslaan();
  else if (a === "wis-voorbeelden") {
    S.bezig = true; render();
    try {
      await wijzigInvoer("schema.enc", { trainingen: {} }, d => { for (const [k, v] of Object.entries(d.trainingen)) if (v.voorbeeld) delete d.trainingen[k]; }, "Voorbeeldtrainingen gewist");
      S.melding = { soort: "ok", tekst: "Voorbeeldtrainingen gewist." }; wachtOpNieuweData();
    } catch (err) { S.melding = { soort: "fout", tekst: foutTekst(err) }; }
    S.bezig = false; render();
  } else if (a === "vergrendel") { opslag.zet("slagboek-sleutel", null); location.reload(); }
});
document.addEventListener("submit", async e => {
  if (e.target.id === "checkin") {
    e.preventDefault();
    const f = new FormData(e.target), gevoel = +f.get("gevoel") || null, spierpijn = +f.get("spierpijn") || null;
    if (!gevoel && !spierpijn) return;
    const dag = vandaag();
    S.bezig = true; render();
    try {
      await wijzigInvoer("checkins.enc", { checkins: {} }, d => { d.checkins[dag] = { ...(gevoel && { gevoel }), ...(spierpijn && { spierpijn }) }; }, `Check-in ${dag}`);
      S.data.checkins = { ...(S.data.checkins || {}), [dag]: { gevoel, spierpijn } };
      wachtOpNieuweData();
      S.bezig = false; render();
    } catch (err) { S.bezig = false; S.fout = foutTekst(err); render(); }
  } else if (e.target.id === "instellingen") {
    e.preventDefault();
    const r = document.getElementById("gh-repo").value.trim(), tk = document.getElementById("gh-token").value.trim();
    opslag.zet("slagboek-repo", r || null);
    if (tk) opslag.zet("slagboek-gh", tk);
    S.melding = { soort: "ok", tekst: "Instellingen bewaard op dit apparaat." }; render();
  }
});
document.addEventListener("change", e => {
  const el = e.target;
  if (el.id === "bestand" && el.files[0]) leesBestand(el.files[0]);
  else if (el.id === "startdatum") { S.start = el.value || null; if (S.laatsteBestand) verwerk(S.laatsteBestand); }
  else if (el.id === "verleden") { S.verleden = el.checked; if (S.laatsteBestand) verwerk(S.laatsteBestand); }
  else if (el.dataset.pv != null && S.preview) S.preview.lijst[+el.dataset.pv].sport = el.value;
});
["dragover", "dragleave", "drop"].forEach(type => document.addEventListener(type, e => {
  const zone = e.target.closest && e.target.closest("#drop");
  if (!zone) return;
  e.preventDefault();
  zone.classList.toggle("over", type === "dragover");
  if (type === "drop" && e.dataTransfer.files[0]) leesBestand(e.dataTransfer.files[0]);
}));

async function leesBestand(file) {
  if (!window.XLSX) { S.melding = { soort: "fout", tekst: "De Excel-lezer is nog niet geladen. Probeer het over een paar seconden opnieuw." }; return render(); }
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    S.laatsteBestand = { naam: file.name, bladen: wb.SheetNames.map(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true })) };
    verwerk(S.laatsteBestand);
  } catch (err) { S.preview = null; S.melding = { soort: "fout", tekst: `"${file.name}" kon ik niet openen. Is het een Excel- (.xlsx) of CSV-bestand?` }; render(); }
}
function verwerk(bestand, voorbeeld = false) {
  try {
    let lijst = leesRijen(bestand.bladen, S.start);
    const totaal = lijst.length;
    if (!S.verleden && !voorbeeld) lijst = lijst.filter(t => t.datum >= vandaag());
    if (!lijst.length) { S.preview = null; S.melding = { soort: "fout", tekst: totaal ? `Alle ${totaal} trainingen in dit bestand liggen in het verleden. Vink "Ook trainingen van vóór vandaag" aan om ze toch op te slaan.` : "Ik vind geen trainingen in dit bestand. Stuur het naar Claude, dan wordt de lezer aangepast op het schema van je coach." }; }
    else { S.preview = { lijst, voorbeeld }; S.melding = null; }
  } catch (err) { S.preview = null; S.melding = { soort: "fout", tekst: err.message }; }
  render();
}
function laadVoorbeeld() {
  const rijen = [
    [null, "Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"],
    ["Ochtend", "Ergo 3x20' UT1 r20/22, 3' rust", "Rust", "Boot 2x6km UT2 r18", "Kracht: squat 5x5, deadlift 4x6", "Skiff 60' UT2", "Wedstrijdtempo 6x500m TR r32+", "Fietsen 1u30 Z2"],
    ["Middag", null, "Fiets 60' Z2", null, null, "Core + stabi 30 min", null, null],
  ];
  const oud = S.start; S.start = maandagVan(vandaag());
  verwerk({ naam: "voorbeeld", bladen: [rijen] }, true);
  S.start = oud;
}
async function opslaan() {
  const pv = S.preview; if (!pv) return;
  S.bezig = true; render();
  try {
    const nieuw = new Set(pv.lijst.map(t => t.id)), van = pv.lijst[0].datum, tot = pv.lijst[pv.lijst.length - 1].datum;
    let gewist = 0;
    await wijzigInvoer("schema.enc", { trainingen: {} }, d => {
      for (const [k, t] of Object.entries(d.trainingen)) if (t.datum >= van && t.datum <= tot && !nieuw.has(k) && !t.voorbeeld === !pv.voorbeeld) { delete d.trainingen[k]; gewist++; }
      for (const t of pv.lijst) {
        const doc = { datum: t.datum, nr: t.nr, naam: t.naam, tekst: t.tekst, sport: t.sport, moment: t.moment, minuten: t.minuten };
        if (pv.voorbeeld) doc.voorbeeld = true;
        for (const k in doc) if (doc[k] == null) delete doc[k];
        d.trainingen[t.id] = doc;
      }
    }, pv.voorbeeld ? "Voorbeeldschema" : `Schema ${van} t/m ${tot}`);
    S.melding = { soort: "ok", tekst: `${pv.lijst.length} trainingen opgeslagen${gewist ? `, ${gewist} geschrapte sessie(s) verwijderd` : ""}.` };
    S.preview = null; S.weekStart = maandagVan(van < vandaag() ? vandaag() : van);
    wachtOpNieuweData();
  } catch (err) { S.melding = { soort: "fout", tekst: foutTekst(err) }; }
  S.bezig = false; render();
}

// ---------- start ----------
(async () => {
  const bewaard = opslag.lees("slagboek-sleutel");
  if (bewaard) {
    try { await open(bewaard, true); return; } catch (e) { if (e.name === "OperationError") opslag.zet("slagboek-sleutel", null); }
  }
  document.getElementById("slot").hidden = false;
  document.getElementById("sleutel").focus();
})();
document.addEventListener("visibilitychange", async () => {
  if (document.hidden || !S.data) return;
  try { const d = await laadData(); if (d.gegenereerd !== S.data.gegenereerd) S.data = d; } catch (e) {}
  render();
});
let herteken;
window.addEventListener("resize", () => { clearTimeout(herteken); herteken = setTimeout(() => { if (S.tab === "trends") render(); }, 200); });
