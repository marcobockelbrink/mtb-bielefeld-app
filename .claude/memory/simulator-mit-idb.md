---
name: simulator-mit-idb
description: "idb tippt und liest die Oberfläche im Simulator — mit drei Eigenheiten, die stumm falsche Ergebnisse liefern"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 9594adb8-6d4b-46e0-b2ff-87ebf8679fee
  modified: 2026-08-07T14:42:10.115Z
---

Seit dem 07.08.2026 ist `idb` installiert (`brew install idb-companion`,
`pip install --user fb-idb`; die Kommandozeile liegt unter
`~/Library/Python/3.9/bin/idb`, also `export PATH="$HOME/Library/Python/3.9/bin:$PATH"`).

```bash
idb connect <UDID>                       # UDID aus `xcrun simctl list devices booted`
idb ui describe-all --udid <UDID>        # alle Elemente samt frame (in Punkten)
idb ui tap --udid <UDID> <x> <y>
idb ui text --udid <UDID> "…"
```

**Drei Eigenheiten, jede hat schon Zeit gekostet:**

1. **`idb ui text` verliert bei langen Zeichenketten das Ende.** Eine
   E-Mail-Adresse kam einmal als `…@ex` an, einmal als `…@example` —
   beides ohne Fehlermeldung. In Häppchen von sechs bis acht Zeichen
   tippen und den Feldinhalt danach über `AXValue` **nachlesen**, nie
   annehmen.
2. **Koordinaten vor jedem Tippen neu lesen.** Tastatur und
   Formularmeldungen verschieben die Ansicht; ein gemerkter Wert trifft
   danach etwas anderes. Mehrfach passiert: Der Tipp landete auf einem
   Reiter, und die App sprang weg.
3. **`codesign -d --entitlements` lügt bei Simulator-Programmen** (meldet
   leeres `[Dict]`). Die Berechtigungen stehen im Abschnitt
   `__TEXT,__entitlements`, lesbar mit `otool -X -s __TEXT __entitlements`
   — die Wörter stehen dort umgedreht. Wer dem `codesign` glaubt und von
   Hand nachsigniert, zerstört die App: Das Nachsignieren nur der äußeren
   Hülle bricht das Siegel der eingebetteten Bibliotheken.

**Und die teuerste, die nichts mit idb zu tun hat:** `expo run:ios`
benutzt einen **bereits laufenden Metro** weiter, statt ihn neu zu
starten. `npm run ios:dev` setzt dann `EXPO_PUBLIC_API_URL` zwar für den
Bau, aber nicht für den laufenden Metro — die App spricht mit dem
falschen Server, und nirgends steht etwas anderes. Vor einem Wechsel der
Umgebung deshalb `pkill -f "expo start"`.

**Why:** Alle vier scheitern stumm. Ein Gerätetest, der auf einer dieser
Fallen steht, meldet grün und beweist nichts — genau die Sorte Fehler, die
dieses Projekt am teuersten bezahlt hat.

**How to apply:** Vor jedem Nachweis auf dem Simulator lesen. Verwandt:
[[ios-geraetebau-push-berechtigung]], [[lokal-gruen-ist-nicht-ci-gruen]]
