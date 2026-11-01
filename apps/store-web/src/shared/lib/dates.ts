const formatter = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// La API entrega fechas ISO en UTC; la tienda las muestra en la hora de Lima: "28 oct 2026, 10:00"
export function formatDateTime(iso: string): string {
  return formatter.format(new Date(iso)).replace(".", "");
}
