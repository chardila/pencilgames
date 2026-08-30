# Identidad visual de jugadores y claridad de turno

Fecha: 2026-08-30
Estado: aprobado (diseño)

## Problema

Al jugar con niños, con frecuencia se confunde de quién es el turno. Dos
causas concretas, verificadas en el código:

1. **El indicador de turno no tiene identidad visual en 3 de 5 juegos.**
   `renderTurnIndicator` (`src/lib/turnIndicator.ts`) solo aplica los
   colores por jugador (`--color-player-1/2`) a los spans del *marcador*, y
   el marcador solo lo pasan Conquista y Puntos y Cajas. Tres en raya,
   Notakto y Agujero Negro muestran el turno como texto plano gris
   ("Turno de Ana"), sin color ni forma que distinga a un jugador del otro.

2. **En modo internet los dos jugadores ven exactamente lo mismo.**
   `gameSession.mostrarTurno` calcula la etiqueta con `nombres[jugador]` y
   nunca consulta `miAsiento`, aunque lo tiene en scope. Ningún jugador
   sabe cuál nombre es "yo", ni si está esperando o si le toca.

3. **Nombres iguales en remoto.** `nombresColisionan` solo protege el
   modal local. En remoto cada peer escribe su propio nombre; dos niños
   pueden ser ambos "Ana" y nada lo impide.

## Objetivo

Que en cualquiera de los 5 juegos, en cualquier modo, sea evidente de un
vistazo: quién es cada jugador, de quién es el turno, y (en remoto) cuál
jugador soy yo. Sin cambios de almacenamiento ni del protocolo remoto.

## Decisión de diseño (opción A)

Identidad **derivada del asiento**, no elegida por el jugador:

- Asiento 1 → color naranja (`--color-player-1`) + forma `●`.
- Asiento 2 → color azul (`--color-player-2`) + forma `▲`.

La forma acompaña al color para que la distinción también funcione sin
percibir color (daltonismo, impresión, modo alto contraste). Los colores y
las formas son fijos y no configurables. Esto cierra el problema de
nombres iguales de forma estructural: aunque ambos se llamen "Ana",
siempre hay una ficha `● Ana` naranja y otra `▲ Ana` azul.

## Componente: fila de fichas de jugador

El indicador de turno deja de ser una línea de texto y pasa a ser **dos
fichas lado a lado**, una por jugador, siempre visibles durante la
partida. La ficha del jugador activo se llena con su color; la otra queda
tenue con borde punteado.

### Anatomía de una ficha

```
┌───────────────────────────────┐
│  ●  Ana  (tú)   12.5    ← VA   │
└───────────────────────────────┘
   │    │    │      │       │
   │    │    │      │       └─ estado: "← VA" | "← TE TOCA" | "← su turno"
   │    │    │      └────────── puntaje (opcional, solo si el juego lo pasa)
   │    │    └───────────────── "(tú)" (solo remoto, en la ficha de mi asiento)
   │    └────────────────────── nombre
   └─────────────────────────── forma del asiento (● o ▲)
```

### Palabra clave de estado (según `miAsiento`)

| Situación | Ficha activa muestra | Texto auxiliar |
|---|---|---|
| Pasar-la-tableta (`miAsiento == null`) | `← VA` | — |
| Remoto, es mi asiento | `← TE TOCA` | — |
| Remoto, es el rival | `← su turno` | `esperando…` bajo las fichas |

### Estados visuales

- **Ficha activa**: fondo del color del jugador, texto blanco, `scale(1.03)`,
  transición de 0.3s al cambiar de turno (mismo lenguaje que el badge
  actual de "vuelves a jugar", sin animación de deslizamiento).
- **Ficha inactiva**: fondo `--color-surface`, borde punteado del color del
  jugador atenuado, texto normal.
- **Badge "vuelves a jugar"**: se conserva tal cual, encima de las fichas,
  con `motivoRepeticion`.
- **Responsive**: `flex` con `flex-wrap`; en pantallas angostas las fichas
  se apilan verticalmente. Nombres (máx. 16 chars) con `text-overflow:
  ellipsis` como salvaguarda.

### Accesibilidad

- El contenedor mantiene `role="status"` y `aria-live="polite"` para que
  el cambio de turno se anuncie.
- Un span visualmente oculto resume el estado en prosa: "Turno de Ana" /
  "Te toca, eres Beto" / "Turno de Ana, esperando".
- Contraste AA de la forma y el nombre tanto sobre el color de relleno
  como sobre la superficie.

## API

### `src/lib/turnIndicator.ts` (reescritura de `renderTurnIndicator`)

```ts
export interface FichaJugador {
  nombre: string;
  puntaje?: number | string;
  simbolo?: string; // símbolo del juego, p. ej. 'O'; se muestra como "(O)"
}

export interface TurnIndicatorOptions {
  jugador: 1 | 2;                       // asiento cuyo turno es
  fichas: Record<1 | 2, FichaJugador>;
  miAsiento?: 1 | 2 | null;             // elige la palabra clave
  detalle?: string;                     // instrucción del juego (Agujero Negro: "Coloca el número 3")
  repiteTurno?: boolean;
  motivoRepeticion?: string;
}
```

Se eliminan `etiqueta` y la interfaz `Marcador` de este módulo (el
marcador queda integrado en las fichas). Se conserva `detalle`: hoy
Agujero Negro lo usa para "Coloca el número N"; se muestra como texto
auxiliar bajo las fichas. `ocultarTurnIndicator` no cambia.

### `src/lib/gameSession.ts` (`mostrarTurno`)

El Board ya no arma etiquetas. Pasa solo lo que sabe del juego; la sesión
inyecta nombres y `miAsiento`:

```ts
mostrarTurno(opciones: {
  jugador: Player;
  detalle?: string;
  repiteTurno?: boolean;
  motivoRepeticion?: string;
  puntajes?: Record<Player, number | string>;
  simbolos?: Record<Player, string>;
}): void
```

Internamente construye
`fichas[n] = { nombre: nombres[n], puntaje: puntajes?.[n], simbolo: simbolos?.[n] }`
y llama a `renderTurnIndicator` con `miAsiento`.

`mostrarFinDeJuego` y `winnerBanner.ts` no cambian.

## Cambios por juego (`Board.astro`)

| Juego | Llamada nueva | Nota |
|---|---|---|
| Tres en raya | `mostrarTurno({ jugador: jugadorDelTurno, simbolos: { 1: ETIQUETAS.X, 2: ETIQUETAS.O } })` | quitar `(${ETIQUETAS...})` de la etiqueta |
| Notakto | `mostrarTurno({ jugador })` | quitar `(pone ✕)`; ambos ponen ✕, la forma distingue |
| Agujero Negro | `mostrarTurno({ jugador, detalle: 'Coloca el número N' })` | conserva el `detalle` actual |
| Puntos y Cajas | `mostrarTurno({ jugador, repiteTurno, motivoRepeticion, puntajes: { 1: state.scores[1], 2: state.scores[2] } })` | ya pasaba `marcador`/`repiteTurno`; se traduce a la nueva API |
| Conquista | `mostrarTurno({ jugador, repiteTurno, motivoRepeticion, puntajes: { 1: s1.toFixed(1), 2: s2.toFixed(1) } })` | equivalente a hoy |

Los banners de fin de juego de cada Board quedan igual.

## Testing

- **`turnIndicator.test.ts`** (reescribir): pasar-tableta muestra `VA` en la
  ficha activa y ninguna `(tú)`; `miAsiento === jugador` muestra `TE TOCA`
  y `(tú)` en esa ficha; `miAsiento` distinto muestra `su turno` +
  `esperando…`; `repiteTurno` renderiza el badge con `motivoRepeticion`;
  el puntaje aparece solo si se pasa; `data-jugador`/`data-activo`
  correctos; `aria-live` presente; span oculto con la prosa correcta.
- **`gameSession.test.ts`** (ampliar): `mostrarTurno` pasa `miAsiento: null`
  antes de `canal-remoto-listo` y el asiento real después; arma `fichas`
  desde `nombres` + `puntajes` + `simbolos`.
- Los `engine.test.ts` no se tocan. Los `Board.astro` no tienen test de DOM.
- `npm test`, `npm run build`, `astro check` limpios.
- Playtest manual: los 5 juegos en pasar-la-tableta; 1 juego en remoto con
  dos contextos (verificar `(tú)`, `TE TOCA` vs `esperando`).

## Fuera de alcance (YAGNI)

- Emoji/avatar elegido por el jugador (era la opción B).
- Colores o formas configurables.
- Cambiar los banners de fin de juego.
- La extracción pendiente de `<TableroJuego>` como componente más amplio
  (backlog aparte).
- Detección de nombres iguales en remoto por lógica (la identidad visual
  ya lo resuelve).
