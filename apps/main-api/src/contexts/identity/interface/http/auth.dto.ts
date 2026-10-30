import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Solo la forma: el correo (formato) y la contraseña (largo, contraseñas comunes) los valida el dominio. Los topes
// acotan lo que se procesa: una contraseña enorme no debe llegar al hash
export class CredentialsDto {
  @ApiProperty({
    example: 'ana@example.com',
    description: 'Sin distinguir mayúsculas',
    maxLength: 254,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    example: 'una contraseña larga y buena',
    description: 'De 10 a 128 caracteres; los espacios cuentan',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  password!: string;
}

// El token de refresco que entregó el login o la renovación anterior
export class RefreshTokenDto {
  @ApiProperty({ example: 'b3JpZ2luYWw5X3Rva2VuLWRlLXJlZnJlc2NvLTQzY2g' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken!: string;
}
