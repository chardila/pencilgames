# 05 — Indicador de turno legible para un niño

**Prioridad:** media · **Depende de:** 04

## Problema

El turno se indica con dos pastillas pequeñas, `● Carlos (✕)` y `▲ Simon (●)`,
y una flecha diminuta con el texto `← VA` pegada al jugador activo.

Dos cosas fallan para el público real:

- `VA` es una abreviatura. Un niño de siete años que está aprendiendo a leer no
  la descifra, y menos en cuerpo pequeño.
- La diferencia visual entre la pastilla activa y la inactiva es sutil: relleno
  contra borde punteado. De un vistazo, a medio metro de distancia, en una
  tableta apoyada en la mesa, no se distingue.

El resultado práctico es la discusión de siempre: "¿me toca a mí?".

## Objetivo

Que desde el otro lado de la mesa, sin leer con atención, se sepa quién juega.

## Requisitos

**R1 — Decirlo con palabras.** Sustituir `← VA` por una frase completa y grande:
**`Le toca a Simón`**, con el nombre en el color del jugador. Tamaño mínimo
`clamp(1.25rem, 4vw, 1.75rem)`, peso alto.

**R2 — Jerarquía fuerte.** La pastilla del jugador activo se agranda
visiblemente (≈ 1.15×), a color pleno y con sombra; la del rival se atenúa
(opacidad ~0.45, sin sombra). La diferencia debe notarse en una foto en blanco y
negro: no confiar solo en el color.

**R3 — Transición perceptible.** Al cambiar el turno, la pastilla entrante crece
con un rebote corto (≈180 ms) y la saliente se atenúa. Ya existe el keyframe
`badgePopIn`, reutilizarlo. Respetar `prefers-reduced-motion`.

**R4 — Altura estable.** El crecimiento de la pastilla activa no puede cambiar la
altura de la franja ni mover el tablero (ver spec 04): usar `transform: scale()`,
nunca `font-size` o `padding` sobre el elemento en flujo.

**R5 — Símbolo junto al nombre.** Mantener el símbolo del jugador (● / ▲ / ✕)
pegado al nombre, que es lo que permite jugar sin depender del color.

**R6 — No romper `role="status"`.** La región de estado ya anuncia
"Turno de Carlos". Mantener el texto accesible sincronizado con el visual, sin
duplicar anuncios en cada repintado.

## Criterios de aceptación

- [ ] El indicador dice una frase completa, no una abreviatura.
- [ ] Convertida la pantalla a escala de grises, sigue siendo evidente a quién le
      toca.
- [ ] Al pasar el turno, el cambio se percibe con una animación corta.
- [ ] La franja del marcador mantiene exactamente la misma altura durante toda
      la partida.
- [ ] Un lector de pantalla anuncia el cambio de turno una sola vez por jugada.

## Fuera de alcance

Avatares o fotos de jugador. Temas por jugador.
