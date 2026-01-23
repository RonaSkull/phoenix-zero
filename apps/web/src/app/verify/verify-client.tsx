'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

export default function VerifyClient(props: { initialVideoUrl: string; initialProofUrl: string; initialPageUrl?: string }) {
  const [videoUrl, setVideoUrl] = useState(props.initialVideoUrl);
  const [proofUrl, setProofUrl] = useState(props.initialProofUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JsonValue | null>(null);
  const shareInputRef = useRef<HTMLInputElement | null>(null);

  const [shareLinkBusy, setShareLinkBusy] = useState(false);
  const [shareLinkError, setShareLinkError] = useState<string | null>(null);
  const [zeroActionShareUrl, setZeroActionShareUrl] = useState('');
  const [zeroActionShareWarning, setZeroActionShareWarning] = useState<string | null>(null);

  const [autoTried, setAutoTried] = useState(false);

  const disabled = useMemo(() => busy || !videoUrl || !proofUrl, [busy, videoUrl, proofUrl]);

  const [shareUrl, setShareUrl] = useState('');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const u = new URL('/verify', window.location.origin);
    if (videoUrl) u.searchParams.set('videoUrl', videoUrl);
    if (proofUrl) u.searchParams.set('proofUrl', proofUrl);
    setShareUrl(u.toString());
  }, [videoUrl, proofUrl]);

  const onVerify = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/phoenix-zero/verify-by-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl, proofUrl })
      });

      const json = (await res.json().catch(async () => {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      })) as JsonValue;

      setResult(json);

      if (!res.ok) {
        throw new Error(`Falha na verificação (HTTP ${res.status}).`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, [proofUrl, videoUrl]);

  useEffect(() => {
    if (autoTried) return;
    if (!videoUrl || !proofUrl) return;
    setAutoTried(true);
    void onVerify();
  }, [autoTried, onVerify, proofUrl, videoUrl]);

  const ui = useMemo(() => {
    const obj = typeof result === 'object' && result !== null && !Array.isArray(result) ? (result as any) : null;
    const decision = typeof obj?.decision === 'string' ? obj.decision : '';
    const identityStatus = typeof obj?.identity?.status === 'string' ? obj.identity.status : '';
    const attOk = obj?.attestation?.ok === true;
    const attPresent = obj?.attestation?.present === true;

    const ok = decision === 'verified' || decision === 'verified_unregistered_creator' || obj?.ok === true;

    let title = ok ? 'Autêntico ✅' : 'Não verificado / Falhou';
    let bg = ok ? '#065f46' : '#7f1d1d';
    let hint = ok
      ? 'Assinatura válida e vínculo com o vídeo confirmado.'
      : 'Não foi possível confirmar autenticidade com a prova fornecida.';

    if (decision === 'verified') {
      title = 'Autêntico ✅';
      bg = '#065f46';
      hint = 'Assinatura válida, vínculo com o vídeo confirmado e criador verificado.';
    } else if (decision === 'verified_unregistered_creator') {
      title = identityStatus === 'unknown' ? 'Autêntico (criador não informado)' : 'Autêntico (criador não verificado)';
      bg = '#92400e';
      hint =
        identityStatus === 'unknown'
          ? 'Assinatura válida e vínculo com o vídeo confirmado, mas o criador não foi informado na prova.'
          : 'Assinatura válida e vínculo com o vídeo confirmado, mas o criador não está registrado.';
    } else if (decision === 'suspected_impersonation') {
      title = 'Suspeito (possível impostor)';
      bg = '#7f1d1d';
      hint = 'A prova parece válida, mas o criador não confere com o registro.';
    } else if (decision === 'not_verified') {
      title = 'Não verificado / Falhou';
      bg = '#7f1d1d';
      hint = 'Não foi possível confirmar autenticidade com a prova fornecida.';
    }

    const creatorId =
      (typeof obj?.meta?.creatorId === 'string' ? obj.meta.creatorId : undefined) ??
      (typeof obj?.identity?.creatorId === 'string' ? obj.identity.creatorId : undefined);
    const createdAt = typeof obj?.meta?.createdAt === 'string' ? obj.meta.createdAt : undefined;

    return {
      ok,
      title,
      bg,
      hint,
      creatorId,
      createdAt,
      identityStatus: identityStatus || undefined,
      attOk,
      attPresent,
      obj
    };
  }, [result]);

  const consumerMode = useMemo(() => !!(props.initialVideoUrl && props.initialProofUrl), [props.initialProofUrl, props.initialVideoUrl]);

  const [canCopy, setCanCopy] = useState(false);
  useEffect(() => {
    setCanCopy(typeof navigator !== 'undefined' && !!navigator.clipboard);
  }, []);

  const onCopy = useCallback(async () => {
    if (!shareUrl) return;
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl);
      return;
    }

    const el = shareInputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, [shareUrl]);

  const onCreateZeroActionLink = useCallback(async () => {
    if (!videoUrl || !proofUrl) return;
    setShareLinkBusy(true);
    setShareLinkError(null);
    setZeroActionShareWarning(null);
    try {
      const res = await fetch('/api/share-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl, proofUrl })
      });
      const json = (await res.json().catch(() => null)) as any;
      const url = typeof json?.shareUrl === 'string' ? json.shareUrl : '';
      if (!res.ok || !url) {
        throw new Error(typeof json?.reason === 'string' ? json.reason : `HTTP ${res.status}`);
      }
      setZeroActionShareUrl(url);

      try {
        const host = new URL(url).hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
          setZeroActionShareWarning(
            'O WhatsApp não consegue gerar preview para links localhost/127.0.0.1. Para ver o card, use uma URL pública/HTTPS (ex: túnel) e configure PHOENIX_ZERO_PUBLIC_BASE_URL.'
          );
        }
      } catch {
      }

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setShareLinkError(msg);
    } finally {
      setShareLinkBusy(false);
    }
  }, [proofUrl, videoUrl]);

  return (
    <main className="pz-shell">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container">
        <div>
          <div className="pz-topline">
            <div className="pz-kicker">Phoenix Zero</div>
            <div className="pz-rule" />
          </div>
          <div className="pz-subtitle">Verificação</div>
        </div>

        <section
          className="pz-card"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto'
          }}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 10 }}>
            {props.initialPageUrl ? (
              <div>
                <a className="pz-back" href={props.initialPageUrl}>
                  Voltar
                </a>
              </div>
            ) : null}

            <div
              className="pz-card--subtle"
              style={{
                background: result ? ui.bg : '#111827',
                color: '#fff',
                minHeight: 64
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {busy ? 'Verificando…' : result ? ui.title : 'Aguardando verificação…'}
              </div>
              <div style={{ marginTop: 6, opacity: 0.95 }}>
                {error ? error : result ? ui.hint : 'Se este link veio de uma extensão, a verificação roda automaticamente.'}
              </div>
            </div>

            {result ? (
              <div style={{ display: 'grid', gap: 6 }}>
                {ui.creatorId ? <div><strong>Criador:</strong> {ui.creatorId}</div> : null}
                {ui.identityStatus ? (
                  <div>
                    <strong>Identidade:</strong>{' '}
                    {ui.identityStatus === 'match'
                      ? 'Criador verificado'
                      : ui.identityStatus === 'unregistered'
                        ? 'Criador não registrado'
                        : ui.identityStatus === 'mismatch'
                          ? 'Criador não confere'
                          : 'Desconhecido'}
                  </div>
                ) : null}
                {ui.attPresent ? (
                  <div>
                    <strong>Origem:</strong>{' '}
                    {ui.attOk ? 'Confirmada' : 'Não confirmada'}
                  </div>
                ) : null}
                {ui.createdAt ? <div><strong>Data da prova:</strong> {ui.createdAt}</div> : null}
                <div style={{ display: 'grid', gap: 6 }}>
                  <div>
                    <a className="pz-link" href={videoUrl || undefined} target="_blank" rel="noreferrer">
                      Abrir vídeo
                    </a>
                    <span>{' — '}</span>
                    <a className="pz-link" href={proofUrl || undefined} target="_blank" rel="noreferrer">
                      Abrir prova
                    </a>
                  </div>
                </div>
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={onVerify} disabled={disabled} className="pz-btn pz-btn-primary" style={{ maxWidth: 260 }}>
                {busy ? 'Verificando…' : 'Verificar'}
              </button>
              <button onClick={onCopy} disabled={!shareUrl} className="pz-btn" style={{ maxWidth: 260 }}>
                Copiar link
              </button>
              <button
                onClick={onCreateZeroActionLink}
                disabled={shareLinkBusy || !videoUrl || !proofUrl}
                className="pz-btn"
                style={{ maxWidth: 260 }}
              >
                {shareLinkBusy ? 'Gerando link…' : 'Gerar link WhatsApp (preview)'}
              </button>
            </div>

            {shareLinkError ? <pre style={{ whiteSpace: 'pre-wrap', color: '#b00020' }}>{shareLinkError}</pre> : null}

            {zeroActionShareUrl ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Link com preview (zero ação para consumidor no chat)</div>
                <input
                  className="pz-input"
                  style={{ display: 'block', marginTop: 6 }}
                  readOnly
                  value={zeroActionShareUrl}
                />
                {zeroActionShareWarning ? <div style={{ marginTop: 8, fontSize: 12, color: '#92400e' }}>{zeroActionShareWarning}</div> : null}
              </div>
            ) : null}
            </div>

            <details open={!consumerMode}>
              <summary style={{ cursor: 'pointer' }}>{consumerMode ? 'Modo avançado' : 'Modo avançado (editar links)'}</summary>
              <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                <label>
                  Link do vídeo
                  <input
                    className="pz-input"
                    style={{ display: 'block', marginTop: 6 }}
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://.../video.mp4"
                  />
                </label>
                <label>
                  Link da prova
                  <input
                    className="pz-input"
                    style={{ display: 'block', marginTop: 6 }}
                    value={proofUrl}
                    onChange={(e) => setProofUrl(e.target.value)}
                    placeholder="https://.../proof.json"
                  />
                </label>
                <label>
                  Link compartilhável
                  <input
                    className="pz-input"
                    style={{ display: 'block', marginTop: 6 }}
                    readOnly
                    ref={shareInputRef}
                    value={shareUrl}
                  />
                </label>
                {!canCopy ? <div style={{ fontSize: 12, color: '#6b7280' }}>Dica: se o botão não copiar automaticamente, selecione o link acima e copie.</div> : null}
              </div>
            </details>

            {result ? (
              <details>
                <summary style={{ cursor: 'pointer' }}>Detalhes técnicos</summary>
                <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f6f6', padding: 12, borderRadius: 8, marginTop: 10 }}>
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
