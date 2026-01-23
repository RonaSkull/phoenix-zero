export default function ImageDemoWmPage() {
  return (
    <main style={{ maxWidth: 920 }}>
      <h1>Demo de Imagem Autenticada (Watermarked)</h1>

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
        <p>
          Esta página serve uma imagem watermarked + um link de <code>proof.json</code> (v4) para testar verificação por URL e
          o embed.
        </p>

        <div style={{ display: 'grid', gap: 12 }}>
          <img
            alt="demo"
            src="/demo/assets/v2/image-wm.png"
            style={{ width: '100%', maxWidth: 520, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />

          <div>
            <a href="/demo/assets/v2/image-wm-proof.json">image-wm-proof.json</a>
            <span>{' — '}</span>
            <a href="/demo/assets/v2/image-wm.png">image-wm.png</a>
          </div>

          <div style={{ marginTop: 8 }}>
            <a
              href={
                `/verify-image-wm?imageUrl=${encodeURIComponent('/demo/assets/v2/image-wm.png')}&proofUrl=${encodeURIComponent('/demo/assets/v2/image-wm-proof.json')}&pageUrl=${encodeURIComponent('/image-demo-wm')}`
              }
            >
              Abrir /verify-image-wm pré-preenchido
            </a>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
        <p>
          Embed (imagem): adicione um elemento com <code>data-phoenix-zero-image-embed</code> e carregue o script.
        </p>

        <div
          data-phoenix-zero-image-embed
          data-image-url="/demo/assets/v2/image-wm.png"
          data-proof-url="/demo/assets/v2/image-wm-proof.json"
          style={{ marginTop: 12, display: 'inline-block' }}
        />
      </section>

      <script src="/phoenix-zero-image-embed.js" defer />
    </main>
  );
}
