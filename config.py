"""Instellingen uit .env (lokaal) of omgevingsvariabelen (GitHub Actions)."""
import os
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
_ENV = ROOT / ".env"
if _ENV.exists():
    for regel in _ENV.read_text(encoding="utf-8").splitlines():
        regel = regel.strip()
        if regel and not regel.startswith("#") and "=" in regel:
            k, v = regel.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def get(naam: str, standaard: str | None = None, verplicht: bool = False) -> str | None:
    waarde = os.environ.get(naam) or standaard
    if verplicht and not waarde:
        raise SystemExit(f"{naam} ontbreekt. Zet hem als GitHub secret (of in .env om lokaal te testen).")
    return waarde


TIJDZONE = ZoneInfo(get("TIJDZONE", "Europe/Amsterdam"))
CACHE = Path(get("SLAGBOEK_CACHE", str(ROOT / ".cache")))
INVOER = ROOT / "invoer"
SITE = ROOT / "site"
DAGEN_HISTORIE = int(get("DAGEN_HISTORIE", "90"))


def nu() -> datetime:
    return datetime.now(TIJDZONE)


def vandaag() -> date:
    return nu().date()
