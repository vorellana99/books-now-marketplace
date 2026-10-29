import axe from "axe-core";
import { expect } from "vite-plus/test";

// Comprueba que una pantalla no tenga violaciones de accesibilidad (axe, nivel AA).
// jsdom no calcula estilos ni diseño, así que `color-contrast` no se puede medir aquí: los contrastes de la paleta
// están calculados en docs/product/diseno/01-tokens.md y se auditan en el navegador en el corte F6
export async function expectNoA11yViolations(container: Element): Promise<void> {
  const results = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes[0]?.html ?? ""})`)).toEqual(
    [],
  );
}
