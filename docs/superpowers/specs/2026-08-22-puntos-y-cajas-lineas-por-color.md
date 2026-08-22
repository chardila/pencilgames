# Puntos y cajas: líneas coloreadas por jugador

## Problema

En "Puntos y Cajas", toda línea trazada por cualquiera de los dos jugadores se
pinta con el mismo color (`--color-player-1`), sin importar quién la jugó. Esto
hace que, mirando el tablero, no se pueda distinguir a simple vista quién trazó
cada línea — a diferencia de las cajas completadas, que sí se sombrean con el
color del jugador que las ganó.

## Objetivo

Colorear cada línea con el color de quien la trazó (mismo par de colores que
ya usa el resto de la app: `--color-player-1` naranja, `--color-player-2`
azul), y reforzar esa asociación coloreando los nombres de los jugadores en el
indicador de turno durante la partida.

## Fuera de alcance

- El banner de fin de partida (`winnerBanner`) no se modifica: sigue mostrando
  el marcador final como texto plano, sin color. Una vez terminado el juego no
  hay ambigüedad sobre "de quién es la línea" que resolver ahí.
- `tres-en-raya` y `agujero-negro` no cambian de comportamiento ni de estilos.
- El sombreado de cajas completadas (`--color-player-1/2` al 25%) no cambia.

## Diseño

### 1. Modelo de datos (`src/games/puntos-y-cajas/engine.ts`)

El estado no registra hoy quién trazó cada línea (solo si está trazada o no).
Se agregan dos campos nuevos a `PuntosYCajasState`, paralelos a los arrays
booleanos existentes y con el mismo patrón que ya usa `boxOwners`:

```ts
horizontalLineOwners: (PuntosPlayer | null)[][];
verticalLineOwners: (PuntosPlayer | null)[][];
```

- `createInitialState` los inicializa en `null`, con la misma forma
  (dimensiones) que `horizontalLines`/`verticalLines`.
- `playLine` escribe `state.currentPlayer` en la posición correspondiente al
  trazar la línea, antes de pasar el turno.
- `horizontalLines`/`verticalLines` no cambian de tipo (siguen siendo
  `boolean[][]`); esto evita tocar la lógica existente de `isLineDrawn`,
  `isLineInBounds` y los tests que ya dependen de esos arrays.

### 2. Renderizado del tablero (`src/games/puntos-y-cajas/Board.astro`)

En `render()`, cada botón `.linea` recibe un atributo `data-jugador` leído del
array de dueños correspondiente (mismo mecanismo que ya usan `.caja`):

```ts
const dueno = tipo === 'h'
  ? state.horizontalLineOwners[fila][columna]
  : state.verticalLineOwners[fila][columna];
if (dueno) linea.dataset.jugador = String(dueno);
else delete linea.dataset.jugador;
```

El CSS deja de colorear por `[data-trazada='true']` y colorea por
`[data-jugador]`:

```css
.linea--h[data-jugador='1']::before,
.linea--v[data-jugador='1']::before { background: var(--color-player-1); }
.linea--h[data-jugador='2']::before,
.linea--v[data-jugador='2']::before { background: var(--color-player-2); }
```

`data-trazada` sigue escribiéndose en cada línea, pero ya no lo lee ningún
selector CSS ni lógica de deshabilitado (ese cálculo usa la variable local
`trazada`, no el atributo); queda como atributo informativo sin efecto
funcional.

### 3. Leyenda en el indicador de turno (`src/lib/turnIndicator.ts` +
`src/games/puntos-y-cajas/Board.astro`)

Hoy `puntos-y-cajas` arma el marcador de puntaje como un string plano pasado a
`detalle` (`"${nombres[1]} ${scores[1]} · ${nombres[2]} ${scores[2]}"`), campo
compartido con `agujero-negro` (que lo usa para un texto instructivo distinto,
no un marcador). Para colorear los nombres sin afectar a otros juegos, se
agrega un campo **opcional y retrocompatible** a `TurnIndicatorOptions`:

```ts
export interface TurnIndicatorOptions {
  jugador: 1 | 2;
  etiqueta: string;
  detalle?: string;
  marcador?: {
    1: { nombre: string; puntaje: number };
    2: { nombre: string; puntaje: number };
  };
}
```

Cuando se pasa `marcador`, `renderTurnIndicator` genera un bloque adicional:

```html
<span class="indicador-turno__marcador">
  <span class="indicador-turno__jugador" data-jugador="1">Nombre1 3</span>
  ·
  <span class="indicador-turno__jugador" data-jugador="2">Nombre2 5</span>
</span>
```

`puntos-y-cajas/Board.astro` reemplaza su uso actual de `detalle` por
`marcador`, y agrega en su `<style>` (ya scoped al componente):

```css
.indicador-turno__jugador[data-jugador='1'] { color: var(--color-player-1); }
.indicador-turno__jugador[data-jugador='2'] { color: var(--color-player-2); }
```

`agujero-negro` y `tres-en-raya` no cambian: siguen usando `detalle`/`etiqueta`
sin tocar el campo nuevo.

## Testing

- `engine.test.ts`: extender los tests existentes para cubrir
  `horizontalLineOwners`/`verticalLineOwners`:
  - Arrancan en `null` en `createInitialState`.
  - Se llenan con el jugador correcto al trazar cada línea.
  - Caso de turno extra (completar una caja): el mismo jugador traza dos
    líneas seguidas y ambas quedan registradas con su número.
- `Board.astro` no tiene tests automatizados (es UI/Astro). Verificación
  manual: correr la app, confirmar que cada línea toma el color de quien la
  trazó y que el marcador de turno muestra los nombres coloreados.

## Resumen del alcance

**Cambia:** `src/games/puntos-y-cajas/engine.ts` (+ `engine.test.ts`),
`src/games/puntos-y-cajas/Board.astro`, `src/lib/turnIndicator.ts` (campo
opcional nuevo, retrocompatible).

**No cambia:** `src/lib/winnerBanner.ts`, `tres-en-raya`, `agujero-negro`.
