"""Pruebas de scripts/historias.py (la matriz de historias). Se ejecutan con: cd scripts && python3 -m unittest test_historias"""
import json
import re
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import historias as h

LIMA = timezone(timedelta(hours=-5))
ROOT = Path(__file__).resolve().parent.parent


def at(hour, minute=0, day=30):
    return datetime(2026, 10, day, hour, minute, tzinfo=LIMA)


# ---------- constructores de historias de prueba ----------

TAREAS = [
    ("HU-12.1", "DOC", "producto", "normal", "hecho"),
    ("HU-12.2", "API", "regla", "critico", "hecho"),
    ("HU-12.3", "API", "contrato", "normal", "pendiente"),
    ("HU-12.4", "WEB", "pantalla", "normal", "pendiente"),
]


def fila(tid, capa, tipo, rigor, estado, tarea="Tarea", objetivo="Objetivo", dep="—"):
    c = h.cell
    return f"| {tid} | {c('capa', capa)} | {c('tipo', tipo)} | {c('rigor', rigor)} | {tarea} | {objetivo} | {dep} | {c('estado', estado)} |"


def bloque(tid, rigor, estado, checks=("una comprobación",), reglas=True):
    marca = "x" if estado == "hecho" else " "
    lines = [f"### {tid} Tarea", "", "**Se comprueba**", ""] + [f"- [{marca}] {c}" for c in checks]
    if rigor == "critico" and reglas:
        lines += ["", "**Reglas e invariantes**", "", "- nunca negativa"]
    return "\n".join(lines)


def ejecucion(tareas):
    """La tabla «## Ejecución» coherente con el estado de cada tarea (hecho: inicio, fin y tiempo; en-curso: solo inicio)."""
    filas = []
    for t in tareas:
        if t[4] == "hecho":
            ini, fin, tm = "2026-10-30 09:00", "2026-10-30 09:30", "30 min"
        elif t[4] == "en-curso":
            ini, fin, tm = "2026-10-30 09:00", "—", "—"
        else:
            ini, fin, tm = "—", "—", "—"
        filas.append(f"| {t[0]} | {ini} | {fin} | {tm} |")
    return "## Ejecución\n\n" + h.EJEC_INICIO + "\n| # | Inicio | Fin | Tiempo |\n|---|---|---|---|\n" + "\n".join(filas) + "\n" + h.EJEC_FIN + "\n"


SIN_IMPACTO = "## Impacto en el producto\n\nSin impacto en el producto.\n"


def impacto(filas):
    """La sección «## Impacto en el producto» con una tabla (documento, qué cambia, acción, estado)."""
    cab = "| Documento | Qué cambia | Acción | Estado |\n|---|---|---|---|"
    return "## Impacto en el producto\n\n" + cab + "\n" + "\n".join(f"| {a} | {b} | {c} | {d} |" for a, b, c, d in filas) + "\n"


def hu(tareas=TAREAS, estado="aprobada", contrato=True, pantalla=True, detalle=True, sid="HU-12", exec_=True, impacto_=SIN_IMPACTO, reemplaza="", tipo="HU", ligado=""):
    partes = [f"---\nid: {sid}\ntitulo: Ver si hay stock de un libro\ntipo: {tipo}\nepica: Catálogo\nestado: {estado}\namplia:\nreemplaza: {reemplaza}\nligado: {ligado}\n---\n", f"# {sid}\n"]
    if contrato:
        partes.append("## Contrato\n\nSin cambios en el contrato.\n")
    if pantalla:
        partes.append("## Pantalla\n\nSin cambios visuales.\n")
    if impacto_:
        partes.append(impacto_)
    cab = "| # | Capa | Tipo | Rigor | Tarea | Objetivo | Depende de | Estado |\n|---|---|---|---|---|---|---|---|"
    partes.append("## Tareas\n\n" + cab + "\n" + "\n".join(fila(*t) for t in tareas) + "\n")
    if exec_:
        partes.append(ejecucion(tareas))
    if detalle:
        partes.append("## Detalle de las tareas\n\n" + "\n\n".join(bloque(t[0], t[3], t[4]) for t in tareas) + "\n")
    return "\n".join(partes)


HU_OK = hu()

def _fila_tipo(capa, tipo, cambia, ejemplos, siempre):
    return f"> | {h.cell('capa', capa)} | {h.cell('tipo', tipo)} | {cambia} | {ejemplos} | {siempre} |"


PLANTILLA_OK = "\n".join(
    [
        "# plantilla",
        "",
        "> | Capa | Tipo | ¿Qué cambia? | Ejemplos | ¿Siempre critico? |",
        "> |---|---|---|---|---|",
        _fila_tipo("API", "contrato", "Lo que la API ofrece", "Un campo más", "no"),
        _fila_tipo("API", "regla", "Cómo decide el negocio", "Un límite", "no"),
        _fila_tipo("API", "evento", "Un aviso entre partes", "Reaccionar a algo", "sí"),
        _fila_tipo("API", "base-de-datos", "Las tablas", "Una columna", "sí"),
        _fila_tipo("API", "configuracion", "Una variable de entorno", "`JWT_SECRET`", "no"),
        _fila_tipo("API", "refactor", "La estructura del código, no su comportamiento", "Renombrar o mover un archivo", "no"),
        _fila_tipo("WEB", "pantalla", "Lo que se ve", "Mover un botón", "no"),
        _fila_tipo("WEB", "comportamiento", "Lo que la tienda hace", "Pedir un campo", "no"),
        _fila_tipo("WEB", "refactor", "La estructura del código de la tienda", "Mover un componente", "no"),
        _fila_tipo("DOC", "producto", "Reglas y decisiones", "`RN-13`", "no"),
        _fila_tipo("DOC", "guia", "Guías técnicas", "`CLAUDE.md`", "no"),
        _fila_tipo("E2E", "recorrido", "El recorrido de punta a punta", "—", "no"),
        "",
    ]
)


def tabla_de_valores(titulo, filas):
    """«### título» y su tabla `| Valor | Icono | Qué significa |`, como las escribe el diccionario de plantillas/README.md."""
    cuerpo = "\n".join(f"| `{valor}` | {icono} | …algo… |" for valor, icono in filas)
    return f"### {titulo}\n\n| Valor | Icono | Qué significa |\n|---|---|---|\n{cuerpo}\n"


TABLAS_DE_VALORES = {  # título de la tabla -> sus filas (valor, icono), construidas desde las constantes del script
    "Tipo de historia": [(t, "") for t in ("HU", "EN")],
    "Estados de una historia o un habilitador": [(k, v.split(" ")[0]) for k, v in h.ESTADOS.items()],
    "Estados de una tarea": [(k, h.ICONOS["estado"][k]) for k in h.ESTADOS_TAREA],
    "Capas de una tarea": [(k, h.ICONOS["capa"][k]) for k in h.CAPAS],
    "Rigor de una tarea": [(k, h.ICONOS["rigor"][k]) for k in h.RIGORES],
    "Acciones del impacto en el producto": [(k, "") for k in h.ACCIONES],
    "Estados del impacto en el producto": [(k, "") for k in h.ESTADOS_IMPACTO],
    "Épicas de las historias": [(k, "") for k in h.EPICAS],
    "Campos del encabezado": [(k, "") for k in ("id", "titulo", "tipo", "epica", "estado", "amplia", "reemplaza", "ligado")],
    "Columnas de la tabla de tareas": [(k, "") for k in ("#",) + h.COLUMNAS_TAREA],
}
DICCIONARIO_OK = "# Plantillas y diccionario\n\n## Tipos de tarea\n\n" + PLANTILLA_OK + "\n" + "\n".join(tabla_de_valores(t, f) for t, f in TABLAS_DE_VALORES.items())


ESTADOS_HIST, ESTADOS_TAR = "Estados de una historia o un habilitador", "Estados de una tarea"
_DE_TAREAS = (ESTADOS_TAR, "Capas de una tarea", "Rigor de una tarea", "Columnas de la tabla de tareas", "Acciones del impacto en el producto", "Estados del impacto en el producto")
# las tablas de cada plantilla que salen de los valores del script (las especiales, los campos del encabezado y las secciones, salen del propio archivo)
TABLAS_DE_PLANTILLA = {"HU": (ESTADOS_HIST,) + _DE_TAREAS + ("Épicas de las historias",), "EN": (ESTADOS_HIST,) + _DE_TAREAS, "idea": (ESTADOS_HIST,)}
CAMPOS_DE_PLANTILLA = {"HU": ("id", "titulo", "tipo", "epica", "estado", "amplia", "reemplaza"), "EN": ("id", "titulo", "tipo", "estado", "amplia", "reemplaza", "ligado"), "idea": ("id", "titulo", "tipo", "epica", "estado", "amplia", "reemplaza")}
SECCIONES_DE_PLANTILLA = {"HU": ("Criterios", "Listo cuando", "Tareas"), "EN": ("Criterios", "Lo que hay hoy", "Listo cuando", "Tareas"), "idea": ()}
ESPECIALES = ("Campos del encabezado", "Secciones de la plantilla")
# la tabla del resumen que abre el cuerpo de cada plantilla (la primera tabla fuera de una cita, tras el título)
RESUMEN_DE_PLANTILLA = {"HU": ("Como", "Quiero", "Para", "Reglas", "Pantallas", "Rutas"), "EN": ("Para", "Porque", "Ligado a"), "idea": ("Qué", "Origen", "Por qué importa", "Estado de la decisión")}


CRITERIOS_DE_PLANTILLA = ("Dado", "Cuando", "Entonces")  # las columnas de la tabla de «## Criterios» de HU.md y EN.md


def criterios_de(columnas=CRITERIOS_DE_PLANTILLA):
    return "| " + " | ".join(columnas) + " |\n|" + "---|" * len(columnas) + "\n| … | … | … |\n"


def resumen_de(nombre, filas=None):
    return "| Campo | Contenido |\n|---|---|\n" + "".join(f"| {c} | … |\n" for c in (filas or RESUMEN_DE_PLANTILLA[nombre]))


def tabla_en_plantilla(titulo, filas):
    """Una tabla como la lleva una plantilla: dentro de una cita, bajo un título en negrita."""
    texto = f"**{titulo}**\n\n| Valor | Icono | Qué significa |\n|---|---|---|\n" + "\n".join(f"| `{v}` | {i} | algo |" for v, i in filas)
    return "\n".join(f"> {l}" if l else ">" for l in texto.splitlines()) + "\n"


def plantilla_de(nombre):
    """Una plantilla mínima y válida: su encabezado, sus secciones y las tablas que el script comprueba."""
    campos, secciones = CAMPOS_DE_PLANTILLA[nombre], SECCIONES_DE_PLANTILLA[nombre]
    texto = "---\n" + "".join(f"{c}: x\n" for c in campos) + "---\n\n# x Título\n\n" + resumen_de(nombre) + "\n" + "".join(f"## {s}\n\n" + (criterios_de() if s == "Criterios" else "texto\n") + "\n" for s in secciones) + "\n"
    texto += "\n".join(tabla_en_plantilla(titulo, TABLAS_DE_VALORES[titulo]) for titulo in TABLAS_DE_PLANTILLA[nombre])
    if nombre != "idea":
        texto += "\n" + tabla_en_plantilla(ESPECIALES[0], [(c, "") for c in campos]) + "\n" + tabla_en_plantilla(ESPECIALES[1], [(s, "") for s in secciones])
    return texto


class Parseo(unittest.TestCase):
    def test_encabezado(self):
        meta = h.parse_front_matter(HU_OK)
        self.assertEqual(meta["id"], "HU-12")
        self.assertEqual(meta["titulo"], "Ver si hay stock de un libro")
        self.assertEqual(meta["estado"], "aprobada")
        self.assertEqual(meta["amplia"], "")

    def test_sin_encabezado_es_un_error(self):
        with self.assertRaises(h.HistoriaError):
            h.parse_front_matter("# solo un título\n")

    def test_tareas_con_su_capa_y_estado(self):
        self.assertEqual(
            h.parse_tasks(HU_OK),
            [("HU-12.1", "DOC", "hecho"), ("HU-12.2", "API", "hecho"), ("HU-12.3", "API", "pendiente"), ("HU-12.4", "WEB", "pendiente")],
        )

    def test_tipo_y_rigor_de_cada_tarea(self):
        self.assertEqual(
            h.parse_task_types(HU_OK),
            [("HU-12.1", "DOC", "producto", "normal"), ("HU-12.2", "API", "regla", "critico"), ("HU-12.3", "API", "contrato", "normal"), ("HU-12.4", "WEB", "pantalla", "normal")],
        )

    def test_estado_de_una_capa(self):
        tareas = h.parse_tasks(HU_OK)
        self.assertEqual(h.layer_status(tareas, "API"), "🔄")
        self.assertEqual(h.layer_status(tareas, "WEB"), "⬜")
        self.assertEqual(h.layer_status(tareas, "DOC"), "✅")
        self.assertEqual(h.layer_status(tareas, "E2E"), "—")  # no hay tareas de esa capa

    def test_los_bloques_de_detalle_y_sus_comprobaciones(self):
        bloques = h.parse_detail_blocks(HU_OK)
        self.assertEqual(list(bloques), ["HU-12.1", "HU-12.2", "HU-12.3", "HU-12.4"])
        self.assertEqual(bloques["HU-12.2"]["checks"], [(True, "una comprobación")])
        self.assertEqual(bloques["HU-12.3"]["checks"], [(False, "una comprobación")])
        self.assertTrue(bloques["HU-12.2"]["reglas"])
        self.assertFalse(bloques["HU-12.3"]["reglas"])


class Iconos(unittest.TestCase):
    def test_una_celda_es_icono_mas_texto(self):
        self.assertEqual(h.cell("capa", "API"), "⚙️ API")
        self.assertEqual(h.cell("tipo", "base-de-datos"), "🧊 base-de-datos")
        self.assertEqual(h.cell("rigor", "critico"), "🔴 critico")
        self.assertEqual(h.cell("rigor", "normal"), "🟢 normal")
        self.assertEqual(h.cell("estado", "en-curso"), "⏩ en-curso")
        self.assertEqual(h.cell("tipo", "producto"), "📦 producto")

    def test_se_lee_el_texto_y_el_icono(self):
        self.assertEqual(h.parse_cell("🔌 API"), ("🔌", "API"))
        self.assertEqual(h.parse_cell("API"), ("", "API"))
        self.assertEqual(h.parse_cell("[API]"), ("", "API"))  # el formato antiguo
        self.assertEqual(h.parse_cell("⬜"), ("⬜", ""))  # solo icono

    def test_un_icono_vale_con_o_sin_el_selector_de_emoji(self):
        con = h.cell("capa", "API")  # ⚙️ lleva el selector invisible
        sin = con.replace("\ufe0f", "")
        self.assertNotEqual(con, sin)
        self.assertEqual(h.parse_cell(con), h.parse_cell(sin))
        self.assertEqual(h.format_text(fila("HU-12.3", "API", "contrato", "normal", "pendiente").replace(con, sin)), fila("HU-12.3", "API", "contrato", "normal", "pendiente"))

    def test_todos_los_iconos_son_distintos_dentro_de_una_columna(self):
        for columna, mapa in h.ICONOS.items():
            self.assertEqual(len(set(mapa.values())), len(mapa), columna)

    def test_hay_un_icono_para_cada_valor_del_vocabulario(self):
        tipos = {t for ts in h.TIPOS.values() for t in ts}
        self.assertEqual(set(h.ICONOS["tipo"]), tipos)
        self.assertEqual(set(h.ICONOS["rigor"]), set(h.RIGORES))
        self.assertEqual(set(h.ICONOS["capa"]), set(h.TIPOS))
        self.assertEqual(set(h.ICONOS["estado"]), set(h.ESTADOS_TAREA))

    def test_formato_completa_los_iconos_que_faltan(self):
        crudo = "| HU-12.3 | API | contrato | normal | Tarea | Objetivo | — | pendiente |"
        self.assertEqual(h.format_text(crudo), fila("HU-12.3", "API", "contrato", "normal", "pendiente"))

    def test_formato_convierte_el_formato_antiguo_y_los_estados_de_solo_icono(self):
        viejo = "| HU-12.3 | [API] | contrato | normal | Tarea | Objetivo | — | ⏳ |"
        self.assertEqual(h.format_text(viejo), fila("HU-12.3", "API", "contrato", "normal", "pendiente"))
        self.assertEqual(h.format_text("| HU-12.3 | API | contrato | normal | T | O | — | ✅ |"), fila("HU-12.3", "API", "contrato", "normal", "hecho", "T", "O"))

    def test_formato_corrige_un_icono_equivocado(self):
        malo = fila("HU-12.3", "API", "contrato", "normal", "pendiente").replace("📜", "🎨")
        self.assertEqual(h.format_text(malo), fila("HU-12.3", "API", "contrato", "normal", "pendiente"))

    def test_formato_es_idempotente_y_no_toca_lo_demas(self):
        texto = HU_OK + "\nOtra línea | con | barras\n"
        self.assertEqual(h.format_text(h.format_text(texto)), h.format_text(texto))
        self.assertEqual(h.format_text(HU_OK), HU_OK)

    def test_formato_deja_lo_que_no_entiende(self):
        raro = "| HU-12.3 | API | cosa | normal | Tarea | Objetivo | — | pendiente |"
        self.assertIn("cosa", h.format_text(raro))


class TablaDeTipos(unittest.TestCase):
    def test_lee_la_tabla_de_la_plantilla(self):
        tipos = h.parse_types_table(PLANTILLA_OK)
        self.assertEqual(tipos["API"], ["contrato", "regla", "evento", "base-de-datos", "configuracion", "refactor"])
        self.assertEqual(tipos["WEB"], ["pantalla", "comportamiento", "refactor"])
        self.assertEqual(tipos["E2E"], ["recorrido"])

    def test_lee_cuales_son_siempre_criticos(self):
        self.assertEqual(h.parse_always_critical(PLANTILLA_OK), {"evento", "base-de-datos"})

    def test_los_iconos_de_la_tabla_de_la_plantilla_son_los_del_script(self):
        self.assertEqual(h.template_icon_errors(PLANTILLA_OK), [])
        mal = PLANTILLA_OK.replace(h.cell("tipo", "regla"), "📏 regla").replace(h.cell("capa", "WEB"), "🖥 WEB")
        errores = h.template_icon_errors(mal)
        self.assertTrue(any("regla" in e and h.ICONOS["tipo"]["regla"] in e for e in errores))
        self.assertTrue(any("WEB" in e for e in errores))

    def test_el_script_y_la_tabla_coinciden(self):
        self.assertEqual({c: tuple(t) for c, t in h.parse_types_table(PLANTILLA_OK).items()}, h.TIPOS)
        self.assertEqual(h.parse_always_critical(PLANTILLA_OK), set(h.SIEMPRE_CRITICOS))

    def test_imprime_la_tabla_para_consultarla(self):
        texto = h.render_types(PLANTILLA_OK)
        self.assertIn("contrato", texto)
        self.assertIn("Lo que la API ofrece", texto)
        self.assertIn("siempre critico", texto)  # base-de-datos y evento
        self.assertIn("plantillas/README.md", texto)

    def test_la_salida_de_tipos_no_lleva_marcas_de_markdown(self):
        texto = h.render_types(PLANTILLA_OK.replace("Lo que la API ofrece", "**Lo que la API ofrece**").replace("`JWT_SECRET`", "`JWT_SECRET` y `X`"))
        self.assertNotIn("**", texto)
        self.assertNotIn("`", texto)
        self.assertIn("Lo que la API ofrece", texto)


class Ejecucion(unittest.TestCase):
    NOW = datetime(2026, 10, 30, 11, 20, tzinfo=LIMA)

    def test_lee_la_tabla_de_ejecucion(self):
        ej = h.parse_execution(HU_OK)
        self.assertEqual(ej["HU-12.1"], {"inicio": "2026-10-30 09:00", "fin": "2026-10-30 09:30", "tiempo": "30 min"})
        self.assertEqual(ej["HU-12.3"], {"inicio": None, "fin": None, "tiempo": None})

    def test_una_tarea_que_pasa_a_en_curso_recibe_su_inicio(self):
        texto = hu([TAREAS[0], ("HU-12.2", "API", "regla", "critico", "en-curso")])
        # la tarea 12.2 estaba en-curso sin sello: lo recibe ahora
        sin_sello = texto.replace("| HU-12.2 | 2026-10-30 09:00 | — | — |", "| HU-12.2 | — | — | — |")
        nuevo, avisos = h.stamp_text(sin_sello, self.NOW)
        self.assertEqual(h.parse_execution(nuevo)["HU-12.2"], {"inicio": "2026-10-30 11:20", "fin": None, "tiempo": None})
        self.assertEqual(avisos, [])

    def test_una_tarea_que_pasa_a_hecho_recibe_su_fin_y_el_tiempo(self):
        texto = hu([("HU-12.2", "API", "regla", "critico", "hecho")])
        parcial = texto.replace("| HU-12.2 | 2026-10-30 09:00 | 2026-10-30 09:30 | 30 min |", "| HU-12.2 | 2026-10-30 09:50 | — | — |")
        nuevo, _ = h.stamp_text(parcial, self.NOW)
        self.assertEqual(h.parse_execution(nuevo)["HU-12.2"], {"inicio": "2026-10-30 09:50", "fin": "2026-10-30 11:20", "tiempo": "1 h 30 min"})

    def test_no_pisa_los_sellos_que_ya_existen(self):
        nuevo, _ = h.stamp_text(HU_OK, self.NOW)
        self.assertEqual(nuevo, HU_OK)

    def test_saltar_de_pendiente_a_hecho_avisa_que_el_tiempo_no_es_fiable(self):
        texto = hu([("HU-12.2", "API", "regla", "critico", "hecho")])
        sin_sellos = texto.replace("| HU-12.2 | 2026-10-30 09:00 | 2026-10-30 09:30 | 30 min |", "| HU-12.2 | — | — | — |")
        nuevo, avisos = h.stamp_text(sin_sellos, self.NOW)
        self.assertEqual(h.parse_execution(nuevo)["HU-12.2"], {"inicio": "2026-10-30 11:20", "fin": "2026-10-30 11:20", "tiempo": "0 min"})
        self.assertTrue(any("HU-12.2" in a and "en-curso" in a for a in avisos))

    def test_las_tareas_pendientes_no_reciben_sellos(self):
        nuevo, _ = h.stamp_text(HU_OK, self.NOW)
        self.assertEqual(h.parse_execution(nuevo)["HU-12.3"], {"inicio": None, "fin": None, "tiempo": None})

    def test_crea_la_seccion_si_no_existe_y_una_fila_por_tarea(self):
        sin_seccion = hu(exec_=False)
        self.assertIsNone(h.parse_execution(sin_seccion))
        nuevo, _ = h.stamp_text(sin_seccion, self.NOW)
        ej = h.parse_execution(nuevo)
        self.assertEqual(list(ej), ["HU-12.1", "HU-12.2", "HU-12.3", "HU-12.4"])
        # la sección va entre la tabla de tareas y el detalle
        self.assertLess(nuevo.index("## Tareas"), nuevo.index("## Ejecución"))
        self.assertLess(nuevo.index("## Ejecución"), nuevo.index("## Detalle de las tareas"))

    def test_agrega_la_fila_de_una_tarea_nueva_y_quita_la_de_una_que_ya_no_existe(self):
        mas = hu(TAREAS + [("HU-12.5", "E2E", "recorrido", "normal", "pendiente")]).replace("| HU-12.5 | — | — | — |\n", "")
        nuevo, _ = h.stamp_text(mas, self.NOW)
        self.assertIn("HU-12.5", h.parse_execution(nuevo))
        menos = HU_OK.replace("| HU-12.4 | — | — | — |\n", "")
        self.assertNotIn("HU-12.4", h.parse_execution(menos))  # la fila sigue en la tabla de tareas, pero no aquí
        nuevo, _ = h.stamp_text(menos, self.NOW)
        self.assertIn("HU-12.4", h.parse_execution(nuevo))
        huerfana = HU_OK.replace(h.EJEC_FIN, "| HU-12.9 | — | — | — |\n" + h.EJEC_FIN)
        nuevo, _ = h.stamp_text(huerfana, self.NOW)
        self.assertNotIn("HU-12.9", h.parse_execution(nuevo))

    def test_el_tiempo_se_formatea(self):
        self.assertEqual(h.elapsed("2026-10-30 09:00", "2026-10-30 09:00"), "0 min")
        self.assertEqual(h.elapsed("2026-10-30 09:00", "2026-10-30 10:15"), "1 h 15 min")
        self.assertEqual(h.elapsed("2026-10-30 09:00", "2026-10-31 09:00"), "24 h")

    def test_es_idempotente(self):
        una, _ = h.stamp_text(hu(exec_=False), self.NOW)
        dos, _ = h.stamp_text(una, self.NOW + timedelta(hours=5))
        self.assertEqual(una, dos)


class Tiempo(unittest.TestCase):
    def test_formato(self):
        self.assertEqual(h.fmt_minutes(0), "0 min")
        self.assertEqual(h.fmt_minutes(35), "35 min")
        self.assertEqual(h.fmt_minutes(60), "1 h")
        self.assertEqual(h.fmt_minutes(135), "2 h 15 min")

    def test_el_hueco_con_el_commit_anterior_tiene_tope(self):
        commits = [
            ("a", at(9), "otra cosa"),
            ("b", at(9, 20), "HU-12.1 [DOC]: Decide"),  # 20 min desde el anterior
            ("c", at(20), "HU-12.2 [API]: Add"),  # 640 min: se cuenta el tope (60)
            ("d", at(20, 5), "HU-13.1 [API]: de otra HU"),
        ]
        stats = h.story_stats("HU-12", commits)
        self.assertEqual(stats["minutos"], 20 + 60)
        self.assertEqual(stats["inicio"], at(9, 20))
        self.assertEqual(stats["fin"], at(20))
        self.assertEqual(stats["commits"], 2)

    def test_el_prefijo_exige_el_punto_y_la_capa(self):
        commits = [("a", at(9), "HU-12.1 [DOC]: x"), ("b", at(9, 10), "HU-123.1 [API]: no es la HU-12"), ("c", at(9, 20), "HU-12: sin tarea")]
        self.assertEqual(h.story_stats("HU-12", commits)["commits"], 1)

    def test_sin_commits(self):
        self.assertIsNone(h.story_stats("HU-99", [("a", at(9), "nada")]))


class Matriz(unittest.TestCase):
    """Una matriz por fase (fase-n/matriz.md), con historias y habilitadores en tablas propias, y un índice de fases en el README."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.dir = self.root / "docs" / "historias"
        (self.dir / "fase-2" / "HU").mkdir(parents=True)
        (self.dir / "fase-2" / "EN").mkdir()
        (self.dir / "legado.json").write_text(
            json.dumps(
                {
                    "tope_minutos": 60,
                    "historias": [
                        {"id": "HU-01", "titulo": "Registrarme", "epica": "Cuenta", "api": "✅", "web": "✅", "inicio": "2026-10-28", "cierre": "2026-10-30", "minutos": 116, "tareas_api": ["7.3"], "tareas_web": ["F2.3"], "compartidas": []},
                        {"id": "HU-50", "titulo": "Crear un libro", "epica": "Administración", "api": "✅", "web": "⬜", "inicio": "2026-10-28", "cierre": None, "minutos": 71, "tareas_api": ["6.5"], "tareas_web": [], "compartidas": []},
                    ],
                }
            ),
            encoding="utf-8",
        )
        self.fase = self.dir / "fase-2"
        self.hu, self.en = self.fase / "HU", self.fase / "EN"
        (self.hu / "HU-12.md").write_text(HU_OK, encoding="utf-8")
        (self.en / "EN-01.md").write_text(
            hu([("EN-01.1", "API", "refactor", "normal", "pendiente")], sid="EN-01", tipo="EN", ligado="backend/05-piezas-clave.md#convención-por-contexto"),
            encoding="utf-8",
        )
        (self.dir / "README.md").write_text(f"antes\n{h.START}\nviejo\n{h.END}\ndespués\n", encoding="utf-8")
        self.commits = [("a", at(9), "HU-12.1 [DOC]: x"), ("b", at(9, 30), "HU-12.2 [API]: y")]

    def tearDown(self):
        self.tmp.cleanup()

    def filas(self):
        return h.build_rows(self.root, self.commits)

    def matriz(self, fase):
        return h.render_phase(fase, self.filas())

    @staticmethod
    def parte(texto, titulo):
        """El texto de «## <titulo>» hasta la siguiente sección de ese nivel."""
        i = texto.index(f"## {titulo}")
        j = texto.find("\n## ", i + 3)
        return texto[i:] if j == -1 else texto[i:j]

    def fila(self, texto, clave):
        return next(l for l in texto.splitlines() if clave in l)

    # --- las filas ---
    def test_filas_antiguas_y_nuevas_ordenadas_por_numero_primero_las_historias(self):
        self.assertEqual([r["id"] for r in self.filas()], ["HU-01", "HU-12", "HU-50", "EN-01"])

    def test_cada_fila_conoce_su_fase_y_su_tipo(self):
        datos = {r["id"]: (r["fase"], r["tipo"]) for r in self.filas()}
        self.assertEqual(datos, {"HU-01": (1, "HU"), "HU-12": (2, "HU"), "HU-50": (1, "HU"), "EN-01": (2, "EN")})

    def test_un_habilitador_lleva_su_ligadura_y_una_historia_no(self):
        por_id = {r["id"]: r for r in self.filas()}
        self.assertEqual(por_id["EN-01"]["ligado"], "backend/05-piezas-clave.md#convención-por-contexto")
        self.assertEqual(por_id["HU-12"]["ligado"], "")

    def test_una_historia_antigua_marca_la_aproximacion_y_enlaza_a_producto(self):
        row = self.filas()[0]
        self.assertTrue(row["tiempo"].startswith("≈ "))
        self.assertIn("../../product/04-historias-de-usuario.md#hu-01-registrarme", row["detalle"])
        self.assertEqual(row["estado"], "✅ cerrada")
        self.assertEqual(row["producto"], "—")  # las anteriores no tienen sección de impacto

    def test_una_historia_antigua_con_la_web_pendiente_no_tiene_cierre(self):
        row = next(r for r in self.filas() if r["id"] == "HU-50")
        self.assertEqual((row["api"], row["web"], row["cierre"]), ("✅", "⬜", "—"))
        self.assertEqual(row["estado"], "🔄 en curso")  # el detalle (API hecha, Web pendiente) lo dan las columnas API y Web

    def test_una_historia_nueva_toma_capas_tareas_y_tiempo_de_su_archivo_y_de_git(self):
        row = next(r for r in self.filas() if r["id"] == "HU-12")
        self.assertEqual(row["estado"], "⬜ aprobada")
        self.assertEqual((row["api"], row["web"]), ("🔄", "⬜"))
        self.assertEqual(row["tareas"], "2 / 4")
        self.assertEqual(row["inicio"], "2026-10-30")
        self.assertEqual(row["cierre"], "—")  # solo tiene cierre una HU cerrada
        self.assertEqual(row["tiempo"], "30 min")
        self.assertEqual(row["detalle"], "[HU-12](HU/HU-12.md)")  # el enlace es relativo a la matriz, que vive en la misma carpeta

    def test_la_plantilla_y_los_archivos_con_guion_bajo_se_ignoran(self):
        (self.dir / "plantillas").mkdir()
        (self.dir / "plantillas" / "HU.md").write_text("---\nid: HU-nn\n---\n", encoding="utf-8")
        self.assertEqual(len(self.filas()), 4)

    # --- el diseño de cada matriz ---
    def test_la_matriz_se_titula_por_su_fase_y_dice_que_se_genera(self):
        texto = self.matriz(2)
        self.assertTrue(texto.startswith("# Matriz de la fase 2\n"))
        self.assertIn("python3 scripts/historias.py", texto)
        self.assertNotIn("archivos", texto.splitlines()[0])

    def test_cada_matriz_solo_tiene_las_filas_de_su_fase(self):
        f1, f2 = self.matriz(1), self.matriz(2)
        for sid in ("HU-01", "HU-50"):
            self.assertIn(sid, f1)
            self.assertNotIn(sid, f2)
        for sid in ("HU-12", "EN-01"):
            self.assertIn(sid, f2)
            self.assertNotIn(sid, f1)

    def test_historias_y_habilitadores_van_en_secciones_separadas(self):
        texto = self.matriz(2)
        self.assertLess(texto.index("## Historias"), texto.index("## Habilitadores"))
        self.assertIn("HU-12", self.parte(texto, "Historias"))
        self.assertNotIn("EN-01", self.parte(texto, "Historias"))
        self.assertIn("EN-01", self.parte(texto, "Habilitadores"))
        self.assertNotIn("HU-12", self.parte(texto, "Habilitadores"))

    def test_las_columnas_de_las_historias(self):
        columnas = "| ID | Historia | Épica | Estado | API | Web | Cambios de producto | Tareas | Fechas y tiempo |"
        for fase in (1, 2):  # las dos fases, con historias abiertas y cerradas, tienen la misma tabla
            self.assertEqual(self.parte(self.matriz(fase), "Historias").count(columnas), 1, fase)
            self.assertNotIn("Cierre y tiempo", self.matriz(fase))

    def test_las_columnas_de_los_habilitadores_no_tienen_epica_ni_capas(self):
        cerrado = hu([("EN-09.1", "API", "refactor", "normal", "hecho")], sid="EN-09", tipo="EN", estado="cerrada", ligado="backend/05-piezas-clave.md")
        (self.en / "EN-09.md").write_text(cerrado, encoding="utf-8")
        hab = self.parte(self.matriz(2), "Habilitadores")
        self.assertEqual(hab.count("| ID | Habilitador | Ligado a | Estado | Tareas | Fechas y tiempo |"), 1)  # una sola tabla, con un habilitador cerrado y uno abierto
        self.assertNotIn("Cierre y tiempo", hab)
        for columna in ("Épica", "API", "Web", "Cambios de producto"):
            self.assertNotIn(columna, hab)

    def test_ninguna_matriz_lleva_columna_fase_ni_detalle(self):
        for fase in (1, 2):
            self.assertNotIn("| Fase |", self.matriz(fase))
            self.assertNotIn("Detalle", self.matriz(fase))

    def test_el_id_es_el_enlace(self):
        self.assertIn("| [HU-12](HU/HU-12.md) |", self.matriz(2))
        self.assertIn("| [HU-01](../../product/04-historias-de-usuario.md#hu-01-registrarme) |", self.matriz(1))

    def test_un_habilitador_muestra_a_que_esta_ligado_con_enlace(self):
        fila = self.fila(self.matriz(2), "EN-01")
        self.assertIn("[backend/05-piezas-clave.md#convención-por-contexto](../../backend/05-piezas-clave.md#convención-por-contexto)", fila)

    def test_una_regla_como_ligadura_se_muestra_sin_enlace_y_sin_ligadura_es_un_guion(self):
        (self.en / "EN-02.md").write_text(IDEA.format(sid="EN-02", tipo="EN"), encoding="utf-8")
        (self.en / "EN-03.md").write_text(IDEA.format(sid="EN-03", tipo="EN").replace("reemplaza:", "ligado: RN-13\nreemplaza:"), encoding="utf-8")
        texto = self.matriz(2)
        self.assertIn("| — |", self.fila(texto, "[EN-02]"))  # una idea sin ligadura
        self.assertIn("| RN-13 |", self.fila(texto, "[EN-03]"))  # una regla, sin enlace
        self.assertNotIn("](../../RN-13)", texto)

    def test_las_ideas_estan_en_la_tabla_de_su_tipo(self):
        (self.hu / "HU-30.md").write_text(IDEA.format(sid="HU-30", tipo="HU"), encoding="utf-8")
        (self.en / "EN-04.md").write_text(IDEA.format(sid="EN-04", tipo="EN"), encoding="utf-8")
        texto = self.matriz(2)
        historias, habilitadores = self.parte(texto, "Historias"), self.parte(texto, "Habilitadores")
        self.assertIn("HU-30", historias)
        self.assertIn("💡 idea", self.fila(historias, "HU-30"))
        self.assertIn("EN-04", habilitadores)
        self.assertNotIn("EN-04", historias)

    def test_api_y_web_se_escriben_icono_y_texto(self):
        texto = self.matriz(2)
        self.assertIn("| 🔄 en curso | ⬜ pendiente |", self.fila(texto, "[HU-12]"))
        self.assertIn("| ✅ hecha | ⬜ pendiente |", self.fila(self.matriz(1), "[HU-50]"))

    def test_una_capa_sin_tareas_dice_no_aplica(self):
        solo_doc = [("HU-12.1", "DOC", "producto", "normal", "pendiente")]
        (self.hu / "HU-12.md").write_text(hu(solo_doc, contrato=False, pantalla=False), encoding="utf-8")
        self.assertIn("| — no aplica | — no aplica |", self.fila(self.matriz(2), "[HU-12]"))

    def test_fechas_y_tiempo_van_en_una_sola_columna(self):
        self.assertIn("| 2026-10-28 → en curso · ≈ 1 h 11 min |", self.matriz(1))
        self.assertIn("| 2026-10-30 → en curso · 30 min |", self.matriz(2))
        cerrada = self.fila(self.matriz(1), "[HU-01]")  # una cerrada: «inicio → cierre · tiempo», no «en curso»
        self.assertRegex(cerrada, r"\| \d{4}-\d\d-\d\d → 2026-10-30 · ≈ 1 h 56 min \|$")
        self.assertNotIn("en curso", cerrada.split("✅ cerrada")[1])

    def test_una_historia_sin_commits_no_tiene_fechas(self):
        self.commits = []
        self.assertTrue(self.fila(self.matriz(2), "[HU-12]").rstrip().endswith("| — |"))

    def test_la_columna_de_cambios_de_producto_cuenta_hechos_sobre_total(self):
        (self.hu / "HU-12.md").write_text(hu(impacto_=impacto([("RN-13", "x", "modifica", "hecho"), ("PA-02", "y", "modifica", "pendiente")])), encoding="utf-8")
        self.assertIn("| 1 / 2 |", self.fila(self.matriz(2), "[HU-12]"))

    def test_un_tipo_sin_filas_conserva_su_titulo_y_lo_dice(self):
        (self.en / "EN-01.md").unlink()
        texto = self.matriz(2)
        self.assertIn("## Habilitadores\n\n_No hay habilitadores en esta fase._", texto)
        self.assertNotIn("| ID | Habilitador", texto)
        self.assertIn("_No hay habilitadores en esta fase._", self.matriz(1))  # la fase 1 no tiene habilitadores
        self.assertIn("## Historias\n\n| ID | Historia", self.matriz(1))

    def test_sin_historias_tambien_conserva_su_titulo(self):
        for archivo in self.hu.glob("*.md"):
            archivo.unlink()
        self.assertIn("## Historias\n\n_No hay historias en esta fase._", self.matriz(2))

    def test_la_matriz_no_tiene_subsecciones_ni_las_palabras_abiertas_y_cerradas(self):
        for fase in (1, 2):
            texto = self.matriz(fase)
            self.assertNotIn("### ", texto)
            self.assertNotIn("Abiertas", texto)
            self.assertNotIn("Cerradas", texto)

    def test_cada_fase_con_historias_y_habilitadores_tiene_dos_tablas(self):
        texto = self.matriz(2)
        self.assertEqual(sum(1 for l in texto.splitlines() if l.startswith("| ID |")), 2)
        self.assertEqual(sum(1 for l in self.matriz(1).splitlines() if l.startswith("| ID |")), 1)  # sin habilitadores, una

    def test_las_filas_van_por_id_sea_cual_sea_el_estado(self):
        (self.hu / "HU-05.md").write_text(IDEA.format(sid="HU-05", tipo="HU"), encoding="utf-8")
        (self.hu / "HU-30.md").write_text(IDEA.format(sid="HU-30", tipo="HU"), encoding="utf-8")
        ids = lambda texto: re.findall(r"^\| \[(HU-\d+)\]", self.parte(texto, "Historias"), re.M)
        self.assertEqual(ids(self.matriz(2)), ["HU-05", "HU-12", "HU-30"])
        self.assertEqual(ids(self.matriz(1)), ["HU-01", "HU-50"])  # una cerrada y una en curso, intercaladas por su número

    def test_una_historia_cerrada_no_cambia_de_tabla_ni_de_sitio(self):
        (self.hu / "HU-05.md").write_text(IDEA.format(sid="HU-05", tipo="HU"), encoding="utf-8")
        (self.hu / "HU-30.md").write_text(IDEA.format(sid="HU-30", tipo="HU"), encoding="utf-8")
        antes = [l.split("|")[1] for l in self.parte(self.matriz(2), "Historias").splitlines() if l.startswith("| [")]
        todas = [(t[0], t[1], t[2], t[3], "hecho") for t in TAREAS] + [("HU-12.5", "E2E", "recorrido", "normal", "hecho")]
        (self.hu / "HU-12.md").write_text(hu(todas, estado="cerrada"), encoding="utf-8")
        historias = self.parte(self.matriz(2), "Historias")
        despues = [l.split("|")[1] for l in historias.splitlines() if l.startswith("| [")]
        self.assertEqual(antes, despues)
        self.assertIn("✅ cerrada", self.fila(historias, "[HU-12]"))
        self.assertIn("API", historias.splitlines()[2])  # sigue la tabla de todas las columnas

    def test_la_leyenda_explica_los_estados_y_las_capas(self):
        texto = self.matriz(2)
        for palabra in ("💡 idea", "📝 propuesta", "⬜ aprobada", "🔄 en curso", "✅ cerrada", "— no aplica", "git log"):
            self.assertIn(palabra, texto)

    # --- escribirlas ---
    def test_se_escribe_una_matriz_por_fase_aunque_la_carpeta_aun_no_exista(self):
        h.write_matrix(self.root, self.commits)
        self.assertTrue((self.dir / "fase-2" / "matriz.md").exists())
        self.assertTrue((self.dir / "fase-1" / "matriz.md").exists())  # la fase 1 sale de legado.json
        self.assertIn("HU-12", (self.dir / "fase-2" / "matriz.md").read_text(encoding="utf-8"))
        self.assertIn("HU-50", (self.dir / "fase-1" / "matriz.md").read_text(encoding="utf-8"))

    def test_la_matriz_se_reescribe_entera(self):
        h.write_matrix(self.root, self.commits)
        (self.dir / "fase-2" / "matriz.md").write_text("editado a mano", encoding="utf-8")
        h.write_matrix(self.root, self.commits)
        self.assertTrue((self.dir / "fase-2" / "matriz.md").read_text(encoding="utf-8").startswith("# Matriz de la fase 2"))

    def test_el_readme_solo_lleva_el_indice_entre_las_marcas(self):
        h.write_matrix(self.root, self.commits)
        texto = (self.dir / "README.md").read_text(encoding="utf-8")
        self.assertTrue(texto.startswith("antes\n"))
        self.assertTrue(texto.endswith("después\n"))
        self.assertNotIn("viejo", texto)
        self.assertNotIn("HU-12", texto)  # ninguna fila de historias: eso vive en la matriz de cada fase
        self.assertIn("| Fase | Historias | Habilitadores | Matriz |", texto)

    def test_el_indice_cuenta_abiertas_y_cerradas_por_fase_y_tipo(self):
        h.write_matrix(self.root, self.commits)
        texto = (self.dir / "README.md").read_text(encoding="utf-8")
        self.assertIn("| [Fase 1](fase-1/README.md) | 1 abiertas · 1 cerradas | — | [matriz](fase-1/matriz.md) |", texto)
        self.assertIn("| [Fase 2](fase-2/README.md) | 1 abiertas · 0 cerradas | 1 abiertas · 0 cerradas | [matriz](fase-2/matriz.md) |", texto)

    def test_el_indice_ordena_las_fases_por_numero(self):
        (self.dir / "fase-10").mkdir()
        h.write_matrix(self.root, self.commits)
        texto = (self.dir / "README.md").read_text(encoding="utf-8")
        self.assertLess(texto.index("Fase 1]"), texto.index("Fase 2]"))
        self.assertLess(texto.index("Fase 2]"), texto.index("Fase 10]"))

    def test_sin_marcas_es_un_error(self):
        (self.dir / "README.md").write_text("sin marcas", encoding="utf-8")
        with self.assertRaises(h.HistoriaError):
            h.write_matrix(self.root, self.commits)

    def test_matrix_cells_lee_una_matriz_por_fase_y_dice_de_cual(self):
        h.write_matrix(self.root, self.commits)
        celdas = h.matrix_cells(self.root)
        self.assertEqual(set(celdas), {"HU-01", "HU-12", "HU-50", "EN-01"})
        self.assertEqual(celdas["HU-01"]["Estado"], "✅ cerrada")
        self.assertEqual(celdas["HU-12"]["Estado"], "⬜ aprobada")
        self.assertEqual(celdas["HU-50"]["Estado"], "🔄 en curso")
        self.assertEqual((celdas["HU-01"]["_fase"], celdas["HU-12"]["_fase"], celdas["EN-01"]["_fase"]), (1, 2, 2))


class Entorno(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.dir = self.root / "docs" / "historias"
        self.fase = self.dir / "fase-2"
        self.hu, self.en = self.fase / "HU", self.fase / "EN"
        self.hu.mkdir(parents=True)
        self.en.mkdir()
        (self.fase / "README.md").write_text("# Fase 2\n", encoding="utf-8")
        (self.dir / "legado.json").write_text(json.dumps({"historias": []}), encoding="utf-8")
        self.file = self.hu / "HU-12.md"
        self.file.write_text(HU_OK, encoding="utf-8")
        (self.dir / "README.md").write_text(f"{h.START}\n{h.END}\n", encoding="utf-8")
        h.write_matrix(self.root, [])
        h.write_changes(self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def errors(self):
        return h.check(self.root)

    def escribe(self, texto):
        self.file.write_text(texto, encoding="utf-8")

    def con_tareas(self, tareas, **kw):
        self.escribe(hu(tareas, **kw))

    def escribe_diccionario(self, texto):
        """plantillas/README.md (el diccionario) y las tres plantillas, que el comprobador exige junto a él."""
        (self.dir / "plantillas").mkdir(exist_ok=True)
        (self.dir / "plantillas" / "README.md").write_text(texto, encoding="utf-8")
        for nombre in ("HU", "EN", "idea"):
            (self.dir / "plantillas" / f"{nombre}.md").write_text(plantilla_de(nombre), encoding="utf-8")

    def hay(self, *palabras):
        return any(all(p in e for p in palabras) for e in self.errors())


class Comprobacion(Entorno):
    # --- lo básico ---
    def test_todo_en_orden(self):
        self.assertEqual(self.errors(), [])

    def test_el_nombre_del_archivo_empieza_por_el_id(self):
        self.file.rename(self.hu / "HU-13.md")
        self.assertTrue(self.hay("nombre"))

    def test_estado_invalido(self):
        self.escribe(HU_OK.replace("estado: aprobada", "estado: terminada"))
        self.assertTrue(self.hay("estado"))

    def test_una_tarea_de_otra_historia_en_el_archivo(self):
        self.escribe(HU_OK.replace("| HU-12.4 |", "| HU-13.1 |"))
        self.assertTrue(self.hay("HU-13.1"))

    def test_id_repetido_entre_el_legado_y_un_archivo(self):
        (self.dir / "legado.json").write_text(
            json.dumps({"historias": [{"id": "HU-12", "titulo": "x", "epica": "Cuenta", "api": "✅", "web": "✅", "inicio": "2026-10-28", "cierre": "2026-10-28", "minutos": 1, "tareas_api": [], "tareas_web": [], "compartidas": []}]}),
            encoding="utf-8",
        )
        self.assertTrue(self.hay("repetido"))

    def test_una_historia_sin_fila_en_la_matriz(self):
        (self.fase / "matriz.md").write_text("# Matriz de la fase 2\n", encoding="utf-8")
        self.assertTrue(self.hay("matriz", "HU-12"))

    # --- cierre ---
    def test_una_historia_cerrada_con_tareas_pendientes(self):
        self.escribe(HU_OK.replace("estado: aprobada", "estado: cerrada"))
        self.assertTrue(self.hay("cerrada"))

    def test_una_hu_cerrada_necesita_su_tarea_e2e(self):
        todas_hechas = [(t[0], t[1], t[2], t[3], "hecho") for t in TAREAS]
        self.con_tareas(todas_hechas, estado="cerrada")
        self.assertTrue(self.hay("E2E"))
        self.con_tareas(todas_hechas + [("HU-12.5", "E2E", "recorrido", "normal", "hecho")], estado="cerrada")
        h.write_matrix(self.root, [])  # el estado de la historia cambió: la matriz se regenera
        self.assertEqual(self.errors(), [])

    def test_una_historia_propuesta_no_puede_tener_tareas_hechas(self):
        self.escribe(HU_OK.replace("estado: aprobada", "estado: propuesta"))
        self.assertTrue(self.hay("propuesta"))

    # --- carpetas de fase ---
    def test_el_archivo_lleva_solo_el_correlativo_no_el_titulo(self):
        self.file.rename(self.hu / "HU-12-ver-si-hay-stock.md")
        self.assertTrue(self.hay("nombre", "HU-12.md"))

    def test_una_historia_suelta_fuera_de_una_carpeta_de_fase(self):
        (self.dir / "HU-14.md").write_text(HU_OK.replace("HU-12", "HU-14"), encoding="utf-8")
        self.assertTrue(self.hay("HU-14.md", "fase-"))

    def test_una_historia_en_una_carpeta_que_no_es_una_fase(self):
        (self.dir / "mvp").mkdir()
        (self.dir / "mvp" / "HU-14.md").write_text(HU_OK.replace("HU-12", "HU-14"), encoding="utf-8")
        self.assertTrue(self.hay("HU-14.md", "fase-"))

    def test_cada_fase_necesita_su_readme_inicial(self):
        (self.fase / "README.md").unlink()
        self.assertTrue(self.hay("fase-2", "README.md"))

    def test_una_fase_sin_historias_tambien_necesita_su_readme(self):
        (self.dir / "fase-3").mkdir()
        self.assertTrue(self.hay("fase-3", "README.md"))

    def test_si_hay_historico_existe_la_fase_1_con_su_readme(self):
        (self.dir / "legado.json").write_text(
            json.dumps({"historias": [{"id": "HU-05", "titulo": "x", "epica": "Cuenta", "api": "✅", "web": "✅", "inicio": "2026-10-28", "cierre": "2026-10-28", "minutos": 1, "tareas_api": [], "tareas_web": [], "compartidas": []}]}),
            encoding="utf-8",
        )
        h.write_matrix(self.root, [])
        self.assertTrue(self.hay("fase-1", "README.md"))
        (self.dir / "fase-1").mkdir(exist_ok=True)
        (self.dir / "fase-1" / "README.md").write_text("# Fase 1 (MVP)\n", encoding="utf-8")
        self.assertEqual(self.errors(), [])

    def test_las_historias_se_listan_por_fase_y_luego_por_nombre(self):
        (self.dir / "fase-1" / "HU").mkdir(parents=True)
        (self.dir / "fase-1" / "HU" / "HU-30.md").write_text(HU_OK.replace("HU-12", "HU-30"), encoding="utf-8")
        (self.dir / "fase-10" / "HU").mkdir(parents=True)
        (self.dir / "fase-10" / "HU" / "HU-01.md").write_text(HU_OK.replace("HU-12", "HU-01"), encoding="utf-8")
        self.assertEqual([f"{p.parent.parent.name}/{p.name}" for p in h.story_files(self.root)], ["fase-1/HU-30.md", "fase-2/HU-12.md", "fase-10/HU-01.md"])

    def test_el_enlace_de_impacto_se_resuelve_desde_la_carpeta_del_tipo_dentro_de_la_fase(self):
        # desde fase-2/HU/ el producto está en ../../../product
        self.assertEqual(h.parse_impact(hu(impacto_=impacto([("[c](../../../product/07-contenido-y-mensajes.md)", "x", "modifica", "pendiente")])), "historias/fase-2/HU")["filas"][0][0],
                         "product/07-contenido-y-mensajes.md")

    # --- contrato y pantalla ---
    def test_una_historia_con_tareas_api_necesita_su_seccion_contrato(self):
        self.con_tareas(TAREAS, contrato=False)
        self.assertTrue(self.hay("Contrato"))

    def test_una_seccion_contrato_vacia_no_vale(self):
        self.escribe(HU_OK.replace("Sin cambios en el contrato.", ""))
        self.assertTrue(self.hay("Contrato"))

    def test_una_historia_sin_tareas_api_no_necesita_contrato(self):
        solo_web = [("HU-12.1", "DOC", "producto", "normal", "hecho"), ("HU-12.4", "WEB", "comportamiento", "normal", "pendiente")]
        self.con_tareas(solo_web, contrato=False)
        self.assertEqual(self.errors(), [])

    def test_una_historia_con_tareas_web_necesita_su_seccion_pantalla(self):
        self.con_tareas(TAREAS, pantalla=False)
        self.assertTrue(self.hay("Pantalla"))

    def test_una_seccion_pantalla_vacia_no_vale(self):
        self.escribe(HU_OK.replace("Sin cambios visuales.", ""))
        self.assertTrue(self.hay("Pantalla"))

    def test_una_historia_sin_tareas_web_no_necesita_pantalla(self):
        solo_api = [t for t in TAREAS if t[1] != "WEB"]
        self.con_tareas(solo_api, pantalla=False)
        self.assertEqual(self.errors(), [])

    # --- tipo y rigor ---
    def test_el_tipo_debe_ser_de_la_capa(self):
        self.escribe(HU_OK.replace(h.cell("tipo", "pantalla"), h.cell("tipo", "contrato")))
        self.assertTrue(self.hay("tipo", "HU-12.4"))

    def test_una_tarea_sin_tipo(self):
        self.escribe(HU_OK.replace(h.cell("tipo", "contrato"), " "))
        self.assertTrue(self.hay("tipo", "HU-12.3"))

    def test_el_error_de_tipo_apunta_a_la_plantilla(self):
        self.escribe(HU_OK.replace(h.cell("tipo", "contrato"), "📜 cosa"))
        self.assertTrue(self.hay("plantillas/README.md"))

    def test_el_error_lista_los_tipos_validos_de_la_capa(self):
        self.escribe(HU_OK.replace(h.cell("tipo", "contrato"), "📜 cosa"))
        mensaje = " ".join(self.errors())
        for tipo in ("contrato", "regla", "evento", "base-de-datos", "configuracion"):
            self.assertIn(tipo, mensaje)

    def test_los_nombres_antiguos_ya_no_valen(self):
        for viejo in ("ruta", "dominio", "migración", "config", "datos", "base de datos", "configuración", "guía"):
            self.escribe(HU_OK.replace(h.cell("tipo", "contrato"), f"📜 {viejo}"))
            self.assertTrue(self.hay("tipo", "HU-12.3"), viejo)

    def test_las_mayusculas_no_valen(self):
        self.escribe(HU_OK.replace(h.cell("tipo", "contrato"), "📜 Contrato"))
        self.assertTrue(self.hay("tipo", "HU-12.3"))

    def test_las_tareas_e2e_llevan_el_tipo_recorrido(self):
        con_e2e = TAREAS + [("HU-12.5", "E2E", "recorrido", "normal", "pendiente")]
        self.con_tareas(con_e2e)
        self.assertEqual(self.errors(), [])
        self.escribe(hu(con_e2e).replace(h.cell("tipo", "recorrido"), h.cell("tipo", "contrato")))
        self.assertTrue(self.hay("tipo", "HU-12.5"))

    def test_el_rigor_debe_ser_critico_o_normal(self):
        for valor in ("alto", "🔒 Critico", "🔒 CRITICO", "🔒 crítico", " ", "🔒"):
            self.escribe(HU_OK.replace(h.cell("rigor", "normal") + " | Tarea | Objetivo | — | " + h.cell("estado", "pendiente"), f"{valor} | Tarea | Objetivo | — | " + h.cell("estado", "pendiente"), 1))
            self.assertTrue(self.hay("rigor", "HU-12.3"), repr(valor))
        self.escribe(HU_OK.replace(h.cell("rigor", "normal") + " | Tarea | Objetivo | — | " + h.cell("estado", "pendiente"), "alto | Tarea | Objetivo | — | " + h.cell("estado", "pendiente"), 1))
        mensaje = [e for e in self.errors() if "HU-12.3" in e and "rigor" in e][0]
        self.assertIn("critico", mensaje)
        self.assertIn("normal", mensaje)

    def test_el_rigor_critico_solo_va_en_tareas_api(self):
        self.con_tareas([TAREAS[0], TAREAS[1], TAREAS[2], ("HU-12.4", "WEB", "pantalla", "critico", "pendiente")])
        self.assertTrue(self.hay("critico", "HU-12.4"))

    def test_migracion_y_evento_siempre_son_criticos(self):
        for tipo in ("base-de-datos", "evento"):
            self.con_tareas([TAREAS[0], TAREAS[1], ("HU-12.3", "API", tipo, "normal", "pendiente"), TAREAS[3]])
            self.assertTrue(self.hay("critico", "HU-12.3"), tipo)
            self.con_tareas([TAREAS[0], TAREAS[1], ("HU-12.3", "API", tipo, "critico", "pendiente"), TAREAS[3]])
            self.assertEqual(self.errors(), [], tipo)

    # --- iconos ---
    def test_falta_el_icono_y_el_error_dice_como_arreglarlo(self):
        self.escribe(HU_OK.replace(h.cell("capa", "API"), "API", 1))
        self.assertTrue(self.hay("icono", "--formato"))

    def test_icono_equivocado(self):
        self.escribe(HU_OK.replace(h.cell("tipo", "contrato"), "🎨 contrato"))
        self.assertTrue(self.hay("icono", "📜"))

    def test_el_estado_lleva_icono_y_texto(self):
        self.escribe(HU_OK.replace(h.cell("estado", "pendiente"), "⬜", 1))
        self.assertTrue(self.hay("estado", "HU-12.3"))
        self.escribe(HU_OK.replace(h.cell("estado", "pendiente"), "⬜ terminado", 1))
        self.assertTrue(self.hay("estado", "HU-12.3"))

    # --- estructura de la tabla ---
    def test_una_fila_con_otro_numero_de_columnas(self):
        self.escribe(HU_OK.replace("| Tarea | Objetivo | — | " + h.cell("estado", "pendiente"), "| Tarea | — | " + h.cell("estado", "pendiente"), 1))
        self.assertTrue(self.hay("HU-12.3", "columnas"))

    def test_el_objetivo_es_obligatorio(self):
        self.escribe(HU_OK.replace("| Tarea | Objetivo | — | " + h.cell("estado", "pendiente"), "| Tarea |  | — | " + h.cell("estado", "pendiente"), 1))
        self.assertTrue(self.hay("objetivo", "HU-12.3"))
        self.escribe(HU_OK.replace("| Tarea | Objetivo | — | " + h.cell("estado", "pendiente"), "| Tarea | … | — | " + h.cell("estado", "pendiente"), 1))
        self.assertTrue(self.hay("objetivo", "HU-12.3"))

    # --- bloques de detalle ---
    def test_cada_tarea_necesita_su_bloque_de_detalle(self):
        self.con_tareas(TAREAS, detalle=False)
        self.assertTrue(self.hay("HU-12.1", "detalle"))

    def test_un_bloque_sin_su_tarea(self):
        self.escribe(HU_OK + "\n### HU-12.9 Una tarea que no existe\n\n**Se comprueba**\n\n- [ ] algo\n")
        self.assertTrue(self.hay("HU-12.9"))

    def test_un_bloque_sin_comprobaciones(self):
        self.escribe(HU_OK.replace("- [ ] una comprobación\n\n### HU-12.4", "### HU-12.4", 1))
        self.assertTrue(self.hay("HU-12.3", "comprobaci"))

    def test_una_tarea_hecha_tiene_todas_sus_comprobaciones_marcadas(self):
        self.escribe(HU_OK.replace("- [x] una comprobación", "- [ ] una comprobación", 1))
        self.assertTrue(self.hay("HU-12.1", "marcad"))

    def test_una_tarea_propuesta_no_tiene_comprobaciones_marcadas(self):
        self.escribe(hu([("HU-12.3", "API", "contrato", "normal", "propuesta")], estado="propuesta").replace("- [ ] una comprobación", "- [x] una comprobación"))
        self.assertTrue(self.hay("HU-12.3", "propuesta"))

    def test_una_tarea_critica_necesita_reglas_e_invariantes(self):
        self.con_tareas(TAREAS)
        self.escribe(HU_OK.replace("**Reglas e invariantes**\n\n- nunca negativa", ""))
        self.assertTrue(self.hay("HU-12.2", "Reglas e invariantes"))

    def test_una_tarea_normal_no_necesita_reglas_e_invariantes(self):
        self.assertEqual(self.errors(), [])  # HU-12.3 es normal y no las tiene

    # --- ejecución ---
    def test_falta_la_tabla_de_ejecucion(self):
        self.con_tareas(TAREAS, exec_=False)
        self.assertTrue(self.hay("Ejecución", "historias.py"))

    def test_las_filas_de_ejecucion_son_las_de_las_tareas(self):
        self.escribe(HU_OK.replace("| HU-12.4 | — | — | — |\n", ""))
        self.assertTrue(self.hay("Ejecución", "HU-12.4"))
        self.escribe(HU_OK.replace(h.EJEC_FIN, "| HU-12.9 | — | — | — |\n" + h.EJEC_FIN))
        self.assertTrue(self.hay("Ejecución", "HU-12.9"))

    def test_un_sello_con_formato_invalido(self):
        self.escribe(HU_OK.replace("2026-10-30 09:00 | 2026-10-30 09:30", "30 oct 9:00 | 2026-10-30 09:30", 1))
        self.assertTrue(self.hay("Ejecución", "HU-12.1", "formato"))

    def test_una_tarea_hecha_necesita_inicio_y_fin(self):
        self.escribe(HU_OK.replace("| HU-12.1 | 2026-10-30 09:00 | 2026-10-30 09:30 | 30 min |", "| HU-12.1 | 2026-10-30 09:00 | — | — |"))
        self.assertTrue(self.hay("HU-12.1", "fin"))
        self.escribe(HU_OK.replace("| HU-12.1 | 2026-10-30 09:00 | 2026-10-30 09:30 | 30 min |", "| HU-12.1 | — | — | — |"))
        self.assertTrue(self.hay("HU-12.1", "inicio"))

    def test_una_tarea_pendiente_no_tiene_sellos(self):
        self.escribe(HU_OK.replace("| HU-12.3 | — | — | — |", "| HU-12.3 | 2026-10-30 09:00 | — | — |"))
        self.assertTrue(self.hay("HU-12.3", "sello"))

    def test_una_tarea_en_curso_tiene_inicio_y_no_fin(self):
        self.con_tareas([TAREAS[0], TAREAS[1], ("HU-12.3", "API", "contrato", "normal", "en-curso"), TAREAS[3]])
        self.assertEqual(self.errors(), [])
        self.escribe(hu([TAREAS[0], TAREAS[1], ("HU-12.3", "API", "contrato", "normal", "en-curso"), TAREAS[3]]).replace("| HU-12.3 | 2026-10-30 09:00 | — | — |", "| HU-12.3 | — | — | — |"))
        self.assertTrue(self.hay("HU-12.3", "inicio"))

    def test_el_fin_no_puede_ser_anterior_al_inicio(self):
        self.escribe(HU_OK.replace("2026-10-30 09:00 | 2026-10-30 09:30 | 30 min", "2026-10-30 09:30 | 2026-10-30 09:00 | 30 min", 1))
        self.assertTrue(self.hay("HU-12.1", "anterior"))

    def test_el_tiempo_es_fin_menos_inicio(self):
        self.escribe(HU_OK.replace("| 30 min |", "| 45 min |", 1))
        self.assertTrue(self.hay("HU-12.1", "tiempo"))

    # --- plantilla ---
    def test_una_plantilla_que_coincide_con_el_script_no_da_error(self):
        self.escribe_diccionario(DICCIONARIO_OK)
        self.assertEqual(self.errors(), [])

    def test_una_plantilla_con_un_icono_distinto_da_error(self):
        self.escribe_diccionario(DICCIONARIO_OK.replace(h.cell("tipo", "regla"), "📏 regla"))
        self.assertTrue(self.hay("plantillas/README.md", "icono", "regla"))

    def test_una_plantilla_que_se_desincroniza_del_script_da_error(self):
        self.escribe_diccionario(DICCIONARIO_OK.replace(h.cell("tipo", "pantalla"), "🖼️ vista"))
        self.assertTrue(self.hay("plantillas/README.md", "WEB"))
        self.escribe_diccionario(DICCIONARIO_OK.replace("| Un aviso entre partes | Reaccionar a algo | sí |", "| Un aviso entre partes | Reaccionar a algo | no |"))
        self.assertTrue(self.hay("critico", "plantillas/README.md"))


RN_13 = "| RN-13 | **Stock** | Antes de cobrar se aparta el stock |"
PA_02 = "| PA-02 | Detalle del libro | `/libros/:isbn` |"
DP_05 = "| DP-05 | Datos del libro | El MVP usa solo lo que entrega la API |"


IDEA = "---\nid: {sid}\ntitulo: Una idea por madurar\ntipo: {tipo}\nepica: Compra\nestado: idea\namplia:\nreemplaza:\n---\n\n# {sid} Una idea por madurar\n\n**Origen:** un hallazgo. **Por qué importa:** porque sí.\n"


class MatricesPorFase(Entorno):
    """El comprobador mira la matriz de CADA fase y el índice del README."""

    def test_con_todo_al_dia_no_hay_errores(self):
        self.assertEqual(self.errors(), [])

    def test_falta_la_matriz_de_una_fase(self):
        (self.fase / "matriz.md").unlink()
        self.assertTrue(self.hay("fase-2", "matriz.md"))

    def test_una_historia_que_no_esta_en_la_matriz_de_su_fase(self):
        (self.fase / "matriz.md").write_text("# Matriz de la fase 2\n", encoding="utf-8")
        self.assertTrue(self.hay("fase 2", "HU-12"))

    def test_una_historia_que_figura_en_la_matriz_de_otra_fase(self):
        (self.dir / "fase-3" / "HU").mkdir(parents=True)
        (self.dir / "fase-3" / "README.md").write_text("# Fase 3\n", encoding="utf-8")
        (self.dir / "fase-3" / "matriz.md").write_text("# Matriz de la fase 3\n", encoding="utf-8")
        self.file.rename(self.dir / "fase-3" / "HU" / "HU-12.md")  # se movió de fase y las matrices quedaron como estaban
        self.assertTrue(self.hay("HU-12", "fase 2", "fase 3"))

    def test_el_estado_de_la_matriz_debe_ser_el_del_archivo(self):
        texto = (self.fase / "matriz.md").read_text(encoding="utf-8")
        (self.fase / "matriz.md").write_text(texto.replace("⬜ aprobada", "✅ cerrada"), encoding="utf-8")
        self.assertTrue(self.hay("HU-12", "matriz dice"))

    def test_un_indice_desactualizado(self):
        texto = (self.dir / "README.md").read_text(encoding="utf-8")
        (self.dir / "README.md").write_text(texto.replace("1 abiertas", "7 abiertas"), encoding="utf-8")
        self.assertTrue(self.hay("índice", "README.md"))

    def test_un_readme_sin_las_marcas_del_indice(self):
        (self.dir / "README.md").write_text("sin marcas\n", encoding="utf-8")
        self.assertTrue(self.hay("índice", "marcas"))

    def test_una_fase_nueva_sin_matriz_se_avisa(self):
        (self.dir / "fase-3").mkdir()
        (self.dir / "fase-3" / "README.md").write_text("# Fase 3\n", encoding="utf-8")
        self.assertTrue(self.hay("fase-3", "matriz.md"))

    def test_las_historias_del_historico_deben_estar_en_la_matriz_de_la_fase_1(self):
        (self.dir / "legado.json").write_text(
            json.dumps({"historias": [{"id": "HU-05", "titulo": "x", "epica": "Cuenta", "api": "✅", "web": "✅", "inicio": "2026-10-28", "cierre": "2026-10-28", "minutos": 1, "tareas_api": [], "tareas_web": [], "compartidas": []}]}),
            encoding="utf-8",
        )
        (self.dir / "fase-1").mkdir()
        (self.dir / "fase-1" / "README.md").write_text("# Fase 1\n", encoding="utf-8")
        h.write_matrix(self.root, [])
        self.assertEqual(self.errors(), [])
        (self.dir / "fase-1" / "matriz.md").write_text("# Matriz de la fase 1\n", encoding="utf-8")
        self.assertTrue(self.hay("HU-05", "fase 1"))


class Carpetas(Entorno):
    """Dentro de cada fase, las historias van en `HU/` y los habilitadores en `EN/`; la matriz y el README siguen a nivel de la fase."""

    def test_con_las_carpetas_de_cada_tipo_no_hay_errores(self):
        self.assertEqual(self.errors(), [])

    def test_la_fase_es_la_de_la_carpeta_de_arriba_y_el_tipo_la_de_su_carpeta(self):
        self.assertEqual(h.fase_de(self.hu / "HU-12.md"), 2)
        self.assertEqual(h.base_de(self.hu / "HU-12.md"), "historias/fase-2/HU")
        self.assertEqual(h.base_de(self.en / "EN-01.md"), "historias/fase-2/EN")

    def test_se_descubren_las_historias_y_los_habilitadores_de_las_dos_carpetas(self):
        (self.en / "EN-01.md").write_text(hu([("EN-01.1", "API", "refactor", "normal", "pendiente")], sid="EN-01", tipo="EN", ligado="guia-de-desarrollo.md"), encoding="utf-8")
        (self.dir / "fase-1" / "HU").mkdir(parents=True)
        (self.dir / "fase-1" / "README.md").write_text("# Fase 1\n", encoding="utf-8")
        (self.dir / "fase-1" / "HU" / "HU-30.md").write_text(IDEA.format(sid="HU-30", tipo="HU"), encoding="utf-8")
        nombres = [f"{p.parent.parent.name}/{p.parent.name}/{p.name}" for p in h.story_files(self.root)]
        self.assertEqual(nombres, ["fase-1/HU/HU-30.md", "fase-2/EN/EN-01.md", "fase-2/HU/HU-12.md"])  # por fase y luego por nombre

    def test_una_historia_suelta_en_la_fase_va_en_su_carpeta(self):
        (self.fase / "HU-14.md").write_text(HU_OK.replace("HU-12", "HU-14"), encoding="utf-8")
        self.assertTrue(self.hay("HU-14.md", "fase-2/HU/"))

    def test_un_habilitador_suelto_en_la_fase_va_en_su_carpeta(self):
        (self.fase / "EN-14.md").write_text(IDEA.format(sid="EN-14", tipo="EN"), encoding="utf-8")
        self.assertTrue(self.hay("EN-14.md", "fase-2/EN/"))

    def test_un_habilitador_en_la_carpeta_de_historias_es_un_error(self):
        (self.hu / "EN-14.md").write_text(IDEA.format(sid="EN-14", tipo="EN"), encoding="utf-8")
        self.assertTrue(self.hay("EN-14.md", "HU/", "EN/"))

    def test_una_historia_en_la_carpeta_de_habilitadores_es_un_error(self):
        (self.en / "HU-14.md").write_text(IDEA.format(sid="HU-14", tipo="HU"), encoding="utf-8")
        self.assertTrue(self.hay("HU-14.md", "EN/", "HU/"))

    def test_una_carpeta_desconocida_dentro_de_la_fase(self):
        (self.fase / "otros").mkdir()
        (self.fase / "otros" / "HU-14.md").write_text(IDEA.format(sid="HU-14", tipo="HU"), encoding="utf-8")
        self.assertTrue(self.hay("otros", "fase-2"))

    def test_una_historia_en_una_carpeta_con_hu_pero_que_no_es_una_fase(self):
        (self.dir / "mvp" / "HU").mkdir(parents=True)
        (self.dir / "mvp" / "HU" / "HU-14.md").write_text(IDEA.format(sid="HU-14", tipo="HU"), encoding="utf-8")
        self.assertTrue(self.hay("HU-14.md", "fase-"))

    def test_una_fase_sin_historias_ni_habilitadores_no_necesita_las_carpetas(self):
        (self.dir / "fase-3").mkdir()
        (self.dir / "fase-3" / "README.md").write_text("# Fase 3\n", encoding="utf-8")
        h.write_matrix(self.root, [])
        self.assertEqual(self.errors(), [])

    def test_los_archivos_propios_de_la_fase_estan_permitidos(self):
        self.assertTrue((self.fase / "README.md").exists() and (self.fase / "matriz.md").exists())
        self.assertEqual(self.errors(), [])

    def test_la_matriz_enlaza_a_cada_archivo_dentro_de_su_carpeta(self):
        (self.en / "EN-01.md").write_text(hu([("EN-01.1", "API", "refactor", "normal", "pendiente")], sid="EN-01", tipo="EN", ligado="guia-de-desarrollo.md"), encoding="utf-8")
        h.write_matrix(self.root, [])
        texto = (self.fase / "matriz.md").read_text(encoding="utf-8")
        self.assertIn("[HU-12](HU/HU-12.md)", texto)
        self.assertIn("[EN-01](EN/EN-01.md)", texto)

    def test_el_registro_de_cambios_enlaza_a_la_carpeta_de_la_historia(self):
        self.escribe(hu(impacto_=impacto([("RN-13", "x", "modifica", "pendiente")])))
        h.write_changes(self.root)
        self.assertIn("(../historias/fase-2/HU/HU-12.md)", (self.root / "docs" / "product" / "cambios.md").read_text(encoding="utf-8"))

    def test_los_enlaces_de_impacto_se_resuelven_desde_la_carpeta_del_tipo(self):
        impacto_ = impacto([("[c](../../../product/07-contenido-y-mensajes.md)", "x", "modifica", "pendiente")])
        self.assertEqual(h.parse_impact(hu(impacto_=impacto_), h.base_de(self.hu / "HU-12.md"))["filas"][0][0], "product/07-contenido-y-mensajes.md")


class Diccionario(Entorno):
    """plantillas/README.md define cada valor que admite un campo o una columna; el script lo compara con sus constantes."""

    def escribe_diccionario(self, texto, plantillas=("HU", "EN", "idea"), contenido=None):
        (self.dir / "plantillas").mkdir(exist_ok=True)
        (self.dir / "plantillas" / "README.md").write_text(texto, encoding="utf-8")
        for nombre in plantillas:
            (self.dir / "plantillas" / f"{nombre}.md").write_text((contenido or {}).get(nombre, plantilla_de(nombre)), encoding="utf-8")

    def test_el_script_y_la_prueba_conocen_las_mismas_tablas(self):
        self.assertEqual([titulo for titulo, *_ in h.DICCIONARIO], list(TABLAS_DE_VALORES))

    def test_un_diccionario_completo_no_da_error(self):
        self.escribe_diccionario(DICCIONARIO_OK)
        self.assertEqual(self.errors(), [])

    def test_sin_el_diccionario_no_se_exige_nada(self):
        self.assertEqual(self.errors(), [])

    def test_falta_una_de_las_tres_plantillas(self):
        for faltante in ("HU", "EN", "idea"):
            self.escribe_diccionario(DICCIONARIO_OK, plantillas=[n for n in ("HU", "EN", "idea") if n != faltante])
            (self.dir / "plantillas" / f"{faltante}.md").unlink(missing_ok=True)
            self.assertTrue(self.hay(f"plantillas/{faltante}.md", "falta la plantilla"), faltante)

    def test_el_script_y_la_prueba_conocen_las_tablas_de_cada_plantilla(self):
        self.assertEqual({n: tuple(titulos) for n, titulos in h.TABLAS_EN_PLANTILLAS.items()}, TABLAS_DE_PLANTILLA)

    def test_una_plantilla_sin_una_de_sus_tablas_da_error(self):
        for nombre, titulos in TABLAS_DE_PLANTILLA.items():
            for titulo in titulos + (ESPECIALES if nombre != "idea" else ()):
                sin = plantilla_de(nombre).replace(f"**{titulo}**", f"**{titulo} (renombrada)**")
                self.assertNotEqual(sin, plantilla_de(nombre))
                self.escribe_diccionario(DICCIONARIO_OK, contenido={nombre: sin})
                self.assertTrue(self.hay(f"plantillas/{nombre}.md", titulo, "falta"), (nombre, titulo))

    def test_a_la_tabla_de_una_plantilla_le_falta_o_le_sobra_un_valor(self):
        for nombre, titulos in TABLAS_DE_PLANTILLA.items():
            for titulo in titulos:
                filas = TABLAS_DE_VALORES[titulo]
                for cambio, filas_mal, palabra in (("faltan", filas[:-1], filas[-1][0]), ("sobran", filas + [("archivada", "📦")], "archivada")):
                    mal = plantilla_de(nombre).replace(tabla_en_plantilla(titulo, filas), tabla_en_plantilla(titulo, filas_mal))
                    self.assertNotEqual(mal, plantilla_de(nombre))
                    self.escribe_diccionario(DICCIONARIO_OK, contenido={nombre: mal})
                    self.assertTrue(self.hay(f"plantillas/{nombre}.md", titulo, cambio, palabra), (nombre, titulo, cambio))

    def test_un_icono_distinto_en_una_plantilla_da_error(self):
        for nombre, titulos in TABLAS_DE_PLANTILLA.items():
            for titulo in titulos:
                con_icono = [(v, i) for v, i in TABLAS_DE_VALORES[titulo] if i]
                if not con_icono:
                    continue
                valor, icono = con_icono[0]
                mal = plantilla_de(nombre).replace(f"| `{valor}` | {icono} |", f"| `{valor}` | 🟦 |", 1)
                self.escribe_diccionario(DICCIONARIO_OK, contenido={nombre: mal})
                self.assertTrue(self.hay(f"plantillas/{nombre}.md", titulo, valor, "icono"), (nombre, titulo))

    def test_la_tabla_de_campos_debe_ser_la_del_encabezado_de_la_plantilla(self):
        for nombre in ("HU", "EN"):
            for cambio, mal in (("faltan", plantilla_de(nombre).replace("> | `amplia` |  | algo |\n", "")),
                                ("sobran", plantilla_de(nombre).replace("> | `amplia` |", "> | `inventado` | | algo |\n> | `amplia` |"))):
                self.assertNotEqual(mal, plantilla_de(nombre))
                self.escribe_diccionario(DICCIONARIO_OK, contenido={nombre: mal})
                self.assertTrue(self.hay(f"plantillas/{nombre}.md", "Campos del encabezado", cambio), (nombre, cambio))

    def test_la_tabla_de_secciones_debe_ser_la_de_los_titulos_de_la_plantilla(self):
        for nombre in ("HU", "EN"):
            sobra = plantilla_de(nombre).replace("> | `Tareas` |", "> | `Inventada` | | algo |\n> | `Tareas` |")
            falta = plantilla_de(nombre).replace("> | `Tareas` |  | algo |\n", "")
            for cambio, mal in (("sobran", sobra), ("faltan", falta)):
                self.assertNotEqual(mal, plantilla_de(nombre))
                self.escribe_diccionario(DICCIONARIO_OK, contenido={nombre: mal})
                self.assertTrue(self.hay(f"plantillas/{nombre}.md", "Secciones de la plantilla", cambio), (nombre, cambio))

    def test_el_cuerpo_de_cada_plantilla_abre_con_su_tabla_de_resumen(self):
        for nombre, campos in RESUMEN_DE_PLANTILLA.items():
            self.assertEqual({n: tuple(c) for n, c in h.RESUMEN_EN_PLANTILLAS.items()}[nombre], campos)
            sin = plantilla_de(nombre).replace(resumen_de(nombre), "texto corrido\n")
            falta = plantilla_de(nombre).replace(resumen_de(nombre), resumen_de(nombre, campos[:-1]))
            sobra = plantilla_de(nombre).replace(resumen_de(nombre), resumen_de(nombre, campos + ("Inventado",)))
            for cambio, mal in (("falta", sin), ("faltan", falta), ("sobran", sobra)):
                self.assertNotEqual(mal, plantilla_de(nombre))
                self.escribe_diccionario(DICCIONARIO_OK, contenido={nombre: mal})
                self.assertTrue(self.hay(f"plantillas/{nombre}.md", "resumen", cambio), (nombre, cambio))

    def test_un_comentario_del_encabezado_no_es_el_titulo_del_cuerpo(self):
        texto = "---\nid: x\n# un comentario\n---\n\n| Campo | Contenido |\n|---|---|\n| Qué | … |\n"
        self.assertIsNone(h.parse_body_table(texto))
        self.assertEqual(h.parse_body_table(texto.replace("---\n\n|", "---\n\n# Título\n\n|")), [("Qué", "…")])

    def test_los_criterios_de_una_historia_y_de_un_habilitador_son_una_tabla(self):
        self.assertEqual(h.CRITERIOS_EN_PLANTILLAS, CRITERIOS_DE_PLANTILLA)
        for nombre in ("HU", "EN"):
            sin = plantilla_de(nombre).replace(criterios_de(), "- **Dado** …, **cuando** …, **entonces** ….\n")
            otra = plantilla_de(nombre).replace(criterios_de(), criterios_de(("Dado", "Entonces")))
            for cambio, mal in (("falta", sin), ("columnas", otra)):
                self.assertNotEqual(mal, plantilla_de(nombre))
                self.escribe_diccionario(DICCIONARIO_OK, contenido={nombre: mal})
                self.assertTrue(self.hay(f"plantillas/{nombre}.md", "Criterios", cambio), (nombre, cambio))

    def test_la_tabla_de_resumen_no_se_confunde_con_las_de_una_cita(self):
        # la nota de la plantilla va dentro de una cita y trae otras tablas: no cuentan como el resumen
        mal = plantilla_de("HU").replace(resumen_de("HU"), "texto corrido\n")
        self.assertIsNone(h.parse_body_table(mal))
        self.assertEqual([c for c, _ in h.parse_body_table(plantilla_de("HU"))], list(RESUMEN_DE_PLANTILLA["HU"]))

    def test_una_tabla_termina_en_la_linea_en_blanco_y_no_se_une_a_la_siguiente(self):
        # la última tabla de la nota (en una cita) y la del cuerpo, justo después, son dos tablas distintas
        texto = "# x\n\n" + tabla_en_plantilla(ESTADOS_TAR, TABLAS_DE_VALORES[ESTADOS_TAR]) + "\n" + resumen_de("HU")
        self.assertEqual(h.parse_value_table(texto, ESTADOS_TAR), TABLAS_DE_VALORES[ESTADOS_TAR])

    def test_las_tablas_de_una_plantilla_se_leen_aunque_vayan_dentro_de_una_cita(self):
        filas = h.parse_value_table(plantilla_de("HU"), ESTADOS_TAR)
        self.assertEqual(filas, [(k, h.ICONOS["estado"][k]) for k in h.ESTADOS_TAREA])
        self.assertEqual(len(h.parse_value_table(plantilla_de("HU"), ESTADOS_HIST)), len(h.ESTADOS))

    def test_falta_una_tabla_de_valores(self):
        for titulo in TABLAS_DE_VALORES:
            self.escribe_diccionario(DICCIONARIO_OK.replace(f"### {titulo}", f"### {titulo} (renombrada)"))
            self.assertTrue(self.hay("plantillas/README.md", titulo, "falta"), titulo)

    def test_a_una_tabla_le_falta_un_valor_del_script(self):
        for titulo, filas in TABLAS_DE_VALORES.items():
            valor = filas[-1][0]
            fila = f"| `{valor}` | {filas[-1][1]} | …algo… |\n"
            self.assertIn(fila, DICCIONARIO_OK)
            self.escribe_diccionario(DICCIONARIO_OK.replace(fila, "", 1) if DICCIONARIO_OK.count(fila) == 1 else self.sin_la_ultima_fila(titulo, fila))
            self.assertTrue(self.hay("plantillas/README.md", titulo, valor), titulo)

    def sin_la_ultima_fila(self, titulo, fila):
        """Quita la fila solo dentro de la tabla de ese título (un valor, como `normal`, puede repetirse en otra)."""
        a = DICCIONARIO_OK.index(f"### {titulo}")
        b = DICCIONARIO_OK.find("\n### ", a + 4)
        trozo = DICCIONARIO_OK[a:] if b == -1 else DICCIONARIO_OK[a:b]
        return DICCIONARIO_OK.replace(trozo, trozo.replace(fila, "", 1), 1)

    def test_una_tabla_tiene_un_valor_que_el_script_no_conoce(self):
        self.escribe_diccionario(DICCIONARIO_OK.replace("| `cerrada` |", "| `archivada` | 📦 | …algo… |\n| `cerrada` |", 1))
        self.assertTrue(self.hay("plantillas/README.md", "Estados de una historia", "archivada"))

    def test_un_icono_distinto_al_del_script(self):
        self.escribe_diccionario(DICCIONARIO_OK.replace(f"| `hecho` | {h.ICONOS['estado']['hecho']} |", "| `hecho` | 🟦 |", 1))
        self.assertTrue(self.hay("plantillas/README.md", "Estados de una tarea", "hecho", "🟦"))

    def test_el_selector_de_emoji_no_cuenta_como_un_icono_distinto(self):
        sin = h.ICONOS["capa"]["API"].replace("\ufe0f", "")
        self.escribe_diccionario(DICCIONARIO_OK.replace(f"| `API` | {h.ICONOS['capa']['API']} |", f"| `API` | {sin} |", 1))
        self.assertEqual(self.errors(), [])

    def test_la_tabla_de_tipos_sigue_comparandose(self):
        self.escribe_diccionario(DICCIONARIO_OK.replace(h.cell("tipo", "regla"), "📐 norma"))
        self.assertTrue(self.hay("plantillas/README.md", "API"))

    def test_parse_value_table_lee_valores_e_iconos(self):
        self.assertEqual(h.parse_value_table(DICCIONARIO_OK, "Estados del impacto en el producto"), [("pendiente", ""), ("hecho", "")])
        self.assertEqual(h.parse_value_table(DICCIONARIO_OK, "Rigor de una tarea")[0], ("critico", h.ICONOS["rigor"]["critico"]))
        self.assertIsNone(h.parse_value_table(DICCIONARIO_OK, "No existe"))


class Encabezado(Entorno):
    """Qué campos exige cada tipo, qué valores admiten `tipo` y `epica`, y que `tipo` coincida con el prefijo del `id`."""

    def archivo(self, texto, nombre="HU-30.md", carpeta=None):
        (carpeta or self.hu).mkdir(exist_ok=True)
        (carpeta or self.hu).joinpath(nombre).write_text(texto, encoding="utf-8")
        h.write_matrix(self.root, [])
        h.write_changes(self.root)

    def test_las_epicas_validas_son_las_seis_del_producto(self):
        self.assertEqual(h.EPICAS, ("Cuenta", "Catálogo", "Carrito", "Compra", "Pedidos", "Administración"))

    def test_los_campos_obligatorios_de_cada_tipo(self):
        self.assertEqual(h.REQUERIDOS_POR_TIPO["HU"], ("id", "titulo", "tipo", "epica", "estado"))
        self.assertEqual(h.REQUERIDOS_POR_TIPO["EN"], ("id", "titulo", "tipo", "estado"))

    def test_una_historia_con_una_epica_valida(self):
        for epica in h.EPICAS:
            self.archivo(IDEA.format(sid="HU-30", tipo="HU").replace("epica: Compra", f"epica: {epica}"))
            self.assertEqual(self.errors(), [], epica)

    def test_una_historia_con_una_epica_que_no_esta_en_la_lista(self):
        self.archivo(IDEA.format(sid="HU-30", tipo="HU").replace("epica: Compra", "epica: Calidad"))
        self.assertTrue(self.hay("HU-30.md", "epica", "Calidad", "Compra"))

    def test_una_historia_sin_epica_es_un_error(self):
        (self.hu / "HU-30.md").write_text(IDEA.format(sid="HU-30", tipo="HU").replace("epica: Compra\n", ""), encoding="utf-8")
        self.assertTrue(self.hay("HU-30.md", "epica"))

    def test_un_habilitador_no_necesita_epica(self):
        self.archivo(IDEA.format(sid="EN-30", tipo="EN").replace("epica: Compra\n", ""), "EN-30.md", self.en)
        self.assertEqual(self.errors(), [])

    def test_un_habilitador_completo_sin_epica_tampoco(self):
        (self.root / "docs" / "guia-de-desarrollo.md").write_text("# guía\n", encoding="utf-8")
        texto = hu([("EN-30.1", "API", "refactor", "normal", "pendiente")], sid="EN-30", tipo="EN", ligado="guia-de-desarrollo.md").replace("epica: Catálogo\n", "")
        self.archivo(texto, "EN-30.md", self.en)
        self.assertEqual(self.errors(), [])

    def test_un_habilitador_con_epica_de_mas_no_da_error(self):
        self.archivo(IDEA.format(sid="EN-30", tipo="EN"), "EN-30.md", self.en)  # el IDEA de prueba trae `epica: Compra`
        self.assertEqual(self.errors(), [])

    def test_la_matriz_de_un_habilitador_sin_epica_se_genera(self):
        self.archivo(IDEA.format(sid="EN-30", tipo="EN").replace("epica: Compra\n", ""), "EN-30.md", self.en)
        self.assertIn("EN-30", (self.fase / "matriz.md").read_text(encoding="utf-8"))

    def test_el_tipo_debe_coincidir_con_el_prefijo_del_id(self):
        self.archivo(IDEA.format(sid="HU-30", tipo="EN"))
        self.assertTrue(self.hay("HU-30.md", "tipo", "EN", "HU-"))
        self.archivo(IDEA.format(sid="EN-30", tipo="HU"), "EN-30.md", self.en)
        self.assertTrue(self.hay("EN-30.md", "tipo", "HU", "EN-"))

    def test_un_tipo_que_no_es_hu_ni_en(self):
        self.archivo(IDEA.format(sid="HU-30", tipo="XX"))
        self.assertTrue(self.hay("HU-30.md", "tipo", "XX"))


def historia_legada(**cambios):
    """Una entrada válida de legado.json (la misma forma que las 20 reales), con los cambios que pida la prueba."""
    base = {"id": "HU-05", "titulo": "Una historia", "epica": "Cuenta", "api": "✅", "web": "✅", "inicio": "2026-10-28", "cierre": "2026-10-29",
            "minutos": 30, "tareas_api": ["7.1"], "tareas_web": ["F2.1"], "compartidas": []}
    base.update(cambios)
    return base


class Legado(Entorno):
    """legado.json (las 20 historias anteriores): solo datos que se usan o se verifican, con sus valores comprobados."""

    def legado(self, *historias, **extra):
        (self.dir / "legado.json").write_text(json.dumps({"historias": list(historias), **extra}), encoding="utf-8")
        (self.dir / "fase-1").mkdir(exist_ok=True)
        (self.dir / "fase-1" / "README.md").write_text("# Fase 1\n", encoding="utf-8")
        h.write_matrix(self.root, [])

    def producto04(self, texto):
        (self.root / "docs" / "product").mkdir(parents=True, exist_ok=True)
        (self.root / "docs" / "product" / "04-historias-de-usuario.md").write_text(texto, encoding="utf-8")

    def test_una_entrada_valida_no_da_error(self):
        self.legado(historia_legada())
        self.assertEqual(self.errors(), [])

    def test_una_historia_abierta_valida(self):
        self.legado(historia_legada(web="⬜", cierre=None))
        self.assertEqual(self.errors(), [])

    def test_una_historia_solo_de_la_tienda_con_api_no_aplica(self):
        self.legado(historia_legada(api="—"))
        self.assertEqual(self.errors(), [])

    def test_el_archivo_solo_tiene_datos_no_notas_ni_constantes(self):
        for clave in ("nota", "tope_minutos"):
            self.legado(historia_legada(), **{clave: "x"})
            self.assertTrue(self.hay("legado.json", clave, "no es de la forma"), clave)

    def test_un_campo_que_nadie_usa_es_un_error(self):
        self.legado(historia_legada(api_hasta="2026-10-28"))
        self.assertTrue(self.hay("HU-05", "api_hasta"))

    def test_falta_un_campo(self):
        entrada = historia_legada()
        del entrada["minutos"]
        self.legado(entrada)
        self.assertTrue(self.hay("HU-05", "minutos"))

    def test_api_y_web_solo_admiten_tres_valores(self):
        for campo in ("api", "web"):
            self.legado(historia_legada(**{campo: "ok"}))
            self.assertTrue(self.hay("HU-05", campo, "ok"), campo)

    def test_la_epica_debe_estar_en_la_lista(self):
        self.legado(historia_legada(epica="Calidad"))
        self.assertTrue(self.hay("HU-05", "epica", "Calidad"))

    def test_las_fechas_tienen_formato_y_existen(self):
        for malo in ("28/10/2026", "2026-13-45", "ayer", ""):
            self.legado(historia_legada(inicio=malo))
            self.assertTrue(self.hay("HU-05", "inicio"), malo)
            self.legado(historia_legada(cierre=malo))
            self.assertTrue(self.hay("HU-05", "cierre"), malo)

    def test_el_cierre_no_es_anterior_al_inicio(self):
        self.legado(historia_legada(inicio="2026-10-29", cierre="2026-10-28"))
        self.assertTrue(self.hay("HU-05", "cierre", "anterior"))

    def test_sin_cierre_alguna_capa_sigue_pendiente_y_con_cierre_ninguna(self):
        self.legado(historia_legada(cierre=None))  # api y web hechas, pero sin cierre
        self.assertTrue(self.hay("HU-05", "cierre"))
        self.legado(historia_legada(web="⬜"))  # con cierre pero la web pendiente
        self.assertTrue(self.hay("HU-05", "cierre"))

    def test_los_minutos_son_un_entero_no_negativo(self):
        for malo in (-1, 1.5, "30", None, True):
            self.legado(historia_legada(minutos=malo))
            self.assertTrue(self.hay("HU-05", "minutos"), repr(malo))

    def test_las_tareas_son_listas_de_texto(self):
        self.legado(historia_legada(tareas_api="7.1"))
        self.assertTrue(self.hay("HU-05", "tareas_api"))
        self.legado(historia_legada(tareas_web=[7]))
        self.assertTrue(self.hay("HU-05", "tareas_web"))

    def test_las_compartidas_son_tareas_de_la_propia_historia(self):
        self.legado(historia_legada(compartidas=["9.9"]))
        self.assertTrue(self.hay("HU-05", "compartidas", "9.9"))
        self.legado(historia_legada(compartidas=["7.1"]))
        self.assertEqual(self.errors(), [])

    def test_el_id_tiene_la_forma_de_una_historia(self):
        self.legado(historia_legada(id="X-5"))
        self.assertTrue(self.hay("X-5", "id"))

    def test_un_json_roto_se_informa_sin_romper_el_comprobador(self):
        (self.dir / "legado.json").write_text("{ no es json", encoding="utf-8")
        self.assertTrue(self.hay("legado.json", "JSON"))

    def test_un_archivo_que_no_es_un_objeto_con_historias(self):
        (self.dir / "legado.json").write_text("[]", encoding="utf-8")
        self.assertTrue(self.hay("legado.json", "historias"))

    def test_los_ids_y_los_titulos_coinciden_con_product_04(self):
        self.legado(historia_legada())
        self.producto04("| [HU-05](#hu-05-una-historia) | Una historia |\n")
        self.assertEqual(self.errors(), [])
        self.producto04("| [HU-06](#x) | Otra |\n")
        self.assertTrue(self.hay("HU-05", "product/04"))
        self.producto04("| [HU-05](#x) | Un título distinto |\n")
        self.assertTrue(self.hay("HU-05", "título", "product/04"))

    def test_sin_product_04_no_se_comprueba_nada_de_el(self):
        self.legado(historia_legada())
        self.assertEqual(self.errors(), [])


class Ideas(Entorno):
    """El estado `idea`: un pendiente que se registra en la matriz con solo un encabezado y una frase."""

    def idea(self, sid="HU-30", tipo="HU", texto=None):
        ((self.hu if sid.startswith("HU") else self.en) / f"{sid}.md").write_text(texto if texto is not None else IDEA.format(sid=sid, tipo=tipo), encoding="utf-8")
        h.write_matrix(self.root, [])
        h.write_changes(self.root)

    def test_una_idea_solo_necesita_el_encabezado(self):
        self.idea()
        self.assertEqual(self.errors(), [])

    def test_una_idea_no_pide_tareas_contrato_pantalla_ni_impacto_ni_ejecucion(self):
        self.idea()
        self.assertNotIn("## Tareas", (self.hu / "HU-30.md").read_text(encoding="utf-8"))
        self.assertEqual(self.errors(), [])

    def test_un_habilitador_idea_no_necesita_ligado(self):
        self.idea("EN-04", "EN")
        self.assertEqual(self.errors(), [])

    def test_la_misma_idea_como_propuesta_si_pide_todo(self):
        self.idea(texto=IDEA.format(sid="HU-30", tipo="HU").replace("estado: idea", "estado: propuesta"))
        self.assertTrue(self.hay("HU-30.md", "Impacto en el producto"))

    def test_un_habilitador_propuesto_si_pide_ligado(self):
        self.idea("EN-04", "EN", texto=IDEA.format(sid="EN-04", tipo="EN").replace("estado: idea", "estado: propuesta"))
        self.assertTrue(self.hay("EN-04.md", "ligado"))

    def test_una_idea_conserva_el_encabezado_obligatorio(self):
        (self.hu / "HU-30.md").write_text(IDEA.format(sid="HU-30", tipo="HU").replace("epica: Compra\n", ""), encoding="utf-8")
        self.assertTrue(self.hay("HU-30.md", "epica"))

    def test_una_idea_no_puede_tener_tareas_hechas_ni_en_curso(self):
        con_tarea = hu([("HU-30.1", "DOC", "producto", "normal", "hecho")], sid="HU-30").replace("estado: aprobada", "estado: idea")
        self.idea(texto=con_tarea)
        self.assertTrue(self.hay("HU-30.md", "idea", "hechas o en curso"))

    def test_el_estado_idea_aparece_en_los_estados_validos(self):
        self.escribe(HU_OK.replace("estado: aprobada", "estado: soñada"))
        self.assertTrue(self.hay("estado", "idea"))

    def test_una_idea_figura_en_la_matriz_con_su_icono(self):
        self.idea()
        celdas = h.matrix_cells(self.root)
        self.assertEqual(celdas["HU-30"]["Estado"], "💡 idea")
        historias = h.render_phase(2, h.build_rows(self.root, [])).split("## Habilitadores")[0]
        self.assertIn("HU-30", historias)

    def test_sellar_una_idea_no_le_crea_la_tabla_de_ejecucion(self):
        texto = IDEA.format(sid="HU-30", tipo="HU")
        self.assertEqual(h.stamp_text(texto, at(9))[0], texto)

    def test_una_idea_no_aparece_en_el_registro_de_cambios_ni_en_los_choques(self):
        self.idea()
        self.assertEqual(h.conflicts(self.root), [])
        self.assertNotIn("HU-30", h.render_changes(self.root))

    def test_una_idea_puede_reemplazar_a_otra_historia(self):
        self.idea(texto=IDEA.format(sid="HU-30", tipo="HU").replace("reemplaza:", "reemplaza: HU-12"))
        self.assertEqual(self.errors(), [])
        self.assertIn("superada por HU-30", h.matrix_cells(self.root)["HU-12"]["Estado"])


class Habilitadores(Entorno):
    """El tipo `refactor` y la ligadura obligatoria de los habilitadores (`EN-nn`)."""

    LIGADO = "backend/05-piezas-clave.md#convención-por-contexto"

    def setUp(self):
        super().setUp()
        (self.root / "docs" / "backend").mkdir(parents=True)
        (self.root / "docs" / "backend" / "05-piezas-clave.md").write_text("# piezas\n", encoding="utf-8")
        prod = self.root / "docs" / "product"
        prod.mkdir(parents=True, exist_ok=True)
        (prod / "03-reglas-de-negocio.md").write_text("# rn\n\n| ID | Regla |\n|---|---|\n| RN-13 | **Stock** |\n", encoding="utf-8")

    def habilitador(self, ligado, tareas=(("EN-01.1", "API", "refactor", "normal", "pendiente"),), **kw):
        (self.en / "EN-01.md").write_text(hu(list(tareas), sid="EN-01", tipo="EN", ligado=ligado, **kw), encoding="utf-8")
        h.write_matrix(self.root, [])
        h.write_changes(self.root)

    # --- el tipo refactor ---
    def test_refactor_es_un_tipo_de_api_y_de_web_con_su_icono(self):
        self.assertIn("refactor", h.TIPOS["API"])
        self.assertIn("refactor", h.TIPOS["WEB"])
        self.assertEqual(h.cell("tipo", "refactor"), "♻️ refactor")

    def test_una_tarea_refactor_de_api_o_de_web_es_valida(self):
        self.con_tareas([("HU-12.1", "API", "refactor", "normal", "pendiente"), ("HU-12.2", "WEB", "refactor", "normal", "pendiente")])
        self.assertEqual(self.errors(), [])

    def test_refactor_no_existe_en_doc_ni_en_e2e(self):
        for capa in ("DOC", "E2E"):
            self.con_tareas([("HU-12.1", capa, "producto" if capa == "DOC" else "recorrido", "normal", "pendiente")])
            self.escribe(self.file.read_text(encoding="utf-8").replace(h.cell("tipo", "producto" if capa == "DOC" else "recorrido"), "♻️ refactor"))
            self.assertTrue(self.hay("refactor", "no válido"), capa)

    def test_un_refactor_critico_es_valido_en_api_pero_no_en_web(self):
        self.con_tareas([("HU-12.1", "API", "refactor", "critico", "pendiente")])
        self.assertEqual(self.errors(), [])
        self.con_tareas([("HU-12.1", "WEB", "refactor", "critico", "pendiente")])
        self.assertTrue(self.hay("critico", "[API]"))

    def test_la_plantilla_debe_describir_refactor_en_api_y_en_web(self):
        self.escribe_diccionario(DICCIONARIO_OK)
        self.assertEqual(self.errors(), [])
        sin_web = "\n".join(l for l in DICCIONARIO_OK.splitlines() if not (h.cell("capa", "WEB") in l and "refactor" in l))
        self.escribe_diccionario(sin_web)
        self.assertTrue(self.hay("plantillas/README.md", "WEB"))

    # --- un habilitador se liga a algo ---
    def test_un_habilitador_ligado_a_una_decision_de_arquitectura_es_valido(self):
        self.habilitador(self.LIGADO)
        self.assertEqual(self.errors(), [])

    def test_un_habilitador_sin_ligadura_es_un_error(self):
        self.habilitador("")
        self.assertTrue(self.hay("EN-01.md", "ligado"))

    def test_la_ligadura_a_un_documento_que_no_existe(self):
        self.habilitador("backend/no-existe.md#algo")
        self.assertTrue(self.hay("EN-01.md", "backend/no-existe.md"))

    def test_la_ligadura_a_una_regla_de_negocio(self):
        self.habilitador("RN-13")
        self.assertEqual(self.errors(), [])
        self.habilitador("RN-99")
        self.assertTrue(self.hay("EN-01.md", "RN-99"))

    def test_la_ligadura_que_no_es_regla_ni_documento(self):
        self.habilitador("la arquitectura")
        self.assertTrue(self.hay("EN-01.md", "la arquitectura"))

    def test_una_historia_no_necesita_ligadura(self):
        self.assertEqual(self.errors(), [])  # HU-12 sin `ligado:`

    def test_un_habilitador_cerrado_no_necesita_tarea_e2e(self):
        self.habilitador(self.LIGADO, tareas=(("EN-01.1", "API", "refactor", "normal", "hecho"),), estado="cerrada")
        self.assertEqual(self.errors(), [])


class Impacto(Entorno):
    """«## Impacto en el producto»: los documentos vivos (RN, DP, PA, guías) dicen siempre lo vigente y cada historia dice qué toca."""

    def setUp(self):
        super().setUp()
        self.prod = self.root / "docs" / "product"
        self.prod.mkdir(parents=True, exist_ok=True)
        self.vivos(rn=RN_13, pa=PA_02, dp=DP_05)
        (self.prod / "07-contenido-y-mensajes.md").write_text("# contenido\n", encoding="utf-8")
        (self.root / "docs" / "api-contrato.md").write_text("# contrato\n", encoding="utf-8")

    def vivos(self, rn="", pa="", dp=""):
        for nombre, filas in (("03-reglas-de-negocio.md", rn), ("06-pantallas-y-navegacion.md", pa), ("09-decisiones-y-preguntas.md", dp)):
            (self.prod / nombre).write_text(f"# doc\n\n| ID | Texto | Detalle |\n|---|---|---|\n{filas}\n", encoding="utf-8")

    def con_impacto(self, filas, **kw):
        self.escribe(hu(impacto_=impacto(filas), **kw))
        h.write_changes(self.root)

    # --- la sección ---
    def test_sin_impacto_declarado_es_valido(self):
        self.assertEqual(self.errors(), [])

    def test_falta_la_seccion(self):
        self.escribe(hu(impacto_=""))
        self.assertTrue(self.hay("Impacto en el producto"))

    def test_una_seccion_sin_tabla_ni_declaracion_no_vale(self):
        self.escribe(hu(impacto_="## Impacto en el producto\n\nPor definir.\n"))
        self.assertTrue(self.hay("Impacto en el producto"))

    def test_una_tabla_con_filas_validas(self):
        self.con_impacto([("RN-13", "Disponibilidad orientativa", "modifica", "pendiente")])
        self.assertEqual(self.errors(), [])

    def test_accion_o_estado_fuera_del_vocabulario(self):
        self.con_impacto([("RN-13", "x", "cambia", "pendiente")])
        self.assertTrue(self.hay("RN-13", "cambia"))
        self.con_impacto([("RN-13", "x", "modifica", "listo")])
        self.assertTrue(self.hay("RN-13", "listo"))

    def test_una_accion_invalida_da_un_solo_error_y_no_una_cascada(self):
        self.con_impacto([("RN-13", "x", "cambia", "hecho")])  # además le faltaría la marca «Cambios», pero primero hay que arreglar la acción
        self.assertEqual(len(self.errors()), 1)

    def test_una_fila_con_columnas_de_mas(self):
        self.escribe(hu(impacto_=SIN_IMPACTO.replace("Sin impacto en el producto.", "| RN-13 | x | y | modifica | pendiente |")))
        self.assertTrue(self.hay("Impacto en el producto", "4 columnas"))

    # --- lo que se cita existe ---
    def test_una_regla_que_no_existe(self):
        self.con_impacto([("RN-99", "x", "modifica", "pendiente")])
        self.assertTrue(self.hay("RN-99", "03-reglas-de-negocio.md"))

    def test_cada_id_se_busca_en_su_documento(self):
        self.con_impacto([("PA-02", "x", "modifica", "pendiente"), ("DP-05", "x", "modifica", "pendiente")])
        self.assertEqual(self.errors(), [])
        self.con_impacto([("PA-03", "x", "modifica", "pendiente")])
        self.assertTrue(self.hay("PA-03", "06-pantallas-y-navegacion.md"))
        self.con_impacto([("DP-25", "x", "modifica", "pendiente")])
        self.assertTrue(self.hay("DP-25", "09-decisiones-y-preguntas.md"))

    def test_una_regla_nueva_pendiente_aun_no_existe(self):
        self.con_impacto([("DP-25", "Disponibilidad", "agrega", "pendiente")])
        self.assertEqual(self.errors(), [])

    def test_una_regla_nueva_hecha_ya_tiene_que_existir(self):
        self.con_impacto([("DP-25", "Disponibilidad", "agrega", "hecho")])
        self.assertTrue(self.hay("DP-25", "09-decisiones-y-preguntas.md"))

    def test_un_documento_citado_por_su_ruta(self):
        self.con_impacto([("product/07-contenido-y-mensajes.md", "Textos nuevos", "modifica", "pendiente"), ("api-contrato.md", "available", "modifica", "pendiente")])
        self.assertEqual(self.errors(), [])
        self.con_impacto([("product/no-existe.md", "x", "modifica", "pendiente")])
        self.assertTrue(self.hay("product/no-existe.md"))

    def test_un_documento_que_no_es_ni_id_ni_ruta(self):
        self.con_impacto([("la guía", "x", "modifica", "pendiente")])
        self.assertTrue(self.hay("la guía"))

    def test_el_documento_puede_ir_con_comillas_o_enlace(self):
        self.con_impacto([("`RN-13`", "x", "modifica", "pendiente"), ("[PA-02](../../../product/06-pantallas-y-navegacion.md)", "x", "modifica", "pendiente")])
        self.assertEqual(self.errors(), [])

    def test_un_enlace_con_nombre_legible_se_resuelve_por_su_destino(self):
        self.con_impacto([("[contenido](../../../product/07-contenido-y-mensajes.md)", "x", "modifica", "pendiente"), ("[el contrato](../../../api-contrato.md)", "x", "modifica", "pendiente")])
        self.assertEqual(self.errors(), [])
        self.con_impacto([("[contenido](../../../product/no-existe.md)", "x", "modifica", "pendiente")])
        self.assertTrue(self.hay("product/no-existe.md"))

    # --- la marca «Cambios» en el documento vivo ---
    def test_una_fila_hecha_exige_la_marca_cambios_en_el_documento(self):
        self.con_impacto([("RN-13", "x", "modifica", "hecho")])
        self.assertTrue(self.hay("RN-13", "Cambios: HU-12"))
        self.vivos(rn=RN_13[:-2] + " · Cambios: HU-12 (2026-10-31) |", pa=PA_02, dp=DP_05)
        self.assertEqual(self.errors(), [])

    def test_la_marca_de_otra_historia_no_vale(self):
        self.vivos(rn=RN_13[:-2] + " · Cambios: HU-30 (2026-10-31) |")
        self.con_impacto([("RN-13", "x", "modifica", "hecho")])
        self.assertTrue(self.hay("RN-13", "Cambios: HU-12"))

    def test_la_marca_puede_acumular_historias(self):
        self.vivos(rn=RN_13[:-2] + " · Cambios: HU-30 (2026-10-30), HU-12 (2026-10-31) |")
        self.con_impacto([("RN-13", "x", "modifica", "hecho")])
        self.assertEqual(self.errors(), [])

    def test_la_marca_de_un_id_prefijo_no_confunde(self):
        self.vivos(rn=RN_13[:-2] + " · Cambios: HU-120 (2026-10-31) |")
        self.con_impacto([("RN-13", "x", "modifica", "hecho")])
        self.assertTrue(self.hay("RN-13", "Cambios: HU-12"))

    def test_una_pantalla_puede_llevar_la_marca_en_su_vineta(self):
        self.vivos(pa=PA_02 + "\n- **PA-02 Detalle.** Muestra el stock. Cambios: HU-12 (2026-10-31)")
        self.con_impacto([("PA-02", "x", "modifica", "hecho")])
        self.assertEqual(self.errors(), [])

    def test_retirar_exige_que_el_documento_diga_que_esta_retirado(self):
        self.vivos(dp=DP_05[:-2] + " · Cambios: HU-12 (2026-10-31) |")
        self.con_impacto([("DP-05", "x", "retira", "hecho")])
        self.assertTrue(self.hay("DP-05", "retirad"))
        self.vivos(dp=DP_05[:-2] + " · reemplazada por DP-25 · Cambios: HU-12 (2026-10-31) |")
        self.assertEqual(self.errors(), [])

    def test_los_archivos_no_llevan_marca(self):
        self.con_impacto([("product/07-contenido-y-mensajes.md", "Textos", "modifica", "hecho")])
        self.assertEqual(self.errors(), [])

    # --- cierre ---
    def test_una_historia_cerrada_no_puede_tener_impactos_pendientes(self):
        todas = [(t[0], t[1], t[2], t[3], "hecho") for t in TAREAS] + [("HU-12.5", "E2E", "recorrido", "normal", "hecho")]
        self.escribe(hu(todas, estado="cerrada", impacto_=impacto([("RN-13", "x", "modifica", "pendiente")])))
        h.write_matrix(self.root, [])
        h.write_changes(self.root)
        self.assertTrue(self.hay("cerrada", "Impacto"))
        self.escribe(hu(todas, estado="cerrada", impacto_=impacto([("RN-13", "x", "modifica", "hecho")])))
        h.write_matrix(self.root, [])
        h.write_changes(self.root)
        self.vivos(rn=RN_13[:-2] + " · Cambios: HU-12 (2026-10-31) |", pa=PA_02, dp=DP_05)
        self.assertEqual(self.errors(), [])

    # --- choques entre historias abiertas ---
    def otra(self, sid, estado, estado_fila="pendiente", doc="RN-13"):
        nombre = f"{sid}.md"
        tareas = [(f"{sid}.1", "DOC", "producto", "normal", "pendiente")]
        (self.hu / nombre).write_text(hu(tareas, estado=estado, sid=sid, impacto_=impacto([(doc, "x", "modifica", estado_fila)])), encoding="utf-8")
        h.write_matrix(self.root, [])
        h.write_changes(self.root)

    def test_dos_historias_abiertas_que_tocan_lo_mismo_se_avisan(self):
        self.con_impacto([("RN-13", "x", "modifica", "pendiente")])
        self.otra("HU-30", "aprobada")
        avisos = h.conflicts(self.root)
        self.assertEqual(len(avisos), 1)
        self.assertIn("RN-13", avisos[0])
        self.assertIn("HU-12", avisos[0])
        self.assertIn("HU-30", avisos[0])

    def test_no_hay_choque_si_tocan_cosas_distintas_o_una_ya_esta_hecha(self):
        self.con_impacto([("RN-13", "x", "modifica", "pendiente")])
        self.otra("HU-30", "aprobada", doc="PA-02")
        self.assertEqual(h.conflicts(self.root), [])
        self.otra("HU-31", "aprobada", estado_fila="hecho")
        self.assertEqual(h.conflicts(self.root), [])

    def test_una_historia_cerrada_no_cuenta_como_abierta(self):
        self.con_impacto([("RN-13", "x", "modifica", "pendiente")])
        self.otra("HU-30", "cerrada")
        self.assertEqual(h.conflicts(self.root), [])

    def test_una_historia_solo_propuesta_tambien_cuenta_como_abierta(self):
        self.con_impacto([("RN-13", "x", "modifica", "pendiente")])
        self.otra("HU-30", "propuesta")
        self.assertEqual(len(h.conflicts(self.root)), 1)

    # --- reemplaza ---
    def test_una_historia_que_reemplaza_a_otra_marca_la_matriz(self):
        self.escribe(hu(reemplaza="HU-12"))
        self.assertTrue(self.hay("reemplaza", "HU-12"))  # no puede reemplazarse a sí misma
        self.escribe(HU_OK)
        (self.hu / "HU-30.md").write_text(hu([("HU-30.1", "DOC", "producto", "normal", "pendiente")], sid="HU-30", reemplaza="HU-12"), encoding="utf-8")
        h.write_matrix(self.root, [])
        h.write_changes(self.root)
        self.assertEqual(self.errors(), [])
        self.assertIn("superada por HU-30", h.matrix_cells(self.root)["HU-12"]["Estado"])

    def test_reemplazar_una_historia_que_no_existe(self):
        self.escribe(hu(reemplaza="HU-77"))
        self.assertTrue(self.hay("reemplaza", "HU-77"))

    def test_reemplazar_una_historia_del_historico(self):
        (self.dir / "legado.json").write_text(
            json.dumps({"historias": [{"id": "HU-05", "titulo": "x", "epica": "Cuenta", "api": "✅", "web": "✅", "inicio": "2026-10-28", "cierre": "2026-10-28", "minutos": 1, "tareas_api": [], "tareas_web": [], "compartidas": []}]}),
            encoding="utf-8",
        )
        (self.dir / "fase-1").mkdir()
        (self.dir / "fase-1" / "README.md").write_text("# Fase 1 (MVP)\n", encoding="utf-8")
        self.escribe(hu(reemplaza="HU-05"))
        h.write_matrix(self.root, [])
        h.write_changes(self.root)
        self.assertEqual(self.errors(), [])
        self.assertIn("superada por HU-12", h.matrix_cells(self.root)["HU-05"]["Estado"])


class RegistroDeCambios(Entorno):
    """docs/product/cambios.md: el registro cronológico que genera el script a partir de las tablas de impacto."""

    def setUp(self):
        super().setUp()
        self.prod = self.root / "docs" / "product"
        self.prod.mkdir(parents=True, exist_ok=True)
        for nombre in ("03-reglas-de-negocio.md", "06-pantallas-y-navegacion.md", "09-decisiones-y-preguntas.md"):
            (self.prod / nombre).write_text("# doc\n\n| ID | Texto | Detalle |\n|---|---|---|\n| RN-13 | **Stock** | x · Cambios: HU-12 (2026-10-30) |\n", encoding="utf-8")
        self.log = self.prod / "cambios.md"

    def test_se_crea_si_no_existe_y_lleva_las_marcas(self):
        self.log.unlink(missing_ok=True)
        h.write_changes(self.root)
        texto = self.log.read_text(encoding="utf-8")
        self.assertIn(h.CAMBIOS_INICIO, texto)
        self.assertIn(h.CAMBIOS_FIN, texto)

    def test_sin_impactos_dice_que_no_hay_cambios(self):
        h.write_changes(self.root)
        self.assertIn("Todavía no hay cambios", self.log.read_text(encoding="utf-8"))

    def test_el_registro_enlaza_a_la_historia_dentro_de_su_fase(self):
        self.escribe(hu(impacto_=impacto([("RN-13", "x", "modifica", "pendiente")])))
        h.write_changes(self.root)
        self.assertIn("[HU-12](../historias/fase-2/HU/HU-12.md)", self.log.read_text(encoding="utf-8"))

    def test_lista_cada_fila_con_su_historia_documento_y_estado(self):
        self.escribe(hu(impacto_=impacto([("RN-13", "Disponibilidad orientativa", "modifica", "pendiente")])))
        h.write_changes(self.root)
        texto = self.log.read_text(encoding="utf-8")
        self.assertIn("HU-12", texto)
        self.assertIn("RN-13", texto)
        self.assertIn("Disponibilidad orientativa", texto)
        self.assertIn("modifica", texto)
        self.assertIn("pendiente", texto)

    def test_las_hechas_van_primero_ordenadas_por_fecha_y_las_pendientes_al_final(self):
        hecho = [("HU-30.1", "DOC", "producto", "normal", "hecho")]
        (self.hu / "HU-30.md").write_text(
            hu(hecho, sid="HU-30", impacto_=impacto([("RN-13", "Cambio ya aplicado", "modifica", "hecho")])), encoding="utf-8")
        self.escribe(hu(impacto_=impacto([("RN-13", "Cambio por aplicar", "modifica", "pendiente")])))
        h.write_changes(self.root)
        texto = self.log.read_text(encoding="utf-8")
        self.assertLess(texto.index("Cambio ya aplicado"), texto.index("Cambio por aplicar"))
        self.assertIn("2026-10-30", texto)  # la fecha sale del fin de la tarea [DOC] hecha

    def test_conserva_lo_escrito_fuera_de_las_marcas(self):
        h.write_changes(self.root)
        texto = self.log.read_text(encoding="utf-8")
        self.log.write_text("# Mi encabezado\n\n" + texto[texto.index(h.CAMBIOS_INICIO):] + "\npie\n", encoding="utf-8")
        h.write_changes(self.root)
        texto = self.log.read_text(encoding="utf-8")
        self.assertIn("# Mi encabezado", texto)
        self.assertTrue(texto.rstrip().endswith("pie"))

    def test_el_comprobador_detecta_un_registro_desactualizado(self):
        self.assertEqual(self.errors(), [])
        self.escribe(hu(impacto_=impacto([("RN-13", "Otro", "modifica", "pendiente")])))
        self.assertTrue(self.hay("cambios.md"))
        h.write_changes(self.root)
        self.assertEqual(self.errors(), [])

    def test_el_comprobador_detecta_que_falta_el_registro(self):
        self.log.unlink()
        self.assertTrue(self.hay("cambios.md"))


class DocumentosReales(unittest.TestCase):
    """Lo que de verdad hay en docs/historias: debe cumplir las mismas reglas."""

    def test_la_tabla_de_tipos_de_la_plantilla_coincide_con_el_script(self):
        plantilla = (ROOT / "docs" / "historias" / "plantillas" / "README.md").read_text(encoding="utf-8")
        self.assertEqual({c: tuple(t) for c, t in h.parse_types_table(plantilla).items()}, h.TIPOS)
        self.assertEqual(h.parse_always_critical(plantilla), set(h.SIEMPRE_CRITICOS))

    def test_los_documentos_del_repositorio_pasan_la_comprobacion(self):
        self.assertEqual(h.check(ROOT), [])

    def test_el_registro_de_cambios_esta_al_dia(self):
        registro = (ROOT / h.CAMBIOS).read_text(encoding="utf-8")
        inicio, fin = registro.index(h.CAMBIOS_INICIO), registro.index(h.CAMBIOS_FIN)
        self.assertEqual(registro[inicio + len(h.CAMBIOS_INICIO):fin].strip(), h.render_changes(ROOT).strip())

    # Cada archivo dice lo que es: el README de historias, el índice y las reglas; el de cada fase, su objetivo; su matriz, el estado
    def test_el_readme_de_historias_se_titula_por_lo_que_es(self):
        titulo = (ROOT / "docs" / "historias" / "README.md").read_text(encoding="utf-8").splitlines()[0]
        self.assertEqual(titulo, "# Historias y habilitadores")

    def test_el_readme_de_historias_no_contiene_ninguna_matriz_solo_el_indice(self):
        texto = (ROOT / "docs" / "historias" / "README.md").read_text(encoding="utf-8")
        self.assertNotIn("| ID |", texto)
        self.assertIn("| Fase | Historias | Habilitadores | Matriz |", texto)

    def test_ningun_readme_dice_que_la_matriz_es_una_sola_ni_la_llama_de_archivos(self):
        for ruta in ("docs/historias/README.md", "docs/historias/fase-1/README.md", "docs/historias/fase-2/README.md"):
            texto = (ROOT / ruta).read_text(encoding="utf-8")
            self.assertNotIn("matriz y archivos", texto, ruta)
            self.assertNotIn("../README.md#matriz", texto, ruta)
            self.assertNotIn("en una sola tabla", texto, ruta)

    def test_cada_readme_de_fase_enlaza_a_su_matriz_y_no_repite_su_tabla(self):
        for fase in h.fase_numbers(ROOT):
            texto = (ROOT / "docs" / "historias" / f"fase-{fase}" / "README.md").read_text(encoding="utf-8")
            self.assertIn("(matriz.md)", texto, f"fase-{fase}")
            self.assertNotIn("| Historia |", texto, f"fase-{fase}: la tabla de historias es de la matriz")
            self.assertNotIn("| ID |", texto, f"fase-{fase}")

    # Los documentos vivos ya no hablan de una matriz única ni mandan a una que dejó de existir en el README de historias
    DOCUMENTOS_VIVOS = [
        "CLAUDE.md", ".claude/skills/hu/SKILL.md", ".claude/skills/tarea/SKILL.md", "docs/guia-de-desarrollo.md",
        "docs/herramientas-de-trabajo.md", "docs/historias/plantillas/HU.md", "docs/historias/plantillas/EN.md", "docs/historias/plantillas/idea.md",
        "docs/historias/plantillas/README.md", "docs/product/README.md",
        "docs/frontend/README.md", "apps/main-api/README.md", "apps/store-web/README.md", "docs/historias/README.md",
    ]
    FRASES_DE_LA_MATRIZ_UNICA = [
        "la matriz de todas", "matriz de todas las historias", "la **matriz** de todas", "matriz de `historias/README.md`",
        "matriz de `docs/historias/README.md`", "matriz de [`historias/README.md`]", "matriz de [`../historias/README.md`]",
        "esa misma matriz", "la agrega a la matriz.", "agrega la fila a la matriz y comprueba", "Regenerar la matriz", "regenera la matriz",
        "actualiza la matriz", "comprobador de la matriz", "(incluida la matriz",
    ]

    def test_ningun_documento_vivo_habla_de_una_matriz_unica(self):
        for ruta in self.DOCUMENTOS_VIVOS:
            texto = (ROOT / ruta).read_text(encoding="utf-8")
            for frase in self.FRASES_DE_LA_MATRIZ_UNICA:
                self.assertNotIn(frase, texto, f"{ruta}: «{frase}»")

    RUTAS_Y_NOMBRES_ANTIGUOS = ["_plantilla.md", "_idea.md", "fase-n/HU-nn", "fase-n/EN-nn", "HU-nn-titulo", "historias/HU-nn", "fase-n/HU-", "fase-n/EN-"]

    def test_ningun_documento_vivo_usa_las_rutas_ni_los_nombres_antiguos(self):
        vivos = self.DOCUMENTOS_VIVOS + ["docs/historias/fase-1/README.md", "docs/historias/fase-2/README.md"]
        for ruta in vivos:
            texto = (ROOT / ruta).read_text(encoding="utf-8")
            for antiguo in self.RUTAS_Y_NOMBRES_ANTIGUOS:
                self.assertNotIn(antiguo, texto, f"{ruta}: «{antiguo}»")

    def test_los_comandos_mandan_a_la_plantilla_de_su_tipo(self):
        for ruta in (".claude/skills/hu/SKILL.md", ".claude/skills/tarea/SKILL.md"):
            texto = (ROOT / ruta).read_text(encoding="utf-8")
            self.assertIn("plantillas/", texto, ruta)
        hu_ = (ROOT / ".claude/skills/hu/SKILL.md").read_text(encoding="utf-8")
        for plantilla in ("plantillas/HU.md", "plantillas/EN.md", "plantillas/idea.md"):
            self.assertIn(plantilla, hu_, plantilla)

    def test_el_readme_de_historias_explica_la_estructura_de_la_carpeta(self):
        texto = (ROOT / "docs" / "historias" / "README.md").read_text(encoding="utf-8")
        for pieza in ("fase-n/HU/", "fase-n/EN/", "plantillas/", "matriz.md", "plantillas/README.md"):
            self.assertIn(pieza, texto, pieza)

    def test_las_rutas_que_se_citan_existen_o_son_un_patron(self):
        # `docs/historias/fase-n/HU/HU-nn.md` es un patrón; las rutas concretas con número de fase sí deben existir
        concretas = set()
        for ruta in self.DOCUMENTOS_VIVOS:
            concretas |= set(re.findall(r"docs/historias/fase-\d/(?:HU|EN)/(?:HU|EN)-\d+\.md", (ROOT / ruta).read_text(encoding="utf-8")))
        for ruta in concretas:
            self.assertTrue((ROOT / ruta).exists(), ruta)

    def test_los_documentos_que_mandan_a_leer_el_estado_nombran_la_matriz_de_la_fase(self):
        for ruta in ("CLAUDE.md", ".claude/skills/hu/SKILL.md", ".claude/skills/tarea/SKILL.md", "docs/guia-de-desarrollo.md", "docs/herramientas-de-trabajo.md"):
            texto = (ROOT / ruta).read_text(encoding="utf-8")
            self.assertIn("matriz", texto)
            self.assertTrue("fase-n/matriz.md" in texto or "matriz de su fase" in texto or "matrices" in texto, ruta)

    # Los archivos congelados (historial): empiezan, justo después del título, con la advertencia de que no se actualizan más
    CONGELADOS = {
        "docs/avance.md": "2026-10-31",
        "docs/backend/00-avance.md": "2026-10-30",
        "docs/frontend/00-avance.md": "2026-10-30",
        "docs/backend/07-fases-y-roadmap.md": "2026-10-31",
        "docs/frontend/07-fases-y-roadmap.md": "2026-10-31",
        "docs/libroya-backend-guia.md": "2026-10-31",
    }

    def test_los_archivos_congelados_empiezan_con_la_advertencia_de_que_no_se_actualizan_mas(self):
        for ruta, fecha in self.CONGELADOS.items():
            cabecera = "\n".join((ROOT / ruta).read_text(encoding="utf-8").splitlines()[:6])
            self.assertIn(f"❄️ Historial congelado desde el {fecha}", cabecera, ruta)
            self.assertIn("no se actualizará más", cabecera, ruta)

    def test_la_advertencia_dice_donde_esta_hoy_cada_tipo_de_informacion(self):
        for ruta in self.CONGELADOS:
            cabecera = "\n".join((ROOT / ruta).read_text(encoding="utf-8").splitlines()[:6])
            for palabra in ("git log", "matriz de historias", "documentos vivos"):
                self.assertIn(palabra, cabecera, f"{ruta}: {palabra}")

    def test_las_epicas_de_las_veinte_historias_anteriores_estan_en_la_lista(self):
        legado = json.loads((ROOT / "docs" / "historias" / "legado.json").read_text(encoding="utf-8"))
        self.assertEqual({x["epica"] for x in legado["historias"]} - set(h.EPICAS), set())

    def test_el_readme_de_la_fase_1_explica_de_donde_salen_los_datos_de_legado_json(self):
        texto = (ROOT / "docs" / "historias" / "fase-1" / "README.md").read_text(encoding="utf-8")
        self.assertIn("## De dónde salen los datos de `legado.json`", texto)
        for palabra in ("git log", "aproximación", "hora de Lima", "tope de 60"):
            self.assertIn(palabra, texto, palabra)
        for campo in h.CAMPOS_LEGADO:
            self.assertIn(f"`{campo}`", texto, f"el campo {campo} no está documentado")

    def test_legado_json_solo_lleva_datos(self):
        datos = json.loads((ROOT / "docs" / "historias" / "legado.json").read_text(encoding="utf-8"))
        self.assertEqual(list(datos), ["historias"])
        for x in datos["historias"]:
            self.assertEqual(set(x), set(h.CAMPOS_LEGADO))

    def test_cada_plantilla_tiene_el_encabezado_de_su_tipo(self):
        carpeta = ROOT / "docs" / "historias" / "plantillas"
        hu_, en_ = (h.parse_front_matter((carpeta / f"{n}.md").read_text(encoding="utf-8")) for n in ("HU", "EN"))
        self.assertEqual((hu_["tipo"], en_["tipo"]), ("HU", "EN"))
        for campo in h.REQUERIDOS_POR_TIPO["HU"]:
            self.assertIn(campo, hu_)
        for campo in h.REQUERIDOS_POR_TIPO["EN"] + ("ligado",):
            self.assertIn(campo, en_)
        self.assertNotIn("epica", en_)  # un habilitador no lleva epica
        self.assertNotIn("ligado", hu_)

    def test_las_plantillas_viejas_ya_no_estan_en_la_raiz(self):
        for nombre in ("_plantilla.md", "_idea.md"):
            self.assertFalse((ROOT / "docs" / "historias" / nombre).exists(), nombre)

    def test_la_plantilla_de_una_idea_existe_y_es_una_idea(self):
        texto = (ROOT / "docs" / "historias" / "plantillas" / "idea.md").read_text(encoding="utf-8")
        meta = h.parse_front_matter(texto)
        self.assertEqual(meta["estado"], "idea")
        for campo in h.REQUERIDOS_POR_TIPO["HU"]:
            self.assertIn(campo, meta)
        self.assertIn("propuesta", texto)  # explica cómo se promueve

    def test_los_archivos_ya_tienen_el_formato_canonico(self):
        for path in h.story_files(ROOT):
            texto = path.read_text(encoding="utf-8")
            self.assertEqual(h.format_text(texto), texto, f"{path.name}: ejecuta `python3 scripts/historias.py --formato`")

    def test_estan_las_veinte_historias_anteriores_como_historico(self):
        legado = json.loads((ROOT / "docs" / "historias" / "legado.json").read_text(encoding="utf-8"))
        ids = [x["id"] for x in legado["historias"]]
        self.assertEqual(len(ids), 20)
        self.assertEqual(len(set(ids)), 20)
        # los mismos títulos que la tabla de product/04
        resumen = (ROOT / "docs" / "product" / "04-historias-de-usuario.md").read_text(encoding="utf-8")
        for x in legado["historias"]:
            self.assertIn(f"[{x['id']}]", resumen)
            self.assertIn(x["titulo"], resumen)

    def test_las_tareas_del_legado_existen_en_el_historial_de_git(self):
        commits = h.git_commits(ROOT)
        legado = json.loads((ROOT / "docs" / "historias" / "legado.json").read_text(encoding="utf-8"))
        subjects = " ".join(s for _, _, s in commits)
        for x in legado["historias"]:
            for t in x["tareas_api"] + x["tareas_web"]:
                self.assertIn(f"{t}:", subjects, f"{x['id']}: la tarea {t} no tiene commit")


if __name__ == "__main__":
    unittest.main()
