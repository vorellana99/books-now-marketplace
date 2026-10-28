import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { buildDatabaseUrl } from '../src/platform/config/database-url.js';
import { PrismaClient } from '../src/platform/prisma/generated/client.js';
import { BOOKS, CUSTOMERS, STOCK } from './seed-data.js';

// Se puede ejecutar varias veces: no duplica filas, restaura los datos del catálogo y de los clientes,
// y NO pisa el stock que ya exista (así no se pierden las reservas hechas mientras se probaba)
async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: buildDatabaseUrl(process.env) }),
  });
  try {
    await prisma.$transaction(async (tx) => {
      for (const { id, ...data } of CUSTOMERS) {
        await tx.customer.upsert({
          where: { id },
          create: { id, ...data },
          update: data,
        });
      }
      for (const { isbn, ...data } of BOOKS) {
        await tx.book.upsert({
          where: { isbn },
          create: { isbn, ...data },
          update: data,
        });
      }
      for (const item of STOCK) {
        await tx.stockItem.upsert({
          where: { isbn: item.isbn },
          create: item,
          update: {},
        });
      }
    });
    console.log(
      `Seed listo: ${CUSTOMERS.length} clientes, ${BOOKS.length} libros y ${STOCK.length} registros de stock.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
