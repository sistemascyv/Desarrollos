import { pb } from './pb';
import type { SueldosBasicoHistorial } from '../types';

// Resta 1 día a una fecha "YYYY-MM-DD" (en UTC, para no correrse por huso horario).
function diaAnterior(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const anteriorUtc = Date.UTC(y, m - 1, d) - 86400000;
  return new Date(anteriorUtc).toISOString().slice(0, 10);
}

// Abre un nuevo tramo de vigencia de básico para un legajo (cerrando el
// tramo abierto anterior si existía) y actualiza fichadas_legajos.categoria/
// .basico como caché del valor "actual" -- usado tanto al cambiar la
// categoría de un legajo puntual (Personal → Empleados) como al propagar un
// cambio de "Básico sugerido" de una categoría a todos sus legajos (Sueldos
// → Categorías). Ver
// docs/superpowers/specs/2026-11-18-basico-historial-vigencia-design.md.
export async function cambiarBasicoLegajo(params: {
  legajoId: string;
  categoriaId: string;
  basicoSugerido: number | null | undefined;
  vigenciaDesde: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { legajoId, categoriaId, basicoSugerido, vigenciaDesde } = params;
  if (!basicoSugerido) {
    return { ok: false, error: 'Esa categoría no tiene "Básico sugerido" cargado — completalo primero en Sueldos → Categorías.' };
  }

  let tramoAbierto: SueldosBasicoHistorial | null = null;
  try {
    tramoAbierto = await pb.collection('sueldos_basico_historial').getFirstListItem<SueldosBasicoHistorial>(
      pb.filter('legajo = {:legajo} && vigencia_hasta = ""', { legajo: legajoId })
    );
  } catch { /* no había tramo abierto */ }

  if (tramoAbierto && vigenciaDesde <= tramoAbierto.vigencia_desde) {
    return { ok: false, error: 'La fecha de vigencia no puede ser anterior o igual al inicio del tramo actual (' + tramoAbierto.vigencia_desde + ').' };
  }

  if (tramoAbierto) {
    await pb.collection('sueldos_basico_historial').update(tramoAbierto.id, { vigencia_hasta: diaAnterior(vigenciaDesde) });
  }
  await pb.collection('sueldos_basico_historial').create({
    legajo: legajoId, categoria: categoriaId, basico: basicoSugerido, vigencia_desde: vigenciaDesde, vigencia_hasta: '',
  });
  await pb.collection('fichadas_legajos').update(legajoId, { categoria: categoriaId, basico: basicoSugerido });

  return { ok: true };
}
