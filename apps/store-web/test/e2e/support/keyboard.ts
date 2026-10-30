import { expect, type Page } from "@playwright/test";

type Stop = { name: string; tag: string; visible: boolean };

// El nombre accesible aproximado del elemento con el foco y si el foco se ve (contorno o sombra), tal como lo calcula el navegador
const focused = (page: Page): Promise<Stop> =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { name: "", tag: "body", visible: true };
    const label = (el as HTMLInputElement).labels?.[0]?.textContent;
    const name = (
      el.getAttribute("aria-label") ||
      label ||
      el.textContent ||
      el.getAttribute("placeholder") ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
    // El indicador puede estar en el propio elemento o en un contenedor con `focus-within` (el buscador dibuja el contorno
    // en su caja, no en el `input`)
    const indicated = (node: Element) => {
      const style = getComputedStyle(node);
      return (
        (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
        style.boxShadow !== "none"
      );
    };
    let visible = indicated(el);
    for (
      let node = el.parentElement, depth = 0;
      !visible && node && depth < 3;
      node = node.parentElement, depth++
    ) {
      visible = node.matches(":focus-within") && indicated(node);
    }
    return { name, tag: el.tagName.toLowerCase(), visible };
  });

export type Trail = { stops: Stop[] };

// Avanza con `Tab` hasta el elemento cuyo nombre cumple `name`. Registra cada parada: ninguna debe quedarse sin foco visible
export async function tabTo(
  page: Page,
  name: RegExp | string,
  trail: Trail,
  max = 80,
): Promise<Stop> {
  const matches = (stop: Stop) =>
    typeof name === "string" ? stop.name === name : name.test(stop.name);
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const stop = await focused(page);
    trail.stops.push(stop);
    if (matches(stop)) return stop;
  }
  throw new Error(
    `Con Tab no se llegó a «${String(name)}» en ${max} paradas: ${trail.stops
      .slice(-max)
      .map((s) => s.name)
      .join(" → ")}`,
  );
}

export const expectFocusAlwaysVisible = (trail: Trail) =>
  expect(
    trail.stops.filter((stop) => !stop.visible).map((stop) => `${stop.tag}: ${stop.name}`),
  ).toEqual([]);
