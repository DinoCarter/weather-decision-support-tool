# Kestrel

A browser-based risk scoring tool for standardizing weather-related operational decisions across Oklahoma sites.

---

## What this is (and isn't)

This is a **decision aid**, not a decision authority. It takes structured weather forecast inputs, runs them through a weighted scoring formula, and produces a 0–100 risk score for three operational categories: Facility Operations, Outdoor Activities, and Roads & Travel.

The scores inform human judgment, they don't make decisions. That distinction is intentional and appears throughout the interface language.

---

## How the scoring works

### The formula

Every score uses the same formula:

```
Final Score = Σ(Input Raw Score × Weight) / 100
```

Where:
- **Input Raw Score** is the point value selected for a given input (see tables below)
- **Weight** is that input's percentage contribution to the specific score type

Scores are capped at 100, floored at 0, and rounded to the nearest integer.

**Example:** A severe weather assessment with >1.5" rain (100 pts), large hail (100 pts), and lightning (100 pts), everything else at zero:

```
Facility Operations = (100×15 + 100×15 + 100×5) / 100
                    = (1500 + 1500 + 500) / 100
                    = 35 → "Elevated Caution"
```

---

### Severe Weather inputs and raw scores

| Input | 0 pts | Option 1 | Option 2 | Option 3 | Option 4 |
|---|---|---|---|---|---|
| Rain | None | 0.01–0.75": 33 | 0.75–1.5": 67 | >1.5": 100 | — |
| Hail | None | <1" diameter: 50 | ≥1" diameter: 100 | — | — |
| Lightning | No: 0 | Yes: 100 | — | — | — |
| Sustained Wind | <20 mph: 0 | 20–30 mph: 25 | 30–40 mph: 50 | 40–50 mph: 75 | >50 mph: 100 |
| Max Wind Gust | <30 mph: 0 | 30–40 mph: 25 | 40–50 mph: 50 | 50–60 mph: 75 | >60 mph: 100 |
| Flash Flood | No: 0 | Yes: 100 | — | — | — |
| Tornado Possible | No: 0 | Yes: 100 | — | — | — |

### Severe Weather score weights (%)

| Input | Facility Ops | Outdoor Activities | Roads & Travel |
|---|---|---|---|
| Rain | 15 | 20 | 20 |
| Hail | 15 | 15 | 15 |
| Lightning | 5 | 20 | 5 |
| Sustained Wind | 20 | 10 | 5 |
| Max Wind Gust | 20 | 10 | 15 |
| Flash Flood | 5 | 5 | 20 |
| Tornado Possible | 20 | 20 | 20 |
| **Total** | **100** | **100** | **100** |

---

### Heat inputs and raw scores

| Input | 0 pts | Option 1 | Option 2 | Option 3 |
|---|---|---|---|---|
| WBGT | <82.0°F: 0 | 82.0–86.9°F: 33 | 87.0–89.9°F: 67 | ≥90.0°F: 100 |
| Heat Index | <90°F: 0 | 90–100°F: 33 | 100–108°F: 67 | >108°F: 100 |
| Sustained Wind | <20 mph: 0 | 20–30 mph: 25 | 30–40 mph: 50 | >40 mph: 75 |

**WBGT and Heat Index are mutually exclusive.** When WBGT data is available, use it — it's the more comprehensive measure. When WBGT isn't available, use Heat Index. The tool handles this with a radio toggle that greys out the inactive field.

### Heat score weights (%)

| Input | Facility Ops | Outdoor Activities | Roads & Travel |
|---|---|---|---|
| WBGT or Heat Index | 55 | 80 | 30 |
| Sustained Wind | 45 | 20 | 20 |
| **Total** | **100** | **100** | **50** |

**A note on the Roads & Travel heat score:** Roads' weights only total 50%, not 100% — heat just doesn't have a meaningful operational impact on road surfaces or travel safety the way ice does, so the remaining 50% is intentionally left unassigned. The Roads & Travel score in Heat mode will always be capped well below Facility/Outdoor (maximum theoretical score is 50/100).

---

### Winter Weather inputs and raw scores

| Input | 0 pts | Option 1 | Option 2 | Option 3 | Option 4 |
|---|---|---|---|---|---|
| Ice Accumulation | None: 0 | Trace–0.10": 33 | 0.10–0.25": 67 | >0.25": 100 | — |
| Snow Accumulation | None: 0 | 1–3": 33 | 3–6": 67 | >6": 100 | — |
| Wind Chill | >32°F: 0 | 20–32°F: 25 | 10–20°F: 50 | 0–10°F: 75 | <0°F: 100 |
| Max Wind Gust | <30 mph: 0 | 30–40 mph: 25 | 40–50 mph: 50 | 50–60 mph: 75 | >60 mph: 100 |
| Freeze-Thaw Cycle | No: 0 | Yes: 100 | — | — | — |

### Winter Weather score weights (%)

| Input | Facility Ops | Outdoor Activities | Roads & Travel |
|---|---|---|---|
| Ice Accumulation | 35 | 20 | 40 |
| Snow Accumulation | 20 | 20 | 20 |
| Wind Chill | 15 | 45 | 5 |
| Max Wind Gust | 20 | 10 | 15 |
| Freeze-Thaw Cycle | 10 | 5 | 20 |
| **Total** | **100** | **100** | **100** |

---

### Stoplight bands

| Score | Level | Label |
|---|---|---|
| 0–24 | 🟢 Green | Normal Operations |
| 25–49 | 🟡 Yellow | Elevated Caution |
| 50–74 | 🟠 Amber | High Risk |
| 75–100 | 🔴 Red | Severe Risk |

---

## Multi-mode assessments

You can activate multiple hazard modes simultaneously. Each mode produces a completely independent set of three scores. Scores from different modes are never combined, averaged, or otherwise mixed. If you have both Severe Weather and Winter Weather active, you get six score cards.

---

## Condition Summary

After calculation, the Condition Summary provides plain-English explanations of each input that's contributing to the scores (any input with a raw score > 0).

Each condition item includes:
- A color-coded border and background matching the risk level of that input
- A category tag
- An action-oriented description referencing the relevant NWS threshold where applicable

The summary is collapsed by default in the UI (to keep the score cards prominent) but always expands in the PDF export.

---

## PDF export

The Export Assessment as PDF button opens the browser's native print dialog with print-optimized CSS applied. The exported record includes all context fields, active advisories (checked items only), all input values, all scores, the full Condition Summary (force-expanded), and the disclaimer.

Stoplight indicators render as white fill with colored borders in print — solid color fills can fail in black-and-white printing environments, and this ensures the level difference remains visible.

---

## Roadmap

The following featues or elements are planned for future versions:

- NWS API integration
- User authentication with role-based access
- Server-side assessment database with full history
- Searchable decision log linking assessments to actual operational decisions
- Multi-site dashboard (all counties at once)
- Seasonal mode presets (hide irrelevant modes, adjust weights)
- Native mobile app (iOS/Android) with push notifications

---

## Version history

| Version | Notes |
|---|---|
| 2.0 | Full shift to predicition based tool with no support for current weather condition risk calculations. Three hazard modes (Severe, Heat, Winter). Multi-mode simultaneous assessment. |
| 1.x | Initial prototype and proof of concept. |

---

*This tool is not an official policy, emergency operations plan, or legally binding decision framework.*
*Final authority for all operational decisions rests with authorized leadership.*
