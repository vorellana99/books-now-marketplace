#!/usr/bin/env python3
"""Las matrices de historias y habilitadores (docs/historias/fase-n/matriz.md) y el índice de fases (docs/historias/README.md).

Genera la matriz de CADA fase, con las historias y los habilitadores en tablas propias. La fase 1 incluye las 20 historias hechas antes
de 2026-10-30 (datos en docs/historias/legado.json, calculados una vez desde git); las nuevas, cada una en su archivo
docs/historias/fase-n/HU-nn.md (o EN-nn.md para un habilitador): la carpeta es la fase (con su README.md inicial que la describe) y el
nombre es solo el correlativo. De cada
archivo nuevo lee el encabezado y la tabla de tareas; la fecha y el tiempo salen de `git log` (commits `HU-nn.k [CAPA]: …`).
También lee la sección «Impacto en el producto» de cada historia: comprueba que lo que cita existe y que, al hacerse, deja su marca
«Cambios: HU-nn» en la regla, decisión o pantalla; y con ella genera docs/product/cambios.md (qué cambió, cuándo y por qué historia).

    python3 scripts/historias.py           # sella inicio/fin de las tareas, reescribe la matriz y el registro de cambios y comprueba
    python3 scripts/historias.py --check   # solo comprueba (estructura); código de salida 1 si algo no cuadra
    python3 scripts/historias.py --tipos   # imprime la tabla de tipos de tarea (la fuente es docs/historias/_plantilla.md)
    python3 scripts/historias.py --formato # completa y corrige los iconos de la tabla de tareas de cada historia

Solo usa la biblioteca estándar. Pruebas: cd scripts && python3 -m unittest test_historias
"""
import json
import posixpath
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

LIMA = timezone(timedelta(hours=-5))
TOPE_MINUTOS = 60  # un hueco largo entre commits (noche, pausa) no se cuenta entero
START = "<!-- FASES:INICIO (la genera scripts/historias.py: no editar a mano) -->"  # el índice de fases de docs/historias/README.md
END = "<!-- FASES:FIN -->"
MATRIZ_ARCHIVO = "matriz.md"  # la matriz de cada fase: docs/historias/fase-n/matriz.md, generada entera
# Las historias nuevas viven en carpetas `fase-n/` (docs/historias/fase-1/, fase-2/…); cada carpeta tiene un README.md inicial que describe la
# fase (qué entra y qué queda fuera). La fase de una historia ES su carpeta, y el archivo se llama solo por su correlativo (HU-12.md).
# Las 20 historias anteriores (legado.json) son de la fase 1
FASE = re.compile(r"^fase-(\d+)$")
FASE_LEGADO = 1
# `idea` (💡) es un pendiente que solo registra un encabezado y una frase (docs/historias/_idea.md): no pide tareas, contrato, pantalla,
# impacto ni ligadura hasta que se promueve a `propuesta` completando la plantilla
ESTADOS = {"idea": "💡 idea", "propuesta": "📝 propuesta", "aprobada": "⬜ aprobada", "en-curso": "🔄 en curso", "cerrada": "✅ cerrada"}
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
    "API": ("contrato", "regla", "evento", "base-de-datos", "configuracion", "refactor"),
    "WEB": ("pantalla", "comportamiento", "refactor"),
    "DOC": ("producto", "guia"),
    "E2E": ("recorrido",),
}
SIEMPRE_CRITICOS = ("base-de-datos", "evento")
# La tabla «## Ejecución» de cada historia: el inicio (cuando la tarea pasa a en-curso) y el fin (cuando pasa a hecho) los sella el
# script con la hora de Lima; el tiempo es fin − inicio. Se guardan en el archivo porque el commit de una tarea no puede contener
# su propia hora
EJEC_INICIO = "<!-- EJECUCION:INICIO (la completa scripts/historias.py: no editar a mano) -->"
EJEC_FIN = "<!-- EJECUCION:FIN -->"
SELLO = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$")
FORMATO_SELLO = "%Y-%m-%d %H:%M"
ESTADOS_TAREA = ("propuesta", "pendiente", "en-curso", "hecho", "bloqueado")
# Cada valor de las columnas estructuradas (Capa, Tipo, Rigor, Estado) se escribe «icono texto» y su icono es siempre el mismo:
# el texto es el valor (kebab-case) y el icono lo acompaña. El comprobador exige que estén en TODAS las filas y que coincidan;
# `python3 scripts/historias.py --formato` los completa
ICONOS = {
    "capa": {"API": "\u2699\ufe0f", "WEB": "🌐", "E2E": "🧪", "DOC": "📄"},  # ⚙️ lleva el selector de emoji (U+FE0F)
    "tipo": {
        "contrato": "📜", "regla": "📐", "evento": "⚡", "base-de-datos": "🧊", "configuracion": "\U0001f6e0\ufe0f",
        "pantalla": "\U0001f5bc\ufe0f", "comportamiento": "🔀", "producto": "📦", "guia": "📘", "recorrido": "🔁",
        "refactor": "\u267b\ufe0f",  # ♻️ lleva el selector de emoji (U+FE0F)
    },
    "rigor": {"critico": "🔴", "normal": "🟢"},
    "estado": {"propuesta": "\u270f\ufe0f", "pendiente": "⏳", "en-curso": "⏩", "hecho": "✅", "bloqueado": "⛔"},
}


# «## Impacto en el producto»: qué documentos VIVOS del producto toca la historia. Esos documentos (RN, PA, DP, guías) dicen siempre
# lo que es verdad hoy; la historia es el registro del cambio. Cada fila es `| Documento | Qué cambia | Acción | Estado |`
IMPACTO = "Impacto en el producto"
SIN_IMPACTO = "Sin impacto en el producto"
ACCIONES = ("agrega", "modifica", "retira")
ESTADOS_IMPACTO = ("pendiente", "hecho")
VIVOS = {
    "RN": "docs/product/03-reglas-de-negocio.md",
    "PA": "docs/product/06-pantallas-y-navegacion.md",
    "DP": "docs/product/09-decisiones-y-preguntas.md",
}
ITEM = re.compile(r"^(RN|PA|DP)-\d+$")
CAMBIOS = "docs/product/cambios.md"
CAMBIOS_INICIO = "<!-- CAMBIOS:INICIO (la genera scripts/historias.py: no editar a mano) -->"
CAMBIOS_FIN = "<!-- CAMBIOS:FIN -->"
CAMBIOS_ENCABEZADO = (
    "# Registro de cambios del producto\n\n"
    "> Las reglas (`RN`), pantallas (`PA`), decisiones (`DP`) y demás documentos de esta carpeta dicen **siempre lo que es verdad hoy**; "
    "este registro dice qué historia cambió cada uno y cuándo. Lo genera `python3 scripts/historias.py` desde la sección «Impacto en el "
    "producto» de cada historia (`docs/historias/`): no se edita a mano. Una fila *pendiente* es un cambio aprobado o propuesto que "
    "todavía no está escrito en el documento vivo.\n\n"
)


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
    if EJEC_INICIO in text and EJEC_FIN in text:  # las filas de «## Ejecución» también empiezan por un id de tarea: no son de la tabla de tareas
        text = text.split(EJEC_INICIO, 1)[0] + text.split(EJEC_FIN, 1)[1]
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


# ---------- ejecución: inicio, fin y tiempo de cada tarea ----------

def parse_execution(text):
    """{id: {"inicio", "fin", "tiempo"}} de la tabla «## Ejecución» (None donde la celda es «—»); None si no existe la tabla."""
    if EJEC_INICIO not in text or EJEC_FIN not in text:
        return None
    cuerpo = text.split(EJEC_INICIO, 1)[1].split(EJEC_FIN, 1)[0]
    filas = {}
    for line in cuerpo.splitlines():
        m = FILA.match(line)
        if m:
            c = [x.strip() for x in m.group(2).split("|")]
            if len(c) == 3:
                filas[m.group(1)] = {k: (None if v in ("—", "") else v) for k, v in zip(("inicio", "fin", "tiempo"), c)}
    return filas


def elapsed(inicio, fin):
    """El tiempo entre dos sellos «AAAA-MM-DD HH:MM», como texto («1 h 15 min»)."""
    delta = datetime.strptime(fin, FORMATO_SELLO) - datetime.strptime(inicio, FORMATO_SELLO)
    return fmt_minutes(delta.total_seconds() / 60)


def render_execution(filas):
    lines = [EJEC_INICIO, "| # | Inicio | Fin | Tiempo |", "|---|---|---|---|"]
    for tid, e in filas:
        lines.append(f"| {tid} | {e['inicio'] or '—'} | {e['fin'] or '—'} | {e['tiempo'] or '—'} |")
    lines.append(EJEC_FIN)
    return "\n".join(lines)


def stamp_text(text, now):
    """El texto con la tabla «## Ejecución» al día: sella el inicio de las tareas que pasaron a en-curso y el fin de las que pasaron a
    hecho (sin pisar los sellos que ya existen), calcula el tiempo y deja una fila por tarea. Devuelve (texto, avisos)."""
    tasks = parse_tasks(text)
    if not tasks:
        return text, []
    existentes = parse_execution(text) or {}
    sello, filas, avisos = now.strftime(FORMATO_SELLO), [], []
    for tid, _, estado in tasks:
        e = existentes.get(tid, {"inicio": None, "fin": None, "tiempo": None})
        inicio, fin = e["inicio"], e["fin"]
        if estado in ("en-curso", "hecho") and not inicio:
            inicio = sello
        if estado == "hecho" and not fin:
            fin = sello
            if e["inicio"] is None:
                avisos.append(f"{tid} pasó a hecho sin pasar por en-curso: su inicio y su fin son la misma hora y su tiempo no es fiable")
        valido = inicio and fin and SELLO.match(inicio) and SELLO.match(fin)
        filas.append((tid, {"inicio": inicio, "fin": fin, "tiempo": elapsed(inicio, fin) if valido else (e["tiempo"] if inicio and fin else None)}))
    bloque = render_execution(filas)
    if EJEC_INICIO in text and EJEC_FIN in text:
        antes, resto = text.split(EJEC_INICIO, 1)
        _, despues = resto.split(EJEC_FIN, 1)
        return f"{antes}{bloque}{despues}", avisos
    seccion = ("## Ejecución\n\n> Lo completa `scripts/historias.py` (no se edita a mano): sella el **inicio** cuando una tarea pasa a `⏩ en-curso` y el **fin** "
               "cuando pasa a `✅ hecho`, con la hora de Lima. El **tiempo** es fin − inicio e **incluye las esperas** (aprobaciones, pausas); "
               "el tiempo de la matriz de `README.md` sale de git y no es el mismo dato.\n\n" + bloque + "\n\n")
    ancla = "## Detalle de las tareas"
    if ancla in text:
        i = text.index(ancla)
        return text[:i] + seccion + text[i:], avisos
    return text.rstrip("\n") + "\n\n" + seccion, avisos


def stamp_all(root, now):
    """Sella las historias del repositorio; devuelve ([archivos cambiados], [avisos])."""
    cambiados, avisos = [], []
    for path in story_files(root):
        antes = path.read_text(encoding="utf-8")
        despues, av = stamp_text(antes, now)
        avisos += [f"{path.name}: {a}" for a in av]
        if despues != antes:
            path.write_text(despues, encoding="utf-8")
            cambiados.append(path.name)
    return cambiados, avisos


def _comprobar_ejecucion(nombre, text, tasks):
    """Los errores de la tabla «## Ejecución»: una fila por tarea, sellos con formato, coherentes con el estado y con el tiempo."""
    ej = parse_execution(text)
    if ej is None:
        return [f"{nombre}: falta la tabla «## Ejecución» (con sus marcas): ejecuta `python3 scripts/historias.py`"]
    errores, estados = [], {tid: est for tid, _, est in tasks}
    for tid in estados:
        if tid not in ej:
            errores.append(f"{nombre}: la tabla «Ejecución» no tiene fila para {tid}: ejecuta `python3 scripts/historias.py`")
    for tid in ej:
        if tid not in estados:
            errores.append(f"{nombre}: la tabla «Ejecución» tiene una fila de {tid} y no existe esa tarea")
    for tid, e in ej.items():
        estado = estados.get(tid)
        if estado is None:
            continue
        invalido = False
        for campo in ("inicio", "fin"):
            if e[campo] and not SELLO.match(e[campo]):
                errores.append(f"{nombre}: {tid}: el {campo} «{e[campo]}» de «Ejecución» no tiene el formato AAAA-MM-DD HH:MM")
                invalido = True
        if invalido:
            continue
        if estado in ("pendiente", "propuesta") and (e["inicio"] or e["fin"] or e["tiempo"]):
            errores.append(f"{nombre}: {tid} está {estado} y tiene sellos de ejecución")
            continue
        if estado in ("en-curso", "hecho") and not e["inicio"]:
            errores.append(f"{nombre}: {tid} está {estado} y le falta el inicio en «Ejecución»: ejecuta `python3 scripts/historias.py`")
        if estado == "hecho" and not e["fin"]:
            errores.append(f"{nombre}: {tid} está hecha y le falta el fin en «Ejecución»: ejecuta `python3 scripts/historias.py`")
        if estado != "hecho" and e["fin"]:
            errores.append(f"{nombre}: {tid} no está hecha y tiene fin en «Ejecución»")
        if e["inicio"] and e["fin"]:
            if e["fin"] < e["inicio"]:
                errores.append(f"{nombre}: {tid}: el fin es anterior al inicio")
            elif e["tiempo"] != elapsed(e["inicio"], e["fin"]):
                errores.append(f"{nombre}: {tid}: el tiempo «{e['tiempo']}» no es fin − inicio ({elapsed(e['inicio'], e['fin'])}): ejecuta `python3 scripts/historias.py`")
    return errores


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
    """Los archivos de historia y de habilitador: docs/historias/fase-n/HU/HU-nn.md y docs/historias/fase-n/EN/EN-nn.md, por fase y luego por
    nombre. Un `EN-` en `HU/` (o al revés) no se cuenta aquí: lo informa `_errores_fases`."""
    folder = Path(root) / "docs" / "historias"
    return sorted((p for tipo in ("HU", "EN") for p in folder.glob(f"fase-*/{tipo}/*.md")
                   if FASE.match(p.parent.parent.name) and p.name.startswith(f"{tipo}-")),
                  key=lambda p: (fase_de(p), p.name))


def fase_de(path):
    """El número de fase de un archivo de historia: el de la carpeta de su carpeta (fase-2/HU/HU-12.md → 2)."""
    return int(FASE.match(path.parent.parent.name).group(1))


def base_de(path):
    """La carpeta de la historia relativa a docs/ («historias/fase-2/HU»), desde donde se resuelven sus enlaces."""
    return f"historias/{path.parent.parent.name}/{path.parent.name}"


def sort_key(story_id):
    kind, number = story_id.split("-")
    return (0 if kind == "HU" else 1, int(number))


def legacy_rows(root):
    data = json.loads((Path(root) / "docs" / "historias" / "legado.json").read_text(encoding="utf-8"))
    rows = []
    for x in data["historias"]:
        closed = x["cierre"] is not None
        rows.append({
            "id": x["id"], "fase": FASE_LEGADO, "tipo": "HU", "ligado": "", "titulo": x["titulo"], "epica": x["epica"],
            "estado": ESTADOS["cerrada"] if closed else ESTADOS["en-curso"],  # qué falta lo dicen las columnas API y Web
            "api": x["api"], "web": x["web"],
            "inicio": x["inicio"], "cierre": x["cierre"] or "—",
            "tiempo": "≈ " + fmt_minutes(x["minutos"]),
            "tareas": f"{len(x['tareas_api']) + len(x['tareas_web'])} (histórico)", "producto": "—",
            "detalle": f"[texto](../../product/04-historias-de-usuario.md#{slug(x['id'] + ' ' + x['titulo'])})",
        })
    return rows


def new_rows(root, commits):
    rows = []
    for path in story_files(root):
        text = path.read_text(encoding="utf-8")
        try:
            meta = parse_front_matter(text)
        except HistoriaError:
            continue  # sin encabezado: lo informa check(), no rompe la matriz
        if any(not meta.get(k) for k in REQUERIDOS):
            continue  # encabezado incompleto: lo informa check()
        tasks = parse_tasks(text)
        stats = story_stats(meta["id"], commits)
        done = sum(1 for _, _, s in tasks if s == "hecho")
        closed = meta["estado"] == "cerrada"
        filas = (parse_impact(text, base_de(path)) or {"filas": []})["filas"]
        rows.append({
            "id": meta["id"], "fase": fase_de(path), "tipo": meta["id"].split("-")[0], "ligado": meta.get("ligado", ""),
            "titulo": meta["titulo"], "epica": meta["epica"],
            "estado": ESTADOS.get(meta["estado"], meta["estado"]),
            "api": layer_status(tasks, "API"), "web": layer_status(tasks, "WEB"),
            "inicio": stats["inicio"].date().isoformat() if stats else "—",
            "cierre": stats["fin"].date().isoformat() if stats and closed else "—",
            "tiempo": fmt_minutes(stats["minutos"]) if stats else "—",
            "tareas": f"{done} / {len(tasks)}",
            "producto": f"{sum(1 for f in filas if f[3] == 'hecho')} / {len(filas)}" if filas else "—",
            "detalle": f"[{meta['id']}]({path.parent.name}/{path.name})",  # relativo a la matriz, que vive en la carpeta de la fase
        })
    return rows


def build_rows(root, commits):
    reemplazadas = superseded(root)
    rows = legacy_rows(root) + new_rows(root, commits)
    for row in rows:
        row["estado"] = _estado_matriz(row["estado"], row["id"], reemplazadas)
    return sorted(rows, key=lambda r: sort_key(r["id"]))


# Cada fase tiene su matriz (docs/historias/fase-n/matriz.md), generada entera: «Historias» y «Habilitadores» en secciones propias, con las
# columnas de cada tipo, y en cada una «Abiertas» (lo que todavía se trabaja, con todas las columnas) y «Cerradas» (lo terminado, con lo
# mínimo). El ID es el enlace a la historia; API y Web se escriben «icono texto»; las fechas y el tiempo van en una sola columna. El README de
# historias solo lleva un índice generado de las fases
CAPA_TEXTO = {"✅": "✅ hecha", "🔄": "🔄 en curso", "⬜": "⬜ pendiente", "—": "— no aplica"}
ID_FILA = re.compile(r"\b((?:HU|EN)-\d+)\b")
COLUMNAS = {  # (tipo, abiertas)
    ("HU", True): ("ID", "Historia", "Épica", "Estado", "API", "Web", "Cambios de producto", "Tareas", "Fechas y tiempo"),
    ("HU", False): ("ID", "Historia", "Épica", "Estado", "Cierre y tiempo"),
    ("EN", True): ("ID", "Habilitador", "Ligado a", "Estado", "Tareas", "Fechas y tiempo"),
    ("EN", False): ("ID", "Habilitador", "Ligado a", "Estado", "Cierre y tiempo"),
}
TIPOS_MATRIZ = (("HU", "Historias", "historias"), ("EN", "Habilitadores", "habilitadores"))
LEYENDA = ("**Leyenda:** estado: 💡 idea (anotada, sin desglosar) · 📝 propuesta (sin aprobar) · ⬜ aprobada · 🔄 en curso · ✅ cerrada. "
           "Columnas API y Web: ✅ hecha · 🔄 en curso · ⬜ pendiente · — no aplica. «Cambios de producto» son las filas hechas / el total de su "
           "«Impacto en el producto». Las fechas y el tiempo salen de `git log` (hora de Lima, tope de 60 min entre commits); los de la fase 1 "
           "son aproximados (≈).")


def is_closed(row):
    return row["estado"].startswith(ESTADOS["cerrada"])


def _celda_ligado(ligado):
    if not ligado:
        return "—"
    if ITEM.match(ligado):
        return ligado
    return f"[{ligado}](../../{ligado})"


def _celda_matriz(row, columna):
    if columna == "ID":
        return f"[{row['id']}]({re.search(r'\]\(([^)]*)\)', row['detalle']).group(1)})"
    if columna == "Fechas y tiempo":
        if row["inicio"] == "—":
            return "—"
        return f"{row['inicio']} → {row['cierre'] if row['cierre'] != '—' else 'en curso'} · {row['tiempo']}"
    if columna == "Cierre y tiempo":
        return f"{row['cierre']} · {row['tiempo']}"
    if columna == "Ligado a":
        return _celda_ligado(row.get("ligado", ""))
    if columna in ("API", "Web"):
        return CAPA_TEXTO[row[columna.lower()]]
    clave = {"Historia": "titulo", "Habilitador": "titulo", "Épica": "epica", "Estado": "estado", "Tareas": "tareas", "Cambios de producto": "producto"}[columna]
    return str(row[clave])


def _tabla_matriz(rows, columnas, vacio):
    if not rows:
        return vacio
    lineas = ["| " + " | ".join(columnas) + " |", "|" + "|".join("---" for _ in columnas) + "|"]
    for row in rows:
        lineas.append("| " + " | ".join(_celda_matriz(row, c) for c in columnas) + " |")
    return "\n".join(lineas)


def render_phase(fase, rows):
    """El archivo `fase-n/matriz.md` entero: historias y habilitadores de esa fase, cada uno con «Abiertas» y «Cerradas»."""
    mias = [r for r in rows if r["fase"] == fase]
    partes = [f"# Matriz de la fase {fase}", "",
              "> La genera `python3 scripts/historias.py`: no se edita a mano. El objetivo de la fase está en su [README](README.md); las reglas del "
              "proceso y el índice de todas las fases, en el [README de historias](../README.md).", "", LEYENDA, ""]
    for tipo, titulo, plural in TIPOS_MATRIZ:
        filas = [r for r in mias if r["tipo"] == tipo]
        abiertas, cerradas = [r for r in filas if not is_closed(r)], [r for r in filas if is_closed(r)]
        partes += [f"## {titulo}", "",
                   f"### Abiertas ({len(abiertas)})", "", _tabla_matriz(abiertas, COLUMNAS[(tipo, True)], f"_No hay {plural} abiertas._"), "",
                   f"### Cerradas ({len(cerradas)})", "", _tabla_matriz(cerradas, COLUMNAS[(tipo, False)], f"_Todavía no hay {plural} cerradas._"), ""]
    return "\n".join(partes)


def fase_numbers(root, rows=()):
    """Los números de fase que hay: carpetas `fase-n/` y fases de las filas (la 1 del histórico), de menor a mayor."""
    carpeta = Path(root) / "docs" / "historias"
    numeros = {int(m.group(1)) for p in carpeta.iterdir() if p.is_dir() and (m := FASE.match(p.name))} if carpeta.exists() else set()
    return sorted(numeros | {r["fase"] for r in rows})


def render_index(root, rows):
    """El índice de fases del README de historias: cuántas historias y habilitadores abiertos y cerrados tiene cada una."""
    def cuenta(fase, tipo):
        filas = [r for r in rows if r["fase"] == fase and r["tipo"] == tipo]
        cerradas = sum(1 for r in filas if is_closed(r))
        return f"{len(filas) - cerradas} abiertas · {cerradas} cerradas" if filas else "—"
    lineas = ["| Fase | Historias | Habilitadores | Matriz |", "|---|---|---|---|"]
    for n in fase_numbers(root, rows):
        lineas.append(f"| [Fase {n}](fase-{n}/README.md) | {cuenta(n, 'HU')} | {cuenta(n, 'EN')} | [matriz](fase-{n}/{MATRIZ_ARCHIVO}) |")
    return "\n".join(lineas)


def write_matrix(root, commits):
    """Escribe la matriz de cada fase (entera) y el índice de fases entre las marcas del README de historias."""
    carpeta = Path(root) / "docs" / "historias"
    readme = carpeta / "README.md"
    text = readme.read_text(encoding="utf-8")
    if START not in text or END not in text:
        raise HistoriaError(f"faltan las marcas {START!r} y {END!r} en {readme}")
    rows = build_rows(root, commits)
    for n in fase_numbers(root, rows):
        (carpeta / f"fase-{n}").mkdir(parents=True, exist_ok=True)
        (carpeta / f"fase-{n}" / MATRIZ_ARCHIVO).write_text(render_phase(n, rows), encoding="utf-8")
    head, rest = text.split(START, 1)
    _, tail = rest.split(END, 1)
    readme.write_text(f"{head}{START}\n{render_index(root, rows)}\n{END}{tail}", encoding="utf-8")


# ---------- impacto en el producto: lo vivo se mantiene al día y la historia deja el rastro ----------

def _limpia_doc(raw, base="historias"):
    """El documento de una fila de impacto: sin comillas de código; de un enlace, su id si el texto es RN-nn/DP-nn/PA-nn y, si no,
    la ruta de su destino relativa a docs/ («[contenido](../product/07-contenido-y-mensajes.md)» → «product/07-contenido-y-mensajes.md»;
    los enlaces se resuelven desde la carpeta de la historia, `base`: docs/historias/fase-2 → «historias/fase-2»)."""
    raw = raw.strip()
    enlace = re.match(r"^\[([^\]]*)\]\(([^)]*)\)$", raw)
    if enlace:
        texto = enlace.group(1).strip("` ").strip()
        return texto if ITEM.match(texto) else posixpath.normpath(posixpath.join(base, enlace.group(2).split("#")[0]))
    return raw.strip("` ").strip()


def parse_impact(text, base="historias"):
    """None si no hay sección; si no, {"sin": declara «Sin impacto», "filas": [(documento, qué, acción, estado)], "malas": [filas mal formadas]}."""
    cuerpo = section(text, IMPACTO)
    if cuerpo is None:
        return None
    filas, malas = [], []
    for line in cuerpo.splitlines():
        line = line.strip()
        if not line.startswith("|") or set(line) <= set("|-: "):
            continue
        partes = [p.strip() for p in line.strip("|").split("|")]
        if partes[0] == "Documento":
            continue
        if len(partes) != 4:
            malas.append(line)
            continue
        filas.append((_limpia_doc(partes[0], base), partes[1], partes[2], partes[3]))
    return {"sin": SIN_IMPACTO in cuerpo, "filas": filas, "malas": malas}


def item_lines(root, item):
    """Las líneas que DEFINEN una regla, decisión o pantalla en su documento: `| RN-13 | …` o `- **PA-02 …`."""
    path = Path(root) / VIVOS[item[:2]]
    if not path.exists():
        return []
    patron = re.compile(rf"^\s*(?:\|\s*|[-*]\s+\*\*){re.escape(item)}\b")
    return [line for line in path.read_text(encoding="utf-8").splitlines() if patron.match(line)]


def has_change_mark(lines, sid):
    """¿Alguna línea lleva «Cambios: … HU-nn …»? (la marca acumula historias: «Cambios: HU-12 (2026-10-31), HU-30 (…)»)."""
    return any(re.search(rf"Cambios:[^|]*\b{re.escape(sid)}\b", line) for line in lines)


def _errores_documento(root, nombre, sid, doc, accion, estado):
    """Los errores de UNA fila de impacto sobre un documento: existe, y si está hecha, dejó su marca."""
    if ITEM.match(doc):
        donde, lineas = VIVOS[doc[:2]], item_lines(root, doc)
        existe = bool(lineas)
    elif re.search(r"\.\w+$", doc):
        donde, lineas = f"docs/{doc}", []
        existe = (Path(root) / "docs" / doc).exists()
    else:
        return [f"{nombre}: «## {IMPACTO}» cita «{doc}», que no es una regla, decisión o pantalla (RN-nn, DP-nn, PA-nn) ni una ruta de documento con extensión, relativa a docs/ (por ejemplo product/07-contenido-y-mensajes.md)"]
    if not existe and (accion != "agrega" or estado == "hecho"):
        quien = "no existe en" if ITEM.match(doc) else "no existe:"
        return [f"{nombre}: «## {IMPACTO}» cita {doc} ({accion}, {estado}) y {quien} {donde}"]
    if not existe or estado != "hecho" or not ITEM.match(doc):
        return []
    errores = []
    if not has_change_mark(lineas, sid):
        errores.append(f"{nombre}: {doc} está marcado como hecho en «## {IMPACTO}» y su línea de {donde} no lleva «Cambios: {sid} (fecha)»")
    if accion == "retira" and not any(re.search(r"retirad|reemplazad", linea, re.I) for linea in lineas):
        errores.append(f"{nombre}: {doc} se retira y su línea de {donde} no dice que está retirada (o «reemplazada por …»)")
    return errores


def _errores_ligado(root, nombre, meta):
    """Un habilitador (`EN-nn`) no nace de una persona que pide algo, así que se liga a su porqué: una regla (RN-nn), una decisión
    (DP-nn) o un documento de docs/ (con ancla opcional). Una historia no necesita `ligado:`."""
    if meta.get("tipo") != "EN":
        return []
    ligado = meta.get("ligado", "")
    donde = "una regla o decisión (RN-nn, DP-nn) o un documento de docs/, por ejemplo backend/05-piezas-clave.md#convención-por-contexto"
    if not ligado:
        return [f"{nombre}: un habilitador se liga a algo y le falta `ligado:` en el encabezado ({donde})"]
    if ITEM.match(ligado):
        return [] if item_lines(root, ligado) else [f"{nombre}: `ligado: {ligado}` no existe en {VIVOS[ligado[:2]]}"]
    ruta = ligado.split("#")[0]
    if re.search(r"\.\w+$", ruta):
        return [] if (Path(root) / "docs" / ruta).exists() else [f"{nombre}: `ligado: {ligado}` apunta a docs/{ruta}, que no existe"]
    return [f"{nombre}: `ligado: {ligado}` no es una regla, una decisión ni la ruta de un documento ({donde})"]


def _errores_impacto(root, nombre, sid, estado_hu, text, base="historias"):
    impacto = parse_impact(text, base)
    if impacto is None:
        return [f"{nombre}: le falta la sección «## {IMPACTO}» (una tabla `Documento | Qué cambia | Acción | Estado` con las reglas, decisiones, pantallas y guías que toca, o «{SIN_IMPACTO}»)"]
    errores = [f"{nombre}: una fila de «## {IMPACTO}» no tiene 4 columnas (Documento | Qué cambia | Acción | Estado; una celda no puede llevar «|»): {linea}" for linea in impacto["malas"]]
    if not impacto["filas"] and not impacto["malas"] and not impacto["sin"]:
        errores.append(f"{nombre}: «## {IMPACTO}» no tiene tabla ni dice «{SIN_IMPACTO}»")
    for doc, que, accion, estado in impacto["filas"]:
        if accion not in ACCIONES:
            errores.append(f"{nombre}: {doc}: la acción «{accion}» no es válida en «## {IMPACTO}» (usa {', '.join(ACCIONES)})")
        if estado not in ESTADOS_IMPACTO:
            errores.append(f"{nombre}: {doc}: el estado «{estado}» no es válido en «## {IMPACTO}» (usa {', '.join(ESTADOS_IMPACTO)})")
        if accion in ACCIONES and estado in ESTADOS_IMPACTO:
            errores += _errores_documento(root, nombre, sid, doc, accion, estado)
    if estado_hu == "cerrada" and any(e == "pendiente" for _, _, _, e in impacto["filas"]):
        errores.append(f"{nombre}: está cerrada pero tiene cambios de producto pendientes en «## {IMPACTO}» (cada uno debe quedar escrito en su documento y marcado «hecho»)")
    return errores


def conflicts(root):
    """Avisos (no errores): dos historias abiertas con un cambio PENDIENTE sobre el mismo documento; hay que decidir el orden."""
    por_doc = {}
    for path in story_files(root):
        text = path.read_text(encoding="utf-8")
        meta = parse_front_matter(text)
        impacto = parse_impact(text, base_de(path))
        if meta.get("estado") == "cerrada" or not impacto:
            continue
        for doc, _, _, estado in impacto["filas"]:
            if estado == "pendiente" and meta["id"] not in por_doc.setdefault(doc, []):
                por_doc[doc].append(meta["id"])
    return [f"{doc} lo cambian a la vez {', '.join(sids)}, que siguen abiertas: decidan el orden (o fusiónenlas) antes de redactar el cambio"
            for doc, sids in por_doc.items() if len(sids) > 1]


def superseded(root):
    """{id de la historia reemplazada: id de la que la reemplaza}, del campo `reemplaza:` del encabezado."""
    mapa = {}
    for path in story_files(root):
        meta = parse_front_matter(path.read_text(encoding="utf-8"))
        if meta.get("reemplaza"):
            mapa[meta["reemplaza"]] = meta["id"]
    return mapa


def _estado_matriz(estado, sid, reemplazadas):
    return f"{estado} · superada por {reemplazadas[sid]}" if sid in reemplazadas else estado


def _fecha_del_cambio(text, tasks):
    """AAAA-MM-DD en que terminó la última tarea [DOC] hecha de la historia (cuando se escribieron los documentos), o «—»."""
    ejecucion = parse_execution(text) or {}
    fines = [ejecucion[tid]["fin"] for tid, capa, estado in tasks if capa == "DOC" and estado == "hecho" and ejecucion.get(tid, {}).get("fin")]
    return max(fines)[:10] if fines else "—"


def _enlace_documento(doc):
    if ITEM.match(doc):
        return f"[{doc}]({Path(VIVOS[doc[:2]]).name})"
    destino = posixpath.relpath(f"docs/{doc}", "docs/product")
    return f"[{doc}]({destino})"


def render_changes(root):
    """La tabla del registro: primero lo ya escrito, por fecha; al final lo pendiente."""
    filas = []
    for path in story_files(root):
        text = path.read_text(encoding="utf-8")
        meta, impacto = parse_front_matter(text), parse_impact(text, base_de(path))
        if not impacto:
            continue
        fecha = _fecha_del_cambio(text, parse_tasks(text))
        for doc, que, accion, estado in impacto["filas"]:
            hecho = estado == "hecho"
            clave = (0 if hecho else 1, (fecha if fecha != "—" else "9999") if hecho else "", sort_key(meta["id"]), len(filas))
            filas.append((clave, f"| {fecha if hecho else '—'} | [{meta['id']}](../historias/{path.parent.parent.name}/{path.parent.name}/{path.name}) | {_enlace_documento(doc)} | {accion} | {que} | {estado} |"))
    if not filas:
        return "_Todavía no hay cambios registrados._"
    cabecera = ["| Fecha | Historia | Documento | Acción | Qué cambia | Estado |", "|---|---|---|---|---|---|"]
    return "\n".join(cabecera + [fila for _, fila in sorted(filas)])


def write_changes(root):
    path = Path(root) / CAMBIOS
    tabla = f"{CAMBIOS_INICIO}\n{render_changes(root)}\n{CAMBIOS_FIN}"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(CAMBIOS_ENCABEZADO + tabla + "\n", encoding="utf-8")
        return
    text = path.read_text(encoding="utf-8")
    if CAMBIOS_INICIO not in text or CAMBIOS_FIN not in text:
        raise HistoriaError(f"faltan las marcas {CAMBIOS_INICIO!r} y {CAMBIOS_FIN!r} en {path}")
    head, rest = text.split(CAMBIOS_INICIO, 1)
    _, tail = rest.split(CAMBIOS_FIN, 1)
    path.write_text(f"{head}{tabla}{tail}", encoding="utf-8")


def _errores_registro(root):
    path = Path(root) / CAMBIOS
    aviso = f"{CAMBIOS} está desactualizado o no existe: ejecuta `python3 scripts/historias.py`"
    if not path.exists():
        return [aviso]
    text = path.read_text(encoding="utf-8")
    if CAMBIOS_INICIO not in text or CAMBIOS_FIN not in text:
        return [f"{CAMBIOS}: faltan las marcas {CAMBIOS_INICIO!r} y {CAMBIOS_FIN!r}"]
    actual = text.split(CAMBIOS_INICIO, 1)[1].split(CAMBIOS_FIN, 1)[0].strip()
    return [] if actual == render_changes(root).strip() else [aviso]


# ---------- comprobación (solo estructura: no depende de git) ----------

def matrix_cells(root):
    """{id: {columna: texto, "_fase": n}} de las matrices de todas las fases (`fase-n/matriz.md`, cada tabla con su propio encabezado)."""
    cells, carpeta = {}, Path(root) / "docs" / "historias"
    for p in sorted(carpeta.iterdir()) if carpeta.exists() else []:
        m, archivo = FASE.match(p.name), p / MATRIZ_ARCHIVO
        if not (p.is_dir() and m and archivo.exists()):
            continue
        nombres = []
        for line in archivo.read_text(encoding="utf-8").splitlines():
            if not line.startswith("|") or set(line) <= set("|-: "):
                continue
            parts = [x.strip() for x in line.strip().strip("|").split("|")]
            if parts[0] == "ID":
                nombres = parts
            elif nombres and len(parts) == len(nombres) and ID_FILA.search(parts[0]):
                cells[ID_FILA.search(parts[0]).group(1)] = {**dict(zip(nombres, parts)), "_fase": int(m.group(1))}
    return cells


def _errores_indice(root):
    """El índice de fases del README de historias debe ser el que se generaría hoy (no depende de git: solo cuenta estados)."""
    readme = Path(root) / "docs" / "historias" / "README.md"
    if not readme.exists():
        return []
    text = readme.read_text(encoding="utf-8")
    if START not in text or END not in text:
        return [f"docs/historias/README.md: faltan las marcas del índice de fases ({START}): ejecuta `python3 scripts/historias.py`"]
    actual = text.split(START, 1)[1].split(END, 1)[0].strip()
    if actual != render_index(root, build_rows(root, [])).strip():
        return ["el índice de fases de docs/historias/README.md está desactualizado: ejecuta `python3 scripts/historias.py`"]
    return []


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


def _errores_fases(root, hay_historico):
    """Las carpetas: cada fase (`fase-n/`) tiene su README.md inicial, y sus historias van en `HU/` y sus habilitadores en `EN/`; nada
    suelto en la fase ni en docs/historias, ni en una carpeta que no sea una fase. Las carpetas `HU/` y `EN/` no se exigen vacías."""
    carpeta, errores = Path(root) / "docs" / "historias", []
    de_historia = re.compile(r"^(HU|EN)-")
    for p in sorted(carpeta.iterdir()):
        if p.is_file() and de_historia.match(p.name):
            errores.append(f"{p.name}: una historia o un habilitador va dentro de una carpeta de fase (docs/historias/fase-n/HU/ o EN/), no suelto en docs/historias")
        elif p.is_dir() and FASE.match(p.name):
            if not (p / "README.md").exists():
                errores.append(f"{p.name}: la carpeta de la fase necesita su README.md inicial (qué entra y qué queda fuera de la fase)")
            for q in sorted(p.iterdir()):
                if q.is_file() and de_historia.match(q.name):
                    errores.append(f"{p.name}/{q.name}: va en {p.name}/{q.name.split('-')[0]}/, no suelto en la fase")
                elif q.is_dir() and q.name in ("HU", "EN"):
                    errores += [f"{p.name}/{q.name}/{r.name}: un archivo `{r.name.split('-')[0]}-` no va en {q.name}/ (los {'habilitadores' if r.name.startswith('EN-') else 'historias'} van en {p.name}/{r.name.split('-')[0]}/)"
                                for r in sorted(q.glob("*.md")) if de_historia.match(r.name) and not r.name.startswith(f"{q.name}-")]
                elif q.is_dir():
                    errores.append(f"{p.name}/{q.name}/: una fase solo tiene README.md, matriz.md, HU/ y EN/ (no «{q.name}/»)")
        elif p.is_dir():
            errores += [f"{p.name}/{q.relative_to(p)}: una historia va dentro de una carpeta `fase-n` (fase-1, fase-2…), no en «{p.name}»" for q in sorted(p.rglob("*.md")) if de_historia.match(q.name)]
    if hay_historico and not (carpeta / f"fase-{FASE_LEGADO}").is_dir():
        errores.append(f"fase-{FASE_LEGADO}: las 20 historias anteriores son de la fase {FASE_LEGADO} y falta su carpeta con el README.md que la describe")
    return errores


def check(root):
    errors = []
    legacy = {x["id"] for x in json.loads((Path(root) / "docs" / "historias" / "legado.json").read_text(encoding="utf-8"))["historias"]}
    seen = set(legacy)
    expected, reemplazos, fases_de = {}, {}, {}
    errors += _errores_fases(root, bool(legacy))
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
        if path.stem != sid or not re.match(r"^(HU|EN)-\d+$", sid):
            errors.append(f"{path.name}: el nombre del archivo debe ser solo su correlativo: «{sid}.md» (sin el título), dentro de fase-n/HU/ o fase-n/EN/")
        if sid in seen:
            errors.append(f"{path.name}: id repetido ({sid})")
        seen.add(sid)
        if meta["estado"] not in ESTADOS:
            errors.append(f"{path.name}: estado «{meta['estado']}» no válido (usa {', '.join(ESTADOS)})")
            continue
        if meta["estado"] == "idea":  # solo el encabezado: sin tareas, secciones ni ligadura hasta que se promueva a propuesta
            if any(s in ("hecho", "en-curso") for _, _, s in parse_tasks(text)):
                errors.append(f"{path.name}: es una idea pero tiene tareas hechas o en curso (promuévela a propuesta completando la plantilla)")
            expected[sid] = ESTADOS["idea"]
            fases_de[sid] = fase_de(path)
            if meta.get("reemplaza"):
                reemplazos[sid] = meta["reemplaza"]
            continue
        errors += _errores_ligado(root, path.name, meta)
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
        errors += _comprobar_ejecucion(path.name, text, tasks)
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
        errors += _errores_impacto(root, path.name, sid, meta["estado"], text, base_de(path))
        if meta["estado"] == "cerrada":
            if any(s != "hecho" for _, _, s in tasks) or not tasks:
                errors.append(f"{path.name}: está cerrada pero tiene tareas sin hacer")
            if meta["tipo"] == "HU" and not any(c == "E2E" for _, c, _ in tasks):
                errors.append(f"{path.name}: una HU cerrada necesita su tarea [E2E] (el «Listo cuando…» de punta a punta)")
        if meta["estado"] == "propuesta" and any(s in ("hecho", "en-curso") for _, _, s in tasks):
            errors.append(f"{path.name}: es una propuesta pero tiene tareas hechas o en curso")
        expected[sid] = ESTADOS[meta["estado"]]
        fases_de[sid] = fase_de(path)
        if meta.get("reemplaza"):
            reemplazos[sid] = meta["reemplaza"]
    for sid, viejo in reemplazos.items():
        if viejo == sid or viejo not in seen:
            errors.append(f"{sid}: «reemplaza: {viejo}» no es una historia que exista (y una historia no puede reemplazarse a sí misma)")
    reemplazadas = {viejo: sid for sid, viejo in reemplazos.items()}
    expected = {sid: _estado_matriz(estado, sid, reemplazadas) for sid, estado in expected.items()}
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
    for n in fase_numbers(root):
        if not (Path(root) / "docs" / "historias" / f"fase-{n}" / MATRIZ_ARCHIVO).exists():
            errors.append(f"fase-{n}: falta {MATRIZ_ARCHIVO}: ejecuta `python3 scripts/historias.py`")
    for sid, estado in expected.items():
        fase = fases_de[sid]
        if sid not in cells:
            errors.append(f"la matriz de la fase {fase} no tiene fila para {sid}: ejecuta `python3 scripts/historias.py`")
        elif cells[sid]["_fase"] != fase:
            errors.append(f"{sid} figura en la matriz de la fase {cells[sid]['_fase']} y su archivo está en la fase {fase}: ejecuta `python3 scripts/historias.py`")
        elif cells[sid]["Estado"] != estado:
            errors.append(f"la matriz dice «{cells[sid]['Estado']}» para {sid} y su archivo «{estado}»: ejecuta `python3 scripts/historias.py`")
    for sid in legacy:
        if sid not in cells:
            errors.append(f"la matriz de la fase {FASE_LEGADO} no tiene fila para {sid} (histórica): ejecuta `python3 scripts/historias.py`")
    errors += _errores_indice(root)
    return errors + _errores_registro(root)


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
        cambiados, avisos = stamp_all(root, datetime.now(LIMA))
        for nombre in cambiados:
            print(f"ejecución: {nombre}")
        for aviso in avisos:
            print("⚠", aviso)
        write_matrix(root, git_commits(root))
        print("matrices actualizadas: docs/historias/fase-n/matriz.md y el índice de docs/historias/README.md")
        write_changes(root)
        print(f"registro de cambios actualizado: {CAMBIOS}")
    for aviso in conflicts(root):
        print("⚠", aviso)
    errors = check(root)
    for e in errors:
        print("✗", e)
    if errors:
        return 1
    print("✓ historias en orden")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
