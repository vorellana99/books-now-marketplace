-- AlterTable
ALTER TABLE "sales"."orders" ADD COLUMN     "ship_department" VARCHAR(60),
ADD COLUMN     "ship_district" VARCHAR(60),
ADD COLUMN     "ship_line1" VARCHAR(200),
ADD COLUMN     "ship_phone" VARCHAR(20),
ADD COLUMN     "ship_province" VARCHAR(60),
ADD COLUMN     "ship_recipient" VARCHAR(100),
ADD COLUMN     "ship_reference" VARCHAR(200);

-- La dirección se guarda completa o no se guarda: o están los seis campos obligatorios, o ninguno (los pedidos
-- anteriores a esta migración quedan sin dirección). La referencia es opcional, pero no puede existir sola
ALTER TABLE "sales"."orders" ADD CONSTRAINT "orders_shipping_address_complete" CHECK (
  (ship_recipient IS NULL AND ship_phone IS NULL AND ship_line1 IS NULL AND ship_district IS NULL
    AND ship_province IS NULL AND ship_department IS NULL AND ship_reference IS NULL)
  OR
  (ship_recipient IS NOT NULL AND ship_phone IS NOT NULL AND ship_line1 IS NOT NULL AND ship_district IS NOT NULL
    AND ship_province IS NOT NULL AND ship_department IS NOT NULL)
);
