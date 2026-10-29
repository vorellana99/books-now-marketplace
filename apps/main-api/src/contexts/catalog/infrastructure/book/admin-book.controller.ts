import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
  ApiParam,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AdminApi } from '../../../../platform/http/admin-api.decorator.js';
import { CreateBookCommand } from '../../application/book/create-book.command.js';
import type { AdminBook } from '../../application/book/admin-book.js';
import { UpdateBookCommand } from '../../application/book/update-book.command.js';
import { AdminBookResponse } from './book-price.response.js';
import { CreateBookDto, UpdateBookDto } from './create-book.dto.js';

// Administración del catálogo. Solo administradores
@AdminApi()
@Controller('admin/books')
export class AdminBookController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @ApiOperation({
    summary: 'Crear un libro',
    description:
      'El libro nace activo, con su stock en cero (lo crea Inventario al recibir el evento). Solo administradores.',
  })
  @ApiCreatedResponse({ type: AdminBookResponse })
  @ApiBadRequestResponse({ description: 'Un campo no cumple el formato' })
  @ApiUnauthorizedResponse({
    description: 'UNAUTHENTICATED o TOKEN_EXPIRED: falta un token válido',
  })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: solo los administradores' })
  @ApiConflictResponse({
    description: 'BOOK_ALREADY_EXISTS: ya hay un libro con ese ISBN',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'INVALID_ISBN, INVALID_PRICE (cero o más del máximo), INVALID_CURRENCY o INVALID_BOOK (título o autor con caracteres de control)',
  })
  create(@Body() dto: CreateBookDto): Promise<AdminBook> {
    return this.commandBus.execute(
      new CreateBookCommand({
        isbn: dto.isbn,
        title: dto.title,
        author: dto.author,
        price: { amount: dto.price.amount, currency: dto.price.currency },
      }),
    );
  }

  @Patch(':isbn')
  @ApiOperation({
    summary: 'Cambiar un libro: título, autor, precio y/o si está activo',
    description:
      'Cualquier subconjunto de campos, pero al menos uno; se aplican todos o ninguno. `active: false` desactiva el libro (no se borra: otros contextos lo referencian por su ISBN) y `true` lo reactiva. La moneda no se cambia. Un cambio de precio no afecta a pedidos ya hechos.',
  })
  @ApiParam({
    name: 'isbn',
    example: '9780132350884',
    description: 'ISBN-13, con o sin guiones',
  })
  @ApiOkResponse({ type: AdminBookResponse })
  @ApiBadRequestResponse({
    description:
      'Un campo no cumple el formato, hay campos de más o no se indicó ningún cambio',
  })
  @ApiUnauthorizedResponse({
    description: 'UNAUTHENTICATED o TOKEN_EXPIRED: falta un token válido',
  })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: solo los administradores' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: el libro no existe' })
  @ApiUnprocessableEntityResponse({
    description:
      'INVALID_ISBN, INVALID_PRICE, INVALID_CURRENCY, INVALID_BOOK o CURRENCY_CANNOT_CHANGE',
  })
  update(
    @Param('isbn') isbn: string,
    @Body() dto: UpdateBookDto,
  ): Promise<AdminBook> {
    if (
      dto.title === undefined &&
      dto.author === undefined &&
      dto.price === undefined &&
      dto.active === undefined
    ) {
      throw new BadRequestException(
        'No se indicó ningún cambio: use title, author, price o active',
      );
    }
    return this.commandBus.execute(
      new UpdateBookCommand(isbn, {
        title: dto.title,
        author: dto.author,
        price: dto.price && {
          amount: dto.price.amount,
          currency: dto.price.currency,
        },
        active: dto.active,
      }),
    );
  }
}
