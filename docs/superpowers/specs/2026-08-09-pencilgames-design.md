# Pencilgames — Diseño

**Fecha**: 2026-08-09
**Estado**: Aprobado, pendiente de plan de implementación

## 1. Propósito

Sitio web estático con juegos de lápiz y papel para 2 jugadores, pensado para jugar en familia (padre + hijos) en una tableta, en modo "pasar y jugar" (un solo dispositivo, los jugadores se turnan la pantalla). La app controla el tablero, los turnos y las reglas por completo (valida jugadas, detecta ganador/empate automáticamente), evitando discusiones sobre reglas entre los jugadores.

Hosting gratis, mantenimiento simple, y arquitectura pensada para agregar juegos nuevos fácilmente con el tiempo.

## 2. Alcance del MVP

**Juegos incluidos**:
- Tres en raya (Tic-Tac-Toe)
- Puntos y cajas (Dots and Boxes)
- Agujero Negro (Black Hole)

**Explícitamente fuera de alcance del MVP** (el patrón de extensibilidad los soporta más adelante):
- Ahorcado, Hundir la Flota, y cualquier otro juego.
- Juego en red / multi-dispositivo — solo pasar-y-jugar en un mismo dispositivo.
- Persistencia de partidas en curso — recargar la página siempre empieza una partida nueva.
- Cuentas de usuario, backend, analytics, tracking.
- Sitio bilingüe — solo español.

## 3. Stack y hosting

- **Astro** (SSG, sin framework de UI). Cada juego se implementa con un módulo TypeScript vanilla ("isla" de JS mínima) en vez de componentes React/Vue — se genera HTML estático y un script pequeño maneja la interactividad de cada página. Mantiene el bundle mínimo y evita la complejidad de un framework reactivo para un sitio que en el fondo es "estado local + DOM".
- **Cloudflare Pages**, conectado al repo de git (GitHub). Cada push a `main` dispara build + deploy automático. Servido bajo un subdominio del dominio existente del usuario en Cloudflare (ej. `juegos.<dominio-del-usuario>.com`) — gratis, sin configuración de DNS adicional más allá de un registro CNAME.
- **PWA/offline**: service worker propio (sin librería de terceros — se evaluó `@vite-pwa/astro` pero su rango de compatibilidad declarado no cubre las versiones recientes de Astro; un service worker de ~30 líneas evita esa dependencia por completo). Estrategia "red primero, caché como respaldo": cada página visitada con internet queda cacheada; sin conexión, se sirve la versión cacheada. El nombre de la caché se versiona en cada build, así que un despliegue nuevo purga automáticamente el contenido viejo.
- **Testing**: Vitest para los módulos `engine.ts` de cada juego (unit tests de reglas, detección de ganador, invariantes de estado). Sin tests de UI/e2e — no se justifica ese costo de mantenimiento para un proyecto personal de este tamaño.
- **Idioma**: solo español, en toda la interfaz, nombres de juegos e instrucciones.

## 4. Estructura del proyecto

```
pencilgames/
├── src/
│   ├── content/juegos/         # metadata + instrucciones de cada juego (markdown)
│   │   ├── tres-en-raya.md
│   │   ├── puntos-y-cajas.md
│   │   └── agujero-negro.md
│   ├── games/                  # lógica + UI de cada juego
│   │   ├── tres-en-raya/
│   │   │   ├── engine.ts
│   │   │   ├── engine.test.ts
│   │   │   └── Board.astro
│   │   ├── puntos-y-cajas/
│   │   │   ├── engine.ts
│   │   │   ├── engine.test.ts
│   │   │   └── Board.astro
│   │   └── agujero-negro/
│   │       ├── engine.ts
│   │       ├── engine.test.ts
│   │       └── Board.astro
│   ├── components/             # UI compartida entre todos los juegos
│   │   ├── GameCard.astro
│   │   ├── IndicadorTurno.astro
│   │   ├── ModalInstrucciones.astro
│   │   └── BannerGanador.astro
│   ├── layouts/
│   │   └── BaseLayout.astro
│   └── pages/
│       ├── index.astro         # índice con buscador
│       └── juegos/[slug].astro # ruta dinámica única para todos los juegos
├── public/
├── agujero-negro-reglas.md     # spec funcional de Agujero Negro (fuente de verdad)
└── astro.config.mjs
```

## 5. Patrón de extensibilidad

**Metadata del juego** (`src/content/juegos/<slug>.md`): frontmatter tipado con `title`, `description`, `icono` (emoji — sin assets gráficos que mantener), `minJugadores`/`maxJugadores`. El cuerpo del markdown son las instrucciones del juego, que se renderizan dentro del modal de instrucciones.

**Lógica del juego** (`src/games/<slug>/`):
- `engine.ts` — motor puro, sin dependencias del DOM: estado del tablero, validación de jugadas, detección de fin de juego/ganador/empate. Al ser puro, se testea de forma aislada con Vitest.
- `Board.astro` — pinta el tablero y conecta clics/taps al `engine.ts`, usando los componentes compartidos de la sección 6.

**Ruta dinámica única** (`src/pages/juegos/[slug].astro`): lee la metadata del content collection por slug, importa dinámicamente el `Board.astro` correspondiente desde un mapa `slug → componente`, y arma la página con `BaseLayout`.

**Agregar un juego nuevo** = crear el `.md` de metadata + la carpeta en `src/games/<slug>/` + una línea en el mapa de `[slug].astro`. No requiere tocar el layout, el índice ni los componentes compartidos.

## 6. Componentes de UI compartida

Usados por todos los juegos, para que se vean y comporten de forma consistente:

- **`IndicadorTurno`** — banner fijo en la parte superior del tablero: "Turno de ✕" / "Turno de ●" (o el indicador que corresponda al juego), con color distinto por jugador.
- **`ModalInstrucciones`** — se muestra automáticamente al entrar a la página del juego, renderizando las instrucciones en markdown del content collection, con un botón grande "¡Jugar!" para cerrarlo. Se puede reabrir en cualquier momento con un botón "?" fijo en la esquina, sin perder el estado de la partida en curso. Elegido sobre una página de reglas separada o un panel lateral porque en tableta (sin teclado, todo táctil) minimiza la navegación: un solo tap para empezar, un tap para reabrir.
- **`BannerGanador`** — overlay al terminar la partida: anuncia ganador o empate, con botón "Jugar de nuevo" que reinicia el `engine.ts` sin recargar la página (y por lo tanto sin perder la posición de scroll ni parpadeo de carga).

## 7. Índice de juegos (`/`)

Grid de `GameCard` (icono + nombre + descripción corta), generado a partir del content collection. Una caja de texto arriba filtra en vivo por nombre/descripción, en el cliente, sin backend. Suficiente para el número de juegos previsto (docena aproximada); no incluye filtros por categoría/tag en el MVP (YAGNI — se puede agregar después si la lista crece mucho).

## 8. Especificación de cada juego del MVP

### 8.1 Tres en raya

- Grid 3x3, 2 jugadores (✕ / ●), turnos alternos.
- Detección de las 8 líneas ganadoras (3 filas, 3 columnas, 2 diagonales).
- Empate cuando las 9 casillas están llenas sin línea ganadora.
- Al ganar, se resalta la línea ganadora antes de mostrar el `BannerGanador`.

### 8.2 Puntos y cajas

- Grid de puntos 4x4 (produce 3x3 = 9 cajas) — tamaño elegido para que los targets táctiles de las líneas sean suficientemente grandes en tableta.
- Turnos alternos dibujando una línea entre dos puntos adyacentes (horizontal o vertical, no diagonal).
- Si un jugador completa una caja (sus 4 lados quedan trazados), anota un punto **y juega de nuevo** (regla clásica de turno extra).
- La partida termina cuando las 9 cajas están cerradas.
- Gana quien tenga más cajas; empate si quedan iguales.

### 8.3 Agujero Negro

Implementado exactamente según la especificación funcional en `agujero-negro-reglas.md` (raíz del repo), que incluye modelo de datos recomendado, función de adyacencias explícita (`getNeighbors()`, no por distancia visual), orden de colocación obligatorio 1→10 por jugador, fin de partida automático tras el segundo 10, cálculo de puntaje sobre números supervivientes, y los invariantes/criterios de aceptación de su sección 17. Ese documento es la fuente de verdad para este juego; en caso de duda, prevalece sobre este spec general.

## 9. Manejo de errores / casos borde

- **Jugada inválida** (casilla ocupada, línea ya trazada, posición ocupada en Agujero Negro): el `engine.ts` la rechaza silenciosamente devolviendo el estado sin cambios; la UI simplemente no permite el tap en un elemento ya ocupado (deshabilitado visualmente), por lo que en la práctica no debería ocurrir vía la interfaz — la validación en el engine es la defensa contra estados inconsistentes.
- **Recarga de página a mitad de partida**: no hay persistencia; la partida se pierde y al volver a entrar se inicia una nueva. Es una decisión deliberada (sección 2) por la simplicidad que da frente a partidas cortas.
- **Sin conexión**: cubierto por el service worker de PWA una vez visitado el sitio al menos una vez con internet.

## 10. No-objetivos

Ver sección 2. Reiterado aquí por claridad: sin red/multi-dispositivo, sin persistencia de partidas, sin cuentas/backend/analytics, sin bilingüe.
