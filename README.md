# Reales Ideales

Prototipo v0.13 (reglas v0.12) de un juego táctico de mesa para dos personas. Edad objetivo: 8 años en adelante. Duración objetivo: 15 minutos, pendiente de validar en mesa.

## Abrir la demostración

Abre `index.html` en un navegador. En el menú, elige **Jugar con una persona** para compartir el dispositivo o **Versus IA** para jugar con los idealistas contra los realistas. La IA actúa con sus propias cartas y las jugadas visibles. El logotipo abre el menú principal. El juego funciona con archivos locales. Arrastra una ficha o toca primero la ficha y luego su destino. Confirma el movimiento o ataque en el diálogo. Durante el combate, las cartas están bajo el marcador de cada facción. Cada jugador tiene una reserva privada de tres cartas, pero solo puede activar dos en un combate; puede previsualizarlas y decidir si activa una o pasa. Un banner sobre toda la pantalla anuncia turnos, movimiento, ataque, combos, invocación y robo de cartas. El tablero incluye el contador del mazo de cada facción. El botón **Exportar JSON** conserva las jugadas públicas, bajas, invocaciones, rescates, duración y resultado. El tiempo se anota como dato de prueba.

`game.js` contiene las reglas. `ai.js` decide las jugadas de la IA. `app.js` conecta las reglas con la interfaz. Ejecuta `node --test` para comprobar el motor. La demo usa HTML, CSS y JavaScript y puede servirse desde alojamiento estático.

## Interfaz adaptable v0.13 F1 (GitHub Pages)

La interfaz de partida es ahora de **una sola pantalla** en móvil: cabecera compacta, HUD de las dos facciones con fichas/rescates/mazo, campo de juego central y dock de acciones inferior. El tablero completo permanece en la zona prioritaria sin colocar las tres cartas de cada bando por encima. El historial es un panel plegable del encabezado.

Las **tres cartas** de la reserva se muestran en un cajón superpuesto que **no desplaza el tablero**. En el turno normal, se abre con **Mis 3 cartas**; cuando hay combate se abre automáticamente, pero las cartas permanecen **boca abajo** hasta que el jugador decide revelarlas. Al cambiar el actor en partidas locales, el cajón vuelve a ocultar las cartas antes de mostrar la reserva del siguiente jugador. La IA conserva ocultas sus cartas privadas.

Se adapta a móvil vertical, orientación horizontal y escritorio. Utiliza `100dvh` y márgenes seguros del dispositivo. No requiere cambiar `game.js` o `ai.js` (las reglas siguen siendo v0.12).

### Verificación visual recomendada

Después de desplegar en GitHub Pages, revisar las ventanas **360×740**, **390×844**, **412×915**, **850×384** y **1366×768**: cabecera, HUD, las 27 casillas y el dock deben resultar utilizables sin desplazamiento de toda la página. Probar el flujo de privacidad de las cartas en modo local, combates, búsqueda, Combo decisivo, cambios de turno y el historial. En pantallas muy pequeñas los botones múltiples pueden desplazarse **dentro** del dock, no en la página completa.

## Identidad visual

La portada, el logotipo y los doce animales proceden del arte de Reales Ideales. El tablero floral completo contiene 27 hexágonos, con los idealistas arriba y los realistas abajo. Las casillas interactivas siguen la ubicación de los códigos y las cuatro estrellas de la ilustración.

Cada bando comienza con ocho fichas. Puma y vicuña se repiten entre los realistas, y llama y gallo entre los idealistas. Todos los animales siguen las reglas de la ficha normal. La pantalla de combate presenta las dos fichas participantes antes de revelar cartas.

## Preparación

- Idealistas (azul) y realistas (rojo) colocan ocho fichas cada uno en las casillas de su color.
- Las 11 casillas neutrales empiezan vacías. Cada bando tiene un cañón fuera del tablero y dos marcadores de rescate.
- Cada jugador baraja su mazo de 28 cartas y prepara tres cartas boca abajo. Cada mazo contiene cuatro cartas Exploración. Puede mirar sus propias cartas.
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

Haz hasta dos acciones en el orden que prefieras: **solo un movimiento normal** y **solo un ataque** por turno. Puedes mover y atacar, atacar y mover o hacer una sola acción. Resuelve cada acción y todos sus efectos antes de empezar la siguiente. El avance gratuito tras combate no consume el movimiento ordinario.

- **Mover.** Elige una única ficha propia y desplázala una casilla libre adyacente. No se permite realizar un segundo movimiento normal ese turno. Puedes entrar en cualquier zona.
- **Atacar.** Elige una ficha propia y una enemiga adyacente. El cañón puede atacar a cualquier ficha enemiga. El turno admite un solo ataque.

## Combate

1. La ficha atacante comienza con 1 de fuerza y la defensora con 0. El **cañón** suma +2 ofensivos, y la **ficha de vanguardia** de cada bando (I5/R4) suma +2 ofensivos. Esas dos ventajas no se acumulan: convertir la vanguardia en cañón mantiene una sola bonificación de +2.
2. Cada jugador conserva **tres cartas** en su reserva, pero puede activar como máximo **dos** durante cada combate. Las cuatro oportunidades se alternan: defensor, atacante, defensor, atacante. Pasar conserva la siguiente oportunidad. Las cartas reveladas se ven antes de decidir.
3. **COMBO:** dos cartas iguales activadas por un mismo jugador durante el combate conceden +1 extra a su fuerza. **Golpe decisivo** tiene prioridad sobre los valores de fuerza: un golpe contra uno se anula, mientras que dos contra uno prevalecen. Si el ganador usó dos Golpes decisivos, activa **COMBO DECISIVO** y puede elegir una segunda ficha enemiga del tablero para eliminar, además del objetivo principal. Puede omitir la segunda eliminación. Si hay igual cantidad de Golpes decisivos, decide la fuerza; si ambos tienen dos, el ganador también puede reclamar el combo.
4. La ficha con más fuerza vence y se retira la otra. En empate se retiran ambas. Comprueba inmediatamente si termina la partida.
5. Si hubo un ganador y ambas fichas eran vecinas, **la vencedora ocupa la casilla liberada**. Si estaban lejos, el ganador puede mover cualquier ficha propia una casilla libre adyacente. El avance puede ocurrir durante el turno enemigo y no gasta acciones, incluso si esa ficha ya se movió. Puede activar un rescate.
6. Resuelve la eliminación adicional del combo decisivo, el avance, los rescates y las invocaciones según corresponda. Después, repón las cartas. Descarta modificadores y Golpes decisivos usados; separa las invocaciones utilizadas. **Exploración** permite elegir en el momento de activarla una carta todavía disponible del mazo; esa carta sustituye a Exploración **en su misma ranura de la reserva después del combate** (no puede usarse en el combate en curso). Roba cartas para completar la reserva de tres. Si el mazo se agota, baraja el descarte personal para formar un nuevo mazo.

## Cañón y rescate

**Invocar cañón aporta +1 de fuerza en el combate en que se utiliza.** Puedes revelarla si empezaste esa batalla sin cañón. Como máximo se juega una invocación propia por combate. Después de la baja, el avance y el posible rescate, sustituye una ficha propia que siga en juego por tu cañón en la misma casilla. Si ambos bandos invocan, elige primero el defensor. La carta no modifica fuerza y queda fuera de la partida. El cañón puede atacar desde el siguiente turno de su dueño y se mueve como una ficha normal. Si pierde al disparar desde lejos, se retira igualmente. Ambas facciones pueden tener su propio cañón simultáneamente. La segunda invocación está disponible en un combate posterior a la pérdida del primer cañón.

Al entrar en una estrella del extremo rival, puedes gastar un marcador y colocar una ficha propia eliminada en cualquier casilla libre de tu zona inicial. Cuenta la llegada por movimiento normal o por avance tras combate. Permanecer en la estrella no vuelve a activarla. Si prefieres guardar el marcador o el rescate es imposible, puedes intentarlo en otra llegada. La ficha recuperada vuelve **como ficha normal**, incluso si había sido el cañón. Los idealistas rescatan en B11 y D11. Los realistas rescatan en B1 y D1.

## Mazo provisional

| Carta | Copias por facción | Efecto |
|---|---:|---|
| Refuerzo | 8 | +1 a tu ficha |
| Debilitar | 8 | −1 a la ficha rival |
| Refuerzo mayor | 4 | +2 a tu ficha |
| Golpe decisivo | 2 | Tu ficha gana, salvo si el rival también lo juega |
| Invocar cañón | 2 | +1 de fuerza y transforma una ficha propia después de la batalla |
| Exploración | 4 | +1 de fuerza; eliges una carta del mazo que ocupa la misma ranura al terminar la batalla |

## Victoria y empate

Si un bando se queda sin fichas, gana el otro de inmediato. Si ambos pierden su última ficha en el mismo combate, empatan. Al acabar la ronda 12, gana quien tenga más fichas en el tablero. Con el mismo número, hay empate. Un cañón cuenta como una ficha.

## Avisos de fase y mazo visible

La interfaz muestra banners de pantalla completa para los cambios principales: comienzo/fin de turno, movimiento, declaración de ataque, robo de cartas, invocación, rescate y combos. Un rótulo más pequeño indica la fase actual. Cada facción tiene un contador de **cartas restantes en su mazo**, sin contar las cartas en reserva ni el descarte. La reserva de cada jugador solo se descubre cuando le corresponde elegir.

## Pruebas automatizadas

El archivo `game.test.js` contempla 21 casos, incluyendo las bonificaciones de cañón/vanguardia, límite de movimiento, combos, búsqueda diferida, reserva de tres y eliminación doble. Ejecuta `node --test` para comprobar la regresión. La lógica también se probó mediante simulación de 70 partidas IA contra IA.

## Pruebas con jugadores nuevos

Enseña una batalla vecina y un disparo lejano. Pide a cada jugador que explique quién sale, quién se mueve y cómo se activa el rescate. Registra las ayudas en los tres primeros turnos, la duración total, la primera baja, rescates, victorias en defensa y ganas de revancha del 1 al 5. Para evaluar remontadas, identifica si un jugador que quedó dos fichas por debajo luego igualó o terminó ganando. Registra satisfacción por separado para cada persona. Una simulación permite contrastar reglas y jugadas legales. La comprensión y la diversión se observan en partidas de prueba con familias.
