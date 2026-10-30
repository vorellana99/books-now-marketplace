"""Pruebas de scripts/historias.py (la matriz de historias). Se ejecutan con: cd scripts && python3 -m unittest test_historias"""
import json
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


def hu(tareas=TAREAS, estado="aprobada", contrato=True, pantalla=True, detalle=True, sid="HU-12", exec_=True):
    partes = [f"---\nid: {sid}\ntitulo: Ver si hay stock de un libro\ntipo: HU\nepica: Catálogo\nestado: {estado}\namplia:\n---\n", f"# {sid}\n"]
    if contrato:
        partes.append("## Contrato\n\nSin cambios en el contrato.\n")
    if pantalla:
        partes.append("## Pantalla\n\nSin cambios visuales.\n")
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
        _fila_tipo("WEB", "pantalla", "Lo que se ve", "Mover un botón", "no"),
        _fila_tipo("WEB", "comportamiento", "Lo que la tienda hace", "Pedir un campo", "no"),
        _fila_tipo("DOC", "producto", "Reglas y decisiones", "`RN-13`", "no"),
        _fila_tipo("DOC", "guia", "Guías técnicas", "`CLAUDE.md`", "no"),
        _fila_tipo("E2E", "recorrido", "El recorrido de punta a punta", "—", "no"),
        "",
    ]
)


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
        self.assertEqual(tipos["API"], ["contrato", "regla", "evento", "base-de-datos", "configuracion"])
        self.assertEqual(tipos["WEB"], ["pantalla", "comportamiento"])
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
        self.assertIn("_plantilla.md", texto)

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
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "docs" / "historias").mkdir(parents=True)
        (self.root / "docs" / "historias" / "legado.json").write_text(
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
        (self.root / "docs" / "historias" / "HU-12-ver-si-hay-stock-de-un-libro.md").write_text(HU_OK, encoding="utf-8")
        self.commits = [("a", at(9), "HU-12.1 [DOC]: x"), ("b", at(9, 30), "HU-12.2 [API]: y")]

    def tearDown(self):
        self.tmp.cleanup()

    def test_filas_antiguas_y_nuevas_ordenadas_por_numero(self):
        rows = h.build_rows(self.root, self.commits)
        self.assertEqual([r["id"] for r in rows], ["HU-01", "HU-12", "HU-50"])

    def test_una_historia_antigua_marca_la_aproximacion_y_enlaza_a_producto(self):
        row = h.build_rows(self.root, self.commits)[0]
        self.assertTrue(row["tiempo"].startswith("≈ "))
        self.assertIn("../product/04-historias-de-usuario.md#hu-01-registrarme", row["detalle"])
        self.assertEqual(row["estado"], "✅ cerrada")

    def test_una_historia_antigua_con_la_web_pendiente_no_tiene_cierre(self):
        row = h.build_rows(self.root, self.commits)[2]
        self.assertEqual((row["api"], row["web"], row["cierre"]), ("✅", "⬜", "—"))
        self.assertEqual(row["estado"], "🔄 API hecha, Web pendiente")

    def test_una_historia_nueva_toma_capas_tareas_y_tiempo_de_su_archivo_y_de_git(self):
        row = h.build_rows(self.root, self.commits)[1]
        self.assertEqual(row["estado"], "⬜ aprobada")
        self.assertEqual((row["api"], row["web"]), ("🔄", "⬜"))
        self.assertEqual(row["tareas"], "2 / 4")
        self.assertEqual(row["inicio"], "2026-10-30")
        self.assertEqual(row["cierre"], "—")  # solo tiene cierre una HU cerrada
        self.assertEqual(row["tiempo"], "30 min")
        self.assertEqual(row["detalle"], "[HU-12](HU-12-ver-si-hay-stock-de-un-libro.md)")

    def test_la_plantilla_y_los_archivos_con_guion_bajo_se_ignoran(self):
        (self.root / "docs" / "historias" / "_plantilla.md").write_text("---\nid: HU-nn\n---\n", encoding="utf-8")
        self.assertEqual(len(h.build_rows(self.root, self.commits)), 3)

    def test_se_reescribe_solo_lo_que_hay_entre_las_marcas(self):
        readme = self.root / "docs" / "historias" / "README.md"
        readme.write_text(f"antes\n{h.START}\nviejo\n{h.END}\ndespués\n", encoding="utf-8")
        h.write_matrix(self.root, self.commits)
        text = readme.read_text(encoding="utf-8")
        self.assertTrue(text.startswith("antes\n"))
        self.assertTrue(text.endswith("después\n"))
        self.assertIn("| HU-12 |", text)
        self.assertNotIn("viejo", text)

    def test_sin_marcas_es_un_error(self):
        (self.root / "docs" / "historias" / "README.md").write_text("sin marcas", encoding="utf-8")
        with self.assertRaises(h.HistoriaError):
            h.write_matrix(self.root, self.commits)


class Comprobacion(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.dir = self.root / "docs" / "historias"
        self.dir.mkdir(parents=True)
        (self.dir / "legado.json").write_text(json.dumps({"tope_minutos": 60, "historias": []}), encoding="utf-8")
        self.file = self.dir / "HU-12-ver-si-hay-stock-de-un-libro.md"
        self.file.write_text(HU_OK, encoding="utf-8")
        (self.dir / "README.md").write_text(f"{h.START}\n{h.END}\n", encoding="utf-8")
        h.write_matrix(self.root, [])

    def tearDown(self):
        self.tmp.cleanup()

    def errors(self):
        return h.check(self.root)

    def escribe(self, texto):
        self.file.write_text(texto, encoding="utf-8")

    def con_tareas(self, tareas, **kw):
        self.escribe(hu(tareas, **kw))

    def hay(self, *palabras):
        return any(all(p in e for p in palabras) for e in self.errors())

    # --- lo básico ---
    def test_todo_en_orden(self):
        self.assertEqual(self.errors(), [])

    def test_el_nombre_del_archivo_empieza_por_el_id(self):
        self.file.rename(self.dir / "HU-13-otro-nombre.md")
        self.assertTrue(self.hay("nombre"))

    def test_estado_invalido(self):
        self.escribe(HU_OK.replace("estado: aprobada", "estado: terminada"))
        self.assertTrue(self.hay("estado"))

    def test_una_tarea_de_otra_historia_en_el_archivo(self):
        self.escribe(HU_OK.replace("| HU-12.4 |", "| HU-13.1 |"))
        self.assertTrue(self.hay("HU-13.1"))

    def test_id_repetido_entre_el_legado_y_un_archivo(self):
        (self.dir / "legado.json").write_text(
            json.dumps({"tope_minutos": 60, "historias": [{"id": "HU-12", "titulo": "x", "epica": "x", "api": "✅", "web": "✅", "inicio": "2026-10-28", "cierre": "2026-10-28", "minutos": 1, "tareas_api": [], "tareas_web": [], "compartidas": []}]}),
            encoding="utf-8",
        )
        self.assertTrue(self.hay("repetido"))

    def test_una_historia_sin_fila_en_la_matriz(self):
        (self.dir / "README.md").write_text(f"{h.START}\n| ID |\n{h.END}\n", encoding="utf-8")
        self.assertTrue(self.hay("matriz"))

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
        self.assertTrue(self.hay("_plantilla.md"))

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
        (self.dir / "_plantilla.md").write_text(PLANTILLA_OK, encoding="utf-8")
        self.assertEqual(self.errors(), [])

    def test_una_plantilla_con_un_icono_distinto_da_error(self):
        (self.dir / "_plantilla.md").write_text(PLANTILLA_OK.replace(h.cell("tipo", "regla"), "📏 regla"), encoding="utf-8")
        self.assertTrue(self.hay("_plantilla.md", "icono", "regla"))

    def test_una_plantilla_que_se_desincroniza_del_script_da_error(self):
        (self.dir / "_plantilla.md").write_text(PLANTILLA_OK.replace(h.cell("tipo", "pantalla"), "🖼️ vista"), encoding="utf-8")
        self.assertTrue(self.hay("_plantilla.md", "WEB"))
        (self.dir / "_plantilla.md").write_text(PLANTILLA_OK.replace("| Un aviso entre partes | Reaccionar a algo | sí |", "| Un aviso entre partes | Reaccionar a algo | no |"), encoding="utf-8")
        self.assertTrue(self.hay("critico", "_plantilla.md"))


class DocumentosReales(unittest.TestCase):
    """Lo que de verdad hay en docs/historias: debe cumplir las mismas reglas."""

    def test_la_tabla_de_tipos_de_la_plantilla_coincide_con_el_script(self):
        plantilla = (ROOT / "docs" / "historias" / "_plantilla.md").read_text(encoding="utf-8")
        self.assertEqual({c: tuple(t) for c, t in h.parse_types_table(plantilla).items()}, h.TIPOS)
        self.assertEqual(h.parse_always_critical(plantilla), set(h.SIEMPRE_CRITICOS))

    def test_los_documentos_del_repositorio_pasan_la_comprobacion(self):
        self.assertEqual(h.check(ROOT), [])

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
