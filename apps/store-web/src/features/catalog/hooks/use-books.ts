import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { cleanQuery, getBook, searchBooks, type SearchParams } from "../api.ts";

// Claves de consulta ([04-flujos-de-pantalla, sección 1]): cada búsqueda y página tiene la suya
export const bookKeys = {
  all: ["books"] as const,
  search: ({ q, page }: SearchParams) => {
    const text = cleanQuery(q);
    return ["books", "search", { ...(text ? { q: text } : {}), page }] as const;
  },
  detail: (isbn: string) => ["books", "detail", isbn] as const,
};

// Mientras llega otra página se conserva la anterior en pantalla, para que la lista no parpadee
export function useBookSearch(params: SearchParams) {
  return useQuery({
    queryKey: bookKeys.search(params),
    queryFn: () => searchBooks(params),
    placeholderData: keepPreviousData,
  });
}

export function useBook(isbn: string) {
  return useQuery({ queryKey: bookKeys.detail(isbn), queryFn: () => getBook(isbn) });
}
