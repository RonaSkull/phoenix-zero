import Script from 'next/script';

export default function DemoV1Page() {
  return (
    <main style={{ maxWidth: 920 }}>
      <h1>Demo V1 — Escala Global (sem plataformas)</h1>

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Embed V1 (vídeo)</h2>
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

          <div
            data-phoenix-zero-embed
            data-api-base=""
            data-video-url="/demo/assets/v1/watermarked.mp4"
            data-proof-url="/demo/assets/v1/proof.json"
            style={{ marginTop: 8 }}
          />
        </div>
      </section>

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Embed V1 (imagem)</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          <img
            src="/demo/assets/v2/image-wm.png"
            alt="Demo image"
            style={{ width: '100%', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)' }}
          />

          <div>
            <a href="/demo/assets/v2/image-wm-proof.json">image-wm-proof.json</a>
            <span>{' — '}</span>
            <a href="/demo/assets/v2/image-wm.png">image-wm.png</a>
          </div>

          <div
            data-phoenix-zero-image-embed
            data-api-base=""
            data-image-url="/demo/assets/v2/image-wm.png"
            data-proof-url="/demo/assets/v2/image-wm-proof.json"
            style={{ marginTop: 8 }}
          />
        </div>
      </section>

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>SDK V1 (resultado direto)</h2>
        <p style={{ marginTop: 8 }}>
          Abaixo o SDK chama <code>/api/auth-proxy</code> e imprime o JSON normalizado.
        </p>

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Vídeo</div>
            <pre
              id="pz-sdk-video"
              style={{
                padding: 12,
                borderRadius: 12,
                background: '#0b1020',
                color: '#e5e7eb',
                overflow: 'auto',
                margin: 0
              }}
            />
          </div>

          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Imagem</div>
            <pre
              id="pz-sdk-image"
              style={{
                padding: 12,
                borderRadius: 12,
                background: '#0b1020',
                color: '#e5e7eb',
                overflow: 'auto',
                margin: 0
              }}
            />
          </div>

          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Live</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                id="pz-live-jobid"
                placeholder="jobId"
                style={{
                  flex: '1 1 280px',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(0,0,0,0.2)'
                }}
              />
              <button
                id="pz-live-run"
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(0,0,0,0.2)',
                  background: '#fff',
                  cursor: 'pointer'
                }}
              >
                Verificar live
              </button>
              <div data-phoenix-zero-live-embed data-api-base="" data-job-id="" />
            </div>
            <pre
              id="pz-sdk-live"
              style={{
                padding: 12,
                borderRadius: 12,
                background: '#0b1020',
                color: '#e5e7eb',
                overflow: 'auto',
                marginTop: 12
              }}
            />
          </div>
        </div>
      </section>

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Assets</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          <div>
            <a href="/phoenix-zero-embed.v1.js">phoenix-zero-embed.v1.js</a>
            <span>{' — '}</span>
            <a href="/phoenix-zero-image-embed.v1.js">phoenix-zero-image-embed.v1.js</a>
            <span>{' — '}</span>
            <a href="/phoenix-zero-live-embed.v1.js">phoenix-zero-live-embed.v1.js</a>
          </div>
          <div>
            <a href="/phoenix-zero-sdk.v1.js">phoenix-zero-sdk.v1.js</a>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Copy/Paste (Embed)</h2>

        <h3 style={{ marginBottom: 8 }}>Vídeo</h3>
        <pre
          style={{
            padding: 12,
            borderRadius: 12,
            background: '#0b1020',
            color: '#e5e7eb',
            overflow: 'auto',
            margin: 0
          }}
        >{`<div
  data-phoenix-zero-embed
  data-api-base="https://SEU-DOMINIO-PHOENIXZERO"
  data-video-url="https://CDN/arquivo.mp4"
  data-proof-url="https://CDN/proof.json"
></div>
<script src="https://SEU-DOMINIO-PHOENIXZERO/phoenix-zero-embed.v1.js" defer></script>`}</pre>

        <h3 style={{ marginBottom: 8, marginTop: 16 }}>Imagem</h3>
        <pre
          style={{
            padding: 12,
            borderRadius: 12,
            background: '#0b1020',
            color: '#e5e7eb',
            overflow: 'auto',
            margin: 0
          }}
        >{`<div
  data-phoenix-zero-image-embed
  data-api-base="https://SEU-DOMINIO-PHOENIXZERO"
  data-image-url="https://CDN/imagem.png"
  data-proof-url="https://CDN/proof.json"
></div>
<script src="https://SEU-DOMINIO-PHOENIXZERO/phoenix-zero-image-embed.v1.js" defer></script>`}</pre>

        <h3 style={{ marginBottom: 8, marginTop: 16 }}>Live</h3>
        <pre
          style={{
            padding: 12,
            borderRadius: 12,
            background: '#0b1020',
            color: '#e5e7eb',
            overflow: 'auto',
            margin: 0
          }}
        >{`<div
  data-phoenix-zero-live-embed
  data-api-base="https://SEU-DOMINIO-PHOENIXZERO"
  data-job-id="SEU_JOB_ID"
></div>
<script src="https://SEU-DOMINIO-PHOENIXZERO/phoenix-zero-live-embed.v1.js" defer></script>`}</pre>
      </section>

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Copy/Paste (SDK)</h2>
        <pre
          style={{
            padding: 12,
            borderRadius: 12,
            background: '#0b1020',
            color: '#e5e7eb',
            overflow: 'auto',
            margin: 0
          }}
        >{`<script src="https://SEU-DOMINIO-PHOENIXZERO/phoenix-zero-sdk.v1.js" defer></script>
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

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Copy/Paste (curl)</h2>
        <pre
          style={{
            padding: 12,
            borderRadius: 12,
            background: '#0b1020',
            color: '#e5e7eb',
            overflow: 'auto',
            margin: 0
          }}
        >{`# Vídeo
curl.exe -s "http://localhost:3000/api/auth-proxy?type=video&videoUrl=http%3A%2F%2Flocalhost%3A3000%2Fdemo%2Fassets%2Fv1%2Fwatermarked.mp4&proofUrl=http%3A%2F%2Flocalhost%3A3000%2Fdemo%2Fassets%2Fv1%2Fproof.json" 

# Imagem
curl.exe -s "http://localhost:3000/api/auth-proxy?type=image&imageUrl=http%3A%2F%2Flocalhost%3A3000%2Fdemo%2Fassets%2Fv2%2Fimage-wm.png&proofUrl=http%3A%2F%2Flocalhost%3A3000%2Fdemo%2Fassets%2Fv2%2Fimage-wm-proof.json" 

# Live
curl.exe -s "http://localhost:3000/api/auth-proxy?type=live&jobId=SEU_JOB_ID"`}</pre>
      </section>

      <Script src="/phoenix-zero-embed.v1.js" strategy="afterInteractive" />
      <Script src="/phoenix-zero-image-embed.v1.js" strategy="afterInteractive" />
      <Script src="/phoenix-zero-live-embed.v1.js" strategy="afterInteractive" />
      <Script src="/phoenix-zero-sdk.v1.js" strategy="afterInteractive" />
      <Script id="phoenix-zero-sdk-demo" strategy="afterInteractive">{`
(function () {
  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    var el = byId(id);
    if (!el) return;
    el.textContent = value;
  }

  function abs(path) {
    try {
      return new URL(path, window.location.origin).toString();
    } catch {
      return String(path || '');
    }
  }

  async function run() {
    if (!window.PhoenixZeroSDK || !window.PhoenixZeroSDK.createClient) return;

    var client = window.PhoenixZeroSDK.createClient({ apiBase: window.location.origin });

    var videoRes = await client.verifyVideoByUrl({
      videoUrl: abs('/demo/assets/v1/watermarked.mp4'),
      proofUrl: abs('/demo/assets/v1/proof.json')
    });
    setText('pz-sdk-video', JSON.stringify(videoRes, null, 2));

    var imageRes = await client.verifyImageByUrl({
      imageUrl: abs('/demo/assets/v2/image-wm.png'),
      proofUrl: abs('/demo/assets/v2/image-wm-proof.json')
    });
    setText('pz-sdk-image', JSON.stringify(imageRes, null, 2));

    var btn = byId('pz-live-run');
    var input = byId('pz-live-jobid');
    if (btn && input) {
      btn.addEventListener('click', async function () {
        var jobId = String(input.value || '').trim();
        if (!jobId) {
          setText('pz-sdk-live', JSON.stringify({ ok: false, reason: 'Missing jobId' }, null, 2));
          return;
        }

        var liveRes = await client.verifyLiveByJobId({ jobId: jobId });
        setText('pz-sdk-live', JSON.stringify(liveRes, null, 2));

        try {
          var liveHost = document.querySelector('[data-phoenix-zero-live-embed]');
          if (liveHost) {
            liveHost.setAttribute('data-job-id', jobId);
            if (window.PhoenixZeroLiveEmbed && window.PhoenixZeroLiveEmbed.runAll) {
              window.PhoenixZeroLiveEmbed.runAll();
            }
          }
        } catch {
        }
      });
    }
  }

  run();
})();
      `}</Script>
    </main>
  );
}
