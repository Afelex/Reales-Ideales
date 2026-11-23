"""Genera la imagen guía 9:16 (720×1280) con la grilla lógica de 27 hexágonos en perspectiva.

Sirve como referencia para generar un escenario nuevo (imagen o video) cuya grilla
coincida con las reglas: columnas A, C y E con 5 casillas; B y D con 6; estrellas de
rescate en B1, D1, B11 y D11. Usa la misma perspectiva y el mismo encuadre que el
video actual del Campo andino. Uso: python3 tools/guia_escenario.py salida.png
"""
import sys
import cv2, numpy as np
ALTO = np.sqrt(3) / 2
# Esquinas de referencia (centros de B1, D1, B11 y D11 en el video actual).
ideal = np.float32([[.75, -.5 * ALTO], [2.25, -.5 * ALTO], [.75, 4.5 * ALTO], [2.25, 4.5 * ALTO]])
video = np.float32([[248, 490], [472, 487], [250, 1125], [475, 1115]])
Hm = cv2.getPerspectiveTransform(ideal, video)
zona = {'I': ['A2', 'B1', 'B3', 'C2', 'C4', 'D1', 'D3', 'E2'], 'R': ['A10', 'B9', 'B11', 'C8', 'C10', 'D9', 'D11', 'E10']}
color = {'I': (176, 116, 52), 'R': (52, 64, 196), 'N': (92, 168, 112)}
img = np.full((1280, 720, 3), (235, 225, 210), np.uint8)
cv2.rectangle(img, (0, 0), (720, 400), (230, 200, 150), -1)
cv2.putText(img, 'CIELO / DECORADO (sin casillas)', (90, 210), cv2.FONT_HERSHEY_SIMPLEX, .8, (120, 90, 60), 2)
for c in range(5):
    filas = range(1, 12, 2) if c % 2 else range(2, 11, 2)
    for i, fila in enumerate(filas):
        cx, cy = c * .75, (i - (.5 if c % 2 else 0)) * ALTO
        poly = cv2.perspectiveTransform(np.float32([[[cx + dx * .5, cy + dy * .5] for dx, dy in
                [(-1, 0), (-.5, -ALTO), (.5, -ALTO), (1, 0), (.5, ALTO), (-.5, ALTO)]]]), Hm)[0].astype(np.int32)
        cid = 'ABCDE'[c] + str(fila)
        z = 'I' if cid in zona['I'] else 'R' if cid in zona['R'] else 'N'
        cv2.fillPoly(img, [poly], color[z]); cv2.polylines(img, [poly], True, (40, 40, 40), 3)
        centro = cv2.perspectiveTransform(np.float32([[[cx, cy]]]), Hm)[0][0]
        if cid in ('B1', 'D1', 'B11', 'D11'):
            cv2.drawMarker(img, (int(centro[0]), int(centro[1])), (0, 215, 255), cv2.MARKER_STAR, 46, 5)
        cv2.putText(img, cid, (int(centro[0]) - 18, int(centro[1]) + 34), cv2.FONT_HERSHEY_SIMPLEX, .55, (255, 255, 255), 2)
cv2.putText(img, '27 casillas: A,C,E = 5  |  B,D = 6', (120, 1250), cv2.FONT_HERSHEY_SIMPLEX, .7, (60, 60, 60), 2)
cv2.imwrite(sys.argv[1] if len(sys.argv) > 1 else 'guia-escenario-27.png', img)
