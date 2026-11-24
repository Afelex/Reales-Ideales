"""Mide la grilla hexagonal en perspectiva de un video de escenario.

Uso: python3 tools/medir_escenario.py VIDEO SALIDA.js NOMBRE [--metodo bordes] [--omitir A:2,C:6,...] [--verificacion imagen.png]

--metodo bordes: para casillas en relieve separadas por surcos (detecta las estrellas y ajusta la
perspectiva a los surcos). Sin él, detecta celdas cerradas por líneas oscuras finas.

--omitir: casillas del video que no se usan (columna:índice de fila del video, desde 0).
Con un video de exactamente 27 hexágonos (5-6-5-6-5) no hace falta.

1. Toma un fotograma y detecta las celdas cerradas por las líneas oscuras de la grilla.
2. Asigna cada celda a su columna y su índice de fila.
3. Ajusta una homografía entre una grilla hexagonal regular ideal y los centros medidos:
   así se obtienen centro y contorno en perspectiva también para las casillas abiertas del borde.
4. Escribe un archivo JS con las 27 casillas lógicas (coordenadas en píxeles del video).
Requiere opencv-python-headless y numpy (solo para medir; el juego no los usa).
"""
import json, subprocess, sys, tempfile, os
import cv2, numpy as np

video, salida, nombre = sys.argv[1:4]
args = dict(zip(sys.argv[4::2], sys.argv[5::2]))
# Casillas por columna en el video y en el juego (5-6-5-6-5).
omitir = {}
for item in filter(None, args.get('--omitir', '').split(',')):
    col, k = item.split(':'); omitir.setdefault('ABCDE'.index(col), set()).add(int(k))

ALTO = np.sqrt(3) / 2
ESQUINAS = [(-1, 0), (-.5, -ALTO), (.5, -ALTO), (1, 0), (.5, ALTO), (-.5, ALTO)]

def metodo_bordes(video):
    """Escenarios con surcos en relieve: estrellas doradas (B1, D1, B11, D11) para la
    perspectiva inicial y ajuste de la grilla ideal a los surcos (mediana de varios fotogramas)."""
    from scipy.optimize import minimize
    tmp = tempfile.mkdtemp(); fotos = []
    duracion = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video],
                                    capture_output=True, text=True).stdout)
    for i, t in enumerate(np.linspace(.5, duracion - .5, 6)):
        f = os.path.join(tmp, '%d.png' % i)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', video, '-frames:v', '1', f], check=True)
        fotos.append(cv2.imread(f).astype(np.float32))
    med = np.median(np.stack(fotos), axis=0).astype(np.uint8); H, W = med.shape[:2]
    # Estrellas: en cada fotograma, la mancha dorada más grande de cada cuadrante de la grilla
    # (giran, así que se toma la mediana de sus posiciones entre fotogramas).
    arriba, abajo = int(.33 * H), int(.88 * H)
    medio = (arriba + abajo) / 2
    posiciones = []
    for foto in fotos:
        hsv = cv2.cvtColor(foto.astype(np.uint8), cv2.COLOR_BGR2HSV)
        m = cv2.morphologyEx(cv2.inRange(hsv, (18, 120, 170), (35, 255, 255)), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        m[:arriba] = 0; m[abajo:] = 0
        n, lab, st, ce = cv2.connectedComponentsWithStats(m)
        # Las estrellas están en la primera y la última fila de la grilla (franjas del 20 % superior e inferior).
        banda = (abajo - arriba) * .22
        manchas = [(ce[i], st[i][4]) for i in range(1, n) if st[i][4] > 150 and W * .2 < ce[i][0] < W * .8
                   and (ce[i][1] < arriba + banda or ce[i][1] > abajo - banda)]
        try:
            posiciones.append([max((c for c in manchas if f(c[0])), key=lambda c: c[1])[0] for f in (
                lambda p: p[0] < W / 2 and p[1] < medio, lambda p: p[0] > W / 2 and p[1] < medio,
                lambda p: p[0] < W / 2 and p[1] > medio, lambda p: p[0] > W / 2 and p[1] > medio)])
        except ValueError:
            continue
    est = np.float32(np.median(np.array(posiciones), axis=0))
    print('estrellas', est.round(1).tolist())
    ideal4 = np.float32([[.75, -.5 * ALTO], [2.25, -.5 * ALTO], [.75, 4.5 * ALTO], [2.25, 4.5 * ALTO]])
    H0 = cv2.getPerspectiveTransform(ideal4, est)
    gray = cv2.GaussianBlur(cv2.cvtColor(med, cv2.COLOR_BGR2GRAY), (0, 0), 2.0)
    surcos = cv2.GaussianBlur(cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))), (0, 0), 2.5).astype(np.float32)
    centros = [(c * .75, (i - (.5 if c % 2 else 0)) * ALTO) for c in range(5) for i in range(6 if c % 2 else 5)]
    pts = np.float32([[(cx + .5 * (x1 + (x2 - x1) * t), cy + .5 * (y1 + (y2 - y1) * t))
                       for cx, cy in centros for j in range(6)
                       for (x1, y1), (x2, y2) in [(ESQUINAS[j], ESQUINAS[(j + 1) % 6])] for t in np.linspace(.15, .85, 7)]])
    # El ajuste mueve las cuatro esquinas de referencia como máximo ±30 px: la grilla sigue
    # siendo una perspectiva de la grilla regular, sin poder deformarse ni colapsar.
    def homografia(d):
        return cv2.getPerspectiveTransform(ideal4, est + np.float32(d).reshape(4, 2))
    def costo(d):
        p = cv2.perspectiveTransform(pts, homografia(d))[0]
        x = np.clip(p[:, 0], 0, W - 1).astype(np.float32)[None]; y = np.clip(p[:, 1], 0, H - 1).astype(np.float32)[None]
        return -float(cv2.remap(surcos, x, y, cv2.INTER_LINEAR).mean())
    r = minimize(costo, np.zeros(8), method='Powell', bounds=[(-30, 30)] * 8, options={'maxiter': 20000, 'xtol': .05, 'ftol': 1e-7})
    print('contraste de surcos: inicial', round(-costo(np.zeros(8)), 1), 'ajustado', round(-r.fun, 1),
          'desplazamiento máx px', round(float(np.abs(r.x).max()), 1))
    return med, homografia(r.x)

if args.get('--metodo') == 'bordes':
    img, Hm = metodo_bordes(video); H, W = img.shape[:2]
    salida_celdas = {}
    filas = {0: range(2, 11, 2), 1: range(1, 12, 2), 2: range(2, 11, 2), 3: range(1, 12, 2), 4: range(2, 11, 2)}
    for c in range(5):
        for i, fila in enumerate(filas[c]):
            cx, cy = c * .75, (i - (.5 if c % 2 else 0)) * ALTO
            centro = cv2.perspectiveTransform(np.float32([[[cx, cy]]]), Hm)[0][0]
            esquinas = cv2.perspectiveTransform(np.float32([[[cx + dx * .48, cy + dy * .48] for dx, dy in ESQUINAS]]), Hm)[0]
            salida_celdas['ABCDE'[c] + str(fila)] = {'x': round(float(centro[0]), 1), 'y': round(float(centro[1]), 1),
                'poly': [[round(float(a), 1), round(float(b), 1)] for a, b in esquinas]}
else:
    frame = os.path.join(tempfile.mkdtemp(), 'f.png')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '4', '-i', video, '-frames:v', '1', frame], check=True)
    img = cv2.imread(frame); H, W = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    bh = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))
    _, lines = cv2.threshold(bh, 18, 255, cv2.THRESH_BINARY)
    lines = cv2.dilate(lines, np.ones((3, 3), np.uint8))
    n, lab, stats, cent = cv2.connectedComponentsWithStats(cv2.bitwise_not(lines), 4)
    celdas = []
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if 4500 < a < 16000 and 70 < w < 160 and 70 < h < 130 and .25 * H < cent[i][1] < .97 * H:
            celdas.append(cent[i])
    celdas = np.array(celdas)
    # Columnas: agrupar por x en 5 grupos.
    xs = np.sort(celdas[:, 0]); cortes = [xs[0] - 1]
    orden = np.argsort(np.diff(xs))[-4:]
    cortes += sorted((xs[j] + xs[j + 1]) / 2 for j in orden) + [xs[-1] + 1]
    columnas = [[] for _ in range(5)]
    for c in celdas:
        col = next(i for i in range(5) if cortes[i] <= c[0] < cortes[i + 1])
        columnas[col].append(c)
    # Quitar manchas que no están alineadas con su columna (pasto del borde, etc.).
    for c in range(5):
        mx = np.median([p[0] for p in columnas[c]])
        columnas[c] = [p for p in columnas[c] if abs(p[0] - mx) < 22]
    # Índice de fila: dentro de cada columna se cuenta paso a paso (la separación crece
    # hacia abajo por la perspectiva); el primer índice se compara con la columna de referencia.
    paso = np.median([np.median(np.diff(sorted(p[1] for p in col))) for col in columnas if len(col) > 1])
    tope_par = min(min(p[1] for p in columnas[c]) for c in (0, 2, 4))
    tope_impar = min(min(p[1] for p in columnas[c]) for c in (1, 3))
    ideal, medido, indices = [], [], {}
    ALTO = np.sqrt(3) / 2
    for c, col in enumerate(columnas):
        col = sorted(col, key=lambda p: p[1])
        k = int(round((col[0][1] - (tope_impar if c % 2 else tope_par)) / paso))
        previo = col[0][1]
        for i, p in enumerate(col):
            if i:
                k += max(1, int(round((p[1] - previo) / (paso * (1 + .1 * (p[1] - tope_par) / (H / 2))))))
                previo = p[1]
            indices.setdefault(c, []).append(k)
            ideal.append((c * .75, (k - (.5 if c % 2 else 0)) * ALTO))
            medido.append((p[0], p[1]))
        columnas[c] = col
    print('celdas', {('ABCDE')[c]: [(int(p[0]), int(p[1])) for p in columnas[c]] for c in range(5)})
    print('filas por columna', {('ABCDE')[c]: v for c, v in indices.items()})
    # Ajustar el desfase de filas entre columnas pares e impares con la propia medida.
    ideal = np.array(ideal, np.float32); medido = np.array(medido, np.float32)
    Hm, inl = cv2.findHomography(ideal, medido, cv2.RANSAC, 6.0)
    err = np.linalg.norm(cv2.perspectiveTransform(ideal[None], Hm)[0] - medido, axis=1)
    print('celdas medidas', len(medido), 'error medio px', round(float(err.mean()), 2), 'máx', round(float(err.max()), 2))

    def proyectar(pts):
        return cv2.perspectiveTransform(np.array([pts], np.float32), Hm)[0]

    # Primera fila ideal de cada columna (puede haber casillas abiertas por encima de las medidas).
    salida_celdas = {}
    filas_logicas = {0: range(2, 11, 2), 1: range(1, 12, 2), 2: range(2, 11, 2), 3: range(1, 12, 2), 4: range(2, 11, 2)}
    for c in range(5):
        k_disponibles = [k for k in range(-1, 12) if k not in omitir.get(c, set())]
        # k ideal de la primera casilla del video en esta columna
        inicio = int(args.get('--inicio', '0'))
        ks = [k for k in k_disponibles if k >= inicio][:len(filas_logicas[c])]
        for fila, k in zip(filas_logicas[c], ks):
            cx, cy = c * .75, (k - (.5 if c % 2 else 0)) * ALTO
            centro = proyectar([(cx, cy)])[0]
            esquinas = proyectar([(cx + dx * .48, cy + dy * .48) for dx, dy in
                                  [(-1, 0), (-.5, -ALTO), (.5, -ALTO), (1, 0), (.5, ALTO), (-.5, ALTO)]])
            salida_celdas['ABCDE'[c] + str(fila)] = {'x': round(float(centro[0]), 1), 'y': round(float(centro[1]), 1),
                'poly': [[round(float(a), 1), round(float(b), 1)] for a, b in esquinas]}
datos = {'width': W, 'height': H, 'cells': salida_celdas}
with open(salida, 'w') as f:
    f.write('// Generado por tools/medir_escenario.py: casillas en píxeles del video, con perspectiva.\n')
    f.write('window.RealesIdealesEscenarios = window.RealesIdealesEscenarios || {};\n')
    f.write('window.RealesIdealesEscenarios[' + json.dumps(nombre) + '] = ' + json.dumps(datos, ensure_ascii=False) + ';\n')
# Verificación visual
out = img.copy()
for cid, v in salida_celdas.items():
    cv2.polylines(out, [np.array(v['poly'], np.int32)], True, (255, 0, 255), 2)
    cv2.circle(out, (int(v['x']), int(v['y'])), 5, (255, 0, 255), -1)
    cv2.putText(out, cid, (int(v['x']) - 14, int(v['y']) + 22), cv2.FONT_HERSHEY_SIMPLEX, .5, (255, 255, 255), 2)
if '--verificacion' in args:
    cv2.imwrite(args['--verificacion'], out)
print('casillas escritas', len(salida_celdas))
