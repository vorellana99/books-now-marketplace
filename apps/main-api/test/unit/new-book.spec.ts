import { NewBook } from '../../src/contexts/catalog/domain/book/new-book.js';
import type { DomainError } from '../../src/shared-kernel/domain.errors.js';

const VALID = {
  isbn: '9780132350884',
  title: 'Clean Code',
  author: 'Robert C. Martin',
  price: { amount: '45.00', currency: 'PEN' },
} as const;

const failure = (fn: () => unknown): DomainError | undefined => {
  try {
    fn();
  } catch (e) {
    return e as DomainError;
  }
};
const create = (overrides: Record<string, unknown> = {}) =>
  NewBook.create({ ...VALID, ...overrides } as never);

describe('NewBook.create: validar un libro antes de darlo de alta', () => {
  it('un libro válido queda normalizado', () => {
    expect(create()).toEqual(VALID);
  });

  describe('ISBN', () => {
    it('acepta guiones y devuelve el ISBN normalizado', () => {
      expect(create({ isbn: '978-0-13-235088-4' }).isbn).toBe('9780132350884');
    });

    it.each(['123', 'abcdefghijklm', '9780132350885', ''])(
      'rechaza %j con INVALID_ISBN',
      (isbn) => {
        expect(failure(() => create({ isbn }))?.code).toBe('INVALID_ISBN');
      },
    );
  });

  describe('título y autor', () => {
    it.each(['title', 'author'] as const)('%s se recorta', (field) => {
      expect(create({ [field]: '  Texto  ' })[field]).toBe('Texto');
    });

    it.each(['title', 'author'] as const)(
      '%s vacío, de espacios o ausente da INVALID_BOOK y lo nombra',
      (field) => {
        for (const value of ['', '   ', undefined, null]) {
          const error = failure(() => create({ [field]: value }));
          expect(error?.code).toBe('INVALID_BOOK');
          expect(error?.message).toContain(field);
        }
      },
    );

    it.each(['title', 'author'] as const)(
      '%s no es texto: INVALID_BOOK',
      (field) => {
        expect(failure(() => create({ [field]: 42 }))?.code).toBe(
          'INVALID_BOOK',
        );
      },
    );

    it.each([
      ['title', 200],
      ['author', 150],
    ] as const)('%s admite hasta %i caracteres y no uno más', (field, max) => {
      expect(create({ [field]: 'x'.repeat(max) })[field]).toHaveLength(max);
      const error = failure(() => create({ [field]: 'x'.repeat(max + 1) }));
      expect(error?.code).toBe('INVALID_BOOK');
      expect(error?.message).toContain(field);
    });

    it('el largo se mide después de recortar', () => {
      expect(create({ title: ` ${'x'.repeat(200)} ` }).title).toHaveLength(200);
    });

    it.each(['title', 'author'] as const)(
      '%s no admite saltos de línea ni caracteres de control',
      (field) => {
        for (const char of ['\n', '\t', '\u0000', '\u001f', '\u007f']) {
          expect(
            failure(() => create({ [field]: `Uno${char}Dos` }))?.code,
          ).toBe('INVALID_BOOK');
        }
      },
    );

    it('acepta acentos, ñ y signos habituales', () => {
      expect(
        create({
          title: '¿Qué es el amor? — Diseño & arquitectura (2.ª ed.)',
          author: "Ñandú O'Brien",
        }).author,
      ).toBe("Ñandú O'Brien");
    });
  });

  describe('precio', () => {
    it.each([
      ['45', '45.00'],
      ['45.5', '45.50'],
      ['45.50', '45.50'],
      ['0.01', '0.01'],
      ['045.10', '45.10'],
      ['1000000', '1000000.00'],
      ['999999.99', '999999.99'],
    ])('%s se guarda como %s', (amount, expected) => {
      expect(create({ price: { amount, currency: 'PEN' } }).price.amount).toBe(
        expected,
      );
    });

    it.each(['0', '0.00', '0.0'])(
      'el precio %s no es mayor que cero: INVALID_PRICE',
      (amount) => {
        expect(
          failure(() => create({ price: { amount, currency: 'PEN' } }))?.code,
        ).toBe('INVALID_PRICE');
      },
    );

    it.each(['1000000.01', '1000001', '99999999'])(
      'el precio %s supera el máximo: INVALID_PRICE',
      (amount) => {
        expect(
          failure(() => create({ price: { amount, currency: 'PEN' } }))?.code,
        ).toBe('INVALID_PRICE');
      },
    );

    it.each([
      '',
      ' ',
      'abc',
      '-5',
      '+5',
      '1,5',
      '1.234',
      '1e3',
      '.5',
      '5.',
      '0x10',
      'NaN',
      'Infinity',
    ])('el formato %j no es un precio: INVALID_PRICE', (amount) => {
      expect(
        failure(() => create({ price: { amount, currency: 'PEN' } }))?.code,
      ).toBe('INVALID_PRICE');
    });

    it('un precio que no es texto (un número) se rechaza: el monto viaja como texto', () => {
      expect(
        failure(() => create({ price: { amount: 45, currency: 'PEN' } }))?.code,
      ).toBe('INVALID_PRICE');
    });

    it('un precio ausente se rechaza', () => {
      expect(failure(() => create({ price: undefined }))?.code).toBe(
        'INVALID_PRICE',
      );
    });

    it.each(['PEN', 'USD'])('acepta la moneda %s', (currency) => {
      expect(
        create({ price: { amount: '10.00', currency } }).price.currency,
      ).toBe(currency);
    });

    it.each(['EUR', 'pen', '', 'S/'])(
      'rechaza la moneda %j: INVALID_CURRENCY',
      (currency) => {
        expect(
          failure(() => create({ price: { amount: '10.00', currency } }))?.code,
        ).toBe('INVALID_CURRENCY');
      },
    );
  });
});
