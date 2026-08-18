# 12a — Das Profilbild erscheint nicht am Namen

**Gemeldet:** „Der Upload geht, im Profil kommt es an, aber ich sehe es nicht
als Icon am Namen."

Das ist kein Designproblem. Das Bild wird hochgeladen, gespeichert und
ausgeliefert — es wird an zwei Stellen nur nicht angezeigt.

## Ursache 1 — die Kopfleiste übergibt gar kein Bild

`src/ui/KopfLeiste.tsx`, im angemeldeten Zweig:

```tsx
<Avatar name={email ?? ''} size={34} />
```

`Avatar` nimmt ein `uri` entgegen und zeigt ohne dieses immer die Initialen
(`src/ui/Avatar.tsx`). Hier wird es nie übergeben. Zusätzlich steht als
`name` die **Adresse** statt des Namens — die Initialen sind dadurch auch
noch die falschen (`m` aus `marco@…` statt `MB`).

`useKonto()` hat beides bereits: `name` und `avatarUrl`
(`src/konto/KontoContext.tsx`, aus `GET /konto`).

**Fix:**

```tsx
const { angemeldet, laedt, email, name, avatarUrl, api } = useKonto();
…
<Avatar
  name={name ?? email ?? ''}
  uri={avatarUrl ? api.bildQuelle(avatarUrl).uri : null}
  size={34}
/>
```

`api.bildQuelle()` ist der Weg, den `AnmeldeKarte.tsx` schon geht — es macht
aus dem Serverpfad eine ladbare Adresse mit Zugang.

## Ursache 2 — die Familienliste gibt den rohen Pfad weiter

`src/features/familie/FamilienGruppe.tsx`:

```tsx
<Avatar name={profil.name ?? '?'} uri={profil.avatarUrl} size={40} />
```

`profil.avatarUrl` ist ein Serverpfad, keine ladbare Adresse. Auch hier muss
`api.bildQuelle(profil.avatarUrl).uri` davor — sonst bleibt es bei Initialen,
obwohl ein Bild gesetzt ist.

## Nach dem Upload sofort sichtbar

`AvatarBlatt` ruft `beimAendern()` auf. Sicherstellen, dass der Aufrufer dort
`kontoNeuLaden()` aus `useKonto()` übergibt (bei einem Familienprofil:
die Profilliste neu laden). Ohne das steht in der Kopfleiste bis zum
Neustart das alte Bild.

Falls der Server unter derselben Adresse ein neues Bild ausliefert: der
Antwortpfad braucht einen Stempel (`?v=<zeit>`), sonst zeigt der
Bild-Zwischenspeicher weiter das alte. Prüfen, was
`api/src/familie.ts:setzeAvatar` zurückgibt.

## Dazu, wenn es schnell geht

Der Avatar gehört überall dorthin, wo ein Name steht — heute fehlt er in der
Teilnehmerliste (`app/jugend/[id].tsx`) und bei den Guide-Antworten
(`GuideKarte.tsx`). Gleiche Person, gleiche Farbe, wiedererkennbar. Siehe
`12a` im Entwurf.

## Akzeptanzkriterien

- Angemeldet mit gesetztem Bild: Kopfleiste zeigt das Foto, nicht die
  Initialen.
- Ohne Bild: Initialen aus dem **Namen** (`MB`), nicht aus der Adresse.
- Familienliste zeigt gesetzte Bilder der Kinder.
- Direkt nach dem Upload, ohne App-Neustart, ist das neue Bild oben zu sehen.
- `tests/avatar.test.ts` bleibt grün.
