"""Pruebas de scripts/mutate.py, sin ejecutar Vitest: python3 -m unittest scripts/test_mutate.py"""
import os
import tempfile
import unittest
from unittest import mock

import mutate


class Mutate(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.addCleanup(lambda: __import__('shutil').rmtree(self.dir))
        mutate.APP = self.dir
        mutate._results.clear()
        with open(os.path.join(self.dir, 'a.ts'), 'w') as f:
            f.write('if (!user || !valid) throw 1;\n')

    def read(self):
        with open(os.path.join(self.dir, 'a.ts')) as f:
            return f.read()

    def run_mutation(self, summary, pairs=None):
        with mock.patch.object(mutate, 'vitest', return_value=summary):
            return mutate.mutate('m', 'a.ts', pairs or [('!valid', 'false')], ['test/unit/x.spec.ts'])

    def test_veredictos(self):
        self.assertEqual(self.run_mutation('1 failed | 5 passed (6)'), 'DETECTADA')
        self.assertEqual(self.run_mutation('6 passed (6)'), 'SOBREVIVIÓ')
        self.assertEqual(self.run_mutation('sin resumen'), 'NO COMPILA')
        self.assertEqual(self.run_mutation('6 skipped (6)'), 'NO COMPILA')

    def test_restaura_el_archivo_siempre(self):
        before = self.read()
        self.run_mutation('1 failed | 5 passed (6)')
        self.assertEqual(self.read(), before)
        with mock.patch.object(mutate, 'vitest', side_effect=RuntimeError('boom')):
            with self.assertRaises(RuntimeError):
                mutate.mutate('m', 'a.ts', [('!valid', 'false')], ['test/unit/x.spec.ts'])
        self.assertEqual(self.read(), before)

    def test_el_archivo_se_cambia_mientras_corren_las_pruebas(self):
        seen = {}
        with mock.patch.object(mutate, 'vitest', side_effect=lambda *a, **k: seen.setdefault('c', self.read()) and '1 failed (1)'):
            mutate.mutate('m', 'a.ts', [('!valid', 'false')], ['test/unit/x.spec.ts'])
        self.assertIn('false', seen['c'])
        self.assertNotIn('!valid', seen['c'])

    def test_ancla_inexistente_o_repetida_no_se_aplica(self):
        self.assertEqual(self.run_mutation('x', [('no está', 'y')]), 'NO APLICADA')
        with open(os.path.join(self.dir, 'a.ts'), 'a') as f:
            f.write('if (!user || !valid) throw 2;\n')
        self.assertEqual(self.run_mutation('x', [('!valid', 'false')]), 'NO APLICADA')

    def test_varias_sustituciones_en_una_mutacion(self):
        seen = {}
        with mock.patch.object(mutate, 'vitest', side_effect=lambda *a, **k: seen.setdefault('c', self.read()) and '1 failed (1)'):
            mutate.mutate('m', 'a.ts', [('!user', 'user'), ('!valid', 'valid')], ['test/unit/x.spec.ts'])
        self.assertIn('if (user || valid)', seen['c'])

    def test_configuracion_segun_las_pruebas(self):
        self.assertIsNone(mutate.config_for(['test/unit/a.spec.ts', 'test/unit/b.spec.ts']))
        self.assertEqual(mutate.config_for(['test/e2e/a.spec.ts']), mutate.E2E)
        self.assertEqual(mutate.config_for(['test/integration/a.spec.ts']), mutate.E2E)
        with self.assertRaises(ValueError):
            mutate.config_for(['test/unit/a.spec.ts', 'test/e2e/b.spec.ts'])

    def test_el_resumen_cuenta_cada_veredicto(self):
        self.run_mutation('1 failed (1)')
        self.run_mutation('1 passed (1)')
        with mock.patch('builtins.print') as p:
            mutate.report()
        text = '\n'.join(str(c.args[0]) for c in p.call_args_list)
        self.assertIn('2 mutaciones', text)
        self.assertIn('1 DETECTADA', text)
        self.assertIn('1 SOBREVIVIÓ', text)


if __name__ == '__main__':
    unittest.main()
