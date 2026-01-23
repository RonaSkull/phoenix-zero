'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';

type QuoteResponse =
  | { ok: true; currency: string; finalPriceCents: number; scope: Record<string, any> }
  | { ok: false; reason?: string };

export default function PricingLabPage() {
  const [apiKey, setApiKey] = useState('');
  const [operation, setOperation] = useState('verify_by_url');
  const [product, setProduct] = useState('');
  const [clientType, setClientType] = useState('');
  const [sector, setSector] = useState('');
  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState('');

  const [guaranteeWindow, setGuaranteeWindow] = useState('');

  const [units, setUnits] = useState(1);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [sizeBytes, setSizeBytes] = useState(0);
  const [pages, setPages] = useState(0);

  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const fromQuery = (u.searchParams.get('apiKey') || '').trim();
      const fromStorage = (localStorage.getItem('pz_pricing_lab_api_key') || '').trim();
      if (fromQuery) setApiKey(fromQuery);
      else if (fromStorage) setApiKey(fromStorage);
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      if (apiKey.trim()) localStorage.setItem('pz_pricing_lab_api_key', apiKey.trim());
    } catch {
    }
  }, [apiKey]);

  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState<QuoteResponse | null>(null);
  const [lastRaw, setLastRaw] = useState<string>('');

  const curlHint = useMemo(() => {
    const body: Record<string, any> = { operation };
    if (product.trim()) body.product = product.trim();
    if (clientType.trim()) body.clientType = clientType.trim();
    if (sector.trim()) body.sector = sector.trim();
    if (country.trim()) body.country = country.trim();
    if (currency.trim()) body.currency = currency.trim();
    if (guaranteeWindow.trim()) body.guaranteeWindow = guaranteeWindow.trim();
    if (Number.isFinite(units ?? NaN)) body.units = Math.max(1, Math.trunc(units));
    if (Number.isFinite(durationSeconds ?? NaN) && Math.trunc(durationSeconds) > 0) body.durationSeconds = Math.trunc(durationSeconds);
    if (Number.isFinite(sizeBytes ?? NaN) && Math.trunc(sizeBytes) > 0) body.sizeBytes = Math.trunc(sizeBytes);
    if (Number.isFinite(pages ?? NaN) && Math.trunc(pages) > 0) body.pages = Math.trunc(pages);

    const baseUrl = origin ? `${origin}` : '';

    return [
      `curl -X POST "${baseUrl}/api/pricing/quote" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -H "x-api-key: ${apiKey || 'TENANT_API_KEY'}" \\`,
      `  -d '${JSON.stringify(body)}'`
    ].join('\n');
  }, [apiKey, clientType, country, currency, guaranteeWindow, operation, origin, product, units, durationSeconds, sizeBytes, pages, sector]);

  async function runQuote() {
    setLoading(true);
    setLast(null);
    setLastRaw('');
    try {
      const res = await fetch('/api/pricing/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey.trim() ? { 'x-api-key': apiKey.trim() } : {})
        },
        body: JSON.stringify({
          operation: operation.trim(),
          product: product.trim() || undefined,
          clientType: clientType.trim() || undefined,
          sector: sector.trim() || undefined,
          country: country.trim() || undefined,
          currency: currency.trim() || undefined,
          guaranteeWindow: guaranteeWindow.trim() || undefined,
          units: Number.isFinite(units ?? NaN) ? Math.max(1, Math.trunc(units)) : undefined,
          durationSeconds: Number.isFinite(durationSeconds ?? NaN) ? Math.max(0, Math.trunc(durationSeconds)) : undefined,
          sizeBytes: Number.isFinite(sizeBytes ?? NaN) ? Math.max(0, Math.trunc(sizeBytes)) : undefined,
          pages: Number.isFinite(pages ?? NaN) ? Math.max(0, Math.trunc(pages)) : undefined
        })
      });

      const txt = await res.text();
      setLastRaw(txt);
      try {
        setLast(JSON.parse(txt));
      } catch {
        setLast({ ok: false, reason: `HTTP ${res.status}: Non-JSON response` });
      }
    } catch (e) {
      setLast({ ok: false, reason: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!operation.trim()) return;
    await runQuote();
  }

  return (
    <main className="pz-shell pz-shell--mono">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container">
        <div className="pz-topline">
          <div className="pz-kicker">Phoenix Zero</div>
          <div className="pz-rule" />
        </div>
        <div className="pz-subtitle">Pricing Lab (debug)</div>

        <div className="pz-card" style={{ maxWidth: 920, width: '100%', margin: '0 auto' }}>
          <div style={{ color: '#8FA0BF', fontSize: 13, lineHeight: 1.45 }}>
            Use uma <b>Tenant API Key</b> (começa com <code>pz_</code>). <b>NAO</b> use o admin token (<code>pz_admin_</code>).
          </div>

          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <div className="pz-field">
              <label className="pz-field-label">Tenant API Key (x-api-key)</label>
              <input
                className="pz-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="pz_..."
              />
            </div>

            <div className="pz-field">
              <label className="pz-field-label">operation</label>
              <input
                className="pz-input"
                value={operation}
                onChange={(e) => setOperation(e.target.value)}
                placeholder="verify_by_url"
              />
              <div style={{ fontSize: 12, color: '#8FA0BF' }}>
                Exemplos: verify_by_url, share_link_create, time_anchor_create, verify_image_by_url
              </div>
            </div>

            <div className="pz-field">
              <label className="pz-field-label">product (opcional)</label>
              <input
                className="pz-input"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="video_protection"
              />
              <div style={{ fontSize: 12, color: '#8FA0BF' }}>
                Exemplos: video_protection, live_protection, image_protection, document_protection
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="pz-field">
                <label className="pz-field-label">clientType (opcional)</label>
                <input
                  className="pz-input"
                  value={clientType}
                  onChange={(e) => setClientType(e.target.value)}
                  placeholder="business"
                />
              </div>
              <div className="pz-field">
                <label className="pz-field-label">sector (opcional)</label>
                <input
                  className="pz-input"
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  placeholder="unknown"
                />
              </div>
              <div className="pz-field">
                <label className="pz-field-label">country (opcional)</label>
                <input
                  className="pz-input"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="br"
                />
              </div>
              <div className="pz-field">
                <label className="pz-field-label">currency (opcional)</label>
                <input
                  className="pz-input"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  placeholder="USD"
                />
              </div>
            </div>

            <div className="pz-field">
              <label className="pz-field-label">guaranteeWindow (opcional)</label>
              <input
                className="pz-input"
                value={guaranteeWindow}
                onChange={(e) => setGuaranteeWindow(e.target.value)}
                placeholder="unknown"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="pz-field">
                <label className="pz-field-label">units (opcional)</label>
                <input
                  className="pz-input"
                  inputMode="numeric"
                  value={String(units)}
                  onChange={(e) => {
                    const n = Math.trunc(Number(e.target.value || '0'));
                    setUnits(Number.isFinite(n) ? Math.max(1, n) : 1);
                  }}
                  placeholder="1"
                />
              </div>
              <div className="pz-field">
                <label className="pz-field-label">durationSeconds (opcional)</label>
                <input
                  className="pz-input"
                  inputMode="numeric"
                  value={String(durationSeconds)}
                  onChange={(e) => {
                    const n = Math.trunc(Number(e.target.value || '0'));
                    setDurationSeconds(Number.isFinite(n) ? Math.max(0, n) : 0);
                  }}
                  placeholder="0"
                />
              </div>
              <div className="pz-field">
                <label className="pz-field-label">sizeBytes (opcional)</label>
                <input
                  className="pz-input"
                  inputMode="numeric"
                  value={String(sizeBytes)}
                  onChange={(e) => {
                    const n = Math.trunc(Number(e.target.value || '0'));
                    setSizeBytes(Number.isFinite(n) ? Math.max(0, n) : 0);
                  }}
                  placeholder="0"
                />
              </div>
              <div className="pz-field">
                <label className="pz-field-label">pages (opcional)</label>
                <input
                  className="pz-input"
                  inputMode="numeric"
                  value={String(pages)}
                  onChange={(e) => {
                    const n = Math.trunc(Number(e.target.value || '0'));
                    setPages(Number.isFinite(n) ? Math.max(0, n) : 0);
                  }}
                  placeholder="0"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="submit"
                disabled={loading || !operation.trim()}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: loading ? 'rgba(255,255,255,0.08)' : 'rgba(0,255,200,0.12)',
                  color: '#E7ECF5',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Calculando…' : 'Calcular preco'}
              </button>
              <div style={{ color: '#8FA0BF', fontSize: 12 }}>Dica: pressione Enter para enviar.</div>
            </div>

            <div className="pz-card--subtle">
              <div className="pz-field-label" style={{ marginBottom: 8 }}>
                Resposta
              </div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{lastRaw || '(sem resposta ainda)'}</pre>
              {last && last.ok === true ? (
                <div style={{ marginTop: 10, fontWeight: 800 }}>
                  Final: {last.currency} {Number(last.finalPriceCents) / 100}
                </div>
              ) : null}
            </div>

            <div className="pz-card--subtle">
              <div className="pz-field-label" style={{ marginBottom: 8 }}>
                cURL (debug)
              </div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{curlHint}</pre>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
