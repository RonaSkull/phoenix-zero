'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

function normalizeUrl(url: string): string {
  try {
    return new URL(url, typeof document !== 'undefined' ? document.baseURI : undefined).toString();
  } catch {
    try {
      if (typeof window === 'undefined') return url;
      return new URL(url, window.location.origin).toString();
    } catch {
      return url;
    }
  }
}

export default function VerifyImageClient(props: {
  initialImageUrl: string;
  initialProofUrl: string;
  initialPageUrl?: string;
  verifyApiPath?: string;
  sharePath?: string;
}) {
  const [imageUrl, setImageUrl] = useState(props.initialImageUrl);
  const [proofUrl, setProofUrl] = useState(props.initialProofUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JsonValue | null>(null);

  const [autoTried, setAutoTried] = useState(false);

  const shareInputRef = useRef<HTMLInputElement | null>(null);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const u = new URL(props.sharePath ?? '/verify-image', window.location.origin);
    if (imageUrl) u.searchParams.set('imageUrl', imageUrl);
    if (proofUrl) u.searchParams.set('proofUrl', proofUrl);
    setShareUrl(u.toString());
  }, [imageUrl, proofUrl, props.sharePath]);

  const disabled = useMemo(() => busy || !imageUrl || !proofUrl, [busy, imageUrl, proofUrl]);

  const onVerify = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const resolvedImageUrl = normalizeUrl(imageUrl);
      const resolvedProofUrl = normalizeUrl(proofUrl);

      const res = await fetch(props.verifyApiPath ?? '/api/phoenix-zero/verify-image-by-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: resolvedImageUrl, proofUrl: resolvedProofUrl })
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
  }, [imageUrl, proofUrl, props.verifyApiPath]);

  useEffect(() => {
    if (autoTried) return;
    if (!imageUrl || !proofUrl) return;
    setAutoTried(true);
    void onVerify();
  }, [autoTried, imageUrl, proofUrl, onVerify]);

  const ui = useMemo(() => {
    const obj = typeof result === 'object' && result !== null && !Array.isArray(result) ? (result as any) : null;
    const decision = typeof obj?.decision === 'string' ? obj.decision : '';
    const identityStatus = typeof obj?.identity?.status === 'string' ? obj.identity.status : '';

    const ok = decision === 'verified' || decision === 'verified_unregistered_creator' || obj?.ok === true;

    let title = ok ? 'Autêntico ✅' : 'Não verificado / Falhou';
    let bg = ok ? '#065f46' : '#7f1d1d';
    let hint = ok
      ? 'Assinatura válida e vínculo com a imagem confirmado.'
      : 'Não foi possível confirmar autenticidade com a prova fornecida.';

    if (decision === 'verified') {
      title = 'Autêntico ✅';
      bg = '#065f46';
      hint = 'Assinatura válida, vínculo com a imagem confirmado e criador verificado.';
    } else if (decision === 'verified_unregistered_creator') {
      title = identityStatus === 'unknown' ? 'Autêntico (criador não informado)' : 'Autêntico (criador não verificado)';
      bg = '#92400e';
      hint =
        identityStatus === 'unknown'
          ? 'Assinatura válida e vínculo com a imagem confirmado, mas o criador não foi informado na prova.'
          : 'Assinatura válida e vínculo com a imagem confirmado, mas o criador não está registrado.';
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
      obj
    };
  }, [result]);

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

  const consumerMode = useMemo(
    () => !!(props.initialImageUrl && props.initialProofUrl),
    [props.initialImageUrl, props.initialProofUrl]
  );

  return (
    <main style={{ maxWidth: 920 }}>
      <h1>Verificação (imagem por URL)</h1>

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          {props.initialPageUrl ? (
            <div>
              <a href={props.initialPageUrl}>Voltar</a>
            </div>
          ) : null}

          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: result ? ui.bg : '#111827',
              color: '#fff',
              minHeight: 64
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700 }}>{busy ? 'Verificando…' : result ? ui.title : 'Aguardando verificação…'}</div>
            <div style={{ marginTop: 6, opacity: 0.95 }}>{error ? error : result ? ui.hint : 'Preencha os links para verificar.'}</div>
          </div>

          {result ? (
            <div style={{ display: 'grid', gap: 6 }}>
              {ui.creatorId ? (
                <div>
                  <strong>Criador:</strong> {ui.creatorId}
                </div>
              ) : null}
              {ui.createdAt ? (
                <div>
                  <strong>Data da prova:</strong> {ui.createdAt}
                </div>
              ) : null}
              <div>
                <a href={imageUrl || undefined} target="_blank" rel="noreferrer">
                  Abrir imagem
                </a>
                <span>{' — '}</span>
                <a href={proofUrl || undefined} target="_blank" rel="noreferrer">
                  Abrir prova
                </a>
              </div>
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={onVerify} disabled={disabled} style={{ maxWidth: 260, padding: '10px 12px' }}>
              {busy ? 'Verificando…' : 'Verificar'}
            </button>
            <button onClick={onCopy} disabled={!shareUrl} style={{ maxWidth: 260, padding: '10px 12px' }}>
              Copiar link
            </button>
          </div>

          <details open={!consumerMode}>
            <summary style={{ cursor: 'pointer' }}>{consumerMode ? 'Modo avançado' : 'Modo avançado (editar links)'}</summary>
            <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
              <label>
                Link da imagem
                <input
                  style={{ display: 'block', width: '100%', marginTop: 6, padding: '10px 12px' }}
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://.../image.png"
                />
              </label>
              <label>
                Link da prova
                <input
                  style={{ display: 'block', width: '100%', marginTop: 6, padding: '10px 12px' }}
                  value={proofUrl}
                  onChange={(e) => setProofUrl(e.target.value)}
                  placeholder="https://.../proof.json"
                />
              </label>
              <label>
                Link compartilhável
                <input
                  style={{ display: 'block', width: '100%', marginTop: 6, padding: '10px 12px' }}
                  readOnly
                  ref={shareInputRef}
                  value={shareUrl}
                />
              </label>
              {!canCopy ? (
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  Dica: se o botão não copiar automaticamente, selecione o link acima e copie.
                </div>
              ) : null}
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
    </main>
  );
}
