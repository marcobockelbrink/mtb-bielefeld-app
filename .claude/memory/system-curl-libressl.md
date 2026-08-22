---
name: system-curl-libressl
description: Das System-curl auf diesem Mac scheitert an app.mtb-bielefeld.de, obwohl der Server gesund ist — LibreSSL 3.3.6, nicht der Server
metadata:
  type: reference
---

Am 22.08.2026 habe ich den Vereinsserver für tot erklärt, weil `curl`
abbrach:

    curl: (35) LibreSSL/3.3.6: error:1404B438:SSL routines:
          ST_CONNECT:tlsv1 alert internal error

Der Server war völlig in Ordnung: gültiges Zertifikat bis 20.11.2026,
`/gesundheit` mit 200 und `"zustand":"bereit"`. Das System-`curl` von
macOS ist gegen **LibreSSL 3.3.6** (Apple SecureTransport) gebaut und
scheitert dort, wo OpenSSL 3.6.3 problemlos durchkommt.

    curl --version | head -1
    → curl 8.7.1 … (SecureTransport) LibreSSL/3.3.6

**Tückisch, weil es nicht durchgängig ist:** gegen
`app-dev.mtb-bielefeld.de` funktioniert dasselbe `curl` einwandfrei. Der
Unterschied sieht deshalb nach „ein Server kaputt, einer heil" aus statt
nach einem Client-Fehler.

Gegenprobe, bevor man einen TLS-Fehler dem Server anlastet — Pythons `ssl`
benutzt das echte OpenSSL:

    python3 -c "
    import urllib.request
    r=urllib.request.urlopen('https://app.mtb-bielefeld.de/gesundheit',timeout=15)
    print(r.status, r.read().decode())"

Siehe auch [[betterstack-waechter]]: Better Stack meldete die ganze Zeit
korrekt `up`, während ich der eigenen Messung mehr glaubte als dem Dienst.
Vgl. [[lokal-gruen-ist-nicht-ci-gruen]] — dieselbe Richtung, umgekehrtes
Vorzeichen.
