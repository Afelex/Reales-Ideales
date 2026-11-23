# Reales Ideales

Lee [el reglamento y la guía de ejecución](README.md) antes de editar. Este repositorio contiene la demo (reglas v0.15, interfaz v0.18) para dos jugadores en un dispositivo o contra la IA.

- `index.html` contiene el tablero y los controles. `styles.css` da estilo al tablero, las fichas, las cartas y los botones. `app.js` conecta la interfaz con el motor y dibuja el tablero SVG. `fx.js` genera sonidos y música. `game.js` aplica las reglas. `ai.js` decide las jugadas de la IA.
- Para pulir la interfaz, trabaja en una rama visual y concentra los cambios en HTML, CSS y la presentación de `app.js`. Los cambios del reglamento van en una propuesta aparte.
- Prioriza fichas distinguibles y texto legible desde los ocho años. Haz que se reconozcan de inmediato la ficha elegida, sus destinos, la información oculta y el resultado del combate.
- Si añades efectos para ataque, captura, rescate o invocación, usa los eventos que ya genera el motor. Respeta `prefers-reduced-motion` y mantén comprensible la acción aunque se desactive la animación.
- Abre `index.html` en un navegador y compara PC y móvil. Comprueba el cambio de jugador durante las cuatro oportunidades para revelar cartas, el avance tras una victoria y la exportación JSON.
- Ejecuta `node --test` desde la raíz. En el pull request incluye capturas o un vídeo breve y el resultado de las pruebas.

## Reglas tácticas v0.15
- Un movimiento normal y un ataque máximo por turno; los avances posteriores al combate son extraordinarios.
- Fuerza base 0 para todas las fichas; el cañón suma +2 al atacar. No hay vanguardia. El empate elimina a ambas fichas.
- Barra de ataque especial por bando: +1/3 por turno propio, lista en el turno 3, solo al atacar. Cada animal tiene un poder (`SPECIALS` en `game.js`); se elige el poder y luego empieza el combate por cartas.
- Tres cartas en reserva por facción; cada batalla permite dos activaciones por jugador (Estandarte y Sombra las limitan). Invocar cañón transforma al instante la ficha que combate y suma +2.
- Combo de dos cartas idénticas: +1. Dos Golpes decisivos vencedores, o Doble Impacto, abren la fase `combo` para eliminar otra ficha (o pasar).
- Cualquier cambio de reglas va en una propuesta aparte con pruebas y simulación IA contra IA.

## UI v0.13 F1 — GitHub Pages
- Diseño responsive en `index.html`, `styles.css` y `app.js`. Mantener la jerarquía: header compacto, dos `.seat` sin manos, campo `.field`, dock `.controls`, cajón `#hand-drawer`.
- `#deck-I` y `#deck-R` están ahora en el HUD de facción, NO en la antigua barra debajo del tablero.
- `#hand-I` y `#hand-R` viven dentro del cajón fijo; jamás moverlos de nuevo a las cápsulas superiores. La función `syncHandDrawer()` restablece el secreto de las cartas al alternar actor y ranuras de combate. Mantener `privateHand` y `drawerOpen` sincronizados.
- `#duel` se muestra durante la etapa reveal y se retira antes de la explosión. En escritorio va en la columna izquierda y el cajón en la derecha; en móvil el cajón entra en el flujo de la cuadrícula. Nada debe tapar las fichas ni desplazarse.
- Textos visibles sin códigos (I5, C6): usar `pieceName()`/`describe()`. Los tableros son escenarios de `BOARD_THEMES` en `app.js`: «Campo andino» (video en bucle, por defecto) y «Plaza» (SVG, `buildBoardArt()`). Si cambia el arte de un escenario, vuelve a medirlo con `tools/medir_escenario.py`; no corregir la perspectiva ni usar imágenes con códigos pintados. Casillas, fichas y animaciones comparten las coordenadas del fotograma (`sceneGeometry`, `cellPoint()`, `layoutScene()`); en móvil vertical el video ocupa toda la pantalla.
- Animaciones primero y banners después (`fxBusy`, `busy()`); respetar los ajustes de velocidad y temporizador.
- La clase `body.playing` activa el layout `100dvh`; todo el scroll de historial/ayuda queda dentro de sus paneles y el de acciones dentro del dock.
- Optimizar la visual de cartas y botones sin alterar `game.js`, `ai.js` ni sus pruebas. No confundir v0.13 UI con un cambio de mecánicas.
- Asegurar que la app siga compatible con publicación automática en `https://afelex.github.io/Reales-Ideales/`.
