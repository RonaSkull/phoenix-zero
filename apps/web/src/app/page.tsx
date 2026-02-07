import Link from 'next/link';
import { headers } from 'next/headers';
import { listPaymentProofs } from '../lib/payment-proofs';
import { toPublicGuaranteeProof } from '../lib/guarantee-proofs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

function displayTaskType(taskType: string): string {
  const t = String(taskType || '').trim();
  if (!t) return 'demo_execution';
  if (/^protect_/i.test(t)) return 'demo_execution';
  if (/^stamp_/i.test(t)) return 'demo_execution';
  return t;
}

export default async function HomePage() {
  const h = await headers();
  const host = String(h.get('x-forwarded-host') || h.get('host') || '').trim();
  const proto = String(h.get('x-forwarded-proto') || 'https').trim() || 'https';
  const baseUrl = host ? `${proto}://${host}` : '';
  const publicBaseUrl = String(process.env.PHOENIX_ZERO_PUBLIC_BASE_URL || '').trim();
  const qrBaseUrl = publicBaseUrl || baseUrl;
  const qrDisabled = !qrBaseUrl || /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/i.test(qrBaseUrl);

  const raw = await listPaymentProofs({ status: 'paid_confirmed', limit: 8 });
  const proofs = raw
    .map((p) => toPublicGuaranteeProof(p))
    .filter(Boolean)
    .slice(0, 2);

  return (
    <main className="pz-shell pz-shell--mono pz-shell--scroll">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container" style={{ paddingTop: 14, paddingBottom: 18 }}>
        <div className="pz-topline">
          <div className="pz-kicker">Phoenix Zero</div>
          <div className="pz-rule" />
        </div>

        <nav style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <Link href="/enterprise-demo" className="pz-btn" style={{ textDecoration: 'none' }}>
            Enterprise Demo
          </Link>
          <Link href="/proofs" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none' }}>
            Proofs
          </Link>
          <details style={{ position: 'relative', marginLeft: 'auto' }}>
            <summary
              className="pz-btn pz-btn-ghost"
              style={{
                listStyle: 'none',
                cursor: 'pointer',
                opacity: 0.85,
                userSelect: 'none',
                paddingLeft: 12,
                paddingRight: 12
              }}
            >
              <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 18, height: 2, background: 'rgba(255,255,255,0.72)', borderRadius: 999 }} />
                <span style={{ width: 18, height: 2, background: 'rgba(255,255,255,0.72)', borderRadius: 999 }} />
                <span style={{ width: 18, height: 2, background: 'rgba(255,255,255,0.72)', borderRadius: 999 }} />
              </span>
            </summary>
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 8px)',
                minWidth: 220,
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(8, 10, 18, 0.96)',
                padding: 8,
                display: 'grid',
                gap: 6,
                zIndex: 40
              }}
            >
              <Link href="/ai-agents" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none', justifyContent: 'flex-start' }}>
                AI Agents
              </Link>
              <Link href="/faq" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none', justifyContent: 'flex-start' }}>
                FAQ
              </Link>
              <Link href="/tools/watermark" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none', justifyContent: 'flex-start' }}>
                Watermarking Tools
              </Link>
            </div>
          </details>
        </nav>

        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(22px, 3.2vw, 36px)', lineHeight: 1.08, maxWidth: 860 }}>
              Crypto settlement
              <br />
              with verifiable proofs per transaction.
            </h1>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 15, lineHeight: 1.65, maxWidth: 920 }}>
              Every confirmed payment can produce a public proof that anyone can verify at <code>/verify/&lt;proofId&gt;</code>. We focus on verifiable
              evidence (proof URLs, hardening, idempotency) instead of unprovable ROI claims.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.25)'
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: 999, background: '#22c55e' }} />
              <div style={{ display: 'grid', lineHeight: 1.2 }}>
                <div style={{ fontWeight: 800 }}>Hardening 23/23</div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>
                  suiteRunId: <code>hardening_2026-02-04T23-45-27-845Z</code>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 8 }}>
            <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
              <div className="pz-field-label">What you get</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
                <li>Public audit trail: proofs page + JSON verification</li>
                <li>Webhook ordering + idempotency hardening</li>
                <li>Settlement state with revert on refund events</li>
              </ul>
            </div>

            <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
              <div className="pz-field-label">Proofs</div>
              <div style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
                Public proofs live at <Link href="/proofs">/proofs</Link>. A single proof can be verified at <code>/verify/&lt;proofId&gt;</code>.
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
              <div className="pz-field-label">Payments</div>
              <div style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
                Crypto checkout via a liquidity provider (configurable). Phoenix Zero focuses on proof generation, ordering, and settlement state.
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
              <div className="pz-field-label">How to verify</div>
              <div style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
                Open <Link href="/proofs">/proofs</Link>, pick a proof, then share the link.
                Works on mobile — no app required.
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
              <div className="pz-field-label">Evidence</div>
              <div style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
                Hardening suite: <strong>23/23</strong>. suiteRunId: <code>hardening_2026-02-04T23-45-27-845Z</code>.
              </div>
            </div>
          </div>

          <section style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
            <div className="pz-field-label">Supported cryptos (enterprise set)</div>
            <div style={{ marginTop: 8, overflowX: 'auto', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.25)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, letterSpacing: 0.4 }}>Crypto</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, letterSpacing: 0.4 }}>Chains</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, letterSpacing: 0.4 }}>Settlement time</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, letterSpacing: 0.4 }}>Min test amount</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, letterSpacing: 0.4 }}>Status</th>
                  </tr>
                </thead>
                <tbody style={{ color: 'rgba(255,255,255,0.78)' }}>
                  {[
                    { c: 'USDC', chains: 'ETH, POLY, SOL, AVAX', t: '2–5 min', min: 'Varies (pair + fees)', s: '✅ Supported (via liquidity provider)' },
                    { c: 'USDT', chains: 'ETH, TRX, POLY', t: '2–10 min', min: 'Varies (pair + fees)', s: '✅ Supported (via liquidity provider)' },
                    { c: 'BTC', chains: 'BTC mainnet', t: '30–60 min', min: 'Varies (pair + fees)', s: '✅ Supported (via liquidity provider)' },
                    { c: 'ETH', chains: 'ETH mainnet', t: '2–5 min', min: 'Varies (pair + fees)', s: '✅ Supported (via liquidity provider)' },
                    { c: 'DAI', chains: 'ETH, POLY', t: '2–5 min', min: 'Varies (pair + fees)', s: '✅ Supported (via liquidity provider)' },
                    { c: 'SOL', chains: 'Solana', t: '< 1 min', min: 'Varies (pair + fees)', s: '✅ Supported (via liquidity provider)' },
                    { c: 'BNB', chains: 'BSC', t: '1–3 min', min: 'Varies (pair + fees)', s: '✅ Supported (via liquidity provider)' }
                  ].map((r) => (
                    <tr key={r.c} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 800, color: 'rgba(255,255,255,0.9)' }}>{r.c}</td>
                      <td style={{ padding: '10px 12px' }}>{r.chains}</td>
                      <td style={{ padding: '10px 12px' }}>{r.t}</td>
                      <td style={{ padding: '10px 12px' }}>{r.min}</td>
                      <td style={{ padding: '10px 12px' }}>{r.s}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
              Min test amount depends on the pay/outcome currency pair and current network fees. Crypto-agnostic architecture — settlement powered by liquidity providers.
            </div>
          </section>

          <section style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
            <div className="pz-field-label">Mobile proof verification</div>
            <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
              Scan a QR code or open <code>/verify/&lt;proofId&gt;</code> — no app required.
            </div>

            {proofs.length <= 0 ? (
              <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>
                No public proofs yet. Generate one via the demo flow, then refresh.
              </div>
            ) : (
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                {proofs.map((p) => {
                  const proofId = p!.proofId;
                  const url = !qrDisabled ? `${qrBaseUrl}/verify/${encodeURIComponent(proofId)}` : '';
                  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
                  return (
                    <a
                      key={proofId}
                      href={`/verify/${encodeURIComponent(proofId)}`}
                      style={{
                        display: 'grid', gap: 10, textDecoration: 'none', color: 'inherit',
                        border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: 12
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 900 }}>{displayTaskType(p!.task.taskType)}</div>
                        <div style={{ opacity: 0.8, fontSize: 12 }}>{formatAmountMinorForDisplay(p!.payment.amountCents, p!.payment.currency)}</div>
                      </div>
                      <div style={{ opacity: 0.75, fontSize: 12, overflowWrap: 'anywhere' }}>
                        proofId: <code>{proofId}</code>
                      </div>
                      <div style={{ display: 'grid', placeItems: 'center' }}>
                        {url ? (
                          <img src={qr} alt={`QR to verify ${proofId}`} width={220} height={220} style={{ borderRadius: 12 }} />
                        ) : (
                          <div style={{ padding: 12, borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', width: 220, textAlign: 'center', fontSize: 12, opacity: 0.8 }}>
                            QR disabled (set PHOENIX_ZERO_PUBLIC_BASE_URL)
                          </div>
                        )}
                      </div>
                      <div style={{ opacity: 0.75, fontSize: 12 }}>Scan to open /verify on mobile</div>
                    </a>
                  );
                })}
              </div>
            )}
          </section>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 2 }}>
            <Link href="/proofs" className="pz-btn pz-btn-primary" style={{ textDecoration: 'none' }}>
              Verify a Proof
            </Link>
            <Link href="/enterprise-demo" className="pz-btn" style={{ textDecoration: 'none', opacity: 0.9 }}>
              Book Technical Demo
            </Link>
            <Link href="/faq" className="pz-btn" style={{ textDecoration: 'none', opacity: 0.9 }}>
              Enterprise FAQ
            </Link>
            <Link href="/ppe/signup" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none', opacity: 0.9 }}>
              Get API Key
            </Link>
          </div>

          <details style={{ marginTop: 4 }}>
            <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 700 }}>Technical sandbox (PPE)</summary>
            <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.6, fontSize: 13 }}>
              If you are integrating agent execution, go to <Link href="/ppe/signup">/ppe/signup</Link> to get an API key and test the pay-per-execution
              flow.
            </div>
          </details>
        </section>
      </div>
    </main>
  );
}
