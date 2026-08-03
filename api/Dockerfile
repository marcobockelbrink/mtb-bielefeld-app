# Node 26: Die Skripte nutzen --experimental-strip-types, das gibt es erst
# ab 22.6 (siehe engines in package.json).
FROM node:26-alpine

WORKDIR /app

# Die geteilten Parser-Module liegen außerhalb von api/ — das Abbild wird
# deshalb aus dem Wurzelverzeichnis gebaut (siehe context in der
# compose-Datei), nicht aus api/.
COPY package.json package-lock.json ./
COPY api/package.json api/package-lock.json ./api/

# Nur die Abhängigkeiten der API, nicht die der App: Expo, React Native und
# die Schriften haben im Serverabbild nichts zu suchen. `npm ci` liest
# package.json und package-lock.json aus dem aktuellen Verzeichnis (nicht
# aus der Wurzel) — das `cd api` davor ist deshalb nötig, ein `--prefix`
# würde stattdessen nach der Wurzel suchen.
RUN cd api && npm ci --omit=dev

COPY src ./src
COPY api/src ./api/src

WORKDIR /app/api

# Ohne diese Angabe startet Node als PID 1 und bekommt kein SIGTERM sauber
# weitergereicht — ein `docker stop` würde dann zehn Sekunden warten und
# hart abschießen.
STOPSIGNAL SIGTERM

EXPOSE 3000
CMD ["node", "--experimental-strip-types", "src/start.ts"]
