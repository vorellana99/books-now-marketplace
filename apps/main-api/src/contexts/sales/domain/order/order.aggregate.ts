import { OrderPlacedEvent } from '../../../../contracts/sales/order-placed.event.js';
import type { DomainEvent } from '../../../../shared-kernel/domain-event.js';
import { DomainError } from '../../../../shared-kernel/domain.errors.js';
import type { Isbn } from '../../../../shared-kernel/isbn.vo.js';
import { Money, type Currency } from '../shared/money.vo.js';
import { OrderLine } from './order-line.entity.js';

export const MAX_UNITS_PER_BOOK = 10;

export type OrderStatus = 'DRAFT' | 'PLACED';

export class Order {
  private _status: OrderStatus = 'DRAFT';
  private _currency?: Currency;
  private readonly lines: OrderLine[] = [];
  private events: DomainEvent[] = [];

  constructor(
    readonly id: string,
    readonly customerId: string,
  ) {}

  get status(): OrderStatus {
    return this._status;
  }

  // Todas las líneas comparten moneda; sin líneas todavía no hay
  get currency(): Currency | undefined {
    return this._currency;
  }

  // Valida todo antes de tocar el pedido: un rechazo lo deja como estaba
  addBook(isbn: Isbn, title: string, price: Money, quantity: number): void {
    this.assertDraft();
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new DomainError(
        'INVALID_QUANTITY',
        'La cantidad debe ser un entero de al menos 1',
      );
    }
    if (this._currency && price.currency !== this._currency) {
      throw new DomainError(
        'CURRENCY_MISMATCH',
        'Todos los libros del pedido deben tener la misma moneda',
      );
    }

    const existing = this.lines.find((l) => l.isbn.equals(isbn));
    if (existing && !existing.unitPrice.equals(price)) {
      throw new DomainError(
        'PRICE_MISMATCH',
        `El libro ${isbn.value} aparece con dos precios distintos`,
      );
    }
    this.assertWithinLimit(isbn, (existing?.quantity ?? 0) + quantity);

    if (existing) {
      existing.increase(quantity);
    } else {
      this.lines.push(new OrderLine(isbn, title, price, quantity));
      this._currency = price.currency;
    }
  }

  // Copia: quien la reciba no puede modificar el pedido
  getLines(): OrderLine[] {
    return [...this.lines];
  }

  // Sin redondear: el importe final se redondea una sola vez (`toFinal`) antes de cobrar
  subtotal(): Money {
    return this.lines.reduce(
      (sum, line) => sum.add(line.total()),
      Money.zero(this._currency),
    );
  }

  place(): void {
    this.assertDraft();
    if (this.lines.length === 0) {
      throw new DomainError('EMPTY_ORDER', 'El pedido no tiene libros');
    }
    this.events.push(
      new OrderPlacedEvent(
        this.id,
        this.customerId,
        this.subtotal().toFinal().toFixed(),
        this.lines.map((l) => ({ isbn: l.isbn.value, quantity: l.quantity })),
      ),
    );
    this._status = 'PLACED';
  }

  // Entrega los eventos pendientes una sola vez; el repositorio los guarda junto con el pedido
  pullEvents(): DomainEvent[] {
    const pending = this.events;
    this.events = [];
    return pending;
  }

  private assertDraft(): void {
    if (this._status !== 'DRAFT') {
      throw new DomainError(
        'ORDER_ALREADY_PLACED',
        'El pedido ya fue confirmado',
      );
    }
  }

  private assertWithinLimit(isbn: Isbn, total: number): void {
    if (total > MAX_UNITS_PER_BOOK) {
      throw new DomainError(
        'MAX_QUANTITY_EXCEEDED',
        `Máximo ${MAX_UNITS_PER_BOOK} unidades por libro (${isbn.value})`,
      );
    }
  }
}
