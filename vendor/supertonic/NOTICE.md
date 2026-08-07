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

## Modelle spiegeln (wichtig!)

Der Code ist hiermit gesichert – die **Modelldateien (~400 MB) liegen aber
weiterhin nur auf Hugging Face**. Solange `Supertone/supertonic-3` dort
verfügbar ist, funktioniert alles; für die Zukunft sollten die Dateien
gespiegelt werden:

```bash
node scripts/mirror-supertonic.mjs
```

Das Skript lädt alle Assets nach `public/supertonic/`. Die App prüft diesen
Pfad zuerst und fällt nur dann auf Hugging Face zurück – ein einmal
gespiegeltes Deployment ist damit unabhängig von Hugging Face.
`public/supertonic/` ist bewusst nicht in Git eingecheckt (400 MB);
für Versionierung Git LFS oder einen eigenen Objektspeicher verwenden.
