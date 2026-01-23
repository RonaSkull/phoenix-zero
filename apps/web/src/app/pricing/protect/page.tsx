'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type JsonResponse = { status: number; ok: boolean; text: string; json: any | null };

type PreviewResponse =
  | {
      ok: true;
      currency: string;
      finalPriceCents: number;
      riskScore?: number;
      recommendedPlan?: string;
      recommendedProtection?: string;
      monthlyCostCents?: number;
      protection: { level: string; label: string };
      scope: Record<string, any>;
    }
  | { ok: false; reason?: string };

type CommitmentEventType = 'assumption_confirmed' | 'assumption_adjusted';

type CommitmentEvent = {
  type: CommitmentEventType;
  key: string;
  value: string;
  timestamp: number;
};

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

function fmtMoney(cents: number): string {
  if (!Number.isFinite(cents)) return '0.00';
  return (Math.trunc(cents) / 100).toFixed(2);
}

function classificationCopy(sourceVector: string): { title: string; subtitle: string } {
  const v = String(sourceVector || '').trim().toUpperCase();
  if (v === 'LIVE') return { title: 'Analise concluida.', subtitle: 'Este conteudo foi identificado como transmissao ao vivo.' };
  if (v === 'HYBRID') return { title: 'Analise concluida.', subtitle: 'Origem hibrida detectada. Protecao forense sera aplicada.' };
  return { title: 'Analise concluida.', subtitle: 'Este conteudo foi identificado como video gravado.' };
}

export default function PricingProtectPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const sessionId = (sp.get('sessionId') || '').trim();
  const mode = (sp.get('mode') || '').trim().toLowerCase();
  const lock = (sp.get('lock') || '').trim() === '1';

  const sourceVectorFallback = mode === 'hybrid' ? 'HYBRID' : mode === 'recorded' ? 'RECORDED' : 'LIVE';
  const [observedVector, setObservedVector] = useState<string>('');
  const sourceVector = (observedVector || sourceVectorFallback).trim().toUpperCase();
  const enforceForensic = lock || sourceVector === 'HYBRID';

  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [showTechnical, setShowTechnical] = useState(false);
  const lastConfirmedRef = useRef<Record<string, string>>({});

  const [product, setProduct] = useState<
    'video_protection' | 'image_protection' | 'audio_protection' | 'live_protection' | 'document_protection'
  >('video_protection');

  const [exposure, setExposure] = useState<'private' | 'public' | 'paid' | 'mass'>('private');
  const [persistence, setPersistence] = useState<'short' | 'medium' | 'long' | 'permanent'>('short');
  const [authenticityLevel, setAuthenticityLevel] = useState<'social' | 'commercial' | 'legal' | 'forensic'>('social');

  const [hasMultiple, setHasMultiple] = useState(false);
  const [units, setUnits] = useState(1);

  const [durationSeconds, setDurationSeconds] = useState(0);
  const [sizeBytes, setSizeBytes] = useState(0);
  const [pages, setPages] = useState(0);
  const [guaranteeWindow, setGuaranteeWindow] = useState('');

  const [commitments, setCommitments] = useState<CommitmentEvent[]>([]);
  const [previewResultRaw, setPreviewResultRaw] = useState('');

  const previewParsed = useMemo(() => {
    try {
      if (!previewResultRaw.trim()) return null;
      return JSON.parse(previewResultRaw) as PreviewResponse;
    } catch {
      return null;
    }
  }, [previewResultRaw]);

  const previewError = useMemo(() => {
    if (!previewResultRaw.trim()) return '';
    if (previewParsed && previewParsed.ok === false) return (previewParsed.reason || '').trim() || 'Erro';
    if (previewParsed && previewParsed.ok === true) return '';
    return 'Falha ao calcular valor.';
  }, [previewParsed, previewResultRaw]);

  useEffect(() => {
    if (sessionId) return;
    router.replace('/pricing/observe');
  }, [router, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/observe/state?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
        const j = (await res.json().catch(() => null)) as any;
        const v = String(j?.state?.sourceVector || '').trim().toUpperCase();
        if (!cancelled && v) setObservedVector(v);
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!enforceForensic) return;
    setAuthenticityLevel('forensic');
  }, [enforceForensic]);

  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      setShowTechnical(u.searchParams.get('debug') === '1');
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      const stored = (localStorage.getItem('pz_pricing_preview_ctx') || '').trim();
      if (!stored) return;
      const v = JSON.parse(stored) as any;
      if (v?.product) setProduct(v.product);
      if (v?.persistence) setPersistence(v.persistence);
      if (v?.exposure) setExposure(v.exposure);
      if (v?.authenticityLevel) setAuthenticityLevel(v.authenticityLevel);
      if (typeof v?.hasMultiple === 'boolean') setHasMultiple(v.hasMultiple);
      if (Number.isFinite(v?.units ?? NaN)) setUnits(Math.max(1, Math.trunc(v.units)));
      if (Number.isFinite(v?.durationSeconds ?? NaN)) setDurationSeconds(Math.max(0, Math.trunc(v.durationSeconds)));
      if (Number.isFinite(v?.sizeBytes ?? NaN)) setSizeBytes(Math.max(0, Math.trunc(v.sizeBytes)));
      if (Number.isFinite(v?.pages ?? NaN)) setPages(Math.max(0, Math.trunc(v.pages)));
      if (typeof v?.guaranteeWindow === 'string') setGuaranteeWindow(String(v.guaranteeWindow || ''));
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        'pz_pricing_preview_ctx',
        JSON.stringify({
          product,
          exposure,
          persistence,
          authenticityLevel,
          hasMultiple,
          units,
          durationSeconds,
          sizeBytes,
          pages,
          guaranteeWindow
        })
      );
    } catch {
    }
  }, [authenticityLevel, exposure, hasMultiple, persistence, product, units, durationSeconds, sizeBytes, pages, guaranteeWindow]);

  function pushCommitment(type: CommitmentEventType, key: string, value: string) {
    setCommitments((prev) => {
      const next = prev.concat([{ type, key, value, timestamp: Date.now() }]);
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
  }

  function confirmCurrentStep() {
    const key =
      step === 1
        ? 'product'
        : step === 2
          ? 'exposure'
          : step === 3
            ? 'persistence'
            : step === 4
              ? 'authenticityLevel'
              : 'units';

    const value =
      key === 'product'
        ? product
        : key === 'exposure'
          ? exposure
          : key === 'persistence'
            ? persistence
            : key === 'authenticityLevel'
              ? authenticityLevel
              : String(hasMultiple ? units : 1);

    if (lastConfirmedRef.current[key] === value) return;
    lastConfirmedRef.current[key] = value;
    pushCommitment('assumption_confirmed', key, value);
  }

  async function runPreview() {
    if (!sessionId) return;
    setBusy('preview');
    try {
      const endpoint = showTechnical ? '/api/pricing/preview?debug=1' : '/api/pricing/preview';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          product,
          exposure,
          persistence,
          authenticityLevel,
          units: hasMultiple ? units : 1,
          guaranteeWindow: guaranteeWindow.trim() || 'unknown',
          durationSeconds,
          sizeBytes,
          pages,
          commitments,
          sourceVector,
          sessionId: sessionId || undefined
        })
      });
      const j = await readJson(res);
      setPreviewResultRaw(j.text || JSON.stringify(j.json, null, 2));
    } catch (e) {
      setPreviewResultRaw(JSON.stringify({ ok: false, reason: e instanceof Error ? e.message : String(e) }, null, 2));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!sessionId) return;
    const t = setTimeout(() => {
      void runPreview();
    }, 250);
    return () => clearTimeout(t);
  }, [
    authenticityLevel,
    exposure,
    hasMultiple,
    persistence,
    product,
    units,
    guaranteeWindow,
    durationSeconds,
    sizeBytes,
    pages,
    commitments.length,
    sourceVector,
    sessionId
  ]);

  return (
    <main className="pz-shell pz-shell--mono">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container">
        <div className="pz-topline">
          <div className="pz-kicker">Phoenix Zero</div>
          <div className="pz-rule" />
        </div>
        <div className="pz-subtitle">Protection</div>

        <div className="pz-card-flat" style={{ maxWidth: 860, width: '100%', margin: '0 auto', display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ color: '#8FA0BF', fontSize: 12, lineHeight: 1.55 }}>{classificationCopy(sourceVector).title}</div>
            <div style={{ color: '#8FA0BF', fontSize: 13, lineHeight: 1.55 }}>{classificationCopy(sourceVector).subtitle}</div>
            {showTechnical ? (
              <div style={{ color: '#8FA0BF', fontSize: 12, lineHeight: 1.45 }}>sourceVector={sourceVector} sessionId={sessionId}</div>
            ) : null}
          </div>

          <div className="pz-card--subtle" style={{ display: 'grid', gap: 12 }}>
            <div className="pz-field-label">Passo {step} de 5</div>

            {step === 1 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <div className="pz-field-label">O que voce quer proteger?</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button type="button" onClick={() => setProduct('video_protection')} className="pz-btn" style={{ opacity: product === 'video_protection' ? 1 : 0.8 }}>
                    Video
                  </button>
                  <button type="button" onClick={() => setProduct('image_protection')} className="pz-btn" style={{ opacity: product === 'image_protection' ? 1 : 0.8 }}>
                    Imagem
                  </button>
                  <button type="button" onClick={() => setProduct('audio_protection')} className="pz-btn" style={{ opacity: product === 'audio_protection' ? 1 : 0.8 }}>
                    Audio
                  </button>
                  <button type="button" onClick={() => setProduct('live_protection')} className="pz-btn" style={{ opacity: product === 'live_protection' ? 1 : 0.8 }}>
                    Live
                  </button>
                  <button
                    type="button"
                    onClick={() => setProduct('document_protection')}
                    className="pz-btn"
                    style={{ gridColumn: '1 / -1', opacity: product === 'document_protection' ? 1 : 0.8 }}
                  >
                    Relatorio / Documento
                  </button>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <div className="pz-field-label">Onde esse conteudo vai circular?</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                  <button type="button" onClick={() => setExposure('private')} className="pz-btn" style={{ opacity: exposure === 'private' ? 1 : 0.8 }}>
                    Uso privado / interno
                  </button>
                  <button type="button" onClick={() => setExposure('public')} className="pz-btn" style={{ opacity: exposure === 'public' ? 1 : 0.8 }}>
                    Redes sociais / publico geral
                  </button>
                  <button type="button" onClick={() => setExposure('paid')} className="pz-btn" style={{ opacity: exposure === 'paid' ? 1 : 0.8 }}>
                    Midia paga / campanhas
                  </button>
                  <button type="button" onClick={() => setExposure('mass')} className="pz-btn" style={{ opacity: exposure === 'mass' ? 1 : 0.8 }}>
                    Exposicao nacional / massiva
                  </button>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <div className="pz-field-label">Por quanto tempo essa prova precisa valer?</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                  <button type="button" onClick={() => setPersistence('short')} className="pz-btn" style={{ opacity: persistence === 'short' ? 1 : 0.8 }}>
                    Ate 30 dias
                  </button>
                  <button type="button" onClick={() => setPersistence('medium')} className="pz-btn" style={{ opacity: persistence === 'medium' ? 1 : 0.8 }}>
                    Ate 6 meses
                  </button>
                  <button type="button" onClick={() => setPersistence('long')} className="pz-btn" style={{ opacity: persistence === 'long' ? 1 : 0.8 }}>
                    Ate 1 ano
                  </button>
                  <button type="button" onClick={() => setPersistence('permanent')} className="pz-btn" style={{ opacity: persistence === 'permanent' ? 1 : 0.8 }}>
                    Permanente
                  </button>
                </div>
              </div>
            ) : null}

            {step === 4 ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <div className="pz-field-label">Esse conteudo precisa ter validade:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setAuthenticityLevel('social')}
                    className="pz-btn"
                    disabled={enforceForensic}
                    style={{ opacity: authenticityLevel === 'social' ? 1 : 0.8 }}
                  >
                    Informativa / social
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthenticityLevel('commercial')}
                    className="pz-btn"
                    disabled={enforceForensic}
                    style={{ opacity: authenticityLevel === 'commercial' ? 1 : 0.8 }}
                  >
                    Comercial (disputas, plataformas)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthenticityLevel('legal')}
                    className="pz-btn"
                    disabled={enforceForensic}
                    style={{ opacity: authenticityLevel === 'legal' ? 1 : 0.8 }}
                  >
                    Legal (contratos, compliance)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthenticityLevel('forensic')}
                    className="pz-btn"
                    style={{ opacity: authenticityLevel === 'forensic' ? 1 : 0.8 }}
                  >
                    Judicial / pericial
                  </button>
                </div>
              </div>
            ) : null}

            {step === 5 ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div className="pz-field-label">Assumimos que este e um unico conteudo.</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setHasMultiple(false);
                        setUnits(1);
                        confirmCurrentStep();
                      }}
                      className="pz-btn"
                      style={{ opacity: !hasMultiple ? 1 : 0.8, flex: '1 1 180px' }}
                    >
                      Confirmar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHasMultiple(true);
                        setUnits((u) => (u && u > 1 ? u : 2));
                        pushCommitment('assumption_adjusted', 'units', String(units && units > 1 ? units : 2));
                      }}
                      className="pz-btn"
                      style={{ opacity: hasMultiple ? 1 : 0.8, flex: '1 1 180px' }}
                    >
                      Ajustar quantidade
                    </button>
                  </div>

                  {hasMultiple ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div className="pz-field-label">Quantos conteudos?</div>
                      <input
                        className="pz-input"
                        inputMode="numeric"
                        value={String(units)}
                        onChange={(e) => {
                          const n = Math.trunc(Number(e.target.value || '0'));
                          setUnits(Number.isFinite(n) ? Math.max(1, n) : 1);
                        }}
                        style={{ width: '100%', maxWidth: 240 }}
                      />
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  <div className="pz-field-label">Detalhes do conteudo (opcional)</div>

                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ color: '#8FA0BF', fontSize: 12, lineHeight: 1.45 }}>Guarantee window (chave)</div>
                    <input
                      className="pz-input"
                      value={guaranteeWindow}
                      onChange={(e) => setGuaranteeWindow(e.target.value)}
                      placeholder="unknown"
                      style={{ width: '100%', maxWidth: 240 }}
                    />
                  </div>

                  {product === 'video_protection' || product === 'live_protection' || product === 'audio_protection' ? (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ color: '#8FA0BF', fontSize: 12, lineHeight: 1.45 }}>Duracao (segundos)</div>
                      <input
                        className="pz-input"
                        inputMode="numeric"
                        value={String(durationSeconds)}
                        onChange={(e) => {
                          const n = Math.trunc(Number(e.target.value || '0'));
                          setDurationSeconds(Number.isFinite(n) ? Math.max(0, n) : 0);
                        }}
                        style={{ width: '100%', maxWidth: 240 }}
                      />
                    </div>
                  ) : null}

                  {product === 'image_protection' || product === 'document_protection' ? (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ color: '#8FA0BF', fontSize: 12, lineHeight: 1.45 }}>Tamanho (bytes)</div>
                      <input
                        className="pz-input"
                        inputMode="numeric"
                        value={String(sizeBytes)}
                        onChange={(e) => {
                          const n = Math.trunc(Number(e.target.value || '0'));
                          setSizeBytes(Number.isFinite(n) ? Math.max(0, n) : 0);
                        }}
                        style={{ width: '100%', maxWidth: 240 }}
                      />
                    </div>
                  ) : null}

                  {product === 'document_protection' ? (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ color: '#8FA0BF', fontSize: 12, lineHeight: 1.45 }}>Paginas</div>
                      <input
                        className="pz-input"
                        inputMode="numeric"
                        value={String(pages)}
                        onChange={(e) => {
                          const n = Math.trunc(Number(e.target.value || '0'));
                          setPages(Number.isFinite(n) ? Math.max(0, n) : 0);
                        }}
                        style={{ width: '100%', maxWidth: 240 }}
                      />
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  {showTechnical ? <div style={{ color: '#8FA0BF', fontSize: 12 }}>Sem necessidade de API key.</div> : null}
                  {busy === 'preview' ? <div style={{ color: '#8FA0BF', fontSize: 12 }}>Calculando…</div> : null}
                </div>

                {previewParsed && previewParsed.ok === true ? (
                  <div style={{ display: 'grid', gap: 10, paddingTop: 6 }}>
                    {typeof previewParsed.monthlyCostCents === 'number' ? (
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ color: '#8FA0BF', fontSize: 12, lineHeight: 1.45 }}>Custo estimado de nao agir</div>
                        <div style={{ fontWeight: 950, fontSize: 26 }}>
                          {previewParsed.currency} {fmtMoney(previewParsed.monthlyCostCents)} / mes
                        </div>
                      </div>
                    ) : null}

                    {typeof previewParsed.riskScore === 'number' ? (
                      <div style={{ color: '#8FA0BF', fontSize: 13, lineHeight: 1.55 }}>Risco atual: {previewParsed.riskScore}/100</div>
                    ) : null}

                    <div style={{ color: '#8FA0BF', fontSize: 13, lineHeight: 1.55 }}>
                      Protecao recomendada: {previewParsed.protection.label}
                      {previewParsed.recommendedPlan ? ` (Plano ${String(previewParsed.recommendedPlan).toUpperCase()})` : ''}
                    </div>

                    <div style={{ display: 'grid', gap: 4, paddingTop: 6 }}>
                      <div style={{ color: '#8FA0BF', fontSize: 12, lineHeight: 1.45 }}>Valor da protecao</div>
                      <div style={{ fontWeight: 900, fontSize: 20 }}>
                        {previewParsed.currency} {fmtMoney(Number(previewParsed.finalPriceCents))}
                      </div>
                    </div>
                    {hasMultiple && units > 1 ? (
                      <div style={{ color: '#8FA0BF', fontSize: 13, lineHeight: 1.55 }}>Total para {units} conteudos.</div>
                    ) : null}
                    <div style={{ color: '#8FA0BF', fontSize: 13, lineHeight: 1.55 }}>
                      Se voce quiser seguir com contrato/ativacao, usamos exatamente esse escopo como referencia.
                    </div>
                  </div>
                ) : null}

                {previewError ? (
                  <div style={{ color: 'rgba(255, 90, 90, 0.92)', fontSize: 13, lineHeight: 1.55 }}>
                    Falha ao calcular valor: {previewError}
                  </div>
                ) : null}

                {showTechnical ? (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{previewResultRaw || '(sem saida ainda)'}</pre>
                ) : null}
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 6 }}>
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                disabled={busy !== null || step <= 1}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: busy ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)',
                  color: '#E7ECF5',
                  cursor: busy ? 'not-allowed' : 'pointer'
                }}
              >
                Voltar
              </button>

              <button
                type="button"
                onClick={() => {
                  confirmCurrentStep();
                  setStep((s) => Math.min(5, s + 1));
                }}
                disabled={busy !== null || step >= 5}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: busy ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)',
                  color: '#E7ECF5',
                  cursor: busy ? 'not-allowed' : 'pointer'
                }}
              >
                Avancar
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
