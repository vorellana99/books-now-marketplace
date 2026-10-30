#!/usr/bin/env python3
"""La matriz de historias de usuario (docs/historias/README.md).

Reúne TODAS las historias en una tabla: las 20 hechas antes de 2026-10-30 (datos en docs/historias/legado.json, calculados una
vez desde git) y las nuevas, cada una en su archivo docs/historias/HU-nn-titulo.md (o EN-nn-… para un habilitador). De cada
archivo nuevo lee el encabezado y la tabla de tareas; la fecha y el tiempo salen de `git log` (commits `HU-nn.k [CAPA]: …`).

    python3 scripts/historias.py           # reescribe la matriz y comprueba
    python3 scripts/historias.py --check   # solo comprueba (estructura); código de salida 1 si algo no cuadra

Solo usa la biblioteca estándar. Pruebas: cd scripts && python3 -m unittest test_historias
"""
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

LIMA = timezone(timedelta(hours=-5))
TOPE_MINUTOS = 60  # un hueco largo entre commits (noche, pausa) no se cuenta entero
START = "<!-- MATRIZ:INICIO (la genera scripts/historias.py: no editar a mano) -->"
END = "<!-- MATRIZ:FIN -->"
ESTADOS = {"propuesta": "📝 propuesta", "aprobada": "⬜ aprobada", "en-curso": "🔄 en curso", "cerrada": "✅ cerrada"}
CAPAS = ("DOC", "API", "WEB", "E2E")
REQUERIDOS = ("id", "titulo", "tipo", "epica", "estado")
# `| HU-12.2 | [API] | regla 🔒 | Tarea | Se comprueba | Depende de | Estado |`
TAREA = re.compile(r"^\|\s*((?:HU|EN)-\d+\.\d+)\s*\|\s*\[(API|WEB|E2E|DOC)\]\s*\|([^|]*)\|.*\|\s*(⬜|🔄|✅|📝|⛔)\s*\|\s*$")
RIGOR = "🔒"  # tarea crítica: mutaciones obligatorias y plan corto antes de codificar (solo [API])
# Tipo de cada capa: dice qué receta aplica. Las [E2E] no llevan tipo (—)
TIPOS = {
    "API": ("contrato", "regla", "evento", "base de datos", "configuración"),
    "WEB": ("pantalla", "comportamiento"),
    "DOC": ("producto", "guía"),
    "E2E": ("—",),
}
SIEMPRE_CRITICOS = ("base de datos", "evento")


class HistoriaError(Exception):
    pass


# ---------- lectura de un archivo de historia ----------

def parse_front_matter(text):
    """El bloque `---` del principio: líneas `clave: valor`. Sin él, no es una historia."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise HistoriaError("falta el encabezado `---` del principio")
    meta = {}
    for line in lines[1:]:
        if line.strip() == "---":
            return meta
        if ":" in line and not line.lstrip().startswith("#"):
            key, _, value = line.partition(":")
            meta[key.strip()] = value.split("  #")[0].strip()
    raise HistoriaError("el encabezado no se cierra con `---`")


def parse_tasks(text):
    """[(id de la tarea, capa, estado)] de las filas de la tabla de tareas."""
    return [(m.group(1), m.group(2), m.group(4)) for m in (TAREA.match(line) for line in text.splitlines()) if m]


def parse_task_types(text):
    """[(id, capa, tipo, crítica)] de las filas de la tabla de tareas; `crítica` es la marca 🔒 de la celda «Tipo»."""
    rows = []
    for m in (TAREA.match(line) for line in text.splitlines()):
        if m:
            cell = m.group(3).strip()
            rows.append((m.group(1), m.group(2), cell.replace(RIGOR, "").strip(), RIGOR in cell))
    return rows


def section(text, title):
    """El texto de la sección `## <title>` hasta el siguiente `## ` (None si no existe)."""
    match = re.search(rf"^## {re.escape(title)}\b[^\n]*\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    return match.group(1).strip() if match else None


def layer_status(tasks, capa):
    """— si no hay tareas de esa capa; ✅ si están todas hechas; ⬜ si ninguna empezó; 🔄 en otro caso."""
    states = [s for _, c, s in tasks if c == capa]
    if not states:
        return "—"
    if all(s == "✅" for s in states):
        return "✅"
    if all(s in ("⬜", "📝") for s in states):
        return "⬜"
    return "🔄"


# ---------- git: fechas y tiempos ----------

def git_commits(root):
    """[(hash, fecha en hora de Lima, asunto)] de los commits sin fusiones, del más antiguo al más reciente."""
    out = subprocess.run(
        ["git", "-C", str(root), "log", "--no-merges", "--reverse", "--format=%H|%aI|%s"],
        capture_output=True, text=True, check=True,
    ).stdout.splitlines()
    commits = []
    for line in out:
        digest, date, subject = line.split("|", 2)
        commits.append((digest, datetime.fromisoformat(date).astimezone(LIMA), subject))
    return commits


def fmt_minutes(minutes):
    minutes = int(round(minutes))
    if minutes < 60:
        return f"{minutes} min"
    hours, rest = divmod(minutes, 60)
    return f"{hours} h" if rest == 0 else f"{hours} h {rest} min"


def story_stats(story_id, commits):
    """Inicio, fin y minutos de los commits `<id>.<k> [CAPA]: …`. Cada commit cuenta el hueco con el commit anterior (de
    cualquier historia), con un tope de TOPE_MINUTOS. None si la historia no tiene commits."""
    prefix = re.compile(rf"^{re.escape(story_id)}\.\d+ \[")
    mine, minutes = [], 0.0
    for i, (_, when, subject) in enumerate(commits):
        if prefix.match(subject):
            gap = (when - commits[i - 1][1]).total_seconds() / 60 if i else 0
            minutes += min(max(gap, 0), TOPE_MINUTOS)
            mine.append(when)
    if not mine:
        return None
    return {"inicio": min(mine), "fin": max(mine), "minutos": round(minutes), "commits": len(mine)}


# ---------- la matriz ----------

def slug(text):
    return re.sub(r"[^\w\- ]", "", text.lower()).replace(" ", "-")


def story_files(root):
    folder = Path(root) / "docs" / "historias"
    return sorted(p for p in folder.glob("*.md") if re.match(r"^(HU|EN)-", p.name))


def sort_key(story_id):
    kind, number = story_id.split("-")
    return (0 if kind == "HU" else 1, int(number))


def legacy_rows(root):
    data = json.loads((Path(root) / "docs" / "historias" / "legado.json").read_text(encoding="utf-8"))
    rows = []
    for x in data["historias"]:
        closed = x["cierre"] is not None
        rows.append({
            "id": x["id"], "titulo": x["titulo"], "epica": x["epica"],
            "estado": ESTADOS["cerrada"] if closed else "🔄 API hecha, Web pendiente",
            "api": x["api"], "web": x["web"],
            "inicio": x["inicio"], "cierre": x["cierre"] or "—",
            "tiempo": "≈ " + fmt_minutes(x["minutos"]),
            "tareas": f"{len(x['tareas_api']) + len(x['tareas_web'])} (histórico)",
            "detalle": f"[texto](../product/04-historias-de-usuario.md#{slug(x['id'] + ' ' + x['titulo'])})",
        })
    return rows


def new_rows(root, commits):
    rows = []
    for path in story_files(root):
        text = path.read_text(encoding="utf-8")
        meta = parse_front_matter(text)
        tasks = parse_tasks(text)
        stats = story_stats(meta["id"], commits)
        done = sum(1 for _, _, s in tasks if s == "✅")
        closed = meta["estado"] == "cerrada"
        rows.append({
            "id": meta["id"], "titulo": meta["titulo"], "epica": meta["epica"],
            "estado": ESTADOS.get(meta["estado"], meta["estado"]),
            "api": layer_status(tasks, "API"), "web": layer_status(tasks, "WEB"),
            "inicio": stats["inicio"].date().isoformat() if stats else "—",
            "cierre": stats["fin"].date().isoformat() if stats and closed else "—",
            "tiempo": fmt_minutes(stats["minutos"]) if stats else "—",
            "tareas": f"{done} / {len(tasks)}",
            "detalle": f"[{meta['id']}]({path.name})",
        })
    return rows


def build_rows(root, commits):
    rows = legacy_rows(root) + new_rows(root, commits)
    return sorted(rows, key=lambda r: sort_key(r["id"]))


COLUMNS = (("id", "ID"), ("titulo", "Historia"), ("epica", "Épica"), ("estado", "Estado"), ("api", "API"), ("web", "Web"),
           ("inicio", "Inicio"), ("cierre", "Cierre"), ("tiempo", "Tiempo"), ("tareas", "Tareas"), ("detalle", "Detalle"))


def render_matrix(rows):
    lines = ["| " + " | ".join(name for _, name in COLUMNS) + " |", "|" + "|".join("---" for _ in COLUMNS) + "|"]
    for row in rows:
        lines.append("| " + " | ".join(str(row[key]) for key, _ in COLUMNS) + " |")
    return "\n".join(lines)


def write_matrix(root, commits):
    readme = Path(root) / "docs" / "historias" / "README.md"
    text = readme.read_text(encoding="utf-8")
    if START not in text or END not in text:
        raise HistoriaError(f"faltan las marcas {START!r} y {END!r} en {readme}")
    head, rest = text.split(START, 1)
    _, tail = rest.split(END, 1)
    readme.write_text(f"{head}{START}\n{render_matrix(build_rows(root, commits))}\n{END}{tail}", encoding="utf-8")


# ---------- comprobación (solo estructura: no depende de git) ----------

def matrix_cells(root):
    """{id: {columna: texto}} de la tabla que hay ahora en el README."""
    text = (Path(root) / "docs" / "historias" / "README.md").read_text(encoding="utf-8")
    if START not in text or END not in text:
        return {}
    table = text.split(START, 1)[1].split(END, 1)[0].strip().splitlines()
    names = [name for _, name in COLUMNS]
    cells = {}
    for line in table[2:]:
        parts = [p.strip() for p in line.strip().strip("|").split("|")]
        if len(parts) == len(names):
            cells[parts[0]] = dict(zip(names, parts))
    return cells


def check(root):
    errors = []
    legacy = {x["id"] for x in json.loads((Path(root) / "docs" / "historias" / "legado.json").read_text(encoding="utf-8"))["historias"]}
    seen = set(legacy)
    expected = {}
    for path in story_files(root):
        try:
            text = path.read_text(encoding="utf-8")
            meta = parse_front_matter(text)
        except HistoriaError as e:
            errors.append(f"{path.name}: {e}")
            continue
        missing = [k for k in REQUERIDOS if not meta.get(k)]
        if missing:
            errors.append(f"{path.name}: faltan en el encabezado {', '.join(missing)}")
            continue
        sid = meta["id"]
        if not path.name.startswith(f"{sid}-") or not re.match(r"^(HU|EN)-\d+$", sid):
            errors.append(f"{path.name}: el nombre del archivo debe empezar por «{sid}-» (id del encabezado)")
        if sid in seen:
            errors.append(f"{path.name}: id repetido ({sid})")
        seen.add(sid)
        if meta["estado"] not in ESTADOS:
            errors.append(f"{path.name}: estado «{meta['estado']}» no válido (usa {', '.join(ESTADOS)})")
            continue
        tasks = parse_tasks(text)
        for tid, _, _ in tasks:
            if not tid.startswith(f"{sid}."):
                errors.append(f"{path.name}: la tarea {tid} no es de {sid}")
        for tid, capa, tipo, critica in parse_task_types(text):
            if tipo not in TIPOS[capa]:
                errors.append(f"{path.name}: la tarea {tid} [{capa}] tiene un tipo «{tipo}» no válido (usa {', '.join(TIPOS[capa])})")
            if critica and capa != "API":
                errors.append(f"{path.name}: la tarea {tid} lleva {RIGOR} y solo las tareas [API] pueden ser críticas (mutaciones y plan corto)")
            if tipo in SIEMPRE_CRITICOS and not critica and capa == "API":
                errors.append(f"{path.name}: la tarea {tid} es de tipo {tipo} y debe llevar {RIGOR} (siempre es crítica)")
        if any(c == "API" for _, c, _ in tasks) and not section(text, "Contrato"):
            errors.append(f"{path.name}: tiene tareas [API] y le falta la sección «## Contrato» (rutas, cuerpos, ejemplo, errores y compatibilidad; o «Sin cambios en el contrato»)")
        if any(c == "WEB" for _, c, _ in tasks) and not section(text, "Pantalla"):
            errors.append(f"{path.name}: tiene tareas [WEB] y le falta la sección «## Pantalla» (dónde va lo que cambia, estados, textos exactos, móvil y escritorio, accesibilidad; o «Sin cambios visuales»)")
        if meta["estado"] == "cerrada":
            if any(s != "✅" for _, _, s in tasks) or not tasks:
                errors.append(f"{path.name}: está cerrada pero tiene tareas sin hacer")
            if meta["tipo"] == "HU" and not any(c == "E2E" for _, c, _ in tasks):
                errors.append(f"{path.name}: una HU cerrada necesita su tarea [E2E] (el «Listo cuando…» de punta a punta)")
        if meta["estado"] == "propuesta" and any(s in ("✅", "🔄") for _, _, s in tasks):
            errors.append(f"{path.name}: es una propuesta pero tiene tareas hechas o en curso")
        expected[sid] = ESTADOS[meta["estado"]]
    cells = matrix_cells(root)
    for sid, estado in expected.items():
        if sid not in cells:
            errors.append(f"la matriz no tiene fila para {sid}: ejecuta `python3 scripts/historias.py`")
        elif cells[sid]["Estado"] != estado:
            errors.append(f"la matriz dice «{cells[sid]['Estado']}» para {sid} y su archivo «{estado}»: ejecuta `python3 scripts/historias.py`")
    for sid in legacy:
        if sid not in cells:
            errors.append(f"la matriz no tiene fila para {sid} (histórica): ejecuta `python3 scripts/historias.py`")
    return errors


def main(argv):
    root = Path(__file__).resolve().parent.parent
    if "--check" not in argv:
        write_matrix(root, git_commits(root))
        print("matriz actualizada: docs/historias/README.md")
    errors = check(root)
    for e in errors:
        print("✗", e)
    if errors:
        return 1
    print("✓ historias en orden")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
