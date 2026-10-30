#!/usr/bin/env python3
"""La matriz de historias de usuario (docs/historias/README.md).

Reúne TODAS las historias en una tabla: las 20 hechas antes de 2026-10-30 (datos en docs/historias/legado.json, calculados una
vez desde git) y las nuevas, cada una en su archivo docs/historias/HU-nn-titulo.md (o EN-nn-… para un habilitador). De cada
archivo nuevo lee el encabezado y la tabla de tareas; la fecha y el tiempo salen de `git log` (commits `HU-nn.k [CAPA]: …`).

    python3 scripts/historias.py           # reescribe la matriz y comprueba
    python3 scripts/historias.py --check   # solo comprueba (estructura); código de salida 1 si algo no cuadra
    python3 scripts/historias.py --tipos   # imprime la tabla de tipos de tarea (la fuente es docs/historias/_plantilla.md)
    python3 scripts/historias.py --formato # completa y corrige los iconos de la tabla de tareas de cada historia

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
# Una fila de la tabla de tareas: `| # | Capa | Tipo | Rigor | Tarea | Objetivo | Depende de | Estado |`
FILA = re.compile(r"^\|\s*((?:HU|EN)-\d+\.\d+)\s*\|(.*)\|\s*$")
COLUMNAS_TAREA = ("Capa", "Tipo", "Rigor", "Tarea", "Objetivo", "Depende de", "Estado")
# Rigor de cada tarea, siempre escrito (kebab-case, como los tipos). `critico`: mutaciones obligatorias y plan corto antes de
# codificar (solo [API]); `normal`: el resto
CRITICO, NORMAL = "critico", "normal"
RIGORES = (CRITICO, NORMAL)
# Tipo de cada capa: dice qué receta aplica. Siempre en kebab-case (minúsculas, sin acentos ni símbolos, con guiones en vez de espacios).
# La DESCRIPCIÓN de cada tipo (qué cambia, ejemplos, receta) vive en docs/historias/_plantilla.md: si cambias esta lista, cambia
# también esa tabla (parse_types_table y check() las comparan y `python3 scripts/historias.py --check` falla si difieren)
PLANTILLA = "docs/historias/_plantilla.md"
TIPOS = {
    "API": ("contrato", "regla", "evento", "base-de-datos", "configuracion"),
    "WEB": ("pantalla", "comportamiento"),
    "DOC": ("producto", "guia"),
    "E2E": ("recorrido",),
}
SIEMPRE_CRITICOS = ("base-de-datos", "evento")
ESTADOS_TAREA = ("propuesta", "pendiente", "en-curso", "hecho", "bloqueado")
# Cada valor de las columnas estructuradas (Capa, Tipo, Rigor, Estado) se escribe «icono texto» y su icono es siempre el mismo:
# el texto es el valor (kebab-case) y el icono lo acompaña. El comprobador exige que estén en TODAS las filas y que coincidan;
# `python3 scripts/historias.py --formato` los completa
ICONOS = {
    "capa": {"API": "\u2699\ufe0f", "WEB": "🌐", "E2E": "🧪", "DOC": "📄"},  # ⚙️ lleva el selector de emoji (U+FE0F)
    "tipo": {
        "contrato": "📜", "regla": "📐", "evento": "⚡", "base-de-datos": "🧊", "configuracion": "\U0001f6e0\ufe0f",
        "pantalla": "\U0001f5bc\ufe0f", "comportamiento": "🔀", "producto": "📦", "guia": "📘", "recorrido": "🔁",
    },
    "rigor": {"critico": "🔴", "normal": "🟢"},
    "estado": {"propuesta": "\u270f\ufe0f", "pendiente": "⏳", "en-curso": "⏩", "hecho": "✅", "bloqueado": "⛔"},
}


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


def _sin_variacion(texto):
    return texto.replace("\ufe0f", "")  # el selector de emoji no cuenta al comparar iconos


def cell(kind, text):
    """La celda canónica de una columna estructurada: «icono texto»."""
    return f"{ICONOS[kind][text]} {text}"


def parse_cell(raw):
    """(icono, texto) de una celda: «🔌 API» → ("🔌", "API"); «[API]» (formato antiguo) → ("", "API"); «⬜» → ("⬜", "")."""
    limpio = _sin_variacion(raw).replace("[", "").replace("]", "").strip()
    m = re.match(r"^([^\w\s]*)\s*(.*)$", limpio)
    return m.group(1), m.group(2).strip()


def _valor(kind, raw):
    """El valor (texto) de una celda; si solo trae icono, el valor al que corresponde ese icono."""
    icono, texto = parse_cell(raw)
    if texto:
        return texto
    for valor, ic in ICONOS[kind].items():
        if icono and _sin_variacion(ic) == icono:
            return valor
    return ""


def parse_rows(text):
    """[(id, [celdas sin recortar])] de las filas de la tabla de tareas (una fila es `| HU-nn.k | … |`)."""
    rows = []
    for line in text.splitlines():
        m = FILA.match(line)
        if m:
            rows.append((m.group(1), m.group(2).split("|")))
    return rows


def parse_tasks(text):
    """[(id de la tarea, capa, estado)] de las filas bien formadas de la tabla de tareas."""
    return [(tid, _valor("capa", c[0]), _valor("estado", c[6])) for tid, c in parse_rows(text) if len(c) == len(COLUMNAS_TAREA)]


def parse_task_types(text):
    """[(id, capa, tipo, rigor)] de las filas de la tabla de tareas (el texto de cada celda, sin el icono)."""
    return [(tid, _valor("capa", c[0]), _valor("tipo", c[1]), _valor("rigor", c[2])) for tid, c in parse_rows(text) if len(c) == len(COLUMNAS_TAREA)]


def parse_detail_blocks(text):
    """{id de la tarea: {"checks": [(marcada, texto)], "reglas": bool}} de «## Detalle de las tareas» (un `### HU-nn.k …` por tarea)."""
    cuerpo = section(text, "Detalle de las tareas") or ""
    bloques = {}
    for trozo in re.split(r"(?m)^### ", cuerpo)[1:]:
        m = re.match(r"((?:HU|EN)-\d+\.\d+)\b", trozo)
        if not m:
            continue
        checks = [(c.lower() == "x", t.strip()) for c, t in re.findall(r"(?m)^- \[( |x|X)\] (.+)$", trozo)]
        reglas = re.search(r"\*\*Reglas e invariantes\*\*[^\n]*\n(.*?)(?=\n\*\*|\Z)", trozo, re.S)
        bloques[m.group(1)] = {"checks": checks, "reglas": bool(reglas and reglas.group(1).strip())}
    return bloques


def _celda_canonica(kind, raw, capa=None):
    """La celda canónica de `raw`, o None si no se entiende su valor."""
    valor = _valor(kind, raw)
    validos = ICONOS[kind]
    if kind == "tipo" and capa in TIPOS:
        validos = TIPOS[capa]
    return cell(kind, valor) if valor in validos else None


def format_text(text):
    """El texto con los iconos de las columnas Capa, Tipo, Rigor y Estado de cada fila de tareas completados o corregidos. Lo que no
    entiende lo deja como está (el comprobador lo señala)."""
    out = []
    for line in text.splitlines():
        m = FILA.match(line)
        if m:
            c = m.group(2).split("|")
            if len(c) == len(COLUMNAS_TAREA):
                capa = _valor("capa", c[0])
                nuevas = [_celda_canonica(k, c[i], capa) for k, i in (("capa", 0), ("tipo", 1), ("rigor", 2), ("estado", 6))]
                for nueva, i in zip(nuevas, (0, 1, 2, 6)):
                    if nueva:
                        c[i] = nueva
                line = "| " + " | ".join([m.group(1)] + [x.strip() for x in c]) + " |"
        out.append(line)
    return "\n".join(out) + ("\n" if text.endswith("\n") else "")


# `> | 🔌 API | 📜 contrato | Qué cambia | Ejemplos | no |` (la tabla de tipos de la plantilla)
FILA_TIPO = re.compile(r"^>\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|\s*(sí|no)\s*\|\s*$")


def _filas_tipo(text):
    filas = []
    for line in text.splitlines():
        m = FILA_TIPO.match(line)
        if m:
            capa, tipo = parse_cell(m.group(1))[1], parse_cell(m.group(2))[1]
            if capa in CAPAS and tipo:
                filas.append((capa, tipo, m.group(3).strip(), m.group(4).strip(), m.group(5)))
    return filas


def template_icon_errors(text):
    """Los errores de icono de la tabla de tipos de la plantilla: cada capa y cada tipo debe llevar el icono de ICONOS."""
    errores = []
    for line in text.splitlines():
        m = FILA_TIPO.match(line)
        if not m:
            continue
        for kind, raw in (("capa", m.group(1)), ("tipo", m.group(2))):
            icono, texto = parse_cell(raw)
            if texto not in ICONOS[kind]:
                continue
            esperado = ICONOS[kind][texto]
            if _sin_variacion(icono) != _sin_variacion(esperado):
                errores.append(f"{PLANTILLA}: en la tabla de tipos, «{texto}» lleva el icono «{icono}» y debe llevar {esperado}")
    return errores


def parse_types_table(text):
    """{capa: [tipos]} de la tabla de tipos de la plantilla, en el orden en que aparecen."""
    tipos = {}
    for capa, tipo, *_ in _filas_tipo(text):
        tipos.setdefault(capa, []).append(tipo)
    return tipos


def parse_always_critical(text):
    """Los tipos que la tabla marca «sí» en la columna «¿Siempre critico?»."""
    return {tipo for _, tipo, _, _, siempre in _filas_tipo(text) if siempre == "sí"}


def render_types(text):
    """La tabla de tipos de la plantilla, lista para leer en la terminal (`--tipos`)."""
    lines = ["Tipos de tarea (elige por lo que cambia):", ""]
    quitar = lambda t: t.replace("**", "").replace("`", "")  # la terminal no dibuja Markdown
    for capa, tipo, cambia, ejemplos, siempre in _filas_tipo(text):
        cambia, ejemplos = quitar(cambia), quitar(ejemplos)
        extra = f" · siempre {CRITICO}" if siempre == "sí" else ""
        lines.append(f"  {cell('capa', capa)}  {cell('tipo', tipo)} — {cambia} (ej.: {ejemplos}){extra}")
    lines += ["", f"Fuente: {PLANTILLA}. Rigor «{CRITICO}» = tarea crítica (mutaciones obligatorias y plan corto; solo [API]); «{NORMAL}» = el resto."]
    return "\n".join(lines)


def section(text, title):
    """El texto de la sección `## <title>` hasta el siguiente `## ` (None si no existe)."""
    match = re.search(rf"^## {re.escape(title)}\b[^\n]*\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    return match.group(1).strip() if match else None


def layer_status(tasks, capa):
    """— si no hay tareas de esa capa; ✅ si están todas hechas; ⬜ si ninguna empezó; 🔄 en otro caso."""
    states = [s for _, c, s in tasks if c == capa]
    if not states:
        return "—"
    if all(s == "hecho" for s in states):
        return "✅"
    if all(s in ("pendiente", "propuesta") for s in states):
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
        done = sum(1 for _, _, s in tasks if s == "hecho")
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


def _comprobar_fila(nombre, tid, cells):
    """Los errores de las columnas estructuradas de una fila: valor del vocabulario, icono y reglas de rigor y objetivo."""
    errores = []
    capa_t = parse_cell(cells[0])[1]
    columnas = (("capa", "capa", cells[0], tuple(ICONOS["capa"])),
                ("tipo", "tipo", cells[1], TIPOS.get(capa_t, tuple(ICONOS["tipo"]))),
                ("rigor", "rigor", cells[2], RIGORES),
                ("estado", "estado", cells[6], ESTADOS_TAREA))
    for kind, nombre_col, raw, validos in columnas:
        icono, texto = parse_cell(raw)
        if texto not in validos:
            extra = f". Los tipos y sus ejemplos están en {PLANTILLA} (o `python3 scripts/historias.py --tipos`)" if kind == "tipo" else ""
            sufijo = ", en minúsculas y sin acento" if kind == "rigor" else ""
            errores.append(f"{nombre}: la tarea {tid} tiene un {nombre_col} «{texto}» no válido (usa {', '.join(validos)}{sufijo}){extra}")
            continue
        esperado = ICONOS[kind][texto]
        if not icono:
            errores.append(f"{nombre}: a la tarea {tid} le falta el icono de {nombre_col} («{esperado} {texto}»): ejecuta `python3 scripts/historias.py --formato`")
        elif _sin_variacion(icono) != _sin_variacion(esperado):
            errores.append(f"{nombre}: la tarea {tid} tiene un icono incorrecto en {nombre_col} ({icono}): «{texto}» lleva {esperado} (`python3 scripts/historias.py --formato` lo corrige)")
    capa, tipo, rigor = capa_t, _valor("tipo", cells[1]), _valor("rigor", cells[2])
    if rigor == CRITICO and capa != "API":
        errores.append(f"{nombre}: la tarea {tid} tiene rigor {CRITICO} y solo las tareas [API] pueden serlo (mutaciones y plan corto)")
    elif rigor == NORMAL and tipo in SIEMPRE_CRITICOS and capa == "API":
        errores.append(f"{nombre}: la tarea {tid} es de tipo {tipo} y debe tener rigor {CRITICO} (siempre es crítica)")
    if cells[4].strip() in ("", "…", "..."):
        errores.append(f"{nombre}: la tarea {tid} no tiene objetivo (una frase sobre el resultado que se busca)")
    return errores


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
        rows = parse_rows(text)
        bloques = parse_detail_blocks(text)
        tasks = parse_tasks(text)
        for tid, cells in rows:
            if not tid.startswith(f"{sid}."):
                errors.append(f"{path.name}: la tarea {tid} no es de {sid}")
            if len(cells) != len(COLUMNAS_TAREA):
                errors.append(f"{path.name}: la fila de {tid} tiene {len(cells)} columnas y debe tener {len(COLUMNAS_TAREA)} después del número ({' | '.join(COLUMNAS_TAREA)}); una celda no puede llevar el carácter «|»")
                continue
            errors += _comprobar_fila(path.name, tid, cells)
            if tid not in bloques:
                errors.append(f"{path.name}: la tarea {tid} no tiene su bloque de detalle («### {tid} …» dentro de «## Detalle de las tareas», con «**Se comprueba**» y sus casillas)")
        ids = {tid for tid, _ in rows}
        for tid in bloques:
            if tid not in ids:
                errors.append(f"{path.name}: hay un bloque de detalle de {tid} y no existe esa tarea en la tabla")
        for tid, capa, tipo, rigor in parse_task_types(text):
            bloque, estado = bloques.get(tid), next((e for t, _, e in tasks if t == tid), "")
            if not bloque:
                continue
            if not bloque["checks"]:
                errors.append(f"{path.name}: el bloque de {tid} no tiene comprobaciones (casillas `- [ ]` bajo «**Se comprueba**»)")
            elif estado == "hecho" and not all(m for m, _ in bloque["checks"]):
                errors.append(f"{path.name}: {tid} está hecha pero tiene comprobaciones sin marcar (deben estar todas marcadas)")
            elif estado == "propuesta" and any(m for m, _ in bloque["checks"]):
                errors.append(f"{path.name}: {tid} es una tarea propuesta y tiene comprobaciones marcadas")
            if rigor == CRITICO and not bloque["reglas"]:
                errors.append(f"{path.name}: {tid} es crítica y su bloque no tiene «**Reglas e invariantes**» con contenido")
        if any(c == "API" for _, c, _ in tasks) and not section(text, "Contrato"):
            errors.append(f"{path.name}: tiene tareas [API] y le falta la sección «## Contrato» (rutas, cuerpos, ejemplo, errores y compatibilidad; o «Sin cambios en el contrato»)")
        if any(c == "WEB" for _, c, _ in tasks) and not section(text, "Pantalla"):
            errors.append(f"{path.name}: tiene tareas [WEB] y le falta la sección «## Pantalla» (dónde va lo que cambia, estados, textos exactos, móvil y escritorio, accesibilidad; o «Sin cambios visuales»)")
        if meta["estado"] == "cerrada":
            if any(s != "hecho" for _, _, s in tasks) or not tasks:
                errors.append(f"{path.name}: está cerrada pero tiene tareas sin hacer")
            if meta["tipo"] == "HU" and not any(c == "E2E" for _, c, _ in tasks):
                errors.append(f"{path.name}: una HU cerrada necesita su tarea [E2E] (el «Listo cuando…» de punta a punta)")
        if meta["estado"] == "propuesta" and any(s in ("hecho", "en-curso") for _, _, s in tasks):
            errors.append(f"{path.name}: es una propuesta pero tiene tareas hechas o en curso")
        expected[sid] = ESTADOS[meta["estado"]]
    plantilla = Path(root) / PLANTILLA
    if plantilla.exists():
        texto = plantilla.read_text(encoding="utf-8")
        errors += template_icon_errors(texto)
        tabla = parse_types_table(texto)
        for capa, tipos in TIPOS.items():
            if set(tabla.get(capa, [])) != set(tipos):
                errors.append(f"{PLANTILLA}: los tipos de [{capa}] de la tabla ({', '.join(tabla.get(capa, [])) or 'ninguno'}) no coinciden con los de scripts/historias.py ({', '.join(tipos)})")
        if parse_always_critical(texto) != set(SIEMPRE_CRITICOS):
            errors.append(f"{PLANTILLA}: los tipos «siempre {CRITICO}» de la tabla ({', '.join(sorted(parse_always_critical(texto)))}) no coinciden con los de scripts/historias.py ({', '.join(SIEMPRE_CRITICOS)})")
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
    if "--tipos" in argv:
        print(render_types((root / PLANTILLA).read_text(encoding="utf-8")))
        return 0
    if "--formato" in argv:
        cambiados = 0
        for path in story_files(root):
            antes = path.read_text(encoding="utf-8")
            despues = format_text(antes)
            if despues != antes:
                path.write_text(despues, encoding="utf-8")
                cambiados += 1
                print(f"formato: {path.name}")
        print(f"iconos al día en {cambiados} archivo(s)")
        return 0
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
