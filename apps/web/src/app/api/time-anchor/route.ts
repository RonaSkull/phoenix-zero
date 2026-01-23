import { resolveTimeAnchorConfig } from '../../../lib/anchor-profiles';
import {
  createTimeAnchor,
  createTimeAnchorVerificationToken,
  getTimeAnchorForTenant,
  verifyTimeAnchor,
  type TimeAnchorKind
} from '../../../lib/time-anchors';

import { getOrCreateBillingAccount, isBillingAccountActive } from '../../../lib/billing-accounts';
import { requireTenant } from '../../../lib/tenant-auth';
import { recordUsage, type UsageOp } from '../../../lib/usage-ledger';

export const runtime = 'nodejs';

type RateEntry = {
  windowStart: number;
  count: number;
};

const g = globalThis as unknown as { __phoenixZeroTimeAnchorRate?: Map<string, RateEntry> };
const rate = g.__phoenixZeroTimeAnchorRate ?? (g.__phoenixZeroTimeAnchorRate = new Map<string, RateEntry>());

function getClientIp(req: Request): string {
  const h = req.headers;
  const xff = (h.get('x-forwarded-for') || '').trim();
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  const realIp = (h.get('x-real-ip') || '').trim();
  if (realIp) return realIp;
  const cf = (h.get('cf-connecting-ip') || '').trim();
  if (cf) return cf;
  return 'unknown';
}

function getEnvInt(name: string, fallback: number): number {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function nowMs(): number {
  return Date.now();
}

function rateLimitOk(req: Request): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const rpm = Math.max(1, getEnvInt('PHOENIX_ZERO_TIME_ANCHOR_RPM', 240));
  const windowMs = 60_000;
  const ip = getClientIp(req);
  const now = nowMs();

  const rec = rate.get(ip);
  if (!rec || now - rec.windowStart >= windowMs) {
    rate.set(ip, { windowStart: now, count: 1 });
    return { ok: true };
  }

  if (rec.count >= rpm) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - rec.windowStart)) / 1000));
    return { ok: false, retryAfterSeconds };
  }

  rec.count += 1;
  rate.set(ip, rec);
  return { ok: true };
}

function isBase64UrlLike(s: string): boolean {
  if (!s) return false;
  if (s.length < 16 || s.length > 256) return false;
  return /^[A-Za-z0-9_-]+$/.test(s);
}

function normalizeId(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const v = input.trim();
  if (!v) return undefined;
  if (v.length > 128) return undefined;
  return v;
}

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function POST(req: Request) {
  const startedAtMs = Date.now();
  let tenantId: string | null = null;
  let ok = false;
  let httpStatus = 500;
  let op: UsageOp = 'time_anchor_get';
  let action: string | undefined;
  try {
    const body = (await req.json().catch(() => null)) as
      | null
      | {
          creatorId?: string;
          clientId?: string;
          profile?: string;
          kind?: TimeAnchorKind;
          contentCommitB64Url?: string;
          ttlSeconds?: number;
          mode?: 'compat' | 'strict';
          action?: 'create' | 'verify' | 'get';
          anchorId?: string;
        };

    action = body?.action;
    op = body?.action === 'create' ? 'time_anchor_create' : 'time_anchor_get';

    const auth = await requireTenant(req);
    if (!auth.ok) {
      httpStatus = auth.status;
      return Response.json(
        { ok: false, reason: auth.reason },
        { status: auth.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }
    tenantId = auth.ctx.tenantId;

    const billing = await getOrCreateBillingAccount(auth.ctx.tenantId);
    if (!billing.ok) {
      httpStatus = 400;
      return Response.json(
        { ok: false, reason: billing.reason },
        { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }
    if (!isBillingAccountActive(billing.account)) {
      httpStatus = 402;
      return Response.json(
        { ok: false, reason: 'Payment required', billing: { status: billing.account.status, isActive: false } },
        { status: 402, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const rateRes = rateLimitOk(req);
    if (!rateRes.ok) {
      httpStatus = 429;
      return Response.json(
        { ok: false, reason: 'Rate limit exceeded' },
        { status: 429, headers: jsonUtf8Headers({ 'Retry-After': String(rateRes.retryAfterSeconds), 'Cache-Control': 'no-store' }) }
      );
    }

    const creatorId = normalizeId(body?.creatorId);
    const clientId = normalizeId(body?.clientId);
    const profile = typeof body?.profile === 'string' ? body.profile.trim() : '';

    const kind = (typeof body?.kind === 'string' ? body.kind : undefined) as TimeAnchorKind | undefined;
    const contentCommitB64Url = typeof body?.contentCommitB64Url === 'string' ? body.contentCommitB64Url.trim() : '';
    const ttlSeconds = typeof body?.ttlSeconds === 'number' ? body.ttlSeconds : undefined;
    const mode = (typeof body?.mode === 'string' ? body.mode : undefined) as 'compat' | 'strict' | undefined;

    if (body?.action === 'create') {
      if (!contentCommitB64Url) {
        httpStatus = 400;
        return Response.json({ ok: false, reason: 'Missing contentCommitB64Url' }, { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
      }
      if (!isBase64UrlLike(contentCommitB64Url)) {
        httpStatus = 400;
        return Response.json(
          { ok: false, reason: 'Invalid contentCommitB64Url (expected base64url-like string)' },
          { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
        );
      }

      const resolved = resolveTimeAnchorConfig({ kind, ttlSeconds, mode, profile: profile || undefined });
      if (!resolved.ok) {
        httpStatus = 400;
        return Response.json({ ok: false, reason: resolved.reason }, { status: 400, headers: jsonUtf8Headers() });
      }

      const out = await createTimeAnchor({
        tenantId: auth.ctx.tenantId,
        creatorId,
        clientId,
        anchorProfileId: resolved.config.anchorProfileId,
        kind: resolved.config.kind,
        contentCommitB64Url,
        ttlSeconds: resolved.config.ttlSeconds,
        mode: resolved.config.mode
      });
      if (!out.ok) {
        httpStatus = 400;
        return Response.json({ ok: false, reason: out.reason }, { status: 400, headers: jsonUtf8Headers() });
      }

      const u = new URL(req.url);
      const base = `${u.protocol}//${u.host}`;
      const publicBase = (process.env.PHOENIX_ZERO_PUBLIC_BASE_URL || '').trim();
      const linksBase = publicBase || base;
      const verifyUrl = new URL(`/verify-anchor/${encodeURIComponent(out.record.anchorId)}`, linksBase).toString();
      const verifyUrlWithCommit = new URL(
        `/verify-anchor/${encodeURIComponent(out.record.anchorId)}?contentCommit=${encodeURIComponent(contentCommitB64Url)}`,
        linksBase
      ).toString();

      const tokenRes = await createTimeAnchorVerificationToken({ anchorId: out.record.anchorId, contentCommitB64Url }).catch(() => null);
      const verificationToken = tokenRes && tokenRes.ok ? tokenRes.token : null;
      const verifyUrlOfficial = verificationToken
        ? new URL(`/verify-anchor/${encodeURIComponent(out.record.anchorId)}?v=${encodeURIComponent(verificationToken)}`, linksBase).toString()
        : null;

      ok = true;
      httpStatus = 200;
      return Response.json(
        {
          ok: true,
          anchorId: out.record.anchorId,
          verifyUrl,
          verifyUrlWithCommit,
          verifyUrlOfficial,
          verificationToken,
          applied: {
            kind: resolved.config.kind,
            ttlSeconds: resolved.config.ttlSeconds ?? null,
            mode: resolved.config.mode,
            profile: resolved.config.anchorProfileId ?? null,
            clientId: clientId ?? null
          },
          record: out.record
        },
        { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    } else if (body?.action === 'verify') {
      const anchorId = typeof body.anchorId === 'string' ? body.anchorId : '';
      if (!isBase64UrlLike(anchorId)) {
        httpStatus = 400;
        return Response.json({ ok: false, reason: 'Invalid anchorId' }, { status: 400 });
      }

      const rec = await getTimeAnchorForTenant({ anchorId, tenantId: auth.ctx.tenantId });
      if (!rec) {
        httpStatus = 404;
        return Response.json({ ok: false, reason: 'Not found' }, { status: 404 });
      }

      const verified = await verifyTimeAnchor({ anchorId, contentCommitB64Url: contentCommitB64Url || undefined });

      ok = true;
      httpStatus = 200;
      return Response.json(
        { ok: true, record: rec, verified },
        { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    } else if (body?.action === 'get') {
      const anchorId = typeof body.anchorId === 'string' ? body.anchorId : '';
      if (!isBase64UrlLike(anchorId)) {
        httpStatus = 400;
        return Response.json({ ok: false, reason: 'Invalid anchorId' }, { status: 400 });
      }

      const rec = await getTimeAnchorForTenant({ anchorId, tenantId: auth.ctx.tenantId });
      if (!rec) {
        httpStatus = 404;
        return Response.json({ ok: false, reason: 'Not found' }, { status: 404 });
      }

      ok = true;
      httpStatus = 200;
      return Response.json(
        { ok: true, record: rec },
        { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    } else {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Invalid action' }, { status: 400 });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    ok = false;
    httpStatus = 500;
    return Response.json({ ok: false, reason: message }, { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  } finally {
    void recordUsage({ req, tenantId, op, ok, httpStatus, startedAtMs, meta: action ? { action } : undefined });
  }
}

export async function GET(req: Request) {
  const startedAtMs = Date.now();
  let tenantId: string | null = null;
  let ok = false;
  let httpStatus = 500;
  try {
    const auth = await requireTenant(req);
    if (!auth.ok) {
      httpStatus = auth.status;
      return Response.json(
        { ok: false, reason: auth.reason },
        { status: auth.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }
    tenantId = auth.ctx.tenantId;

    const billing = await getOrCreateBillingAccount(auth.ctx.tenantId);
    if (!billing.ok) {
      httpStatus = 400;
      return Response.json(
        { ok: false, reason: billing.reason },
        { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }
    if (!isBillingAccountActive(billing.account)) {
      httpStatus = 402;
      return Response.json(
        { ok: false, reason: 'Payment required', billing: { status: billing.account.status, isActive: false } },
        { status: 402, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const rateRes = rateLimitOk(req);
    if (!rateRes.ok) {
      httpStatus = 429;
      return Response.json(
        { ok: false, reason: 'Rate limit exceeded' },
        { status: 429, headers: jsonUtf8Headers({ 'Retry-After': String(rateRes.retryAfterSeconds), 'Cache-Control': 'no-store' }) }
      );
    }

    const u = new URL(req.url);
    const anchorId = (u.searchParams.get('anchorId') || '').trim();
    const contentCommit = (u.searchParams.get('contentCommit') || '').trim();

    if (!anchorId) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Missing anchorId' }, { status: 400, headers: jsonUtf8Headers() });
    }

    if (anchorId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(anchorId)) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Invalid anchorId' }, { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
    }

    if (contentCommit && !isBase64UrlLike(contentCommit)) {
      httpStatus = 400;
      return Response.json(
        { ok: false, reason: 'Invalid contentCommit (expected base64url-like string)' },
        { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const record = await getTimeAnchorForTenant({ anchorId, tenantId: auth.ctx.tenantId });
    if (!record) {
      httpStatus = 404;
      return Response.json({ ok: false, reason: 'Not found' }, { status: 404, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
    }

    const verified = await verifyTimeAnchor({ anchorId, contentCommitB64Url: contentCommit || undefined });

    ok = true;
    httpStatus = 200;
    return Response.json(
      { ok: true, record, verified },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    ok = false;
    httpStatus = 500;
    return Response.json({ ok: false, reason: message }, { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  } finally {
    void recordUsage({ req, tenantId, op: 'time_anchor_get', ok, httpStatus, startedAtMs });
  }
}
