import { InMemoryBooks } from '../../fakes/in-memory-books.js';
import { bookPortsContract } from '../../support/book-ports.contract.js';

bookPortsContract('fake en memoria', () => {
  const books = new InMemoryBooks();
  return Promise.resolve({
    repo: books.repository,
    catalog: books.catalog,
    seed: (book) => Promise.resolve(books.seed(book)),
    rowOf: (isbn) => Promise.resolve(books.rowOf(isbn)),
    count: () => Promise.resolve(books.count()),
    published: () => Promise.resolve(books.published()),
  });
});
