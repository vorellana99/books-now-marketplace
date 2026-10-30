import { http, HttpResponse } from "msw";
import type { Book, BookPage } from "@/shared/api/types.ts";

// Datos y respuestas simuladas del catálogo, con la forma real de `GET /books` y `GET /books/:isbn`
export const API = (path: string) => `${globalThis.location.origin}/api${path}`;

export const book = (overrides: Partial<Book> = {}): Book => ({
  isbn: "9780132350884",
  title: "Clean Code",
  author: "Robert C. Martin",
  price: { amount: "90.00", currency: "PEN" },
  ...overrides,
});

export const page = (items: Book[], overrides: Partial<BookPage> = {}): BookPage => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
  ...overrides,
});

// Un libro nº n, con ISBN distinto (no hace falta que el dígito de control sea válido: la API simulada no lo comprueba)
export const bookNumber = (n: number): Book =>
  book({
    isbn: `97800000${String(n).padStart(5, "0")}`,
    title: `Libro ${String(n).padStart(2, "0")}`,
    author: `Autor ${n}`,
    price: { amount: `${10 + n}.00`, currency: "PEN" },
  });

export const searchHandler = (respond: (url: URL) => BookPage | Response) =>
  http.get(API("/books"), ({ request }) => {
    const result = respond(new URL(request.url));
    return result instanceof Response ? result : HttpResponse.json(result);
  });

export const detailHandler = (respond: (isbn: string) => Book | Response) =>
  http.get(API("/books/:isbn"), ({ params }) => {
    const result = respond(String(params.isbn));
    return result instanceof Response ? result : HttpResponse.json(result);
  });

export const apiError = (status: number, errorCode: string, requestId = "req-1234") =>
  HttpResponse.json(
    { statusCode: status, errorCode, message: errorCode },
    { status, headers: { "X-Request-Id": requestId } },
  );
