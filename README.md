# Reales Ideales

Prototipo v0.15 (propuesta de reglas v0.15) de un juego táctico de mesa para dos personas. Edad objetivo: 8 años en adelante. Duración objetivo: 15 minutos, pendiente de validar en mesa.

## Abrir la demostración

Abre `index.html` en un navegador o la versión publicada en https://afelex.github.io/Reales-Ideales/. En el menú, elige **Jugar con una persona** para compartir el dispositivo o **Versus IA** (la IA juega con los realistas). Arrastra una ficha o tócala y luego su destino; el diálogo de confirmación anticipa el resultado del combate. En Versus IA, ambas reservas son visibles durante el combate y el turno avanza automáticamente al concluir los efectos y agotarse las jugadas posibles. En partida local, toca una carta para descubrirla. El botón de engranaje abre los **ajustes**: música, efectos, temporizador (sin tiempo, relajado o normal) y velocidad de animación; se guardan en el navegador. Al terminar, la pantalla de victoria o derrota lleva a las estadísticas, desde donde se puede **exportar JSON** con las jugadas.

`game.js` contiene las reglas. `ai.js` decide las jugadas de la IA. `app.js` conecta las reglas con la interfaz y `fx.js` genera sonidos y música. Ejecuta `node --test` para comprobar el motor. La demo usa HTML, CSS y JavaScript y puede servirse desde alojamiento estático.

## Interfaz adaptable (GitHub Pages)

La partida ocupa **una sola pantalla** sin desplazamientos: cabecera compacta, marcadores de las dos facciones (fichas, rescates, mazo y barra de ataque especial), tablero, dock de acciones y cajón de cartas. El cajón nunca tapa el tablero (ver *Interfaz de partida v0.17*). Al cambiar de jugador en partidas locales, las cartas vuelven a ocultarse. En Versus IA se muestran las cartas de ambos bandos durante el combate.

### Verificación visual recomendada

Revisar **360×740**, **390×844**, **412×915**, **850×384**, **1024×768** y **1366×768**: las 27 casillas visibles, ningún panel con desplazamiento interno y el dock utilizable. Probar la privacidad de las cartas en modo local, combates, Exploración, combos, ataques especiales, cambios de turno, temporizador y el registro.

## Identidad visual

Usa el arte propio de Reales Ideales: portada, logotipo, jardín y fichas de plastilina. El **tablero se dibuja en SVG** (`buildBoardArt()` en `app.js`): baldosas de piedra incrustadas en el empedrado de la plaza, borde continuo, textura de arcilla, estrellas de rescate y guirnaldas de flores, sin códigos de casilla pintados. Cambiar colores o materiales del tablero es cuestión de CSS (`.board-tiles`, `.board-rim-*`) y abre la puerta a mapas temáticos.

Cada bando tiene ocho animales distintos (mono, llama, guacamayo, rana, tigrillo, gallo, cuy y gato), por eso los textos los nombran como «Tigrillo idealista» en vez de usar códigos como I5 o C6. Los códigos solo se conservan en el JSON exportado y en las etiquetas de accesibilidad de las casillas. Evita los emojis en toda la interfaz.

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

## Fuego Especial (regla universal)

Cada bando acumula un segmento al comenzar cada turno propio, hasta tres. El primer Fuego Especial está disponible en el turno 3. Al usarlo la carga vuelve a cero.

**Todas las fichas normales de los ocho animales comparten el mismo poder: +3 de fuerza al atacar a un enemigo adyacente.** Sustituye el ataque normal, no modifica el movimiento ni el alcance, y deja disponibles las dos cartas de cada combatiente. Los cañones no pueden usarlo. No requiere elegir comandante.

En el tablero físico se aplica el mismo bono de +3 al calcular la fuerza y se reinicia el contador de tres cargas. En la aplicación se utiliza el botón con icono de fuego y tres segmentos radiales, sin las letras SS.

## Combate

1. **Todas las fichas empiezan con 0 de fuerza**, ataquen o defiendan. Un **cañón** suma +2 cuando ataca. El ataque especial añade su bono al atacante. Ya no existe la ficha de vanguardia.
2. Cada jugador conserva **tres cartas** en su reserva, pero puede activar como máximo **dos** durante cada combate. Las cuatro oportunidades se alternan: defensor, atacante, defensor, atacante. Pasar conserva la siguiente oportunidad. Las cartas reveladas se ven antes de decidir.
3. **COMBO:** dos cartas iguales activadas por un mismo jugador durante el combate conceden +1 extra a su fuerza. **Golpe decisivo** tiene prioridad sobre los valores de fuerza: un golpe contra uno se anula, mientras que dos contra uno prevalecen. Si el ganador usó dos Golpes decisivos, activa **COMBO DECISIVO** y puede elegir una segunda ficha enemiga del tablero para eliminar, además del objetivo principal. Puede omitir la segunda eliminación. Si hay igual cantidad de Golpes decisivos, decide la fuerza; si ambos tienen dos, el ganador también puede reclamar el combo.
4. La ficha con más fuerza vence y se retira la otra. En empate se retiran ambas. Comprueba inmediatamente si termina la partida.
5. Si hubo un ganador y ambas fichas eran vecinas, **la vencedora ocupa la casilla liberada**. Si estaban lejos, el ganador puede mover cualquier ficha propia una casilla libre adyacente. El avance puede ocurrir durante el turno enemigo y no gasta acciones, incluso si esa ficha ya se movió. Puede activar un rescate.
6. Resuelve la eliminación adicional del combo decisivo, el avance, los rescates y las invocaciones según corresponda. Después, repón las cartas. Descarta modificadores y Golpes decisivos usados; separa las invocaciones utilizadas. **Exploración** permite elegir en el momento de activarla una carta todavía disponible del mazo; esa carta sustituye a Exploración **en su misma ranura de la reserva después del combate** (no puede usarse en el combate en curso). Roba cartas para completar la reserva de tres. Si el mazo se agota, baraja el descarte personal para formar un nuevo mazo.

## Cañón y rescate

**Invocar cañón convierte al instante en cañón a tu ficha que combate y le suma +2** en ese combate, tanto al atacar como al defender. Puedes revelarla si empezaste esa batalla sin cañón. Como máximo se juega una invocación propia por combate. La carta queda fuera de la partida. El cañón puede atacar desde el siguiente turno de su dueño y se mueve como una ficha normal. Si pierde al disparar desde lejos, se retira igualmente. Ambas facciones pueden tener su propio cañón simultáneamente. La segunda invocación está disponible en un combate posterior a la pérdida del primer cañón.

Al entrar en una estrella del extremo rival, puedes gastar un marcador y colocar una ficha propia eliminada en cualquier casilla libre de tu zona inicial. Cuenta la llegada por movimiento normal o por avance tras combate. Permanecer en la estrella no vuelve a activarla. Si prefieres guardar el marcador o el rescate es imposible, puedes intentarlo en otra llegada. La ficha recuperada vuelve **como ficha normal**, incluso si había sido el cañón. Los idealistas rescatan en B11 y D11. Los realistas rescatan en B1 y D1.

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

Si un bando se queda sin fichas, gana el otro de inmediato. Si ambos pierden su última ficha en el mismo combate, empatan. Al acabar la ronda 12, gana quien tenga más fichas en el tablero. Con el mismo número, hay empate. Un cañón cuenta como una ficha.

## Avisos de fase y mazo visible

La interfaz muestra banners de pantalla completa para los cambios principales: comienzo/fin de turno, movimiento, declaración de ataque, robo de cartas, invocación, rescate y combos. Un rótulo más pequeño indica la fase actual. Cada facción tiene un contador de **cartas restantes en su mazo**, sin contar las cartas en reserva ni el descarte. La reserva de cada jugador solo se descubre cuando le corresponde elegir.

## Interfaz de partida v0.17

- **Escena única:** el tablero se apoya sobre el empedrado de la plaza, con inclinación leve y sombra de contacto, sin recuadro propio.
- **Las fichas siempre a la vista:** en escritorio el duelo ocupa la columna izquierda y las cartas la derecha. En móvil vertical el cajón entra en el flujo y el tablero se ajusta para caber entero. En horizontal, el duelo y las cartas usan la columna derecha.
- **Sin desplazamientos:** el cajón, la elección de Exploración (cuadrícula de cartas) y la ayuda caben en pantalla.
- **Guía del ataque especial:** aviso "¡ATAQUE ESPECIAL LISTO!" al llenarse la barra, fichas con anillo de fuego, botón redondo de fuego en el dock y un globo con flecha que indica cada paso. Paso 1: ficha con fuego. Paso 2: botón. Paso 3: objetivo con mira.
- **Música:** *Clan Quest* en el menú principal y *Clan Charge* durante la partida, con transición suave. Se silencia con el botón de sonido. Los navegadores pueden esperar al primer toque para empezar a sonar. Pistas creadas por el autor con Suno, en `assets/audio/`.

## Fase 1 y tablero SVG (v0.18)

- **Sin códigos visibles:** registro, resultado, banners, diálogos y estadísticas usan el nombre del animal y su bando.
- **Vista previa del combate** en el diálogo de ataque: fuerza inicial, qué pasa si nadie juega cartas y cuántas cartas útiles tienes.
- **Ajustes:** música y efectos por separado, temporizador (sin tiempo, relajado ×2 o normal) y velocidad de animación (normal o rápida).
- **Tablero SVG integrado** con la plaza.
- **Recursos más ligeros:** WebP para cartas y cañón; arte sin uso movido a `assets/reserva/`.

## Escenario «Campo andino» (v0.21)

El tablero por defecto es un **video en bucle** (`assets/escenario/campo-andino.mp4`, 9 s, sin audio, 1,2 MB) con exactamente 27 casillas en relieve (azules para los Idealistas, verdes neutrales y rojas para los Realistas), cuya grilla hexagonal, inclinada en perspectiva, **es** el tablero: no se dibuja ninguna grilla encima.

- **Un solo sistema de referencia:** casillas, fichas y animaciones usan las coordenadas del fotograma del video (720×1280). Cada casilla tiene su centro y su contorno en perspectiva, medidos en `assets/escenario/campo-andino-casillas.js`.
  - las zonas táctiles son polígonos con la forma real de cada hexágono;
  - las fichas se apoyan con la base sobre el centro, con sombra en el suelo y un tamaño proporcional a la profundidad;
  - las fichas de delante tapan a las de atrás.
- **Pantalla completa en móvil vertical:** el video cubre el 100 % de la pantalla, sin bordes ni desplazamiento. `layoutScene()` calcula la misma escala y el mismo recorte para el video y para la capa interactiva; si sobra alto, recorta cielo y nunca terreno. La interfaz flota encima. Durante el combate, los marcadores se apartan y las cartas ocupan la franja del cielo, hasta justo encima de las fichas (`--grid-top`). En escritorio y en horizontal, el video va en su columna recortando el cielo.
- **Bucle sin salto:** el último segundo se funde con el inicio. Con animaciones reducidas se muestra la imagen fija.
- **Ajustes → Escenario:** permite volver a la **Plaza** (tablero SVG). Cada escenario se define en `BOARD_THEMES`.

**Medición y cambio de video.** `tools/medir_escenario.py` mide la grilla del video y escribe `campo-andino-casillas.js`. El video actual (27 casillas en relieve) se mide con `--metodo bordes`:
1. localiza las cuatro estrellas doradas (B1, D1, B11, D11) fotograma a fotograma para obtener una perspectiva inicial;
2. la afina ajustando la grilla hexagonal ideal a los surcos entre casillas, sobre la mediana de varios fotogramas, con un margen de ±30 px por esquina para que no se deforme.

Requiere `opencv-python-headless`, `numpy` y `scipy`, solo para medir.

```
python3 tools/medir_escenario.py assets/escenario/campo-andino.mp4 assets/escenario/campo-andino-casillas.js andes --metodo bordes --verificacion revision.png
```

Para un escenario nuevo, genera la imagen con la guía `tools/guia-escenario-27.png` (`tools/guia_escenario.py`): 27 casillas, columnas de 5-6-5-6-5 y estrellas en B1, D1, B11 y D11. Anímala con la cámara fija y en bucle, optimízala con `ffmpeg` (sin audio, fundido de 1 s entre el final y el inicio) y mídela. Revisa siempre la imagen de verificación antes de publicar.

## Pruebas automatizadas

El archivo `game.test.js` comprueba fuerza base 0, cañón inmediato, carga y poder universal de los ocho animales, límites de movimiento, combos, búsqueda diferida y reserva de tres. Ejecuta `node --test` para comprobar la regresión.

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
- `assets/v014/cartas-aprobadas.webp` (lámina 3×2 de cartas) y `canon.webp`: convertidos de PNG a WebP (de 5 MB a 0,8 MB).
- `assets/audio/`: *Clan Quest* (menú) y *Clan Charge* (partida), creadas por el autor con Suno.
- `assets/reserva/`: arte sin uso actual guardado para futuras opciones (tablero ilustrado anterior, plazas alternativas y animales candidatos: cóndor, puma, vicuña, anaconda, tortuga gigante y gallo de las rocas).
