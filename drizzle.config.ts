import { defineConfig } from 'drizzle-kit';
import * as path from 'path';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.NODE_ENV === 'production' 
      ? 'file:' + path.join(process.cwd(), 'data', 'production.db')
      : 'file:' + path.join(process.cwd(), 'data', 'development.db')
  },
  verbose: true,
  strict: true,
  migrations: {
    table: '__drizzle_migrations',
  },
});