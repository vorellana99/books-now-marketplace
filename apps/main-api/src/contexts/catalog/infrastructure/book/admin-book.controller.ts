import { Body, Controller, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AdminApi } from '../../../../platform/http/admin-api.decorator.js';
import { CreateBookCommand } from '../../application/book/create-book.command.js';
import type { BookItem } from '../../application/book/search-books.query.js';
import { BookResponse } from './book-price.response.js';
import { CreateBookDto } from './create-book.dto.js';

// Administración del catálogo. Solo funciona con ADMIN_API_ENABLED=true, hasta que exista la autenticación
@AdminApi()
@Controller('admin/books')
export class AdminBookController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @ApiOperation({
    summary: 'Crear un libro',
    description:
      'El libro nace activo, con su stock en cero (lo crea Inventario al recibir el evento). Solo con ADMIN_API_ENABLED=true.',
  })
  @ApiCreatedResponse({ type: BookResponse })
  @ApiBadRequestResponse({ description: 'Un campo no cumple el formato' })
  @ApiNotFoundResponse({
    description: 'La administración está cerrada (ADMIN_API_ENABLED=false)',
  })
  @ApiConflictResponse({
    description: 'BOOK_ALREADY_EXISTS: ya hay un libro con ese ISBN',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'INVALID_ISBN, INVALID_PRICE (cero o más del máximo), INVALID_CURRENCY o INVALID_BOOK (título o autor con caracteres de control)',
  })
  create(@Body() dto: CreateBookDto): Promise<BookItem> {
    return this.commandBus.execute(
      new CreateBookCommand({
        isbn: dto.isbn,
        title: dto.title,
        author: dto.author,
        price: { amount: dto.price.amount, currency: dto.price.currency },
      }),
    );
  }
}
