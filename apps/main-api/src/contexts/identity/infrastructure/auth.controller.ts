import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { LoginCommand } from '../application/login.command.js';
import {
  RegisterUserCommand,
  type RegisteredUser,
} from '../application/register-user.command.js';
import { CredentialsDto } from './auth.dto.js';
import { LoginResponse, UserResponse } from './auth.responses.js';

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
    const result = await this.commandBus.execute(
      new LoginCommand(dto.email, dto.password),
    );
    return {
      accessToken: result.accessToken,
      tokenType: 'Bearer',
      expiresIn: result.expiresInSeconds,
      user: result.user,
    };
  }
}
