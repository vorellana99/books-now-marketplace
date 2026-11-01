import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { configureHttpApp } from '../../../src/platform/http/configure-http-app.js';

const calls: string[] = [];

vi.mock('../../../src/platform/http/configure-app.js', () => ({
  configureApp: (app: unknown) =>
    calls.push(`app:${String((app as { id: string }).id)}`),
}));
vi.mock('../../../src/platform/http/configure-security.js', () => ({
  configureSecurity: (app: unknown) =>
    calls.push(`security:${String((app as { id: string }).id)}`),
}));
vi.mock('../../../src/platform/http/configure-swagger.js', () => ({
  configureSwagger: (app: unknown) =>
    calls.push(`swagger:${String((app as { id: string }).id)}`),
}));

// Lo que corre en producción (main.ts) y lo que prueban los e2e (createHttpApp) se configura con UNA función, en un orden
// fijo: antes se repetían las tres llamadas a mano en cada sitio (tarea 9.11)
describe('configureHttpApp', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('configura la aplicación, luego la seguridad y al final Swagger, sobre la misma app', () => {
    configureHttpApp({ id: 'A' } as unknown as INestApplication);

    expect(calls).toEqual(['app:A', 'security:A', 'swagger:A']);
  });

  it('cada llamada configura la app que recibe', () => {
    configureHttpApp({ id: 'A' } as unknown as INestApplication);
    configureHttpApp({ id: 'B' } as unknown as INestApplication);

    expect(calls).toEqual([
      'app:A',
      'security:A',
      'swagger:A',
      'app:B',
      'security:B',
      'swagger:B',
    ]);
  });
});

describe('quién usa configureHttpApp', () => {
  it.each(['src/main.ts', 'test/support/http-app.ts'])(
    '%s configura con configureHttpApp y no repite las tres llamadas',
    (file) => {
      const text = readFileSync(file, 'utf8');
      expect(text).toContain('configureHttpApp(');
      for (const single of [
        'configureApp(',
        'configureSecurity(',
        'configureSwagger(',
      ]) {
        expect(text, `${file} llama ${single}`).not.toContain(single);
      }
    },
  );
});
