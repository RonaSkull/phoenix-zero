'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type JsonResponse = { status: number; ok: boolean; text: string; json: any | null };

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

export default function OpsAdminPage() {
  const [adminToken, setAdminToken] = useState('');

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [busy, setBusy] = useState(false);
  const [summaryRaw, setSummaryRaw] = useState('');

  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [tenantRaw, setTenantRaw] = useState('');

  const summary = useMemo(() => {
    try {
      if (!summaryRaw.trim()) return null;
      return JSON.parse(summaryRaw);
    } catch {
      return null;
    }
  }, [summaryRaw]);

  useEffect(() => {
    try {
      const stored = (localStorage.getItem('pz_ops_admin_token') || '').trim();
      if (stored) setAdminToken(stored);
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      if (adminToken.trim()) localStorage.setItem('pz_ops_admin_token', adminToken.trim());
    } catch {
    }
  }, [adminToken]);

  const fetchSummary = useCallback(async () => {
    setBusy(true);
    setSummaryRaw('');
    try {
      const qs = new URLSearchParams();
      if (from.trim()) qs.set('from', from.trim());
      if (to.trim()) qs.set('to', to.trim());
      const res = await fetch(`/api/admin/observability/summary?${qs.toString()}`, {
        headers: adminHeaders(adminToken),
        cache: 'no-store'
      });
      const j = await readJson(res);
      setSummaryRaw(j.text || JSON.stringify(j.json, null, 2));

      const tenants = j.json?.tenants;
      if (!selectedTenantId && Array.isArray(tenants) && tenants.length > 0) {
        const firstId = String(tenants[0]?.tenantId || '').trim();
        if (firstId) setSelectedTenantId(firstId);
      }
    } catch (e) {
      setSummaryRaw(JSON.stringify({ ok: false, reason: e instanceof Error ? e.message : String(e) }, null, 2));
    } finally {
      setBusy(false);
    }
  }, [adminToken, from, selectedTenantId, to]);

  const fetchTenant = useCallback(async () => {
    if (!selectedTenantId.trim()) return;
    setBusy(true);
    setTenantRaw('');
    try {
      const qs = new URLSearchParams({ tenantId: selectedTenantId.trim() });
      const res = await fetch(`/api/admin/observability/tenant?${qs.toString()}`, {
        headers: adminHeaders(adminToken),
        cache: 'no-store'
      });
      const j = await readJson(res);
      setTenantRaw(j.text || JSON.stringify(j.json, null, 2));
    } catch (e) {
      setTenantRaw(JSON.stringify({ ok: false, reason: e instanceof Error ? e.message : String(e) }, null, 2));
    } finally {
      setBusy(false);
    }
  }, [adminToken, selectedTenantId]);

  useEffect(() => {
    if (!adminToken.trim()) return;
    void fetchSummary();
  }, [adminToken, fetchSummary]);

  useEffect(() => {
    if (!adminToken.trim() || !selectedTenantId.trim()) return;
    void fetchTenant();
  }, [adminToken, fetchTenant, selectedTenantId]);

  const tenants = Array.isArray(summary?.tenants) ? summary.tenants : [];

  return (
    <main className="pz-shell pz-shell--mono pz-shell--scroll">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container">
        <div className="pz-topline">
          <div className="pz-kicker">Phoenix ZerØ</div>
          <div className="pz-rule" />
        </div>
        <div className="pz-subtitle">Ops Admin</div>

        <div className="pz-card-flat" style={{ maxWidth: 1100, width: '100%', margin: '0 auto', display: 'grid', gap: 16 }}>
          <div className="pz-card--subtle" style={{ display: 'grid', gap: 10 }}>
            <div className="pz-field-label">Admin</div>
            <div className="pz-field">
              <label className="pz-field-label">Admin token (x-admin-token)</label>
              <input className="pz-input" value={adminToken} onChange={(e) => setAdminToken(e.target.value)} placeholder="pz_admin_..." />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="pz-field">
                <label className="pz-field-label">from (YYYY-MM-DD)</label>
                <input className="pz-input" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="2026-02-09" />
              </div>
              <div className="pz-field">
                <label className="pz-field-label">to (YYYY-MM-DD)</label>
                <input className="pz-input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="2026-02-09" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={fetchSummary}
                disabled={busy || !adminToken.trim()}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: busy ? 'rgba(255,255,255,0.08)' : 'rgba(0,255,200,0.12)',
                  color: '#E7ECF5',
                  cursor: busy ? 'not-allowed' : 'pointer'
                }}
              >
                {busy ? 'Carregando…' : 'Atualizar'}
              </button>
            </div>
          </div>

          <div className="pz-card--subtle" style={{ display: 'grid', gap: 10 }}>
            <div className="pz-field-label">Tenants (resumo)</div>

            <div className="pz-field">
              <label className="pz-field-label">tenant (drill-down)</label>
              <select className="pz-input" value={selectedTenantId} onChange={(e) => setSelectedTenantId(e.target.value)}>
                {(tenants || []).map((t: any) => {
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

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                    <th style={{ padding: '8px 6px' }}>tenant</th>
                    <th style={{ padding: '8px 6px' }}>clientType</th>
                    <th style={{ padding: '8px 6px' }}>exec</th>
                    <th style={{ padding: '8px 6px' }}>units(cons)</th>
                    <th style={{ padding: '8px 6px' }}>payments(paid/created)</th>
                  </tr>
                </thead>
                <tbody>
                  {(tenants || []).map((t: any) => (
                    <tr key={String(t.tenantId)} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{String(t.tenantId)}</td>
                      <td style={{ padding: '8px 6px' }}>{String(t.clientType || '')}</td>
                      <td style={{ padding: '8px 6px' }}>{Number(t.executions || 0)}</td>
                      <td style={{ padding: '8px 6px' }}>{Number(t.unitsConsumed || 0)}</td>
                      <td style={{ padding: '8px 6px' }}>
                        {Number(t.paymentsPaid || 0)}/{Number(t.paymentsCreated || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{summaryRaw || '(sem saida ainda)'}</pre>
          </div>

          <div className="pz-card--subtle" style={{ display: 'grid', gap: 10 }}>
            <div className="pz-field-label">Tenant drill-down</div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{tenantRaw || '(sem saida ainda)'}</pre>
          </div>
        </div>
      </div>
    </main>
  );
}
