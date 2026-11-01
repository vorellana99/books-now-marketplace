#!/usr/bin/env python3
"""El hook pre-commit: protege los archivos de historial congelado.

    git config core.hooksPath .githooks     # se activa una sola vez por clon (.githooks/pre-commit llama a este script)

Un archivo está congelado cuando, EN LA ÚLTIMA VERSIÓN COMMITEADA, una de sus primeras líneas EMPIEZA con la advertencia «❄️ Historial
congelado desde …» (o «❄️ Histórico congelado …», como product/04); mencionarla en medio de un texto no cuenta. Rechaza un commit que modifique, borre o renombre uno. Poner la advertencia
a un archivo no lo rechaza (se mira la versión de HEAD, no la preparada), y así se congela por primera vez. Un cambio legítimo (por
ejemplo, arreglar un enlace roto) se hace a propósito: `ALLOW_FROZEN_EDIT=1 git commit …`.

Solo usa la biblioteca estándar. Pruebas: cd scripts && python3 -m unittest test_pre_commit
"""
import os
import re
import subprocess
import sys
from pathlib import Path

# La advertencia ABRE una línea (como cita `> **❄️ …`, en negrita `**❄️ …` o suelta): un texto que solo la menciona (una celda de tabla, una frase
# entre comillas, como hace la guía de herramientas al describir este hook) no congela el archivo
MARCA = re.compile(r"^\s*(?:>\s*)?\**\s*\u2744\ufe0f? (?:Historial|Hist\u00f3rico) congelado")
VENTANA = 40  # líneas del principio donde se busca la advertencia (product/04 la tiene en la 30)
EXCEPCION = "ALLOW_FROZEN_EDIT"


def is_frozen_text(text):
    """¿Las primeras VENTANA líneas llevan la advertencia de congelado?"""
    return any(MARCA.match(line) for line in text.splitlines()[:VENTANA])


def _git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)


def staged_changes(repo):
    """[(estado, ruta)] de lo preparado, sin detectar renombres (un renombre cuenta como un borrado y un alta)."""
    out = _git(repo, "diff", "--cached", "--name-status", "--no-renames", "-z").stdout.split("\0")
    return [(out[i], out[i + 1]) for i in range(0, len(out) - 1, 2) if out[i]]


def violations(repo, env):
    """Las rutas congeladas que el commit modifica o borra (vacío si se activó la excepción)."""
    if env.get(EXCEPCION) == "1":
        return []
    encontradas = []
    for estado, ruta in staged_changes(repo):
        if estado == "A":
            continue  # un archivo nuevo no estaba congelado
        anterior = _git(repo, "show", f"HEAD:{ruta}")
        if anterior.returncode == 0 and is_frozen_text(anterior.stdout):
            encontradas.append(f"{ruta} ({'borrado o renombrado' if estado == 'D' else 'modificado'})")
    return encontradas


def main(repo, env):
    encontradas = violations(repo, env)
    if encontradas:
        print("✗ commit rechazado: toca archivos de historial congelado, que ya no se actualizan:")
        for e in encontradas:
            print("  -", e)
        print(f"Si el cambio es legítimo (por ejemplo, un enlace roto), hazlo a propósito: {EXCEPCION}=1 git commit …")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(Path(__file__).resolve().parent.parent, os.environ))
