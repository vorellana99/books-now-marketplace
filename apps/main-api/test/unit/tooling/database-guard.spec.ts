import {
  assertIsolatedDatabase,
  resetDatabase,
} from '../../support/database.js';

describe('guardián de la base de pruebas', () => {
  const original = process.env.INTEGRATION_DB_CONTAINER;
  afterEach(() => {
    if (original === undefined) delete process.env.INTEGRATION_DB_CONTAINER;
    else process.env.INTEGRATION_DB_CONTAINER = original;
  });

  it('rechaza operar si la base no es el contenedor de pruebas', () => {
    delete process.env.INTEGRATION_DB_CONTAINER;
    expect(() => assertIsolatedDatabase()).toThrow(/contenedor de pruebas/);
  });

  it('permite operar cuando el contenedor de pruebas está activo', () => {
    process.env.INTEGRATION_DB_CONTAINER = '1';
    expect(() => assertIsolatedDatabase()).not.toThrow();
  });

  it('resetDatabase se niega antes de conectarse si no hay contenedor', async () => {
    delete process.env.INTEGRATION_DB_CONTAINER;
    process.env.DB_HOST = 'host-que-no-existe.invalid'; // si intentara conectarse, fallaría distinto
    await expect(resetDatabase()).rejects.toThrow(/contenedor de pruebas/);
  });
});
