import { randomUUID } from 'node:crypto';
import { Prisma } from '../../../platform/prisma/generated/client.js';
import type { PrismaService } from '../../../platform/prisma/prisma.service.js';
import { ConflictError } from '../../../shared-kernel/domain.errors.js';
import { Email } from '../domain/email.vo.js';
import type { PasswordHasher } from '../domain/password-hasher.port.js';
import { PasswordPolicy } from '../domain/password-policy.js';
import { User } from '../domain/user.aggregate.js';

// Crea un administrador. No hay ruta HTTP para esto: nadie se hace administrador por la API, ni siquiera otro
// administrador. Lo usa el comando `pnpm run admin:create`. A diferencia del registro no escribe ningún evento: un
// administrador no es un cliente de Ventas. Un correo que ya existe es un error y no se asciende a nadie en silencio
export async function createAdminUser(input: {
  prisma: Pick<PrismaService, 'user'>;
  hasher: PasswordHasher;
  email: string;
  password: string;
}): Promise<{ id: string; email: string }> {
  const email = Email.create(input.email);
  PasswordPolicy.assert(input.password, email.value);
  const user = User.create({
    id: randomUUID(),
    email,
    passwordHash: await input.hasher.hash(input.password),
    role: 'ADMIN',
  });
  try {
    await input.prisma.user.create({
      data: {
        id: user.id,
        email: user.email.value,
        passwordHash: user.passwordHash,
        role: user.role,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictError(
        'EMAIL_ALREADY_REGISTERED',
        'Ya existe una cuenta con ese correo',
      );
    }
    throw error;
  }
  return { id: user.id, email: user.email.value };
}
