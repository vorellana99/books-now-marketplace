import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { BookCatalog } from '../../../domain/ports/book-catalog.port.js';
import { SearchBooksQuery, type BookPage } from './search-books.query.js';

@QueryHandler(SearchBooksQuery)
export class SearchBooksHandler implements IQueryHandler<SearchBooksQuery> {
  constructor(private readonly catalog: BookCatalog) {}

  execute({ q, page, pageSize }: SearchBooksQuery): Promise<BookPage> {
    return this.catalog.search(q, page, pageSize);
  }
}
