import { connectionOptions } from '../../src/platform/config/connection-options.js';

describe('connectionOptions: lo que se fija en cada conexión de la aplicación', () => {
  it('fuerza UTC y pone el límite de tiempo de cada sentencia', () => {
    expect(connectionOptions(5000)).toBe(
      '-c timezone=UTC -c statement_timeout=5000',
    );
  });

  it('usa el valor indicado', () => {
    expect(connectionOptions(250)).toContain('statement_timeout=250');
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rechaza %s: un límite inválido no debe llegar a la conexión',
    (value) => {
      expect(() => connectionOptions(value)).toThrow(/DB_STATEMENT_TIMEOUT_MS/);
    },
  );
});
