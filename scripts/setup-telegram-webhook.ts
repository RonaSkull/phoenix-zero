function env(name: string): string {
  return String(process.env[name] || '').trim();
}

function ensureNoTrailingSlash(s: string): string {
  return String(s || '').replace(/\/+$/g, '');
}

async function main() {
  const token = env('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN');

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
