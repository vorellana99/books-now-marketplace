import type { INestApplication } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  SearchBooksQuery,
  type BookPage,
} from '../../src/contexts/catalog/application/use-cases/book/search-books.query.js';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { insertBook } from '../support/builders.js';
import { resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

describe('SearchBooksHandler (PostgreSQL real, por el QueryBus)', () => {
  let app: INestApplication;
  let queryBus: QueryBus;

  beforeAll(async () => {
    app = await createTestApp(CatalogModule);
    queryBus = app.get(QueryBus);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  const search = (q?: string, page = 1, pageSize = 20): Promise<BookPage> =>
    queryBus.execute(new SearchBooksQuery(q, page, pageSize));
  const titles = (result: BookPage) => result.items.map((b) => b.title);

  describe('qué libros devuelve', () => {
    it('sin texto, todos los activos', async () => {
      await insertBook({ title: 'Alfa' });
      await insertBook({ title: 'Beta' });
      expect(titles(await search())).toEqual(['Alfa', 'Beta']);
    });

    it('nunca un libro desactivado, con o sin texto', async () => {
      await insertBook({ title: 'Clean Code' });
      await insertBook({ title: 'Clean Architecture', active: false });

      const all = await search();
      const clean = await search('clean');

      expect(titles(all)).toEqual(['Clean Code']);
      expect(titles(clean)).toEqual(['Clean Code']);
      expect(clean.total).toBe(1);
    });

    it('busca en el título sin distinguir mayúsculas', async () => {
      await insertBook({ title: 'Clean Code', author: 'Robert Martin' });
      await insertBook({ title: 'Refactoring', author: 'Martin Fowler' });

      expect(titles(await search('CLEAN'))).toEqual(['Clean Code']);
      expect(titles(await search('clean c'))).toEqual(['Clean Code']);
    });

    it('busca en el autor sin distinguir mayúsculas', async () => {
      await insertBook({ title: 'Clean Code', author: 'Robert Martin' });
      await insertBook({ title: 'Refactoring', author: 'Martin Fowler' });
      await insertBook({ title: 'Otro', author: 'Alguien' });

      expect(titles(await search('martin'))).toEqual([
        'Clean Code',
        'Refactoring',
      ]);
      expect(titles(await search('FOWLER'))).toEqual(['Refactoring']);
    });

    it('un libro que coincide por título y por autor sale una sola vez', async () => {
      await insertBook({ title: 'Martin', author: 'Martin' });
      const result = await search('martin');
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('un texto vacío o de espacios no filtra', async () => {
      await insertBook({ title: 'Alfa' });
      await insertBook({ title: 'Beta' });
      expect(await search('')).toMatchObject({ total: 2 });
      expect(await search('   ')).toMatchObject({ total: 2 });
    });

    it('sin coincidencias, una lista vacía y total 0', async () => {
      await insertBook({ title: 'Alfa' });
      expect(await search('zzz')).toEqual({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      });
    });

    it('no ignora los acentos: "programacion" no encuentra "Programación" (decisión D3, hasta que el catálogo crezca)', async () => {
      await insertBook({ title: 'Programación en Go' });
      expect(await search('programacion')).toMatchObject({ total: 0 });
      expect(await search('programación')).toMatchObject({ total: 1 });
    });
  });

  describe('los caracteres especiales son texto, no comodines', () => {
    beforeEach(async () => {
      await insertBook({ title: 'Java al 100% real' });
      await insertBook({ title: 'Java' });
      await insertBook({ title: 'snake_case en Python' });
      await insertBook({ title: 'snakeXcase' });
      await insertBook({ title: 'Ruta C:\\datos' });
    });

    it('"%" solo encuentra el libro que lo contiene', async () => {
      expect(titles(await search('%'))).toEqual(['Java al 100% real']);
    });

    it('"_" solo encuentra el libro que lo contiene', async () => {
      expect(titles(await search('_'))).toEqual(['snake_case en Python']);
      expect(titles(await search('snake_case'))).toEqual([
        'snake_case en Python',
      ]);
    });

    it('una barra invertida es una barra invertida', async () => {
      expect(titles(await search('\\'))).toEqual(['Ruta C:\\datos']);
    });

    it('las comillas no rompen la consulta', async () => {
      expect(await search(`'; DROP TABLE catalog.books; --`)).toMatchObject({
        total: 0,
      });
      expect((await search()).total).toBe(5);
    });
  });

  describe('orden y páginas', () => {
    it('ordena por título y, con el mismo título, por ISBN', async () => {
      const b = await insertBook({ title: 'Mismo', isbn: '9780306406157' });
      const a = await insertBook({ title: 'Mismo', isbn: '9780132350884' });
      await insertBook({ title: 'Anterior' });

      const result = await search();

      expect(titles(result)).toEqual(['Anterior', 'Mismo', 'Mismo']);
      expect(result.items.slice(1).map((x) => x.isbn)).toEqual([
        a.isbn,
        b.isbn,
      ]);
    });

    // Con títulos repetidos, ordenar solo por título puede repetir un libro en dos páginas u omitirlo
    it('con títulos repetidos, las páginas juntas son todos los libros, sin repetir ni omitir', async () => {
      const inserted = await Promise.all(
        ['Uno', 'Dos', 'Dos', 'Dos', 'Tres', 'Tres', 'Cuatro'].map((title) =>
          insertBook({ title }),
        ),
      );

      const seen: string[] = [];
      for (let page = 1; page <= 4; page++) {
        const result = await search(undefined, page, 2);
        expect(result.total).toBe(7);
        seen.push(...result.items.map((b) => b.isbn));
      }

      expect(seen).toHaveLength(7);
      expect(new Set(seen).size).toBe(7);
      expect([...seen].sort((x, y) => x.localeCompare(y))).toEqual(
        inserted.map((b) => b.isbn).sort((x, y) => x.localeCompare(y)),
      );
    });

    it('devuelve la página pedida, su tamaño y el total de toda la búsqueda', async () => {
      for (const t of ['A1', 'A2', 'A3', 'A4', 'A5']) {
        await insertBook({ title: t });
      }

      const second = await search(undefined, 2, 2);

      expect(titles(second)).toEqual(['A3', 'A4']);
      expect(second).toMatchObject({ page: 2, pageSize: 2, total: 5 });
    });

    it('la última página puede traer menos, y una página pasada del final viene vacía', async () => {
      for (const t of ['A1', 'A2', 'A3']) await insertBook({ title: t });

      expect(titles(await search(undefined, 2, 2))).toEqual(['A3']);
      const beyond = await search(undefined, 5, 2);
      expect(beyond.items).toEqual([]);
      expect(beyond.total).toBe(3);
    });

    it('el total cuenta solo lo que coincide, no todo el catálogo', async () => {
      await insertBook({ title: 'Java 1' });
      await insertBook({ title: 'Java 2' });
      await insertBook({ title: 'Otro' });
      expect((await search('java', 1, 1)).total).toBe(2);
    });
  });

  describe('la forma de cada libro', () => {
    it('isbn, título, autor y precio como { amount, currency }', async () => {
      const book = await insertBook({
        title: 'Clean Code',
        author: 'Robert C. Martin',
        price: '45.5',
      });

      const [item] = (await search()).items;

      expect(item).toEqual({
        isbn: book.isbn,
        title: 'Clean Code',
        author: 'Robert C. Martin',
        price: { amount: '45.50', currency: 'PEN' },
      });
    });

    it('un libro en dólares se muestra en dólares', async () => {
      await insertBook({ price: '15.00', currency: 'USD' });
      expect((await search()).items[0].price).toEqual({
        amount: '15.00',
        currency: 'USD',
      });
    });
  });
});
