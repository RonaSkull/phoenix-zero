import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

export default async function GlobalDocPage() {
  const candidates = [
    path.resolve(process.cwd(), '..', '..', 'docs', 'ESCALA_GLOBAL_SEM_PLATAFORMAS.md'),
    path.resolve(process.cwd(), 'docs', 'ESCALA_GLOBAL_SEM_PLATAFORMAS.md')
  ];

  let content = '';
  for (const p of candidates) {
    try {
      content = await readFile(p, 'utf-8');
      break;
    } catch {
    }
  }

  if (!content) {
    content = `Arquivo não encontrado. Tentativas:\n- ${candidates.join('\n- ')}`;
  }

  return (
    <main style={{ maxWidth: 980 }}>
      <h1>Documento — Escala Global Sem Plataformas</h1>
      <div style={{ marginTop: 12 }}>
        <a href="/global">Voltar</a>
        <span>{' — '}</span>
        <a href="/demo/v1">Demo V1</a>
      </div>

      <pre
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 12,
          border: '1px solid rgba(0,0,0,0.12)',
          background: '#0b1020',
          color: '#e5e7eb',
          overflow: 'auto',
          whiteSpace: 'pre-wrap'
        }}
      >
        {content}
      </pre>
    </main>
  );
}
