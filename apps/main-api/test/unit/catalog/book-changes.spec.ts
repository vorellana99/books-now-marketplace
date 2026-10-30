import { BookChanges } from '../../../src/contexts/catalog/domain/model/book/book-changes.js';
import type { DomainError } from '../../../src/shared-kernel/domain.errors.js';

const failure = (fn: () => unknown): DomainError | undefined => {
  try {
    fn();
  } catch (e) {
    return e as DomainError;
  }
};
const create = (changes: Record<string, unknown>) =>
  BookChanges.create(changes as never);

describe('BookChanges.create: validar los cambios de un libro', () => {
  describe('qué se puede cambiar', () => {
    it('solo el título', () => {
      expect(create({ title: ' Código limpio ' })).toEqual({
        title: 'Código limpio',
      });
    });

    it('solo el autor', () => {
      expect(create({ author: ' R. Martin ' })).toEqual({
        author: 'R. Martin',
      });
    });

    it('solo el precio, a 2 decimales', () => {
      expect(create({ price: { amount: '49.9' } })).toEqual({
        price: { amount: '49.90', currency: undefined },
      });
    });

    it('solo desactivar, o solo reactivar', () => {
      expect(create({ active: false })).toEqual({ active: false });
      expect(create({ active: true })).toEqual({ active: true });
    });

    it('varios a la vez', () => {
      expect(
        create({
          title: 'Nuevo',
          author: 'Otro',
          price: { amount: '10', currency: 'USD' },
          active: false,
        }),
      ).toEqual({
        title: 'Nuevo',
        author: 'Otro',
        price: { amount: '10.00', currency: 'USD' },
        active: false,
      });
    });

    it('lo que no se indica no aparece en el resultado', () => {
      const changes = create({ title: 'Nuevo' });
      expect(Object.keys(changes)).toEqual(['title']);
    });
  });

  describe('sin cambios', () => {
    it.each([
      [{}],
      [{ title: undefined }],
      [
        {
          title: undefined,
          author: undefined,
          price: undefined,
          active: undefined,
        },
      ],
    ])('el cuerpo %j no cambia nada: NOTHING_TO_UPDATE', (changes) => {
      expect(failure(() => create(changes))?.code).toBe('NOTHING_TO_UPDATE');
    });
  });

  describe('título y autor', () => {
    it.each(['title', 'author'] as const)(
      '%s vacío, de espacios o null: INVALID_BOOK y lo nombra',
      (field) => {
        for (const value of ['', '   ', null, 42]) {
          const error = failure(() => create({ [field]: value }));
          expect(error?.code).toBe('INVALID_BOOK');
          expect(error?.message).toContain(field);
        }
      },
    );

    it.each([
      ['title', 200],
      ['author', 150],
    ] as const)('%s admite hasta %i caracteres y no uno más', (field, max) => {
      expect(create({ [field]: 'x'.repeat(max) })[field]).toHaveLength(max);
      expect(
        failure(() => create({ [field]: 'x'.repeat(max + 1) }))?.code,
      ).toBe('INVALID_BOOK');
    });

    it.each(['title', 'author'] as const)(
      '%s no admite caracteres de control',
      (field) => {
        expect(failure(() => create({ [field]: 'Uno\nDos' }))?.code).toBe(
          'INVALID_BOOK',
        );
      },
    );
  });

  describe('precio', () => {
    it.each(['0', '0.00', '1000000.01', '-1', '1,5', '1.234', '', 'abc'])(
      'el monto %j se rechaza: INVALID_PRICE',
      (amount) => {
        expect(failure(() => create({ price: { amount } }))?.code).toBe(
          'INVALID_PRICE',
        );
      },
    );

    it.each([[null], [0], [''], [false]])(
      'un precio %j (vacío o falso) no cuenta como "sin cambio": INVALID_PRICE',
      (price) => {
        expect(failure(() => create({ price }))?.code).toBe('INVALID_PRICE');
      },
    );

    it('un monto que no es texto se rechaza', () => {
      expect(failure(() => create({ price: { amount: 49.9 } }))?.code).toBe(
        'INVALID_PRICE',
      );
    });

    it('un precio sin monto se rechaza', () => {
      expect(failure(() => create({ price: {} }))?.code).toBe('INVALID_PRICE');
    });

    it('la moneda, si viene, tiene que ser PEN o USD', () => {
      expect(
        create({ price: { amount: '10', currency: 'PEN' } }).price?.currency,
      ).toBe('PEN');
      expect(
        failure(() => create({ price: { amount: '10', currency: 'EUR' } }))
          ?.code,
      ).toBe('INVALID_CURRENCY');
    });

    it('la moneda es opcional: sin ella, el precio no dice en qué moneda está', () => {
      expect(
        create({ price: { amount: '10' } }).price?.currency,
      ).toBeUndefined();
    });
  });

  describe('active', () => {
    it.each([['true'], [1], [0], [null], ['false']])(
      '%j no es un booleano: INVALID_BOOK',
      (value) => {
        const error = failure(() => create({ active: value }));
        expect(error?.code).toBe('INVALID_BOOK');
        expect(error?.message).toContain('active');
      },
    );
  });

  it('un cambio inválido junto a uno válido rechaza todo', () => {
    expect(
      failure(() => create({ title: 'Bien', price: { amount: '0' } }))?.code,
    ).toBe('INVALID_PRICE');
  });
});
