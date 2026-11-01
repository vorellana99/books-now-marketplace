import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { ScryptPasswordHasher } from '../src/contexts/identity/infrastructure/adapters/scrypt-password-hasher.js';
import { buildDatabaseUrl } from '../src/platform/config/database-url.js';
import { PrismaClient } from '../src/platform/prisma/generated/client.js';
import { BOOKS, CUSTOMERS, DEV_PASSWORD, STOCK, USERS } from './seed-data.js';

// Se puede ejecutar varias veces: no duplica filas, restaura los datos del catálogo, de los clientes y de los usuarios,
// y NO pisa el stock que ya exista (así no se pierden las reservas hechas mientras se probaba)
async function main(): Promise<void> {
  // Los usuarios de ejemplo comparten una contraseña publicada en el README: jamás deben existir en producción
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production') {
    throw new Error(
      'El seed crea usuarios con una contraseña de desarrollo y no puede correr en producción (NODE_ENV=production)',
    );
  }
  const hasher = new ScryptPasswordHasher({
    logN: Number(process.env.PASSWORD_HASH_LOG_N) || undefined,
  });
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
      for (const { id, ...data } of USERS) {
        const passwordHash = await hasher.hash(DEV_PASSWORD);
        await tx.user.upsert({
          where: { id },
          create: { id, ...data, passwordHash },
          update: { ...data, passwordHash },
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
      `Seed listo: ${USERS.length} usuarios (contraseña ${DEV_PASSWORD}), ${CUSTOMERS.length} clientes, ${BOOKS.length} libros y ${STOCK.length} registros de stock.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
