-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "identity";

-- CreateEnum
CREATE TYPE "identity"."UserRole" AS ENUM ('BUYER', 'ADMIN');

-- CreateTable
CREATE TABLE "identity"."users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "identity"."UserRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "identity"."users"("email");

-- El correo es la clave de inicio de sesión: va en minúsculas y recortado, y con un largo razonable. El código ya lo
-- normaliza; la base lo exige por si algún día otra ruta escribe sin pasar por él
ALTER TABLE "identity"."users" ADD CONSTRAINT "users_email_normalized" CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254);
