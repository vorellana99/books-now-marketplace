"""Pruebas de mutación a mano: se rompe el código a propósito y se comprueba que las pruebas lo detectan.

Se usa desde un script de la tarea (fuera del repositorio, p. ej. en un directorio temporal):

    import sys; sys.path.insert(0, '<raíz del repo>/scripts')
    from mutate import mutate, report
    SRC = 'src/contexts/identity/infrastructure/login.handler.ts'
    mutate('L1 sin comprobar la contraseña', SRC, [('if (!user || !valid)', 'if (!user)')],
           ['test/integration/login.handler.spec.ts'])
    report()   # resumen al final: detectadas, supervivientes y no aplicadas

Las rutas son relativas a apps/main-api (el script cambia a esa carpeta). Cada mutación restaura SIEMPRE el archivo.

Veredictos:
  DETECTADA      alguna prueba falló: el cambio se notó.
  SOBREVIVIÓ     todas pasaron: falta una prueba, o el cambio es equivalente (documentarlo).
  NO COMPILA     no hubo resumen de pruebas, o todas se omitieron (un arranque roto): cuenta como detectada, pero conviene
                 una mutación mejor que no rompa el arranque.
  NO APLICADA    el ancla no está o no es única (Prettier reformula el código: copie el texto ya formateado).
"""
import os
import re
import subprocess

APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'apps', 'main-api')
E2E = './vitest.config.e2e.ts'
_results = []


def config_for(args):
    """Los unitarios corren con la configuración por defecto; integración y e2e, con la de e2e. Mezclarlas es un error:
    una mutación lanzada con la configuración equivocada no incluye sus pruebas y parece sobrevivir."""
    unit = [a for a in args if a.startswith('test/unit/')]
    other = [a for a in args if not a.startswith('test/unit/')]
    if unit and other:
        raise ValueError('Mezcla pruebas unitarias con integración/e2e: lance una mutación para cada configuración')
    return None if unit else E2E


def vitest(args, config='auto'):
    cfg = config_for(args) if config == 'auto' else config
    cmd = ['pnpm', 'exec', 'vitest', 'run'] + (['--config', cfg] if cfg else []) + list(args)
    out = subprocess.run(cmd, capture_output=True, text=True, cwd=APP).stdout
    m = re.search(r'Tests\s+(.*)', out)
    return m.group(1).strip() if m else 'sin resumen'


def verdict(summary):
    if 'failed' in summary:
        return 'DETECTADA'
    if summary == 'sin resumen' or re.fullmatch(r'\d+ skipped \(\d+\)', summary) or 'passed' not in summary:
        return 'NO COMPILA'
    return 'SOBREVIVIÓ'


def mutate(name, path, pairs, args, config='auto'):
    """Aplica `pairs` (lista de (original, mutado), cada original debe ser único en el archivo), corre `args` y restaura."""
    full = os.path.join(APP, path)
    with open(full) as f:
        orig = f.read()
    mutated = orig
    for before, after in pairs:
        n = mutated.count(before)
        if n != 1:
            print(f'### {name}: NO APLICADA (el ancla aparece {n} veces) -> {before[:70]!r}')
            _results.append((name, 'NO APLICADA'))
            return 'NO APLICADA'
        mutated = mutated.replace(before, after)
    try:
        with open(full, 'w') as f:
            f.write(mutated)
        summary = vitest(args, config)
    finally:
        with open(full, 'w') as f:
            f.write(orig)
    result = verdict(summary)
    flag = {'DETECTADA': '', 'SOBREVIVIÓ': '   <-- SOBREVIVIÓ: ¿falta una prueba o es equivalente?',
            'NO COMPILA': '   <-- sin pruebas útiles: ¿rompe el arranque?'}[result]
    print(f'### {name}: {result} ({summary}){flag}', flush=True)
    _results.append((name, result))
    return result


def report():
    counts = {}
    for _, r in _results:
        counts[r] = counts.get(r, 0) + 1
    print(f'=== {len(_results)} mutaciones: ' + ', '.join(f'{v} {k}' for k, v in sorted(counts.items())))
    for name, r in _results:
        if r != 'DETECTADA':
            print(f'    {r}: {name}')
