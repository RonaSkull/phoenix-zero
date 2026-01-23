export default function ImageDemoPage() {
  return (
    <main style={{ maxWidth: 920 }}>
      <h1>Demo de Imagem Autenticada</h1>

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
        <p>
          Esta página serve uma imagem + um link de <code>proof.json</code> (v1) para testar verificação por URL e o embed.
        </p>

        <div style={{ display: 'grid', gap: 12 }}>
          <img
            alt="demo"
            src="/demo/assets/v1/image.png"
            style={{ width: '100%', maxWidth: 520, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />

          <div>
            <a href="/demo/assets/v1/image-proof.json">image-proof.json</a>
            <span>{' — '}</span>
            <a href="/demo/assets/v1/image.png">image.png</a>
          </div>

          <div style={{ marginTop: 8 }}>
            <a
              href={
                `/verify-image?imageUrl=${encodeURIComponent('/demo/assets/v1/image.png')}&proofUrl=${encodeURIComponent('/demo/assets/v1/image-proof.json')}&pageUrl=${encodeURIComponent('/image-demo')}`
              }
            >
              Abrir /verify-image pré-preenchido
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
          data-image-url="/demo/assets/v1/image.png"
          data-proof-url="/demo/assets/v1/image-proof.json"
          style={{ marginTop: 12, display: 'inline-block' }}
        />
      </section>

      <script src="/phoenix-zero-image-embed.js" defer />
    </main>
  );
}
