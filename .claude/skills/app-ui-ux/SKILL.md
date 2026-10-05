---
name: app-ui-ux
description: UI/UX-Regeln für Nova (Next.js 16, Tailwind v4, Poppins, nur Dark Mode). Verwenden bei jeder Änderung an Aussehen, Texten, Layout oder Bedienung von Seiten und Komponenten in src/app und src/components.
---

# Nova UI/UX

Der Nutzer ist Einsteiger. **Erkläre jede Änderung in einem einfachen Satz**
(z. B. "Der Button heißt jetzt 'Kommentar senden', damit klar ist, was passiert.").

## Oberste Regel: nur Oberfläche, keine Logik

- UI/UX-Änderungen betreffen **nur Aussehen, Texte und Bedienung**. Nicht verändert
  werden: Logik, Datenbankabfragen (Supabase), API-Routen (`src/app/api/*`), Login
  (`AuthContext`, `AuthModal`-Ablauf), Formular-Verarbeitung, `middleware.ts` und die
  App-KI (`/api/chat`, `src/lib/aiEngine.ts`, `src/lib/brain/*`, `useAIFeed`).
- Bestehende Funktionen, Props, Event-Handler, State, Hooks und Datenflüsse bleiben
  **exakt** erhalten – gleiche Namen, gleiche Signaturen, gleiche Aufrufe. Nur
  `className`, `style`, Markup-Struktur und sichtbare Texte dürfen sich ändern.
- Würde eine UX-Verbesserung doch Logik ändern (neuer State, neuer API-Aufruf,
  andere Reihenfolge von Aufrufen): **erst den Nutzer fragen, nicht umsetzen.**
- In kleinen Schritten arbeiten: eine Seite oder Komponente nach der anderen, danach
  kurz prüfen (`npm run typecheck`, `npm run lint` – Baseline sind 41 bestehende
  Lint-Meldungen, keine neuen dazu).
- Vor größeren Umbauten (mehrere Komponenten, neues Layout) einen Git-Branch
  empfehlen, z. B. `git checkout -b ui/feed-redesign`.

## Das Design-System von Nova

Styling läuft über **Tailwind v4** (`@theme inline` in `src/app/globals.css`, kein
`tailwind.config`) plus Inline-`style={{}}` für Farben. Icons kommen aus
**lucide-react**, Animationen aus **framer-motion**. Diese Werte verwenden statt
neuer Einzelwerte:

**Farben** (Tokens aus `globals.css`, als Tailwind-Klassen nutzbar, z. B. `bg-card`):

| Token | Wert | Wofür |
|---|---|---|
| `background` | `#0f0d14` | Seitenhintergrund |
| `surface` | `#14111e` | Flächen, Sheets |
| `card` | `#1c1828` | Karten |
| `border` | `#2a2438` | Rahmen, Trenner |
| `text` | `#f0f0ff` | Haupttext |
| `muted` | `#888899` | Nebentext |
| `nova-violet` | `#8b5cf6` | Hauptakzent |
| `nova-pink` | `#ec4899` | Zweitakzent |
| `nova-blue` | `#3b82f6` | Info |
| `teal` | `#06d6a0` | positiv/Highlight |

Weitere oft genutzte Werte: `#a78bfa` / `#c4b5fd` (helles Violett für Text auf
Dunkel), `#22c55e` (Erfolg/live), `#f59e0b` (Warnung), `#ef4444` (Fehler).
Im Code stehen viele Farben als Hex direkt im `style` – beim Anfassen einer
Komponente lieber den passenden Token/Wert von oben nehmen als einen neuen Grauton
erfinden. Bestehende Hex-Werte nicht massenhaft umbauen, nur dort, wo du ohnehin
arbeitest.

**Fertige Klassen** in `globals.css`: `nova-btn` (Haupt-Button, Verlauf
Violett→Pink, `border-radius: 16px`), `gradient-bg`, `gradient-text`, `glass`,
`glass-card`, `glass-nav`, `shimmer` (Lade-Skelett), `drag-handle`, `slide-up`,
`no-scrollbar` (nur zusammen mit `overflow-x-auto`), `tab-content`.

**Schrift:** Poppins (über `--font-sans`). Größen fast immer `text-xs` und
`text-sm`, Überschriften `text-base`/`text-lg`/`text-xl`. Keine neuen
Pixelgrößen wie `text-[13px]`; unter `text-[11px]` nur für Badges.

**Rundungen:** `rounded-2xl` (Karten, Toasts), `rounded-xl` (Inputs, kleine Karten),
`rounded-full` (Avatare, Chips, Icon-Buttons), `rounded-3xl` (große Sheets).

**Abstände:** Raster aus `px-4`/`px-3`, `py-3`/`py-2.5`, `gap-2`/`gap-3`/`gap-1.5`.

## Design-Regeln

- **Klare Hierarchie:** Pro Seite ist das Wichtigste sofort erkennbar – ein
  Haupt-Button (`nova-btn`), Nebenaktionen schlichter (Rahmen oder nur Text).
- **Handy zuerst:** Nova ist eine App (Capacitor für Android/iOS). Ab 900 px Breite
  zentriert `.app-frame` alles in einer 460-px-Spalte – Desktop sieht also wie das
  Handy aus. Darum: auf ~375 px Breite testen, Safe Areas beachten
  (`env(safe-area-inset-*)`, wichtig bei Bottom-Nav und Sheets), nichts darf
  horizontal scrollen außer bewussten Chip-Leisten.
- **Dark Mode:** Nova ist **nur dunkel** – es gibt keinen hellen Modus und keine
  `dark:`-Klassen. Keine hellen Flächen einführen und keinen Light Mode einbauen,
  ohne zu fragen. Kontrast immer gegen den dunklen Hintergrund prüfen.
- Kein Konflikt mit der Karte: MapLibre-CSS gewinnt gegen Tailwind-v4-Klassen –
  bei Karten-Overlays Inline-`style` verwenden.
- `prefers-reduced-motion` respektieren, wie es `globals.css` schon tut.

## UX-Regeln

- **Jede Aktion gibt Rückmeldung:**
  - Laden: `Loader2` mit `animate-spin` im Button oder `shimmer`-Skelette (Vorbild
    `FeedSkeleton.tsx`); Button während des Ladens deaktivieren.
  - Erfolg/Fehler: Toasts über `addToast(message, 'success' | 'error' | 'info', icon?)`
    aus `useApp()` – kein eigenes Toast-System bauen.
- **Leere Zustände** nie als leere Seite: kurzer Text, was fehlt, und was man tun
  kann (Vorbild: `copy.empty` / `copy.emptyHint` in `FarAwayTab.tsx`), z. B.
  "Noch keine Events in deiner Nähe – vergrößere den Radius oder schau später
  wieder vorbei."
- **Fehlermeldungen** verständlich und mit nächstem Schritt ("Kommentar konnte
  nicht gesendet werden – prüfe deine Verbindung und versuch es nochmal."), keine
  technischen Codes.
- **Buttons** sagen, was passiert ("Event speichern" statt "OK").
- **Texte und Sprache:** Die App ist mehrsprachig (`useLanguage()` →
  `t.*` aus `src/lib/translations.ts`, 8 Sprachen, Standard Englisch). Gibt es für
  eine Komponente schon Übersetzungen, neue Texte dort in **allen** Sprachen
  ergänzen. Sonst im Stil der Komponente bleiben (meist Englisch) und den Nutzer
  fragen, ob übersetzt werden soll.
- **Barrierefreiheit:**
  - Kontrast mindestens 4.5:1 für Text (auf `#0f0d14` reichen `#888899` und
    heller; `#555566`/`#666677` nur für Deko, nicht für lesbaren Text).
  - Bedienung per Tastatur: echte `<button>`/`<a>` statt klickbarer `<div>`,
    sichtbarer Fokus (z. B. `focus-visible:ring-2 focus-visible:ring-nova-violet`).
  - Klickflächen mindestens 44 × 44 px (`min-h-11 min-w-11`), auch bei Icon-Buttons.
  - Icon-Buttons ohne Text brauchen `aria-label`.
  - Bilder brauchen sinnvolles `alt` (Deko-Bilder `alt=""`).

## Ablauf bei einer UI-Änderung

1. Komponente lesen, verstehen, welche Teile Logik sind – die bleiben unangetastet.
2. Nur Markup/Klassen/Texte ändern, Werte aus dem Design-System oben nehmen.
3. `npm run typecheck` und `npm run lint` laufen lassen.
4. Jede Änderung dem Nutzer in einem einfachen Satz erklären.
