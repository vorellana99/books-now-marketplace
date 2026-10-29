-- La búsqueda de libros (GET /books?q=) hace ILIKE '%texto%' sobre el título y el autor. Sin un índice de trigramas
-- recorre toda la tabla; estos dos índices GIN lo evitan.
-- Necesita la extensión pg_trgm: crearla exige que el rol de las migraciones pueda (en PostgreSQL 13 o más basta con que
-- sea de confianza; en un servicio administrado, habilitarla desde su consola si hace falta).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "books_title_trgm_idx" ON "catalog"."books" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "books_author_trgm_idx" ON "catalog"."books" USING GIN ("author" gin_trgm_ops);
