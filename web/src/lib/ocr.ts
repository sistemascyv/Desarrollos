import { createWorker } from 'tesseract.js';
import { extraerCuitsValidos } from './cuit';

// OCR 100% en el navegador (Tesseract, código abierto, sin costo ni API
// externa). Le pedimos que reconozca solo dígitos y guiones — no nos
// interesa el resto del texto de la captura, y restringir el alfabeto
// mejora bastante la precisión en los números.
export async function leerCuitsDeImagen(file: File): Promise<string[]> {
  const worker = await createWorker('eng');
  try {
    await worker.setParameters({ tessedit_char_whitelist: '0123456789-' });
    const { data } = await worker.recognize(file);
    return extraerCuitsValidos(data.text || '');
  } finally {
    await worker.terminate();
  }
}
