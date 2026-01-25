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

async function sendWhatsappZApiText(params: { phone: string; text: string }): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  const instanceId = env('ZAPI_INSTANCE_ID');
  const instanceToken = env('ZAPI_INSTANCE_TOKEN');
  if (!instanceId || !instanceToken) return { ok: false, error: 'Missing ZAPI_INSTANCE_ID or ZAPI_INSTANCE_TOKEN' };

  const clientToken = env('ZAPI_CLIENT_TOKEN');

  const url = `https://api.z-api.io/instances/${encodeURIComponent(instanceId)}/token/${encodeURIComponent(instanceToken)}/send-text`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(clientToken ? { 'Client-Token': clientToken } : {})
    },
    body: JSON.stringify({ phone: params.phone, message: params.text })
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` };
  }

  const messageId = json?.messageId != null ? String(json.messageId) : json?.id != null ? String(json.id) : undefined;
  return { ok: true, messageId };
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
    }
  }

  if (contact.whatsappNumber && !(notified.whatsapp && notified.whatsapp.ok === true)) {
    const reserved = await tryReservePaymentProofNotification({ id: proofId, channel: 'whatsapp', minRetryAfterSeconds: 30 });
    if (reserved.ok) {
      const r = await sendWhatsappZApiText({ phone: contact.whatsappNumber, text });
      await recordPaymentProofNotification({
        id: proofId,
        channel: 'whatsapp',
        ok: r.ok,
        providerMessageId: r.ok ? r.messageId : undefined,
        error: r.ok ? undefined : r.error
      });
    }
  }
}
