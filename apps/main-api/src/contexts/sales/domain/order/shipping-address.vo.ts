import { DomainError } from '../../../../shared-kernel/domain.errors.js';

export interface ShippingAddressData {
  recipient: string;
  phone: string;
  line1: string;
  district: string;
  province: string;
  department: string;
  reference?: string | null; // referencia para el repartidor
}

// Largo máximo de cada campo, ya recortado. Son también los tamaños de las columnas de la base
export const SHIPPING_LIMITS = {
  recipient: 100,
  phone: 20,
  line1: 200,
  district: 60,
  province: 60,
  department: 60,
  reference: 200,
} as const;

const REQUIRED = [
  'recipient',
  'phone',
  'line1',
  'district',
  'province',
  'department',
] as const;
const MIN_PHONE_DIGITS = 6;
const PHONE_CHARS = /^[+()\d\s-]+$/;
// Saltos de línea, tabuladores y demás caracteres de control: en una dirección solo sirven para colar texto en los
// logs, los correos y las etiquetas de envío
const hasControlChars = (text: string) => {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
};

const invalid = (field: string, why: string) =>
  new DomainError(
    'INVALID_SHIPPING_ADDRESS',
    `Dirección de envío inválida: el campo ${field} ${why}`,
  );

// Dirección de entrega del pedido. Se guarda como una copia en el pedido, igual que el título y el precio: si el
// cliente cambia su dirección después, el pedido de ayer conserva la que tuvo
export class ShippingAddress {
  private constructor(
    readonly recipient: string,
    readonly phone: string,
    readonly line1: string,
    readonly district: string,
    readonly province: string,
    readonly department: string,
    readonly reference: string | null,
  ) {}

  // Para una dirección nueva: recorta, exige los campos obligatorios y acota el largo
  static create(data: ShippingAddressData): ShippingAddress {
    const clean = (field: keyof typeof SHIPPING_LIMITS, raw: unknown) => {
      if (typeof raw !== 'string') throw invalid(field, 'debe ser un texto');
      const value = raw.trim();
      if (hasControlChars(value)) {
        throw invalid(
          field,
          'no puede tener saltos de línea ni caracteres de control',
        );
      }
      if (value.length > SHIPPING_LIMITS[field]) {
        throw invalid(
          field,
          `no puede superar ${SHIPPING_LIMITS[field]} caracteres`,
        );
      }
      return value;
    };

    const values = {} as Record<(typeof REQUIRED)[number], string>;
    for (const field of REQUIRED) {
      if (data[field] === undefined || data[field] === null) {
        throw invalid(field, 'es obligatorio');
      }
      const value = clean(field, data[field]);
      if (value === '') throw invalid(field, 'es obligatorio');
      values[field] = value;
    }

    if (
      !PHONE_CHARS.test(values.phone) ||
      values.phone.replace(/\D/g, '').length < MIN_PHONE_DIGITS
    ) {
      throw invalid(
        'phone',
        `solo admite dígitos, espacios, +, - y paréntesis, con al menos ${MIN_PHONE_DIGITS} dígitos`,
      );
    }

    const reference =
      data.reference === undefined || data.reference === null
        ? ''
        : clean('reference', data.reference);

    return new ShippingAddress(
      values.recipient,
      values.phone,
      values.line1,
      values.district,
      values.province,
      values.department,
      reference === '' ? null : reference,
    );
  }

  // Para leer lo que ya está en la base: no valida, porque una dirección guardada antes de una regla nueva
  // debe poder leerse igual
  static restore(data: ShippingAddressData): ShippingAddress {
    return new ShippingAddress(
      data.recipient,
      data.phone,
      data.line1,
      data.district,
      data.province,
      data.department,
      data.reference ?? null,
    );
  }

  equals(other: ShippingAddress): boolean {
    return (
      this.recipient === other.recipient &&
      this.phone === other.phone &&
      this.line1 === other.line1 &&
      this.district === other.district &&
      this.province === other.province &&
      this.department === other.department &&
      this.reference === other.reference
    );
  }

  toJSON() {
    return {
      recipient: this.recipient,
      phone: this.phone,
      line1: this.line1,
      district: this.district,
      province: this.province,
      department: this.department,
      reference: this.reference,
    };
  }
}
