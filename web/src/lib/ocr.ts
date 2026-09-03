import { createWorker } from 'tesseract.js';
import { extraerCandidatosCuit, extraerChequesDeLineas, type ChequeDetectado } from './cuit';

export interface ResultadoOcr {
  cheques: ChequeDetectado[];
  textoCrudo: string;
}

// El OCR falla más seguido en letra chica (celdas de una tabla, por
// ejemplo) que en texto grande de la misma captura — el algoritmo
// necesita cierta altura en píxeles por carácter para distinguir bien
// dígitos parecidos (5/8, 0/9). Agrandar la imagen antes de leerla ayuda
// bastante, aunque sea la misma resolución "estirada".
const ANCHO_MAXIMO_ESCALADO = 4800;
const FACTOR_ESCALA = 3;
// Texto gris clarito de una tabla de banco (poco contraste contra el
// fondo) es donde más se le escapan palabras enteras a Tesseract, no
// solo dígitos parecidos — separar bien negro de blanco antes de leer
// ayuda más que solo agrandar la imagen.
const CONTRASTE = 1.6;
const UMBRAL_BLANCO_NEGRO = 165;

async function escalarImagen(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.max(1, Math.min(FACTOR_ESCALA, ANCHO_MAXIMO_ESCALADO / bitmap.width));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    const gris = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
    const conContraste = (gris - 128) * CONTRASTE + 128;
    const bn = conContraste > UMBRAL_BLANCO_NEGRO ? 255 : 0;
    px[i] = px[i + 1] = px[i + 2] = bn;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Une los bloques/párrafos/líneas que devuelve Tesseract en una lista
// plana de líneas de texto — una línea de tabla del banco = una línea de
// texto, que es la unidad que usamos para reconstruir cada cheque.
function extraerLineas(page: Tesseract.Page): string[] {
  const lineas: string[] = [];
  for (const b of page.blocks || []) {
    for (const p of b.paragraphs || []) {
      for (const l of p.lines || []) {
        const texto = (l.text || '').trim();
        if (texto) lineas.push(texto);
      }
    }
  }
  if (lineas.length === 0 && page.text) {
    return page.text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return lineas;
}

// OCR 100% en el navegador (Tesseract, código abierto, sin costo ni API
// externa). Reconocemos el texto completo (no restringimos a dígitos:
// forzar todo el alfabeto a "0-9" en una captura con mucho texto
// alrededor del número que buscamos degrada la lectura en vez de
// mejorarla) y después reconstruimos cada cheque por línea.
export async function leerChequesDeImagen(file: File): Promise<ResultadoOcr> {
  const worker = await createWorker('eng');
  try {
    const imagen = await escalarImagen(file);
    const { data } = await worker.recognize(imagen, {}, { blocks: true });
    const textoCrudo = data.text || '';
    const lineas = extraerLineas(data);
    let cheques = extraerChequesDeLineas(lineas);
    if (cheques.length === 0) {
      // Si no se pudo reconstruir por líneas (imagen sin estructura de
      // tabla clara), al menos rescatamos los CUITs sueltos del texto
      // completo, sin emisor/N°/monto.
      cheques = extraerCandidatosCuit(textoCrudo).map((c) => ({
        cuit: c.cuit,
        valido: c.valido,
        numeroCheque: '',
        monto: '',
        emisorNombre: '',
      }));
    }
    return { cheques, textoCrudo };
  } finally {
    await worker.terminate();
  }
}
