import { DomainError } from '../../../../shared-kernel/domain.errors.js';
import {
  cleanAmount,
  cleanBookText,
  cleanCurrency,
  invalidBook,
  type BookCurrency,
} from './book-rules.js';

// Lo que se puede cambiar de un libro que ya existe (decisiones D4 y D5): título, autor, precio y si está activo.
// El ISBN no cambia y la moneda tampoco: cambiarla sería otro libro. Lo que no se indica no se toca
export interface BookChangesData {
  title?: string;
  author?: string;
  price?: { amount: string; currency?: string };
  active?: boolean;
}

export interface BookChangeSet {
  title?: string;
  author?: string;
  price?: { amount: string; currency?: BookCurrency }; // la moneda solo sirve para comprobar que no cambia
  active?: boolean;
}

export const BookChanges = {
  // Valida todo antes de devolver nada: un cambio inválido junto a uno válido rechaza ambos
  create(data: BookChangesData): BookChangeSet {
    const changes: BookChangeSet = {};
    if (data.title !== undefined) {
      changes.title = cleanBookText('title', data.title);
    }
    if (data.author !== undefined) {
      changes.author = cleanBookText('author', data.author);
    }
    if (data.price !== undefined) {
      const price: { amount: string; currency?: BookCurrency } = {
        amount: cleanAmount(data.price?.amount),
      };
      if (data.price.currency !== undefined) {
        price.currency = cleanCurrency(data.price.currency);
      }
      changes.price = price;
    }
    if (data.active !== undefined) {
      if (typeof data.active !== 'boolean') {
        throw invalidBook('active', 'debe ser true o false');
      }
      changes.active = data.active;
    }
    if (Object.keys(changes).length === 0) {
      throw new DomainError(
        'NOTHING_TO_UPDATE',
        'No se indicó ningún cambio: use title, author, price o active',
      );
    }
    return changes;
  },
};
