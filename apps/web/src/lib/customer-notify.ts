import twilio from 'twilio';

import { getPublicBaseUrl } from './social-preview';

import { getPaymentProofById, recordPaymentProofNotification, tryReservePaymentProofNotification } from './payment-proofs';

function env(name: string): string {
  return String(process.env[name] || '').trim();
}

function envBool(name: string): boolean {
  const v = env(name).toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'on';
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
  if (!token) {
    console.warn('[CUSTOMER_NOTIFY] telegram env missing', { missing: ['TELEGRAM_BOT_TOKEN'] });
    return { ok: false, error: 'Missing TELEGRAM_BOT_TOKEN' };
  }

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

  const missing: string[] = [];
  if (!accountSid) missing.push('TWILIO_ACCOUNT_SID');
  if (!authToken) missing.push('TWILIO_AUTH_TOKEN');
  if (!fromEnv) missing.push('TWILIO_WHATSAPP_FROM');
  if (missing.length > 0) {
    console.warn('[CUSTOMER_NOTIFY] whatsapp env missing', { missing });
    return { ok: false, error: `Missing ${missing.join(', ')}` };
  }

  const from = normalizeTwilioFromAddress(fromEnv);
  if (!from) {
    console.warn('[CUSTOMER_NOTIFY] whatsapp invalid TWILIO_WHATSAPP_FROM', { from: safeTrunc(fromEnv, 24) });
    return { ok: false, error: 'Invalid TWILIO_WHATSAPP_FROM (expected E.164 number)' };
  }

  const to = normalizeWhatsAppAddress(params.toPhone);
  if (!to) {
    console.warn('[CUSTOMER_NOTIFY] whatsapp invalid whatsappNumber', { toPhone: safeTrunc(params.toPhone, 24) });
    return { ok: false, error: 'Invalid whatsappNumber (expected E.164 digits)' };
  }

  try {
    const client = twilio(accountSid, authToken);
    const msg = await client.messages.create({ from, to, body: params.text });
    const messageId = (msg as any)?.sid != null ? String((msg as any).sid) : undefined;

    const debug = envBool('PHOENIX_ZERO_NOTIFY_DEBUG');
    if (debug && messageId) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const fetched = await client.messages(messageId).fetch();
        const status = (fetched as any)?.status != null ? String((fetched as any).status) : '';
        const errorCode = (fetched as any)?.errorCode != null ? String((fetched as any).errorCode) : undefined;
        const errorMessage = (fetched as any)?.errorMessage != null ? String((fetched as any).errorMessage) : undefined;
        console.log('[CUSTOMER_NOTIFY] whatsapp twilio status', { messageId, status, errorCode, errorMessage });

        const bad = status === 'failed' || status === 'undelivered';
        if (bad) {
          const err = `Twilio delivery status=${status}${errorCode ? ` code=${errorCode}` : ''}${errorMessage ? ` msg=${errorMessage}` : ''}`;
          return { ok: false, error: err };
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn('[CUSTOMER_NOTIFY] whatsapp twilio status fetch failed', { messageId, error: message });
      }
    }
    return { ok: true, messageId };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message || 'Twilio send failed' };
  }
}

export async function notifyCustomerForPaidProof(params: { proofId: string }): Promise<void> {
  const proofId = String(params.proofId || '').trim();
  if (!proofId) return;

  const debug = envBool('PHOENIX_ZERO_NOTIFY_DEBUG');

  const proof = await getPaymentProofById(proofId);
  if (!proof) {
    if (debug) console.warn('[CUSTOMER_NOTIFY] skip: proof not found', { proofId });
    return;
  }
  if (proof.status !== 'paid_confirmed') {
    if (debug) console.warn('[CUSTOMER_NOTIFY] skip: proof not paid_confirmed', { proofId, status: proof.status });
    return;
  }

  const contact = (proof as any).customerContact as { whatsappNumber?: string; telegramChatId?: string } | undefined;
  if (!contact) {
    if (debug) console.warn('[CUSTOMER_NOTIFY] skip: missing customerContact', { proofId });
    return;
  }

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

      if (debug && r.ok) {
        console.log('[CUSTOMER_NOTIFY] telegram sent', { proofId, messageId: r.messageId });
      }

      if (!r.ok) {
        console.warn('[CUSTOMER_NOTIFY] telegram send failed', { proofId, error: r.error });
      }
    } else {
      if (debug) console.warn('[CUSTOMER_NOTIFY] telegram skip: reserve not acquired', { proofId });
    }
  }

  if (!contact.telegramChatId && debug) {
    console.warn('[CUSTOMER_NOTIFY] skip: no telegramChatId', { proofId });
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

      if (debug && r.ok) {
        console.log('[CUSTOMER_NOTIFY] whatsapp sent', { proofId, messageId: r.messageId });
      }

      if (!r.ok) {
        console.warn('[CUSTOMER_NOTIFY] whatsapp send failed', { proofId, error: r.error });
      }
    } else {
      if (debug) console.warn('[CUSTOMER_NOTIFY] whatsapp skip: reserve not acquired', { proofId });
    }
  }

  if (!contact.whatsappNumber && debug) {
    console.warn('[CUSTOMER_NOTIFY] skip: no whatsappNumber', { proofId });
  }
}
