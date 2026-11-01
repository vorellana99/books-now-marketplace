import { DomainError } from '../../../../../shared-kernel/domain.errors.js';

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

// Contraseñas muy comunes de 10 o más caracteres (las más cortas ya no pasan por el largo mínimo). Es una lista corta a
// propósito: lo que más protege es el largo y el límite de intentos del login, no memorizar diccionarios
const COMMON = new Set([
  '1234567890',
  '0123456789',
  '12345678910',
  '123456789a',
  '1234567890a',
  'qwertyuiop',
  'qwerty12345',
  'asdfghjkl1',
  '1q2w3e4r5t',
  'abcdefghij',
  'password12',
  'password123',
  'password1234',
  'passw0rd123',
  'iloveyou12',
  'iloveyou123',
  'letmein123',
  'welcome123',
  'administrator',
  'contrasena1',
  'contrasena12',
  'contrasena123',
  'contraseña1',
  'contraseña12',
  'contraseña123',
  'libroya123',
  'libroya2026',
  'libroya-dev',
  'changeme123',
]);

const weak = (why: string) =>
  new DomainError('WEAK_PASSWORD', `Contraseña débil: ${why}`);

// Sin reglas de composición (mayúsculas, números, símbolos): obligan a patrones previsibles y no suman seguridad. Se
// pide largo, y se descartan las contraseñas obvias. NO recorta: los espacios forman parte de la contraseña
export const PasswordPolicy = {
  assert(password: unknown, email?: string): void {
    if (typeof password !== 'string') throw weak('debe ser un texto');
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw weak(`debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      throw weak(`no puede superar ${MAX_PASSWORD_LENGTH} caracteres`);
    }
    const lower = password.toLowerCase();
    if (COMMON.has(lower)) throw weak('es una contraseña demasiado común');
    if (/^(.)\1*$/su.test(password)) {
      throw weak('no puede ser un solo carácter repetido');
    }
    if (email !== undefined && lower === email.toLowerCase()) {
      throw weak('no puede ser igual al correo');
    }
  },
};
