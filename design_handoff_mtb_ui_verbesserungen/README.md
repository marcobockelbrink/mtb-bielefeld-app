# Handoff: MTB Bielefeld App — UI-Verbesserungen (Aktuelles-Filter, Einstellungen, Foto-Upload)

Ziel-Codebase: **marcobockelbrink/mtb-bielefeld-app** (main) — Expo / React Native, expo-router.

## Overview
Drei entschiedene UI-Verbesserungen aus dem Design-Review:
1. **Aktuelles (news.tsx):** Themenfilter-Umbau — Scroll-Zeile + Themen-Blatt (Design „2a")
2. **Einstellungen (einstellungen.tsx):** Vollbild-Seite statt halbhohem Sheet (Design „3b")
3. **Foto-Upload (fotos/[id].tsx):** fester Upload-Knopf + Upload-Sheet mit Bildvorschau (Design „4b") und sichtbarer Warteschlangen-Fortschritt im Raster (Design „4c")

## About the Design Files
`Aktuelles.dc.html` in diesem Paket ist eine **Design-Referenz in HTML** — ein Prototyp, der Aussehen und Verhalten zeigt, kein Produktionscode. Aufgabe: die Designs **in der bestehenden Expo/React-Native-Codebase nachbauen**, mit den vorhandenen Mustern (src/theme.ts, src/ui/components.tsx, expo-router). Kein HTML übernehmen.

## Fidelity
**High-fidelity.** Farben, Typografie und Abstände entsprechen dem bestehenden App-Theme (src/theme.ts) und sind pixelgenau gemeint. Alle Werte unten sind verbindlich, sofern sie nicht bereits als Token in theme.ts existieren — dann Token verwenden.

## Screens / Views

### 1. Aktuelles — Themenfilter „2a" (app/(tabs)/news.tsx)
**Problem heute:** dynamische Themen-Tags umbrechen in 3 Zeilen und schieben den ersten Beitrag unter die Falte.
**Neu:**
- **Scroll-Zeile:** eine einzige horizontal scrollbare Chip-Zeile (`ScrollView horizontal`, `showsHorizontalScrollIndicator={false}`), Chips `flex: none`, Gap 8, horizontales Padding 16. Rechts eine 36px breite Fade-Kante (Gradient von transparent → Hintergrundfarbe, `pointerEvents: none`), die signalisiert, dass es weitergeht.
- **Chip-Reihenfolge:** vorn ein „Themen"-Knopf (Icon `options-outline` 16px + Label, Textfarbe/Border Vereinsblau), dann „Alle" (aktiv = gefüllt Vereinsblau, weiße Schrift), dann die Themen.
- **Chip-Maße:** min-height **44px** (Tippziel), padding 0 12px, border-radius 6, border 1px #b7c2c8, Hintergrund #fbfcfd, Schrift Barlow Medium 15px #111c22. Aktiv: Hintergrund + Border #25749e, Schrift #fff.
- **Themen-Blatt (Bottom Sheet):** öffnet über den „Themen"-Knopf. Inhalt: Grabber (36×4, #b7c2c8, radius 2), Titelzeile „Themen wählen" (Barlow SemiBold 18 #111c22) mit „ZURÜCKSETZEN" rechts (Barlow Semi Condensed SemiBold 11, letter-spacing 0.9, uppercase, #495b65), darunter alle Themen als umbrechende Chips (Mehrfachauswahl, gleiche Chip-Maße), darunter Bestätigungs-Button „N Themen anzeigen" (min-height 48, radius 6, #25749e, Barlow SemiBold 16 #fff). Sheet: #fbfcfd, radius oben 16, padding 16/16/28, Backdrop rgba(17,28,34,.38).
- Mehrfachauswahl ersetzt die heutige Einzelauswahl; „Alle" setzt zurück.

### 2. Einstellungen — Vollbild „3b" (app/einstellungen.tsx)
**Problem heute:** halbhohes Sheet über „Termine", viel Inhalt scrollt in einem Teilausschnitt, der durchscheinende Screen lenkt ab.
**Neu:** eigene Vollbild-Seite im Stack.
- Router: in der Stack-Konfiguration für `/einstellungen` `presentation: 'card'` statt Sheet/Modal — Zurück-Pfeil kommt vom Stack.
- Header: Zurück-Chevron (`chevron-back`, 26px, #25749e) + Titel „Einstellungen" (Barlow Condensed Bold 27 #111c22), Hintergrund #fbfcfd.
- Inhalt unverändert (Konto-Karte, Erinnerungs-Toggle, „Wann erinnern?"-Chips, „Wofür erinnern?"), voller Scrollplatz. Erinnerungs-Chips min-height 44.
- Tabbar bleibt sichtbar (Seite liegt im Termine-Stack) — falls das Routing das nicht hergibt, ist eine Seite ohne Tabbar akzeptabel.

### 3. Foto-Upload „4b" + „4c" (app/fotos/[id].tsx)
**Probleme heute:** Upload-Knopf am Scrollende unter dem Raster; Einwilligung als nüchterner System-Alert ohne Blick auf die gewählten Bilder; während des Uploads nur ein Spinner — die vorhandene Warteschlange (src/features/fotos/warteschlange.ts) ist unsichtbar.

**4b — fester Knopf + Upload-Sheet:**
- Upload-Knopf raus aus dem ScrollView, in eine fixe Fußleiste: Container #fbfcfd, border-top 1px #b7c2c8, padding 10/16/20 (+ safe area). Button: Icon `images-outline` 18px + „Bilder hochladen", min-height 48, radius 6, #25749e, Barlow SemiBold 16 #fff.
- Nach der Bildauswahl statt `Alert.alert` ein Bottom Sheet: Grabber, Titel „N Bilder hochladen" (Barlow SemiBold 18), horizontale Reihe 64×64-Thumbnails (radius 6, Gap 6; ab 5+ Bildern letzte Kachel „+N", #d0d8dc, Barlow SemiBold 14 #495b65), Einwilligungs-Box (Hintergrund #dfe4e7, radius 8, padding 12, Barlow 13/19 #111c22 — Text: selbst aufgenommen, Personen einverstanden, Sichtung durch Vereinsverwaltung vor Freigabe), Primär-Button „Einverstanden, hochladen" (48px, #25749e), darunter „Abbrechen" (44px, textonly, Barlow SemiBold 15 #495b65).

**4c — sichtbarer Fortschritt im Raster:**
- Fortschritts-Karte über dem Raster: „3 von 5 hochgeladen" (Barlow SemiBold 14 #111c22), Fortschrittsbalken 4px (#d0d8dc-Spur, #25749e-Füllung), rechts „PAUSIEREN" (Meta-Stil 11px uppercase #25749e). Karte: #fbfcfd, border 1px rgba(183,194,200,.65), radius 8, padding 10 12.
- Zustands-Badges je Rasterkachel oben rechts (Barlow Semi Condensed SemiBold 9, letter-spacing 0.6, uppercase, weiß, padding 2 6): HOCHGELADEN #2e7d4f · LÄDT … #25749e (Kachel zusätzlich 2px Outline #25749e) · WARTET #495b65 (Kachel Opacity .55) · KEIN NETZ #8c5a16 (Opacity .55).
- Offline-Hinweis unter dem Raster: Banner #d0d8dc mit 3px Border-links #8c5a16, radius 3, padding 8 12, Barlow 13/19 #111c22 — „1 Bild wartet auf Netz — es bleibt gemerkt, auch nach einem Neustart."
- Datenquelle: die bestehende Warteschlange in warteschlange.ts liefert die Zustände; nur UI-Anbindung nötig.

## Interactions & Behavior
- Chips/Buttons: Pressed-State = Hintergrund eine Stufe dunkler (Vereinsblau → ~#1b587a) bzw. bei Outline-Chips leichte Tönung; Android Ripple ok.
- Sheets: von unten einschieben (~250ms ease-out), Backdrop-Tap und Runterwischen schließen.
- Themen-Blatt: Auswahl togglet sofort optisch, Filter wird erst mit „N Themen anzeigen" angewandt; „Zurücksetzen" leert die Auswahl (= „Alle").
- Upload: „Pausieren" hält die Warteschlange an (Toggle zu „Fortsetzen"); Badges aktualisieren live aus dem Warteschlangen-Status; Uploads überleben App-Neustart (bestehendes Verhalten beibehalten).
- Alle Tippziele ≥ 44px.

## State Management
- Aktuelles: `gewaehlteThemen: string[]` (leer = Alle), `themenBlattOffen: boolean`.
- Upload: `auswahl: Asset[]`, `uploadBlattOffen: boolean`; Fortschritt/Zustände aus warteschlange.ts (pro Bild: hochgeladen | laedt | wartet | keinNetz; global: pausiert).

## Design Tokens (aus src/theme.ts — vorhandene Token nutzen)
- Vereinsblau #25749e · Ink #111c22 · Sekundärtext #495b65 · Border #b7c2c8 · Karten-Border rgba(183,194,200,.65) · Flächen #fbfcfd · Screen-Hintergrund #dfe4e7 · Tint #d0d8dc · Ocker #8c5a16 · Erfolg #2e7d4f
- Schrift: Barlow (400/500/600), Barlow Condensed Bold (Screen-Titel), Barlow Semi Condensed SemiBold (Meta/Badges, uppercase, letter-spacing 0.9)
- Radius: Karten 10 · Chips/Buttons 6 · Sheets oben 16 · Banner 3
- Icons: Ionicons (settings-outline, options-outline, chevron-back, close-circle, images-outline, chevron-down)

## Assets
Keine neuen Assets. Bild-Platzhalter im Prototyp stehen für Beitragsbilder von der Website bzw. Nutzerfotos.

## Files
- `Aktuelles.dc.html` — der Prototyp. Abschnitt „2" = Aktuelles-Filter (2a), „3" = Einstellungen (3a Ist / 3b Ziel / 3c Alternative), „4" = Foto-Upload (4a Ist / 4b + 4c Ziel), „1" = frühere Filter-Varianten (nur Historie).
- `image-slot.js`, `support.js` — Laufzeit für den Prototyp, im Browser öffnen genügt.

Betroffene Repo-Dateien: app/(tabs)/news.tsx · app/einstellungen.tsx · Router-Stack-Konfiguration · app/fotos/[id].tsx · src/features/fotos/FotoRaster.tsx · src/features/fotos/warteschlange.ts (nur lesen) · src/theme.ts (Token-Quelle).
