import { Email } from '../../../src/contexts/identity/domain/email.vo.js';
import type { DomainError } from '../../../src/shared-kernel/domain.errors.js';

const failure = (fn: () => unknown): DomainError | undefined => {
  try {
    fn();
  } catch (e) {
    return e as DomainError;
  }
};

describe('Email de Identidad', () => {
  it('se recorta y se pasa a minúsculas: es la clave de inicio de sesión', () => {
    expect(Email.create('  Ana.Perez@Example.COM ').value).toBe(
      'ana.perez@example.com',
    );
  });

  it.each([
    'a@b.co',
    'ana+libros@example.com',
    'ana.perez@sub.dominio.example.org',
    'ñandú@example.com',
  ])('acepta %s', (raw) => {
    expect(Email.create(raw).value).toBe(raw.toLowerCase());
  });

  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
    ['sin arroba', 'ana.example.com'],
    ['sin dominio', 'ana@'],
    ['sin usuario', '@example.com'],
    ['sin punto en el dominio', 'ana@example'],
    ['dos arrobas', 'ana@@example.com'],
    ['con espacios dentro', 'ana perez@example.com'],
    ['con un salto de línea', 'ana@example.com\nbcc:otro@example.com'],
    ['con un tabulador', 'ana\t@example.com'],
    ['con el carácter nulo', 'ana\u0000@example.com'],
  ])('rechaza un correo %s con INVALID_EMAIL', (_caso, raw) => {
    expect(failure(() => Email.create(raw))?.code).toBe('INVALID_EMAIL');
  });

  it.each([null, undefined, 42, {}, []])(
    'rechaza lo que no es texto (%j)',
    (raw) => {
      expect(failure(() => Email.create(raw as never))?.code).toBe(
        'INVALID_EMAIL',
      );
    },
  );

  it('admite hasta 254 caracteres y no uno más', () => {
    const domain = '@example.com';
    const local = (n: number) => 'a'.repeat(n);
    expect(Email.create(`${local(64)}${domain}`).value).toHaveLength(
      64 + domain.length,
    );
    expect(failure(() => Email.create(`${local(65)}${domain}`))?.code).toBe(
      'INVALID_EMAIL',
    ); // la parte local, 64 como máximo
    const long = `a@${'b'.repeat(240)}.com`;
    expect(failure(() => Email.create(`${long}x`.padEnd(255, 'x')))?.code).toBe(
      'INVALID_EMAIL',
    );
  });

  it('el mensaje no repite el correo recibido', () => {
    expect(
      failure(() => Email.create('secreto sin arroba'))?.message,
    ).not.toContain('secreto');
  });

  it('equals compara por valor, sin distinguir mayúsculas', () => {
    expect(
      Email.create('Ana@Example.com').equals(Email.create('ana@example.com')),
    ).toBe(true);
    expect(
      Email.create('ana@example.com').equals(Email.create('luis@example.com')),
    ).toBe(false);
  });

  it('toString y toJSON dan el valor', () => {
    const email = Email.create('ana@example.com');
    expect(String(email)).toBe('ana@example.com');
    expect(JSON.stringify({ email })).toBe('{"email":"ana@example.com"}');
  });
});
