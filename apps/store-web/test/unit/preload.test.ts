import { describe, expect, it, vi } from "vite-plus/test";
import { PRELOADED_ROUTES, preloadWhenIdle, whenIdle } from "@/app/preload.ts";

describe("preloadWhenIdle", () => {
  it("no precarga nada hasta que el navegador está libre, y entonces precarga las rutas de la compra", () => {
    const preloadRoute = vi.fn().mockResolvedValue(undefined);
    let run: () => void = () => {};
    preloadWhenIdle({ preloadRoute }, (callback) => {
      run = callback;
    });
    expect(preloadRoute).not.toHaveBeenCalled();
    run();
    expect(preloadRoute.mock.calls.map(([options]) => options.to)).toEqual([...PRELOADED_ROUTES]);
    expect([...PRELOADED_ROUTES]).toEqual(["/carrito", "/compra", "/pedidos"]);
  });

  it("una ruta que no se puede precargar (redirige a entrar, falla la red) no rompe nada ni detiene a las demás", async () => {
    const preloadRoute = vi
      .fn()
      .mockRejectedValueOnce(new Error("redirección"))
      .mockResolvedValue(undefined);
    preloadWhenIdle({ preloadRoute }, (callback) => callback());
    await Promise.resolve();
    expect(preloadRoute).toHaveBeenCalledTimes(PRELOADED_ROUTES.length);
  });

  it("también se tolera un `preloadRoute` que lanza al instante", () => {
    const preloadRoute = vi.fn(() => {
      throw new Error("síncrono");
    });
    expect(() => preloadWhenIdle({ preloadRoute }, (callback) => callback())).not.toThrow();
    expect(preloadRoute).toHaveBeenCalledTimes(PRELOADED_ROUTES.length);
  });
});

describe("whenIdle", () => {
  it("usa requestIdleCallback si existe", () => {
    const original = globalThis.requestIdleCallback;
    const request = vi.fn();
    globalThis.requestIdleCallback = request as unknown as typeof requestIdleCallback;
    try {
      const callback = () => {};
      whenIdle(callback);
      expect(request).toHaveBeenCalledWith(
        callback,
        expect.objectContaining({ timeout: expect.any(Number) }),
      );
    } finally {
      globalThis.requestIdleCallback = original;
    }
  });

  it("sin requestIdleCallback (Safari) cae a un temporizador", () => {
    vi.useFakeTimers();
    const original = globalThis.requestIdleCallback;
    // @ts-expect-error: se simula un navegador sin la función
    delete globalThis.requestIdleCallback;
    try {
      const callback = vi.fn();
      whenIdle(callback);
      expect(callback).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(callback).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.requestIdleCallback = original;
      vi.useRealTimers();
    }
  });
});
