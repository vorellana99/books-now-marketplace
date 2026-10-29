---
name: mutar
description: Probar que las pruebas de un cambio detectan errores, rompiendo el código a propósito (pruebas de mutación manuales con scripts/mutate.py). Úsalo tras implementar código crítico del backend: dominio, seguridad, dinero, concurrencia, restricciones de la base.
---

# Pruebas de mutación

Una prueba que pasa aunque el código esté roto no protege nada. Esto lo comprueba, mutación a mutación.

## Cómo

1. Piensa qué errores serían graves en ese código: quitar una comprobación, invertir una condición, cambiar un límite en uno, devolver un valor fijo, quitar un `WHERE`, cambiar un código de error.
2. Escribe un script **fuera del repositorio** (`$CLAUDE_JOB_DIR/tmp/…`):

```python
import sys; sys.path.insert(0, '/ruta/al/repo/scripts')
from mutate import mutate, report
SRC = 'src/contexts/identity/infrastructure/login.handler.ts'      # relativa a apps/main-api
T = ['test/integration/login.handler.spec.ts']
mutate('L1 contraseña no se comprueba', SRC, [('if (!user || !valid)', 'if (!user)')], T)
mutate('L2 usuario no se comprueba',   SRC, [('if (!user || !valid)', 'if (!valid)')], T)
report()
```

3. Córrelo con `timeout` (cada mutación corre Vitest: de segundos a medio minuto), o en segundo plano si son muchas, y espera sin sondear a la fuerza.

## Cómo leer el resultado

| Veredicto | Qué hacer |
|---|---|
| `DETECTADA` | Bien. |
| `SOBREVIVIÓ` | O falta una prueba (escríbela y repite la mutación), o el cambio es **equivalente** (otra comprobación posterior da lo mismo): simplifica el código si es redundante, o anótalo como equivalente en la bitácora. |
| `NO COMPILA` | Rompió el arranque o no hubo resumen. Cuenta como detectada, pero haz una mutación mejor si el punto importa. |
| `NO APLICADA` | El ancla no existe o aparece más de una vez. Cópiala del archivo **ya formateado por Prettier**. |

## Reglas

- Un archivo mutado se restaura siempre, pero comprueba `git status` al terminar.
- No mezcles pruebas unitarias con integración/e2e en una misma mutación (la herramienta lo rechaza).
- No corras mutaciones a la vez que la compuerta.
- Anota en la bitácora cuántas se hicieron, cuántas se detectaron a la primera y qué se hizo con cada superviviente; si lanzaste algo mal, dilo.
- La herramienta tiene sus propias pruebas: `cd scripts && python3 -m unittest test_mutate`.
