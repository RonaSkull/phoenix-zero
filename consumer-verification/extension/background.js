const DEFAULT_VERIFY_ORIGIN = 'http://localhost:3000';

const tabStatus = new Map();

function normalizeOrigin(input) {
  try {
    const u = new URL(String(input || '').trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.origin;
  } catch {
    return '';
  }
}

async function getVerifyOrigin() {
  const v = await chrome.storage.local.get(['verifyOrigin', 'verifyOriginUser', 'verifyOriginAuto']).catch(() => ({}));
  const legacy = v && typeof v.verifyOrigin === 'string' ? normalizeOrigin(v.verifyOrigin) : '';
  const user = v && typeof v.verifyOriginUser === 'string' ? normalizeOrigin(v.verifyOriginUser) : '';
  const auto = v && typeof v.verifyOriginAuto === 'string' ? normalizeOrigin(v.verifyOriginAuto) : '';
  return user || legacy || auto || DEFAULT_VERIFY_ORIGIN;
}

async function hasUserVerifyOrigin() {
  const v = await chrome.storage.local.get(['verifyOrigin', 'verifyOriginUser']).catch(() => ({}));
  const legacy = v && typeof v.verifyOrigin === 'string' ? normalizeOrigin(v.verifyOrigin) : '';
  const user = v && typeof v.verifyOriginUser === 'string' ? normalizeOrigin(v.verifyOriginUser) : '';
  return Boolean(user || legacy);
}

function setTabStatus(tabId, status) {
  if (typeof tabId !== 'number') return;
  tabStatus.set(tabId, status);
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (!details || details.reason !== 'install') return;
  const verifyOrigin = await getVerifyOrigin();
  chrome.tabs.create({ url: `${verifyOrigin}/demo` });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === 'open') {
    if (typeof msg.url !== 'string' || !msg.url) return;
    chrome.tabs.create({ url: msg.url });
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'getSettings') {
    (async () => {
      const verifyOrigin = await getVerifyOrigin();
      const userSet = await hasUserVerifyOrigin();
      const v = await chrome.storage.local.get(['verifyOrigin', 'verifyOriginUser', 'verifyOriginAuto']).catch(() => ({}));
      const legacy = v && typeof v.verifyOrigin === 'string' ? normalizeOrigin(v.verifyOrigin) : '';
      const user = v && typeof v.verifyOriginUser === 'string' ? normalizeOrigin(v.verifyOriginUser) : '';
      const auto = v && typeof v.verifyOriginAuto === 'string' ? normalizeOrigin(v.verifyOriginAuto) : '';
      sendResponse({ ok: true, verifyOrigin, source: userSet ? 'user' : 'auto', verifyOriginUser: user || legacy, verifyOriginAuto: auto });
    })();
    return true;
  }

  if (msg.type === 'clearSettings') {
    (async () => {
      await chrome.storage.local.remove(['verifyOrigin', 'verifyOriginUser']).catch(() => null);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === 'setSettings') {
    const verifyOrigin = typeof msg.verifyOrigin === 'string' ? String(msg.verifyOrigin).trim() : '';
    const normalized = normalizeOrigin(verifyOrigin);
    if (!normalized) {
      sendResponse({ ok: false, reason: 'Missing verifyOrigin.' });
      return;
    }

    (async () => {
      await chrome.storage.local.set({ verifyOriginUser: normalized }).catch(() => null);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === 'getStatus') {
    const tabId = typeof msg.tabId === 'number' ? msg.tabId : null;
    if (tabId == null) {
      sendResponse({ ok: false, reason: 'Missing tabId.' });
      return;
    }
    const s = tabStatus.get(tabId) || null;
    sendResponse({ ok: true, ...s });
    return;
  }

  if (msg.type === 'report') {
    const senderTabId = _sender && _sender.tab && typeof _sender.tab.id === 'number' ? _sender.tab.id : null;
    if (senderTabId == null) {
      sendResponse({ ok: false, reason: 'Missing sender tab.' });
      return;
    }

    const state = typeof msg.state === 'string' ? msg.state : '';
    const proofUrl = typeof msg.proofUrl === 'string' ? msg.proofUrl : '';
    const videoUrl = typeof msg.videoUrl === 'string' ? msg.videoUrl : '';
    const pageUrl = typeof msg.pageUrl === 'string' ? msg.pageUrl : undefined;
    const verifyOriginHint = typeof msg.verifyOriginHint === 'string' ? msg.verifyOriginHint : undefined;

    if (state) {
      setTabStatus(senderTabId, { state, proofUrl, videoUrl, pageUrl, verifyOriginHint });
    }

    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'verify') {
    const proofUrl = typeof msg.proofUrl === 'string' ? msg.proofUrl : '';
    const videoUrl = typeof msg.videoUrl === 'string' ? msg.videoUrl : '';
    const verifyOriginHint = typeof msg.verifyOriginHint === 'string' ? normalizeOrigin(msg.verifyOriginHint) : '';
    const senderTabId = _sender && _sender.tab && typeof _sender.tab.id === 'number' ? _sender.tab.id : null;
    const pageUrl = _sender && _sender.tab && typeof _sender.tab.url === 'string' ? _sender.tab.url : undefined;

    if (!proofUrl || !videoUrl) {
      if (senderTabId != null) {
        setTabStatus(senderTabId, { state: proofUrl ? 'proof_found' : 'no_proof', proofUrl, videoUrl, pageUrl });
      }
      sendResponse({ ok: false, reason: 'Missing proofUrl or videoUrl.' });
      return;
    }

    (async () => {
      try {
        const userSet = await hasUserVerifyOrigin();
        let verifyOrigin = await getVerifyOrigin();
        if (!userSet && verifyOriginHint) {
          verifyOrigin = verifyOriginHint;
          await chrome.storage.local.set({ verifyOriginAuto: verifyOriginHint }).catch(() => null);
        }
        if (senderTabId != null) {
          setTabStatus(senderTabId, { state: 'proof_found', proofUrl, videoUrl, pageUrl, verifyOriginUsed: verifyOrigin, verifyOriginHint });
        }

        const res = await fetch(`${verifyOrigin}/api/phoenix-zero/verify-by-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proofUrl, videoUrl })
        });

        const json = await res.json().catch(() => null);
        const decision = json && typeof json.decision === 'string' ? json.decision : '';
        const verified = !!(res.ok && json && json.ok === true);

        const state = !verified
          ? 'verified_fail'
          : decision === 'suspected_impersonation'
            ? 'verified_suspect'
            : decision === 'verified_unregistered_creator'
              ? 'verified_warn'
              : 'verified_ok';

        if (senderTabId != null) {
          setTabStatus(senderTabId, {
            state,
            proofUrl,
            videoUrl,
            pageUrl,
            verifyOriginUsed: verifyOrigin,
            verifyOriginHint,
            result: json
          });
        }
        sendResponse({ ok: true, httpOk: res.ok, status: res.status, result: json });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (senderTabId != null) {
          setTabStatus(senderTabId, { state: 'proof_found', proofUrl, videoUrl, pageUrl });
        }
        sendResponse({ ok: false, reason: message });
      }
    })();

    return true;
  }
});
