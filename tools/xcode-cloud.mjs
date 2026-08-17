/**
 * Xcode-Cloud-Läufe und ihre Protokolle von der Kommandozeile lesen.
 *
 *     node tools/xcode-cloud.mjs laeufe
 *     node tools/xcode-cloud.mjs protokoll <lauf-id>
 *     node tools/xcode-cloud.mjs protokoll letzter
 *
 * ## Warum es das gibt
 *
 * Ein fehlgeschlagener Bau in der Cloud ist sonst nur über die Weboberfläche
 * einzusehen — und wer daran arbeitet, müsste die entscheidenden Zeilen von
 * Hand herüberkopieren. Beim Einrichten am 17.08.2026 war genau das der
 * Engpass.
 *
 * ## Zugangsdaten
 *
 * Nichts davon steht im Repository, und das ist Absicht: Das Repository ist
 * öffentlich.
 *
 * - Der private Schlüssel liegt unter
 *   `~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8` — der Ort, an dem
 *   auch Apples eigene Werkzeuge suchen. `.gitignore` deckt `*.p8` ab, aber
 *   verlassen sollte man sich darauf nicht: Er gehört nicht ins
 *   Arbeitsverzeichnis.
 * - Kennung und Aussteller kommen aus der Umgebung:
 *
 *       export ASC_KEY_ID=...      # steht im Dateinamen des Schlüssels
 *       export ASC_ISSUER_ID=...   # die UUID über der Schlüsselliste in ASC
 *
 * Angelegt werden beide in App Store Connect unter **Benutzer und Zugriff ▸
 * Integrationen ▸ App Store Connect API**. Für Xcode Cloud genügt die Rolle
 * *Developer*.
 *
 * ## Warum ohne Bibliothek
 *
 * Der Zugang ist ein JWT mit ES256, und Node kann das seit Fassung 15 von
 * sich aus. Eine Abhängigkeit für sechzig Zeilen Signatur wäre in einem
 * Projekt, das seine Pakete über `expo install` festzurrt, der schlechtere
 * Tausch.
 */

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const KEY_ID = process.env.ASC_KEY_ID;
const ISSUER_ID = process.env.ASC_ISSUER_ID;
const BASIS = 'https://api.appstoreconnect.apple.com/v1';

function scheitere(text) {
  console.error(`FEHLGESCHLAGEN: ${text}`);
  process.exit(1);
}

if (!KEY_ID) scheitere('ASC_KEY_ID fehlt — die Kennung steht im Dateinamen des Schlüssels.');
if (!ISSUER_ID) scheitere('ASC_ISSUER_ID fehlt — die UUID über der Schlüsselliste in App Store Connect.');

const SCHLUESSEL_PFAD = path.join(homedir(), '.appstoreconnect', 'private_keys', `AuthKey_${KEY_ID}.p8`);

function base64url(daten) {
  return Buffer.from(daten).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Der Zugangstoken. Apple lässt höchstens zwanzig Minuten zu; fünfzehn
 * reichen für jeden Aufruf hier und lassen Luft für eine ungenaue Uhr.
 */
function token() {
  let schluessel;
  try {
    schluessel = readFileSync(SCHLUESSEL_PFAD, 'utf8');
  } catch {
    scheitere(`${SCHLUESSEL_PFAD} nicht lesbar.`);
  }

  const kopf = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const jetzt = Math.floor(Date.now() / 1000);
  const inhalt = { iss: ISSUER_ID, iat: jetzt, exp: jetzt + 15 * 60, aud: 'appstoreconnect-v1' };

  const kern = `${base64url(JSON.stringify(kopf))}.${base64url(JSON.stringify(inhalt))}`;
  const unterschrift = createSign('SHA256')
    .update(kern)
    .end()
    // **`ieee-p1363` ist nicht optional.** Node liefert sonst eine
    // DER-verpackte Signatur, und JWT verlangt die nackten R- und S-Werte
    // hintereinander. Der Unterschied äußert sich in einem 401, das wie ein
    // falscher Schlüssel aussieht und keiner ist.
    .sign({ key: schluessel, dsaEncoding: 'ieee-p1363' });

  return `${kern}.${base64url(unterschrift)}`;
}

const ZUGANG = token();

async function hole(pfad) {
  const antwort = await fetch(pfad.startsWith('http') ? pfad : `${BASIS}${pfad}`, {
    headers: { authorization: `Bearer ${ZUGANG}` },
  });
  if (!antwort.ok) {
    const text = await antwort.text();
    scheitere(`${antwort.status} bei ${pfad}\n${text.slice(0, 600)}`);
  }
  return antwort.json();
}

async function sende(pfad, koerper) {
  const antwort = await fetch(`${BASIS}${pfad}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ZUGANG}`, 'content-type': 'application/json' },
    body: JSON.stringify(koerper),
  });
  if (!antwort.ok) {
    const text = await antwort.text();
    scheitere(`${antwort.status} bei ${pfad}\n${text.slice(0, 600)}`);
  }
  return antwort.json();
}

/**
 * Einen Lauf anstoßen.
 *
 * Ohne Angabe eines Zweigs nimmt Xcode Cloud den, der am Workflow steht —
 * bei uns `main`, und zwar dessen aktuellen Stand. Das ist die gewollte
 * Bedeutung von „bau das, was jetzt gilt".
 *
 * **Das kostet Rechenzeit aus dem Kontingent des Vereins.** Deshalb nur auf
 * ausdrückliche Bitte, nicht nebenbei.
 */
async function starte(workflowName) {
  const produkte = await hole('/ciProducts');
  if (!produkte.data?.length) scheitere('Kein Xcode-Cloud-Produkt gefunden.');

  const workflows = await hole(`/ciProducts/${produkte.data[0].id}/workflows`);
  const passend = workflowName
    ? (workflows.data ?? []).find((w) => w.attributes?.name === workflowName)
    : workflows.data?.[0];

  if (!passend) {
    console.error('Vorhandene Workflows:');
    for (const w of workflows.data ?? []) console.error(`  ${w.attributes?.name}`);
    scheitere(workflowName ? `Kein Workflow namens „${workflowName}".` : 'Kein Workflow vorhanden.');
  }

  const ergebnis = await sende('/ciBuildRuns', {
    data: {
      type: 'ciBuildRuns',
      relationships: { workflow: { data: { type: 'ciWorkflows', id: passend.id } } },
    },
  });

  const a = ergebnis.data?.attributes ?? {};
  console.log(`Gestartet: ${passend.attributes?.name} — Lauf #${a.number ?? '?'}`);
  console.log(`Kennung:   ${ergebnis.data?.id}`);
}

/** Alle Läufe des Produkts, neueste zuerst. */
async function laeufe(anzahl = 10) {
  const produkte = await hole('/ciProducts');
  if (!produkte.data?.length) scheitere('Kein Xcode-Cloud-Produkt gefunden. Ist der Workflow angelegt?');

  const produkt = produkte.data[0];
  const runs = await hole(`/ciProducts/${produkt.id}/buildRuns?limit=${anzahl}`);

  console.log(`Produkt: ${produkt.attributes?.name ?? produkt.id}\n`);
  for (const lauf of runs.data ?? []) {
    const a = lauf.attributes ?? {};
    console.log(
      [
        `#${a.number ?? '?'}`.padEnd(6),
        (a.executionProgress ?? '').padEnd(10),
        (a.completionStatus ?? 'läuft').padEnd(10),
        (a.startedDate ?? a.createdDate ?? '').slice(0, 19).replace('T', ' '),
        lauf.id,
      ].join(' '),
    );
  }
  return runs.data ?? [];
}

/**
 * Die Protokolle eines Laufs.
 *
 * Ein Lauf besteht aus Aktionen (Post-Clone, Build, Archive …), und jede
 * hängt ihre Artefakte an. Die Protokolle stecken in einem Artefakt vom Typ
 * `LOG_BUNDLE`; die Datei dahinter ist ein Zip, also wird hier nur die
 * Adresse ausgegeben — sie gilt eine Weile und lässt sich mit `curl` holen.
 */
async function protokoll(laufId) {
  if (laufId === 'letzter') {
    const alle = await laeufe(1);
    if (!alle.length) scheitere('Kein Lauf vorhanden.');
    laufId = alle[0].id;
    console.log('');
  }

  const aktionen = await hole(`/ciBuildRuns/${laufId}/actions`);
  for (const aktion of aktionen.data ?? []) {
    const a = aktion.attributes ?? {};
    console.log(`\n── ${a.name ?? aktion.id} — ${a.completionStatus ?? a.executionProgress ?? '?'}`);

    if (a.issueCounts) {
      const { errors = 0, warnings = 0 } = a.issueCounts;
      if (errors || warnings) console.log(`   ${errors} Fehler, ${warnings} Warnungen`);
    }

    const artefakte = await hole(`/ciBuildActions/${aktion.id}/artifacts`);
    for (const artefakt of artefakte.data ?? []) {
      const at = artefakt.attributes ?? {};
      if (at.fileType === 'LOG_BUNDLE' || /log/i.test(at.fileName ?? '')) {
        console.log(`   ${at.fileName} (${at.fileSize} Bytes)`);
        console.log(`   ${at.downloadUrl}`);
      }
    }
  }
}

const [befehl, wert] = process.argv.slice(2);

if (befehl === 'laeufe') await laeufe(Number(wert) || 10);
else if (befehl === 'protokoll' && wert) await protokoll(wert);
else if (befehl === 'starte') await starte(wert);
else {
  console.log('Aufruf:');
  console.log('  node tools/xcode-cloud.mjs laeufe [anzahl]');
  console.log('  node tools/xcode-cloud.mjs protokoll <lauf-id|letzter>');
  console.log('  node tools/xcode-cloud.mjs starte [workflow-name]');
  process.exit(1);
}
