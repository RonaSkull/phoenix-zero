'use client';

import { useMemo, useState } from 'react';

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function Page() {
  const [stampVideo, setStampVideo] = useState<File | null>(null);
  const [stampMode, setStampMode] = useState<'compat' | 'strict'>('strict');
  const [stampBusy, setStampBusy] = useState(false);
  const [stampError, setStampError] = useState<string | null>(null);
  const [stampOk, setStampOk] = useState<string | null>(null);

  const [verifyVideo, setVerifyVideo] = useState<File | null>(null);
  const [verifyProof, setVerifyProof] = useState<File | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<JsonValue | null>(null);

  const stampDisabled = useMemo(() => stampBusy || !stampVideo, [stampBusy, stampVideo]);
  const verifyDisabled = useMemo(() => verifyBusy || !verifyVideo || !verifyProof, [verifyBusy, verifyVideo, verifyProof]);

  async function onStamp() {
    if (!stampVideo) return;
    setStampBusy(true);
    setStampError(null);
    setStampOk(null);
    try {
      const form = new FormData();
      form.set('video', stampVideo);
      form.set('mode', stampMode);

      const res = await fetch('/api/phoenix-zero/stamp-watermarked', { method: 'POST', body: form });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      downloadBlob(blob, 'phoenix-zero-stamp-watermarked.zip');
      setStampOk('ZIP baixado com sucesso. Extraia para obter watermarked.mp4 e proof.json');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStampError(msg);
    } finally {
      setStampBusy(false);
    }
  }

  async function onVerify() {
    if (!verifyVideo || !verifyProof) return;
    setVerifyBusy(true);
    setVerifyError(null);
    setVerifyResult(null);
    try {
      const form = new FormData();
      form.set('video', verifyVideo);
      form.set('proof', verifyProof);

      const res = await fetch('/api/phoenix-zero/verify-watermarked', { method: 'POST', body: form });
      const json = (await res.json().catch(async () => {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      })) as JsonValue;

      if (!res.ok) {
        setVerifyResult(json);
        throw new Error(`Falha na verificação (HTTP ${res.status}).`);
      }

      setVerifyResult(json);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setVerifyError(msg);
    } finally {
      setVerifyBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 920, padding: 24, margin: '0 auto' }}>
      <h1>Phoenix Zero</h1>

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
        <h2>Stamp Watermarked</h2>
        <p>Gera watermark invisível + proof assinado e retorna um ZIP (watermarked.mp4 + proof.json).</p>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>
            Vídeo (mp4)
            <input
              style={{ display: 'block', marginTop: 6 }}
              type="file"
              accept="video/mp4,video/*"
              onChange={(e) => setStampVideo(e.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            Modo
            <select
              style={{ display: 'block', marginTop: 6, maxWidth: 220 }}
              value={stampMode}
              onChange={(e) => setStampMode(e.target.value === 'compat' ? 'compat' : 'strict')}
            >
              <option value="strict">strict (Ed25519 + SPHINCS+)</option>
              <option value="compat">compat (fallback PQ)</option>
            </select>
          </label>
          <button onClick={onStamp} disabled={stampDisabled} style={{ maxWidth: 260, padding: '10px 12px' }}>
            {stampBusy ? 'Gerando…' : 'Gerar e baixar ZIP'}
          </button>
          {stampOk ? <div style={{ color: '#0a7a1f' }}>{stampOk}</div> : null}
          {stampError ? <pre style={{ whiteSpace: 'pre-wrap', color: '#b00020' }}>{stampError}</pre> : null}
        </div>
      </section>

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
        <h2>Verify Watermarked</h2>
        <p>Verifica assinatura híbrida, watermark e fingerprint temporal contra o vídeo fornecido.</p>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>
            Vídeo (mp4) para verificar
            <input
              style={{ display: 'block', marginTop: 6 }}
              type="file"
              accept="video/mp4,video/*"
              onChange={(e) => setVerifyVideo(e.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            proof.json
            <input
              style={{ display: 'block', marginTop: 6 }}
              type="file"
              accept="application/json,.json"
              onChange={(e) => setVerifyProof(e.target.files?.[0] ?? null)}
            />
          </label>
          <button onClick={onVerify} disabled={verifyDisabled} style={{ maxWidth: 260, padding: '10px 12px' }}>
            {verifyBusy ? 'Verificando…' : 'Verificar'}
          </button>
          {verifyError ? <pre style={{ whiteSpace: 'pre-wrap', color: '#b00020' }}>{verifyError}</pre> : null}
          {verifyResult ? (
            <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f6f6', padding: 12, borderRadius: 8 }}>
              {JSON.stringify(verifyResult, null, 2)}
            </pre>
          ) : null}
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Endpoints</h3>
        <ul>
          <li>POST /api/phoenix-zero/stamp-watermarked</li>
          <li>POST /api/phoenix-zero/verify-watermarked</li>
          <li>POST /api/phoenix-zero/stamp</li>
          <li>POST /api/phoenix-zero/verify</li>
        </ul>
      </section>
    </main>
  );
}
