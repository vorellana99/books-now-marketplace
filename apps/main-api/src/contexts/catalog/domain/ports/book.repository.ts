import type { Book } from '../book/book.aggregate.js';

// Dónde viven los libros que se escriben
export abstract class BookRepository {
  // Guarda un libro nuevo y, en la misma transacción, los eventos que dejó pendientes (`pullEvents`): guardados por
  // separado, una caída entre ambos dejaría un libro cuyo stock nadie va a crear. La clave primaria decide una carrera:
  // un ISBN que ya existe es ConflictError BOOK_ALREADY_EXISTS y no se guarda nada
  abstract save(book: Book): Promise<void>;

  // Carga el libro, deja que `change` aplique las reglas del dominio (`book.apply`) y guarda SOLO lo que cambió, todo o
  // nada. Devuelve el libro ya cambiado. NotFoundError si el ISBN no existe; si `change` falla, no se guarda nada
  abstract update(isbn: string, change: (book: Book) => void): Promise<Book>;
}
