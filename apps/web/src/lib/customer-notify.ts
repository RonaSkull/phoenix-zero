import twilio from 'twilio';

import { getPublicBaseUrl } from './social-preview';

import { getPaymentProofById, recordPaymentProofNotification, tryReservePaymentProofNotification } from './payment-proofs';

function env(name: string): string {
  return String(process.env[name] || '').trim();
}

function safeTrunc(s: string, n: number): string {
  const x = String(s || '');
  if (x.length <= n) return x;
  return `${x.slice(0, n)}…`;
}

function getRequestBaseUrlFallback(): string {
  const fromEnv = env('PHOENIX_ZERO_PUBLIC_BASE_URL') || env('NEXT_PUBLIC_SITE_URL');
  if (fromEnv) return String(fromEnv).replace(/\/+$/g, '');
  return 'http://localhost:3000';
}

function buildProofUrl(params: { proofId: string }): string {
  const base = getPublicBaseUrl(getRequestBaseUrlFallback()).replace(/\/+$/g, '');
  return `${base}/verify/${encodeURIComponent(params.proofId)}`;
}

async function sendTelegramMessage(params: { chatId: string; text: string }): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
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

function normalizeE164(input: string): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  const normalized = raw.startsWith('+') ? `+${digits}` : `+${digits}`;
  if (!/^\+\d{8,15}$/.test(normalized)) return null;
  return normalized;
}

function normalizeWhatsAppAddress(input: string): string | null {
  const e164 = normalizeE164(input);
  if (!e164) return null;
  return `whatsapp:${e164}`;
}

function normalizeTwilioFromAddress(input: string): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (raw.startsWith('whatsapp:')) {
    const rest = raw.slice('whatsapp:'.length);
    const e164 = normalizeE164(rest);
    return e164 ? `whatsapp:${e164}` : null;
  }
  const e164 = normalizeE164(raw);
  return e164 ? `whatsapp:${e164}` : null;
}

async function sendTwilioWhatsAppMessage(params: {
  toPhone: string;
  text: string;
}): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  const accountSid = env('TWILIO_ACCOUNT_SID');
  const authToken = env('TWILIO_AUTH_TOKEN');
  const fromEnv = env('TWILIO_WHATSAPP_FROM');
  if (!accountSid || !authToken || !fromEnv) {
    return { ok: false, error: 'Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_WHATSAPP_FROM' };
  }

  const from = normalizeTwilioFromAddress(fromEnv);
  if (!from) return { ok: false, error: 'Invalid TWILIO_WHATSAPP_FROM (expected E.164 number)' };

  const to = normalizeWhatsAppAddress(params.toPhone);
  if (!to) return { ok: false, error: 'Invalid whatsappNumber (expected E.164 digits)' };

  try {
    const client = twilio(accountSid, authToken);
    const msg = await client.messages.create({ from, to, body: params.text });
    const messageId = (msg as any)?.sid != null ? String((msg as any).sid) : undefined;
    return { ok: true, messageId };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message || 'Twilio send failed' };
  }
}

export async function notifyCustomerForPaidProof(params: { proofId: string }): Promise<void> {
  const proofId = String(params.proofId || '').trim();
  if (!proofId) return;

  const proof = await getPaymentProofById(proofId);
  if (!proof || proof.status !== 'paid_confirmed') return;

  const contact = (proof as any).customerContact as { whatsappNumber?: string; telegramChatId?: string } | undefined;
  if (!contact) return;

  const proofUrl = buildProofUrl({ proofId });
  const title = 'Pagamento confirmado.';

  const text = [
    title,
    `Prova: ${proofUrl}`,
    `ID: ${safeTrunc(proofId, 20)}`
  ].join('\n');

  const notified = (proof as any).customerNotifications || {};

  if (contact.telegramChatId && !(notified.telegram && notified.telegram.ok === true)) {
    const reserved = await tryReservePaymentProofNotification({ id: proofId, channel: 'telegram', minRetryAfterSeconds: 30 });
    if (reserved.ok) {
      const r = await sendTelegramMessage({ chatId: contact.telegramChatId, text });
      await recordPaymentProofNotification({
        id: proofId,
        channel: 'telegram',
        ok: r.ok,
        providerMessageId: r.ok ? r.messageId : undefined,
        error: r.ok ? undefined : r.error
      });

      if (!r.ok) {
        console.warn('[CUSTOMER_NOTIFY] telegram send failed', { proofId, error: r.error });
      }
    }
  }

  if (contact.whatsappNumber && !(notified.whatsapp && notified.whatsapp.ok === true)) {
    const reserved = await tryReservePaymentProofNotification({ id: proofId, channel: 'whatsapp', minRetryAfterSeconds: 30 });
    if (reserved.ok) {
      const r = await sendTwilioWhatsAppMessage({ toPhone: contact.whatsappNumber, text });
      await recordPaymentProofNotification({
        id: proofId,
        channel: 'whatsapp',
        ok: r.ok,
        providerMessageId: r.ok ? r.messageId : undefined,
        error: r.ok ? undefined : r.error
      });

      if (!r.ok) {
        console.warn('[CUSTOMER_NOTIFY] whatsapp send failed', { proofId, error: r.error });
      }
    }
  }
}
