import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { buildDatabaseUrl } from './src/platform/config/database-url.js';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: buildDatabaseUrl(process.env) },
});
