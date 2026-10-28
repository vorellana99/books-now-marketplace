import { hashRequest } from '../../src/contexts/sales/application/order/request-hash.js';

const A = '9780306406157';
const B = '9780306406140';

describe('hashRequest: la huella del carrito para detectar la misma clave con otro carrito', () => {
  it('es un SHA-256 en hexadecimal y siempre el mismo para la misma entrada', () => {
    const hash = hashRequest('c-1', [{ isbn: A, quantity: 1 }]);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRequest('c-1', [{ isbn: A, quantity: 1 }])).toBe(hash);
  });

  it('no depende del orden de las líneas', () => {
    const one = hashRequest('c-1', [
      { isbn: A, quantity: 1 },
      { isbn: B, quantity: 2 },
    ]);
    const other = hashRequest('c-1', [
      { isbn: B, quantity: 2 },
      { isbn: A, quantity: 1 },
    ]);
    expect(other).toBe(one);
  });

  it('fusiona las líneas repetidas: {A:1, A:2} y {A:2, A:1} dan lo mismo que {A:3}', () => {
    const merged = hashRequest('c-1', [{ isbn: A, quantity: 3 }]);

    expect(
      hashRequest('c-1', [
        { isbn: A, quantity: 1 },
        { isbn: A, quantity: 2 },
      ]),
    ).toBe(merged);
    expect(
      hashRequest('c-1', [
        { isbn: A, quantity: 2 },
        { isbn: A, quantity: 1 },
      ]),
    ).toBe(merged);
  });

  it.each([
    ['otro cliente', hashRequest('c-2', [{ isbn: A, quantity: 1 }])],
    ['otra cantidad', hashRequest('c-1', [{ isbn: A, quantity: 2 }])],
    ['otro libro', hashRequest('c-1', [{ isbn: B, quantity: 1 }])],
    [
      'un libro más',
      hashRequest('c-1', [
        { isbn: A, quantity: 1 },
        { isbn: B, quantity: 1 },
      ]),
    ],
    ['un carrito vacío', hashRequest('c-1', [])],
  ])('cambia con %s', (_caso, other) => {
    expect(other).not.toBe(hashRequest('c-1', [{ isbn: A, quantity: 1 }]));
  });

  it('no confunde cantidades con libros: A×12 no es A×1 más otra cosa', () => {
    expect(hashRequest('c-1', [{ isbn: A, quantity: 12 }])).not.toBe(
      hashRequest('c-1', [
        { isbn: A, quantity: 1 },
        { isbn: '2', quantity: 2 },
      ]),
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
    expect(hashRequest('c-1', lines)).toBe(hashRequest('c-1', reversed));
  });
});
