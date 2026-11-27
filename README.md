# Reales Ideales

Juego táctico de mesa para dos personas, con demo web para un dispositivo o contra la IA. Reglas vigentes: **tres poderes especiales** (ver abajo). Edad objetivo: 8 años en adelante. Duración: hasta 10 minutos por partida, pendiente de validar en mesa.

## Abrir la demostración

Abre `index.html` en un navegador o la versión publicada en https://afelex.github.io/Reales-Ideales/. En vertical, el menú reproduce en bucle el video del gato y la llama. La portada estática se usa en horizontal y cuando se desactiva el movimiento. Pulsa **¡Jugar!** para habilitar la música y abrir el menú. Los recursos de partida empiezan a prepararse al elegir un modo, mientras escoges personaje y bandera. Elige **Tutorial**, **Multijugador** para compartir el dispositivo, **Vs IA** para jugar contra los realistas u **Opciones**. Antes de cada partida, elige personaje y bandera. La bandera determina el poder del bando. En las opciones del menú se puede desactivar la animación de portada.

Arrastra tu ficha a una casilla libre marcada para moverla o suéltala sobre una ficha enemiga marcada para atacar. También puedes tocar la ficha propia y luego su destino. El turno avanza solo cuando se agotan las jugadas legales y el botón de fin de turno permite pasar antes. Al terminar, la pantalla de victoria o derrota lleva a las estadísticas, desde donde se puede **exportar JSON** con las jugadas.

`game.js` contiene las reglas, `ai.js` decide las jugadas de la IA, `app.js` conecta las reglas con la interfaz y `fx.js` genera sonidos y música. Ejecuta `node --test` para comprobar el motor. La demo usa HTML, CSS y JavaScript sin dependencias y se publica como sitio estático en GitHub Pages.

## Interfaz de partida

En móvil vertical la partida ocupa **una sola pantalla, sin desplazamientos**: el escenario en video cubre todo el fondo y el HUD flota encima.

- **Arriba:** retrato de cada bando, barra de vida de ocho segmentos (una por ficha viva), rescates y cartas en el mazo. En el centro, el reloj de la decisión, la ronda (1/12) y el aviso **TU TURNO** o **TURNO DEL RIVAL** (en modo local, el bando activo). El reloj general de 10 minutos («Faltan») aparece en un globo junto a la llama alada.
- **Dock inferior, fila superior:** llave inglesa (opciones), botón de moneda con tu saldo (al pulsarlo muestra ambos), línea de estado con la instrucción o el resultado del momento, e iconos de **mover** (verde si está disponible) y **atacar** (rojo anaranjado); apagados cuando ya se usaron.
- **Dock inferior, fila de abajo:** anillo del **poder elegido** con dos o tres cargas, las **tres cartas** de la reserva y el botón de fin de turno. Al tocar una carta se ve su ilustración y su efecto, con Cancelar y Activar. En modo local cada jugador descubre su mano con «Ver mano de…», y se vuelve a ocultar al cambiar de jugador.
- **Combate:** al elegir el objetivo empieza la animación. Después aparecen dos ranuras por bando (realistas a la izquierda, idealistas a la derecha) con las cartas activadas y la fuerza total. Las reservas privadas nunca se muestran al rival. El resultado queda en la línea de estado hasta el siguiente combate.
- **Rescates guardados:** si se guarda una estrella, aparece un botón para usarla desde el siguiente turno propio.
- **Combate con partículas (PixiJS):** chispas, trozos de plastilina del color del bando, ondas, polvo, quemaduras y brasas de Fuego Victorioso en una capa WebGL transparente (`combat-fx.js`). Sin WebGL quedan los efectos CSS. Con movimiento reducido o ahorro de datos, el campo usa el fotograma fijo y omite la descarga de PixiJS. La ficha vencedora sigue en su casilla hasta el avance. Cada ficha vencida permanece hasta que el impacto da paso a su animación de derrota.
- **Cartas legibles:** el dueño de la carta se ilumina con el color de su bando y la carta aparece de su lado (realistas a la izquierda, idealistas a la derecha) con su nombre. Luego viaja hasta la ficha afectada, donde el número aparece al costado con un anillo del color de la carta.
- **Avisos:** el turno y las instrucciones se leen en el HUD. El combo de cartas iguales muestra su `+1` junto a la ficha. El fin de partida tiene su propia pantalla.
- **Golpe decisivo:** una victoria con esta carta sin otro Golpe decisivo rival activa el remate con pausa de impacto, grietas y fragmentos. Con `prefers-reduced-motion` se usa un destello localizado y un fundido en el sitio.
- **Opciones:** escenario (Campo andino o Plaza), música y efectos por separado, temporizador (sin tiempo, relajado ×2 o normal) y velocidad de animación. Se guardan en el navegador.
- **Legibilidad:** ningún texto del HUD baja de unos 12 px en móvil; la línea de estado admite dos líneas.

En escritorio y en horizontal, el escenario se muestra en una columna central con el HUD alrededor. Verificación recomendada: **360×640**, **390×844**, **412×915**, **850×384** y **1366×768**. Comprobar que las 27 casillas responden, que nada se desplaza ni tapa fichas, la privacidad de las cartas en modo local, el combate completo, los rescates, los poderes especiales, el fin por tiempo y la exportación JSON.

## Identidad visual

Arte propio en estilo plastilina: portada, logotipo, escenario andino, fichas, cartas y emblemas. Evita los emojis en toda la interfaz. Cada bando tiene ocho animales distintos (mono, llama, guacamayo, rana, tigrillo, gallo, cuy y gato), por eso los textos los nombran como «Tigrillo idealista» en vez de usar códigos como I5 o C6. Los códigos solo se conservan en el JSON exportado y en las etiquetas de accesibilidad de las casillas.

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

## Poderes especiales

Cada bando elige un poder al seleccionar su bandera. Todas sus fichas normales pueden usarlo. El medidor suma una carga al comienzo de cada turno propio y vuelve a cero al activar el poder. Los cañones no pueden usarlo.

| Poder | Cargas | Efecto |
| --- | ---: | --- |
| Fuego Victorioso | 3 | +3 de fuerza. Ataca a una ficha vecina o da un paso para atacar a una ficha a dos casillas. |
| Asalto Eléctrico | 2 | +1 de fuerza. Salta a una casilla libre a una o dos casillas de distancia y elige un enemigo a una o dos casillas desde allí. |
| Escarcha Especial | 3 | +1 de fuerza y congela hasta dos cartas al azar de la reserva rival durante el combate. Usa el mismo alcance y aproximación de Fuego Victorioso. |

El desplazamiento del poder consume el movimiento del turno y no abre un rescate intermedio. Cuando las fichas quedan a dos casillas al iniciar el combate, se aplica el avance a distancia. Las cartas congeladas conservan su ranura y quedan disponibles para el siguiente combate.

## Combate

1. **Todas las fichas empiezan con 0 de fuerza**, ataquen o defiendan. Un **cañón** suma +2 cuando ataca y el **poder especial** elegido suma +1 o +3 al atacante.
2. Cada jugador conserva **tres cartas** en su reserva, pero puede activar como máximo **dos** durante cada combate. Las cuatro oportunidades se alternan: defensor, atacante, defensor, atacante. Pasar conserva la siguiente oportunidad. Las cartas reveladas se ven antes de decidir.
3. **COMBO:** dos cartas iguales activadas por un mismo jugador durante el combate conceden +1 extra a su fuerza. **Golpe decisivo** tiene prioridad sobre los valores de fuerza: un golpe contra uno se anula, mientras que dos contra uno prevalecen. Si el ganador usó dos Golpes decisivos, activa **COMBO DECISIVO** y puede elegir una segunda ficha enemiga del tablero para eliminar, además del objetivo principal. Puede omitir la segunda eliminación. Si hay igual cantidad de Golpes decisivos, decide la fuerza; si ambos tienen dos, el ganador también puede reclamar el combo.
4. La ficha con más fuerza vence y se retira la otra. En empate se retiran ambas. Comprueba inmediatamente si termina la partida.
5. Si hubo un ganador y ambas fichas eran vecinas, **la vencedora ocupa la casilla liberada**. Si estaban lejos, el ganador puede mover cualquier ficha propia una casilla libre adyacente. El avance puede ocurrir durante el turno enemigo y no gasta acciones, incluso si esa ficha ya se movió. Puede activar un rescate.
6. Resuelve la eliminación adicional del combo decisivo, el avance, los rescates y las invocaciones según corresponda. Después, repón las cartas. Descarta modificadores y Golpes decisivos usados; separa las invocaciones utilizadas. **Exploración** permite elegir en el momento de activarla una carta todavía disponible del mazo; esa carta sustituye a Exploración **en su misma ranura de la reserva después del combate** (no puede usarse en el combate en curso). Roba cartas para completar la reserva de tres. Si el mazo se agota, baraja el descarte personal para formar un nuevo mazo.

## Cañón y rescate

**Invocar cañón convierte al instante en cañón a tu ficha que combate y le suma +2** en ese combate, tanto al atacar como al defender. Puedes revelarla si empezaste esa batalla sin cañón. Como máximo se juega una invocación propia por combate. La carta queda fuera de la partida. El cañón puede atacar desde el siguiente turno de su dueño y se mueve como una ficha normal. Si pierde al disparar desde lejos, se retira igualmente. Ambas facciones pueden tener su propio cañón simultáneamente. La segunda invocación está disponible en un combate posterior a la pérdida del primer cañón.

Al entrar en una estrella del extremo rival, puedes gastar un marcador y colocar una ficha propia eliminada en cualquier casilla libre de tu zona inicial. Cuenta la llegada por movimiento normal o por avance tras combate. Permanecer en la estrella no vuelve a activarla. Si prefieres guardar, se descuenta un marcador no ganado y se añade una estrella reservada, utilizable a partir del siguiente turno propio. Pulsa su icono en el HUD, elige una ficha perdida y colócala en cualquier hexágono libre del tablero, sin gastar movimiento ni ataque. Puedes volver a guardar sin consumir la estrella. El rescate inmediato conserva la zona inicial. La ficha recuperada vuelve **como ficha normal**, incluso si había sido el cañón. Los idealistas rescatan en B11 y D11. Los realistas rescatan en B1 y D1.

## Mazo provisional

| Carta | Copias por facción | Efecto |
|---|---:|---|
| Refuerzo | 8 | +1 a tu ficha |
| Debilitar | 8 | −1 a la ficha rival |
| Refuerzo mayor | 4 | +2 a tu ficha |
| Golpe decisivo | 2 | Tu ficha gana, salvo si el rival también lo juega |
| Invocar cañón | 2 | Tu ficha en combate se convierte en cañón al instante y suma +2 |
| Exploración | 4 | +1 de fuerza; eliges una carta del mazo que ocupa la misma ranura al terminar la batalla |

## Victoria y empate

Si un bando se queda sin fichas, gana el otro de inmediato. Si ambos pierden su última ficha en el mismo combate, empatan. Un cañón cuenta como una ficha.

La partida dura como máximo **10 minutos** (reloj «Faltan» junto a la llama) o **12 rondas**, lo que llegue antes.
- **Al cumplirse los 10 minutos** suena el cañón y se decide, en este orden: más fichas en el tablero, más cartas activadas y más cartas potentes activadas (Refuerzo mayor, Golpe decisivo e Invocar cañón). Si todo coincide, es empate.
- **Al acabar la ronda 12** gana quien tenga más fichas; con el mismo número, empate.

## Monedas

Cada partida empieza con cero monedas por bando. Un combate potente da **10 monedas** a cada participante que cumpla la condición: fuerza final de 3 o más, usar un poder especial o activar un Golpe decisivo. Cada baja causada por una victoria, incluida la segunda baja de un combo, da **20 más**; los empates no dan monedas por bajas. Los saldos se ven en el HUD (botón de moneda) y en las estadísticas. No influyen en la victoria, no se compran con dinero real y todavía no hay cartera permanente ni tienda.

## Escenario «Campo andino»

El tablero por defecto es un **video en bucle** (`assets/escenario/campo-andino.mp4`, 9 s, sin audio, 1,2 MB) con exactamente 27 casillas en relieve (azules para los Idealistas, verdes neutrales y rojas para los Realistas), cuya grilla hexagonal, inclinada en perspectiva, **es** el tablero: no se dibuja ninguna grilla encima.

- **Un solo sistema de referencia:** casillas, fichas y animaciones usan las coordenadas del fotograma del video (720×1280). Cada casilla tiene su centro y su contorno en perspectiva, medidos en `assets/escenario/campo-andino-casillas.js`.
  - las zonas táctiles son polígonos con la forma real de cada hexágono;
  - las fichas se apoyan con la base sobre el centro, con sombra en el suelo y un tamaño proporcional a la profundidad;
  - las fichas de delante tapan a las de atrás.
- **Pantalla completa en móvil vertical:** el video cubre el 100 % de la pantalla, sin bordes ni desplazamiento. `layoutScene()` calcula la misma escala y el mismo recorte para el video y para la capa interactiva; si sobra alto, recorta cielo y nunca terreno. La interfaz flota encima. En escritorio y en horizontal, el video va en su columna recortando el cielo.
- **Bucle sin salto:** el último segundo se funde con el inicio. Con animaciones reducidas se muestra la imagen fija.
- **Opciones → Escenario:** la **Plaza** (tablero dibujado en SVG por `buildBoardArt()`) sigue disponible como alternativa secundaria. Cada escenario se define en `BOARD_THEMES`.

**Medición y cambio de video.** `tools/medir_escenario.py` mide la grilla del video y escribe `campo-andino-casillas.js`. El video actual (27 casillas en relieve) se mide con `--metodo bordes`:
1. localiza las cuatro estrellas doradas (B1, D1, B11, D11) fotograma a fotograma para obtener una perspectiva inicial;
2. la afina ajustando la grilla hexagonal ideal a los surcos entre casillas, sobre la mediana de varios fotogramas, con un margen de ±30 px por esquina para que no se deforme.

Requiere `opencv-python-headless`, `numpy` y `scipy`, solo para medir.

```
python3 tools/medir_escenario.py assets/escenario/campo-andino.mp4 assets/escenario/campo-andino-casillas.js andes --metodo bordes --verificacion revision.png
```

Para un escenario nuevo, genera la imagen con la guía `tools/guia-escenario-27.png` (`tools/guia_escenario.py`): 27 casillas, columnas de 5-6-5-6-5 y estrellas en B1, D1, B11 y D11. Anímala con la cámara fija y en bucle, optimízala con `ffmpeg` (sin audio, fundido de 1 s entre el final y el inicio) y mídela. Revisa siempre la imagen de verificación antes de publicar.

## Combate de muestra (PixiJS)

`muestra.html` es una escena aislada para validar la calidad visual y sonora antes de llevarla al juego. Abre https://afelex.github.io/Reales-Ideales/muestra.html, pulsa **Empezar** y elige **Ataque** (con cartas), **Fuego Especial** o **Golpe decisivo**. No modifica el juego ni sus reglas.

- **Motor gráfico:** PixiJS 8.19 (WebGL 2D, licencia MIT), incluido en `assets/vendor/` para no depender de servidores externos. Escenario, fichas y efectos comparten una cámara con zoom y temblor.
- **Animación de las fichas de plastilina:** respiración en reposo, anticipación al aplastarse antes de saltar, salto en arco con sombra que se encoge, aterrizaje con rebote elástico, destello al recibir el golpe y caída girando. No necesita arte nuevo.
- **Sensación de golpe:** pausa de impacto, zoom y temblor de cámara, cámara lenta y fotograma congelado con grietas en el Golpe decisivo, y destello de pantalla.
- **Efectos:** partículas de brasas, chispas, polvo, humo y trozos de plastilina del color del bando, ondas expansivas, marca de quemado, estela con imágenes residuales, runa de carga y tres segmentos del Fuego Especial.
- **Sonido:** síntesis por capas (chasquido, cuerpo y golpe grave) con reverberación generada. La música de batalla baja durante los momentos clave.
- **Accesibilidad:** con `prefers-reduced-motion` no hay temblor, zoom, cámara lenta ni pausas, y hay menos partículas.
- **Prueba local:** WebGL no puede usar imágenes ni video abiertos como archivo (`file://`). Sirve la carpeta con `python3 -m http.server` y abre `http://localhost:8000/muestra.html`.

## Pruebas automatizadas

El archivo `game.test.js` comprueba fuerza base 0, cañón inmediato, los poderes especiales, límites de movimiento, combos, búsqueda diferida, reserva de tres, rescates guardados, monedas y fin por tiempo. Ejecuta `node --test` para comprobar la regresión.

### Simulación histórica de equilibrio v0.15 (antes del Fuego Especial universal)

2000 partidas IA contra IA por versión (la misma IA en ambos bandos; indica tendencias, no sustituye las pruebas en mesa):

| Métrica | v0.12 (atacante 1, vanguardia +2) | v0.15 |
|---|---|---|
| Victorias Idealistas / Realistas / empate | 63% / 34% / 3% | 49% / 48% / 4% |
| Batallas que gana el atacante | 75% | 59% |
| Batallas en empate (doble baja) | 9% | 25% |
| Victorias con ataque especial / sin él | — | 75% / 49% |
| Ataques especiales por partida | — | 4,0 |
| Rondas por partida | 7,4 | 7,7 |

## Pruebas con jugadores nuevos

Enseña una batalla vecina y un disparo lejano. Pide a cada jugador que explique quién sale, quién se mueve y cómo se activa el rescate. Registra las ayudas en los tres primeros turnos, la duración total, la primera baja, rescates, victorias en defensa y ganas de revancha del 1 al 5. Para evaluar remontadas, identifica si un jugador que quedó dos fichas por debajo luego igualó o terminó ganando. Registra satisfacción por separado para cada persona. Una simulación permite contrastar reglas y jugadas legales. La comprensión y la diversión se observan en partidas de prueba con familias.

## Recursos gráficos y de audio

- `assets/clay/`: escena de la plaza, fichas, dorsos, emblemas, adornos y texturas de plastilina.
- `assets/v014/`: lámina de cartas y fichas del cañón realista rojo (`canon.webp`) e idealista azul (`canon-idealista.webp`).
- `assets/audio/`: *Clan Quest* (menú) y *Clan Charge* (partida), creadas por el autor con Suno.
- `assets/reserva/`: arte sin uso actual guardado para futuras opciones (tablero ilustrado anterior, plazas alternativas y animales candidatos: cóndor, puma, vicuña, anaconda, tortuga gigante y gallo de las rocas).

## Historial de versiones

- **v0.12–v0.14:** reglas tácticas base, cartas y arte de plastilina aprobado.
- **v0.15:** fuerza base 0, barra de ataque especial y poderes por animal (simulación arriba).
- **v0.16–v0.18:** temporizador, pantallas de fin y estadísticas, ajustes, textos sin códigos y vista previa del combate.
- **v0.19–v0.21:** escenario «Campo andino» en video, medido en perspectiva y a pantalla completa en móvil.
- **v0.22–v0.28:** HUD táctico, límite de 10 minutos y **Fuego Especial universal** (+3, alcance de dos casillas) en lugar de los poderes por animal.
- **v0.29–v0.34:** HUD compacto (turno, reloj de la llama, cartas públicas en combate, rescates guardados, monedas, barra superior del dock).
- **v0.35:** legibilidad del HUD en móvil y documentación al estado actual.
- **v0.36:** combate de muestra con PixiJS y, en el juego, partículas WebGL, cartas legibles, fichas que respiran y salen despedidas.
- **v0.37:** portada a pantalla completa, menú de juego, ataque al arrastrar sobre la ficha rival, cañones por facción y continuidad de las fichas durante la resolución del combate.
- **v0.38:** portada vertical 9:16, arte de botones y HUD, combate inmediato al elegir objetivo y remate de Golpe decisivo en partida.
- **v0.39:** video en bucle para el menú vertical, con portada fija como alternativa.
- **v0.40:** HUD inferior con marco textil de plastilina, controles e indicadores PNG y una lupa para Exploración en la reserva, la vista previa y el combate.
- **v0.41:** ranuras horizontales con emblemas sin deformación, lupa con ornamentos andinos e indicadores opacos con símbolo de prohibido para las acciones no disponibles.
- **v0.42:** ventanas centradas, botones de plastilina y marco dorado con adornos florales en la vista previa de cartas.
- **v0.43:** paneles y botones con bordes de proporción constante, contenido alineado al eje central y recortes de las cartas centrados sobre el arte original.
- **v0.46:** elección de bandera y poder, Asalto Eléctrico, Escarcha Especial y nuevo emblema para Fuego Victorioso.
