# Supertonic – Sicherungskopie (Vendor)

Dieses Verzeichnis konserviert die für Booxnet relevanten Teile des
Supertonic-Projekts, weil Supertone am 23. Juli 2026 angekündigt hat, das
Repository zu archivieren und die Open-Source-Modelle nicht weiterzuentwickeln.

- **Upstream:** https://github.com/supertone-inc/supertonic
- **Gesicherter Stand (Commit):** `7e2804f96016a7028cb1ed627353c61c1e9dd281`
- **Lizenz Code:** MIT (siehe `LICENSE`)
- **Lizenz Modelle:** OpenRAIL-M (siehe Hugging Face)
- **Modelle:** https://huggingface.co/Supertone/supertonic-3

## Inhalt

| Pfad | Zweck |
| --- | --- |
| `web/` | Offizielles Browser-Beispiel (Referenz für unseren TS-Port in `src/lib/supertonic/`) |
| `LICENSE` | MIT-Lizenz von Supertone Inc. |
| `UPSTREAM-README.md` | Original-README inkl. Archivierungs-Hinweis |

## Modelle: liegen in Git

Nicht nur der Code ist gesichert – die **Modelldateien (~400 MB) liegen
seit dieser Änderung im Repository** unter `models/supertonic/`, gestückelt
zu 48 MiB (GitHub weist Dateien ab 100 MB ab) und über
`models/supertonic/manifest.json` per SHA-256 abgesichert. Damit hängt
weder der Build noch die laufende App an Hugging Face:

- `npm run build` setzt die Stücke offline nach `public/supertonic/`
  zusammen (`scripts/build-supertonic.mjs`) und prüft dabei jede Summe.
- Die App lädt ausschließlich same-origin von `/supertonic/` – es gibt
  keinen Rückfall auf eine fremde Quelle mehr.

Neu befüllen (einmalig, nur bei leerem Speicher oder neuer Modellfassung)
über den Workflow „Sprachpaket einchecken" oder:

```bash
npm run vendor:supertonic
```

Git LFS wäre der naheliegende Weg gewesen, scheidet aber aus: eigenes
knappes Datenkontingent, und ein `git clone` ohne LFS-Client liefert nur
Platzhalter statt Modelle – also wieder eine Abhängigkeit, die genau dann
bricht, wenn man sie braucht.
