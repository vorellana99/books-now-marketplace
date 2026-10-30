import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vite-plus/test";
import { bookKeys, useBook, useBookSearch } from "@/features/catalog/index.ts";
import { isApiError } from "@/shared/api/errors.ts";
import {
  apiError,
  book,
  bookNumber,
  detailHandler,
  page,
  searchHandler,
} from "../support/books.ts";
import { server } from "../support/server.ts";

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
};

describe("useBookSearch", () => {
  it("pide la página y el tamaño de página (20) a la API", async () => {
    let received: URL | undefined;
    server.use(
      searchHandler((url) => {
        received = url;
        return page([bookNumber(1)]);
      }),
    );
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useBookSearch({ page: 3 }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(received?.searchParams.get("page")).toBe("3");
    expect(received?.searchParams.get("pageSize")).toBe("20");
  });

  it("sin texto de búsqueda no manda q, y con texto lo manda recortado", async () => {
    const received: (string | null)[] = [];
    server.use(
      searchHandler((url) => {
        received.push(url.searchParams.get("q"));
        return page([]);
      }),
    );
    const { Wrapper } = wrapper();
    const first = renderHook(() => useBookSearch({ page: 1 }), { wrapper: Wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    const second = renderHook(() => useBookSearch({ q: "  clean  ", page: 1 }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    expect(received).toEqual([null, "clean"]);
  });

  it("devuelve la página tal como la entrega la API (total de la búsqueda, no de la página)", async () => {
    server.use(searchHandler(() => page([bookNumber(1), bookNumber(2)], { total: 42 })));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useBookSearch({ page: 1 }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(2);
    expect(result.current.data?.total).toBe(42);
  });

  it("guarda cada búsqueda y página con su propia clave", () => {
    expect(bookKeys.search({ q: "clean", page: 2 })).toEqual([
      "books",
      "search",
      { q: "clean", page: 2 },
    ]);
    expect(bookKeys.search({ page: 1 })).not.toEqual(bookKeys.search({ q: "clean", page: 1 }));
    expect(bookKeys.search({ q: "clean", page: 1 })).not.toEqual(
      bookKeys.search({ q: "clean", page: 2 }),
    );
  });

  it("al cambiar de página conserva la anterior mientras carga la nueva", async () => {
    server.use(
      searchHandler((url) => {
        const n = Number(url.searchParams.get("page"));
        return page([bookNumber(n)], { page: n, total: 2 });
      }),
    );
    const { Wrapper } = wrapper();
    const { result, rerender } = renderHook(({ n }) => useBookSearch({ page: n }), {
      wrapper: Wrapper,
      initialProps: { n: 1 },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ n: 2 });
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.items[0]?.title).toBe("Libro 01");
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data?.items[0]?.title).toBe("Libro 02");
  });

  it("un 400 de la API sale como ApiError", async () => {
    server.use(searchHandler(() => apiError(400, "VALIDATION_ERROR")));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useBookSearch({ page: 1 }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(isApiError(result.current.error)).toBe(true);
  });
});

describe("useBook", () => {
  it("pide el libro por su ISBN", async () => {
    let received = "";
    server.use(
      detailHandler((isbn) => {
        received = isbn;
        return book();
      }),
    );
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useBook("9780132350884"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(received).toBe("9780132350884");
    expect(result.current.data?.title).toBe("Clean Code");
  });

  it("acepta el ISBN con guiones: lo manda tal cual y la API lo normaliza", async () => {
    let received = "";
    server.use(
      detailHandler((isbn) => {
        received = isbn;
        return book();
      }),
    );
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useBook("978-0-13-235088-4"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(received).toBe("978-0-13-235088-4");
  });

  it("guarda el libro con la clave books/detail/<isbn>", () => {
    expect(bookKeys.detail("9780132350884")).toEqual(["books", "detail", "9780132350884"]);
  });

  it.each([
    [404, "NOT_FOUND"],
    [422, "INVALID_ISBN"],
  ])("un %i (%s) sale como ApiError con su código", async (status, errorCode) => {
    server.use(detailHandler(() => apiError(status, errorCode)));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useBook("9780132350884"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    const error = result.current.error;
    expect(isApiError(error) && error.status).toBe(status);
    expect(isApiError(error) && error.errorCode).toBe(errorCode);
  });
});
