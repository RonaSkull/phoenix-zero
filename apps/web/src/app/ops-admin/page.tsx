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
  const [tenantQuery, setTenantQuery] = useState('');
  const [tenantPageSize, setTenantPageSize] = useState(40);
  const [tenantPage, setTenantPage] = useState(0);

  const summary = useMemo(() => {
    try {
      if (!summaryRaw.trim()) return null;
      return JSON.parse(summaryRaw);
    } catch {
      return null;
    }
  }, [summaryRaw]);

  const tenantDetails = useMemo(() => {
    try {
      if (!tenantRaw.trim()) return null;
      return JSON.parse(tenantRaw);
    } catch {
      return null;
    }
  }, [tenantRaw]);

  const tenantInfo = tenantDetails?.tenant || null;
  const tenantMetrics = tenantDetails?.metrics || null;
  const tenantTopErrors = Array.isArray(tenantDetails?.topErrors) ? tenantDetails.topErrors : [];
  const tenantRecentEvents = Array.isArray(tenantDetails?.recentEvents) ? tenantDetails.recentEvents : [];

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

  const filteredTenants = useMemo(() => {
    const q = tenantQuery.trim().toLowerCase();
    const list = tenants.slice();
    if (!q) return list;
    return list.filter((t: any) => {
      const id = String(t?.tenantId || '').toLowerCase();
      const name = String(t?.name || '').toLowerCase();
      const ct = String(t?.clientType || '').toLowerCase();
      return id.includes(q) || name.includes(q) || ct.includes(q);
    });
  }, [tenantQuery, tenants]);

  const clampedPageSize = Math.max(1, Math.min(500, Math.trunc(Number(tenantPageSize || 40))));
  const maxTenantPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredTenants.length / clampedPageSize));
  }, [clampedPageSize, filteredTenants.length]);

  const visibleTenantPage = Math.min(Math.max(0, tenantPage), maxTenantPages - 1);
  const visibleTenants = filteredTenants.slice(visibleTenantPage * clampedPageSize, visibleTenantPage * clampedPageSize + clampedPageSize);

  useEffect(() => {
    setTenantPage(0);
  }, [tenantQuery, tenantPageSize]);

  const formatTs = useCallback((ts: any) => {
    const raw = String(ts || '').trim();
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    const iso = d.toISOString().replace('T', ' ').slice(0, 19);
    return iso;
  }, []);

  const summaryTotals = useMemo(() => {
    const totalTenants = tenants.length;
    const totalExecutions = tenants.reduce((acc: number, t: any) => acc + Number(t?.executions || 0), 0);
    const totalUnitsConsumed = tenants.reduce((acc: number, t: any) => acc + Number(t?.unitsConsumed || 0), 0);
    const totalPaymentsPaid = tenants.reduce((acc: number, t: any) => acc + Number(t?.paymentsPaid || 0), 0);
    const totalPaymentsCreated = tenants.reduce((acc: number, t: any) => acc + Number(t?.paymentsCreated || 0), 0);
    return { totalTenants, totalExecutions, totalUnitsConsumed, totalPaymentsPaid, totalPaymentsCreated };
  }, [tenants]);

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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
              <div className="pz-card--subtle" style={{ padding: 10, borderRadius: 12 }}>
                <div style={{ color: '#8FA0BF', fontSize: 12 }}>tenants</div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{summaryTotals.totalTenants}</div>
              </div>
              <div className="pz-card--subtle" style={{ padding: 10, borderRadius: 12 }}>
                <div style={{ color: '#8FA0BF', fontSize: 12 }}>execuções</div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{summaryTotals.totalExecutions}</div>
              </div>
              <div className="pz-card--subtle" style={{ padding: 10, borderRadius: 12 }}>
                <div style={{ color: '#8FA0BF', fontSize: 12 }}>units consumidas</div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{summaryTotals.totalUnitsConsumed}</div>
              </div>
              <div className="pz-card--subtle" style={{ padding: 10, borderRadius: 12 }}>
                <div style={{ color: '#8FA0BF', fontSize: 12 }}>pagamentos (paid)</div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{summaryTotals.totalPaymentsPaid}</div>
              </div>
              <div className="pz-card--subtle" style={{ padding: 10, borderRadius: 12 }}>
                <div style={{ color: '#8FA0BF', fontSize: 12 }}>pagamentos (created)</div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{summaryTotals.totalPaymentsCreated}</div>
              </div>
            </div>
          </div>

          <div className="pz-card--subtle" style={{ display: 'grid', gap: 10 }}>
            <div className="pz-field-label">Tenants (resumo)</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px', gap: 12 }}>
              <div className="pz-field">
                <label className="pz-field-label">buscar tenant</label>
                <input
                  className="pz-input"
                  value={tenantQuery}
                  onChange={(e) => setTenantQuery(e.target.value)}
                  placeholder="tenantId, nome, clientType…"
                />
              </div>
              <div className="pz-field">
                <label className="pz-field-label">page size</label>
                <input
                  className="pz-input"
                  value={String(tenantPageSize)}
                  onChange={(e) => setTenantPageSize(Number(e.target.value || '40'))}
                  placeholder="40"
                />
              </div>
              <div className="pz-field" style={{ display: 'grid', alignContent: 'end' }}>
                <div style={{ color: '#8FA0BF', fontSize: 12 }}>
                  {visibleTenants.length}/{filteredTenants.length} (filtrado)
                </div>
                <div style={{ color: '#8FA0BF', fontSize: 12 }}>page {visibleTenantPage + 1}/{maxTenantPages}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setTenantPage((p) => Math.max(0, p - 1))}
                disabled={visibleTenantPage <= 0}
                style={{
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#E7ECF5',
                  cursor: visibleTenantPage <= 0 ? 'not-allowed' : 'pointer'
                }}
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setTenantPage((p) => Math.min(maxTenantPages - 1, p + 1))}
                disabled={visibleTenantPage >= maxTenantPages - 1}
                style={{
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#E7ECF5',
                  cursor: visibleTenantPage >= maxTenantPages - 1 ? 'not-allowed' : 'pointer'
                }}
              >
                Next
              </button>
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
                    <th style={{ padding: '8px 6px' }}>errors</th>
                  </tr>
                </thead>
                <tbody>
                  {(visibleTenants || []).map((t: any) => {
                    const id = String(t.tenantId || '').trim();
                    const selected = selectedTenantId && id === selectedTenantId;
                    const errorsByReason = t?.errorsByReason && typeof t.errorsByReason === 'object' ? t.errorsByReason : null;
                    const errorCount = errorsByReason ? Object.values(errorsByReason).reduce((acc: number, n: any) => acc + Number(n || 0), 0) : 0;
                    return (
                      <tr
                        key={id}
                        onClick={() => id && setSelectedTenantId(id)}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                          cursor: 'pointer',
                          background: selected ? 'rgba(0,255,200,0.08)' : 'transparent'
                        }}
                      >
                        <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{id}</td>
                        <td style={{ padding: '8px 6px' }}>{String(t.clientType || '')}</td>
                        <td style={{ padding: '8px 6px' }}>{Number(t.executions || 0)}</td>
                        <td style={{ padding: '8px 6px' }}>{Number(t.unitsConsumed || 0)}</td>
                        <td style={{ padding: '8px 6px' }}>
                          {Number(t.paymentsPaid || 0)}/{Number(t.paymentsCreated || 0)}
                        </td>
                        <td style={{ padding: '8px 6px', color: errorCount > 0 ? '#FFB4B4' : '#8FA0BF' }}>{errorCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <details style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 10 }}>
              <summary style={{ cursor: 'pointer', color: '#8FA0BF', fontSize: 13 }}>Raw JSON (summary)</summary>
              <pre
                style={{
                  margin: 0,
                  marginTop: 10,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 280,
                  overflow: 'auto'
                }}
              >
                {summaryRaw || '(sem saida ainda)'}
              </pre>
            </details>
          </div>

          <div className="pz-card--subtle" style={{ display: 'grid', gap: 10 }}>
            <div className="pz-field-label">Tenant drill-down</div>
            {tenantInfo ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div className="pz-card--subtle" style={{ padding: 10, borderRadius: 12 }}>
                    <div style={{ color: '#8FA0BF', fontSize: 12 }}>tenant</div>
                    <div style={{ fontWeight: 900, fontSize: 14, wordBreak: 'break-word' }}>{String(tenantInfo.tenantId || '')}</div>
                    <div style={{ color: '#8FA0BF', fontSize: 12 }}>{String(tenantInfo.name || '')}</div>
                  </div>
                  <div className="pz-card--subtle" style={{ padding: 10, borderRadius: 12 }}>
                    <div style={{ color: '#8FA0BF', fontSize: 12 }}>status / tipo</div>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{String(tenantInfo.status || '')}</div>
                    <div style={{ color: '#8FA0BF', fontSize: 12 }}>{String(tenantInfo.clientType || '')}</div>
                  </div>
                  <div className="pz-card--subtle" style={{ padding: 10, borderRadius: 12 }}>
                    <div style={{ color: '#8FA0BF', fontSize: 12 }}>país / moeda</div>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{String(tenantInfo.country || '')}</div>
                    <div style={{ color: '#8FA0BF', fontSize: 12 }}>{String(tenantInfo.currency || '')}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                  <div className="pz-card--subtle" style={{ padding: 10, borderRadius: 12 }}>
                    <div style={{ color: '#8FA0BF', fontSize: 12 }}>payments created</div>
                    <div style={{ fontWeight: 900, fontSize: 18 }}>{Number(tenantMetrics?.paymentsCreated || 0)}</div>
                  </div>
                  <div className="pz-card--subtle" style={{ padding: 10, borderRadius: 12 }}>
                    <div style={{ color: '#8FA0BF', fontSize: 12 }}>payments paid</div>
                    <div style={{ fontWeight: 900, fontSize: 18 }}>{Number(tenantMetrics?.paymentsPaid || 0)}</div>
                  </div>
                  <div className="pz-card--subtle" style={{ padding: 10, borderRadius: 12 }}>
                    <div style={{ color: '#8FA0BF', fontSize: 12 }}>units purchased</div>
                    <div style={{ fontWeight: 900, fontSize: 18 }}>{Number(tenantMetrics?.unitsPurchased || 0)}</div>
                  </div>
                  <div className="pz-card--subtle" style={{ padding: 10, borderRadius: 12 }}>
                    <div style={{ color: '#8FA0BF', fontSize: 12 }}>units consumed</div>
                    <div style={{ fontWeight: 900, fontSize: 18 }}>{Number(tenantMetrics?.unitsConsumed || 0)}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 10 }}>
                  <div className="pz-card--subtle" style={{ padding: 10, borderRadius: 12 }}>
                    <div className="pz-field-label" style={{ marginBottom: 6 }}>Top erros (reason)</div>
                    {tenantTopErrors.length ? (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {tenantTopErrors.slice(0, 10).map((e: any) => (
                          <div key={String(e.reason)} style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                            <div style={{ color: '#E7ECF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(e.reason)}</div>
                            <div style={{ color: '#8FA0BF' }}>{Number(e.count || 0)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: '#8FA0BF', fontSize: 13 }}>(sem erros no período)</div>
                    )}
                  </div>

                  <div className="pz-card--subtle" style={{ padding: 10, borderRadius: 12 }}>
                    <div className="pz-field-label" style={{ marginBottom: 6 }}>Eventos recentes</div>
                    <div style={{ overflow: 'auto', maxHeight: 260 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                            <th style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>ts</th>
                            <th style={{ padding: '6px 4px' }}>action</th>
                            <th style={{ padding: '6px 4px' }}>ok</th>
                            <th style={{ padding: '6px 4px' }}>reason</th>
                            <th style={{ padding: '6px 4px' }}>agent</th>
                            <th style={{ padding: '6px 4px' }}>taskId</th>
                            <th style={{ padding: '6px 4px' }}>taskType</th>
                            <th style={{ padding: '6px 4px' }}>proof</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tenantRecentEvents.slice(0, 50).map((ev: any) => {
                            const proofId = String(ev?.proofId || '').trim();
                            return (
                              <tr key={String(ev?.eventId || Math.random())} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <td style={{ padding: '6px 4px', whiteSpace: 'nowrap', color: '#8FA0BF' }}>{formatTs(ev?.ts)}</td>
                                <td style={{ padding: '6px 4px' }}>{String(ev?.action || '')}</td>
                                <td style={{ padding: '6px 4px', color: ev?.ok === false ? '#FFB4B4' : '#BFFFEF' }}>{String(ev?.ok)}</td>
                                <td style={{ padding: '6px 4px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(ev?.reason || '')}</td>
                                <td style={{ padding: '6px 4px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(ev?.agentId || '')}</td>
                                <td style={{ padding: '6px 4px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(ev?.taskId || '')}</td>
                                <td style={{ padding: '6px 4px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(ev?.taskType || '')}</td>
                                <td style={{ padding: '6px 4px' }}>
                                  {proofId ? (
                                    <a className="pz-link" href={`/verify/${encodeURIComponent(proofId)}`} target="_blank" rel="noreferrer">
                                      abrir
                                    </a>
                                  ) : (
                                    ''
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: '#8FA0BF', fontSize: 13 }}>(selecione um tenant na tabela acima)</div>
            )}

            <details style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 10 }} open>
              <summary style={{ cursor: 'pointer', color: '#8FA0BF', fontSize: 13 }}>Raw JSON (tenant)</summary>
              <pre
                style={{
                  margin: 0,
                  marginTop: 10,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 320,
                  overflow: 'auto'
                }}
              >
                {tenantRaw || '(sem saida ainda)'}
              </pre>
            </details>
          </div>
        </div>
      </div>
    </main>
  );
}
