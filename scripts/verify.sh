#!/usr/bin/env bash
# La compuerta previa a cada commit. Se detiene en el primer fallo y exige que existan los resúmenes de Vitest (un
# resumen ausente significa que algo no arrancó, y eso no es un verde).
#
#   scripts/verify.sh [backend|frontend|all|auto]
#
# `auto` (por defecto) mira qué hay sin commitear: toca apps/main-api → backend; toca apps/store-web → frontend; solo
# documentación → no hay nada que ejecutar; nada sin commitear → todo. Es la misma cadena que el CI (más el audit).
set -u
ROOT=$(git rev-parse --show-toplevel) || exit 1
target=${1:-auto}
fail() { echo "✗ FALLÓ: $1"; exit 1; }

if [ "$target" = auto ]; then
  changed=$(git -C "$ROOT" status --porcelain | awk '{print $NF}')
  if [ -z "$changed" ]; then target=all
  else
    b=0; f=0
    echo "$changed" | grep -q '^apps/main-api/' && b=1
    echo "$changed" | grep -q '^apps/store-web/' && f=1
    echo "$changed" | grep -qE '^(scripts/|\.github/)' && { b=1; }
    if [ $b = 1 ] && [ $f = 1 ]; then target=all
    elif [ $b = 1 ]; then target=backend
    elif [ $f = 1 ]; then target=frontend
    else echo "✓ Solo documentación: no hay nada que verificar"; exit 0
    fi
  fi
fi
echo "→ compuerta: $target"

backend() {
  cd "$ROOT/apps/main-api" || exit 1
  local LAST=.verify-last-failure.txt; rm -f "$LAST"
  pnpm exec tsc --noEmit -p tsconfig.json || fail "tsc"; echo "✓ tsc"
  local OUT; OUT=$(pnpm run lint 2>&1)
  if echo "$OUT" | grep -qiE "warning|error"; then echo "$OUT" | tail -8; fail "lint con avisos"; fi; echo "✓ lint limpio"
  pnpm run format:check 2>&1 | tail -1 | grep -q "All matched" || fail "formato"; echo "✓ formato"
  pnpm run build >/dev/null 2>&1 || fail "build"; echo "✓ build"
  local U; U=$(pnpm test 2>&1); echo "$U" | grep -E "Tests "
  echo "$U" | grep -qE "Tests +[0-9]+ passed" || fail "unitarios sin resumen"
  echo "$U" | grep -qE "^\s*(Tests|Test Files)\s+[0-9]+ failed" && { echo "$U" | grep -E "FAIL" | head -5; fail "unitarios"; }
  local E; E=$(pnpm run test:e2e 2>&1); echo "$E" | grep -E "Tests "
  echo "$E" | grep -E "^ *(×|FAIL) " | head -10
  if echo "$E" | grep -qE "^ *(×|FAIL) "; then echo "$E" > "$LAST"; echo "(salida completa en apps/main-api/$LAST)"; fi
  echo "$E" | grep -qE "Tests +[0-9]+ passed" || fail "integración/e2e sin resumen"
  echo "$E" | grep -qE "^\s*(Tests|Test Files)\s+[0-9]+ failed" && { echo "$E" | grep -E "FAIL" | head -5; fail "integración/e2e"; }
  echo "✓ backend verde"
}

frontend() {
  cd "$ROOT/apps/store-web" || exit 1
  pnpm exec vp check 2>&1 | tail -3 | grep -q "pass:" || fail "vp check (formato, lint o tipos)"; echo "✓ vp check"
  local LAST=.verify-last-failure.txt; rm -f "$LAST"
  local T; T=$(pnpm exec vp test 2>&1); echo "$T" | grep -E "Tests "
  # Una prueba que falla deja su nombre y su salida completa: sin ellos una falla intermitente no se puede diagnosticar
  if echo "$T" | grep -qE "^ *(×|FAIL) "; then echo "$T" | grep -E "^ *(×|FAIL) " | head -10; echo "$T" > "$LAST"; echo "(salida completa en apps/store-web/$LAST)"; fi
  echo "$T" | grep -qE "Tests +[0-9]+ passed" || fail "tests del frontend sin resumen"
  echo "$T" | grep -qE "Tests +[0-9]+ failed" && fail "tests del frontend"
  pnpm run build >/dev/null 2>&1 || fail "build del frontend"; echo "✓ build"
  echo "✓ frontend verde"
}

case "$target" in
  backend) backend ;;
  frontend) frontend ;;
  all) (backend) || exit 1; (frontend) || exit 1 ;;
  *) fail "destino desconocido: $target (use backend, frontend, all o auto)" ;;
esac
echo "✓ TODO VERDE"
