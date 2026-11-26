# Reales Ideales

Lee [el reglamento y la guía de ejecución](README.md) antes de editar. Este repositorio contiene la demo (reglas con Fuego Especial universal, HUD v0.35) para dos jugadores en un dispositivo o contra la IA. El README describe el estado actual; su historial resume las versiones anteriores.

- `index.html` contiene el tablero y los controles. `styles.css` da estilo al tablero, las fichas, las cartas y los botones. `app.js` conecta la interfaz con el motor, coloca el escenario y dibuja el HUD. `fx.js` genera sonidos y música. `game.js` aplica las reglas. `ai.js` decide las jugadas de la IA.
- Para pulir la interfaz, trabaja en una rama visual y concentra los cambios en HTML, CSS y la presentación de `app.js`. Los cambios del reglamento van en una propuesta aparte.
- Prioriza fichas distinguibles y texto legible desde los ocho años. Haz que se reconozcan de inmediato la ficha elegida, sus destinos, la información oculta y el resultado del combate.
- Si añades efectos para ataque, captura, rescate o invocación, usa los eventos que ya genera el motor. Respeta `prefers-reduced-motion` y mantén comprensible la acción aunque se desactive la animación.
- Abre `index.html` en un navegador y compara PC y móvil. Comprueba el cambio de jugador durante las cuatro oportunidades para revelar cartas, el avance tras una victoria y la exportación JSON.
- Ejecuta `node --test` desde la raíz. En el pull request incluye capturas o un vídeo breve y el resultado de las pruebas.

## Reglas tácticas vigentes
- Un movimiento normal y un ataque máximo por turno; los avances posteriores al combate son extraordinarios. El turno avanza solo al agotarse las jugadas legales.
- Fuerza base 0 para todas las fichas; el cañón suma +2 al atacar. No hay vanguardia. El empate elimina a ambas fichas.
- **Fuego Especial universal** (`FIRE_POWER` en `game.js`): barra por bando de +1 por turno propio, lista en el turno 3, solo al atacar y nunca desde un cañón. Los ocho animales tienen el mismo poder: +3 contra un enemigo vecino o a dos casillas (en ese caso da un paso de aproximación y consume también el movimiento). `SPECIALS` solo asigna ese poder a cada animal; ya no hay poderes distintos.
- Tres cartas en reserva por facción; dos activaciones por jugador en cada batalla. Invocar cañón transforma al instante la ficha que combate y suma +2. Combo de dos cartas idénticas: +1. Dos Golpes decisivos vencedores abren la fase `combo` para eliminar otra ficha (o pasar).
- Rescates: inmediatos al llegar a una estrella rival, o guardados para usarlos desde el siguiente turno propio en cualquier casilla libre.
- Fin: eliminación total, 12 rondas o 10 minutos (desempate por fichas, cartas activadas y cartas potentes). Las monedas (`COIN_REWARDS`) son solo marcador: no deciden la victoria.
- Cualquier cambio de reglas va en una propuesta aparte, con pruebas en `game.test.js` y simulación IA contra IA.

## Interfaz y GitHub Pages
- Diseño responsive en `index.html`, `styles.css` y `app.js`. Jerarquía actual: HUD superior con dos `.seat` (retrato, vida de ocho segmentos, rescates y mazo) y reloj/ronda/turno; escenario `.field`; dock `.controls` con la barra superior (opciones, monedas, estado `.hud-status-line`, mover y atacar) y la fila de Fuego Especial, tres cartas y fin de turno.
- Texto legible desde los ocho años: en móvil ningún texto del HUD por debajo de ~12 px. Comprobar 360×640 y 390×844 antes de publicar.
- `#deck-I` y `#deck-R` están en el HUD de cada bando.
- Las tres cartas de la reserva viven en el dock (`#hud-hand`, `renderHands()` en `app.js`); no volver a un cajón superpuesto. En modo local cada jugador las descubre con «Ver mano de…» (`handOwner`); al cambiar de jugador vuelven a ocultarse.
- Durante el combate las ranuras de cartas activadas aparecen sobre el tablero solo después de las animaciones del ataque y se retiran al resolverlo. Las reservas privadas nunca se muestran al rival. Nada debe tapar las fichas ni desplazarse.
- Textos visibles sin códigos (I5, C6): usar `pieceName()`/`describe()`. Los tableros son escenarios de `BOARD_THEMES` en `app.js`: «Campo andino» (video en bucle, por defecto) y «Plaza» (SVG, `buildBoardArt()`). Si cambia el arte de un escenario, vuelve a medirlo con `tools/medir_escenario.py`; no corregir la perspectiva ni usar imágenes con códigos pintados. Casillas, fichas y animaciones comparten las coordenadas del fotograma (`sceneGeometry`, `cellPoint()`, `layoutScene()`); en móvil vertical el video ocupa toda la pantalla.
- Animaciones primero y banners después (`fxBusy`, `busy()`); respetar los ajustes de velocidad y temporizador.
- La clase `body.playing` activa el layout `100dvh`; todo el scroll de historial/ayuda queda dentro de sus paneles y el de acciones dentro del dock.
- Los cambios visuales no alteran `game.js`, `ai.js` ni sus pruebas; no confundir un cambio de interfaz con uno de mecánicas.
- Partir siempre de la última versión de `main`: este repositorio lo editan varios asistentes.
- Subir el sufijo `?v=` de los archivos en `index.html` en cada entrega para que el navegador no use versiones guardadas.
- Asegurar que la app siga compatible con publicación automática en `https://afelex.github.io/Reales-Ideales/`.
