import { readFileSync } from 'node:fs';
import { BATCH, LEASE_MS } from '../../../src/platform/outbox/outbox.relay.js';

const read = (path: string) => readFileSync(path, 'utf8');
const piezas = read('../../docs/backend/05-piezas-clave.md');
const claude = read('../../CLAUDE.md');
const relaySource = read('src/platform/outbox/outbox.relay.ts');

const read2 = (path: string) => readFileSync(path, 'utf8');
const decisiones = read2('../../docs/backend/01-decisiones-y-stack.md');
const estructura = read2(
  '../../docs/backend/02-estructura-y-puesta-en-marcha.md',
);
const tests = read2('../../docs/backend/06-tests.md');
const skills = ['nuevo-evento', 'nueva-ruta', 'nueva-migracion', 'tarea'].map(
  (name) => read2(`../../.claude/skills/${name}/SKILL.md`),
);

// Tarea 10.14: los cuatro contextos tienen la misma arquitectura y los documentos no dicen lo contrario
describe('una sola arquitectura (documentada)', () => {
  const section = piezas.slice(
    piezas.indexOf('### Convención por contexto'),
    piezas.indexOf('### Límites conocidos'),
  );

  it('05-piezas-clave describe una sola arquitectura para los cuatro contextos', () => {
    expect(piezas).toMatch(/### Convención por contexto/);
    for (const context of ['Ventas', 'Catálogo', 'Inventario', 'Identidad']) {
      expect(section, context).toContain(context);
    }
    expect(section).toMatch(/una sola arquitectura/i);
    expect(section).toMatch(/hexagonal/i);
  });

  it('nombra las carpetas de cada capa y dónde va cada pieza', () => {
    for (const part of [
      'domain/ports/',
      'application/',
      'infrastructure/http/',
      'infrastructure/persistence/',
      'infrastructure/adapters/',
      'infrastructure/consumers/',
    ]) {
      expect(section, part).toContain(part);
    }
  });

  it('dice qué tests la hacen cumplir', () => {
    expect(section).toContain('dependency-rules.spec.ts');
    expect(section).toContain('structure-rules.spec.ts');
  });

  it('ya no hay excepciones: desaparece «CQRS directo» y «Sin domain/»', () => {
    expect(section).not.toMatch(/CQRS directo/);
    expect(section).not.toMatch(/Sin `domain\/`/);
  });

  it('CLAUDE.md la resume y enlaza a la sección', () => {
    expect(claude).toMatch(/Convención por contexto/);
    expect(claude).toContain('05-piezas-clave.md#convención-por-contexto');
    expect(claude).toMatch(/una sola arquitectura/i);
    expect(claude).toContain('structure-rules.spec.ts');
  });

  it('ningún documento ni comando de Claude dice lo contrario', () => {
    const everything = [
      piezas,
      claude,
      decisiones,
      estructura,
      tests,
      ...skills,
    ];
    for (const text of everything) {
      expect(text).not.toMatch(/CQRS directo/);
      expect(text).not.toMatch(/Inventario sin repositorio/);
      expect(text).not.toMatch(/hexagonal completa/);
    }
  });

  it('01 y 02 dicen que application/ no usa Prisma ni infrastructure/, y que los consumidores van en consumers/', () => {
    expect(decisiones).toContain('structure-rules.spec.ts');
    expect(decisiones).toMatch(/`application\/`[^\n]*no[^\n]*Prisma/);
    expect(estructura).toContain('infrastructure/consumers/');
    expect(estructura).not.toMatch(/Consumidores que escriben en BD van en/);
  });

  it('/nuevo-evento manda el consumidor a infrastructure/consumers/', () => {
    const nuevoEvento = skills[0];
    expect(nuevoEvento).toContain('infrastructure/consumers/');
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
