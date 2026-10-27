import { Controller, Get, Param } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  GetBookPriceQuery,
  type BookPrice,
} from '../../../../contracts/catalog/get-book-price.query.js';
import { Isbn } from '../../../../shared-kernel/isbn.vo.js';
import { BookResponse } from './book-price.response.js';

@ApiTags('books')
@Controller('books')
export class BookController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get(':isbn')
  @ApiOperation({ summary: 'Datos y precio de un libro por su ISBN' })
  @ApiParam({
    name: 'isbn',
    example: '9780132350884',
    description: 'ISBN-13, con o sin guiones',
  })
  @ApiOkResponse({ type: BookResponse })
  @ApiNotFoundResponse({
    description: 'NOT_FOUND: el libro no existe o está inactivo',
  })
  @ApiUnprocessableEntityResponse({
    description: 'INVALID_ISBN: el ISBN está mal formado',
  })
  get(@Param('isbn') isbn: string): Promise<BookPrice> {
    // Isbn.create valida el formato y quita los guiones; la consulta es la misma que usa Ventas
    return this.queryBus.execute(
      new GetBookPriceQuery(Isbn.create(isbn).value),
    );
  }
}
