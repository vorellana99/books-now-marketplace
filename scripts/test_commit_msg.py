"""Pruebas de scripts/commit_msg.py (el hook commit-msg). Se ejecutan con: cd scripts && python3 -m unittest test_commit_msg"""
import io
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

import commit_msg as c
from test_historias import TAREAS, hu

ROOT = Path(__file__).resolve().parent.parent


class Entorno(unittest.TestCase):
    """Un repositorio de mentira con HU-12 (tareas de TAREAS: 12.1 DOC, 12.2 API, 12.3 API, 12.4 WEB) y el habilitador EN-01."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        fase = self.root / "docs" / "historias" / "fase-2"
        (fase / "HU").mkdir(parents=True)
        (fase / "EN").mkdir()
        (fase / "HU" / "HU-12.md").write_text(hu(TAREAS), encoding="utf-8")
        (fase / "EN" / "EN-01.md").write_text(hu([("EN-01.1", "API", "configuracion", "normal", "pendiente")], sid="EN-01"), encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def errores(self, asunto):
        return c.errors_for(asunto, self.root)

    def hay(self, asunto, *palabras):
        return any(all(p in e for p in palabras) for e in self.errores(asunto))


class Asunto(Entorno):
    def test_un_commit_de_otro_tipo_pasa_sin_validar(self):
        for asunto in ("Process: group stories into phase folders", "Fix typo in README", "Merge branch 'main'", "7.8: Add guard", "Revert \"HU-12.3 [API]: x\"", "fixup! HU-12.3 [API]: x", "HUMAN: nada", ""):
            self.assertEqual(self.errores(asunto), [], asunto)

    def test_el_formato_correcto_pasa(self):
        self.assertEqual(self.errores("HU-12.3 [API]: Add availability to GET /books"), [])
        self.assertEqual(self.errores("HU-12.4 [WEB]: Show the stock note"), [])
        self.assertEqual(self.errores("HU-12.1 [DOC]: Rewrite RN-13"), [])

    def test_un_habilitador_tambien(self):
        self.assertEqual(self.errores("EN-01.1 [API]: Add a variable"), [])

    def test_sin_la_capa(self):
        self.assertTrue(self.hay("HU-12.3: Add availability", "HU-12.3 [API]: "))

    def test_con_la_capa_en_minusculas_o_inexistente(self):
        self.assertTrue(self.hay("HU-12.3 [api]: Add x", "[CAPA]"))
        self.assertTrue(self.hay("HU-12.3 [BACK]: Add x", "[CAPA]"))

    def test_sin_los_dos_puntos(self):
        self.assertTrue(self.hay("HU-12.3 [API] Add x", "HU-12.3 [API]: "))

    def test_sin_descripcion(self):
        self.assertTrue(self.hay("HU-12.3 [API]: ", "descripción"))
        self.assertTrue(self.hay("HU-12.3 [API]:", "HU-12.3 [API]: "))

    def test_sin_la_tarea_solo_la_historia(self):
        self.assertTrue(self.hay("HU-12 [API]: Add x", "HU-12.3 [API]: "))

    def test_una_tarea_que_no_existe(self):
        self.assertTrue(self.hay("HU-12.9 [API]: Add x", "HU-12.9", "no existe"))
        self.assertTrue(self.hay("HU-99.1 [API]: Add x", "HU-99.1", "no existe"))

    def test_la_capa_debe_ser_la_de_la_tarea(self):
        self.assertTrue(self.hay("HU-12.3 [WEB]: Add x", "HU-12.3", "[API]", "[WEB]"))
        self.assertTrue(self.hay("HU-12.4 [API]: Add x", "HU-12.4", "[WEB]"))

    def test_una_sola_tarea_por_commit(self):
        self.assertTrue(self.hay("HU-12.3 [API]: Add x and HU-12.4 stuff", "una sola tarea"))
        self.assertTrue(self.hay("HU-12.3 [API]: Add x with EN-01.1", "una sola tarea"))

    def test_nombrar_la_historia_en_la_descripcion_no_es_otra_tarea(self):
        self.assertEqual(self.errores("HU-12.3 [API]: Follow the contract of HU-12"), [])

    # --- el correlativo 0: el commit que registra la historia o el habilitador ---
    def test_el_commit_de_registro_usa_el_correlativo_cero_y_la_capa_doc(self):
        self.assertEqual(self.errores("HU-12.0 [DOC]: Register the story"), [])
        self.assertEqual(self.errores("EN-01.0 [DOC]: Register the enabler"), [])

    def test_el_registro_es_de_capa_doc(self):
        self.assertTrue(self.hay("HU-12.0 [API]: Register the story", "HU-12.0", "[DOC]"))

    def test_el_registro_necesita_que_la_historia_exista(self):
        self.assertTrue(self.hay("HU-99.0 [DOC]: Register the story", "HU-99", "no existe"))

    def test_el_registro_tambien_es_de_una_sola_tarea(self):
        self.assertTrue(self.hay("HU-12.0 [DOC]: Register it and HU-12.1 too", "una sola tarea"))

    def test_un_numero_que_termina_en_cero_no_es_el_registro(self):
        # HU-12.10 es la tarea 10 (no existe), no el registro de HU-12
        self.assertTrue(self.hay("HU-12.10 [DOC]: x", "HU-12.10", "no existe"))
        self.assertFalse(self.hay("HU-12.10 [DOC]: x", "registra"))

    def test_el_asunto_no_pasa_de_72_caracteres(self):
        largo = "HU-12.3 [API]: " + "x" * (c.MAX - len("HU-12.3 [API]: "))
        self.assertEqual(len(largo), 72)
        self.assertEqual(self.errores(largo), [])
        self.assertTrue(self.hay(largo + "x", "72"))

    def test_los_errores_dan_el_ejemplo_correcto(self):
        self.assertTrue(self.hay("HU-12.3: x", "Add availability to GET /books"))


class Mensaje(Entorno):
    def archivo(self, texto):
        path = self.root / "COMMIT_EDITMSG"
        path.write_text(texto, encoding="utf-8")
        return str(path)

    def correr(self, texto):
        salida = io.StringIO()
        with redirect_stdout(salida):
            codigo = c.main([self.archivo(texto)], self.root)
        return codigo, salida.getvalue()

    def test_toma_la_primera_linea_que_no_es_comentario(self):
        self.assertEqual(c.subject("# Please enter the commit message\n\nHU-12.3 [API]: Add x\n\nbody\n"), "HU-12.3 [API]: Add x")
        self.assertEqual(c.subject("\n\n"), "")

    def test_un_mensaje_valido_devuelve_cero(self):
        self.assertEqual(self.correr("HU-12.3 [API]: Add x\n\nbody\n\nCo-Authored-By: A <a@b.c>\n"), (0, ""))

    def test_un_mensaje_invalido_devuelve_uno_y_explica(self):
        codigo, salida = self.correr("HU-12.3: Add x\n")
        self.assertEqual(codigo, 1)
        self.assertIn("commit rechazado", salida)
        self.assertIn("HU-12.3 [API]: ", salida)

    def test_otro_tipo_de_commit_devuelve_cero(self):
        self.assertEqual(self.correr("Process: something\n")[0], 0)

    def test_el_comentario_de_git_no_cuenta(self):
        self.assertEqual(self.correr("# HU-12.3: mal\n\nProcess: x\n")[0], 0)


class Repositorio(unittest.TestCase):
    def test_el_formato_se_valida_contra_las_historias_reales(self):
        self.assertEqual(c.errors_for("HU-12.1 [DOC]: Rewrite RN-13", ROOT), [])
        self.assertTrue(c.errors_for("HU-12.1 [API]: Rewrite RN-13", ROOT))

    def test_el_hook_existe_es_ejecutable_y_llama_al_script(self):
        hook = ROOT / ".githooks" / "commit-msg"
        self.assertTrue(hook.exists())
        self.assertTrue(os.access(hook, os.X_OK))
        self.assertIn("scripts/commit_msg.py", hook.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
