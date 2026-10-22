"""Eén run: intervals.icu ophalen -> analyseren -> versleutelde site-data -> schema naar kalender -> evt. ochtendbericht.

    python bouw.py                  # normaal (GitHub Actions doet dit elk uur)
    python bouw.py --geen-bericht   # zonder Telegram
"""
import argparse
import json
import sys
from datetime import timedelta

from slagboek import analyse, config, crypto, telegram
from slagboek.intervals import Intervals


def lees_invoer(naam: str, sleutel: str, standaard: dict) -> dict:
    pad = config.INVOER / naam
    if not pad.exists():
        return standaard
    try:
        return crypto.ontsleutel_json(pad.read_text(), sleutel)
    except Exception:  # noqa: BLE001
        sys.exit(f"{pad} kan niet ontsleuteld worden. Is SLAGBOEK_SLEUTEL dezelfde als in de site?")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--geen-bericht", action="store_true")
    a = p.parse_args()

    sleutel = config.get("SLAGBOEK_SLEUTEL", verplicht=True)
    api = Intervals()
    eind = config.vandaag()
    wellness = api.wellness(eind - timedelta(days=config.DAGEN_HISTORIE + 35), eind)
    acts = api.activiteiten(eind - timedelta(days=365), eind)

    schema = lees_invoer("schema.enc", sleutel, {"trainingen": {}})
    checkins = lees_invoer("checkins.enc", sleutel, {"checkins": {}})
    instelling = config.get("MAX_HR")
    data = analyse.bouw(wellness, acts, schema.get("trainingen", {}), checkins.get("checkins", {}),
                        int(instelling) if instelling else None, api.max_hr())
    config.SITE.mkdir(exist_ok=True)
    (config.SITE / "data.enc").write_text(crypto.versleutel_json(data, sleutel))
    adv = data["advies"]
    status = f"{adv['score']} ({adv['niveau']})" if adv else "nog geen data"
    print(f"Klaar: {len(wellness)} wellness-dagen, {len(acts)} activiteiten, "
          f"{len(data['trainingen'])} geplande trainingen. Vandaag: {status}")

    # Schema ook in de intervals-kalender, zodat het (via de Garmin-koppeling) op je horloge komt.
    if (config.get("SCHEMA_NAAR_KALENDER", "ja") or "").lower() not in ("nee", "no", "0", "false"):
        try:
            print("Kalender:", api.zet_schema(schema.get("trainingen", {})))
        except Exception as fout:  # noqa: BLE001 - kalender mag de rest niet tegenhouden
            print(f"Schema naar kalender lukte niet: {fout}")

    # Ochtendbericht: één keer per dag, zodra de nacht binnen is (uiterlijk 10:00).
    staat_pad = config.CACHE / "staat.json"
    staat = json.loads(staat_pad.read_text()) if staat_pad.exists() else {}
    uur = config.nu().hour
    if not a.geen_bericht and staat.get("verzonden") != data["vandaag"] and uur >= 6 and (adv or uur >= 10):
        if telegram.stuur(analyse.ochtendbericht(data)):
            staat["verzonden"] = data["vandaag"]
            config.CACHE.mkdir(parents=True, exist_ok=True)
            staat_pad.write_text(json.dumps(staat))
            print("Ochtendbericht verstuurd.")


if __name__ == "__main__":
    main()
