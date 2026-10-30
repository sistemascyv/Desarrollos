import type { Sucursal } from '../types';

export const DIRECCION_SUCURSAL: Record<Sucursal, { calle: string; localidad: string }> = {
  san_francisco: { calle: 'San Lorenzo 31', localidad: 'San Francisco' },
  cordoba: { calle: 'Celso Barrios 3779', localidad: 'Córdoba Capital' },
  rosario: { calle: 'Centro 27 - San Nicolás 3151', localidad: 'Rosario' },
  buenos_aires: { calle: 'Av. 27 de Febrero 5631', localidad: 'Villa Soldati (C.A.B.A.)' },
};
