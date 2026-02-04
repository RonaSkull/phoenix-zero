function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function inlineFormat(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return s;
}

function splitTableRow(line: string): string[] {
  const raw = String(line || '').trim();
  const inner = raw.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  const s = String(line || '').trim();
  if (!s) return false;
  if (!s.includes('|')) return false;
  const inner = s.replace(/^\|/, '').replace(/\|$/, '');
  const parts = inner.split('|').map((p) => p.trim());
  if (parts.length < 2) return false;
  return parts.every((p) => /^:?-{3,}:?$/.test(p));
}

export function renderMarkdownLiteToHtml(md: string, opts?: { title?: string }): string {
  const title = String(opts?.title || '').trim() || 'Phoenix Zero Docs';

  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');

  let html = '';
  let inCode = false;
  let codeLang = '';
  let codeLines: string[] = [];

  let inUl = false;
  let inOl = false;

  function closeLists() {
    if (inUl) {
      html += '</ul>';
      inUl = false;
    }
    if (inOl) {
      html += '</ol>';
      inOl = false;
    }
  }

  function flushCode() {
    if (!inCode) return;
    closeLists();
    const code = escapeHtml(codeLines.join('\n'));
    const cls = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : '';
    html += `<pre><code${cls}>${code}</code></pre>`;
    codeLines = [];
    codeLang = '';
    inCode = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    const fence = /^```\s*([a-zA-Z0-9_-]+)?\s*$/.exec(line);
    if (fence) {
      if (inCode) {
        flushCode();
      } else {
        closeLists();
        inCode = true;
        codeLang = String(fence[1] || '').trim();
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (/^\s*---\s*$/.test(line)) {
      closeLists();
      html += '<hr />';
      continue;
    }

    if (line.trim().startsWith('>')) {
      closeLists();
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const q = lines[i] ?? '';
        if (!q.trim().startsWith('>')) break;
        quoteLines.push(String(q).replace(/^\s*>\s?/, ''));
        i++;
      }
      i--;
      const body = quoteLines.map((x) => inlineFormat(x)).join('<br />');
      html += `<blockquote><p>${body}</p></blockquote>`;
      continue;
    }

    const next = i + 1 < lines.length ? (lines[i + 1] ?? '') : '';
    if (line.includes('|') && isTableSeparator(next)) {
      closeLists();
      const header = splitTableRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length) {
        const r = lines[i] ?? '';
        if (!String(r).trim()) break;
        if (!String(r).includes('|')) break;
        rows.push(splitTableRow(r));
        i++;
      }
      i--;
      const headCells = header.map((c) => `<th>${inlineFormat(c)}</th>`).join('');
      const bodyRows = rows
        .map((r) => `<tr>${r.map((c) => `<td>${inlineFormat(c)}</td>`).join('')}</tr>`)
        .join('');
      html += `<table><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeLists();
      const level = Math.min(4, heading[1]?.length || 1);
      html += `<h${level}>${inlineFormat(heading[2] || '')}</h${level}>`;
      continue;
    }

    const ul = /^\s*-\s+(.*)$/.exec(line);
    if (ul) {
      if (inOl) {
        html += '</ol>';
        inOl = false;
      }
      if (!inUl) {
        html += '<ul>';
        inUl = true;
      }
      html += `<li>${inlineFormat(ul[1] || '')}</li>`;
      continue;
    }

    const ol = /^\s*(\d+)\)\s+(.*)$/.exec(line) || /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (ol) {
      if (inUl) {
        html += '</ul>';
        inUl = false;
      }
      if (!inOl) {
        html += '<ol>';
        inOl = true;
      }
      html += `<li>${inlineFormat(ol[2] || '')}</li>`;
      continue;
    }

    if (!line.trim()) {
      closeLists();
      continue;
    }

    closeLists();
    html += `<p>${inlineFormat(line)}</p>`;
  }

  flushCode();
  closeLists();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #070a10;
      --panel: rgba(255,255,255,0.04);
      --border: rgba(255,255,255,0.10);
      --text: rgba(255,255,255,0.92);
      --muted: rgba(255,255,255,0.70);
      --link: #6d4dff;
      --code-bg: rgba(0,0,0,0.35);
    }
    html, body { height: 100%; }
    body {
      margin: 0;
      background: radial-gradient(1200px 600px at 20% -10%, rgba(109,77,255,0.25), transparent 50%),
                  radial-gradient(900px 500px at 85% 0%, rgba(0,255,200,0.12), transparent 45%),
                  var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      line-height: 1.6;
    }
    .shell { padding: 28px 18px 54px; }
    .container {
      max-width: 980px;
      margin: 0 auto;
      background: var(--panel);
      border: 1px solid var(--border);
      padding: 22px;
    }
    h1, h2, h3, h4 { line-height: 1.25; margin: 18px 0 10px; }
    h1 { font-size: 26px; margin-top: 0; }
    h2 { font-size: 20px; }
    h3 { font-size: 16px; color: var(--text); }
    p { margin: 10px 0; color: var(--muted); }
    a { color: var(--link); text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul, ol { margin: 10px 0 10px 20px; color: var(--muted); }
    li { margin: 6px 0; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 0.95em;
      background: var(--code-bg);
      padding: 2px 6px;
      border: 1px solid rgba(255,255,255,0.10);
    }
    pre {
      margin: 12px 0;
      padding: 14px;
      overflow: auto;
      background: var(--code-bg);
      border: 1px solid rgba(255,255,255,0.10);
    }
    pre code { background: transparent; border: none; padding: 0; }
    blockquote {
      margin: 12px 0;
      padding: 10px 14px;
      border-left: 3px solid rgba(109,77,255,0.65);
      background: rgba(0,0,0,0.18);
    }
    blockquote p { margin: 0; color: var(--muted); }
    hr {
      border: none;
      border-top: 1px solid rgba(255,255,255,0.10);
      margin: 16px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.10);
    }
    th, td {
      text-align: left;
      vertical-align: top;
      padding: 10px 10px;
      border-top: 1px solid rgba(255,255,255,0.08);
      color: var(--muted);
    }
    th {
      color: var(--text);
      background: rgba(0,0,0,0.25);
      border-top: none;
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="container">
      ${html}
    </div>
  </div>
</body>
</html>`;
}
