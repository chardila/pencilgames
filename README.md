# Pencilgames

Juegos de lápiz y papel para jugar en familia en una sola tableta (modo
pasar-y-jugar). Ver `docs/superpowers/specs/2026-08-09-pencilgames-design.md`
para el diseño completo.

## Desarrollo

```bash
npm install
npm run dev      # servidor local
npm test         # tests de los engines
npm run build    # build de producción en dist/
```

## Modo remoto (jugar por internet)

Los 3 juegos soportan jugar entre dos computadoras por internet, uniéndose
con un código corto de sala. Arquitectura completa en
`docs/superpowers/specs/2026-08-17-juego-remoto-design.md`.

Para desarrollar/probar en local hace falta correr el Worker de
señalización además del sitio:

```bash
cd worker && npm install && npm run dev   # sirve en http://localhost:8787
# en otra terminal, desde la raíz del repo:
cp .env.example .env
npm run dev
```

El Worker vive en `worker/` (proyecto npm independiente, se despliega por
separado — ver el job `deploy-worker` en `.github/workflows/deploy.yml`).
Requiere una TURN key de Cloudflare Realtime configurada como secreto
(`wrangler secret put TURN_KEY_ID` / `TURN_KEY_API_TOKEN`, paso manual
único, ver Tarea 6 del plan de implementación).

## Cómo agregar un juego nuevo

1. Crea `src/content/juegos/<slug>.md` con el frontmatter (`title`,
   `description`, `icono`, `minJugadores`, `maxJugadores`) y las
   instrucciones en el cuerpo del markdown.
2. Crea `src/games/<slug>/engine.ts`: un motor puro (sin DOM) con un
   `createInitialState()` y una función de jugada que valida y devuelve un
   nuevo estado. Escríbelo con TDD — ver `src/games/tres-en-raya/engine.ts`
   y su `engine.test.ts` como referencia.
3. Crea `src/games/<slug>/Board.astro`: pinta el tablero y conecta los
   taps al engine, usando `renderTurnIndicator`/`ocultarTurnIndicator`
   (`src/lib/turnIndicator.ts`) y `showWinnerBanner`/`hideWinnerBanner`
   (`src/lib/winnerBanner.ts`) para mantener la UI consistente con los
   demás juegos. Usa `getPlayerNames()` (`src/lib/players.ts`) para el
   nombre de cada jugador en vez de "Jugador 1"/"Jugador 2" hardcodeado.
4. Registra el juego en `src/pages/juegos/[slug].astro`: agrega un
   `import` estático del `Board.astro` y una entrada en el objeto `BOARDS`.
   No uses `import()` dinámico con el slug como variable — rompe el build
   de Astro.
5. No se necesita tocar el índice (`src/pages/index.astro`) ni los
   componentes compartidos — se generan solos desde el content collection.
