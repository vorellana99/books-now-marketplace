import { posix } from 'node:path';

// Reglas de dependencias entre capas. Ver docs/backend/01-decisiones-y-stack.md
//  - sales/domain:  solo decimal.js y node:*; puede usar shared-kernel, contracts y su propio domain
//  - contracts:     solo @nestjs/cqrs y node:*; puede usar shared-kernel y otros contracts
//  - shared-kernel: solo node:*; no depende de nada del proyecto
//  - application/: puede usar Nest, pero no Prisma ni infrastructure/ (las dependencias van hacia adentro); lo que
//    necesita de la base lo pide a un puerto de domain/ports/
//  - un contexto no importa el código de otro: se hablan por contracts/
// y las de estructura (`checkStructure`): los cuatro contextos tienen la misma forma, sin excepciones

const DOMAIN_LIBRARIES = ['decimal.js'];
const CONTRACT_LIBRARIES = ['@nestjs/cqrs'];

function stripComments(source: string): string {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//g, '') // comentarios de bloque
    .replaceAll(/^\s*\/\/.*$/gm, '') // comentarios de línea completos
    .replaceAll(/\s\/\/.*$/gm, ''); // comentarios al final de una línea
}

/** Rutas importadas por un archivo, incluidos los imports de solo tipos, las re-exportaciones y los dinámicos. */
export function importsOf(source: string): string[] {
  const code = stripComments(source);
  const specifiers: string[] = [];
  const statics =
    /^\s*(?:import|export)\b(?:[^;'"`]*?\bfrom)?\s*['"]([^'"]+)['"]/gm;
  for (const m of code.matchAll(statics)) specifiers.push(m[1]);
  const dynamics = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of code.matchAll(dynamics)) specifiers.push(m[1]);
  return specifiers;
}

/** 'shared-kernel', 'contracts', 'platform', '<contexto>/<capa>' (por ejemplo 'sales/domain') u 'other'. */
export function zoneOf(path: string): string {
  if (path.startsWith('src/shared-kernel/')) return 'shared-kernel';
  if (path.startsWith('src/contracts/')) return 'contracts';
  if (path.startsWith('src/platform/')) return 'platform';
  const layer = /^src\/contexts\/([^/]+)\/([^/]+)\//.exec(path);
  if (layer) return `${layer[1]}/${layer[2]}`;
  const root = /^src\/contexts\/([^/]+)\//.exec(path);
  return root ? `${root[1]}/root` : 'other';
}

const isBare = (spec: string) => !spec.startsWith('.');
const isNode = (spec: string) => spec.startsWith('node:');

/** Violaciones de las reglas en un conjunto de archivos (ruta → código). Vacío si todo está bien. */
export function checkRules(files: Record<string, string>): string[] {
  const violations: string[] = [];

  for (const [file, source] of Object.entries(files)) {
    const zone = zoneOf(file);
    const [context, layer] = zone.split('/');

    for (const spec of importsOf(source)) {
      const reason = reasonToReject(file, zone, context, layer, spec);
      if (reason) violations.push(`${file}: importa '${spec}': ${reason}`);
    }
  }
  return violations;
}

function reasonToReject(
  file: string,
  zone: string,
  context: string,
  layer: string | undefined,
  spec: string,
): string | undefined {
  if (isBare(spec)) {
    if (
      layer === 'application' &&
      (spec === 'prisma' || spec.startsWith('@prisma/'))
    ) {
      return 'application no puede usar Prisma; ponlo en infrastructure/';
    }
    if (
      layer === 'domain' &&
      !isNode(spec) &&
      !DOMAIN_LIBRARIES.includes(spec)
    ) {
      return 'domain solo puede usar decimal.js y node:*';
    }
    if (
      zone === 'contracts' &&
      !isNode(spec) &&
      !CONTRACT_LIBRARIES.includes(spec)
    ) {
      return 'contracts solo puede usar @nestjs/cqrs y node:*';
    }
    if (zone === 'shared-kernel' && !isNode(spec)) {
      return 'shared-kernel solo puede usar node:*';
    }
    return undefined;
  }

  const target = posix.normalize(posix.join(posix.dirname(file), spec));
  const targetZone = zoneOf(target);

  if (layer === 'application' && target.startsWith('src/platform/prisma/')) {
    return 'application no puede usar Prisma; ponlo en infrastructure/';
  }

  // Hexagonal: lo de afuera depende de lo de adentro, nunca al revés
  if (layer === 'application' && targetZone === `${context}/infrastructure`) {
    return 'application no puede importar infrastructure/; pide lo que necesita a un puerto de domain/ports/';
  }

  if (layer === 'domain') {
    const allowed = ['shared-kernel', 'contracts', `${context}/domain`];
    return allowed.includes(targetZone)
      ? undefined
      : `domain solo puede importar shared-kernel, contracts y su propio domain (no ${targetZone})`;
  }
  if (zone === 'contracts') {
    return ['shared-kernel', 'contracts'].includes(targetZone)
      ? undefined
      : `contracts solo puede importar shared-kernel y otros contracts (no ${targetZone})`;
  }
  if (zone === 'shared-kernel') {
    return targetZone === 'shared-kernel'
      ? undefined
      : `shared-kernel no depende de nada del proyecto (no ${targetZone})`;
  }

  // Cualquier capa de un contexto: el código de otro contexto se alcanza solo por contracts/
  const [targetContext] = targetZone.split('/');
  const isOtherContext =
    targetZone.includes('/') &&
    !['shared-kernel', 'contracts', 'platform'].includes(targetZone);
  // Solo rige para archivos que viven dentro de un contexto; app.module y main.ts los ensamblan
  if (layer && isOtherContext && targetContext !== context) {
    return 'un contexto no importa el código de otro; usa contracts/';
  }
  return undefined;
}

const INFRASTRUCTURE_FOLDERS = ['http', 'persistence', 'adapters', 'consumers'];
const LAYERS = ['domain', 'application', 'infrastructure'];
const APPLICATION_FOLDERS = ['use-cases', 'services', 'jobs', 'support'];
const DOMAIN_FOLDERS = ['model', 'ports', 'shared'];
const RUNTIME_EXPORT =
  /^\s*export\s+(?:async\s+)?(?:function|const|let|enum|class)\b/m;

/** Violaciones de la estructura de carpetas de los contextos (ruta → código). Vacío si todo está bien. */
export function checkStructure(files: Record<string, string>): string[] {
  const violations: string[] = [];
  const byContext = new Map<string, string[]>();
  for (const file of Object.keys(files)) {
    const m = /^src\/contexts\/([^/]+)\//.exec(file);
    if (m) byContext.set(m[1], [...(byContext.get(m[1]) ?? []), file]);
  }

  for (const [context, paths] of byContext) {
    const root = `src/contexts/${context}/`;
    const moduleFile = `${root}${context}.module.ts`;
    if (!paths.includes(moduleFile)) {
      violations.push(`${root}: falta ${context}.module.ts`);
    }
    if (!paths.some((p) => p.startsWith(`${root}domain/ports/`))) {
      violations.push(
        `${root}domain/: falta la carpeta ports/ con los puertos`,
      );
    }
    if (!paths.some((p) => p.startsWith(`${root}domain/model/`))) {
      violations.push(
        `${root}domain/: falta la carpeta model/ con los agregados y las reglas`,
      );
    }

    for (const path of paths) {
      const rel = path.slice(root.length);
      const [first, second] = rel.split('/');
      const code = stripComments(files[path]);

      if (rel.includes('/') ? !LAYERS.includes(first) : path !== moduleFile) {
        violations.push(
          `${path}: la raíz de un contexto solo tiene domain/, application/, infrastructure/ y su módulo`,
        );
        continue;
      }

      if (first === 'domain') {
        const inside = rel.slice('domain/'.length);
        const top = inside.split('/')[0];
        if (!inside.includes('/')) {
          violations.push(
            `${path}: domain/ no admite archivos sueltos; va en ${DOMAIN_FOLDERS.join(', ')}`,
          );
        } else if (!DOMAIN_FOLDERS.includes(top)) {
          violations.push(
            `${path}: domain/ solo se divide en ${DOMAIN_FOLDERS.join(', ')} (no ${top}/); los nombres del negocio van dentro de model/`,
          );
        } else if (top === 'model' && !/^model\/[^/]+\/[^/]+$/.test(inside)) {
          violations.push(
            `${path}: model/ no admite archivos sueltos ni subcarpetas dentro de la carpeta de un agregado: model/<agregado>/<archivo>`,
          );
        } else if (top === 'ports' && !/\.(repository|port)\.ts$/.test(path)) {
          violations.push(
            `${path}: un puerto de domain/ports/ termina en .repository.ts o .port.ts`,
          );
        }
      }

      if (first === 'application') {
        const inside = rel.slice('application/'.length);
        if (!inside.includes('/')) {
          violations.push(
            `${path}: application/ no admite archivos sueltos; va en ${APPLICATION_FOLDERS.join(', ')}`,
          );
        } else if (!APPLICATION_FOLDERS.includes(inside.split('/')[0])) {
          violations.push(
            `${path}: application/ solo se divide en ${APPLICATION_FOLDERS.join(', ')} (no ${inside.split('/')[0]}/)`,
          );
        }
        if (isPureDomain(path, rel, code, files[path])) {
          violations.push(
            `${path}: es lógica pura (sin Nest, sin platform/ y sin puertos): va en domain/. Solo application/support/ admite un archivo así`,
          );
        }
      }

      if (
        /\.(command|query|handler)\.ts$/.test(path) &&
        !/^application\/use-cases\/[^/]+\/[^/]+$/.test(rel)
      ) {
        violations.push(
          `${path}: los comandos, las consultas y los handlers viven en application/use-cases/<agregado>/`,
        );
      }

      if (first === 'infrastructure') {
        if (!rel.slice('infrastructure/'.length).includes('/')) {
          violations.push(
            `${path}: infrastructure/ no admite archivos sueltos; va en http/, persistence/, adapters/ o consumers/`,
          );
        } else if (!INFRASTRUCTURE_FOLDERS.includes(second)) {
          violations.push(
            `${path}: infrastructure/ solo se divide en ${INFRASTRUCTURE_FOLDERS.join(', ')} (no ${second}/)`,
          );
        }
      }

      if (
        first !== 'application' &&
        /^\s*@(Command|Query)Handler\(/m.test(code)
      ) {
        violations.push(
          `${path}: los handlers de CQRS (@CommandHandler, @QueryHandler) viven en application/`,
        );
      }
      if (
        !path.includes('/infrastructure/consumers/') &&
        /^\s*@OutboxHandler\(/m.test(code)
      ) {
        violations.push(
          `${path}: los consumidores del Outbox (@OutboxHandler) viven en infrastructure/consumers/`,
        );
      }
      if (
        path.endsWith('.controller.ts') &&
        !path.includes('/infrastructure/http/')
      ) {
        violations.push(
          `${path}: los controladores viven en infrastructure/http/`,
        );
      }
      if (path.endsWith('.job.ts') && !/^application\/jobs\/[^/]+$/.test(rel)) {
        violations.push(`${path}: los jobs viven en application/jobs/`);
      }
      if (
        (first === 'application' || first === 'infrastructure') &&
        /\babstract\s+class\b/.test(code)
      ) {
        violations.push(
          `${path}: una clase abstracta es un puerto y vive en domain/ports/`,
        );
      }
      if (
        /\bclass\s+Prisma[A-Z]\w*/.test(code) &&
        !path.includes('/infrastructure/persistence/')
      ) {
        violations.push(
          `${path}: las clases Prisma* (adaptadores de la base) viven en infrastructure/persistence/`,
        );
      }

      const inPorts = path.startsWith(`${root}domain/ports/`);
      if (
        first === 'domain' &&
        !inPorts &&
        /\.(port|repository)\.ts$/.test(path)
      ) {
        violations.push(`${path}: los puertos viven en domain/ports/`);
      }
      if (inPorts && !/\babstract\s+class\b/.test(code)) {
        violations.push(
          `${path}: un archivo de domain/ports/ declara un puerto (clase abstracta)`,
        );
      }
    }
  }
  return violations;
}

// Un archivo de application/ que no es un comando, una consulta, un handler ni un job, que declara código que se ejecuta
// y no usa Nest, platform/ ni ningún puerto, no orquesta nada: es lógica del dominio. Un archivo de solo tipos (un DTO o
// un alias) no cuenta. application/support/ guarda lo que es formato de la API y no una regla (el cursor de paginación)
function isPureDomain(
  path: string,
  rel: string,
  code: string,
  source: string,
): boolean {
  if (/\.(command|query|handler|job)\.ts$/.test(path)) return false;
  if (rel.startsWith('application/support/')) return false;
  if (!RUNTIME_EXPORT.test(code)) return false;
  return !importsOf(source).some(
    (spec) =>
      spec.startsWith('@nestjs/') ||
      spec.includes('/platform/') ||
      spec.includes('domain/ports/'),
  );
}
