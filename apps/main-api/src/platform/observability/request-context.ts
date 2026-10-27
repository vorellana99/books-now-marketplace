// AsyncLocalStorage nativo de Node, sin librerías
import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage<{ requestId: string }>();

export const RequestContext = {
  run<T>(requestId: string, fn: () => T): T {
    return storage.run({ requestId }, fn);
  },
  requestId(): string | undefined {
    return storage.getStore()?.requestId;
  },
};
