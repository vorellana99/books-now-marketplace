import { StockRepository } from '../../src/contexts/inventory/domain/ports/stock.repository.js';
import {
  MAX_AVAILABLE,
  type StockLevel,
  type StockLine,
} from '../../src/contexts/inventory/domain/model/stock/stock-rules.js';
import {
  OutOfStockError,
  StockItemNotFoundError,
} from '../../src/contracts/inventory/stock.errors.js';
import {
  ConflictError,
  DomainError,
} from '../../src/shared-kernel/domain.errors.js';

interface Reservation {
  orderId: string;
  isbn: string;
  quantity: number;
  status: 'HELD' | 'CONFIRMED';
  createdAt: Date;
}

interface Snapshot {
  items: Map<string, { available: number; reserved: number }>;
  reservations: Reservation[];
}

const DAY = 86_400_000;

// El stock en memoria. Como el real, reserva todas las líneas o ninguna y nunca deja el stock en negativo; no hay
// concurrencia real (JavaScript atiende de una en una), pero cada operación es atómica
export class InMemoryStockRepository extends StockRepository {
  private items = new Map<string, { available: number; reserved: number }>();
  private reservations: Reservation[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {
    super();
  }

  reserve(orderId: string, lines: StockLine[]): Promise<void> {
    if (this.reservations.some((r) => r.orderId === orderId)) {
      return Promise.reject(
        new ConflictError(
          'ORDER_ALREADY_RESERVED',
          `El pedido ${orderId} ya tiene stock reservado`,
        ),
      );
    }
    const sorted = [...lines].sort((a, b) =>
      a.isbn < b.isbn ? -1 : a.isbn > b.isbn ? 1 : 0,
    );
    // Se comprueba todo antes de tocar nada: todas las líneas o ninguna
    for (const { isbn, quantity } of sorted) {
      const item = this.items.get(isbn);
      if (!item) return Promise.reject(new StockItemNotFoundError(isbn));
      if (item.available < quantity) {
        return Promise.reject(new OutOfStockError(isbn));
      }
    }
    for (const { isbn, quantity } of sorted) {
      const item = this.items.get(isbn) as {
        available: number;
        reserved: number;
      };
      item.available -= quantity;
      item.reserved += quantity;
    }
    for (const { isbn, quantity } of lines) {
      this.reservations.push({
        orderId,
        isbn,
        quantity,
        status: 'HELD',
        createdAt: this.now(),
      });
    }
    return Promise.resolve();
  }

  release(orderId: string): Promise<void> {
    const held = this.reservations.filter(
      (r) => r.orderId === orderId && r.status === 'HELD',
    );
    for (const { isbn, quantity } of held) {
      const item = this.items.get(isbn);
      if (item) {
        item.available += quantity;
        item.reserved -= quantity;
      }
    }
    this.reservations = this.reservations.filter((r) => !held.includes(r));
    return Promise.resolve();
  }

  confirm(orderId: string): Promise<void> {
    for (const r of this.reservations) {
      if (r.orderId === orderId && r.status === 'HELD') r.status = 'CONFIRMED';
    }
    return Promise.resolve();
  }

  add(isbn: string, quantity: number): Promise<StockLevel> {
    const item = this.items.get(isbn);
    if (!item) return Promise.reject(new StockItemNotFoundError(isbn));
    if (item.available > MAX_AVAILABLE - quantity) {
      return Promise.reject(
        new DomainError(
          'STOCK_LIMIT_EXCEEDED',
          `Con ${quantity} unidades más, ${isbn} pasaría del máximo de ${MAX_AVAILABLE} disponibles`,
        ),
      );
    }
    item.available += quantity;
    return Promise.resolve({ isbn, ...item });
  }

  createItem(isbn: string): Promise<void> {
    if (!this.items.has(isbn))
      this.items.set(isbn, { available: 0, reserved: 0 });
    return Promise.resolve();
  }

  purgeConfirmed(olderThanDays: number, limit: number): Promise<number> {
    const cutoff = this.now().getTime() - olderThanDays * DAY;
    const old = this.reservations
      .filter((r) => r.status === 'CONFIRMED' && r.createdAt.getTime() < cutoff)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit);
    this.reservations = this.reservations.filter((r) => !old.includes(r));
    return Promise.resolve(old.length);
  }

  // Ayudas para las pruebas
  seed(isbn: string, available: number, reserved = 0): void {
    this.items.set(isbn, { available, reserved });
  }

  levelOf(isbn: string): { available: number; reserved: number } | undefined {
    const item = this.items.get(isbn);
    return item ? { ...item } : undefined;
  }

  reservationsOf(
    orderId: string,
  ): { isbn: string; quantity: number; status: string }[] {
    return this.reservations
      .filter((r) => r.orderId === orderId)
      .map(({ isbn, quantity, status }) => ({ isbn, quantity, status }))
      .sort((a, b) => (a.isbn < b.isbn ? -1 : a.isbn > b.isbn ? 1 : 0));
  }

  ageReservations(orderId: string, days: number): void {
    for (const r of this.reservations) {
      if (r.orderId === orderId) {
        r.createdAt = new Date(this.now().getTime() - days * DAY);
      }
    }
  }

  snapshot(): Snapshot {
    return {
      items: new Map([...this.items].map(([k, v]) => [k, { ...v }])),
      reservations: this.reservations.map((r) => ({ ...r })),
    };
  }

  restore(snapshot: Snapshot): void {
    this.items = snapshot.items;
    this.reservations = snapshot.reservations;
  }
}
