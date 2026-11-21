# Reales Ideales

Prototipo v0.5 de un juego táctico de mesa para dos personas. Edad objetivo: 8 años en adelante. Duración objetivo: 15 minutos, pendiente de validar en mesa.

## Abrir la demostración

Abre `index.html` en un navegador. Dos personas pueden jugar en el mismo dispositivo y pasárselo al revelar cartas. El juego funciona con archivos locales. El botón **Exportar JSON** conserva las jugadas públicas, bajas, invocaciones, rescates, duración y resultado. El tiempo se anota como dato de prueba.

`game.js` contiene las reglas. `app.js` conecta las reglas con la interfaz. Ejecuta `node --test` para comprobar el motor. La demo usa HTML, CSS y JavaScript y puede servirse desde alojamiento estático.

## Preparación

- Idealistas (azul) y realistas (rojo) colocan ocho fichas cada uno en las casillas de su color.
- Las 11 casillas neutrales empiezan vacías. Cada bando tiene un cañón fuera del tablero y dos marcadores de rescate.
- Cada jugador baraja su mazo de 24 cartas y prepara dos cartas boca abajo. Puede mirar sus propias cartas.
- Los idealistas empiezan. Una ronda tiene un turno idealista y después uno realista.

| Columna | Idealistas | Neutrales | Realistas |
|---|---|---|---|
| A | A2 | A4, A6, A8 | A10 |
| B | B1 ★, B3 | B5, B7 | B9, B11 ★ |
| C | C2, C4 | C6 | C8, C10 |
| D | D1 ★, D3 | D5, D7 | D9, D11 ★ |
| E | E2 | E4, E6, E8 | E10 |

Comparten lado dos hexágonos de la misma columna con dos filas de diferencia o de columnas contiguas con una fila de diferencia.

## Turno

Haz hasta dos acciones en el orden que prefieras. Puedes moverte dos veces con fichas distintas, mover y atacar, o atacar y mover. También puedes usar una acción o pasar. Resuelve una acción y todos sus efectos antes de empezar la siguiente.

- **Mover.** Elige una ficha propia y desplázala una casilla libre adyacente. Puedes entrar en cualquier zona.
- **Atacar.** Elige una ficha propia y una enemiga adyacente. El cañón puede atacar a cualquier ficha enemiga. El turno admite un solo ataque.

## Combate

1. La ficha atacante empieza con 1 de fuerza y la defensora con 0. Esto incluye al cañón.
2. Cada jugador puede revelar una carta preparada o pasar en cuatro oportunidades: defensor, atacante, defensor, atacante. Pasar conserva la siguiente oportunidad. Las cartas reveladas se ven antes de decidir.
3. Si un solo jugador revela Golpe decisivo, gana ese jugador. Si ambos lo revelan, las dos cartas se anulan. Aplica los demás modificadores y deja en cero cualquier resultado negativo al final del cálculo.
4. La ficha con más fuerza vence y se retira la otra. En empate se retiran ambas. Comprueba inmediatamente si termina la partida.
5. Si hubo un ganador y ambas fichas eran vecinas, **la vencedora ocupa la casilla liberada**. Si estaban lejos, el ganador puede mover cualquier ficha propia una casilla libre adyacente. El avance puede ocurrir durante el turno enemigo y no gasta acciones, incluso si esa ficha ya se movió. Puede activar un rescate.
6. Resuelve las invocaciones y repón las cartas. Descarta los modificadores y Golpes decisivos usados. Separa las invocaciones utilizadas. Roba hasta tener dos cartas, conservando las que quedaron boca abajo. Si falta una carta al robar, baraja tu descarte habitual para formar un nuevo mazo.

## Cañón y rescate

Puedes revelar **Invocar cañón** en combate si empezaste esa batalla sin cañón. Como máximo se juega una invocación propia por combate. Después de la baja, el avance y el posible rescate, sustituye una ficha propia que siga en juego por tu cañón en la misma casilla. Si ambos bandos invocan, elige primero el defensor. La carta no modifica fuerza y queda fuera de la partida. El cañón puede atacar desde el siguiente turno de su dueño y se mueve como una ficha normal. Si pierde al disparar desde lejos, se retira igualmente. La segunda invocación está disponible en un combate posterior a la pérdida del primer cañón.

Al entrar en una estrella del extremo rival, puedes gastar un marcador y colocar una ficha propia eliminada en cualquier casilla libre de tu zona inicial. Cuenta la llegada por movimiento normal o por avance tras combate. Permanecer en la estrella no vuelve a activarla. Si prefieres guardar el marcador o el rescate es imposible, puedes intentarlo en otra llegada. La ficha recuperada vuelve **como ficha normal**, incluso si había sido el cañón. Los idealistas rescatan en B11 y D11. Los realistas rescatan en B1 y D1.

## Mazo provisional

| Carta | Copias por facción | Efecto |
|---|---:|---|
| Refuerzo | 8 | +1 a tu ficha |
| Debilitar | 8 | −1 a la ficha rival |
| Refuerzo mayor | 4 | +2 a tu ficha |
| Golpe decisivo | 2 | Tu ficha gana, salvo si el rival también lo juega |
| Invocar cañón | 2 | Transforma una ficha propia después de la batalla |

## Victoria y empate

Si un bando se queda sin fichas, gana el otro de inmediato. Si ambos pierden su última ficha en el mismo combate, empatan. Al acabar la ronda 12, gana quien tenga más fichas en el tablero. Con el mismo número, hay empate. Un cañón cuenta como una ficha.

## Pruebas con jugadores nuevos

Enseña una batalla vecina y un disparo lejano. Pide a cada jugador que explique quién sale, quién se mueve y cómo se activa el rescate. Registra las ayudas en los tres primeros turnos, la duración total, la primera baja, rescates, victorias en defensa y ganas de revancha del 1 al 5. Para evaluar remontadas, identifica si un jugador que quedó dos fichas por debajo luego igualó o terminó ganando. Registra satisfacción por separado para cada persona. Una simulación permite contrastar reglas y jugadas legales. La comprensión y la diversión se observan en partidas de prueba con familias.
