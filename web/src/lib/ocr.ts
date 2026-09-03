import { createWorker } from 'tesseract.js';
import { extraerCandidatosCuit, type CandidatoCuit } from './cuit';

export interface ResultadoOcr {
  candidatos: CandidatoCuit[];
  textoCrudo: string;
}

// El OCR falla más seguido en letra chica (celdas de una tabla, por
// ejemplo) que en texto grande de la misma captura — el algoritmo
// necesita cierta altura en píxeles por carácter para distinguir bien
// dígitos parecidos (5/8, 0/9). Agrandar la imagen antes de leerla ayuda
// bastante, aunque sea la misma resolución "estirada".
const ANCHO_MAXIMO_ESCALADO = 4000;
const FACTOR_ESCALA = 2.5;

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
  return canvas;
}

// OCR 100% en el navegador (Tesseract, código abierto, sin costo ni API
// externa). Reconocemos el texto completo (no restringimos a dígitos:
// forzar todo el alfabeto a "0-9" en una captura con mucho texto
// alrededor del número que buscamos degrada la lectura en vez de
// mejorarla) y después filtramos con regex + validación de CUIT.
export async function leerCuitsDeImagen(file: File): Promise<ResultadoOcr> {
  const worker = await createWorker('eng');
  try {
    const imagen = await escalarImagen(file);
    const { data } = await worker.recognize(imagen);
    const textoCrudo = data.text || '';
    return { candidatos: extraerCandidatosCuit(textoCrudo), textoCrudo };
  } finally {
    await worker.terminate();
  }
}
