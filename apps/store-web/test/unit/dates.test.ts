import { describe, expect, it } from "vite-plus/test";
import { formatDateTime } from "@/shared/lib/dates.ts";

describe("formatDateTime", () => {
  it("muestra la fecha en la hora de Lima (UTC-5)", () => {
    expect(formatDateTime("2026-10-28T15:00:00.000Z")).toBe("28 oct 2026, 10:00");
  });

  it("cambia de día según la hora de Lima, no la de UTC", () => {
    // 04:07 UTC del 5 de marzo es todavía el 4 de marzo en Lima
    expect(formatDateTime("2026-03-05T04:07:00.000Z")).toBe("4 mar 2026, 23:07");
  });

  it("no muestra 24:00 a medianoche", () => {
    expect(formatDateTime("2026-10-28T05:00:00.000Z")).toBe("28 oct 2026, 00:00");
  });
});
