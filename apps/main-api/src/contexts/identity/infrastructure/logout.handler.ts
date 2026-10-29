import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../platform/prisma/prisma.service.js';
import { LogoutCommand } from '../application/logout.command.js';
import {
  hashRefreshToken,
  isWellFormedRefreshToken,
} from '../domain/session/refresh-token.js';

@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ refreshToken }: LogoutCommand): Promise<void> {
    if (!isWellFormedRefreshToken(refreshToken)) return;
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(refreshToken) },
    });
    if (!token) return;
    // Toda la familia, también si el token ya se usó: quien cierra sesión no quiere que el sucesor siga sirviendo. Lo ya
    // revocado se deja como está, así repetirlo no cambia el momento de la revocación
    await this.prisma.refreshToken.updateMany({
      where: { familyId: token.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
