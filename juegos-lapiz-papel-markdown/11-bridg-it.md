# Bridg-It / Gale

## Resumen
Juego de conexión para 2 jugadores, también conocido como Gale. Cada jugador intenta conectar dos lados opuestos del tablero mediante sus propias líneas.

## Preparación
Crear dos redes intercaladas de puntos:
- los puntos de un jugador forman una red;
- los puntos del otro forman la red complementaria.

Un jugador intenta conectar oeste-este.
El otro intenta conectar norte-sur.

## Turno
1. Elegir dos puntos propios adyacentes que todavía no estén unidos.
2. Dibujar una línea entre ellos.
3. Las líneas de los dos jugadores no pueden cruzarse.
4. El turno pasa al rival.

## Victoria
Gana el primer jugador que consiga un camino continuo entre sus dos lados objetivo.

No hay empate.

## Modelo
El tablero puede representarse como dos grafos intercalados. La comprobación de victoria es una búsqueda de conectividad en el grafo de cada jugador.

## Fuente
Reglas de Bridg-It/Gale. citeturn1search1turn1search2
