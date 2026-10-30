import { z } from "zod";

// La búsqueda y la página viven en la URL. Un valor inválido se descarta en lugar de romper la pantalla: `q` de solo
// espacios o que no es texto, y `page` que no es un entero de 1 en adelante, vuelven a su valor por defecto (sin búsqueda,
// página 1). Ambos son opcionales para que un enlace a `/` no tenga que indicarlos
export const catalogSearchSchema = z.object({
  q: z.string().trim().min(1).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
});

export type CatalogSearch = z.infer<typeof catalogSearchSchema>;
