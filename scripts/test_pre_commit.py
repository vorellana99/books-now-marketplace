"""Pruebas de scripts/pre_commit.py (el hook pre-commit). Se ejecutan con: cd scripts && python3 -m unittest test_pre_commit"""
import io
import os
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

import pre_commit as p

ROOT = Path(__file__).resolve().parent.parent
CONGELADO = "# Título\n\n> **❄️ Historial congelado desde el 2026-10-31. Este archivo no se actualizará más.** Resto.\n\ncuerpo\n"


def git(repo, *args):
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True)


class Repositorio(unittest.TestCase):
    """Un repositorio git de mentira con un commit inicial."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name)
        git(self.repo, "init", "-q")
        git(self.repo, "config", "user.email", "t@t.t")
        git(self.repo, "config", "user.name", "t")
        (self.repo / "docs").mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def escribe(self, nombre, texto):
        (self.repo / nombre).write_text(texto, encoding="utf-8")

    def confirma(self, **archivos):
        for nombre, texto in archivos.items():
            self.escribe(nombre.replace("__", "/"), texto)
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-q", "-m", "base")

    def prepara(self, nombre, texto):
        self.escribe(nombre, texto)
        git(self.repo, "add", "-A")

    def violaciones(self, entorno=None):
        return p.violations(self.repo, entorno if entorno is not None else {})


class Congelados(Repositorio):
    def test_modificar_un_archivo_congelado_es_una_violacion(self):
        self.confirma(docs__avance_md=CONGELADO)
        self.prepara("docs/avance_md", CONGELADO + "otra línea\n")
        v = self.violaciones()
        self.assertEqual(len(v), 1)
        self.assertIn("docs/avance_md", v[0])

    def test_el_aviso_de_un_historico_puede_estar_mas_abajo(self):
        # product/04 lo tiene en la línea 30
        texto = "# Historias\n" + "linea\n" * 28 + "**❄️ Histórico congelado (desde 2026-10-30).** Este archivo guarda...\n"
        self.confirma(docs__historias_md=texto)
        self.prepara("docs/historias_md", texto + "más\n")
        self.assertEqual(len(self.violaciones()), 1)

    def test_un_aviso_demasiado_abajo_no_cuenta(self):
        texto = "# Doc\n" + "linea\n" * (p.VENTANA + 5) + "> **❄️ Historial congelado desde el 2026-10-31.**\n"
        self.confirma(docs__doc_md=texto)
        self.prepara("docs/doc_md", texto + "más\n")
        self.assertEqual(self.violaciones(), [])

    def test_poner_el_aviso_en_el_mismo_commit_esta_permitido(self):
        self.confirma(docs__avance_md="# Título\n\ncuerpo\n")
        self.prepara("docs/avance_md", CONGELADO)  # la versión anterior no estaba congelada
        self.assertEqual(self.violaciones(), [])

    def test_borrar_un_archivo_congelado_es_una_violacion(self):
        self.confirma(docs__avance_md=CONGELADO)
        git(self.repo, "rm", "-q", "docs/avance_md")
        self.assertEqual(len(self.violaciones()), 1)

    def test_renombrar_un_archivo_congelado_es_una_violacion(self):
        self.confirma(docs__avance_md=CONGELADO)
        git(self.repo, "mv", "docs/avance_md", "docs/otro_md")
        v = self.violaciones()
        self.assertEqual(len(v), 1)
        self.assertIn("docs/avance_md", v[0])

    def test_varios_congelados_dan_una_violacion_cada_uno(self):
        self.confirma(docs__a_md=CONGELADO, docs__b_md=CONGELADO)
        self.prepara("docs/a_md", CONGELADO + "x\n")
        self.prepara("docs/b_md", CONGELADO + "y\n")
        self.assertEqual(len(self.violaciones()), 2)


class LoQueNoEsta(Repositorio):
    def test_un_archivo_normal_y_uno_nuevo_pasan(self):
        self.confirma(docs__doc_md="# Doc\n\ncuerpo\n")
        self.prepara("docs/doc_md", "# Doc\n\notro cuerpo\n")
        self.prepara("docs/nuevo_md", "# Nuevo\n")
        self.assertEqual(self.violaciones(), [])

    def test_la_palabra_congelado_sin_la_marca_no_congela(self):
        texto = "# Doc\n\nUn valor congelado en el pedido (snapshot).\n"
        self.confirma(docs__doc_md=texto)
        self.prepara("docs/doc_md", texto + "más\n")
        self.assertEqual(self.violaciones(), [])

    def test_mencionar_el_aviso_en_una_celda_de_tabla_no_congela(self):
        # la guía de herramientas describe el hook y cita el aviso en una celda: no es un aviso
        texto = "# Herramientas\n\n| Hook | Qué hace |\n|---|---|\n| pre-commit | Rechaza un archivo que empieza con «❄️ Historial congelado desde …» |\n"
        self.confirma(docs__doc_md=texto)
        self.prepara("docs/doc_md", texto + "más\n")
        self.assertEqual(self.violaciones(), [])

    def test_mencionar_el_aviso_dentro_de_una_frase_no_congela(self):
        texto = "# Doc\n\nLos archivos con «❄️ Historial congelado desde …» no se tocan, y **❄️ Histórico congelado** tampoco, dice el texto.\n"
        self.confirma(docs__doc_md=texto)
        self.prepara("docs/doc_md", texto + "más\n")
        self.assertEqual(self.violaciones(), [])

    def test_el_aviso_abre_una_linea_como_cita_o_en_negrita_o_solo(self):
        for linea in ("> **❄️ Historial congelado desde el 2026-10-31.**", "**❄️ Histórico congelado (desde 2026-10-30).**", "❄️ Historial congelado", "  > ❄\ufe0f Historial congelado"):
            self.assertTrue(p.is_frozen_text(f"# T\n\n{linea} resto\n"), linea)

    def test_el_icono_vale_con_o_sin_selector_de_emoji(self):
        con, sin = "\u2744\ufe0f", "\u2744"  # ❄️ y ❄
        self.assertNotEqual(con, sin)
        for icono in (con, sin):
            self.assertTrue(p.is_frozen_text(f"# T\n\n> **{icono} Historial congelado desde el 2026-10-31.**\n"), repr(icono))

    def test_sin_commits_previos_no_hay_nada_congelado(self):
        self.prepara("docs/avance_md", CONGELADO)
        self.assertEqual(self.violaciones(), [])

    def test_sin_cambios_preparados_pasa(self):
        self.confirma(docs__avance_md=CONGELADO)
        self.assertEqual(self.violaciones(), [])

    def test_un_congelado_sin_cambios_preparados_no_molesta_al_resto(self):
        self.confirma(docs__avance_md=CONGELADO, docs__doc_md="# Doc\n")
        self.prepara("docs/doc_md", "# Doc\n\nmás\n")
        self.assertEqual(self.violaciones(), [])


class Excepcion(Repositorio):
    def test_la_variable_de_entorno_permite_el_cambio(self):
        self.confirma(docs__avance_md=CONGELADO)
        self.prepara("docs/avance_md", CONGELADO + "arreglo de un enlace roto\n")
        self.assertEqual(self.violaciones({p.EXCEPCION: "1"}), [])

    def test_otro_valor_no_la_activa(self):
        self.confirma(docs__avance_md=CONGELADO)
        self.prepara("docs/avance_md", CONGELADO + "x\n")
        self.assertEqual(len(self.violaciones({p.EXCEPCION: "0"})), 1)

    def test_el_mensaje_explica_que_es_y_como_saltarlo(self):
        self.confirma(docs__avance_md=CONGELADO)
        self.prepara("docs/avance_md", CONGELADO + "x\n")
        salida = io.StringIO()
        with redirect_stdout(salida):
            codigo = p.main(self.repo, {})
        self.assertEqual(codigo, 1)
        self.assertIn("docs/avance_md", salida.getvalue())
        self.assertIn("congelado", salida.getvalue())
        self.assertIn(f"{p.EXCEPCION}=1", salida.getvalue())

    def test_main_devuelve_cero_si_no_hay_violaciones(self):
        self.confirma(docs__doc_md="# Doc\n")
        self.prepara("docs/doc_md", "# Doc\n\nx\n")
        salida = io.StringIO()
        with redirect_stdout(salida):
            self.assertEqual(p.main(self.repo, {}), 0)
        self.assertEqual(salida.getvalue(), "")


class ElRepositorio(unittest.TestCase):
    CONGELADOS = [
        "docs/avance.md", "docs/backend/00-avance.md", "docs/frontend/00-avance.md",
        "docs/backend/07-fases-y-roadmap.md", "docs/frontend/07-fases-y-roadmap.md",
        "docs/libroya-backend-guia.md", "docs/product/04-historias-de-usuario.md",
    ]

    def test_los_siete_archivos_congelados_del_repositorio_se_reconocen(self):
        for ruta in self.CONGELADOS:
            self.assertTrue(p.is_frozen_text((ROOT / ruta).read_text(encoding="utf-8")), ruta)

    def test_los_documentos_vivos_no_se_reconocen_como_congelados(self):
        for ruta in ("CLAUDE.md", "docs/guia-de-desarrollo.md", "docs/herramientas-de-trabajo.md", "docs/historias/README.md", "docs/product/03-reglas-de-negocio.md", "docs/api-contrato.md"):
            self.assertFalse(p.is_frozen_text((ROOT / ruta).read_text(encoding="utf-8")), ruta)

    def test_los_unicos_archivos_congelados_del_repositorio_son_los_siete(self):
        versionados = subprocess.run(["git", "-C", str(ROOT), "ls-files", "*.md"], capture_output=True, text=True, check=True).stdout.split()
        detectados = {f for f in versionados if "node_modules" not in f and p.is_frozen_text((ROOT / f).read_text(encoding="utf-8"))}
        self.assertEqual(detectados, set(self.CONGELADOS))

    def test_el_hook_existe_es_ejecutable_y_llama_al_script(self):
        hook = ROOT / ".githooks" / "pre-commit"
        self.assertTrue(hook.exists())
        self.assertTrue(os.access(hook, os.X_OK))
        self.assertIn("scripts/pre_commit.py", hook.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
