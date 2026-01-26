import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function stripQuotes(v: string): string {
  const s = String(v || '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function loadEnvFromFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  for (const lineRaw of lines) {
    const line = String(lineRaw || '').trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    if (!k) continue;
    if (process.env[k] != null && String(process.env[k]).trim() !== '') continue;
    const v = stripQuotes(line.slice(idx + 1));
    process.env[k] = v;
  }
}

function loadEnv(): void {
  const cwd = process.cwd();
  loadEnvFromFile(resolve(cwd, '.env.local'));
  loadEnvFromFile(resolve(cwd, '.env'));
  loadEnvFromFile(resolve(cwd, 'apps', 'web', '.env.local'));
  loadEnvFromFile(resolve(cwd, 'apps', 'web', '.env'));
}

function env(name: string): string {
  return String(process.env[name] || '').trim();
}

function ensureNoTrailingSlash(s: string): string {
  return String(s || '').replace(/\/+$/g, '');
}

async function main() {
  loadEnv();
  const token = env('TELEGRAM_BOT_TOKEN');
  if (!token) {
    console.error('Missing TELEGRAM_BOT_TOKEN');
    console.error('Hint: in PowerShell set env vars like:');
    console.error("  $env:TELEGRAM_BOT_TOKEN='...'");
    console.error("  $env:PHOENIX_ZERO_PUBLIC_BASE_URL='https://your-service.onrender.com'");
    console.error('Or create a .env.local file in the repo root with those values (gitignored).');
    process.exitCode = 1;
    return;
  }

  const publicBase = ensureNoTrailingSlash(env('PHOENIX_ZERO_PUBLIC_BASE_URL') || env('NEXT_PUBLIC_SITE_URL'));
  if (!publicBase) throw new Error('Missing PHOENIX_ZERO_PUBLIC_BASE_URL (or NEXT_PUBLIC_SITE_URL)');

  const webhookUrl = `${publicBase}/api/telegram/webhook`;
  const secret = env('TELEGRAM_WEBHOOK_SECRET');

  const api = `https://api.telegram.org/bot${encodeURIComponent(token)}/setWebhook`;

  const payload: Record<string, any> = {
    url: webhookUrl,
    allowed_updates: ['message', 'edited_message']
  };
  if (secret) payload.secret_token = secret;

  const res = await fetch(api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload)
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok || !json?.ok) {
    throw new Error(`Telegram setWebhook failed: ${JSON.stringify(json)}`);
  }

  console.log('OK');
  console.log({ webhookUrl, secretConfigured: Boolean(secret) });
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(msg);
  process.exitCode = 1;
});
