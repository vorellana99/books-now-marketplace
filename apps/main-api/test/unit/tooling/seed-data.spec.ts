import { Email } from '../../../src/contexts/sales/domain/model/customer/email.vo.js';
import { Isbn } from '../../../src/shared-kernel/isbn.vo.js';
import { BOOKS, CUSTOMERS, STOCK } from '../../../prisma/seed-data.js';

const isbnsWithStockRecord = new Set(STOCK.map((s) => s.isbn));

describe('datos de ejemplo del seed', () => {
  describe('libros', () => {
    it('todos los ISBN son válidos y están normalizados', () => {
      for (const book of BOOKS) {
        expect(Isbn.create(book.isbn).value, book.title).toBe(book.isbn);
      }
    });

    it('no repite ISBN', () => {
      expect(new Set(BOOKS.map((b) => b.isbn)).size).toBe(BOOKS.length);
    });

    it('los precios son positivos y con a lo sumo 2 decimales, como exige la tabla', () => {
      for (const book of BOOKS) {
        expect(book.price, book.title).toMatch(
          /^[1-9]\d*(\.\d{1,2})?$|^0\.(?!0+$)\d{1,2}$/,
        );
      }
    });

    it('las monedas son PEN o USD', () => {
      for (const book of BOOKS) expect(['PEN', 'USD']).toContain(book.currency);
    });

    it('cubre los casos para probar la API: PEN, USD, inactivo y sin registro de stock', () => {
      const active = BOOKS.filter((b) => b.active);
      expect(
        active.filter((b) => b.currency === 'PEN').length,
      ).toBeGreaterThanOrEqual(2);
      expect(
        active.filter((b) => b.currency === 'USD').length,
      ).toBeGreaterThanOrEqual(1);
      expect(BOOKS.some((b) => !b.active)).toBe(true);
      expect(BOOKS.some((b) => !isbnsWithStockRecord.has(b.isbn))).toBe(true);
    });
  });

  describe('stock', () => {
    it('cada registro pertenece a un libro del catálogo, sin repetirse', () => {
      const isbns = new Set(BOOKS.map((b) => b.isbn));
      for (const item of STOCK) expect(isbns.has(item.isbn)).toBe(true);
      expect(isbnsWithStockRecord.size).toBe(STOCK.length);
    });

    it('las cantidades son enteros no negativos y nada nace reservado', () => {
      for (const item of STOCK) {
        expect(Number.isInteger(item.available)).toBe(true);
        expect(item.available).toBeGreaterThanOrEqual(0);
        expect(item.reserved).toBe(0);
      }
    });

    it('hay un libro activo agotado (stock en cero) y otros con unidades en PEN y en USD', () => {
      const byIsbn = new Map(BOOKS.map((b) => [b.isbn, b]));
      const available = (currency: string) =>
        STOCK.filter(
          (s) =>
            byIsbn.get(s.isbn)?.currency === currency &&
            byIsbn.get(s.isbn)?.active &&
            s.available > 0,
        );
      expect(
        STOCK.some((s) => s.available === 0 && byIsbn.get(s.isbn)?.active),
      ).toBe(true);
      expect(available('PEN').length).toBeGreaterThanOrEqual(2);
      expect(available('USD').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('clientes', () => {
    it('hay un cliente normal y uno premium, con correos válidos y ids distintos', () => {
      expect(CUSTOMERS.some((c) => c.premium)).toBe(true);
      expect(CUSTOMERS.some((c) => !c.premium)).toBe(true);
      for (const c of CUSTOMERS)
        expect(Email.create(c.email).value).toBe(c.email);
      expect(new Set(CUSTOMERS.map((c) => c.id)).size).toBe(CUSTOMERS.length);
      expect(new Set(CUSTOMERS.map((c) => c.email)).size).toBe(
        CUSTOMERS.length,
      );
    });

    it('los ids son UUID, para poder usarlos como customerId', () => {
      for (const c of CUSTOMERS)
        expect(c.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
    });
  });
});
