import { existsSync, readdirSync } from 'node:fs';

const BASE = 'src/contexts/inventory';
const list = (dir: string) =>
  existsSync(`${BASE}/${dir}`)
    ? readdirSync(`${BASE}/${dir}`, { withFileTypes: true })
    : [];
const files = (dir: string) =>
  list(dir)
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

// Inventario sigue la misma arquitectura que Ventas e Identidad (tarea 10.7)
describe('estructura de contexts/inventory', () => {
  it('infrastructure/ solo tiene las carpetas http, persistence y consumers, y ningún archivo suelto', () => {
    const folders = list('infrastructure')
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
    expect(folders).toEqual(['consumers', 'http', 'persistence']);
    expect(files('infrastructure')).toEqual([]);
  });

  it('http/ tiene el controlador y el DTO', () => {
    expect(files('infrastructure/http')).toEqual([
      'add-stock.dto.ts',
      'admin-stock.controller.ts',
    ]);
  });

  it('persistence/ tiene el repositorio de Prisma y el orden de bloqueo', () => {
    expect(files('infrastructure/persistence')).toEqual([
      'lock-order.ts',
      'prisma-stock.repository.ts',
    ]);
  });

  it('consumers/ tiene los dos consumidores db del Outbox', () => {
    expect(files('infrastructure/consumers')).toEqual([
      'confirm-reservation.consumer.ts',
      'create-stock-item.consumer.ts',
    ]);
  });

  it('los handlers viven en application/use-cases/stock y la purga en application/jobs (tarea 10.16)', () => {
    expect(files('application/use-cases/stock')).toEqual(
      expect.arrayContaining([
        'add-stock.handler.ts',
        'confirm-reservation.handler.ts',
        'create-stock-item.handler.ts',
        'release-stock.handler.ts',
        'reserve-stock.handler.ts',
      ]),
    );
    expect(files('application/jobs')).toEqual(['purge-reservations.job.ts']);
    expect(files('application')).toEqual([]);
  });

  it('ningún handler vive en infrastructure/', () => {
    const handlers = ['consumers', 'http', 'persistence'].flatMap((dir) =>
      files(`infrastructure/${dir}`).filter((f) => f.endsWith('.handler.ts')),
    );
    expect(handlers).toEqual([]);
  });

  it('domain/ tiene las reglas del stock y domain/ports/ el puerto', () => {
    expect(files('domain/stock')).toEqual(['stock-rules.ts']);
    expect(files('domain/ports')).toEqual(['stock.repository.ts']);
  });
});
