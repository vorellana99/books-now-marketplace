import { randomBytes } from 'node:crypto';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { AuthenticationError } from '../../../../../shared-kernel/domain.errors.js';
import { LoginCommand } from './login.command.js';
import type { Session } from '../../services/session.js';
import { Email } from '../../../domain/model/user/email.vo.js';
import { PasswordHasher } from '../../../domain/ports/password-hasher.port.js';
import { UserRepository } from '../../../domain/ports/user.repository.js';
import { SessionService } from '../../services/session.service.js';

const invalidCredentials = () =>
  new AuthenticationError(
    'INVALID_CREDENTIALS',
    'Correo o contraseña incorrectos',
  );

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand> {
  // Un hash de una contraseña que nadie conoce, con el mismo costo que los reales. Se calcula la primera vez que hace
  // falta y se reutiliza
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
  ) {}

  async execute(command: LoginCommand): Promise<Session> {
    // Un correo mal escrito no se distingue de uno desconocido: ambos terminan en INVALID_CREDENTIALS
    const email = Email.tryCreate(command.email);
    const user = email ? await this.users.findByEmail(email) : null;

    // Con un correo desconocido también se verifica un hash: si no, responder más rápido que con uno conocido
    // delataría qué correos tienen cuenta
    const valid = await this.hasher.verify(
      command.password,
      user?.passwordHash ?? (await this.getDummyHash()),
    );
    if (!user || !valid) throw invalidCredentials();

    return this.sessions.start(user);
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher
      .hash(randomBytes(32).toString('hex'))
      .catch((error: unknown) => {
        this.dummyHash = undefined; // que el próximo intento lo vuelva a calcular
        throw error;
      });
    return this.dummyHash;
  }
}
