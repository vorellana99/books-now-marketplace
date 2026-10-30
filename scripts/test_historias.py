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


HU_OK = """---
id: HU-12
titulo: Ver si hay stock de un libro
tipo: HU
epica: Catálogo
estado: aprobada
amplia:
---

# HU-12

## Contrato

Sin cambios en el contrato.

## Pantalla

Sin cambios visuales.

## Tareas

| # | Capa | Tipo | Tarea | Se comprueba | Depende de | Estado |
|---|---|---|---|---|---|---|
| HU-12.1 | [DOC] | producto | Decisión | lo que sea | — | ✅ |
| HU-12.2 | [API] | regla 🔒 | Inventario | lo que sea | HU-12.1 | ✅ |
| HU-12.3 | [API] | contrato | Catálogo | lo que sea | HU-12.2 | ⬜ |
| HU-12.4 | [WEB] | pantalla | Pantalla | lo que sea | HU-12.3 | ⬜ |
"""


PLANTILLA_OK = """# plantilla

> | Capa | Tipo | ¿Qué cambia? | Ejemplos | ¿Siempre 🔒? |
> |---|---|---|---|---|
> | `[API]` | `contrato` | Lo que la API ofrece | Un campo más | no |
> | `[API]` | `regla` | Cómo decide el negocio | Un límite | no |
> | `[API]` | `evento` | Un aviso entre partes | Reaccionar a algo | sí |
> | `[API]` | `base-de-datos` | Las tablas | Una columna | sí |
> | `[API]` | `configuracion` | Una variable de entorno | `JWT_SECRET` | no |
> | `[WEB]` | `pantalla` | Lo que se ve | Mover un botón | no |
> | `[WEB]` | `comportamiento` | Lo que la tienda hace | Pedir un campo | no |
> | `[DOC]` | `producto` | Reglas y decisiones | `RN-13` | no |
> | `[DOC]` | `guia` | Guías técnicas | `CLAUDE.md` | no |
> | `[E2E]` | `recorrido` | El recorrido de punta a punta | — | no |
"""


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
        tareas = h.parse_tasks(HU_OK)
        self.assertEqual(
            tareas,
            [("HU-12.1", "DOC", "✅"), ("HU-12.2", "API", "✅"), ("HU-12.3", "API", "⬜"), ("HU-12.4", "WEB", "⬜")],
        )

    def test_tipo_y_rigor_de_cada_tarea(self):
        self.assertEqual(
            h.parse_task_types(HU_OK),
            [("HU-12.1", "DOC", "producto", False), ("HU-12.2", "API", "regla", True), ("HU-12.3", "API", "contrato", False), ("HU-12.4", "WEB", "pantalla", False)],
        )

    def test_estado_de_una_capa(self):
        tareas = h.parse_tasks(HU_OK)
        self.assertEqual(h.layer_status(tareas, "API"), "🔄")
        self.assertEqual(h.layer_status(tareas, "WEB"), "⬜")
        self.assertEqual(h.layer_status(tareas, "DOC"), "✅")
        self.assertEqual(h.layer_status(tareas, "E2E"), "—")  # no hay tareas de esa capa


class TablaDeTipos(unittest.TestCase):
    def test_lee_la_tabla_de_la_plantilla(self):
        tipos = h.parse_types_table(PLANTILLA_OK)
        self.assertEqual(tipos["API"], ["contrato", "regla", "evento", "base-de-datos", "configuracion"])
        self.assertEqual(tipos["WEB"], ["pantalla", "comportamiento"])
        self.assertEqual(tipos["E2E"], ["recorrido"])

    def test_lee_cuales_son_siempre_criticos(self):
        self.assertEqual(h.parse_always_critical(PLANTILLA_OK), {"evento", "base-de-datos"})

    def test_el_script_y_la_tabla_coinciden(self):
        self.assertEqual({c: tuple(t) for c, t in h.parse_types_table(PLANTILLA_OK).items()}, h.TIPOS)
        self.assertEqual(h.parse_always_critical(PLANTILLA_OK), set(h.SIEMPRE_CRITICOS))

    def test_imprime_la_tabla_para_consultarla(self):
        texto = h.render_types(PLANTILLA_OK)
        self.assertIn("[API] contrato", texto)
        self.assertIn("Lo que la API ofrece", texto)
        self.assertIn("siempre 🔒", texto)  # base-de-datos y evento
        self.assertIn("_plantilla.md", texto)

    def test_la_salida_de_tipos_no_lleva_marcas_de_markdown(self):
        texto = h.render_types(PLANTILLA_OK.replace("Lo que la API ofrece", "**Lo que la API ofrece**").replace("`JWT_SECRET`", "`JWT_SECRET` y `X`"))
        self.assertNotIn("**", texto)
        self.assertNotIn("`", texto)
        self.assertIn("Lo que la API ofrece", texto)


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

    def test_todo_en_orden(self):
        self.assertEqual(self.errors(), [])

    def test_el_nombre_del_archivo_empieza_por_el_id(self):
        self.file.rename(self.dir / "HU-13-otro-nombre.md")
        self.assertTrue(any("nombre" in e for e in self.errors()))

    def test_estado_invalido(self):
        self.file.write_text(HU_OK.replace("estado: aprobada", "estado: terminada"), encoding="utf-8")
        self.assertTrue(any("estado" in e for e in self.errors()))

    def test_una_tarea_de_otra_historia_en_el_archivo(self):
        self.file.write_text(HU_OK.replace("| HU-12.4 |", "| HU-13.1 |"), encoding="utf-8")
        self.assertTrue(any("HU-13.1" in e for e in self.errors()))

    def test_una_historia_con_tareas_api_necesita_su_seccion_contrato(self):
        self.file.write_text(HU_OK.replace("## Contrato\n\nSin cambios en el contrato.\n\n", ""), encoding="utf-8")
        self.assertTrue(any("Contrato" in e for e in self.errors()))

    def test_una_historia_sin_tareas_api_no_necesita_contrato(self):
        solo_web = HU_OK.replace("## Contrato\n\nSin cambios en el contrato.\n\n", "").replace("[API] | regla 🔒", "[WEB] | comportamiento").replace("[API] | contrato", "[WEB] | comportamiento")
        self.file.write_text(solo_web, encoding="utf-8")
        self.assertEqual(self.errors(), [])

    def test_una_historia_con_tareas_web_necesita_su_seccion_pantalla(self):
        self.file.write_text(HU_OK.replace("## Pantalla\n\nSin cambios visuales.\n\n", ""), encoding="utf-8")
        self.assertTrue(any("Pantalla" in e for e in self.errors()))

    def test_una_seccion_pantalla_vacia_no_vale(self):
        self.file.write_text(HU_OK.replace("Sin cambios visuales.", ""), encoding="utf-8")
        self.assertTrue(any("Pantalla" in e for e in self.errors()))

    def test_una_historia_sin_tareas_web_no_necesita_pantalla(self):
        solo_api = HU_OK.replace("## Pantalla\n\nSin cambios visuales.\n\n", "").replace("[WEB] | pantalla", "[API] | contrato")
        self.file.write_text(solo_api, encoding="utf-8")
        self.assertEqual(self.errors(), [])

    def test_una_seccion_contrato_vacia_no_vale(self):
        self.file.write_text(HU_OK.replace("Sin cambios en el contrato.", ""), encoding="utf-8")
        self.assertTrue(any("Contrato" in e for e in self.errors()))

    def test_el_tipo_debe_ser_de_la_capa(self):
        self.file.write_text(HU_OK.replace("[WEB] | pantalla", "[WEB] | contrato"), encoding="utf-8")
        self.assertTrue(any("tipo" in e and "HU-12.4" in e for e in self.errors()))

    def test_los_nombres_antiguos_ya_no_valen(self):
        fila_por_capa = {"API": "[API] | contrato", "WEB": "[WEB] | pantalla", "DOC": "[DOC] | producto"}
        for viejo, capa in (("ruta", "API"), ("dominio", "API"), ("migración", "API"), ("config", "API"), ("datos", "WEB"),
                            ("base de datos", "API"), ("configuración", "API"), ("guía", "DOC")):
            self.file.write_text(HU_OK.replace(fila_por_capa[capa], f"[{capa}] | {viejo}"), encoding="utf-8")
            self.assertTrue(any("tipo" in e for e in self.errors()), viejo)
        conE2E = HU_OK + "| HU-12.5 | [E2E] | — | Recorrido | lo que sea | HU-12.4 | ⬜ |\n"
        self.file.write_text(conE2E, encoding="utf-8")
        self.assertTrue(any("tipo" in e and "HU-12.5" in e for e in self.errors()))

    def test_las_mayusculas_no_valen(self):
        self.file.write_text(HU_OK.replace("[API] | contrato", "[API] | Contrato"), encoding="utf-8")
        self.assertTrue(any("tipo" in e and "HU-12.3" in e for e in self.errors()))

    def test_todos_los_tipos_son_kebab_case(self):
        for capa, tipos in h.TIPOS.items():
            for tipo in tipos:
                self.assertRegex(tipo, r"^[a-z0-9]+(-[a-z0-9]+)*$", f"{capa}: {tipo}")

    def test_el_error_lista_los_tipos_validos_de_la_capa(self):
        self.file.write_text(HU_OK.replace("[API] | contrato", "[API] | cosa"), encoding="utf-8")
        mensaje = " ".join(self.errors())
        for tipo in ("contrato", "regla", "evento", "base-de-datos", "configuracion"):
            self.assertIn(tipo, mensaje)

    def test_el_error_de_tipo_apunta_a_la_plantilla(self):
        self.file.write_text(HU_OK.replace("[API] | contrato", "[API] | cosa"), encoding="utf-8")
        self.assertTrue(any("_plantilla.md" in e for e in self.errors()))

    def test_una_plantilla_que_coincide_con_el_script_no_da_error(self):
        (self.dir / "_plantilla.md").write_text(PLANTILLA_OK, encoding="utf-8")
        self.assertEqual(self.errors(), [])

    def test_una_plantilla_que_se_desincroniza_del_script_da_error(self):
        (self.dir / "_plantilla.md").write_text(PLANTILLA_OK.replace("| `[WEB]` | `pantalla` |", "| `[WEB]` | `vista` |"), encoding="utf-8")
        errores = self.errors()
        self.assertTrue(any("_plantilla.md" in e and "WEB" in e for e in errores))
        (self.dir / "_plantilla.md").write_text(PLANTILLA_OK.replace("| Un aviso entre partes | Reaccionar a algo | sí |", "| Un aviso entre partes | Reaccionar a algo | no |"), encoding="utf-8")
        self.assertTrue(any("🔒" in e and "_plantilla.md" in e for e in self.errors()))

    def test_una_tarea_sin_tipo(self):
        self.file.write_text(HU_OK.replace("[API] | contrato", "[API] |  "), encoding="utf-8")
        self.assertTrue(any("tipo" in e and "HU-12.3" in e for e in self.errors()))

    def test_migracion_y_evento_siempre_son_criticos(self):
        for tipo in ("base-de-datos", "evento"):
            self.file.write_text(HU_OK.replace("[API] | contrato", f"[API] | {tipo}"), encoding="utf-8")
            self.assertTrue(any("🔒" in e and "HU-12.3" in e for e in self.errors()), tipo)
            self.file.write_text(HU_OK.replace("[API] | contrato", f"[API] | {tipo} 🔒"), encoding="utf-8")
            self.assertEqual(self.errors(), [], tipo)

    def test_la_marca_de_rigor_solo_va_en_tareas_api(self):
        self.file.write_text(HU_OK.replace("[WEB] | pantalla", "[WEB] | pantalla 🔒"), encoding="utf-8")
        self.assertTrue(any("🔒" in e and "HU-12.4" in e for e in self.errors()))

    def test_las_tareas_e2e_no_llevan_tipo(self):
        conE2E = HU_OK + "| HU-12.5 | [E2E] | recorrido | Recorrido | lo que sea | HU-12.4 | ⬜ |\n"
        self.file.write_text(conE2E, encoding="utf-8")
        self.assertEqual(self.errors(), [])
        self.file.write_text(conE2E.replace("[E2E] | recorrido", "[E2E] | contrato"), encoding="utf-8")
        self.assertTrue(any("tipo" in e and "HU-12.5" in e for e in self.errors()))

    def test_una_historia_cerrada_con_tareas_pendientes(self):
        self.file.write_text(HU_OK.replace("estado: aprobada", "estado: cerrada"), encoding="utf-8")
        self.assertTrue(any("cerrada" in e for e in self.errors()))

    def test_una_historia_propuesta_no_puede_tener_tareas_hechas(self):
        self.file.write_text(HU_OK.replace("estado: aprobada", "estado: propuesta"), encoding="utf-8")
        self.assertTrue(any("propuesta" in e for e in self.errors()))

    def test_una_historia_sin_fila_en_la_matriz(self):
        (self.dir / "README.md").write_text(f"{h.START}\n| ID |\n{h.END}\n", encoding="utf-8")
        self.assertTrue(any("matriz" in e for e in self.errors()))

    def test_id_repetido_entre_el_legado_y_un_archivo(self):
        (self.dir / "legado.json").write_text(
            json.dumps({"tope_minutos": 60, "historias": [{"id": "HU-12", "titulo": "x", "epica": "x", "api": "✅", "web": "✅", "inicio": "2026-10-28", "cierre": "2026-10-28", "minutos": 1, "tareas_api": [], "tareas_web": [], "compartidas": []}]}),
            encoding="utf-8",
        )
        self.assertTrue(any("repetido" in e for e in self.errors()))


class DocumentosReales(unittest.TestCase):
    """Lo que de verdad hay en docs/historias: debe cumplir las mismas reglas."""

    def test_la_tabla_de_tipos_de_la_plantilla_coincide_con_el_script(self):
        plantilla = (ROOT / "docs" / "historias" / "_plantilla.md").read_text(encoding="utf-8")
        self.assertEqual({c: tuple(t) for c, t in h.parse_types_table(plantilla).items()}, h.TIPOS)
        self.assertEqual(h.parse_always_critical(plantilla), set(h.SIEMPRE_CRITICOS))

    def test_los_documentos_del_repositorio_pasan_la_comprobacion(self):
        self.assertEqual(h.check(ROOT), [])

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
