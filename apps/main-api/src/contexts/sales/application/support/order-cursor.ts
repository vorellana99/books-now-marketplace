import type { OrderPosition } from '../../domain/model/order/order-view.js';

const MAX_LENGTH = 200;
const URL_SAFE = /^[A-Za-z0-9_-]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// El cursor del historial: la posición del último pedido de la página, como texto opaco para el cliente. Lleva la fecha
// y el id (no solo el id): con los dos se pagina por "lo que viene después de este punto", y sigue valiendo aunque ese
// pedido ya no exista o lleguen pedidos nuevos entre una página y otra
export const OrderCursor = {
  encode({ createdAt, id }: OrderPosition): string {
    return Buffer.from(`${createdAt.toISOString()}|${id}`).toString(
      'base64url',
    );
  },

  // Devuelve null con cualquier entrada que no sea un cursor válido; nunca lanza
  decode(value: string): OrderPosition | null {
    if (
      value.length === 0 ||
      value.length > MAX_LENGTH ||
      !URL_SAFE.test(value)
    ) {
      return null;
    }
    const parts = Buffer.from(value, 'base64url').toString('utf8').split('|');
    if (parts.length !== 2) return null;
    const [iso, id] = parts;
    if (!ISO_DATE.test(iso) || !UUID.test(id)) return null;
    const createdAt = new Date(iso);
    // Una fecha imposible (mes 13) se normaliza al construirla: si no vuelve igual, no era una fecha
    if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== iso) {
      return null;
    }
    return { createdAt, id };
  },
};
