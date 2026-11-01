import { PrismaBookCatalog } from '../../../src/contexts/catalog/infrastructure/persistence/prisma-book-catalog.js';
import { Prisma } from '../../../src/platform/prisma/generated/client.js';
import type { PrismaService } from '../../../src/platform/prisma/prisma.service.js';
import { NotFoundError } from '../../../src/shared-kernel/domain.errors.js';

interface Row {
  isbn: string;
  title: string;
  author: string;
  price: Prisma.Decimal;
  currency: 'PEN' | 'USD';
  active: boolean;
}

const row = (isbn: string, overrides: Partial<Row> = {}): Row => ({
  isbn,
  title: `Libro ${isbn}`,
  author: 'Autor',
  price: new Prisma.Decimal('45'),
  currency: 'PEN',
  active: true,
  ...overrides,
});

// Una "base" que solo cuenta cómo se le pregunta: la tarea 9.5 trata de cuántas consultas se hacen a la tabla de libros
function setup(rows: Row[]) {
  const findMany = vi.fn(({ where }: { where: { isbn: { in: string[] } } }) =>
    Promise.resolve(rows.filter((r) => where.isbn.in.includes(r.isbn))),
  );
  const findUnique = vi.fn();
  const prisma = { book: { findMany, findUnique } } as unknown as PrismaService;
  const handler = new PrismaBookCatalog(prisma);
  const ask = (...isbns: string[]) => handler.pricesOf(isbns);
  return { ask, findMany, findUnique };
}

const isbn = (n: number) => String(9780000000000 + n);

describe('PrismaBookCatalog.pricesOf', () => {
  it('devuelve cada libro con el precio como texto de 2 decimales y su moneda', async () => {
    const { ask } = setup([
      row('A', { price: new Prisma.Decimal('45'), title: 'Uno' }),
      row('B', { price: new Prisma.Decimal('15.5'), currency: 'USD' }),
    ]);

    expect(await ask('A', 'B')).toEqual([
      {
        isbn: 'A',
        title: 'Uno',
        author: 'Autor',
        price: { amount: '45.00', currency: 'PEN' },
      },
      {
        isbn: 'B',
        title: 'Libro B',
        author: 'Autor',
        price: { amount: '15.50', currency: 'USD' },
      },
    ]);
  });

  describe('una sola consulta a la tabla de libros', () => {
    it('para dos ISBN: un findMany y ningún findUnique', async () => {
      const { ask, findMany, findUnique } = setup([row('A'), row('B')]);

      await ask('A', 'B');

      expect(findMany).toHaveBeenCalledTimes(1);
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('para un carrito de 100 libros distintos: sigue siendo un findMany', async () => {
      const isbns = Array.from({ length: 100 }, (_, i) => isbn(i));
      const { ask, findMany } = setup(isbns.map((i) => row(i)));

      const result = await ask(...isbns);

      expect(result).toHaveLength(100);
      expect(findMany).toHaveBeenCalledTimes(1);
    });

    it('pregunta por los ISBN sin repetir', async () => {
      const { ask, findMany } = setup([row('A'), row('B')]);

      await ask('A', 'B', 'A');

      expect(findMany.mock.calls[0]?.[0]).toMatchObject({
        where: { isbn: { in: ['A', 'B'] } },
      });
    });

    it('con una lista vacía no consulta la base y devuelve []', async () => {
      const { ask, findMany } = setup([row('A')]);

      expect(await ask()).toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
    });
  });

  it('un libro repetido se devuelve una vez; el orden es el de la primera aparición', async () => {
    const { ask } = setup([row('A'), row('B'), row('C')]);

    const result = await ask('C', 'A', 'C', 'B', 'A');

    expect(result.map((b) => b.isbn)).toEqual(['C', 'A', 'B']);
  });

  describe('libros que no se pueden vender: NotFoundError', () => {
    it('un ISBN que no existe', async () => {
      const { ask } = setup([row('A')]);

      await expect(ask('A', 'Z')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('un libro inactivo es como si no existiera', async () => {
      const { ask } = setup([row('A'), row('B', { active: false })]);

      await expect(ask('A', 'B')).rejects.toMatchObject({
        message: expect.stringContaining('B') as unknown,
      });
    });

    it('si faltan varios, el error nombra el primero según el orden pedido (no el que la base devuelva antes)', async () => {
      const { ask } = setup([row('A'), row('D', { active: false })]);

      await expect(ask('A', 'Y', 'D', 'Z')).rejects.toMatchObject({
        message: expect.stringContaining('Y') as unknown,
      });
      await expect(ask('D', 'Y')).rejects.toMatchObject({
        message: expect.stringContaining('D') as unknown,
      });
    });
  });
});
