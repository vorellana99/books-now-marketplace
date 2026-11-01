#!/usr/bin/env python3
"""El hook commit-msg: valida el asunto de los commits de una tarea de historia.

    git config core.hooksPath .githooks     # se activa una sola vez por clon (.githooks/commit-msg llama a este script)

Solo mira los commits que EMPIEZAN por `HU-nn` o `EN-nn` (los de una tarea): el asunto debe ser
`HU-12.3 [API]: Add availability to GET /books`, la tarea tiene que existir en alguna historia de docs/historias/fase-n/, su capa
tiene que ser la de la tarea, solo puede nombrar UNA tarea y no pasa de 72 caracteres. El correlativo 0 (`EN-03.0 [DOC]: …`) no es
una tarea: es el commit que registra la historia o el habilitador, antes de ejecutar nada; vale si la historia existe y es de capa DOC. Cualquier otro commit (`Process: …`, un arreglo,
una fusión) pasa sin validar.

Solo usa la biblioteca estándar. Pruebas: cd scripts && python3 -m unittest test_commit_msg
"""
import re
import sys
from pathlib import Path

import historias as h

MAX = 72  # largo máximo del asunto
DE_TAREA = re.compile(r"^(?:HU|EN)-\d")  # lo que obliga a validar: un asunto que empieza como el de una tarea
FORMATO = re.compile(r"^((?:HU|EN)-\d+\.\d+) \[(API|WEB|E2E|DOC)\]: (\S.*)$")
OTRA_TAREA = re.compile(r"\b(?:HU|EN)-\d+\.\d+\b")
EJEMPLO = "HU-12.3 [API]: Add availability to GET /books"
REGISTRO = ".0"  # el correlativo 0: registrar la historia o el habilitador (no es una tarea de la tabla)


def subject(text):
    """El asunto de un mensaje de commit: su primera línea que no es un comentario de git (`# …`); vacío si no hay."""
    for line in text.splitlines():
        if not line.startswith("#") and line.strip():
            return line.strip()
    return ""


def errors_for(asunto, root):
    """Los errores del asunto de un commit (lista vacía si está bien o si no es el commit de una tarea)."""
    if not DE_TAREA.match(asunto):
        return []
    errores = []
    if len(asunto) > MAX:
        errores.append(f"el asunto tiene {len(asunto)} caracteres y el máximo es {MAX}")
    m = FORMATO.match(asunto)
    if not m:
        errores.append(f"el asunto «{asunto}» no tiene el formato «HU-nn.k [CAPA]: descripción en inglés» (CAPA = API, WEB, E2E o DOC, en mayúsculas; por ejemplo «{EJEMPLO}»; un habilitador es «EN-nn.k [CAPA]: …»)")
        return errores
    tarea, capa = m.group(1), m.group(2)
    if OTRA_TAREA.search(asunto[len(tarea):]):
        errores.append("un commit es de una sola tarea: el asunto nombra otra además de " + tarea)
    if tarea.endswith(REGISTRO):  # el registro de la historia o del habilitador: no es una fila de la tabla de tareas
        historia = tarea[: -len(REGISTRO)]
        if historia not in {path.stem for path in h.story_files(root)}:
            errores.append(f"la historia {historia} no existe en docs/historias/fase-n/ (el commit {tarea} registra una historia o un habilitador que ya tiene su archivo)")
        elif capa != "DOC":
            errores.append(f"el commit de registro {tarea} es de la capa [DOC] y dice [{capa}]")
        return errores
    capas = {tid: c for path in h.story_files(root) for tid, c, _ in h.parse_tasks(path.read_text(encoding="utf-8"))}
    if tarea not in capas:
        errores.append(f"la tarea {tarea} no existe en ninguna historia de docs/historias/fase-n/ (¿está en la tabla de tareas de su archivo?)")
    elif capas[tarea] != capa:
        errores.append(f"la tarea {tarea} es de la capa [{capas[tarea]}] y el commit dice [{capa}]")
    return errores


def main(argv, root=None):
    errores = errors_for(subject(Path(argv[0]).read_text(encoding="utf-8")), root or Path(__file__).resolve().parent.parent)
    if errores:
        print("✗ commit rechazado (regla del flujo de desarrollo: docs/guia-de-desarrollo.md §4, paso 9):")
        for e in errores:
            print("  -", e)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
