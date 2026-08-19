#!/usr/bin/env bash
# Prüft, dass **jede** Adresse, die die App kennt, auch bedient wird.
#
#     betrieb/pruefe-adressen.sh            # dev
#     UMGEBUNG=prod betrieb/pruefe-adressen.sh
#
# ## Warum es das gibt
#
# Eine App trägt ihre Serveradresse fest eingebaut in sich. Wer nicht
# aktualisiert, spricht bis in alle Zukunft den Namen an, der beim Bauen
# seiner Fassung galt — und ein Name, der kein Zertifikat mehr bekommt, macht
# diese Telefone nicht langsamer, sondern **tot**. Mit einer Meldung über den
# Server obendrein, die niemanden auf den Gedanken bringt, dass eine
# Aktualisierung hilft.
#
# Genau das war am 19.08.2026 der Fall: `api.bockelbrink.net` zeigte auf die
# Maschine, wurde dort aber nicht bedient. DNS grün, Verbindung tot — von
# außen nicht zu unterscheiden von „Server kaputt".
#
# Die Liste der Namen kommt aus `app.config.js` und wird hier **nicht**
# wiederholt. Eine zweite Liste liefe auseinander, und zwar unbemerkt: Der
# Fehler zeigt sich erst auf einem alten Telefon, das niemand zur Hand hat.
set -euo pipefail

UMGEBUNG=${UMGEBUNG:-dev}
SKRIPT_ORT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Die Domains aus derselben Quelle wie der Bau. `associatedDomains` trägt das
# Präfix `applinks:` — das muss weg, hier steht der nackte Name.
#
# Kein `mapfile`: Das gibt es erst ab Bash 4, und macOS liefert bis heute
# 3.2 aus. Das Skript soll auf dem Rechner laufen, auf dem entwickelt wird,
# nicht nur auf dem Server.
NAMEN=()
while IFS= read -r zeile; do
  [ -n "$zeile" ] && NAMEN+=("$zeile")
done < <(cd "$SKRIPT_ORT/.." && UMGEBUNG="$UMGEBUNG" node --input-type=module -e "
  const { baueKonfiguration } = await import('./app.config.js');
  for (const d of baueKonfiguration(process.env.UMGEBUNG).expo.ios.associatedDomains)
    console.log(d.replace('applinks:', ''));
")

if [ ${#NAMEN[@]} -eq 0 ]; then
  echo "FEHLGESCHLAGEN: app.config.js nennt für '$UMGEBUNG' keine einzige Domain." >&2
  exit 1
fi

echo "Umgebung $UMGEBUNG — ${#NAMEN[@]} Adresse(n) aus app.config.js"
echo ""

gescheitert=0

# Erwartet wird die Kennung aus dem Bündel derselben Umgebung. Sie steht in
# der ausgelieferten Datei **und** in der App; laufen sie auseinander,
# verwirft iOS die Datei stumm und der geteilte Link öffnet den Browser.
BUENDEL=$(cd "$SKRIPT_ORT/.." && UMGEBUNG="$UMGEBUNG" node --input-type=module -e "
  const { baueKonfiguration } = await import('./app.config.js');
  console.log(baueKonfiguration(process.env.UMGEBUNG).expo.ios.bundleIdentifier);
")

# Die AASA-Datei der ersten Adresse ist der Maßstab: Alle weiteren Namen
# bedienen denselben Stand und müssen deshalb dieselbe Datei liefern. Wären
# sie verschieden, öffnete ein alter Link zwar die App — aber die falsche.
massstab=''

for name in "${NAMEN[@]}"; do
  printf '%-32s ' "$name"

  # `|| true` und **kein** `|| echo '000'`: Bei einer gescheiterten
  # Verbindung schreibt curl selbst schon `000` und endet non-zero — beides
  # zusammen ergab `000000`, und die Sonderbehandlung darunter griff nicht
  # mehr. Gefunden bei der Gegenprobe gegen den noch nicht ausgerollten
  # Vereinsstand.
  gesundheit=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "https://$name/gesundheit" 2>/dev/null || true)
  gesundheit=${gesundheit:-000}
  if [ "$gesundheit" != '200' ]; then
    # `000` heißt „gar keine Verbindung" und ist hier der wahrscheinlichste
    # Fall: fehlendes Zertifikat, weil der Name nicht in `API_DOMAIN` oder
    # `API_DOMAIN_ZUSATZ` steht (`betrieb/.env`).
    if [ "$gesundheit" = '000' ]; then
      echo "FEHLGESCHLAGEN — keine Verbindung (Zertifikat? API_DOMAIN_ZUSATZ?)"
    else
      echo "FEHLGESCHLAGEN — /gesundheit antwortet $gesundheit"
    fi
    gescheitert=$((gescheitert + 1))
    continue
  fi

  aasa=$(curl -s -m 15 "https://$name/.well-known/apple-app-site-association" 2>/dev/null || true)
  if ! printf '%s' "$aasa" | grep -q "\.$BUENDEL\""; then
    echo "FEHLGESCHLAGEN — Universal Links nennen nicht $BUENDEL"
    gescheitert=$((gescheitert + 1))
    continue
  fi

  if [ -z "$massstab" ]; then
    massstab=$aasa
  elif [ "$aasa" != "$massstab" ]; then
    echo "FEHLGESCHLAGEN — andere Universal-Links-Datei als ${NAMEN[0]}"
    gescheitert=$((gescheitert + 1))
    continue
  fi

  echo "in Ordnung"
done

echo ""
if [ "$gescheitert" -gt 0 ]; then
  echo "$gescheitert Adresse(n) nicht erreichbar."
  echo "Alte Namen gehören in API_DOMAIN_ZUSATZ (betrieb/.env), durch Leerzeichen getrennt."
  exit 1
fi
echo "Alle Adressen bedienen denselben Stand."
