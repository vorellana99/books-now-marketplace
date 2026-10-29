import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { AuthenticationError } from '../../../shared-kernel/domain.errors.js';
import { SessionRepository } from '../domain/ports/session.repository.js';
import { UserRepository } from '../domain/ports/user.repository.js';
import {
  hashRefreshToken,
  isWellFormedRefreshToken,
} from '../domain/session/refresh-token.js';
import { RefreshSessionCommand } from './refresh-session.command.js';
import type { Session } from './session.js';
import { SessionService } from './session.service.js';

type Outcome =
  | { kind: 'renewed'; session: Session }
  | { kind: 'invalid' }
  | { kind: 'reused'; userId: string; familyId: string };

const invalidRefreshToken = () =>
  new AuthenticationError(
    'INVALID_REFRESH_TOKEN',
    'La sesión no es válida o venció: inicie sesión de nuevo',
  );

@CommandHandler(RefreshSessionCommand)
export class RefreshSessionHandler implements ICommandHandler<RefreshSessionCommand> {
  private readonly logger = new Logger(RefreshSessionHandler.name);

  constructor(
    private readonly sessions: SessionRepository,
    private readonly users: UserRepository,
    private readonly service: SessionService,
  ) {}

  async execute({ refreshToken }: RefreshSessionCommand): Promise<Session> {
    if (!isWellFormedRefreshToken(refreshToken)) throw invalidRefreshToken();

    // Las reglas son del dominio (`Session.rotate`); el repositorio pone en fila dos renovaciones simultáneas con el
    // mismo token y guarda lo que decidió la sesión. Si algo de aquí dentro falla (emitir el token de acceso, por
    // ejemplo), no se guarda nada y el token viejo sigue sirviendo
    const outcome = await this.sessions.rotate(
      hashRefreshToken(refreshToken),
      async (session): Promise<Outcome> => {
        if (!session) return { kind: 'invalid' };
        const result = session.rotate(new Date(), this.service.ttlMs);
        if (result.kind !== 'renewed') return result;
        // El rol se lee de nuevo: un cambio de rol vale desde la siguiente renovación
        const user = await this.users.findById(result.userId);
        if (!user) {
          throw new Error(
            `El usuario ${result.userId} de la sesión ya no existe`,
          );
        }
        return {
          kind: 'renewed',
          session: await this.service.finish(user, result.refreshToken),
        };
      },
    );

    if (outcome.kind === 'renewed') return outcome.session;
    if (outcome.kind === 'reused') {
      // La revocación ya se guardó: aquí solo se avisa, sin el token
      this.logger.warn(
        `Se reutilizó un token de refresco ya usado: se revocó la sesión ${outcome.familyId} del usuario ${outcome.userId}`,
      );
    }
    throw invalidRefreshToken();
  }
}
