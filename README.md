# Booxnet

Komplett kostenfreies Text-to-Speech: PDF hochladen, Stimme auswählen und
sich das Buch vorlesen lassen – 10 Studio-Stimmen in 31 Sprachen, komplett
offline und im Look einer nativen iOS-App.

## Features

- **PDF-Upload:** PDFs werden lokal im Browser geparst (pdf.js), der Text wird
  pro Seite extrahiert und zusammen mit einem Cover-Thumbnail in IndexedDB
  gespeichert. Es verlässt keine Datei das Gerät.
- **Studio-Stimmen (Supertonic 3):** 10 Preset-Stimmen (Alex, James,
  Emma, …) in Studioqualität (44,1 kHz), jede spricht 31 Sprachen. Das
  gemeinsame Sprachmodell wird einmalig geladen (ca. 400 MB → OPFS), die
  einzelnen Stimmen sind winzige Style-Dateien und laden bei Bedarf. Die
  Buchsprache wird automatisch erkannt: nicht-lateinische Schriften
  (Japanisch, Koreanisch, Arabisch, Griechisch, Hindi, Kyrillisch) direkt
  am Schriftsystem, lateinische über Stopwort-Listen für 15 Sprachen;
  unklare Texte laufen im sprachagnostischen Modus (`na`).
  Personalisiertes Probehören („Hallo, ich bin Alex.").
- **Ruckelfrei:** Die komplette ONNX-Inferenz (onnxruntime-web, WebGPU mit
  WASM-Fallback, Sessions werden wiederverwendet) läuft in einem Web
  Worker – die Oberfläche bleibt beim Vorlesen und Scrollen flüssig.
  Off-Screen-Seiten werden per `content-visibility` vom Layout
  ausgenommen, Seiten rendern memoisiert.
- **Natürlicher Lesefluss:** satzzeichen-präzise Pausen (Fragen/Ausrufe
  atmen länger nach, Doppelpunkte binden enger) mit leichtem Zufalls-
  Jitter, längere Pausen an Seitenwechseln, höhere
  Denoising-Qualität bei WebGPU. Pausen entstehen ausschließlich zwischen
  den Sätzen: Ausdrucks-Zeichen wie `<breath>` lösen die öffentlichen
  ONNX-Dateien nicht ein, sie würden buchstäblich vorgelesen. Abkürzungen wie „z. B." oder „Prof. Dr."
  erzeugen keine falschen Satzbrüche. Das
  Lesetempo (0,5×–2×) wird nativ in der Synthese umgesetzt statt das
  Audio zu beschleunigen, und über Zeilenumbrüche getrennte Wörter
  („Bei-spiel") werden beim PDF-Import wieder zusammengefügt. Beim
  Auswählen stellt sich jede Stimme selbst vor („Hallo, ich bin Alex.").
- **Reader mit Satz-Highlighting:** Der aktuell gelesene Satz wird markiert
  und automatisch in den sichtbaren Bereich gescrollt. Tippen auf einen Satz
  springt dorthin. Lesegeschwindigkeit 0,5×–2× einstellbar.
- **Merkt sich alles:** Leseposition pro Buch, gewählte Stimme und Tempo
  bleiben erhalten.
- **Offline als PWA:** Die App ist installierbar („Zum Home-Bildschirm") und
  läuft dank Service Worker vollständig offline.
- **Nativer iOS-Look:** Ionic React im iOS-Modus, inkl. Large Titles,
  Sheet-Modals, Swipe-to-Delete und automatischem Dark Mode.
- **Barrierefrei (WCAG 2.1 AA / BITV-Basis):** axe-core-Audit ohne
  Verstöße über alle Ansichten; Touch-Targets ≥ 48 px (Play 64 px),
  AA-Kontraste in Hell und Dunkel, Zoom nicht blockiert, Tastatur-
  steuerung im Reader (Leertaste = Play/Pause, Pfeiltasten = Satz
  vor/zurück), sichtbarer Fokus, `prefers-reduced-motion` respektiert,
  Screenreader-Labels auf allen Bedienelementen.

## Entwicklung

```bash
npm install
npm run dev       # Dev-Server
npm run build     # Produktions-Build (dist/)
npm run preview   # Build lokal testen (nötig für Service Worker/PWA)
```

## Technik

| Baustein | Zweck |
| --- | --- |
| React + TypeScript + Vite | App-Grundgerüst |
| Ionic React (iOS-Modus) | Native iOS-Optik und -Navigation |
| pdfjs-dist | Textextraktion und Cover-Rendering aus PDFs |
| Supertonic 3 (portiert, MIT) | Studio-Stimmen via onnxruntime-web (WebGPU/WASM) im Web Worker |
| IndexedDB (idb) | Lokale Buch-Bibliothek |
| vite-plugin-pwa (Workbox) | Offline-Fähigkeit und Installierbarkeit |

## Hinweise

- Gescannte PDFs ohne Textebene enthalten keinen extrahierbaren Text und
  können nicht vorgelesen werden (kein OCR).
- Erster Start benötigt einmalig Internet: Das Sprachmodell kommt aus der
  eigenen Auslieferung unter `/supertonic/` (→ OPFS), die WASM-Binaries
  aus `/ort/` (→ Service-Worker-Cache). Ab dann läuft die Synthese
  vollständig offline auf dem Gerät.
- Die Synthese erzeugt pro Satz eine kurze Audiodatei; die nächsten Sätze
  werden während der Wiedergabe im Worker vorab berechnet, damit es keine
  Lücken gibt.
## Das Sprachpaket gehört dem Projekt

Booxnet kann ohne die Supertonic-Modelle nichts vorlesen. Sie deshalb von
einem fremden Dienst zu holen, hieße: Schaltet der ab, ist die App
wertlos. Supertone hat genau das angekündigt – Archivierung des
Repositories im Juli 2026. Also liegt alles im eigenen Projekt:

| Was | Wo |
| --- | --- |
| Upstream-Code (MIT) | `vendor/supertonic/` (siehe `NOTICE.md`) |
| Modelle, ~400 MB (OpenRAIL-M) | `models/supertonic/`, **in Git eingecheckt** |
| Ausgeliefert unter | `/supertonic/` – same-origin, ohne Ausweichquelle |

Git nimmt große Dateien an, GitHub weist Pushs ab 100 MB pro Datei
zurück. Alles darüber liegt darum in 48-MiB-Stücken (`…​.part000`,
`.part001`, …); `models/supertonic/manifest.json` hält Größe und
SHA-256-Summe jeder vollständigen Datei fest.

```bash
npm run build     # setzt models/supertonic/ → public/supertonic/ zusammen
                  # (offline, mit Prüfsummen-Kontrolle)
```

Der Produktions-Build bricht ab, wenn das Sprachpaket fehlt – ein
Deployment ohne Modelle könnte kein einziges Buch vorlesen, und einen
stillen Rückfall auf Dritte gibt es bewusst nicht mehr. Für einen
absichtlich modellfreien Lauf: `node scripts/build-supertonic.mjs
--optional` (so startet auch `npm run dev`).

### Sprachpaket einmalig befüllen

Nur nötig, wenn `models/supertonic/` noch leer ist oder eine neue
Modellfassung übernommen werden soll. Am einfachsten über GitHub Actions
→ Workflow **„Sprachpaket einchecken"** (lädt die Dateien auf dem Runner
und committet sie), lokal alternativ:

```bash
npm run vendor:supertonic                          # vom Upstream
SUPERTONIC_SOURCE=/pfad/zur/kopie npm run vendor:supertonic   # aus eigener Kopie
git add models/supertonic && git commit -m "Sprachpaket aktualisieren"
```

`scripts/vendor-supertonic.mjs` ist die einzige Stelle im Projekt, die
eine fremde Quelle kennt – und sie läuft weder im Build noch in der App.

**Preis dieser Entscheidung:** Die Modelle gehen bei jedem Deploy mit und
kosten Bandbreite (Netlify Free: 100 GB/Monat ≈ 250 Erstdownloads). Jedes
Gerät lädt sie genau einmal und legt sie in OPFS ab. Wird es eng, ist die
Antwort mehr Bandbreite – nicht wieder eine fremde Quelle.
