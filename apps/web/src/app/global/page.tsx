import type { CSSProperties } from 'react';
import Script from 'next/script';

export default function GlobalLandingPage() {
  const box: CSSProperties = {
    marginTop: 16,
    padding: 16,
    border: '1px solid #ddd',
    borderRadius: 12
  };

  const pre: CSSProperties = {
    padding: 12,
    borderRadius: 12,
    background: '#0b1020',
    color: '#e5e7eb',
    overflow: 'auto',
    margin: 0
  };

  return (
    <main style={{ maxWidth: 980 }}>
      <h1>Phoenix Zero — Escala Global (sem plataformas)</h1>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>O que é</h2>
        <p style={{ marginTop: 8 }}>
          Um serviço de autenticação de conteúdo por URL (vídeo, imagem e live) que pode ser embutido em qualquer site
          via <strong>Embed</strong> ou <strong>SDK</strong>.
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div>
            <strong>API estável:</strong> <code>/api/auth-proxy</code>
          </div>
          <div>
            <strong>Embeds versionados (cacheável):</strong> <code>/phoenix-zero-*-embed.v1.js</code>
          </div>
          <div>
            <strong>SDK JS (cacheável):</strong> <code>/phoenix-zero-sdk.v1.js</code>
          </div>
        </div>
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Exemplo ao vivo (usando assets do demo)</h2>
        <p style={{ marginTop: 8 }}>
          Este badge abaixo é renderizado via embed V1 e chama o proxy <code>/api/auth-proxy</code>.
        </p>
        <div style={{ display: 'grid', gap: 12 }}>
          <video
            controls
            style={{ width: '100%', borderRadius: 12, background: '#000' }}
            src="/demo/assets/v1/watermarked.mp4"
          />
          <div
            data-phoenix-zero-embed
            data-api-base=""
            data-video-url="/demo/assets/v1/watermarked.mp4"
            data-proof-url="/demo/assets/v1/proof.json"
          />
        </div>
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Integração (Embed) — copy/paste</h2>

        <h3 style={{ marginBottom: 8 }}>Vídeo</h3>
        <pre style={pre}>{`<div
  data-phoenix-zero-embed
  data-api-base="https://SEU-DOMINIO-PHOENIXZERO"
  data-video-url="https://CDN/arquivo.mp4"
  data-proof-url="https://CDN/proof.json"
></div>
<script src="https://SEU-DOMINIO-PHOENIXZERO/phoenix-zero-embed.v1.js" defer></script>`}</pre>

        <h3 style={{ marginBottom: 8, marginTop: 16 }}>Imagem</h3>
        <pre style={pre}>{`<div
  data-phoenix-zero-image-embed
  data-api-base="https://SEU-DOMINIO-PHOENIXZERO"
  data-image-url="https://CDN/imagem.png"
  data-proof-url="https://CDN/proof.json"
></div>
<script src="https://SEU-DOMINIO-PHOENIXZERO/phoenix-zero-image-embed.v1.js" defer></script>`}</pre>

        <h3 style={{ marginBottom: 8, marginTop: 16 }}>Live</h3>
        <pre style={pre}>{`<div
  data-phoenix-zero-live-embed
  data-api-base="https://SEU-DOMINIO-PHOENIXZERO"
  data-job-id="SEU_JOB_ID"
></div>
<script src="https://SEU-DOMINIO-PHOENIXZERO/phoenix-zero-live-embed.v1.js" defer></script>`}</pre>
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Integração (SDK) — copy/paste</h2>
        <pre style={pre}>{`<script src="https://SEU-DOMINIO-PHOENIXZERO/phoenix-zero-sdk.v1.js" defer></script>
<script>
  window.addEventListener('DOMContentLoaded', async () => {
    const client = PhoenixZeroSDK.createClient({ apiBase: 'https://SEU-DOMINIO-PHOENIXZERO' });

    const result = await client.verifyVideoByUrl({
      videoUrl: 'https://CDN/arquivo.mp4',
      proofUrl: 'https://CDN/proof.json'
    });

    console.log(result);
  });
</script>`}</pre>
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Referências</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          <div>
            <strong>Demo técnica:</strong> <a href="/demo/v1">/demo/v1</a>
          </div>
          <div>
            <strong>Documento:</strong> <a href="/global/doc">/global/doc</a>
          </div>
          <div>
            <strong>Assets V1:</strong>{' '}
            <a href="/phoenix-zero-embed.v1.js">embed</a>
            <span>{' — '}</span>
            <a href="/phoenix-zero-image-embed.v1.js">image</a>
            <span>{' — '}</span>
            <a href="/phoenix-zero-live-embed.v1.js">live</a>
            <span>{' — '}</span>
            <a href="/phoenix-zero-sdk.v1.js">sdk</a>
          </div>
        </div>
      </section>

      <Script src="/phoenix-zero-embed.v1.js" strategy="afterInteractive" />
    </main>
  );
}
