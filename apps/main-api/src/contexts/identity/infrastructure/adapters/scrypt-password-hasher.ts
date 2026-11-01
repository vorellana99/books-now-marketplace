import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import { PasswordHasher } from '../../domain/ports/password-hasher.port.js';

// Parámetros de OWASP para scrypt con poca memoria: N = 2^15 (32 MiB), r = 8, p = 3. El costo (N) se puede subir con el
// tiempo: cada hash guarda sus propios parámetros, así que los antiguos siguen verificando
export const DEFAULT_LOG_N = 15;
const R = 8;
const P = 3;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const MIN_LOG_N = 4;
const MAX_LOG_N = 20;
const MAX_R = 16;
const MAX_P = 16;

const derive = (
  password: string,
  salt: Buffer,
  logN: number,
  r: number,
  p: number,
): Promise<Buffer> => {
  const N = 2 ** logN;
  // Memoria de scrypt: 128·r·(N + p + 1) bytes; se da el doble de margen. Con una fórmula más corta, un hash legítimo con
  // p alto (hasta MAX_P) no llegaría a verificar
  const options: ScryptOptions = { N, r, p, maxmem: 128 * r * (N + p + 2) * 2 };
  return new Promise((resolve, reject) =>
    scryptCallback(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      options,
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
};

// Formato: scrypt$<logN>$<r>$<p>$<sal>$<resultado>, con la sal y el resultado en base64url
export class ScryptPasswordHasher extends PasswordHasher {
  private readonly logN: number;

  constructor(options: { logN?: number } = {}) {
    super();
    const logN = options.logN ?? DEFAULT_LOG_N;
    if (!Number.isInteger(logN) || logN < MIN_LOG_N || logN > MAX_LOG_N) {
      throw new Error(
        `El costo del hash debe ser un entero de ${MIN_LOG_N} a ${MAX_LOG_N}, y llegó ${logN}`,
      );
    }
    this.logN = logN;
  }

  async hash(plain: string): Promise<string> {
    if (typeof plain !== 'string')
      throw new TypeError('La contraseña debe ser un texto');
    const salt = randomBytes(SALT_LENGTH);
    const key = await derive(plain, salt, this.logN, R, P);
    return [
      'scrypt',
      this.logN,
      R,
      P,
      salt.toString('base64url'),
      key.toString('base64url'),
    ].join('$');
  }

  async verify(plain: string, stored: string): Promise<boolean> {
    if (typeof plain !== 'string' || typeof stored !== 'string') return false;
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [logN, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
    // Los parámetros salen del hash guardado: se acotan para que uno alterado no pida memoria o CPU desmesuradas
    if (
      !Number.isInteger(logN) ||
      logN < MIN_LOG_N ||
      logN > MAX_LOG_N ||
      !Number.isInteger(r) ||
      r < 1 ||
      r > MAX_R ||
      !Number.isInteger(p) ||
      p < 1 ||
      p > MAX_P
    ) {
      return false;
    }
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');
    if (salt.length === 0 || expected.length === 0) return false;
    const actual = await derive(plain, salt, logN, r, p).catch(() => null);
    // Si el largo difiere (un hash alterado), timingSafeEqual lanzaría: ya no es la misma contraseña
    if (!actual || actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  }
}
