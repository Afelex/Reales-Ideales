# Reales Ideales

Lee [el reglamento y la guía de ejecución](README.md) antes de editar. Este repositorio contiene la demo v0.9 para dos jugadores en un dispositivo.

- `index.html` contiene el tablero y los controles. `styles.css` da estilo al tablero, las fichas, las cartas y los botones. `app.js` conecta la interfaz con el motor. `game.js` aplica las reglas.
- Para pulir la interfaz, trabaja en una rama visual y concentra los cambios en HTML, CSS y la presentación de `app.js`. Los cambios del reglamento van en una propuesta aparte.
- Prioriza fichas distinguibles y texto legible desde los ocho años. Haz que se reconozcan de inmediato la ficha elegida, sus destinos, la información oculta y el resultado del combate.
- Si añades efectos para ataque, captura, rescate o invocación, usa los eventos que ya genera el motor. Respeta `prefers-reduced-motion` y mantén comprensible la acción aunque se desactive la animación.
- Abre `index.html` en un navegador y compara PC y móvil. Comprueba el cambio de jugador durante las cuatro oportunidades para revelar cartas, el avance tras una victoria y la exportación JSON.
- Ejecuta `node --test` desde la raíz. En el pull request incluye capturas o un vídeo breve y el resultado de las pruebas.
