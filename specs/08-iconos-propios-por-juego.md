# 08 — Iconos propios por juego en lugar de emojis

**Prioridad:** baja · **Depende de:** 07 (tocan el mismo componente de tarjeta)

## Problema

Cada tarjeta se identifica con un emoji, y hay dos defectos concretos:

1. **Se repiten.** `🔷` está en Hex **y** en MetaSquares. `🔺` está en Juego Y,
   en Sim **y** en Triggle. Cinco juegos distintos que de reojo son dos.
2. **Estilos mezclados.** Conviven emojis a todo color y con volumen
   (`🍫 🚢 🐾 🚩 🖍️`) con caracteres geométricos planos y monocromos
   (`▦ ✕ ⚫ 🔲`). La rejilla se ve desigual, como si faltaran iconos en algunas
   tarjetas.

Listado actual, en orden de portada: 🕳️ 🚢 🌉 🍫 🖍️ 🚩 ▦ 🐾 ⚫ 🔷 🔺 🔷 ⭐ ❌ 🚧 🔲 🐍 🔺 🆘 ✕ 🔺

## Objetivo

Que cada juego tenga una marca visual única, coherente con las demás, y que
además adelante de qué va el juego.

## Requisitos

**R1 — Miniatura del tablero real.** Un SVG inline por juego que represente su
tablero en miniatura con dos o tres fichas puestas: la retícula de puntos para
Puntos y cajas, un panal con dos hexágonos de cada color para Hex, el triángulo
con la malla para Triggle, la barra de chocolate para Chomp. Se distinguen entre
sí y enseñan el juego antes de entrar.

**R2 — Sistema visual común.** Todos con el mismo lienzo (`viewBox="0 0 48 48"`),
el mismo grosor de trazo, las mismas esquinas redondeadas y la paleta ya
existente: `--color-player-1` (#e0532c), `--color-player-2` (#2c6fe0),
`--color-text`, `--color-accent`. Máximo tres colores por icono.

**R3 — `currentColor` donde se pueda.** Para que hereden el tema (ver spec 10)
sin duplicar variantes.

**R4 — Inline, no archivos sueltos.** Un componente `IconoJuego.astro` con un
`switch` por slug, o un sprite SVG. Nada de 21 peticiones de red.

**R5 — Accesibilidad.** Los iconos son decorativos: `aria-hidden="true"` y
`focusable="false"`. El nombre del juego ya está en texto.

**R6 — Peso.** Los 21 iconos juntos, por debajo de 12 KB sin comprimir. Si se
pasan, simplificar el dibujo, no bajar la calidad del sistema.

**R7 — Coherencia con el favicon.** Aprovechar para revisar que
`/favicon.svg` y los iconos 192/512 del manifiesto pertenezcan a la misma
familia visual.

## Criterios de aceptación

- [ ] Los 21 iconos son distintos entre sí, comprobado poniéndolos en fila.
- [ ] Ninguna tarjeta usa un emoji.
- [ ] A 48 px reales en la tableta, cada icono se reconoce sin ampliar.
- [ ] Los iconos siguen viéndose bien sobre el fondo del tema oscuro.
- [ ] Peso total dentro del presupuesto de R6.

## Fuera de alcance

Ilustraciones grandes de cabecera. Animar los iconos.
