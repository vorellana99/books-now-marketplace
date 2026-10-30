import { buildDatabaseUrl } from '../../../src/platform/config/database-url.js';

const base = {
  DB_HOST: 'localhost',
  DB_PORT: '5433',
  DB_USER: 'libroya',
  DB_PASSWORD: 'libroya',
  DB_NAME: 'libroya',
};

describe('buildDatabaseUrl', () => {
  it('arma la URL con las variables separadas', () => {
    expect(buildDatabaseUrl(base)).toBe(
      'postgresql://libroya:libroya@localhost:5433/libroya',
    );
  });

  it('codifica los caracteres especiales de usuario y contraseña', () => {
    const url = buildDatabaseUrl({ ...base, DB_PASSWORD: 'p@ss:w/rd#1%' });
    expect(url).toBe(
      'postgresql://libroya:p%40ss%3Aw%2Frd%231%25@localhost:5433/libroya',
    );
    expect(new URL(url).password).toBe('p%40ss%3Aw%2Frd%231%25');
  });

  it('usa el puerto 5432 si no se indica DB_PORT', () => {
    expect(buildDatabaseUrl({ ...base, DB_PORT: undefined })).toContain(
      '@localhost:5432/',
    );
  });

  it('indica qué variables faltan', () => {
    expect(() => buildDatabaseUrl({ DB_HOST: 'localhost' })).toThrow(
      /DB_USER, DB_PASSWORD, DB_NAME/,
    );
  });
});
