export default function DemoPage() {
  return (
    <main style={{ maxWidth: 920 }}>
      <h1>Demo de Verificação</h1>

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
        <p>
          Esta página serve um vídeo + um link de <code>proof.json</code> para testar a extensão do navegador.
        </p>

        <div style={{ display: 'grid', gap: 12 }}>
          <video
            controls
            style={{ width: '100%', borderRadius: 12, background: '#000' }}
            src="/demo/assets/v1/watermarked.mp4"
          />

          <div>
            <a href="/demo/assets/v1/proof.json">proof.json</a>
            <span>{' — '}</span>
            <a href="/demo/assets/v1/watermarked.mp4">watermarked.mp4</a>
          </div>

          <p style={{ marginTop: 8 }}>
            Se a extensão estiver ativa, você verá um badge no canto da tela. Clique no badge para abrir{' '}
            <code>/verify</code> pré-preenchido.
          </p>
        </div>
      </section>

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
        <p>
          Embed universal (sem plataformas): adicione um elemento com <code>data-phoenix-zero-embed</code> e carregue o
          script.
        </p>

        <div
          data-phoenix-zero-embed
          data-video-url="/demo/assets/v1/watermarked.mp4"
          data-proof-url="/demo/assets/v1/proof.json"
          style={{ marginTop: 12 }}
        />
      </section>

      <script src="/phoenix-zero-embed.js" defer />
    </main>
  );
}
