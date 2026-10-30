import { readFileSync, readdirSync } from 'node:fs';
import { checkRules, importsOf, zoneOf } from '../../support/architecture.js';

// Lee todos los .ts de src/ (menos el cliente generado por Prisma)
function readSources(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync('src', {
    recursive: true,
    encoding: 'utf8',
  })) {
    const path = `src/${entry.replaceAll('\\', '/')}`;
    if (path.endsWith('.ts') && !path.includes('/generated/')) {
      files[path] = readFileSync(path, 'utf8');
    }
  }
  return files;
}

describe('importsOf: qué importa un archivo', () => {
  it('lee imports normales y de solo tipos', () => {
    const src = `import { A } from './a.js';\nimport type { B } from '../b.js';`;
    expect(importsOf(src)).toEqual(['./a.js', '../b.js']);
  });

  it('lee imports de varias líneas, por defecto y con *', () => {
    const src = `import {\n  A,\n  B,\n} from './ab.js';\nimport C from 'c';\nimport * as D from 'd';`;
    expect(importsOf(src)).toEqual(['./ab.js', 'c', 'd']);
  });

  it('lee re-exportaciones, imports sin nombre e imports dinámicos', () => {
    const src = `export { A } from './a.js';\nexport * from './b.js';\nimport './efecto.js';\nconst m = await import('./c.js');`;
    expect(importsOf(src).sort()).toEqual(
      ['./a.js', './b.js', './c.js', './efecto.js'].sort(),
    );
  });

  it('ignora el texto de los comentarios y de las cadenas', () => {
    const src = `// import { X } from 'comentario';\n/*\n import { Y } from 'bloque';\n*/\nconst t = "import { Z } from 'cadena'";`;
    expect(importsOf(src)).toEqual([]);
  });
});

describe('zoneOf: dónde vive un archivo', () => {
  it.each([
    ['src/shared-kernel/isbn.vo.ts', 'shared-kernel'],
    ['src/contracts/sales/order-placed.event.ts', 'contracts'],
    ['src/platform/prisma/prisma.service.ts', 'platform'],
    ['src/contexts/sales/domain/order/order.aggregate.ts', 'sales/domain'],
    ['src/contexts/sales/application/order/x.ts', 'sales/application'],
    ['src/main.ts', 'other'],
  ])('%s → %s', (path, zone) => {
    expect(zoneOf(path)).toBe(zone);
  });
});

describe('checkRules: detecta las violaciones', () => {
  const violations = (path: string, source: string) =>
    checkRules({ [path]: source });

  const DOMAIN = 'src/contexts/sales/domain/order/x.ts';

  describe('domain/', () => {
    it.each([
      ['Nest', `import { Injectable } from '@nestjs/common';`],
      ['Prisma', `import { Prisma } from '@prisma/client';`],
      [
        'el cliente generado de Prisma',
        `import { Prisma } from '../../../../platform/prisma/generated/client.js';`,
      ],
      ['una librería no permitida', `import { z } from 'zod';`],
      ['rxjs', `import { Observable } from 'rxjs';`],
      [
        'platform/',
        `import { RequestContext } from '../../../../platform/observability/request-context.js';`,
      ],
      [
        'application/ del mismo contexto',
        `import { H } from '../../application/order/h.js';`,
      ],
      [
        'infrastructure/ del mismo contexto',
        `import { R } from '../../infrastructure/persistence/r.js';`,
      ],
      [
        'otro contexto',
        `import { Book } from '../../../catalog/domain/book.js';`,
      ],
    ])('no puede importar %s', (_que, source) => {
      expect(violations(DOMAIN, source)).toHaveLength(1);
    });

    it('también controla los imports de solo tipos', () => {
      expect(
        violations(DOMAIN, `import type { Injectable } from '@nestjs/common';`),
      ).toHaveLength(1);
    });

    it('puede importar decimal.js, node:*, shared-kernel, contracts y su propio domain', () => {
      const source = [
        `import { Decimal } from 'decimal.js';`,
        `import { randomUUID } from 'node:crypto';`,
        `import { Isbn } from '../../../../shared-kernel/isbn.vo.js';`,
        `import { OrderPlacedEvent } from '../../../../contracts/sales/order-placed.event.js';`,
        `import { Money } from '../shared/money.vo.js';`,
      ].join('\n');
      expect(violations(DOMAIN, source)).toEqual([]);
    });
  });

  describe('contracts/', () => {
    const CONTRACT = 'src/contracts/sales/order-placed.event.ts';

    it.each([
      [
        'contexts/',
        `import { Order } from '../../contexts/sales/domain/order/order.aggregate.js';`,
      ],
      ['platform/', `import { x } from '../../platform/config/env.schema.js';`],
      ['Prisma', `import { Prisma } from '@prisma/client';`],
      ['una librería no permitida', `import Decimal from 'decimal.js';`],
    ])('no puede importar %s', (_que, source) => {
      expect(violations(CONTRACT, source)).toHaveLength(1);
    });

    it('puede importar @nestjs/cqrs, shared-kernel y otros contracts', () => {
      const source = [
        `import { Command } from '@nestjs/cqrs';`,
        `import { DomainError } from '../../shared-kernel/domain.errors.js';`,
        `import { X } from '../inventory/stock.errors.js';`,
      ].join('\n');
      expect(violations(CONTRACT, source)).toEqual([]);
    });
  });

  describe('shared-kernel/', () => {
    const KERNEL = 'src/shared-kernel/x.ts';

    it.each([
      [
        'contracts/',
        `import { x } from '../contracts/sales/order-placed.event.js';`,
      ],
      [
        'contexts/',
        `import { x } from '../contexts/sales/domain/order/order.aggregate.js';`,
      ],
      ['Nest', `import { Injectable } from '@nestjs/common';`],
    ])('no puede importar %s', (_que, source) => {
      expect(violations(KERNEL, source)).toHaveLength(1);
    });

    it('puede importar su propio código y node:*', () => {
      expect(
        violations(
          KERNEL,
          `import { DomainError } from './domain.errors.js';\nimport { randomUUID } from 'node:crypto';`,
        ),
      ).toEqual([]);
    });
  });

  describe('contexts entre sí', () => {
    it('un contexto no importa el código de otro', () => {
      expect(
        violations(
          'src/contexts/sales/application/order/h.ts',
          `import { BookEntity } from '../../../catalog/domain/book.js';`,
        ),
      ).toHaveLength(1);
    });

    it('app.module y main.ts sí pueden importar los módulos de cada contexto', () => {
      expect(
        violations(
          'src/app.module.ts',
          `import { SalesModule } from './contexts/sales/sales.module.js';`,
        ),
      ).toEqual([]);
      expect(
        violations(
          'src/main.ts',
          `import { CatalogModule } from './contexts/catalog/catalog.module.js';`,
        ),
      ).toEqual([]);
    });

    it('un archivo en la raíz de un contexto tampoco importa a otro contexto', () => {
      expect(
        violations(
          'src/contexts/sales/sales.module.ts',
          `import { CatalogModule } from '../catalog/catalog.module.js';`,
        ),
      ).toHaveLength(1);
    });

    it.each([
      ['@prisma/client', `import { Prisma } from '@prisma/client';`],
      [
        'el adaptador de Prisma',
        `import { PrismaPg } from '@prisma/adapter-pg';`,
      ],
      [
        'PrismaService',
        `import { PrismaService } from '../../../../platform/prisma/prisma.service.js';`,
      ],
      [
        'el cliente generado de Prisma',
        `import { Prisma } from '../../../../platform/prisma/generated/client.js';`,
      ],
    ])(
      'application/ no puede importar %s (la transacción va en infrastructure/)',
      (_que, source) => {
        expect(
          violations('src/contexts/sales/application/order/h.ts', source),
        ).toHaveLength(1);
      },
    );

    it('application/ no puede importar infrastructure/ (las dependencias van hacia adentro)', () => {
      expect(
        violations(
          'src/contexts/sales/application/order/h.ts',
          `import { PrismaOrderRepository } from '../../infrastructure/persistence/prisma-order.repository.js';`,
        ),
      ).toHaveLength(1);
    });

    it('domain/ y application/ tampoco pueden importar PrismaService desde platform/', () => {
      for (const layer of ['domain', 'application']) {
        expect(
          violations(
            `src/contexts/sales/${layer}/x.ts`,
            `import { PrismaService } from '../../../platform/prisma/prisma.service.js';`,
          ),
        ).toHaveLength(1);
      }
    });

    it('infrastructure/ sí puede importar application/ y domain/ (para implementar puertos y enviar comandos)', () => {
      expect(
        violations(
          'src/contexts/sales/infrastructure/persistence/c.ts',
          `import { C } from '../../application/customer/create-customer.command.js';\nimport { P } from '../../domain/ports/order.repository.js';`,
        ),
      ).toEqual([]);
    });

    describe('interface/ (quien llama al contexto, tarea 10.18)', () => {
      const CONTROLLER =
        'src/contexts/sales/interface/http/order.controller.ts';
      const CONSUMER = 'src/contexts/sales/interface/consumers/c.consumer.ts';

      it('puede importar application/, domain/, shared-kernel/, contracts/ y platform/', () => {
        const source = [
          `import { Controller } from '@nestjs/common';`,
          `import { QueryBus } from '@nestjs/cqrs';`,
          `import { PlaceOrderCommand } from '../../application/use-cases/order/place-order.command.js';`,
          `import { Money } from '../../domain/shared/money.vo.js';`,
          `import { DomainError } from '../../../../shared-kernel/domain.errors.js';`,
          `import { OrderPlacedEvent } from '../../../../contracts/sales/order-placed.event.js';`,
          `import { Roles } from '../../../../platform/auth/roles.decorator.js';`,
        ].join('\n');
        expect(violations(CONTROLLER, source)).toEqual([]);
      });

      it('no puede importar infrastructure/ de su contexto (se pide a un puerto)', () => {
        const found = violations(
          CONTROLLER,
          `import { PrismaOrderRepository } from '../../infrastructure/persistence/prisma-order.repository.js';`,
        );
        expect(found).toHaveLength(1);
        expect(found[0]).toMatch(/interface/);
      });

      it.each([
        ['@prisma/client', `import { Prisma } from '@prisma/client';`],
        [
          'PrismaService',
          `import { PrismaService } from '../../../../platform/prisma/prisma.service.js';`,
        ],
        [
          'el cliente generado de Prisma',
          `import { Prisma } from '../../../../platform/prisma/generated/client.js';`,
        ],
      ])('no puede importar %s', (_que, source) => {
        expect(violations(CONSUMER, source)).toHaveLength(1);
      });

      it('el consumidor sí puede usar el ayudante de la transacción (platform/prisma/transaction-handle)', () => {
        expect(
          violations(
            CONSUMER,
            `import { toTransactionHandle } from '../../../../platform/prisma/transaction-handle.js';`,
          ),
        ).toEqual([]);
      });

      it.each(['domain', 'application'])(
        '%s/ no puede importar interface/',
        (layer) => {
          const found = violations(
            `src/contexts/sales/${layer}/x.ts`,
            `import { OrderController } from '../interface/http/order.controller.js';`,
          );
          expect(found).toHaveLength(1);
        },
      );

      it('otro contexto tampoco: se hablan por contracts/', () => {
        expect(
          violations(
            CONTROLLER,
            `import { BookController } from '../../../catalog/interface/http/book.controller.js';`,
          ),
        ).toHaveLength(1);
      });
    });

    it('infrastructure/ sí puede usar Prisma', () => {
      expect(
        violations(
          'src/contexts/inventory/infrastructure/stock/h.ts',
          `import { PrismaService } from '../../../../platform/prisma/prisma.service.js';\nimport { Prisma } from '../../../../platform/prisma/generated/client.js';`,
        ),
      ).toEqual([]);
    });

    it('application/ sí puede usar Nest y su propio domain', () => {
      expect(
        violations(
          'src/contexts/sales/application/order/h.ts',
          `import { CommandHandler } from '@nestjs/cqrs';\nimport { Order } from '../../domain/order/order.aggregate.js';`,
        ),
      ).toEqual([]);
    });
  });

  it('el mensaje dice qué archivo rompe qué regla', () => {
    const [message] = violations(
      DOMAIN,
      `import { Injectable } from '@nestjs/common';`,
    );
    expect(message).toContain(DOMAIN);
    expect(message).toContain('@nestjs/common');
  });
});

describe('el código real de src/ cumple las reglas de dependencias', () => {
  const sources = readSources();

  it('lee código de cada zona protegida (la prueba no pasa en vacío)', () => {
    const zones = new Set(Object.keys(sources).map(zoneOf));
    expect(zones).toContain('shared-kernel');
    expect(zones).toContain('contracts');
    expect(zones).toContain('sales/domain');
  });

  it('sales/domain no usa Nest ni Prisma; contracts no importa contexts/', () => {
    expect(checkRules(sources)).toEqual([]);
  });
});
