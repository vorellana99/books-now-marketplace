import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Public } from '../../../../platform/auth/public.decorator.js';
import { LoginCommand } from '../../application/use-cases/session/login.command.js';
import { LogoutCommand } from '../../application/use-cases/session/logout.command.js';
import { RefreshSessionCommand } from '../../application/use-cases/session/refresh-session.command.js';
import type { Session } from '../../application/services/session.js';
import {
  RegisterUserCommand,
  type RegisteredUser,
} from '../../application/use-cases/user/register-user.command.js';
import { CredentialsDto, RefreshTokenDto } from './auth.dto.js';
import { LoginResponse, UserResponse } from './auth.responses.js';

// Todas públicas: son la puerta para conseguir un token
@Public()
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('register')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Registrarse como comprador',
    description:
      'Crea la cuenta con el rol BUYER (el rol no se elige) y, en segundo plano, a su cliente en Ventas con el mismo id. No inicia sesión: use `POST /auth/login`. No se verifica el correo.',
  })
  @ApiCreatedResponse({ type: UserResponse })
  @ApiBadRequestResponse({
    description: 'Falta un campo, no es texto o hay campos de más',
  })
  @ApiConflictResponse({
    description: 'EMAIL_ALREADY_REGISTERED: ya hay una cuenta con ese correo',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'INVALID_EMAIL, o WEAK_PASSWORD (menos de 10 o más de 128 caracteres, una contraseña común o igual al correo)',
  })
  register(@Body() dto: CredentialsDto): Promise<RegisteredUser> {
    return this.commandBus.execute(
      new RegisterUserCommand(dto.email, dto.password),
    );
  }

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Iniciar sesión',
    description:
      'Devuelve un token de acceso de vida corta para `Authorization: Bearer`. El error es el mismo con un correo desconocido que con una contraseña equivocada.',
  })
  @ApiOkResponse({ type: LoginResponse })
  @ApiBadRequestResponse({
    description: 'Falta un campo, no es texto o hay campos de más',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS: correo o contraseña incorrectos',
  })
  async login(@Body() dto: CredentialsDto): Promise<LoginResponse> {
    return toResponse(
      await this.commandBus.execute(new LoginCommand(dto.email, dto.password)),
    );
  }

  @Post('refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Renovar la sesión',
    description:
      'Cambia un token de refresco por un token de acceso y un token de refresco nuevos. Cada token de refresco sirve **una sola vez**: si se presenta uno ya usado se asume que se copió o se robó y se revoca la sesión entera, incluido el token nuevo. Dos renovaciones simultáneas con el mismo token cuentan como reutilización.',
  })
  @ApiOkResponse({ type: LoginResponse })
  @ApiBadRequestResponse({
    description: 'Falta el token, no es texto o hay campos de más',
  })
  @ApiUnauthorizedResponse({
    description:
      'INVALID_REFRESH_TOKEN: desconocido, mal formado, vencido, revocado o ya usado',
  })
  async refresh(@Body() dto: RefreshTokenDto): Promise<LoginResponse> {
    return toResponse(
      await this.commandBus.execute(
        new RefreshSessionCommand(dto.refreshToken),
      ),
    );
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Cerrar la sesión',
    description:
      'Revoca la sesión a la que pertenece el token de refresco (las de otros dispositivos siguen). Responde 204 también con un token desconocido o ya cerrado. El token de acceso ya emitido vale hasta que vence (15 minutos por defecto).',
  })
  @ApiNoContentResponse({ description: 'Sesión cerrada (o no existía)' })
  @ApiBadRequestResponse({
    description: 'Falta el token, no es texto o hay campos de más',
  })
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.commandBus.execute(new LogoutCommand(dto.refreshToken));
  }
}

const toResponse = (session: Session): LoginResponse => ({
  accessToken: session.accessToken,
  tokenType: 'Bearer',
  expiresIn: session.expiresInSeconds,
  refreshToken: session.refreshToken,
  user: session.user,
});
