# 10 — Tema oscuro y detalles de acabado

**Prioridad:** baja · **Depende de:** 01, 08

## Problema

Varios detalles sueltos, pequeños cada uno pero visibles todos los días.

1. **No hay tema oscuro.** `prefers-color-scheme` no aparece en ninguna parte de
   la hoja de estilos. La paleta crema (`--color-bg: #fdf6ec`) está muy bien de
   día; de noche, antes de dormir, deslumbra.
2. **`viewport-fit=cover` sin zonas seguras.** El `<meta name="viewport">`
   incluye `viewport-fit=cover`, pero en todo el CSS no hay ni un
   `env(safe-area-inset-*)`. En una tableta con barra de gestos, el contenido
   puede quedar debajo.
3. **`✏️ Cambiar nombres` descolocado.** El botón flota pegado al borde
   izquierdo, fuera de la alineación del contenido y a ras de la barra superior,
   como si se hubiera caído del diseño.
4. **PWA sin orientación declarada.** El manifiesto no fija `orientation`, y la
   instalación no se promociona en ninguna parte.

## Objetivo

Cerrar los flecos que hacen que la aplicación se sienta a medio terminar.

## Requisitos

**R1 — Tema oscuro.** Ya existen las variables (`--color-bg`, `--color-surface`,
`--color-text`, `--color-player-1`, `--color-player-2`, `--color-accent`), así
que basta con redefinirlas:

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-tema="claro"]) { /* … */ }
}
:root[data-tema="oscuro"] { /* … */ }
```

Subir la luminosidad de los dos colores de jugador para que mantengan contraste
sobre fondo oscuro (comprobar AA, 4.5:1, contra el nuevo fondo). Actualizar
`<meta name="theme-color">`, hoy fijo en `#fdf6ec`, con una variante por
esquema.

**R2 — Conmutador manual.** Un botón de tres estados (claro / oscuro / según el
sistema) persistido en `pencilgames:tema`, aplicado vía `data-tema` en `<html>`.
Ponerlo en la portada, no en cada partida.

**R3 — Zonas seguras.** Añadir el relleno correspondiente a la barra superior y
a la barra de controles de la spec 02:

```css
.barra-superior  { padding-top: env(safe-area-inset-top); }
.controles       { padding-bottom: env(safe-area-inset-bottom); }
.pantalla-juego  { padding-inline: env(safe-area-inset-left) env(safe-area-inset-right); }
```

**R4 — Reubicar `Cambiar nombres`.** Integrarlo en la barra superior, alineado a
la derecha, frente a `← Juegos`. Que comparta altura y línea base con ella.

**R5 — Manifiesto.** Añadir `"orientation": "any"` (los juegos deben funcionar en
las dos orientaciones tras la spec 01), revisar `theme_color` y
`background_color`, y comprobar que los iconos 192/512 siguen la familia visual
de la spec 08.

**R6 — Invitación a instalar.** Un aviso discreto en la portada, una sola vez,
explicando que se puede añadir a la pantalla de inicio. Descartable y recordado
en `pencilgames:instalar-visto`. Es el modo en que de verdad se va a usar.

## Criterios de aceptación

- [ ] Con el sistema en oscuro, la aplicación abre en oscuro y todos los
      tableros y fichas siguen siendo legibles, en los 21 juegos.
- [ ] El contraste de texto y de ambos colores de jugador cumple AA en los dos
      temas.
- [ ] El conmutador manual sobrescribe al sistema y aguanta la recarga.
- [ ] En una tableta con barra de gestos, ningún control queda debajo de ella.
- [ ] `Cambiar nombres` está alineado con la barra superior.
- [ ] Instalada como PWA, la aplicación abre sin barra de navegador y con el
      color de tema correcto.

## Fuera de alcance

Temas de color personalizados por niño. Alto contraste.
