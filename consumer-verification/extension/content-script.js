const DEFAULT_VERIFY_ORIGIN = 'http://localhost:3000';

let lastKey = '';
let verifying = false;
let lastAttemptAt = 0;
let lastNoProofReportAt = 0;

let lastBadgeState = null;

let cachedVerifyOrigin = '';

async function getVerifyOrigin() {
  if (cachedVerifyOrigin) return cachedVerifyOrigin;
  const resp = await chrome.runtime.sendMessage({ type: 'getSettings' }).catch(() => null);
  const v = resp && typeof resp.verifyOrigin === 'string' ? String(resp.verifyOrigin).trim() : '';
  cachedVerifyOrigin = v || DEFAULT_VERIFY_ORIGIN;
  return cachedVerifyOrigin;
}

function normalizeOrigin(input) {
  try {
    const u = new URL(String(input || '').trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.origin;
  } catch {
    return '';
  }
}

function guessVerifyOrigin(proofUrl, videoUrl) {
  const p = normalizeOrigin(proofUrl);
  if (p) return p;
  const v = normalizeOrigin(videoUrl);
  if (v) return v;
  return '';
}

function repositionBadgeIfNeeded() {
  if (!lastBadgeState) return;
  upsertBadge(lastBadgeState);
}

function findProofUrl() {
  const anchors = Array.from(document.querySelectorAll('a[href]'));
  for (const a of anchors) {
    try {
      const href = String(a.href || '');
      if (!href) continue;
      const h = href.toLowerCase();
      if (h.endsWith('proof.json') || h.includes('/proof.json') || h.includes('.proof.json')) return href;
      if (h.includes('phoenix') && h.includes('proof') && h.endsWith('.json')) return href;
    } catch {
    }
  }
  return null;
}

function findVideoUrl() {
  const v = document.querySelector('video');
  if (!v) return null;
  const src = v.currentSrc || v.src || '';
  if (!src) return null;
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  return null;
}

function upsertBadge(state) {
  lastBadgeState = state;

  const id = 'phoenix-zero-consumer-badge';
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.position = 'fixed';
    el.style.zIndex = '2147483647';
    el.style.padding = '12px 14px';
    el.style.borderRadius = '999px';
    el.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial';
    el.style.fontSize = '14px';
    el.style.fontWeight = '700';
    el.style.boxShadow = '0 10px 26px rgba(0,0,0,0.28)';
    el.style.cursor = 'pointer';
    document.documentElement.appendChild(el);
  }

  el.style.background = state.bg;
  el.style.color = state.fg;
  el.textContent = state.text;
  el.onclick = state.onClick;

  const v = document.querySelector('video');
  if (v) {
    const r = v.getBoundingClientRect();
    const top = Math.max(12, Math.floor(r.top + 12));
    const left = Math.max(12, Math.floor(r.left + 12));
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  } else {
    el.style.top = 'auto';
    el.style.left = 'auto';
    el.style.right = '16px';
    el.style.bottom = '16px';
  }
}

async function verifyIfPossible(proofUrl, videoUrl) {
  const verifyOriginHint = guessVerifyOrigin(proofUrl, videoUrl);
  chrome.runtime.sendMessage({ type: 'report', state: proofUrl ? 'proof_found' : 'no_proof', proofUrl, videoUrl, verifyOriginHint, pageUrl: window.location.href });

  if (!proofUrl || !videoUrl) {
    upsertBadge({
      text: proofUrl ? 'Prova encontrada' : 'Sem prova',
      bg: '#111827',
      fg: '#ffffff',
      onClick: () => openVerify(proofUrl, videoUrl)
    });
    return;
  }

  upsertBadge({
    text: 'Verificando…',
    bg: '#111827',
    fg: '#ffffff',
    onClick: () => openVerify(proofUrl, videoUrl)
  });

  verifying = true;

  chrome.runtime.sendMessage(
    { type: 'verify', proofUrl, videoUrl, verifyOriginHint },
    (resp) => {
      verifying = false;

      if (!resp || resp.ok !== true) {
        upsertBadge({
          text: 'Prova encontrada',
          bg: '#111827',
          fg: '#ffffff',
          onClick: () => openVerify(proofUrl, videoUrl)
        });
        return;
      }

      const result = resp.result;
      const verified = !!(resp.httpOk && result && result.ok === true);
      const decision = result && typeof result.decision === 'string' ? result.decision : '';
      const identityStatus = result && result.identity && typeof result.identity.status === 'string' ? result.identity.status : '';
      const attOk = !!(result && result.attestation && result.attestation.ok === true);

      if (!verified) {
        upsertBadge({
          text: 'Falhou (clique para detalhes)',
          bg: '#7f1d1d',
          fg: '#ffffff',
          onClick: () => openVerify(proofUrl, videoUrl)
        });
        return;
      }

      if (decision === 'suspected_impersonation') {
        upsertBadge({
          text: 'Suspeito (clique)',
          bg: '#7f1d1d',
          fg: '#ffffff',
          onClick: () => openVerify(proofUrl, videoUrl)
        });
        return;
      }

      if (decision === 'verified_unregistered_creator') {
        upsertBadge({
          text: identityStatus === 'unknown' ? 'Autêntico (criador não informado)' : 'Autêntico (criador não verificado)',
          bg: '#92400e',
          fg: '#ffffff',
          onClick: () => openVerify(proofUrl, videoUrl)
        });
        return;
      }

      upsertBadge({
        text: attOk ? 'Autêntico ✅+' : 'Autêntico ✅',
        bg: '#065f46',
        fg: '#ffffff',
        onClick: () => openVerify(proofUrl, videoUrl)
      });
    }
  );
}

function openVerify(proofUrl, videoUrl) {
  (async () => {
    const settings = await chrome.runtime.sendMessage({ type: 'getSettings' }).catch(() => null);
    const originFromSettings = settings && typeof settings.verifyOrigin === 'string' ? String(settings.verifyOrigin).trim() : '';
    const source = settings && typeof settings.source === 'string' ? String(settings.source) : '';
    const hint = guessVerifyOrigin(proofUrl, videoUrl);
    const verifyOrigin = source === 'auto' && hint ? hint : (originFromSettings || DEFAULT_VERIFY_ORIGIN);
    const u = new URL(`${verifyOrigin}/verify`);
    if (proofUrl) u.searchParams.set('proofUrl', proofUrl);
    if (videoUrl) u.searchParams.set('videoUrl', videoUrl);
    u.searchParams.set('pageUrl', window.location.href);
    chrome.runtime.sendMessage({ type: 'open', url: u.toString() });
  })();
}

function run() {
  const proofUrl = findProofUrl();
  if (!proofUrl) {
    const now = Date.now();
    if (now - lastNoProofReportAt > 10000) {
      lastNoProofReportAt = now;
      chrome.runtime.sendMessage({ type: 'report', state: 'no_proof', proofUrl: '', videoUrl: '', verifyOriginHint: '', pageUrl: window.location.href });
    }
    return;
  }
  const videoUrl = findVideoUrl();

  const key = `${proofUrl}::${videoUrl || ''}`;
  const now = Date.now();

  if (key === lastKey) {
    if (verifying) return;
    if (now - lastAttemptAt < 2500) return;
  }

  lastKey = key;
  lastAttemptAt = now;
  verifyIfPossible(proofUrl, videoUrl);
}

run();

const obs = new MutationObserver(() => run());
obs.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('scroll', repositionBadgeIfNeeded, { passive: true });
window.addEventListener('resize', repositionBadgeIfNeeded);
