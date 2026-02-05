'use client';

import { useMemo, useState } from 'react';

type ApiOk = { ok: true; requestId: string; createdAt: string };
type ApiErr = { ok: false; reasonCode?: string; message?: string; missingFields?: string[] };

type ApiRes = ApiOk | ApiErr;

function isEmailLike(s: string): boolean {
  const x = String(s || '').trim();
  if (!x) return false;
  if (x.length > 160) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x);
}

export default function DemoRequestForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [country, setCountry] = useState('');
  const [monthlyVolume, setMonthlyVolume] = useState('');
  const [message, setMessage] = useState('');

  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const disabled = useMemo(() => {
    return busy || !name.trim() || !email.trim() || !company.trim();
  }, [busy, name, email, company]);

  async function submit() {
    const n = name.trim();
    const e = email.trim();
    const c = company.trim();

    setOk(null);
    setErr(null);

    if (!n || !c) {
      setErr('Preencha nome e empresa.');
      return;
    }
    if (!isEmailLike(e)) {
      setErr('Email inválido.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          name: n,
          email: e,
          company: c,
          country: country.trim() || undefined,
          monthlyVolume: monthlyVolume.trim() || undefined,
          message: message.trim() || undefined,
          source: 'demo_page'
        })
      });

      const json = (await res.json().catch(() => null)) as ApiRes | null;
      if (!res.ok || !json || json.ok !== true) {
        const msg = (json as any)?.message ? String((json as any).message) : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      setOk(`Recebido. requestId=${json.requestId}`);
      setName('');
      setEmail('');
      setCompany('');
      setCountry('');
      setMonthlyVolume('');
      setMessage('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg || 'Falha ao enviar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
      <h2 style={{ marginTop: 0 }}>Request a technical demo</h2>
      <p style={{ marginTop: 8 }}>
        Envie seus dados e eu retorno com uma call técnica curta (30 min) para validar integração + provas públicas.
      </p>

      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        <label>
          Nome
          <input
            style={{ display: 'block', width: '100%', marginTop: 6 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome"
          />
        </label>

        <label>
          Email
          <input
            style={{ display: 'block', width: '100%', marginTop: 6 }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </label>

        <label>
          Empresa
          <input
            style={{ display: 'block', width: '100%', marginTop: 6 }}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Company"
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <label>
            País (opcional)
            <input
              style={{ display: 'block', width: '100%', marginTop: 6 }}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="US / BR / ..."
            />
          </label>

          <label>
            Volume mensal (opcional)
            <input
              style={{ display: 'block', width: '100%', marginTop: 6 }}
              value={monthlyVolume}
              onChange={(e) => setMonthlyVolume(e.target.value)}
              placeholder="$10k, $1M, ..."
            />
          </label>
        </div>

        <label>
          Mensagem (opcional)
          <textarea
            style={{ display: 'block', width: '100%', marginTop: 6, minHeight: 96 }}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Provider atual, blockchains, dores de reconciliação, etc."
          />
        </label>

        <button onClick={submit} disabled={disabled} style={{ maxWidth: 240, padding: '10px 12px' }}>
          {busy ? 'Enviando…' : 'Enviar'}
        </button>

        {ok ? <div style={{ color: '#0a7a1f' }}>{ok}</div> : null}
        {err ? <div style={{ color: '#b00020' }}>{err}</div> : null}
      </div>
    </section>
  );
}
