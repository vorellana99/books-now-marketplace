import { ApiProperty } from '@nestjs/swagger';
import { ROLES, type Role } from '../../../../shared-kernel/role.js';

export class UserResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ana@example.com' })
  email!: string;

  @ApiProperty({ enum: ROLES })
  role!: Role;
}

export class LoginResponse {
  @ApiProperty({
    description: 'JWT para el encabezado `Authorization: Bearer`',
  })
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ example: 900, description: 'Segundos que vale el token' })
  expiresIn!: number;

  @ApiProperty({
    description:
      'Opaco. Sirve una sola vez, en `POST /auth/refresh`, que entrega otro. Guárdelo como una contraseña',
  })
  refreshToken!: string;

  @ApiProperty({ type: UserResponse })
  user!: UserResponse;
}
