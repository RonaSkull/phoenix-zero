'use client';

import { useCallback, useMemo, useState } from 'react';

export function VerifyActionsClient(props: { proofId: string; url?: string }) {
  const proofId = String(props.proofId || '').trim();
  const urlProp = String(props.url || '').trim();
  const url = useMemo(() => {
    if (urlProp) return urlProp;
    if (!proofId) return '';
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/verify/${encodeURIComponent(proofId)}`;
  }, [proofId, urlProp]);

  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      } catch {
        setCopied(false);
      }
    }
  }, [url]);

  return (
    <button
      type="button"
      onClick={onCopy}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '10px 12px',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(0,0,0,0.10)',
        color: 'rgba(255,255,255,0.88)',
        textDecoration: 'none',
        fontWeight: 700,
        fontSize: 13,
        cursor: url ? 'pointer' : 'not-allowed',
        opacity: url ? 1 : 0.65
      }}
      aria-label="Copy proof URL"
      disabled={!url}
    >
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}
