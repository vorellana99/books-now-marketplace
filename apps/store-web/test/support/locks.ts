// jsdom no trae Web Locks. Esta versión mínima los imita: un candado por nombre, en cola, que se comparte entre todas las
// "pestañas" de una prueba (varias sesiones creadas con el mismo objeto). Cumple lo que usa la tienda: `request(nombre, cb)`
export type LockManagerLike = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

export function createLocks(): LockManagerLike {
  const tails = new Map<string, Promise<unknown>>();
  return {
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      const previous = tails.get(name) ?? Promise.resolve();
      const run = previous.then(callback, callback);
      tails.set(
        name,
        run.catch(() => undefined),
      );
      return run;
    },
  };
}
