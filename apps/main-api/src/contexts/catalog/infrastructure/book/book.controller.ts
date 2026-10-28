import { Controller, Get, Param, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
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
import { Public } from '../../../../platform/auth/public.decorator.js';
import { Isbn } from '../../../../shared-kernel/isbn.vo.js';
import { SearchBooksQuery } from '../../application/book/search-books.query.js';
import { BookPageResponse, BookResponse } from './book-price.response.js';
import { SearchBooksDto } from './search-books.dto.js';

// El catálogo es público: se consulta sin sesión
@Public()
@ApiTags('books')
@Controller('books')
export class BookController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({
    summary: 'Buscar y listar libros activos, paginados',
    description:
      'Ordenados por título y, con el mismo título, por ISBN. Sin `q`, lista todo el catálogo activo.',
  })
  @ApiOkResponse({ type: BookPageResponse })
  @ApiBadRequestResponse({
    description:
      'Un parámetro no cumple el formato (por ejemplo, pageSize mayor que 50)',
  })
  search(@Query() { q, page, pageSize }: SearchBooksDto) {
    return this.queryBus.execute(new SearchBooksQuery(q, page, pageSize));
  }

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
