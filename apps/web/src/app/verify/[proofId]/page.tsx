import { notFound } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import type { CSSProperties } from 'react';

import { getPaymentProofById } from '../../../lib/payment-proofs';
import { toPublicGuaranteeProof } from '../../../lib/guarantee-proofs';
import { VerifyActionsClient } from './VerifyActionsClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const viewport = { width: 'device-width', initialScale: 1 };

function trunc(s: string, n: number): string {
  const x = String(s || '');
  if (x.length <= n) return x;
  return `${x.slice(0, n)}…`;
}

function displayTaskType(taskType: string): string {
  const t = String(taskType || '').trim();
  if (!t) return 'demo_execution';
  if (/^protect_/i.test(t)) return 'demo_execution';
  if (/^stamp_/i.test(t)) return 'demo_execution';
  return t;
}

function formatAmountMinorForDisplay(amountMinor: number, currency: string): string {
  const minor = typeof amountMinor === 'number' && Number.isFinite(amountMinor) ? Math.max(0, Math.trunc(amountMinor)) : 0;
  const code = String(currency || '').trim() || 'USD';
  try {
    const nf = new Intl.NumberFormat('en-US', { style: 'currency', currency: code });
    const digits = Math.max(0, Math.min(8, Math.trunc(nf.resolvedOptions().maximumFractionDigits ?? 2)));
    const major = minor / Math.pow(10, digits);
    const formatted = nf.format(major);
    return `${formatted} (${code})`;
  } catch {
    return `${minor} (${code})`;
  }
}

function pageShellStyle(): CSSProperties {
  return {
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
    padding: 18,
    maxWidth: 980,
    margin: '0 auto',
    color: 'rgba(255,255,255,0.92)'
  };
}

function cardStyle(): CSSProperties {
  return {
    marginTop: 14,
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 14,
    padding: 14,
    background: 'rgba(0,0,0,0.18)'
  };
}

export default async function VerifyProofPage(props: { params: { proofId: string } }) {
  const proofId = String(props?.params?.proofId || '').trim();
  if (!proofId) notFound();

  const h = await headers();
  const forwardedProto = String(h.get('x-forwarded-proto') || '').trim();
  const forwardedHost = String(h.get('x-forwarded-host') || '').trim();
  const host = forwardedHost || String(h.get('host') || '').trim();
  const proto = forwardedProto || 'https';
  const origin = host ? `${proto}://${host}` : '';
  const verifyUrl = origin ? `${origin}/verify/${encodeURIComponent(proofId)}` : '';

  const raw = await getPaymentProofById(proofId);
  if (!raw) {
    return (
      <main style={pageShellStyle()}>
        <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(1200px 600px at 15% 10%, rgba(109, 40, 217, 0.24), transparent 60%), #050814', zIndex: -1 }} />

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.7 }}>Phoenix ZerØ</div>
            <h1 style={{ margin: '6px 0 0 0', fontSize: 22, lineHeight: 1.15 }}>
              Proof
              <br />
              Not Found
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Link href="/proofs" style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', textDecoration: 'none' }}>Proofs</Link>
            <Link href="/" style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', textDecoration: 'none' }}>Home</Link>
          </div>
        </div>

        <section style={cardStyle()}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 14, lineHeight: 1.4 }}>
              We could not locate this proof.
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.4, opacity: 0.9 }}>
              If you received this link via message, confirm the ID is correct or generate a new proof.
            </div>
          </div>
        </section>

        <section style={cardStyle()}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}><strong>proofId:</strong> {proofId}</div>
          </div>
        </section>
      </main>
    );
  }

  const proof = toPublicGuaranteeProof(raw);
  if (!proof) {
    const status = String((raw as any)?.status || '').trim() || 'unknown';
    const provider = String((raw as any)?.paymentProvider || '').trim() || 'unknown';
    const currency = String((raw as any)?.currency || '').trim() || 'USD';
    const amountCents = typeof (raw as any)?.amountCents === 'number' && Number.isFinite((raw as any).amountCents) ? Math.max(0, Math.trunc((raw as any).amountCents)) : 0;
    const taskType = String((raw as any)?.taskType || '').trim() || 'unknown';

    return (
      <main style={pageShellStyle()}>
        <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(1200px 600px at 15% 10%, rgba(109, 40, 217, 0.24), transparent 60%), #050814', zIndex: -1 }} />

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.7 }}>Phoenix ZerØ</div>
            <h1 style={{ margin: '6px 0 0 0', fontSize: 22, lineHeight: 1.15 }}>
              Proof
              <br />
              Not Public
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Link href="/proofs" style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', textDecoration: 'none' }}>Proofs</Link>
            <Link href="/" style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', textDecoration: 'none' }}>Home</Link>
          </div>
        </div>

        <section style={cardStyle()}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 14, lineHeight: 1.4 }}>
              This proof exists, but it is <strong>not publicly available</strong> right now.
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.4, opacity: 0.9 }}>
              This usually happens after a <strong>refund</strong>, <strong>chargeback</strong>, or while the payment is not confirmed.
            </div>
          </div>
        </section>

        <section style={cardStyle()}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}><strong>proofId:</strong> {proofId}</div>
            <div><strong>status:</strong> {status}</div>
            <div><strong>createdAt:</strong> {String((raw as any)?.createdAt || '')}</div>
            <div>
              <strong>payment:</strong> {provider} — {formatAmountMinorForDisplay(amountCents, currency)}
            </div>
            <div><strong>taskType:</strong> {taskType}</div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main style={pageShellStyle()}>
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(1200px 600px at 15% 10%, rgba(109, 40, 217, 0.24), transparent 60%), #050814', zIndex: -1 }} />

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.7 }}>Phoenix ZerØ</div>
          <h1 style={{ margin: '6px 0 0 0', fontSize: 22, lineHeight: 1.15 }}>
            Proof
            <br />
            Verified
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/proofs" style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', textDecoration: 'none' }}>Proofs</Link>
          <Link href="/" style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', textDecoration: 'none' }}>Home</Link>
        </div>
      </div>

      <section style={cardStyle()}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, opacity: 0.78, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            <strong>Proof ID:</strong> {proof.proofId}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a
              href={`/verify/${encodeURIComponent(proof.proofId)}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(0,0,0,0.25)',
                color: 'rgba(255,255,255,0.92)',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: 13
              }}
            >
              Open
            </a>
            <VerifyActionsClient proofId={proof.proofId} url={verifyUrl} />
            <a
              href={`/api/guarantee-proofs/${encodeURIComponent(proof.proofId)}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(0,0,0,0.10)',
                color: 'rgba(255,255,255,0.88)',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: 13
              }}
            >
              JSON
            </a>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          <div><strong>verifiedAt:</strong> {proof.verifiedAt}</div>
          <div>
            <strong>payment:</strong> {proof.payment.provider} — {formatAmountMinorForDisplay(proof.payment.amountCents, proof.payment.currency)}
          </div>
          <div><strong>taskType:</strong> {displayTaskType(proof.task.taskType)}</div>
          {proof.task.taskId ? <div><strong>taskId:</strong> {proof.task.taskId}</div> : null}
          <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}><strong>taskInputHash:</strong> {proof.task.taskInputHash}</div>
          <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}><strong>taskOutputHash:</strong> {proof.task.taskOutputHash}</div>
          <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            <strong>digest:</strong> {proof.digestB64Url}
            <span style={{ opacity: 0.7 }}> ({trunc(proof.digestB64Url, 22)})</span>
          </div>
          {proof.signature?.verified !== undefined ? (
            <div><strong>signatureVerified:</strong> {String(proof.signature.verified)}</div>
          ) : null}
          {proof.signature?.payloadHashB64Url ? (
            <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}><strong>signaturePayloadHash:</strong> {proof.signature.payloadHashB64Url}</div>
          ) : null}
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: 16 }}>Public JSON</h2>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'rgba(8, 10, 18, 0.90)', color: '#e5e7eb', padding: 14, borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)' }}>
          {JSON.stringify(proof, null, 2)}
        </pre>
      </section>
    </main>
  );
}
