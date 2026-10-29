export const CATEGORIAS = [
  { id: 'seco', label: 'Seco' },
  { id: 'frio', label: 'Frío' },
  { id: 'congelado', label: 'Congelado' },
] as const;

export type CategoriaId = typeof CATEGORIAS[number]['id'];
