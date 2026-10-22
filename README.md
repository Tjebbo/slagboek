# Slagboek

Je eigen trainingsapp. Hij haalt elk uur automatisch je Garmin-data op via intervals.icu (slaap, HRV, rusthartslag, trainingen) en combineert die met het schema van je coach. Je ziet:

- **Vandaag:** een dagscore (0–100) en per training hoe hard je mag, in hartslag: bijvoorbeeld "UT1: 144–163 bpm, je mag de bovenkant pakken" of "Maak er UT2 van (max 144 bpm)".
- **Week:** wat er gepland stond en wat je volgens Garmin echt hebt gedaan.
- **Trends:** dagscore, HRV met je normale bereik, slaap, rusthartslag, belasting (afgelopen week tegenover wat je gewend bent) en uren per week.
- **Op je horloge:** het schema van je coach komt ook in je intervals-kalender, en via de Garmin-koppeling als geplande training op je horloge.
- **Schema:** hier upload je het Excel-bestand van je coach.
- **Optioneel:** elke ochtend een bericht via Telegram.

Al je data wordt versleuteld met een sleutel die alleen jij hebt.

## Hoe het werkt

```
Garmin ──► intervals.icu ──(elk uur, GitHub Actions)──► bouw.py ──► site/data.enc (versleuteld)
                 ▲                                         ▲                │
                 └── schema als geplande trainingen ───────┤                ▼
                                    invoer/ (versleuteld) ─┘       jouw site op GitHub Pages
                                         ▲                                  │
                                         └──── schema + check-in opslaan ◄──┘
```

Intervals.icu draait op de achtergrond als koppeling met Garmin. Zelf open je alleen Slagboek.

## Setup (eenmalig, ±25 min)

**1. intervals.icu**
- Settings → Connections → **Garmin Connect**: koppel je account. Zet daar ook **Upload planned workouts** aan, dan komt je schema op je horloge.
- Settings → **Developer Settings**: noteer je *Athlete ID* en maak een *API key*.
- Optioneel: zet onder Settings → Sports je echte max-hartslag. Slagboek gebruikt die voor je zones.

**2. GitHub**
- Maak een gratis account op github.com.
- Maak een nieuwe repository `slagboek`. Kies:
  - **Private**, als je GitHub Pro hebt. Dat is gratis voor studenten via *GitHub Education*.
  - Anders **Public**. Al je data is versleuteld, dus alleen de code is dan zichtbaar.
- Upload de inhoud van deze map. Het makkelijkst gaat dat met *GitHub Desktop*. Let op dat de verborgen map `.github` meekomt.

**3. Een sleutel bedenken**
Maak een lange willekeurige wachtzin, bijvoorbeeld via je wachtwoordmanager (minstens 20 tekens). Daarmee wordt al je data versleuteld. Bewaar hem goed.

**4. Secrets in GitHub**
Ga naar je repository → Settings → Secrets and variables → Actions → *New repository secret*:
| Naam | Waarde |
|---|---|
| `INTERVALS_API_KEY` | API key uit stap 1 |
| `INTERVALS_ATHLETE_ID` | Athlete ID uit stap 1 (bijv. `i123456`) |
| `SLAGBOEK_SLEUTEL` | je sleutel uit stap 3 |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | optioneel, voor het ochtendbericht |

Optioneel, onder het tabblad *Variables*:
- `MAX_HR`: overschrijft je max-hartslag.
- `SCHEMA_NAAR_KALENDER` = `nee`: als je het schema níet in intervals/op je horloge wilt.

**5. Pages aanzetten**
Settings → Pages → *Build and deployment* → Source: **GitHub Actions**.

**6. Eerste run**
Ga naar Actions → *slagboek* → **Run workflow**. Daarna draait hij elk uur vanzelf, en direct na elke wijziging die je via de site opslaat.
Je site staat op `https://<jouw-gebruikersnaam>.github.io/slagboek/`.

**7. Op je telefoon**
- Open de site en vul je sleutel in. Kies daarna *Zet op beginscherm*.
- Om je schema en check-ins op te kunnen slaan, maak je één keer een token aan: GitHub → Settings → Developer settings → *Fine-grained tokens* → *Generate new token*.
  - Repository access: alleen `slagboek`.
  - Permissions: *Contents* → **Read and write**.
- Plak de token in Slagboek onder Schema → Instellingen.

## De dagscore

De score begint op 100. Er gaan punten af voor:
- HRV: lager dan je weekgemiddelde, of onder je normale bereik (gemiddelde ± 1 standaardafwijking over 28 dagen).
- Slaap: minder dan 7 uur, of een lage slaapscore.
- Rusthartslag: meer dan 3 slagen boven je weekgemiddelde.
- Belasting: de afgelopen week meer dan ×1,3 zwaarder dan je gewend bent.
- Je eigen check-in: hoe je je voelt en hoeveel spierpijn je hebt.

Staat er een readiness-score in intervals.icu, dan telt die voor 40% mee.

| Score | Niveau | Betekenis |
|---|---|---|
| 75+ | 🟢 | Bovenkant van de zone mag |
| 55–74 | 🟡 | Doen wat er staat |
| onder 55 | 🔴 | Onderin blijven; bij een zware sessie overleg je met je coach |

De zones zijn roeizones als % van je maximale hartslag:

| Zone | % van max |
|---|---|
| UT2 | 65–75 |
| UT1 | 75–85 |
| AT | 85–90 |
| TR | 90–95 |
| AN | 95–100 |

Welke zone een training heeft, haalt Slagboek uit de tekst van je coach ("UT1", "Z2", "2k test", "6x500m"…).

**Het schema van je coach blijft leidend.** Slagboek zegt alleen hoe je het invult.

## Problemen
- **"intervals.icu weigert de toegang"** in Actions: controleer de secrets `INTERVALS_API_KEY` en `INTERVALS_ATHLETE_ID`.
- **Score blijft leeg:** open de Garmin Connect-app zodat je horloge synct. Controleer daarna in intervals.icu of slaap en HRV binnenkomen. Staat dat uit, zet dan in de Garmin-koppeling *Download wellness* aan.
- **Schema komt niet op je horloge:** zet in intervals.icu bij de Garmin-koppeling *Upload planned workouts* aan.
- **Leest je schema verkeerd:** stuur het bestand naar Claude, dan wordt de lezer (`site_bron/parser.js`) aangepast. Daarna `python scripts\maak_site.py`.
