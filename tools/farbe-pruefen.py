#!/usr/bin/env python3
"""Rechnet die Druckfarbe des Vereins in Bildschirmfarben um und vergleicht sie.

Hintergrund: Verbindlich ist die Druckdefinition **C 90 | M 50 | Y 20 | K 5**.
Ein Bildschirm kennt aber kein CMYK, und die Umrechnung hat kein einzelnes
richtiges Ergebnis — sie hängt am Farbprofil. Dieses Skript macht die
Unterschiede messbar, damit die Wahl in ``src/theme.ts`` nachvollziehbar bleibt
und nicht nach Gefühl getroffen wird.

Gemessen wird in ΔE (CIE76): unter 2 ist für das Auge praktisch gleich, über 5
deutlich verschieden.

    python3 tools/farbe-pruefen.py

Nötig sind Pillow (mit ImageCms) und die ICC-Profile von Ghostscript.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageCms

#: Die verbindliche Druckdefinition des Vereins, in Prozent.
DRUCKFARBE_CMYK = (90, 50, 20, 5)

#: Was die App tatsächlich verwendet (siehe ``src/brand.ts``).
APP_BLAU = "25749E"

CMYK_PROFIL = Path("/usr/share/color/icc/ghostscript/default_cmyk.icc")
SRGB_PROFIL = Path("/usr/share/color/icc/ghostscript/srgb.icc")


def srgb_zu_lab(hexfarbe: str) -> tuple[float, float, float]:
    """sRGB nach CIELAB — die Grundlage für einen Abstand, der dem Sehen entspricht."""
    r, g, b = (int(hexfarbe[i : i + 2], 16) / 255 for i in (0, 2, 4))
    entgamma = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = entgamma(r), entgamma(g), entgamma(b)

    x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375
    y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750
    z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041

    bezug = (0.95047, 1.0, 1.08883)
    kruemmung = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = (kruemmung(w / n) for w, n in zip((x, y, z), bezug))
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def delta_e(erste: str, zweite: str) -> float:
    a, b = srgb_zu_lab(erste), srgb_zu_lab(zweite)
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def faustformel(cmyk: tuple[int, int, int, int]) -> str:
    """Die Umrechnung ohne Farbmanagement, wie sie Büroprogramme verwenden."""
    c, m, y, k = cmyk
    werte = [round(255 * (1 - v / 100) * (1 - k / 100)) for v in (c, m, y)]
    return "".join(f"{v:02X}" for v in werte)


def ueber_icc(cmyk: tuple[int, int, int, int]) -> str | None:
    """Farbmetrische Umrechnung über ICC-Profile."""
    if not (CMYK_PROFIL.exists() and SRGB_PROFIL.exists()):
        return None
    bild = Image.new("CMYK", (1, 1), tuple(round(v / 100 * 255) for v in cmyk))
    umwandlung = ImageCms.buildTransform(
        str(CMYK_PROFIL), str(SRGB_PROFIL), "CMYK", "RGB",
        renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC,
    )
    r, g, b = ImageCms.applyTransform(bild, umwandlung).getpixel((0, 0))
    return f"{r:02X}{g:02X}{b:02X}"


def main() -> None:
    c, m, y, k = DRUCKFARBE_CMYK
    print(f"Druckfarbe des Vereins: C {c} | M {m} | Y {y} | K {k}\n")

    kandidaten: dict[str, str | None] = {
        "Faustformel ohne Farbmanagement": faustformel(DRUCKFARBE_CMYK),
        "ICC-Umrechnung (CMYK → sRGB)": ueber_icc(DRUCKFARBE_CMYK),
        "Stylesheet der Vereinswebsite": "00679A",
    }

    print(f"in der App: #{APP_BLAU}\n")
    print(f"{'Weg':38}{'Ergebnis':>12}{'Abstand':>12}")
    for name, wert in kandidaten.items():
        if wert is None:
            print(f"{name:38}{'—':>12}{'(Profile fehlen)':>12}")
            continue
        print(f"{name:38}{'#' + wert:>12}{delta_e(APP_BLAU, wert):>11.1f}")

    print("\nΔE unter 2: für das Auge praktisch gleich. Über 5: deutlich verschieden.")


if __name__ == "__main__":
    main()
