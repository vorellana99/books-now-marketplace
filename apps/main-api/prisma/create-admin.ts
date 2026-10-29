import 'dotenv/config';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { PrismaPg } from '@prisma/adapter-pg';
import { createAdminUser } from '../src/contexts/identity/application/create-admin.js';
import { ScryptPasswordHasher } from '../src/contexts/identity/infrastructure/adapters/scrypt-password-hasher.js';
import { buildDatabaseUrl } from '../src/platform/config/database-url.js';
import { PrismaClient } from '../src/platform/prisma/generated/client.js';
import type { PrismaService } from '../src/platform/prisma/prisma.service.js';
import { PrismaUserRepository } from '../src/contexts/identity/infrastructure/persistence/prisma-user.repository.js';
import { DomainError } from '../src/shared-kernel/domain.errors.js';

// Un error del propio comando (no del dominio ni de la base): su mensaje es seguro de mostrar
class CliError extends Error {}

// pnpm run admin:create -- --email=correo@dominio.com
//
// La contraseña nunca va como argumento (quedaría en el historial del shell y en la lista de procesos): sale de la
// variable ADMIN_PASSWORD o se pide, dos veces y sin mostrarla si hay terminal. El correo, de --email= o ADMIN_EMAIL

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

// Con terminal, readline lee sin mostrar lo que se teclea (su salida va a un destino mudo) y atiende Ctrl+C; sin
// terminal (una tubería) lee las líneas tal cual
function openPrompt() {
  const tty = Boolean(process.stdin.isTTY);
  const mute = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const rl = createInterface({
    input: process.stdin,
    output: tty ? mute : undefined,
    terminal: tty,
  });
  rl.on('SIGINT', () => {
    rl.close();
    process.stderr.write('\n');
    process.exit(130);
  });
  const lines = rl[Symbol.asyncIterator]();
  return {
    async ask(prompt: string): Promise<string> {
      process.stderr.write(prompt);
      const line = await lines.next();
      if (tty) process.stderr.write('\n');
      return line.done ? '' : line.value;
    },
    close: () => rl.close(),
  };
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv) return fromEnv;
  const prompt = openPrompt();
  try {
    const first = await prompt.ask('Contraseña: ');
    const second = await prompt.ask('Repita la contraseña: ');
    if (first !== second) throw new CliError('Las contraseñas no coinciden');
    if (first === '') throw new CliError('Falta la contraseña');
    return first;
  } finally {
    prompt.close();
  }
}

async function main(): Promise<void> {
  const email = argument('email') || process.env.ADMIN_EMAIL;
  if (!email) {
    throw new CliError(
      'Falta el correo: use --email=correo@dominio.com o la variable ADMIN_EMAIL',
    );
  }
  const password = await readPassword();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: buildDatabaseUrl(process.env) }),
  });
  try {
    const created = await createAdminUser({
      users: new PrismaUserRepository(prisma as unknown as PrismaService, {
        // un administrador no publica eventos: si alguna vez dejara uno, es un error y no se pierde en silencio
        append: (_tx, events) =>
          events.length === 0
            ? Promise.resolve()
            : Promise.reject(new Error('un administrador no publica eventos')),
      }),
      hasher: new ScryptPasswordHasher({
        logN: Number(process.env.PASSWORD_HASH_LOG_N) || undefined,
      }),
      email,
      password,
    });
    console.log(`Administrador creado: ${created.email} (id ${created.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

try {
  await main();
} catch (error) {
  // Solo se muestra el mensaje de los errores propios y los del dominio. Los demás (la base, por ejemplo) pueden traer
  // en su texto los datos de la operación, entre ellos el hash: se muestra solo su nombre
  console.error(
    error instanceof CliError || error instanceof DomainError
      ? `Error: ${error.message}`
      : `Error inesperado (${error instanceof Error ? error.name : 'desconocido'}): revise la conexión con la base de datos y sus variables DB_*`,
  );
  process.exitCode = 1;
}
