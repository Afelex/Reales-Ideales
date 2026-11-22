# Reales Ideales

Lee [el reglamento y la guía de ejecución](README.md) antes de editar. Este repositorio contiene la demo v0.12 para dos jugadores en un dispositivo.

- `index.html` contiene el tablero y los controles. `styles.css` da estilo al tablero, las fichas, las cartas y los botones. `app.js` conecta la interfaz con el motor. `game.js` aplica las reglas.
- Para pulir la interfaz, trabaja en una rama visual y concentra los cambios en HTML, CSS y la presentación de `app.js`. Los cambios del reglamento van en una propuesta aparte.
- Prioriza fichas distinguibles y texto legible desde los ocho años. Haz que se reconozcan de inmediato la ficha elegida, sus destinos, la información oculta y el resultado del combate.
- Si añades efectos para ataque, captura, rescate o invocación, usa los eventos que ya genera el motor. Respeta `prefers-reduced-motion` y mantén comprensible la acción aunque se desactive la animación.
- Abre `index.html` en un navegador y compara PC y móvil. Comprueba el cambio de jugador durante las cuatro oportunidades para revelar cartas, el avance tras una victoria y la exportación JSON.
- Ejecuta `node --test` desde la raíz. En el pull request incluye capturas o un vídeo breve y el resultado de las pruebas.

## Reglas tácticas v0.12
- Un movimiento normal y un ataque máximo por turno; los avances posteriores al combate son extraordinarios.
- Tres cartas en reserva por facción; cada batalla permite dos activaciones por jugador. Cuatro Exploraciones (+1) por baraja reemplazan su ranura con una elección válida del mazo al terminar el combate.
- Combo de dos cartas idénticas: +1 de fuerza. Dos Golpes decisivos vencedores permiten elegir y eliminar una segunda ficha enemiga en fase `combo` (o pasar).
- Ataque del cañón +2, vanguardia I5/R4 +2 al atacar; no son acumulables. Invocar cañón aporta +1 en ese combate.
- La IA entiende las fases `reveal` y `combo` y las búsquedas. La UI presenta banners y muestra los mazos restantes, que excluyen la reserva.
- Ejecuta `node --test` y comprueba localmente el diálogo de selección de Exploración, los banners de cambio de fase y las cartas pequeñas en móvil.
