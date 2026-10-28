import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { query } from '../support/database.js';

// La migración que agrega la dirección se aplica sobre una base que YA tiene pedidos: así se comprueba que no los
// rompe (decisión D1: las columnas admiten nulo y los pedidos viejos quedan sin dirección)
const MIGRATIONS = join(process.cwd(), 'prisma', 'migrations');
const DATABASE = 'migration_shipping_check';

const migrationDirs = () =>
  readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
const sqlOf = (dir: string) =>
  readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8');

describe('migración de la dirección de envío (sobre una base con pedidos)', () => {
  let client: Client;
  const customerId = randomUUID();
  const oldOrderId = randomUUID();

  beforeAll(async () => {
    await query(`DROP DATABASE IF EXISTS ${DATABASE}`);
    await query(`CREATE DATABASE ${DATABASE}`);
    client = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: DATABASE,
    });
    await client.connect();

    const [init, ...later] = migrationDirs();
    await client.query(sqlOf(init));
    // Un pedido de antes de la dirección
    await client.query(
      'INSERT INTO sales.customers (id, email, premium) VALUES ($1, $2, false)',
      [customerId, 'antiguo@example.com'],
    );
    await client.query(
      `INSERT INTO sales.orders (id, customer_id, status, charged_amount, currency)
       VALUES ($1, $2, 'PLACED', 90.00, 'PEN')`,
      [oldOrderId, customerId],
    );
    await client.query(
      `INSERT INTO sales.order_lines (order_id, isbn, title, unit_price, currency, quantity)
       VALUES ($1, '9780306406157', 'Clean Code', 45, 'PEN', 2)`,
      [oldOrderId],
    );
    for (const dir of later) await client.query(sqlOf(dir));
  });
  afterAll(async () => {
    await client.end();
    await query(`DROP DATABASE IF EXISTS ${DATABASE}`);
  });

  const insertOrder = (columns: Record<string, string | null>) => {
    const names = Object.keys(columns);
    const extraNames = names.map((n) => `, ${n}`).join('');
    const extraValues = names.map((_, i) => `, $${i + 3}`).join('');
    return client.query(
      `INSERT INTO sales.orders (id, customer_id, status, charged_amount, currency${extraNames})
       VALUES ($1, $2, 'PLACED', 10.00, 'PEN'${extraValues})`,
      [randomUUID(), customerId, ...Object.values(columns)],
    );
  };
  const full = {
    ship_recipient: 'Ana',
    ship_phone: '999888777',
    ship_line1: 'Av. Larco 123',
    ship_district: 'Miraflores',
    ship_province: 'Lima',
    ship_department: 'Lima',
  };

  it('el pedido de antes sigue ahí, con sus líneas, y sin dirección', async () => {
    const { rows } = await client.query(
      `SELECT o.charged_amount::text AS charged, o.ship_recipient, o.ship_phone, o.ship_line1,
              o.ship_district, o.ship_province, o.ship_department, o.ship_reference,
              (SELECT count(*) FROM sales.order_lines l WHERE l.order_id = o.id)::int AS lines
       FROM sales.orders o WHERE o.id = $1`,
      [oldOrderId],
    );
    expect(rows[0]).toEqual({
      charged: '90.00',
      ship_recipient: null,
      ship_phone: null,
      ship_line1: null,
      ship_district: null,
      ship_province: null,
      ship_department: null,
      ship_reference: null,
      lines: 1,
    });
  });

  it('un pedido nuevo con los siete campos entra', async () => {
    await expect(
      insertOrder({ ...full, ship_reference: 'frente al parque' }),
    ).resolves.toBeDefined();
  });

  it('la referencia es opcional', async () => {
    await expect(
      insertOrder({ ...full, ship_reference: null }),
    ).resolves.toBeDefined();
  });

  it('un pedido sin ninguna columna de dirección también entra (los de antes)', async () => {
    await expect(insertOrder({})).resolves.toBeDefined();
  });

  it.each(Object.keys(full))(
    'una dirección a medias (%s en NULL y el resto no) la rechaza la base',
    async (column) => {
      await expect(insertOrder({ ...full, [column]: null })).rejects.toThrow(
        /check/i,
      );
    },
  );

  it('una referencia sola, sin dirección, tampoco es una dirección: la rechaza la base', async () => {
    await expect(
      insertOrder({ ship_reference: 'solo la referencia' }),
    ).rejects.toThrow(/check/i);
  });

  it.each([
    ['ship_recipient', 101],
    ['ship_phone', 21],
    ['ship_line1', 201],
    ['ship_district', 61],
    ['ship_province', 61],
    ['ship_department', 61],
  ])(
    '%s no admite más de su largo máximo (%i es demasiado)',
    async (column, length) => {
      await expect(
        insertOrder({ ...full, [column]: 'x'.repeat(length) }),
      ).rejects.toThrow(/too long|value too long/i);
    },
  );

  it('la referencia no admite más de 200 caracteres', async () => {
    await expect(
      insertOrder({ ...full, ship_reference: 'x'.repeat(201) }),
    ).rejects.toThrow(/too long/i);
  });
});
