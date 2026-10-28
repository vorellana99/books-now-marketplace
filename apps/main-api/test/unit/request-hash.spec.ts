import { ShippingAddress } from '../../src/contexts/sales/domain/order/shipping-address.vo.js';
import { hashRequest } from '../../src/contexts/sales/application/order/request-hash.js';
import { ADDRESS, ADDRESS_DATA } from '../fakes/fixtures.js';

const A = '9780306406157';
const B = '9780306406140';

describe('hashRequest: la huella del carrito para detectar la misma clave con otro carrito', () => {
  it('es un SHA-256 en hexadecimal y siempre el mismo para la misma entrada', () => {
    const hash = hashRequest('c-1', [{ isbn: A, quantity: 1 }], ADDRESS);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRequest('c-1', [{ isbn: A, quantity: 1 }], ADDRESS)).toBe(hash);
  });

  it('no depende del orden de las líneas', () => {
    const one = hashRequest(
      'c-1',
      [
        { isbn: A, quantity: 1 },
        { isbn: B, quantity: 2 },
      ],
      ADDRESS,
    );
    const other = hashRequest(
      'c-1',
      [
        { isbn: B, quantity: 2 },
        { isbn: A, quantity: 1 },
      ],
      ADDRESS,
    );
    expect(other).toBe(one);
  });

  it('fusiona las líneas repetidas: {A:1, A:2} y {A:2, A:1} dan lo mismo que {A:3}', () => {
    const merged = hashRequest('c-1', [{ isbn: A, quantity: 3 }], ADDRESS);

    expect(
      hashRequest(
        'c-1',
        [
          { isbn: A, quantity: 1 },
          { isbn: A, quantity: 2 },
        ],
        ADDRESS,
      ),
    ).toBe(merged);
    expect(
      hashRequest(
        'c-1',
        [
          { isbn: A, quantity: 2 },
          { isbn: A, quantity: 1 },
        ],
        ADDRESS,
      ),
    ).toBe(merged);
  });

  it.each([
    ['otro cliente', hashRequest('c-2', [{ isbn: A, quantity: 1 }], ADDRESS)],
    ['otra cantidad', hashRequest('c-1', [{ isbn: A, quantity: 2 }], ADDRESS)],
    ['otro libro', hashRequest('c-1', [{ isbn: B, quantity: 1 }], ADDRESS)],
    [
      'un libro más',
      hashRequest(
        'c-1',
        [
          { isbn: A, quantity: 1 },
          { isbn: B, quantity: 1 },
        ],
        ADDRESS,
      ),
    ],
    ['un carrito vacío', hashRequest('c-1', [], ADDRESS)],
  ])('cambia con %s', (_caso, other) => {
    expect(other).not.toBe(
      hashRequest('c-1', [{ isbn: A, quantity: 1 }], ADDRESS),
    );
  });

  it('no confunde cantidades con libros: A×12 no es A×1 más otra cosa', () => {
    expect(hashRequest('c-1', [{ isbn: A, quantity: 12 }], ADDRESS)).not.toBe(
      hashRequest(
        'c-1',
        [
          { isbn: A, quantity: 1 },
          { isbn: '2', quantity: 2 },
        ],
        ADDRESS,
      ),
    );
  });

  it('ordena por comparación de texto simple, sin depender del idioma del sistema', () => {
    // con localeCompare, algunos idiomas ordenan dígitos y letras de otra forma; aquí el orden es fijo
    const lines = [
      { isbn: 'b', quantity: 1 },
      { isbn: 'A', quantity: 1 },
      { isbn: 'a', quantity: 1 },
    ];
    const reversed = [...lines].reverse();
    expect(hashRequest('c-1', lines, ADDRESS)).toBe(
      hashRequest('c-1', reversed, ADDRESS),
    );
  });
});

describe('hashRequest: la dirección de envío forma parte de la huella', () => {
  const items = [{ isbn: A, quantity: 1 }];
  const withAddress = (overrides: Record<string, unknown>) =>
    ShippingAddress.create({ ...ADDRESS_DATA, ...overrides } as never);

  it('la misma dirección da el mismo hash', () => {
    expect(hashRequest('c-1', items, withAddress({}))).toBe(
      hashRequest('c-1', items, ADDRESS),
    );
  });

  it.each([
    ['recipient', 'Otra persona'],
    ['phone', '999000111'],
    ['line1', 'Otra calle 456'],
    ['district', 'Barranco'],
    ['province', 'Callao'],
    ['department', 'Cusco'],
    ['reference', 'Junto al banco'],
  ])('cambia si cambia %s', (field, value) => {
    expect(hashRequest('c-1', items, withAddress({ [field]: value }))).not.toBe(
      hashRequest('c-1', items, ADDRESS),
    );
  });

  it('los espacios sobrantes no la cambian: se normaliza antes', () => {
    const padded = withAddress({
      recipient: `  ${ADDRESS_DATA.recipient}  `,
      line1: ` ${ADDRESS_DATA.line1} `,
    });
    expect(hashRequest('c-1', items, padded)).toBe(
      hashRequest('c-1', items, ADDRESS),
    );
  });

  it('una referencia vacía es lo mismo que no tener referencia', () => {
    expect(hashRequest('c-1', items, withAddress({ reference: '' }))).toBe(
      hashRequest('c-1', items, withAddress({ reference: undefined })),
    );
    expect(hashRequest('c-1', items, withAddress({ reference: '  ' }))).toBe(
      hashRequest('c-1', items, withAddress({ reference: null })),
    );
  });

  it('una referencia distinta de ninguna sí cambia el hash', () => {
    expect(hashRequest('c-1', items, withAddress({ reference: 'x' }))).not.toBe(
      hashRequest('c-1', items, withAddress({ reference: null })),
    );
  });

  it('un texto que contiene el separador no se confunde con otro reparto de campos', () => {
    const one = withAddress({ district: 'Lima|Cercado', province: 'Lima' });
    const other = withAddress({ district: 'Lima', province: 'Cercado|Lima' });
    expect(hashRequest('c-1', items, one)).not.toBe(
      hashRequest('c-1', items, other),
    );
  });

  it('la dirección no se mezcla con el cliente ni con el carrito', () => {
    const a = withAddress({ recipient: 'c-2' });
    expect(hashRequest('c-1', items, a)).not.toBe(
      hashRequest('c-2', items, ADDRESS),
    );
  });

  it('sigue siendo un SHA-256 en hexadecimal', () => {
    expect(hashRequest('c-1', items, ADDRESS)).toMatch(/^[0-9a-f]{64}$/);
  });
});
