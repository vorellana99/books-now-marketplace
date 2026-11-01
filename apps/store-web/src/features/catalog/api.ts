import { api, unwrap } from "@/shared/api/client.ts";

// Tamaño de página del catálogo (HU-10): de 20 en 20
export const PAGE_SIZE = 20;

export type SearchParams = { q?: string | undefined; page: number };

// Un texto vacío o de espacios no filtra: no se manda
export const cleanQuery = (q: string | undefined): string | undefined => q?.trim() || undefined;

export function searchBooks({ q, page }: SearchParams) {
  const text = cleanQuery(q);
  return unwrap(
    api.GET("/books", {
      params: { query: { ...(text ? { q: text } : {}), page, pageSize: PAGE_SIZE } },
    }),
  );
}

// La API acepta el ISBN con o sin guiones y lo normaliza; aquí se manda tal cual
export function getBook(isbn: string) {
  return unwrap(api.GET("/books/{isbn}", { params: { path: { isbn } } }));
}
