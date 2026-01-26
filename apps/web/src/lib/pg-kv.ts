import { Pool, type PoolConfig } from 'pg';

let pool: Pool | null = null;
let ensured: Promise<void> | null = null;

function databaseUrl(): string {
  return String(process.env.DATABASE_URL || '').trim();
}

function shouldUseSsl(url: string): boolean {
  const mode = String(process.env.PGSSLMODE || '').trim().toLowerCase();
  if (mode === 'disable') return false;
  if (mode === 'require') return true;
  if (url.includes('localhost') || url.includes('127.0.0.1')) return false;
  return true;
}

function getPool(): Pool {
  if (pool) return pool;
  const url = databaseUrl();
  if (!url) throw new Error('DATABASE_URL is not set');

  const cfg: PoolConfig = {
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  };

  if (shouldUseSsl(url)) {
    cfg.ssl = { rejectUnauthorized: false };
  }

  pool = new Pool(cfg);
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const p = getPool();
    await p.query(
      `CREATE TABLE IF NOT EXISTS phoenix_zero_kv (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`
    );
  })();
  return ensured;
}

export function postgresEnabled(): boolean {
  return Boolean(databaseUrl());
}

export async function readKvJson<T>(key: string): Promise<T | null> {
  if (!postgresEnabled()) return null;
  await ensureSchema();
  const p = getPool();
  const res = await p.query('SELECT value FROM phoenix_zero_kv WHERE key = $1', [key]);
  if (!res.rows.length) return null;
  return (res.rows[0]?.value ?? null) as T | null;
}

export async function writeKvJson<T>(key: string, value: T): Promise<void> {
  if (!postgresEnabled()) throw new Error('writeKvJson called but DATABASE_URL is not set');
  await ensureSchema();
  const p = getPool();
  await p.query(
    'INSERT INTO phoenix_zero_kv(key, value, updated_at) VALUES ($1, $2::jsonb, now())\n' +
      'ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()',
    [key, JSON.stringify(value)]
  );
}
