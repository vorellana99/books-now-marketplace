import { query } from './database.js';

// Insertan con SQL directo, no con el código bajo prueba: así un fallo del handler no se esconde detrás del mismo cliente

let nextIsbn = 0;

// ISBN-13 válidos y distintos en cada llamada (prefijo 978 + 9 dígitos + dígito de control)
export function uniqueIsbn(): string {
  const body = `978${String(++nextIsbn).padStart(9, '0')}`;
  const sum = body
    .split('')
    .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

export interface BookRow {
  isbn: string;
  title: string;
  author: string;
  price: string;
  currency: 'PEN' | 'USD';
  active: boolean;
}

export async function insertBook(
  overrides: Partial<BookRow> = {},
): Promise<BookRow> {
  const book: BookRow = {
    isbn: uniqueIsbn(),
    title: 'Clean Code',
    author: 'Robert C. Martin',
    price: '45.00',
    currency: 'PEN',
    active: true,
    ...overrides,
  };
  await query(
    `INSERT INTO catalog.books (isbn, title, author, price, currency, active)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      book.isbn,
      book.title,
      book.author,
      book.price,
      book.currency,
      book.active,
    ],
  );
  return book;
}

export async function insertStock(
  isbn: string,
  available: number,
  reserved = 0,
): Promise<void> {
  await query(
    'INSERT INTO inventory.stock_items (isbn, available, reserved) VALUES ($1, $2, $3)',
    [isbn, available, reserved],
  );
}

// Lecturas con SQL directo, para comprobar el efecto de un handler sin usar su mismo cliente
export async function stockOf(
  isbn: string,
): Promise<{ available: number; reserved: number } | undefined> {
  const [row] = await query<{ available: number; reserved: number }>(
    'SELECT available, reserved FROM inventory.stock_items WHERE isbn = $1',
    [isbn],
  );
  return row;
}

export async function reservationsOf(
  orderId: string,
): Promise<{ isbn: string; quantity: number; status: string }[]> {
  return query(
    'SELECT isbn, quantity, status::text AS status FROM inventory.reservations WHERE order_id = $1 ORDER BY isbn',
    [orderId],
  );
}

// ── Outbox ──────────────────────────────────────────────────────────────────────────────────────

export interface OutboxRow {
  id: string;
  event_name: string;
  event_version: number;
  aggregate_id: string;
  payload: Record<string, unknown>;
  occurred_on: Date;
  correlation_id: string | null;
}

export interface DeliveryRow {
  event_id: string;
  consumer: string;
  status: 'PENDING' | 'DONE' | 'FAILED';
  attempts: number;
  next_attempt_at: Date;
  locked_until: Date | null;
  last_error: string | null;
}

export async function outboxRows(): Promise<OutboxRow[]> {
  return query<OutboxRow>('SELECT * FROM messaging.outbox ORDER BY id');
}

export async function deliveryRows(eventId?: string): Promise<DeliveryRow[]> {
  return query<DeliveryRow>(
    `SELECT event_id, consumer, status::text AS status, attempts, next_attempt_at, locked_until, last_error
     FROM messaging.deliveries WHERE ($1::uuid IS NULL OR event_id = $1::uuid) ORDER BY event_id, consumer`,
    [eventId ?? null],
  );
}

// Hace vencer el reintento pendiente (backoff) de las entregas PENDING, para no esperar segundos reales
export async function makeDeliveriesDue(): Promise<void> {
  await query(
    "UPDATE messaging.deliveries SET next_attempt_at = now() - interval '1 second' WHERE status = 'PENDING'",
  );
}

// Hace vencer el bloqueo de una entrega: como si la instancia que la reclamó se hubiera caído o quedado colgada
export async function expireLease(eventId: string): Promise<void> {
  await query(
    "UPDATE messaging.deliveries SET locked_until = now() - interval '1 second' WHERE event_id = $1",
    [eventId],
  );
}

// Segundos que faltan para el próximo reintento, medidos con el reloj de la base (el mismo que usa el relay)
export async function secondsUntilRetry(eventId?: string): Promise<number> {
  const [row] = await query<{ secs: number }>(
    `SELECT extract(epoch FROM (next_attempt_at - now()))::float AS secs
     FROM messaging.deliveries WHERE ($1::uuid IS NULL OR event_id = $1::uuid) ORDER BY event_id LIMIT 1`,
    [eventId ?? null],
  );
  return row.secs;
}
