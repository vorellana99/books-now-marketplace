import { styleText } from 'node:util';

export interface StartupInfo {
  baseUrl: string;
  environment: string;
  database: string;
  paymentProvider: string;
}

// `styleText` ya omite los colores si la salida no es un terminal o si hay NO_COLOR
const link = (url: string) => styleText(['cyan', 'underline'], url);
const label = (text: string) => styleText('dim', text.padEnd(10));

/** Resumen legible del arranque, pensado para desarrollo. */
export function formatStartupBanner(info: StartupInfo): string {
  const rows: [string, string][] = [
    ['API', link(info.baseUrl)],
    ['Swagger', link(`${info.baseUrl}/docs`)],
    ['Salud', link(`${info.baseUrl}/health/ready`)],
    ['Entorno', styleText('yellow', info.environment)],
    ['Base', styleText('green', info.database)],
    ['Pagos', info.paymentProvider],
  ];
  const title = styleText(['bold', 'green'], '✔ LibroYa API lista');
  return [
    '',
    `  ${title}`,
    '',
    ...rows.map(([name, value]) => `  ${label(name)}${value}`),
    '',
  ].join('\n');
}
