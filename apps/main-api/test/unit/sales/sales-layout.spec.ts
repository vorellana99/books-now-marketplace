import { existsSync, readdirSync } from 'node:fs';

const BASE = 'src/contexts/sales/infrastructure';
const files = (dir: string): string[] => {
  try {
    return readdirSync(`${BASE}/${dir}`, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
};

// La infraestructura de Ventas tiene cuatro carpetas por lo que hace cada pieza (tarea 9.8). Sin esto, `order/` llegó a
// mezclar 17 archivos de cuatro clases distintas
describe('estructura de sales/infrastructure', () => {
  it('solo tiene las carpetas http, persistence, adapters y consumers', () => {
    const folders = readdirSync(BASE, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(folders).toEqual(['adapters', 'consumers', 'http', 'persistence']);
  });

  it('http/ tiene controladores, DTO y respuestas, y nada más', () => {
    const names = files('http');
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name, name).toMatch(/\.(controller|dto|response)\.ts$/);
    }
    expect(names).toEqual(
      expect.arrayContaining([
        'order.controller.ts',
        'my-orders.controller.ts',
        'admin-order.controller.ts',
        'place-order.dto.ts',
        'quote-order.dto.ts',
        'order.response.ts',
      ]),
    );
  });

  it('persistence/ tiene lo que lee o escribe en la base de Ventas', () => {
    expect(files('persistence')).toEqual(
      [
        'get-order.handler.ts',
        'list-customer-orders.handler.ts',
        'order-cursor.ts',
        'order-view.ts',
        'order.mapper.ts',
        'prisma-checkout-log.adapter.ts',
        'prisma-customer.repository.ts',
        'prisma-order.repository.ts',
      ].sort(),
    );
  });

  it('adapters/ tiene los puertos de salida: catálogo, inventario, correo y pasarelas de pago', () => {
    expect(files('adapters')).toEqual(
      [
        'catalog-in-process.adapter.ts',
        'console-notifier.adapter.ts',
        'external-payment.adapter.ts',
        'inventory-in-process.adapter.ts',
        'simulated-payment-gateway.adapter.ts',
      ].sort(),
    );
  });

  it('consumers/ tiene los consumidores del Outbox que necesitan la transacción (los externos viven en application/)', () => {
    expect(files('consumers')).toEqual(['create-customer.consumer.ts']);
  });

  it('ninguna carpeta vieja sigue existiendo', () => {
    for (const old of ['order', 'customer', 'payment']) {
      expect(files(old), old).toEqual([]);
    }
  });
});

// Los puertos de Ventas viven donde los de los otros tres contextos: domain/ports/ (tarea 10.11)
describe('estructura de sales/domain', () => {
  const DOMAIN = 'src/contexts/sales/domain';
  const names = (dir: string) =>
    existsSync(`${DOMAIN}/${dir}`)
      ? readdirSync(`${DOMAIN}/${dir}`, { withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => e.name)
          .sort((a, b) => a.localeCompare(b))
      : [];

  it('domain/ports/ tiene los siete puertos', () => {
    expect(names('ports')).toEqual([
      'catalog-pricing.port.ts',
      'checkout-log.port.ts',
      'customer.repository.ts',
      'notifier.port.ts',
      'order.repository.ts',
      'payment-gateway.port.ts',
      'stock-reservation.port.ts',
    ]);
  });

  it('ningún puerto queda junto a su agregado ni en la carpeta de pagos', () => {
    for (const dir of ['order', 'customer', 'payment']) {
      const leftovers = names(dir).filter(
        (f) => f.endsWith('.port.ts') || f.endsWith('.repository.ts'),
      );
      expect(leftovers, dir).toEqual([]);
    }
    expect(names('payment')).toEqual([]);
  });
});
