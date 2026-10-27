import { DomainError } from '../../src/shared-kernel/domain.errors.js';
import { Isbn } from '../../src/shared-kernel/isbn.vo.js';

describe('Isbn', () => {
  it('acepta un ISBN-13 válido', () => {
    expect(Isbn.create('9780306406157').value).toBe('9780306406157');
  });

  it('ignora guiones y espacios', () => {
    expect(Isbn.create('978-0-306-40615-7').value).toBe('9780306406157');
    expect(Isbn.create(' 978 0306406157 ').value).toBe('9780306406157');
  });

  it('acepta un dígito de control 0', () => {
    expect(Isbn.create('9780306406140').value).toBe('9780306406140');
  });

  it.each([
    ['vacío', ''],
    ['muy corto', '978030640615'],
    ['muy largo', '97803064061570'],
    ['con letras', '97803064061X7'],
    ['dígito de control incorrecto', '9780306406158'],
  ])('rechaza un ISBN %s', (_caso, valor) => {
    expect(() => Isbn.create(valor)).toThrow(DomainError);
    expect(() => Isbn.create(valor)).toThrow(/ISBN/);
  });

  it('usa el código INVALID_ISBN', () => {
    try {
      Isbn.create('123');
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe('INVALID_ISBN');
    }
  });

  it('compara por valor', () => {
    expect(
      Isbn.create('9780306406157').equals(Isbn.create('978-0-306-40615-7')),
    ).toBe(true);
    expect(
      Isbn.create('9780306406157').equals(Isbn.create('9780306406140')),
    ).toBe(false);
  });

  it('se serializa como texto', () => {
    expect(JSON.stringify({ isbn: Isbn.create('9780306406157') })).toBe(
      '{"isbn":"9780306406157"}',
    );
    expect(String(Isbn.create('9780306406157'))).toBe('9780306406157');
  });
});
