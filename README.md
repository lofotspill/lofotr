# Lofotr – Røstnesvåg fiskevær (første runde: staden)

Eit 3D-spel i nettlesaren (Three.js). Dette er første steget: sjølve bygda, utan oppgåver enno.
Fisketokt er ikkje rørt – dette er eit eige spel.

## Slik får du det til å fungere
Spelet bruker moduler, så det kan ikkje opnast ved å dobbeltklikke på index.html.
1. Last opp heile mappa til eit GitHub-repo (t.d. `lofotr`).
2. Settings → Pages → Branch `main` / root → Save.
3. Opne adressa du får (t.d. `https://brukarnamn.github.io/lofotr/`).
(Lokalt: `python3 -m http.server` i mappa, så `http://localhost:8000`.)

## Styring
WASD gå · Shift spring · mus sjå seg om · E les/snakk · T dag/kveld · M lyd · Esc pause

## Mappa
- `js/content.js` – tekstene i spelet (nynorsk). Rediger her.
- `js/layout.js` – kor ting står: grenser, stiar, kai, startpunkt.
- `js/village.js` – hus, hjellar, båtar, sperringar og småting.
- `js/world.js`, `terrain.js`, `sky.js` – terreng, sjø, himmel og lys.
- `lib/` – Three.js (r187).
Ingen bildefiler: alle teksturar blir teikna av koden.
