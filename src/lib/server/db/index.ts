import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { DATABASE_URL } from '$app/env/private';
import * as schema from './schema';

mkdirSync(dirname(DATABASE_URL), { recursive: true });

const client = new Database(DATABASE_URL);
client.pragma('journal_mode = WAL');
client.pragma('foreign_keys = ON');

export const db = drizzle(client, { schema });

// Migrations live in ./drizzle (generated with `npm run db:generate`) and run on startup.
migrate(db, { migrationsFolder: 'drizzle' });

export { schema };
