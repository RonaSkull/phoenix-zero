'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';

type JsonResponse = { status: number; ok: boolean; text: string; json: any | null };

type TenantCreateResponse =
  | {
      ok: true;
      tenant: any;
      apiKey: string;
      sessionToken: string;
      sessionExpiresAt: string;
      redeemUrl: string;
    }
  | { ok: false; reason: string };

type QuoteResponse =
  | { ok: true; currency: string; finalPriceCents: number; scope: Record<string, any> }
  | { ok: false; reason?: string };

type TenantsListResponse =
  | { ok: true; tenants: any[] }
  | { ok: false; reason?: string };

type PricingSimResponse =
  | {
      ok: true;
      currency: string;
      unitPriceCents: number;
      pil?: { units?: number; durationSeconds?: number };
      consequence?: { monthlyCostCents?: number };
      volume?: { monthlyProtectionSpendCents?: number; monthlyLossAvoidedCents?: number };
      flags?: Record<string, any>;
      scope?: Record<string, any>;
      breakdown?: Record<string, any>;
    }
  | { ok: false; reason?: string };

async function readJson(res: Response): Promise<JsonResponse> {
  const status = res.status;
  const ok = res.ok;
  const text = await res.text();
  try {
    const json = text ? JSON.parse(text) : null;
    return { status, ok, text, json };
  } catch {
    return { status, ok, text, json: null };
  }
}

function adminHeaders(adminToken: string): Record<string, string> {
  const t = (adminToken || '').trim();
  if (!t) return {};
  return { 'x-admin-token': t };
}

function fmtMoney(cents: number): string {
  if (!Number.isFinite(cents)) return '0.00';
  return (Math.trunc(cents) / 100).toFixed(2);
}

export default function PricingWizardPage() {
  const [origin, setOrigin] = useState('');

  const [adminToken, setAdminToken] = useState('');
  const [pricingProfileId, setPricingProfileId] = useState('default');
  const [commissionProfileId, setCommissionProfileId] = useState('default');
  const [taxProfileId, setTaxProfileId] = useState('default');

  const [tenantName, setTenantName] = useState('pricing-test-tenant');
  const [tenantClientType, setTenantClientType] = useState('business');
  const [tenantSector, setTenantSector] = useState('unknown');
  const [tenantCountry, setTenantCountry] = useState('br');
  const [tenantCurrency, setTenantCurrency] = useState('USD');

  const [apiKey, setApiKey] = useState('');
  const [redeemUrl, setRedeemUrl] = useState('');

  const [operation, setOperation] = useState('verify_by_url');
  const [quoteAgentId, setQuoteAgentId] = useState('');
  const [quoteExecutionClassId, setQuoteExecutionClassId] = useState('');
  const [quoteContract, setQuoteContract] = useState<any | null>(null);
  const [quoteClientType, setQuoteClientType] = useState('');
  const [quoteSector, setQuoteSector] = useState('');
  const [quoteCountry, setQuoteCountry] = useState('');
  const [quoteCurrency, setQuoteCurrency] = useState('');

  const [tenants, setTenants] = useState<any[]>([]);
  const [tenantsResultRaw, setTenantsResultRaw] = useState('');

  const [simTenantId, setSimTenantId] = useState('');
  const [simProduct, setSimProduct] = useState('video_protection');
  const [simSourceVector, setSimSourceVector] = useState('');
  const [simExposure, setSimExposure] = useState('public');
  const [simPersistence, setSimPersistence] = useState('medium');
  const [simGuaranteeWindow, setSimGuaranteeWindow] = useState('');
  const [simAuthenticity, setSimAuthenticity] = useState('commercial');
  const [simPlan, setSimPlan] = useState('');
  const [simUnits, setSimUnits] = useState('1');
  const [simDurationSeconds, setSimDurationSeconds] = useState('0');
  const [simSizeBytes, setSimSizeBytes] = useState('0');
  const [simPages, setSimPages] = useState('0');
  const [simVolumePerMonth, setSimVolumePerMonth] = useState('0');
  const [simRiskScoreOverride, setSimRiskScoreOverride] = useState('');

  const [simBusy, setSimBusy] = useState(false);
  const [simResultRaw, setSimResultRaw] = useState('');

  const [busy, setBusy] = useState<string | null>(null);
  const [adminResultRaw, setAdminResultRaw] = useState('');
  const [tenantResultRaw, setTenantResultRaw] = useState('');
  const [quoteResultRaw, setQuoteResultRaw] = useState('');

  const quoteParsed = useMemo(() => {
    try {
      if (!quoteResultRaw.trim()) return null;
      return JSON.parse(quoteResultRaw) as QuoteResponse;
    } catch {
      return null;
    }
  }, [quoteResultRaw]);

  const simParsed = useMemo(() => {
    try {
      if (!simResultRaw.trim()) return null;
      return JSON.parse(simResultRaw) as PricingSimResponse;
    } catch {
      return null;
    }
  }, [simResultRaw]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    try {
      const storedApiKey = (localStorage.getItem('pz_pricing_wizard_api_key') || '').trim();
      const storedAdminToken = (localStorage.getItem('pz_pricing_wizard_admin_token') || '').trim();
      const storedQuoteAgentId = (localStorage.getItem('pz_pricing_wizard_quote_agent_id') || '').trim();
      const storedQuoteExecutionClassId = (localStorage.getItem('pz_pricing_wizard_quote_execution_class_id') || '').trim();
      if (storedApiKey) setApiKey(storedApiKey);
      if (storedAdminToken) setAdminToken(storedAdminToken);
      if (storedQuoteAgentId) setQuoteAgentId(storedQuoteAgentId);
      if (storedQuoteExecutionClassId) setQuoteExecutionClassId(storedQuoteExecutionClassId);
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      if (apiKey.trim()) localStorage.setItem('pz_pricing_wizard_api_key', apiKey.trim());
    } catch {
    }
  }, [apiKey]);

  useEffect(() => {
    try {
      if (quoteAgentId.trim()) localStorage.setItem('pz_pricing_wizard_quote_agent_id', quoteAgentId.trim());
    } catch {
    }
  }, [quoteAgentId]);

  useEffect(() => {
    try {
      if (quoteExecutionClassId.trim()) {
        localStorage.setItem('pz_pricing_wizard_quote_execution_class_id', quoteExecutionClassId.trim());
      }
    } catch {
    }
  }, [quoteExecutionClassId]);

  const quoteExecutionClasses = useMemo(() => {
    const list = quoteContract && quoteContract.ok === true && quoteContract.contract ? quoteContract.contract.executionClasses : null;
    if (!Array.isArray(list)) return [];
    return list
      .map((c: any) => String(c?.classId || '').trim())
      .filter((s: string) => Boolean(s));
  }, [quoteContract]);

  useEffect(() => {
    if (!apiKey.trim() || !quoteAgentId.trim()) {
      setQuoteContract(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pricing/contract?agentId=${encodeURIComponent(quoteAgentId.trim())}`, {
          headers: { 'x-api-key': apiKey.trim() },
          cache: 'no-store'
        });
        const j = await readJson(res);
        setQuoteContract(j.json || null);
      } catch {
        setQuoteContract(null);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [apiKey, quoteAgentId]);

  useEffect(() => {
    if (quoteExecutionClassId.trim()) return;
    if (!quoteContract || quoteContract.ok !== true || !quoteContract.contract) return;
    const def = String(quoteContract.contract.defaultExecutionClassId || '').trim();
    const first = quoteExecutionClasses.length > 0 ? quoteExecutionClasses[0] : '';
    const next = def || first;
    if (next) setQuoteExecutionClassId(next);
  }, [quoteContract, quoteExecutionClassId, quoteExecutionClasses]);

  useEffect(() => {
    try {
      if (adminToken.trim()) localStorage.setItem('pz_pricing_wizard_admin_token', adminToken.trim());
    } catch {
    }
  }, [adminToken]);

  useEffect(() => {
    let alive = true;
    async function fetchTenants() {
      try {
        const headers = adminHeaders(adminToken);
        const res = await fetch('/api/admin/tenants', { headers, cache: 'no-store' });
        const j = await readJson(res);
        if (!alive) return;
        setTenantsResultRaw(j.text || JSON.stringify(j.json, null, 2));
        const parsed = (j.json || null) as TenantsListResponse | null;
        if (parsed && parsed.ok === true && Array.isArray((parsed as any).tenants)) {
          const list = (parsed as any).tenants as any[];
          setTenants(list);
          if (!simTenantId && list.length > 0) {
            setSimTenantId(String(list[0]?.tenantId || '').trim());
          }
        }
      } catch (e) {
        if (!alive) return;
        setTenantsResultRaw(JSON.stringify({ ok: false, reason: e instanceof Error ? e.message : String(e) }, null, 2));
      }
    }

    void fetchTenants();
    return () => {
      alive = false;
    };
  }, [adminToken, simTenantId]);

  useEffect(() => {
    if (!simTenantId.trim()) return;
    const t = setTimeout(async () => {
      setSimBusy(true);
      try {
        const payload: Record<string, any> = {
          tenantId: simTenantId.trim(),
          product: simProduct.trim(),
          exposure: simExposure.trim(),
          persistence: simPersistence.trim(),
          guaranteeWindow: simGuaranteeWindow.trim() || 'unknown',
          authenticityLevel: simAuthenticity.trim(),
          units: Number(simUnits || '1'),
          durationSeconds: Number(simDurationSeconds || '0'),
          sizeBytes: Number(simSizeBytes || '0'),
          pages: Number(simPages || '0'),
          volumePerMonth: Number(simVolumePerMonth || '0')
        };
        if (simSourceVector.trim()) payload.sourceVector = simSourceVector.trim();
        if (simPlan.trim()) payload.plan = simPlan.trim();
        if (simRiskScoreOverride.trim()) payload.riskScoreOverride = Number(simRiskScoreOverride.trim());

        const headers = adminHeaders(adminToken);
        const res = await fetch('/api/pricing/simulate', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify(payload)
        });
        const j = await readJson(res);
        setSimResultRaw(j.text || JSON.stringify(j.json, null, 2));
      } catch (e) {
        setSimResultRaw(JSON.stringify({ ok: false, reason: e instanceof Error ? e.message : String(e) }, null, 2));
      } finally {
        setSimBusy(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [
    adminToken,
    simAuthenticity,
    simDurationSeconds,
    simExposure,
    simGuaranteeWindow,
    simPages,
    simPersistence,
    simPlan,
    simProduct,
    simRiskScoreOverride,
    simSizeBytes,
    simSourceVector,
    simTenantId,
    simUnits,
    simVolumePerMonth
  ]);

  const curlQuote = useMemo(() => {
    if (!origin) return '(aguardando pagina carregar...)';
    const body: Record<string, any> = { operation: operation.trim() };
    if (quoteAgentId.trim()) body.agentId = quoteAgentId.trim();
    if (quoteExecutionClassId.trim()) body.executionClassId = quoteExecutionClassId.trim();
    if (quoteClientType.trim()) body.clientType = quoteClientType.trim();
    if (quoteSector.trim()) body.sector = quoteSector.trim();
    if (quoteCountry.trim()) body.country = quoteCountry.trim();
    if (quoteCurrency.trim()) body.currency = quoteCurrency.trim();
    return `curl -s \
  -X POST "${origin}/api/pricing/quote" \
  -H "content-type: application/json" \
  -H "x-api-key: ${apiKey || 'pz_...'}" \
  --data '${JSON.stringify(body)}'`;
  }, [apiKey, operation, origin, quoteAgentId, quoteExecutionClassId, quoteClientType, quoteCountry, quoteCurrency, quoteSector]);

  async function provisionDefaults() {
    setBusy('provision');
    setAdminResultRaw('');
    try {
      const headers = adminHeaders(adminToken);

      const pricingGet = await fetch(
        `/api/admin/pricing-profiles?id=${encodeURIComponent(pricingProfileId)}&currency=${encodeURIComponent(tenantCurrency)}`,
        { headers, cache: 'no-store' }
      );
      const pricingGetJson = await readJson(pricingGet);
      const pricingProfile = pricingGetJson.json?.profile;
      if (!pricingGet.ok || !pricingProfile) {
        setAdminResultRaw(
          pricingGetJson.text ||
            JSON.stringify(pricingGetJson.json || { ok: false, reason: `HTTP ${pricingGetJson.status}` }, null, 2)
        );
        return;
      }
      pricingProfile.id = (pricingProfileId || 'default').trim() || 'default';
      pricingProfile.currency = (tenantCurrency || 'USD').trim() || 'USD';

      const commissionGet = await fetch(`/api/admin/commission-profiles?id=${encodeURIComponent(commissionProfileId)}`,
        { headers, cache: 'no-store' }
      );
      const commissionGetJson = await readJson(commissionGet);
      const commissionProfile = commissionGetJson.json?.profile;
      if (!commissionGet.ok || !commissionProfile) {
        setAdminResultRaw(
          commissionGetJson.text ||
            JSON.stringify(commissionGetJson.json || { ok: false, reason: `HTTP ${commissionGetJson.status}` }, null, 2)
        );
        return;
      }
      commissionProfile.id = (commissionProfileId || 'default').trim() || 'default';

      const taxGet = await fetch(`/api/admin/tax-profiles?id=${encodeURIComponent(taxProfileId)}`,
        { headers, cache: 'no-store' }
      );
      const taxGetJson = await readJson(taxGet);
      const taxProfile = taxGetJson.json?.profile;
      if (!taxGet.ok || !taxProfile) {
        setAdminResultRaw(
          taxGetJson.text || JSON.stringify(taxGetJson.json || { ok: false, reason: `HTTP ${taxGetJson.status}` }, null, 2)
        );
        return;
      }
      taxProfile.id = (taxProfileId || 'default').trim() || 'default';

      const pricingPost = await fetch('/api/admin/pricing-profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(pricingProfile)
      });
      const pricingPostJson = await readJson(pricingPost);
      if (!pricingPost.ok) {
        setAdminResultRaw(
          pricingPostJson.text ||
            JSON.stringify(pricingPostJson.json || { ok: false, reason: `HTTP ${pricingPostJson.status}` }, null, 2)
        );
        return;
      }

      const commissionPost = await fetch('/api/admin/commission-profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(commissionProfile)
      });
      const commissionPostJson = await readJson(commissionPost);
      if (!commissionPost.ok) {
        setAdminResultRaw(
          commissionPostJson.text ||
            JSON.stringify(commissionPostJson.json || { ok: false, reason: `HTTP ${commissionPostJson.status}` }, null, 2)
        );
        return;
      }

      const taxPost = await fetch('/api/admin/tax-profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(taxProfile)
      });
      const taxPostJson = await readJson(taxPost);
      if (!taxPost.ok) {
        setAdminResultRaw(
          taxPostJson.text ||
            JSON.stringify(taxPostJson.json || { ok: false, reason: `HTTP ${taxPostJson.status}` }, null, 2)
        );
        return;
      }

      setAdminResultRaw(JSON.stringify({ ok: true, pricing: pricingProfile.id, commission: commissionProfile.id, tax: taxProfile.id }, null, 2));
    } catch (e) {
      setAdminResultRaw(JSON.stringify({ ok: false, reason: e instanceof Error ? e.message : String(e) }, null, 2));
    } finally {
      setBusy(null);
    }
  }

  async function createTenantNow() {
    setBusy('tenant');
    setTenantResultRaw('');
    try {
      const headers = adminHeaders(adminToken);
      const body = {
        name: tenantName.trim(),
        clientType: tenantClientType.trim() || 'unknown',
        sector: tenantSector.trim() || 'unknown',
        country: tenantCountry.trim() || 'unknown',
        currency: tenantCurrency.trim() || 'USD',
        pricingProfile: (pricingProfileId || 'default').trim() || 'default',
        commissionProfile: (commissionProfileId || 'default').trim() || 'default',
        taxProfile: (taxProfileId || 'default').trim() || 'default',
        next: '/pricing-admin'
      };

      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body)
      });
      const j = await readJson(res);
      setTenantResultRaw(j.text || JSON.stringify(j.json, null, 2));

      const parsed = (j.json || null) as TenantCreateResponse | null;
      if (parsed && parsed.ok === true) {
        setApiKey(parsed.apiKey);
        setRedeemUrl(parsed.redeemUrl);
      }
    } catch (e) {
      setTenantResultRaw(JSON.stringify({ ok: false, reason: e instanceof Error ? e.message : String(e) }, null, 2));
    } finally {
      setBusy(null);
    }
  }

  async function runQuote() {
    setBusy('quote');
    setQuoteResultRaw('');
    try {
      const body: Record<string, any> = { operation: operation.trim() };
      if (quoteAgentId.trim()) body.agentId = quoteAgentId.trim();
      if (quoteExecutionClassId.trim()) body.executionClassId = quoteExecutionClassId.trim();
      if (quoteClientType.trim()) body.clientType = quoteClientType.trim();
      if (quoteSector.trim()) body.sector = quoteSector.trim();
      if (quoteCountry.trim()) body.country = quoteCountry.trim();
      if (quoteCurrency.trim()) body.currency = quoteCurrency.trim();

      const res = await fetch('/api/pricing/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey.trim() },
        body: JSON.stringify(body)
      });
      const j = await readJson(res);
      setQuoteResultRaw(j.text || JSON.stringify(j.json, null, 2));
    } catch (e) {
      setQuoteResultRaw(JSON.stringify({ ok: false, reason: e instanceof Error ? e.message : String(e) }, null, 2));
    } finally {
      setBusy(null);
    }
  }

  async function onSubmitQuote(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!apiKey.trim()) return;
    if (!operation.trim()) return;
    await runQuote();
  }

  return (
    <main className="pz-shell pz-shell--mono pz-shell--scroll">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container">
        <div className="pz-topline">
          <div className="pz-kicker">Phoenix Zero</div>
          <div className="pz-rule" />
        </div>
        <div className="pz-subtitle">Pricing Admin</div>

        <div className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '0 auto', display: 'grid', gap: 16 }}>
          <div className="pz-card--subtle" style={{ display: 'grid', gap: 10 }}>
            <div className="pz-field-label">1) Admin (opcional): provisionar perfis</div>
            <div style={{ color: '#8FA0BF', fontSize: 13, lineHeight: 1.45 }}>
              Se <code>PHOENIX_ZERO_ADMIN_TOKEN</code> estiver setado, cole o token aqui. Se nao estiver, pode deixar vazio (dev).
            </div>

            <div className="pz-field">
              <label className="pz-field-label">Admin token (x-admin-token)</label>
              <input className="pz-input" value={adminToken} onChange={(e) => setAdminToken(e.target.value)} placeholder="pz_admin_..." />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="pz-field">
                <label className="pz-field-label">pricingProfileId</label>
                <input className="pz-input" value={pricingProfileId} onChange={(e) => setPricingProfileId(e.target.value)} />
              </div>
              <div className="pz-field">
                <label className="pz-field-label">commissionProfileId</label>
                <input className="pz-input" value={commissionProfileId} onChange={(e) => setCommissionProfileId(e.target.value)} />
              </div>
              <div className="pz-field">
                <label className="pz-field-label">taxProfileId</label>
                <input className="pz-input" value={taxProfileId} onChange={(e) => setTaxProfileId(e.target.value)} />
              </div>
            </div>

            <div className="pz-field">
              <label className="pz-field-label">currency (para pricing profile)</label>
              <input className="pz-input" value={tenantCurrency} onChange={(e) => setTenantCurrency(e.target.value)} placeholder="USD" />
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={provisionDefaults}
                disabled={busy !== null}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: busy ? 'rgba(255,255,255,0.08)' : 'rgba(0,255,200,0.12)',
                  color: '#E7ECF5',
                  cursor: busy ? 'not-allowed' : 'pointer'
                }}
              >
                {busy === 'provision' ? 'Provisionando…' : 'Provisionar defaults'}
              </button>
              <div style={{ color: '#8FA0BF', fontSize: 12 }}>Cria/atualiza perfis com base nos defaults internos.</div>
            </div>

            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{adminResultRaw || '(sem saida ainda)'}</pre>
          </div>

          <div className="pz-card--subtle" style={{ display: 'grid', gap: 10 }}>
            <div className="pz-field-label">2) Criar tenant de teste</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <div className="pz-field">
                <label className="pz-field-label">name</label>
                <input className="pz-input" value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
              </div>
              <div className="pz-field">
                <label className="pz-field-label">clientType</label>
                <input
                  className="pz-input"
                  value={tenantClientType}
                  onChange={(e) => setTenantClientType(e.target.value)}
                  placeholder="business"
                />
              </div>
              <div className="pz-field">
                <label className="pz-field-label">sector</label>
                <input className="pz-input" value={tenantSector} onChange={(e) => setTenantSector(e.target.value)} placeholder="unknown" />
              </div>
              <div className="pz-field">
                <label className="pz-field-label">country</label>
                <input className="pz-input" value={tenantCountry} onChange={(e) => setTenantCountry(e.target.value)} placeholder="br" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={createTenantNow}
                disabled={busy !== null || !tenantName.trim()}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: busy ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)',
                  color: '#E7ECF5',
                  cursor: busy ? 'not-allowed' : 'pointer'
                }}
              >
                {busy === 'tenant' ? 'Criando…' : 'Criar tenant'}
              </button>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div className="pz-field">
                <label className="pz-field-label">Tenant API Key (x-api-key)</label>
                <input className="pz-input" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="pz_..." />
              </div>
              {redeemUrl ? (
                <div style={{ color: '#8FA0BF', fontSize: 13, lineHeight: 1.45 }}>
                  redeemUrl:{' '}
                  <a className="pz-link" href={redeemUrl} target="_blank" rel="noreferrer">
                    abrir
                  </a>
                  {' · '}
                  pricing-lab:{' '}
                  <a className="pz-link" href={`/pricing-lab?apiKey=${encodeURIComponent(apiKey)}`} target="_blank" rel="noreferrer">
                    abrir
                  </a>
                </div>
              ) : null}
            </div>

            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{tenantResultRaw || '(sem saida ainda)'}</pre>
          </div>

          <div className="pz-card--subtle" style={{ display: 'grid', gap: 10 }}>
            <div className="pz-field-label">3) Cliente: pedir quote</div>
            <div style={{ color: '#8FA0BF', fontSize: 13, lineHeight: 1.45 }}>Esse endpoint usa <b>x-api-key</b> (tenant). Nao usa admin token.</div>

            <form onSubmit={onSubmitQuote} style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="pz-field">
                  <label className="pz-field-label">agentId (opcional)</label>
                  <input className="pz-input" value={quoteAgentId} onChange={(e) => setQuoteAgentId(e.target.value)} placeholder="ag_..." />
                </div>
                <div className="pz-field">
                  <label className="pz-field-label">executionClassId (opcional)</label>
                  {quoteExecutionClasses.length > 0 ? (
                    <select
                      className="pz-input"
                      value={quoteExecutionClassId}
                      onChange={(e) => setQuoteExecutionClassId(e.target.value)}
                    >
                      {(quoteExecutionClasses || []).map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="pz-input"
                      value={quoteExecutionClassId}
                      onChange={(e) => setQuoteExecutionClassId(e.target.value)}
                      placeholder="default"
                    />
                  )}
                </div>
              </div>

              <div className="pz-field">
                <label className="pz-field-label">operation</label>
                <input className="pz-input" value={operation} onChange={(e) => setOperation(e.target.value)} placeholder="verify_by_url" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="pz-field">
                  <label className="pz-field-label">clientType (opcional)</label>
                  <input
                    className="pz-input"
                    value={quoteClientType}
                    onChange={(e) => setQuoteClientType(e.target.value)}
                    placeholder="business"
                  />
                </div>
                <div className="pz-field">
                  <label className="pz-field-label">sector (opcional)</label>
                  <input className="pz-input" value={quoteSector} onChange={(e) => setQuoteSector(e.target.value)} placeholder="unknown" />
                </div>
                <div className="pz-field">
                  <label className="pz-field-label">country (opcional)</label>
                  <input className="pz-input" value={quoteCountry} onChange={(e) => setQuoteCountry(e.target.value)} placeholder="br" />
                </div>
                <div className="pz-field">
                  <label className="pz-field-label">currency (opcional)</label>
                  <input className="pz-input" value={quoteCurrency} onChange={(e) => setQuoteCurrency(e.target.value)} placeholder="USD" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="submit"
                  disabled={busy !== null || !apiKey.trim() || !operation.trim()}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: busy ? 'rgba(255,255,255,0.08)' : 'rgba(0,255,200,0.12)',
                    color: '#E7ECF5',
                    cursor: busy ? 'not-allowed' : 'pointer'
                  }}
                >
                  {busy === 'quote' ? 'Calculando…' : 'Calcular preco'}
                </button>
                <div style={{ color: '#8FA0BF', fontSize: 12 }}>Enter envia o formulario.</div>
              </div>

              {quoteParsed && quoteParsed.ok === true ? (
                <div style={{ fontWeight: 900, fontSize: 18 }}>
                  Total: {quoteParsed.currency} {fmtMoney(Number(quoteParsed.finalPriceCents))}
                </div>
              ) : null}

              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{quoteResultRaw || '(sem saida ainda)'}</pre>

              <div style={{ display: 'grid', gap: 8 }}>
                <div className="pz-field-label">cURL (debug)</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{curlQuote}</pre>
              </div>
            </form>
          </div>

          <div className="pz-card--subtle" style={{ display: 'grid', gap: 10 }}>
            <div className="pz-field-label">4) Admin: Pricing Simulator</div>
            <div style={{ color: '#8FA0BF', fontSize: 13, lineHeight: 1.45 }}>
              Atualiza automaticamente. Usa <b>x-admin-token</b> (se configurado) e nao grava ledger.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
              <div className="pz-field">
                <label className="pz-field-label">tenant</label>
                <select className="pz-input" value={simTenantId} onChange={(e) => setSimTenantId(e.target.value)}>
                  {(tenants || []).map((t) => {
                    const id = String(t?.tenantId || '').trim();
                    const name = String(t?.name || '').trim();
                    return (
                      <option key={id} value={id}>
                        {name ? `${name} (${id})` : id}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="pz-field">
                <label className="pz-field-label">product</label>
                <select className="pz-input" value={simProduct} onChange={(e) => setSimProduct(e.target.value)}>
                  <option value="video_protection">video</option>
                  <option value="image_protection">image</option>
                  <option value="audio_protection">audio</option>
                  <option value="live_protection">live</option>
                  <option value="document_protection">document</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="pz-field">
                <label className="pz-field-label">exposure</label>
                <select className="pz-input" value={simExposure} onChange={(e) => setSimExposure(e.target.value)}>
                  <option value="private">private</option>
                  <option value="public">public</option>
                  <option value="paid">paid</option>
                  <option value="mass">mass</option>
                  <option value="viral">viral</option>
                </select>
              </div>

              <div className="pz-field">
                <label className="pz-field-label">persistence</label>
                <select className="pz-input" value={simPersistence} onChange={(e) => setSimPersistence(e.target.value)}>
                  <option value="short">short</option>
                  <option value="medium">medium</option>
                  <option value="long">long</option>
                  <option value="permanent">permanent</option>
                </select>
              </div>

              <div className="pz-field">
                <label className="pz-field-label">authenticityLevel</label>
                <select className="pz-input" value={simAuthenticity} onChange={(e) => setSimAuthenticity(e.target.value)}>
                  <option value="social">social</option>
                  <option value="commercial">commercial</option>
                  <option value="legal">legal</option>
                  <option value="forensic">forensic</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="pz-field">
                <label className="pz-field-label">sourceVector (opcional)</label>
                <select className="pz-input" value={simSourceVector} onChange={(e) => setSimSourceVector(e.target.value)}>
                  <option value="">(auto)</option>
                  <option value="RECORDED">RECORDED</option>
                  <option value="LIVE">LIVE</option>
                  <option value="HYBRID">HYBRID</option>
                </select>
              </div>

              <div className="pz-field">
                <label className="pz-field-label">guaranteeWindow (opcional)</label>
                <input
                  className="pz-input"
                  value={simGuaranteeWindow}
                  onChange={(e) => setSimGuaranteeWindow(e.target.value)}
                  placeholder="unknown"
                />
              </div>

              <div className="pz-field">
                <label className="pz-field-label">plan (opcional)</label>
                <select className="pz-input" value={simPlan} onChange={(e) => setSimPlan(e.target.value)}>
                  <option value="">(recomendado)</option>
                  <option value="starter">starter</option>
                  <option value="pro">pro</option>
                  <option value="enterprise">enterprise</option>
                </select>
              </div>

              <div className="pz-field">
                <label className="pz-field-label">units</label>
                <input className="pz-input" value={simUnits} onChange={(e) => setSimUnits(e.target.value)} inputMode="numeric" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="pz-field">
                <label className="pz-field-label">durationSeconds</label>
                <input
                  className="pz-input"
                  value={simDurationSeconds}
                  onChange={(e) => setSimDurationSeconds(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div className="pz-field">
                <label className="pz-field-label">sizeBytes</label>
                <input className="pz-input" value={simSizeBytes} onChange={(e) => setSimSizeBytes(e.target.value)} inputMode="numeric" />
              </div>
              <div className="pz-field">
                <label className="pz-field-label">pages</label>
                <input className="pz-input" value={simPages} onChange={(e) => setSimPages(e.target.value)} inputMode="numeric" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="pz-field">
                <label className="pz-field-label">volumePerMonth</label>
                <input
                  className="pz-input"
                  value={simVolumePerMonth}
                  onChange={(e) => setSimVolumePerMonth(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div className="pz-field">
                <label className="pz-field-label">riskScoreOverride (opcional)</label>
                <input
                  className="pz-input"
                  value={simRiskScoreOverride}
                  onChange={(e) => setSimRiskScoreOverride(e.target.value)}
                  inputMode="numeric"
                  placeholder="(auto)"
                />
              </div>
            </div>

            {simParsed && simParsed.ok === true ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontWeight: 900, fontSize: 18 }}>
                  Unit price: {String(simParsed.currency)} {fmtMoney(Number(simParsed.unitPriceCents))}
                </div>
                <div style={{ color: '#8FA0BF', fontSize: 13, lineHeight: 1.45 }}>
                  PIL: {Number(simParsed.pil?.units || 0)} · Monthly cost of inaction: {String(simParsed.currency)}{' '}
                  {fmtMoney(Number(simParsed.consequence?.monthlyCostCents || 0))}
                </div>
                <div style={{ color: '#8FA0BF', fontSize: 13, lineHeight: 1.45 }}>
                  Monthly protection spend: {String(simParsed.currency)} {fmtMoney(Number(simParsed.volume?.monthlyProtectionSpendCents || 0))} · Net
                  loss avoided: {String(simParsed.currency)} {fmtMoney(Number(simParsed.volume?.monthlyLossAvoidedCents || 0))}
                </div>
                {simParsed.flags && simParsed.flags.negativeLossAvoided ? (
                  <div style={{ color: '#D7B58D', fontSize: 13, lineHeight: 1.45 }}>
                    Aviso: pela heuristica atual, o gasto mensal de protecao excede o custo estimado de inacao.
                  </div>
                ) : null}
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ color: '#8FA0BF', fontSize: 12 }}>{simBusy ? 'Atualizando…' : 'Idle'}</div>
              <div style={{ color: '#8FA0BF', fontSize: 12 }}>tenants: {tenants.length || 0}</div>
            </div>

            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{simResultRaw || '(sem saida ainda)'}</pre>

            <details>
              <summary style={{ cursor: 'pointer', color: '#8FA0BF' }}>debug: tenants</summary>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{tenantsResultRaw || '(sem saida ainda)'}</pre>
            </details>
          </div>

          <div style={{ color: '#8FA0BF', fontSize: 13, lineHeight: 1.45 }}>
            Dica: se estiver vendo 404 em <code>/_next/static/*</code>, reinicie o dev server depois de mudar o <code>next.config.js</code>.
          </div>
        </div>
      </div>
    </main>
  );
}
