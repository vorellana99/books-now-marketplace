import { readFileSync } from 'node:fs';
import { BATCH, LEASE_MS } from '../../../src/platform/outbox/outbox.relay.js';

const read = (path: string) => readFileSync(path, 'utf8');
const piezas = read('../../docs/backend/05-piezas-clave.md');
const claude = read('../../CLAUDE.md');
const relaySource = read('src/platform/outbox/outbox.relay.ts');

// Tarea 9.14: lo que hace que cada contexto sea como es, y lo que no escala, escrito donde lo lee quien llega
describe('convenciones por contexto (documentadas)', () => {
  it('05-piezas-clave explica por qué Ventas es hexagonal y los demás contextos usan CQRS directo', () => {
    expect(piezas).toMatch(/### Convención por contexto/);
    const section = piezas.slice(piezas.indexOf('### Convención por contexto'));
    for (const context of ['Ventas', 'Catálogo', 'Inventario', 'Identidad']) {
      expect(section, context).toContain(context);
    }
    expect(section).toMatch(/hexagonal/i);
    expect(section).toMatch(/CQRS directo/);
  });

  it('CLAUDE.md lo resume y enlaza a la sección', () => {
    expect(claude).toMatch(/Convención por contexto/);
    expect(claude).toContain('05-piezas-clave.md#convención-por-contexto');
  });
});

describe('límites conocidos (documentados y ciertos)', () => {
  const limits = piezas.slice(piezas.indexOf('### Límites conocidos'));

  it('hay una sección de límites conocidos', () => {
    expect(piezas).toMatch(/### Límites conocidos/);
  });

  it('dice lo que el relay entrega por segundo y por qué BATCH y el bloqueo van juntos', () => {
    expect(limits).toMatch(/10 entregas por segundo por instancia/);
    expect(limits).toContain('BATCH × duración máxima por entrega');
    expect(limits).toContain('LEASE_MS');
  });

  it('reconoce que el relay no impone un tiempo máximo por entrega', () => {
    expect(limits).toMatch(/no impone un tiempo máximo por entrega/);
  });

  it('los números citados son los del código: lote de 10, una vuelta por segundo, bloqueo de 2 minutos', () => {
    expect(BATCH).toBe(10);
    expect(LEASE_MS).toBe(2 * 60_000);
    expect(relaySource).toContain('@Interval(1000)');
  });

  it('con el máximo supuesto de 10 s por entrega, un lote cabe en el bloqueo (la suposición del comentario del relay)', () => {
    const ASSUMED_MAX_DELIVERY_MS = 10_000;
    expect(BATCH * ASSUMED_MAX_DELIVERY_MS).toBeLessThan(LEASE_MS);
  });

  it('recoge los plazos de retención y lo que nunca se purga', () => {
    for (const name of [
      'RETENTION_OUTBOX_DAYS',
      'RETENTION_CHECKOUT_DAYS',
      'RETENTION_RESERVATION_DAYS',
      'RETENTION_REFRESH_TOKEN_DAYS',
    ]) {
      expect(limits, name).toContain(name);
    }
    expect(limits).toMatch(/nunca se purga/i);
  });

  it('recoge lo que sigue abierto: límites en memoria y cotización sin límite propio', () => {
    expect(limits).toMatch(/en memoria de cada instancia/);
    expect(limits).toMatch(/cotización/i);
  });
});
