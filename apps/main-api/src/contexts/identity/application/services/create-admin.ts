import { randomUUID } from 'node:crypto';
import { Email } from '../../domain/email.vo.js';
import type { UserRepository } from '../../domain/ports/user.repository.js';
import type { PasswordHasher } from '../../domain/ports/password-hasher.port.js';
import { PasswordPolicy } from '../../domain/password-policy.js';
import { User } from '../../domain/user.aggregate.js';

// Crea un administrador. No hay ruta HTTP para esto: nadie se hace administrador por la API, ni siquiera otro
// administrador. Lo usa el comando `pnpm run admin:create`. A diferencia del registro no deja ningún evento: un
// administrador no es un cliente de Ventas. Un correo que ya existe es un error (EMAIL_ALREADY_REGISTERED) y no se
// asciende a nadie en silencio
export async function createAdminUser(input: {
  users: UserRepository;
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
  await input.users.save(user);
  return { id: user.id, email: user.email.value };
}
