-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "catalog";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "inventory";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "messaging";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "sales";

-- CreateEnum
CREATE TYPE "sales"."OrderStatus" AS ENUM ('PLACED');

-- CreateEnum
CREATE TYPE "sales"."Currency" AS ENUM ('PEN', 'USD');

-- CreateEnum
CREATE TYPE "sales"."CheckoutStatus" AS ENUM ('PENDING', 'COMPLETED', 'ABORTED');

-- CreateEnum
CREATE TYPE "catalog"."Currency" AS ENUM ('PEN', 'USD');

-- CreateEnum
CREATE TYPE "inventory"."ReservationStatus" AS ENUM ('HELD', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "messaging"."DeliveryStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "sales"."customers" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "premium" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."orders" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "sales"."OrderStatus" NOT NULL,
    "charged_amount" DECIMAL(19,2) NOT NULL,
    "currency" "sales"."Currency" NOT NULL DEFAULT 'PEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."checkouts" (
    "order_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "request_hash" TEXT NOT NULL,
    "request_id" TEXT,
    "charged_amount" DECIMAL(19,2),
    "currency" "sales"."Currency",
    "status" "sales"."CheckoutStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMP(3),

    CONSTRAINT "checkouts_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "sales"."order_lines" (
    "order_id" UUID NOT NULL,
    "isbn" VARCHAR(13) NOT NULL,
    "title" TEXT NOT NULL,
    "unit_price" DECIMAL(19,6) NOT NULL,
    "currency" "sales"."Currency" NOT NULL DEFAULT 'PEN',
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("order_id","isbn")
);

-- CreateTable
CREATE TABLE "catalog"."books" (
    "isbn" VARCHAR(13) NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "price" DECIMAL(19,2) NOT NULL,
    "currency" "catalog"."Currency" NOT NULL DEFAULT 'PEN',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "books_pkey" PRIMARY KEY ("isbn")
);

-- CreateTable
CREATE TABLE "inventory"."stock_items" (
    "isbn" VARCHAR(13) NOT NULL,
    "available" INTEGER NOT NULL,
    "reserved" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("isbn")
);

-- CreateTable
CREATE TABLE "inventory"."reservations" (
    "order_id" UUID NOT NULL,
    "isbn" VARCHAR(13) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "inventory"."ReservationStatus" NOT NULL DEFAULT 'HELD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("order_id","isbn")
);

-- CreateTable
CREATE TABLE "messaging"."outbox" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "event_name" TEXT NOT NULL,
    "event_version" INTEGER NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_on" TIMESTAMP(3) NOT NULL,
    "correlation_id" TEXT,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."deliveries" (
    "event_id" UUID NOT NULL,
    "consumer" TEXT NOT NULL,
    "status" "messaging"."DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("event_id","consumer")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "sales"."customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "checkouts_idempotency_key_key" ON "sales"."checkouts"("idempotency_key");

-- CreateIndex
CREATE INDEX "checkouts_status_started_at_idx" ON "sales"."checkouts"("status", "started_at");

-- CreateIndex
CREATE INDEX "reservations_status_created_at_idx" ON "inventory"."reservations"("status", "created_at");

-- CreateIndex
CREATE INDEX "outbox_aggregate_id_idx" ON "messaging"."outbox"("aggregate_id");

-- CreateIndex
CREATE INDEX "deliveries_status_next_attempt_at_idx" ON "messaging"."deliveries"("status", "next_attempt_at");

-- AddForeignKey
ALTER TABLE "sales"."orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "sales"."customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."order_lines" ADD CONSTRAINT "order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."deliveries" ADD CONSTRAINT "deliveries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "messaging"."outbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints: Prisma no permite declararlos en el schema
ALTER TABLE "sales"."orders" ADD CONSTRAINT "orders_charged_amount_check" CHECK ("charged_amount" >= 0);
ALTER TABLE "sales"."checkouts" ADD CONSTRAINT "checkouts_charged_amount_check" CHECK ("charged_amount" IS NULL OR "charged_amount" >= 0);
ALTER TABLE "sales"."order_lines" ADD CONSTRAINT "order_lines_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "sales"."order_lines" ADD CONSTRAINT "order_lines_unit_price_check" CHECK ("unit_price" >= 0);
ALTER TABLE "catalog"."books" ADD CONSTRAINT "books_price_check" CHECK ("price" > 0);
ALTER TABLE "inventory"."stock_items" ADD CONSTRAINT "stock_items_available_check" CHECK ("available" >= 0);
ALTER TABLE "inventory"."stock_items" ADD CONSTRAINT "stock_items_reserved_check" CHECK ("reserved" >= 0);
ALTER TABLE "inventory"."reservations" ADD CONSTRAINT "reservations_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "messaging"."deliveries" ADD CONSTRAINT "deliveries_attempts_check" CHECK ("attempts" >= 0);
