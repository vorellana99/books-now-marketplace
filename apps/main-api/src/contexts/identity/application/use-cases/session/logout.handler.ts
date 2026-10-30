import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SessionRepository } from '../../../domain/ports/session.repository.js';
import {
  hashRefreshToken,
  isWellFormedRefreshToken,
} from '../../../domain/session/refresh-token.js';
import { LogoutCommand } from './logout.command.js';

@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand> {
  constructor(private readonly sessions: SessionRepository) {}

  // Toda la familia, también si el token ya se usó. Con un token mal formado o desconocido no hace nada ni lo dice
  async execute({ refreshToken }: LogoutCommand): Promise<void> {
    if (!isWellFormedRefreshToken(refreshToken)) return;
    await this.sessions.revoke(hashRefreshToken(refreshToken), new Date());
  }
}
