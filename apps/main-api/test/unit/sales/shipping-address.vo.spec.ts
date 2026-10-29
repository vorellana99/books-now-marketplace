import {
  SHIPPING_LIMITS,
  ShippingAddress,
} from '../../../src/contexts/sales/domain/order/shipping-address.vo.js';
import type { DomainError } from '../../../src/shared-kernel/domain.errors.js';
import { ADDRESS_DATA } from '../../fakes/fixtures.js';

const failure = (fn: () => unknown): DomainError | undefined => {
  try {
    fn();
  } catch (e) {
    return e as DomainError;
  }
};

const REQUIRED = [
  'recipient',
  'phone',
  'line1',
  'district',
  'province',
  'department',
] as const;

describe('ShippingAddress', () => {
  describe('create', () => {
    it('guarda los siete campos', () => {
      const address = ShippingAddress.create(ADDRESS_DATA);
      expect(address.toJSON()).toEqual(ADDRESS_DATA);
    });

    it('la referencia es opcional: sin ella queda en null', () => {
      const { reference: _omit, ...rest } = ADDRESS_DATA;
      expect(ShippingAddress.create(rest).reference).toBeNull();
      expect(
        ShippingAddress.create({ ...rest, reference: null }).reference,
      ).toBeNull();
    });

    it('una referencia vacía o de espacios queda en null', () => {
      expect(
        ShippingAddress.create({ ...ADDRESS_DATA, reference: '' }).reference,
      ).toBeNull();
      expect(
        ShippingAddress.create({ ...ADDRESS_DATA, reference: '   ' }).reference,
      ).toBeNull();
    });

    it('recorta los espacios de cada campo', () => {
      const address = ShippingAddress.create({
        recipient: '  Ana Pérez ',
        phone: ' 999888777 ',
        line1: ' Av. Larco 123 ',
        district: ' Miraflores ',
        province: ' Lima ',
        department: ' Lima ',
        reference: '  junto al parque  ',
      });
      expect(address.toJSON()).toEqual({
        recipient: 'Ana Pérez',
        phone: '999888777',
        line1: 'Av. Larco 123',
        district: 'Miraflores',
        province: 'Lima',
        department: 'Lima',
        reference: 'junto al parque',
      });
    });

    it.each(REQUIRED)(
      '%s es obligatorio: vacío, de espacios o ausente da INVALID_SHIPPING_ADDRESS y lo nombra',
      (field) => {
        for (const value of ['', '   ', undefined]) {
          const error = failure(() =>
            ShippingAddress.create({
              ...ADDRESS_DATA,
              [field]: value,
            } as never),
          );
          expect(error?.code).toBe('INVALID_SHIPPING_ADDRESS');
          expect(error?.message).toContain(field);
        }
      },
    );

    it.each(REQUIRED)(
      '%s no puede superar su largo máximo, pero sí alcanzarlo',
      (field) => {
        const max = SHIPPING_LIMITS[field];
        const ok = ShippingAddress.create({
          ...ADDRESS_DATA,
          [field]: field === 'phone' ? '9'.repeat(max) : 'x'.repeat(max),
        });
        expect(ok.toJSON()[field]).toHaveLength(max);

        const error = failure(() =>
          ShippingAddress.create({
            ...ADDRESS_DATA,
            [field]:
              field === 'phone' ? '9'.repeat(max + 1) : 'x'.repeat(max + 1),
          }),
        );
        expect(error?.code).toBe('INVALID_SHIPPING_ADDRESS');
        expect(error?.message).toContain(field);
      },
    );

    it('la referencia tiene su largo máximo', () => {
      const max = SHIPPING_LIMITS.reference;
      expect(
        ShippingAddress.create({ ...ADDRESS_DATA, reference: 'x'.repeat(max) })
          .reference,
      ).toHaveLength(max);
      const error = failure(() =>
        ShippingAddress.create({
          ...ADDRESS_DATA,
          reference: 'x'.repeat(max + 1),
        }),
      );
      expect(error?.message).toContain('reference');
    });

    it('el largo se mide después de recortar', () => {
      const padded = ` ${'x'.repeat(SHIPPING_LIMITS.recipient)} `;
      expect(
        ShippingAddress.create({ ...ADDRESS_DATA, recipient: padded })
          .recipient,
      ).toHaveLength(SHIPPING_LIMITS.recipient);
    });

    it.each([
      '999888777',
      '+51 999 888 777',
      '(01) 444-5555',
      '01-4445555',
      '+1 (202) 555-0123',
    ])('acepta el teléfono %s', (phone) => {
      expect(ShippingAddress.create({ ...ADDRESS_DATA, phone }).phone).toBe(
        phone,
      );
    });

    it.each([
      'abc',
      '12345',
      '99988877a',
      '999.888.777',
      '+++++++',
      '--------',
      '9998887; DROP',
    ])('rechaza el teléfono %s', (phone) => {
      const error = failure(() =>
        ShippingAddress.create({ ...ADDRESS_DATA, phone }),
      );
      expect(error?.code).toBe('INVALID_SHIPPING_ADDRESS');
      expect(error?.message).toContain('phone');
    });

    it('rechaza un campo que no es texto', () => {
      const error = failure(() =>
        ShippingAddress.create({ ...ADDRESS_DATA, district: 123 } as never),
      );
      expect(error?.code).toBe('INVALID_SHIPPING_ADDRESS');
    });

    it('rechaza caracteres de control (saltos de línea, tabuladores) en cualquier campo', () => {
      for (const field of [
        ...REQUIRED.filter((f) => f !== 'phone'),
        'reference',
      ] as const) {
        const error = failure(() =>
          ShippingAddress.create({
            ...ADDRESS_DATA,
            [field]: 'Av. Larco\nDpto 4',
          }),
        );
        expect(error?.code).toBe('INVALID_SHIPPING_ADDRESS');
        expect(error?.message).toContain(field);
      }
    });

    it.each([
      ['un tabulador', '\t'],
      ['el carácter nulo', '\u0000'],
      ['el último carácter de control (31)', '\u001f'],
      ['DEL (127)', '\u007f'],
    ])('rechaza %s en medio de un campo', (_name, char) => {
      const error = failure(() =>
        ShippingAddress.create({
          ...ADDRESS_DATA,
          line1: `Av. Larco${char}123`,
        }),
      );
      expect(error?.code).toBe('INVALID_SHIPPING_ADDRESS');
    });

    it('el espacio (32) sí es válido dentro de un campo', () => {
      expect(
        ShippingAddress.create({ ...ADDRESS_DATA, line1: 'Av. Larco 123' })
          .line1,
      ).toBe('Av. Larco 123');
    });

    it('acepta acentos, ñ y signos habituales de una dirección', () => {
      const address = ShippingAddress.create({
        ...ADDRESS_DATA,
        recipient: "María Ñuñez O'Brien",
        line1: 'Jr. Ucayali Nº 150 - 2º piso, Mz. A Lt. 5',
      });
      expect(address.recipient).toBe("María Ñuñez O'Brien");
    });
  });

  describe('restore: leer lo que ya está en la base', () => {
    it('no valida: una dirección guardada antes de una regla nueva sigue pudiendo leerse', () => {
      const address = ShippingAddress.restore({
        ...ADDRESS_DATA,
        phone: 'tel. 1234',
        recipient: ' sin recortar ',
      });
      expect(address.phone).toBe('tel. 1234');
      expect(address.recipient).toBe(' sin recortar ');
    });

    it('una referencia ausente queda en null', () => {
      const { reference: _omit, ...rest } = ADDRESS_DATA;
      expect(ShippingAddress.restore(rest).reference).toBeNull();
    });
  });

  describe('equals y toJSON', () => {
    it('dos direcciones con los mismos datos son iguales', () => {
      expect(
        ShippingAddress.create(ADDRESS_DATA).equals(
          ShippingAddress.create(ADDRESS_DATA),
        ),
      ).toBe(true);
    });

    it.each([...REQUIRED, 'reference'] as const)(
      'cambiar %s las hace distintas',
      (field) => {
        const other = ShippingAddress.create({
          ...ADDRESS_DATA,
          [field]: field === 'phone' ? '999000111' : 'Otro',
        });
        expect(ShippingAddress.create(ADDRESS_DATA).equals(other)).toBe(false);
      },
    );

    it('una sin referencia y otra con ella son distintas', () => {
      const { reference: _omit, ...rest } = ADDRESS_DATA;
      expect(
        ShippingAddress.create(rest).equals(
          ShippingAddress.create(ADDRESS_DATA),
        ),
      ).toBe(false);
    });

    it('JSON.stringify da los siete campos, con la referencia en null si falta', () => {
      const { reference: _omit, ...rest } = ADDRESS_DATA;
      expect(JSON.parse(JSON.stringify(ShippingAddress.create(rest)))).toEqual({
        ...rest,
        reference: null,
      });
    });
  });
});
