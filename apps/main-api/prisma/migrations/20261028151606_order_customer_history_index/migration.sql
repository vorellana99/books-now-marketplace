-- CreateIndex
CREATE INDEX "orders_customer_id_created_at_id_idx" ON "sales"."orders"("customer_id", "created_at" DESC, "id" DESC);
