"""Haalt je Garmin-data op via intervals.icu (officiële API, Garmin synct daar al naartoe)
en zet het schema van je coach in je intervals-kalender, zodat het ook op je horloge komt."""
from __future__ import annotations

from datetime import date

import requests

from . import config

BASIS = "https://intervals.icu/api/v1"


class Intervals:
    def __init__(self):
        self.athlete = config.get("INTERVALS_ATHLETE_ID", "0")
        self.s = requests.Session()
        self.s.auth = ("API_KEY", config.get("INTERVALS_API_KEY", verplicht=True))

    def _url(self, pad: str) -> str:
        return f"{BASIS}/athlete/{self.athlete}{pad}"

    @staticmethod
    def _json(r: requests.Response):
        if r.status_code in (401, 403):
            raise SystemExit("intervals.icu weigert de toegang: check INTERVALS_API_KEY en INTERVALS_ATHLETE_ID.")
        r.raise_for_status()
        return r.json() if r.content else None

    def wellness(self, van: date, tot: date) -> list[dict]:
        return self._json(self.s.get(self._url("/wellness"), params={"oldest": van.isoformat(), "newest": tot.isoformat()}, timeout=60)) or []

    def activiteiten(self, van: date, tot: date) -> list[dict]:
        return self._json(self.s.get(self._url("/activities"), params={"oldest": van.isoformat(), "newest": tot.isoformat()}, timeout=60)) or []

    def atleet(self) -> dict:
        return self._json(self.s.get(self._url(""), timeout=30)) or {}

    def max_hr(self) -> int | None:
        try:
            waarden = [s.get("max_hr") for s in self.atleet().get("sportSettings") or []]
            waarden = [w for w in waarden if isinstance(w, (int, float)) and 120 < w < 230]
            return int(max(waarden)) if waarden else None
        except Exception:  # noqa: BLE001
            return None

    # ---- schema naar de kalender (en zo naar je Garmin) ----
    def events(self, van: date, tot: date) -> list[dict]:
        return self._json(self.s.get(self._url("/events"), params={"oldest": van.isoformat(), "newest": tot.isoformat(), "category": "WORKOUT"}, timeout=30)) or []

    def zet_schema(self, trainingen: dict[str, dict]) -> str:
        nu = config.vandaag().isoformat()
        komend = {k: t for k, t in trainingen.items() if t["datum"] >= nu and not t.get("voorbeeld")}
        uur = {"ochtend": "07:00", "middag": "12:00", "avond": "18:00"}
        events = []
        for k, t in komend.items():
            e = {"category": "WORKOUT", "start_date_local": f"{t['datum']}T{uur.get(t.get('moment'), '00:00')}:00",
                 "type": t["sport"] if t["sport"] != "Other" else "Workout", "name": t["naam"], "description": t["tekst"], "external_id": k}
            if t.get("minuten"):
                e["moving_time"] = t["minuten"] * 60
            events.append(e)
        if events:
            self._json(self.s.post(self._url("/events/bulk"), params={"upsert": "true"}, json=events, timeout=60))
        # Sessies die uit het schema zijn gehaald ook uit de kalender halen.
        tot = max([t["datum"] for t in komend.values()] + [nu])
        weg = [e["id"] for e in self.events(config.vandaag(), date.fromisoformat(tot))
               if str(e.get("external_id") or "").startswith("coach-") and e["external_id"] not in komend]
        if weg:
            self._json(self.s.put(self._url("/events/bulk-delete"), json=[{"id": i} for i in weg], timeout=30))
        return f"{len(events)} trainingen in kalender, {len(weg)} verwijderd"
