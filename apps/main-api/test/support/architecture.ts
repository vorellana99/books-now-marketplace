import { posix } from 'node:path';

// Reglas de dependencias entre capas. Ver docs/backend/01-decisiones-y-stack.md
//  - sales/domain:  solo decimal.js y node:*; puede usar shared-kernel, contracts y su propio domain
//  - contracts:     solo @nestjs/cqrs y node:*; puede usar shared-kernel y otros contracts
//  - shared-kernel: solo node:*; no depende de nada del proyecto
//  - un contexto no importa el código de otro: se hablan por contracts/

const DOMAIN_LIBRARIES = ['decimal.js'];
const CONTRACT_LIBRARIES = ['@nestjs/cqrs'];

/** Rutas importadas por un archivo, incluidos los imports de solo tipos, las re-exportaciones y los dinámicos. */
export function importsOf(source: string): string[] {
  const code = source
    .replaceAll(/\/\*[\s\S]*?\*\//g, '') // comentarios de bloque
    .replaceAll(/^\s*\/\/.*$/gm, '') // comentarios de línea completos
    .replaceAll(/\s\/\/.*$/gm, ''); // comentarios al final de una línea
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
