import { Email } from '../../../src/contexts/sales/domain/model/customer/email.vo.js';
import { DomainError } from '../../../src/shared-kernel/domain.errors.js';

describe('Email', () => {
  it('acepta un correo válido', () => {
    expect(Email.create('ana@example.com').value).toBe('ana@example.com');
  });

  it('acepta subdominios, signos + y puntos en la parte local', () => {
    expect(Email.create('ana.perez+libros@mail.example.co.uk').value).toBe(
      'ana.perez+libros@mail.example.co.uk',
    );
  });

  it('quita espacios y pasa a minúsculas', () => {
    expect(Email.create('  Ana@Example.COM ').value).toBe('ana@example.com');
  });

  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
    ['sin arroba', 'ana.example.com'],
    ['sin dominio', 'ana@'],
    ['sin parte local', '@example.com'],
    ['dominio sin punto', 'ana@example'],
    ['dos arrobas', 'ana@@example.com'],
    ['espacio en medio', 'ana perez@example.com'],
    ['puntos seguidos en el dominio', 'ana@example..com'],
    ['dominio que termina en punto', 'ana@example.com.'],
    ['demasiado largo', `${'a'.repeat(250)}@example.com`],
  ])('rechaza un correo %s', (_caso, valor) => {
    expect(() => Email.create(valor)).toThrow(DomainError);
  });

  it('usa el código INVALID_EMAIL', () => {
    try {
      Email.create('no-es-un-correo');
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe('INVALID_EMAIL');
    }
  });

  it('compara por valor normalizado', () => {
    expect(
      Email.create('ANA@example.com').equals(Email.create(' ana@Example.com')),
    ).toBe(true);
    expect(
      Email.create('ana@example.com').equals(Email.create('luis@example.com')),
    ).toBe(false);
  });

  it('se serializa como texto', () => {
    expect(JSON.stringify({ email: Email.create('Ana@Example.com') })).toBe(
      '{"email":"ana@example.com"}',
    );
    expect(String(Email.create('ana@example.com'))).toBe('ana@example.com');
  });
});
