import { randomBytes } from 'node:crypto';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../platform/prisma/prisma.service.js';
import { AuthenticationError } from '../../../shared-kernel/domain.errors.js';
import { LoginCommand } from '../application/login.command.js';
import type { Session } from '../application/session.js';
import { Email } from '../domain/email.vo.js';
import { PasswordHasher } from '../domain/password-hasher.port.js';
import { SessionService } from './session.service.js';

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
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
  ) {}

  async execute(command: LoginCommand): Promise<Session> {
    const email = this.parseEmail(command.email);
    const user = email
      ? await this.prisma.user.findUnique({ where: { email: email.value } })
      : null;

    // Con un correo desconocido también se verifica un hash: si no, responder más rápido que con uno conocido
    // delataría qué correos tienen cuenta
    const valid = await this.hasher.verify(
      command.password,
      user?.passwordHash ?? (await this.getDummyHash()),
    );
    if (!user || !valid) throw invalidCredentials();

    return this.sessions.open(this.prisma, user);
  }

  // Un correo mal escrito no se distingue de uno desconocido: ambos terminan en INVALID_CREDENTIALS
  private parseEmail(raw: string): Email | undefined {
    try {
      return Email.create(raw);
    } catch {
      return undefined;
    }
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
