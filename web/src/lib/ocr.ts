import { createWorker } from 'tesseract.js';
import { extraerCandidatosCuit, type CandidatoCuit } from './cuit';

export interface ResultadoOcr {
  candidatos: CandidatoCuit[];
  textoCrudo: string;
}

// OCR 100% en el navegador (Tesseract, código abierto, sin costo ni API
// externa). Reconocemos el texto completo (no restringimos a dígitos:
// forzar todo el alfabeto a "0-9" en una captura con mucho texto
// alrededor del número que buscamos degrada la lectura en vez de
// mejorarla) y después filtramos con regex + validación de CUIT.
export async function leerCuitsDeImagen(file: File): Promise<ResultadoOcr> {
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(file);
    const textoCrudo = data.text || '';
    return { candidatos: extraerCandidatosCuit(textoCrudo), textoCrudo };
  } finally {
    await worker.terminate();
  }
}
