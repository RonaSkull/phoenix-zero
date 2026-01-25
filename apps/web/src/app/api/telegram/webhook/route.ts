import { getPublicBaseUrl } from '../../../../lib/social-preview';

export const runtime = 'nodejs';

function env(name: string): string {
  return String(process.env[name] || '').trim();
}

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

function requestBaseFromReq(req: Request): string {
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'http://localhost:3000';
  }
}

async function telegramSendMessage(params: {
  chatId: string;
  text: string;
}): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  const token = env('TELEGRAM_BOT_TOKEN');
  if (!token) return { ok: false, error: 'Missing TELEGRAM_BOT_TOKEN' };

  const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ chat_id: params.chatId, text: params.text, disable_web_page_preview: false })
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok || !json?.ok) {
    const desc = typeof json?.description === 'string' ? json.description : `HTTP ${res.status}`;
    return { ok: false, error: desc };
  }

  const messageId = json?.result?.message_id != null ? String(json.result.message_id) : undefined;
  return { ok: true, messageId };
}

function parseTelegramUpdate(body: any): { chatId: string; text: string } | null {
  const msg = body?.message || body?.edited_message || body?.channel_post || body?.edited_channel_post;
  const chatIdRaw = msg?.chat?.id;
  const chatId = chatIdRaw != null ? String(chatIdRaw).trim() : '';
  const text = typeof msg?.text === 'string' ? msg.text : '';
  if (!chatId) return null;
  return { chatId, text };
}

export async function GET() {
  return Response.json(
    { ok: true },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}

export async function POST(req: Request) {
  const expectedSecret = env('TELEGRAM_WEBHOOK_SECRET');
  if (expectedSecret) {
    const got = String(req.headers.get('x-telegram-bot-api-secret-token') || '').trim();
    if (!got || got !== expectedSecret) {
      console.warn('[TELEGRAM_WEBHOOK] unauthorized: secret token mismatch', {
        hasSecret: true,
        got: got ? 'present' : 'missing'
      });
      return Response.json({ ok: false, reason: 'Unauthorized' }, { status: 401, headers: jsonUtf8Headers() });
    }
  }

  const body = (await req.json().catch(() => null)) as any;
  if (!body || typeof body !== 'object') {
    console.warn('[TELEGRAM_WEBHOOK] invalid json body');
    return Response.json({ ok: false, reason: 'Invalid JSON body' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const parsed = parseTelegramUpdate(body);
  if (!parsed) {
    console.log('[TELEGRAM_WEBHOOK] ignored update (no message/chatId)', {
      updateId: body?.update_id
    });
    return Response.json({ ok: true, ignored: true }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  }

  const requestBase = requestBaseFromReq(req);
  const publicBase = getPublicBaseUrl(requestBase).replace(/\/+$/g, '');

  const chatId = parsed.chatId;
  const text = (parsed.text || '').trim();

  console.log('[TELEGRAM_WEBHOOK] incoming', {
    updateId: body?.update_id,
    chatId,
    text: text ? (text.length > 64 ? `${text.slice(0, 64)}...` : text) : ''
  });

  let reply = '';
  if (/^\/start\b/i.test(text) || !text) {
    reply = [
      'Phoenix Zero — Bot',
      '',
      `Seu telegramChatId: ${chatId}`,
      '',
      'Use este id em proofMeta.customerContact.telegramChatId ao criar o checkout.',
      '',
      'Comandos:',
      '- /proof <proofId>  (gera link público de verificação)'
    ].join('\n');
  } else {
    const m = text.match(/^\/proof\s+(.+)$/i);
    if (m) {
      const proofId = String(m[1] || '').trim();
      if (!proofId) {
        reply = 'Uso: /proof <proofId>';
      } else {
        reply = `Prova: ${publicBase}/verify/${encodeURIComponent(proofId)}`;
      }
    } else {
      reply = [
        'Comandos:',
        '- /start',
        '- /proof <proofId>'
      ].join('\n');
    }
  }

  const sent = await telegramSendMessage({ chatId, text: reply });
  if (!sent.ok) {
    console.warn('[TELEGRAM_WEBHOOK] sendMessage failed', { chatId, error: sent.error });
    return Response.json(
      { ok: false, reason: sent.error },
      { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  return Response.json(
    { ok: true },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
