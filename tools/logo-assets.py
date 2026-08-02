#!/usr/bin/env python3
"""Erzeugt die App-Symbole aus dem Vereinslogo.

Ausgangsdatei ist ``assets/logo/MTB_Bielefeld_EV_Logo.eps`` — das Original vom
Verein, eine Vektordatei aus CorelDRAW.

## Was dabei zu beachten war

1. **Es ist eine DOS-EPS-Datei.** Die ersten 30 Bytes sind ein Binärkopf mit
   Verweisen auf den PostScript-Teil und eine TIFF-Vorschau. Ghostscript will
   nur den PostScript-Teil sehen.

2. **Die Datei enthält eine Schneidekontur.** Das Original ist eine
   Aufkleber-Vorlage; die magentafarbene Umrandung (Sonderfarbe ``CutContour``)
   ist die Schnittlinie der Druckerei und gehört nicht ins Logo. Sie liegt
   außerhalb des Emblems und fällt beim Zuschnitt weg.

3. **Die hellen Bildteile sind Aussparungen, keine weiße Farbe.** Turm, Hügel
   und Trail sind Löcher in der blauen Fläche. Wer das Emblem einfach
   freistellt, bekommt durchsichtige statt weißer Flächen. Deshalb wird die
   Silhouette rekonstruiert und die Löcher gezielt weiß gefüllt.

## Aufruf

    python3 tools/logo-assets.py

Nötig sind Ghostscript sowie die Python-Pakete Pillow, numpy und scipy.
Das Skript läuft selten — es wird nur gebraucht, wenn der Verein sein Logo
ändert.
"""

from __future__ import annotations

import re
import struct
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

WURZEL = Path(__file__).resolve().parent.parent
QUELLE = WURZEL / "assets/logo/MTB_Bielefeld_EV_Logo.eps"
ZIEL = WURZEL / "assets"
ARBEIT = WURZEL / ".logo-arbeit"

def vereinsblau() -> tuple[int, int, int]:
    """Liest das Vereinsblau aus ``src/brand.ts``.

    Bewusst gelesen statt hier noch einmal hingeschrieben: Eine zweite Stelle
    für dieselbe Farbe läuft irgendwann auseinander, und dann hat das
    App-Symbol einen anderen Blauton als die Oberfläche.
    """
    quelle = (WURZEL / "src/brand.ts").read_text(encoding="utf-8")
    treffer = re.search(r"BRAND_BLUE\s*=\s*'#([0-9a-fA-F]{6})'", quelle)
    if not treffer:
        raise SystemExit("BRAND_BLUE nicht in src/brand.ts gefunden")
    hexwert = treffer.group(1)
    return tuple(int(hexwert[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


BLAU = None  # wird in main() gesetzt

#: Auflösung fürs Rendern. Hoch genug, dass das Emblem deutlich über 1024 px
#: breit herauskommt und beim Verkleinern nichts ausfranst.
DPI = 1600


def postscript_herausloesen(eps: Path, ziel: Path) -> None:
    """Schneidet den PostScript-Teil aus einer DOS-EPS-Datei."""
    daten = eps.read_bytes()
    if daten[:4] != b"\xc5\xd0\xd3\xc6":
        # Schon reines PostScript — unverändert übernehmen.
        ziel.write_bytes(daten)
        return
    versatz, laenge = struct.unpack("<2I", daten[4:12])
    ziel.write_bytes(daten[versatz : versatz + laenge])


def rendern(eps: Path, ziel: Path) -> Image.Image:
    subprocess.run(
        [
            "gs", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-dEPSCrop",
            "-sDEVICE=pngalpha", f"-r{DPI}",
            "-dTextAlphaBits=4", "-dGraphicsAlphaBits=4",
            f"-sOutputFile={ziel}", str(eps),
        ],
        check=True,
        capture_output=True,
    )
    return Image.open(ziel).convert("RGBA")


def emblem_ausschneiden(bild: Image.Image) -> Image.Image:
    """Findet das blaue Quadrat links im Banner und schneidet es aus."""
    feld = np.array(bild)
    r, g, b, a = feld[..., 0], feld[..., 1], feld[..., 2], feld[..., 3]
    ist_blau = (a > 128) & (b > 100) & (r < 100) & (b.astype(int) > r.astype(int) + 40)

    spalten = np.where(ist_blau.any(axis=0))[0]
    zeilen = np.where(ist_blau.any(axis=1))[0]
    if len(spalten) == 0:
        raise SystemExit("Kein blaues Emblem gefunden — hat sich das Logo geändert?")

    # Nur der zusammenhängende Block ganz links ist das Emblem; rechts davon
    # steht der Schriftzug.
    luecken = np.where(np.diff(spalten) > 50)[0]
    ende = spalten[luecken[0]] if len(luecken) else spalten[-1]
    return bild.crop((int(spalten[0]), int(zeilen[0]), int(ende) + 1, int(zeilen[-1]) + 1))


def silhouette_und_zeichnung(emblem: Image.Image) -> tuple[np.ndarray, np.ndarray]:
    """Trennt die Umrissfläche des Emblems von den Aussparungen darin.

    Die Aussparungen sind Turm, Hügel und Trail. Naheliegend wäre
    ``binary_fill_holes`` — das erfasst aber nur vollständig eingeschlossene
    Löcher. Trail und Hügel reichen bis an den Rand des Emblems und blieben so
    außen vor; übrig blieben nur die Zinnen des Turms.

    Der Umriss ist ein abgerundetes Quadrat und damit konvex. Für eine konvexe
    Form genügt es, jede Zeile zwischen dem ersten und letzten blauen Punkt zu
    füllen — das ergibt den Umriss exakt.
    """
    alpha = np.array(emblem)[..., 3]
    blau = alpha > 128

    umriss = np.zeros_like(blau)
    for zeile in range(blau.shape[0]):
        treffer = np.flatnonzero(blau[zeile])
        if treffer.size:
            umriss[zeile, treffer[0] : treffer[-1] + 1] = True

    # Senkrecht dasselbe und beides schneiden: fängt die abgerundeten Ecken
    # sauberer ab als der waagerechte Durchlauf allein.
    senkrecht = np.zeros_like(blau)
    for spalte in range(blau.shape[1]):
        treffer = np.flatnonzero(blau[:, spalte])
        if treffer.size:
            senkrecht[treffer[0] : treffer[-1] + 1, spalte] = True

    umriss &= senkrecht
    zeichnung = umriss & ~blau
    return umriss, zeichnung


def app_symbol(emblem: Image.Image, kante: int = 1024) -> Image.Image:
    """Vollflächiges Symbol: blaue Fläche, Zeichnung in Weiß.

    Randlos, weil iOS und Android ihre eigene Eckenrundung darüberlegen. Bliebe
    die Rundung des Logos stehen, entstünden helle Ecken unter der Maske.
    """
    _, zeichnung = silhouette_und_zeichnung(emblem)

    hoehe, breite = zeichnung.shape
    feld = np.zeros((hoehe, breite, 4), dtype=np.uint8)
    feld[..., 0:3] = BLAU
    feld[..., 3] = 255
    feld[zeichnung] = (255, 255, 255, 255)

    return Image.fromarray(feld, "RGBA").resize((kante, kante), Image.LANCZOS)


def zeichnung_freigestellt(emblem: Image.Image, kante: int, anteil: float) -> Image.Image:
    """Weiße Zeichnung auf durchsichtigem Grund, mittig und verkleinert.

    Für Androids anpassbares Symbol: Das System beschneidet den Rand je nach
    Gerät unterschiedlich, deshalb muss die Zeichnung deutlich innerhalb der
    Fläche bleiben (``anteil``).
    """
    _, zeichnung = silhouette_und_zeichnung(emblem)

    hoehe, breite = zeichnung.shape
    feld = np.zeros((hoehe, breite, 4), dtype=np.uint8)
    feld[zeichnung] = (255, 255, 255, 255)
    vordergrund = Image.fromarray(feld, "RGBA")

    innen = int(kante * anteil)
    vordergrund = vordergrund.resize((innen, innen), Image.LANCZOS)

    flaeche = Image.new("RGBA", (kante, kante), (0, 0, 0, 0))
    versatz = (kante - innen) // 2
    flaeche.paste(vordergrund, (versatz, versatz), vordergrund)
    return flaeche


def banner_zuschneiden(bild: Image.Image) -> Image.Image:
    """Das vollständige Logo ohne die Schneidekontur der Druckerei."""
    feld = np.array(bild)
    r, g, b, a = feld[..., 0], feld[..., 1], feld[..., 2], feld[..., 3]

    sichtbar = a > 128
    # Magenta der Schneidekontur ausschließen.
    schnittlinie = sichtbar & (r > 180) & (b > 120) & (g < 120)
    inhalt = sichtbar & ~schnittlinie

    spalten = np.where(inhalt.any(axis=0))[0]
    zeilen = np.where(inhalt.any(axis=1))[0]
    return bild.crop((int(spalten[0]), int(zeilen[0]), int(spalten[-1]) + 1, int(zeilen[-1]) + 1))


def auf_breite(bild: Image.Image, breite: int) -> Image.Image:
    hoehe = round(bild.height * breite / bild.width)
    return bild.resize((breite, hoehe), Image.LANCZOS)


def schrift_aufhellen(bild: Image.Image) -> Image.Image:
    """Fassung fürs dunkle Farbschema: schwarzer Schriftzug wird weiß.

    Das Original ist für weißes Papier gedacht. Auf dunklem Grund verschwände
    "MTB Bielefeld e.V." sonst vollständig. Das blaue Emblem bleibt unberührt —
    es trägt genug Kontrast in beide Richtungen.
    """
    feld = np.array(bild).copy()
    r, g, b, a = feld[..., 0], feld[..., 1], feld[..., 2], feld[..., 3]
    dunkel = (a > 0) & (r < 90) & (g < 90) & (b < 90)
    feld[dunkel, 0:3] = 255
    return Image.fromarray(feld, "RGBA")


def main() -> None:
    global BLAU
    BLAU = vereinsblau()

    if not QUELLE.exists():
        raise SystemExit(f"Logo nicht gefunden: {QUELLE}")

    ARBEIT.mkdir(exist_ok=True)
    rein = ARBEIT / "logo.eps"
    postscript_herausloesen(QUELLE, rein)
    banner = rendern(rein, ARBEIT / "logo.png")

    emblem = emblem_ausschneiden(banner)
    print(f"Emblem gefunden: {emblem.width}x{emblem.height} px")

    erzeugt: list[tuple[str, Image.Image]] = [
        # iOS und der allgemeine Fallback.
        ("icon.png", app_symbol(emblem, 1024)),
        # Android, anpassbares Symbol: Zeichnung im sicheren Bereich (66 %).
        ("android-icon-foreground.png", zeichnung_freigestellt(emblem, 1024, 0.66)),
        # Einfarbige Fassung für Androids Themen-Symbole.
        ("android-icon-monochrome.png", zeichnung_freigestellt(emblem, 1024, 0.66)),
        ("favicon.png", app_symbol(emblem, 96)),
        # Startbild: das vollständige Logo mit Schriftzug, hell und dunkel.
        ("splash-icon.png", auf_breite(banner_zuschneiden(banner), 1200)),
        ("splash-icon-dark.png", schrift_aufhellen(auf_breite(banner_zuschneiden(banner), 1200))),
    ]

    for name, bild in erzeugt:
        pfad = ZIEL / name
        bild.save(pfad)
        print(f"  {name}: {bild.width}x{bild.height}")

    # Einfarbige Hintergrundfläche für Androids anpassbares Symbol.
    grund = Image.new("RGBA", (1024, 1024), (*BLAU, 255))
    grund.save(ZIEL / "android-icon-background.png")
    print("  android-icon-background.png: 1024x1024 (einfarbig)")

    # Das vollständige Logo für die README.
    (WURZEL / "docs").mkdir(exist_ok=True)
    auf_breite(banner_zuschneiden(banner), 900).save(WURZEL / "docs/logo.png")
    print("  docs/logo.png: 900 px breit")

    print(f"\nVereinsblau aus src/brand.ts: #{BLAU[0]:02X}{BLAU[1]:02X}{BLAU[2]:02X}")


if __name__ == "__main__":
    sys.exit(main())
