// Una respuesta que se retiene hasta que la prueba la suelta. Sustituye a las esperas de tiempo fijo (`setTimeout(80)`),
// que fallan cuando la máquina va cargada: la prueba mira el estado «en curso» todo el tiempo que quiera
export type Deferred = { promise: Promise<void>; release: () => void };

export function deferred(): Deferred {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
