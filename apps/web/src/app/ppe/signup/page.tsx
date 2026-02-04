'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';

type SignupOk = {
  ok: true;
  tenant: {
    tenantId: string;
    apiKey: string;
    profile?: string;
    limits?: any;
  };
  nextSteps?: string[];
};

type SignupErr = {
  ok: false;
  reasonCode?: string;
  message?: string;
  missingFields?: string[];
};

type SignupResponse = SignupOk | SignupErr;

async function copyToClipboard(text: string): Promise<boolean> {
  const t = String(text || '').trim();
  if (!t) return false;
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    return false;
  }
}

export default function PpeSignupPage() {
  const [name, setName] = useState('My Agent');
  const [email, setEmail] = useState('');
  const [agentType, setAgentType] = useState('buyer');
  const [intendedUse, setIntendedUse] = useState('autonomous agent integration');
  const [currency, setCurrency] = useState<'USD' | 'BRL'>('USD');

  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [raw, setRaw] = useState('');
  const [res, setRes] = useState<SignupResponse | null>(null);

  const apiKey = useMemo(() => {
    const k = (res as any)?.tenant?.apiKey;
    return String(k || '').trim();
  }, [res]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setCopied(false);
    setRes(null);
    setRaw('');

    try {
      const r = await fetch('/api/public/agent-signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          agentType: agentType.trim(),
          intendedUse: intendedUse.trim(),
          acceptsTermsVersion: '2026-01-v1',
          acceptsFixedPricing: true,
          billingMode: 'prepaid',
          currency
        })
      });

      const txt = await r.text();
      setRaw(txt);
      try {
        const j = JSON.parse(txt) as SignupResponse;
        setRes(j);
      } catch {
        setRes({ ok: false, reasonCode: 'NON_JSON_RESPONSE', message: `HTTP ${r.status}` });
      }
    } catch (err) {
      setRes({ ok: false, reasonCode: 'NETWORK_ERROR', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function onCopyKey() {
    const ok = await copyToClipboard(apiKey);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="pz-shell pz-shell--mono pz-shell--scroll">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container" style={{ paddingTop: 14, paddingBottom: 18 }}>
        <div className="pz-topline">
          <div className="pz-kicker">Phoenix Zero</div>
          <div className="pz-rule" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(22px, 3.4vw, 34px)', lineHeight: 1.15 }}>Get a PPE API key</h1>
          <Link href="/ppe" className="pz-btn" style={{ textDecoration: 'none', opacity: 0.85 }}>
            Back
          </Link>
        </div>

        <p style={{ marginTop: 10, marginBottom: 14, color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.6, maxWidth: 860 }}>
          This creates a tenant API key for the Pay-per-execution API via <code>/api/public/agent-signup</code>. This is separate from the global pricing/observation flows.
        </p>

        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '0 auto', display: 'grid', gap: 12 }}>
          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div className="pz-field-label">Name</div>
                <input className="pz-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Agent" />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div className="pz-field-label">Email</div>
                <input className="pz-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="my-agent@example.com" />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div className="pz-field-label">Agent type</div>
                <input className="pz-input" value={agentType} onChange={(e) => setAgentType(e.target.value)} placeholder="buyer" />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div className="pz-field-label">Intended use</div>
                <input className="pz-input" value={intendedUse} onChange={(e) => setIntendedUse(e.target.value)} placeholder="autonomous agent integration" />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div className="pz-field-label">Currency</div>
                <select className="pz-input" value={currency} onChange={(e) => setCurrency(e.target.value as any)}>
                  <option value="USD">USD</option>
                  <option value="BRL">BRL</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', paddingTop: 4 }}>
              <button type="submit" className="pz-btn" disabled={busy}>
                {busy ? 'Creating…' : 'Create API key'}
              </button>

              <Link href="/api/docs/agent-integration-contract" target="_blank" className="pz-btn" style={{ textDecoration: 'none', opacity: 0.85 }}>
                Agent Integration Contract
              </Link>
            </div>
          </form>

          {apiKey ? (
            <div style={{ display: 'grid', gap: 8, paddingTop: 6 }}>
              <div className="pz-field-label">Your tenant API key</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: '1 1 480px', minWidth: 260, maxWidth: '100%', overflowX: 'auto' }}>
                  <code style={{ color: 'rgba(255,255,255,0.92)', wordBreak: 'break-all', overflowWrap: 'anywhere' }}>{apiKey}</code>
                </div>
                <button type="button" className="pz-btn" onClick={onCopyKey} style={{ opacity: 0.9 }}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 1.6 }}>
                Use this as header <code>x-api-key</code> for <code>/api/checkout/create</code>, <code>/api/checkout/status</code>, and <code>/api/agents/&lt;agentId&gt;/execute</code>.
              </div>
            </div>
          ) : null}

          {raw ? (
            <details>
              <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 700 }}>Raw response</summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#0b1020', color: '#e5e7eb', padding: 14, borderRadius: 12, marginTop: 10 }}>
                {raw}
              </pre>
            </details>
          ) : null}
        </section>
      </div>
    </main>
  );
}
