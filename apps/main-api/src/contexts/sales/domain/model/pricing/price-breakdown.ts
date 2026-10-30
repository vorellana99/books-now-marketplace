import { Money } from '../../shared/money.vo.js';

// Las partes del precio de un pedido, con todos sus decimales: subtotal − descuento + envío = total, exacto.
// Lo que se cobra y lo que se cotiza salen de aquí, así que no pueden desviarse
export class PriceBreakdown {
  constructor(
    readonly subtotal: Money,
    readonly discount: Money,
    readonly shipping: Money,
    readonly total: Money,
  ) {}

  // Lo que se muestra. El total es lo único que se redondea (2 decimales, la mitad hacia arriba: RN-06) y es el mismo
  // que se cobra. El descuento no se redondea por su lado: se deriva (subtotal − (total − envío)) para que las partes
  // mostradas sumen siempre el total mostrado. Un 10 % de 0.15 es 0.015: redondeado solo daría 0.02 y 0.15 − 0.02 + 0 =
  // 0.13, pero el total es 0.14
  rounded(): PriceBreakdown {
    const subtotal = this.subtotal.toFinal();
    const shipping = this.shipping; // ya tiene 2 decimales: sale de las reglas de la moneda
    const total = this.total.toFinal();
    const discount = Money.of(
      subtotal.amount.minus(total.amount.minus(shipping.amount)),
      subtotal.currency,
    );
    return new PriceBreakdown(subtotal, discount, shipping, total);
  }
}
