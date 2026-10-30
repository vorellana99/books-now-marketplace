import { existsSync, readdirSync } from 'node:fs';

const BASE = 'src/contexts/catalog';
const list = (dir: string) =>
  existsSync(`${BASE}/${dir}`)
    ? readdirSync(`${BASE}/${dir}`, { withFileTypes: true })
    : [];
const files = (dir: string) =>
  list(dir)
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

// Catálogo sigue la misma arquitectura que Ventas, Identidad e Inventario (tarea 10.10)
describe('estructura de contexts/catalog', () => {
  it('infrastructure/ solo tiene persistence e interface/ solo http (sin consumidores); ningún archivo suelto (tarea 10.18)', () => {
    const folders = (dir: string) =>
      list(dir)
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));
    expect(folders('infrastructure')).toEqual(['persistence']);
    expect(folders('interface')).toEqual(['http']);
    expect(files('infrastructure')).toEqual([]);
    expect(files('interface')).toEqual([]);
  });

  it('http/ tiene los controladores, los DTO y las respuestas', () => {
    expect(files('interface/http')).toEqual([
      'admin-book.controller.ts',
      'book-price.response.ts',
      'book.controller.ts',
      'create-book.dto.ts',
      'search-books.dto.ts',
    ]);
  });

  it('persistence/ tiene los dos adaptadores de Prisma', () => {
    expect(files('infrastructure/persistence')).toEqual([
      'prisma-book-catalog.ts',
      'prisma-book.repository.ts',
    ]);
  });

  it('los cinco handlers viven en application/use-cases/book (tarea 10.16)', () => {
    expect(files('application')).toEqual([]);
    expect(files('application/use-cases/book')).toEqual(
      expect.arrayContaining([
        'create-book.handler.ts',
        'get-book-price.handler.ts',
        'get-books-prices.handler.ts',
        'search-books.handler.ts',
        'update-book.handler.ts',
      ]),
    );
  });

  it('ningún handler vive en infrastructure/', () => {
    const handlers = ['http', 'persistence'].flatMap((dir) =>
      files(`infrastructure/${dir}`).filter((f) => f.endsWith('.handler.ts')),
    );
    expect(handlers).toEqual([]);
  });

  it('domain/ports/ tiene los dos puertos', () => {
    expect(files('domain/ports')).toEqual([
      'book-catalog.port.ts',
      'book.repository.ts',
    ]);
  });

  it('domain/ solo tiene model/book y ports/ (tarea 10.17)', () => {
    expect(files('domain')).toEqual([]);
    expect(files('domain/model/book')).toEqual([
      'book-changes.ts',
      'book-rules.ts',
      'book-view.ts',
      'book.aggregate.ts',
      'new-book.ts',
    ]);
  });
});
