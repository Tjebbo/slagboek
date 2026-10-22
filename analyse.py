"""Van ruwe Garmin-data naar trends, een dagscore en 'hoe hard mag ik vandaag'.

Het schema van je coach blijft leidend. De dagscore zegt alleen hoe je het
invult: naar de boven- of onderkant van de zone, of eerst overleggen.
"""
from __future__ import annotations

import re
from datetime import date, timedelta
from statistics import mean

from . import config

# ---------- ruwe Garmin-velden veilig uitlezen ----------

def _num(x):
    return x if isinstance(x, (int, float)) and not isinstance(x, bool) and x > 0 else None


def metingen(w: dict) -> dict:
    """Eén wellness-dag uit intervals.icu (Garmin synct slaap, HRV en rusthartslag daarheen)."""
    slaap_s = _num(w.get("sleepSecs"))
    return {
        "slaapU": round(slaap_s / 3600, 2) if slaap_s else None,
        "slaapScore": _num(w.get("sleepScore")),
        "hrv": _num(w.get("hrv")),
        "hrvLaag": None, "hrvHoog": None, "hrvStatus": None,  # zelf berekend in hrv_bereik()
        "rhr": _num(w.get("restingHR")),
        "bb": None,
        "stress": _num(w.get("stress")),
        "garminReadiness": _num(w.get("readiness")),
    }


def hrv_bereik(m: dict[str, dict]) -> None:
    """Je normale HRV-bereik: gemiddelde ± 1 standaardafwijking over de 28 dagen ervóór.
    Status zoals Garmin: BALANCED binnen het bereik, UNBALANCED net eronder, LOW ver eronder."""
    from statistics import pstdev
    for d in sorted(m):
        vorige = [m.get((date.fromisoformat(d) - timedelta(days=i)).isoformat(), {}).get("hrv") for i in range(1, 29)]
        vorige = [v for v in vorige if v]
        if len(vorige) < 10:
            continue
        g, sd = mean(vorige), max(pstdev(vorige), 2)
        m[d]["hrvLaag"], m[d]["hrvHoog"] = round(g - sd, 1), round(g + sd, 1)
        h = m[d].get("hrv")
        if h:
            m[d]["hrvStatus"] = "BALANCED" if h >= g - sd else "UNBALANCED" if h >= g - 2 * sd else "LOW"


SPORT_NL = {"Rowing": "Roeien", "VirtualRow": "Ergo", "Ride": "Fietsen", "WeightTraining": "Kracht",
            "Run": "Hardlopen", "Other": "Overig"}


def sport_van(type_: str) -> str:
    t = (type_ or "").lower()
    if t == "virtualrow" or "indoor" in t and "row" in t:
        return "VirtualRow"
    if "row" in t:
        return "Rowing"
    if "ride" in t or "cycl" in t or "bike" in t:
        return "Ride"
    if "weight" in t or "strength" in t:
        return "WeightTraining"
    if "run" in t:
        return "Run"
    return "Other"


def activiteit(a: dict) -> dict | None:
    start = str(a.get("start_date_local") or "")
    if len(start) < 10:
        return None
    duur = _num(a.get("moving_time")) or _num(a.get("elapsed_time")) or 0
    load = _num(a.get("icu_training_load"))
    return {
        "id": str(a.get("id")),
        "datum": start[:10],
        "tijd": start[11:16],
        "naam": a.get("name") or "",
        "sport": sport_van(a.get("type")),
        "min": round(duur / 60),
        "km": round((_num(a.get("distance")) or 0) / 1000, 1) or None,
        "hr": _num(a.get("average_heartrate")),
        "hrMax": _num(a.get("max_heartrate")),
        "load": round(load) if load else round(duur / 60 * 1.2),  # schatting als er geen load is
        "loadGeschat": not load,
        "aerobe": None,
        "anaerobe": None,
    }


# ---------- hartslagzones (roeien, % van max) ----------

ZONES = [("UT2", .65, .75), ("UT1", .75, .85), ("AT", .85, .90), ("TR", .90, .95), ("AN", .95, 1.0)]
ZONE_UITLEG = {"UT2": "rustige duur", "UT1": "stevige duur", "AT": "drempel", "TR": "wedstrijdtempo", "AN": "sprint/anaeroob"}


def zones(max_hr: int | None) -> dict:
    if not max_hr:
        return {}
    return {z: [round(max_hr * lo), round(max_hr * hi)] for z, lo, hi in ZONES}


def sessie_zone(tekst: str) -> str | None:
    t = tekst.lower()
    m = re.search(r"\b(ut2|ut1|at|tr|an)\b", t)
    if m:
        return m[1].upper()
    m = re.search(r"\bz([1-5])\b", t)
    if m:
        return {"1": "UT2", "2": "UT2", "3": "UT1", "4": "AT", "5": "TR"}[m[1]]
    if re.search(r"500m|sprint|\bstart", t):
        return "AN"
    if re.search(r"\btest\b|\b2k\b|2000m|wedstrijd|race", t):
        return "TR"
    if re.search(r"sweetspot|drempel|threshold", t):
        return "AT"
    if re.search(r"rustig|herstel|duur|\bed\b|extensief", t):
        return "UT2"
    return None


# ---------- dagscore ----------

def _gem(waarden):
    w = [x for x in waarden if x]
    return mean(w) if len(w) >= 3 else None


def dagscore(d: str, m: dict[str, dict], belasting: dict[str, dict], checkin: dict | None) -> dict | None:
    nu = m.get(d) or {}
    if not any(nu.get(k) for k in ("slaapU", "hrv", "rhr", "bb")) and not checkin:
        return None
    vorige = [m.get((date.fromisoformat(d) - timedelta(days=i)).isoformat()) or {} for i in range(1, 8)]
    score, factoren = 100.0, []

    def factor(naam, waarde, impact, uitleg=""):
        nonlocal score
        score += impact
        factoren.append({"naam": naam, "waarde": waarde, "impact": impact, "uitleg": uitleg})

    if nu.get("hrv"):
        st = (nu.get("hrvStatus") or "").upper()
        impact = {"UNBALANCED": -10, "LOW": -20, "POOR": -25}.get(st, 0)
        g = _gem([v.get("hrv") for v in vorige])
        rel = (nu["hrv"] - g) / g * 100 if g else None
        if rel is not None:
            impact += -15 if rel < -12 else -7 if rel < -5 else 0
        tekst = f"{nu['hrv']:.0f} ms" + (f" ({rel:+.0f}% t.o.v. je week)" if rel is not None else "")
        uitleg = {"BALANCED": "binnen je normale bereik", "UNBALANCED": "buiten je normale bereik",
                  "LOW": "laag", "POOR": "erg laag"}.get(st, "")
        factor("HRV", tekst, max(impact, -30), uitleg)
    if nu.get("slaapU"):
        u = nu["slaapU"]
        impact = -20 if u < 6 else -10 if u < 7 else 0
        sc = nu.get("slaapScore")
        if sc:
            impact += -10 if sc < 60 else -5 if sc < 70 else 0
        factor("Slaap", f"{int(u)}u{round(u % 1 * 60):02d}" + (f" · score {sc:.0f}" if sc else ""), impact)
    if nu.get("rhr"):
        g = _gem([v.get("rhr") for v in vorige])
        diff = nu["rhr"] - g if g else None
        impact = 0 if diff is None else -15 if diff >= 8 else -8 if diff >= 5 else -3 if diff >= 3 else 0
        factor("Rusthartslag", f"{nu['rhr']:.0f}" + (f" ({diff:+.0f} t.o.v. je week)" if diff is not None else ""), impact)
    if nu.get("bb"):
        factor("Body Battery", f"{nu['bb']:.0f}", -15 if nu["bb"] < 40 else -7 if nu["bb"] < 60 else 0)
    gisteren = (date.fromisoformat(d) - timedelta(days=1)).isoformat()
    b = belasting.get(gisteren) or {}
    if b.get("ratio"):
        r = b["ratio"]
        factor("Trainingsbelasting", f"×{r:.2f} t.o.v. je gemiddelde week",
               -15 if r > 1.5 else -8 if r > 1.3 else 0,
               "afgelopen 7 dagen vs. de 4 weken ervoor")
    if checkin:
        if checkin.get("gevoel"):
            gv = checkin["gevoel"]
            factor("Gevoel", f"{gv}/5", -20 if gv == 1 else -10 if gv == 2 else 0)
        if checkin.get("spierpijn"):
            sp = checkin["spierpijn"]
            factor("Spierpijn", f"{sp}/5", -15 if sp == 5 else -8 if sp == 4 else 0)

    eigen = max(0.0, min(100.0, score))
    gr = nu.get("garminReadiness")
    totaal = round(0.6 * eigen + 0.4 * gr) if gr else round(eigen)
    niveau = "groen" if totaal >= 75 else "geel" if totaal >= 55 else "rood"
    return {"datum": d, "score": totaal, "niveau": niveau, "garminReadiness": gr, "factoren": factoren}


# ---------- belasting ----------

def belasting_per_dag(acts: list[dict], eind: date, dagen: int) -> dict[str, dict]:
    per_dag: dict[str, float] = {}
    for a in acts:
        per_dag[a["datum"]] = per_dag.get(a["datum"], 0) + a["load"]
    uit = {}
    for i in range(dagen + 28):
        d = eind - timedelta(days=i)
        acuut = sum(per_dag.get((d - timedelta(days=j)).isoformat(), 0) for j in range(7))
        chron = sum(per_dag.get((d - timedelta(days=j)).isoformat(), 0) for j in range(28)) / 4
        uit[d.isoformat()] = {"load": round(per_dag.get(d.isoformat(), 0)), "acuut": round(acuut),
                              "chronisch": round(chron), "ratio": round(acuut / chron, 2) if chron > 50 else None}
    return uit


# ---------- advies per sessie ----------

KOP = {
    "groen": ("Klaar om te knallen", "Je herstel is goed. Je mag vandaag naar de bovenkant van de voorgeschreven zones."),
    "geel": ("Doen wat er staat", "Een paar vermoeidheidssignalen. Train zoals voorgeschreven, niet harder."),
    "rood": ("Rustig aan", "Duidelijke vermoeidheidssignalen. Blijf onderin de zones en overleg bij een zware sessie met je coach."),
}


def sessie_advies(t: dict, niveau: str | None, zn: dict) -> dict:
    zone = sessie_zone(f"{t.get('naam', '')} {t.get('tekst', '')}")
    hr = zn.get(zone) if zone else None
    tip = ""
    if niveau and zone and hr:
        lo, hi = hr
        midden = round((lo + hi) / 2)
        ut2_hi = zn["UT2"][1]
        if zone == "UT2":
            tip = {"groen": f"Rustige duur: {lo}–{hi} bpm. Ook als je je top voelt niet harder, het effect zit in de duur.",
                   "geel": f"Rustige duur: {lo}–{hi} bpm, liefst in de onderste helft.",
                   "rood": f"Houd het echt rustig: {lo}–{midden} bpm."}[niveau]
        elif zone == "UT1":
            tip = {"groen": f"UT1: {lo}–{hi} bpm. Je mag de bovenkant pakken.",
                   "geel": f"UT1: {lo}–{hi} bpm, niet erboven. Begin onderin.",
                   "rood": f"Maak er UT2 van (max {ut2_hi} bpm) of overleg met je coach."}[niveau]
        else:
            tip = {"groen": f"{zone} ({ZONE_UITLEG[zone]}): {lo}–{hi} bpm. Goede dag om te pushen.",
                   "geel": f"{zone} ({ZONE_UITLEG[zone]}): houd je aan de voorgeschreven tempo's. Start de eerste herhaling rustig.",
                   "rood": f"Zware sessie op een slechte dag. Overleg met je coach of hij doorgaat. Zo niet: UT2, max {ut2_hi} bpm."}[niveau]
    elif niveau and zone:
        tip = {"groen": "Je mag naar de bovenkant van de zone.", "geel": "Train zoals voorgeschreven, niet harder.",
               "rood": "Blijf onderin de zone, bij een zware sessie eerst overleggen."}[niveau]
    return {"zone": zone, "hr": hr, "tip": tip}


def koppel(trainingen: dict[str, dict], acts: list[dict]) -> tuple[dict, list]:
    """Koppelt geplande trainingen aan Garmin-activiteiten van dezelfde dag."""
    uit = {k: dict(v) for k, v in trainingen.items()}
    vrij = sorted(acts, key=lambda a: (a["datum"], a["tijd"]))
    gebruikt = set()
    lijk = {"Rowing": {"Rowing", "VirtualRow"}, "VirtualRow": {"VirtualRow", "Rowing"}}
    for tid, t in sorted(uit.items(), key=lambda kv: (kv[1]["datum"], kv[1].get("nr", 1))):
        kandidaten = [a for a in vrij if a["datum"] == t["datum"] and a["id"] not in gebruikt]
        match = next((a for a in kandidaten if a["sport"] == t["sport"]), None) or \
            next((a for a in kandidaten if a["sport"] in lijk.get(t["sport"], set())), None)
        if match:
            gebruikt.add(match["id"])
            t["gedaan"] = {k: match[k] for k in ("id", "min", "km", "hr", "hrMax", "load", "aerobe", "anaerobe", "tijd")}
    extra = [a for a in vrij if a["id"] not in gebruikt]
    return uit, extra


# ---------- alles samen ----------

def bouw(wellness: list, ruwe_acts: list, trainingen: dict, checkins: dict,
         max_hr_instelling: int | None = None, max_hr_intervals: int | None = None) -> dict:
    eind = config.vandaag()
    dagen = config.DAGEN_HISTORIE
    m = {w["id"]: metingen(w) for w in wellness if w.get("id")}
    hrv_bereik(m)
    acts = [a for a in (activiteit(x) for x in ruwe_acts) if a]
    grens = (eind - timedelta(days=365)).isoformat()
    uit_acts = max((a["hrMax"] for a in acts if a["hrMax"] and a["datum"] >= grens and a["hrMax"] < 230), default=None)
    max_hr = max_hr_instelling or max_hr_intervals or uit_acts
    bron = ("jouw instelling MAX_HR" if max_hr_instelling else "je max-hartslag in intervals.icu" if max_hr_intervals
            else "hoogste hartslag in je trainingen van het afgelopen jaar")
    zn = zones(max_hr)
    bel = belasting_per_dag(acts, eind, dagen)

    reeks = []
    for i in range(dagen - 1, -1, -1):
        d = (eind - timedelta(days=i)).isoformat()
        sc = dagscore(d, m, bel, checkins.get(d))
        rij = {"d": d, **(m.get(d) or {}), **{k: bel[d][k] for k in ("load", "acuut", "chronisch", "ratio")},
               "score": sc["score"] if sc else None}
        reeks.append(rij)

    gekoppeld, extra = koppel(trainingen, [a for a in acts if a["datum"] >= (eind - timedelta(days=dagen)).isoformat()])
    vandaag = eind.isoformat()
    advies = dagscore(vandaag, m, bel, checkins.get(vandaag))
    niveau = advies["niveau"] if advies else None
    for t in gekoppeld.values():
        if t["datum"] >= vandaag:
            t["advies"] = sessie_advies(t, niveau if t["datum"] == vandaag else None, zn)

    weken = []
    maandag = eind - timedelta(days=eind.weekday())
    for w in range(11, -1, -1):
        start = maandag - timedelta(weeks=w)
        eind_w = start + timedelta(days=6)
        per_sport: dict[str, int] = {}
        for a in acts:
            if start.isoformat() <= a["datum"] <= eind_w.isoformat():
                per_sport[a["sport"]] = per_sport.get(a["sport"], 0) + a["min"]
        weken.append({"start": start.isoformat(), "week": start.isocalendar().week, "min": per_sport,
                      "load": sum(bel.get((start + timedelta(days=j)).isoformat(), {}).get("load", 0) for j in range(7))})

    if advies:
        advies["kop"], advies["uitleg"] = KOP[advies["niveau"]]
    laatste_sync = max((d for d, v in m.items() if any(v.get(k) for k in ("slaapU", "hrv", "rhr"))), default=None)
    return {
        "gegenereerd": config.nu().isoformat(timespec="minutes"),
        "vandaag": vandaag,
        "laatsteMeting": laatste_sync,
        "maxHr": max_hr,
        "maxHrBron": bron,
        "zones": zn,
        "advies": advies,
        "dagen": reeks,
        "weken": weken,
        "trainingen": gekoppeld,
        "extra": [a for a in extra if a["datum"] >= (eind - timedelta(days=28)).isoformat()],
        "checkins": checkins,
    }


# ---------- telegram-tekst ----------

def ochtendbericht(data: dict) -> str:
    a, d = data.get("advies"), data["vandaag"]
    regels = []
    if a:
        regels.append(f"{ {'groen': '🟢', 'geel': '🟡', 'rood': '🔴'}[a['niveau']] } {a['kop']} · {a['score']}/100")
        regels.append(a["uitleg"])
        regels.append(" · ".join(f"{f['naam'].lower()} {f['waarde']}" for f in a["factoren"]))
    else:
        regels.append("⚪ Nog geen slaapdata van vannacht. Even de Garmin Connect-app openen om te syncen.")
    sessies = sorted([t for t in data["trainingen"].values() if t["datum"] == d], key=lambda t: t.get("nr", 1))
    regels.append("")
    if not sessies:
        regels.append("Vandaag geen training gepland. Herstel goed.")
    for t in sessies:
        regels.append(f"• {SPORT_NL.get(t['sport'], t['sport'])}: {t['naam']}")
        tip = (t.get("advies") or {}).get("tip")
        if tip:
            regels.append(f"  → {tip}")
    return "\n".join(regels)
