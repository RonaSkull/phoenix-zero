(function () {
  function normalizeUrl(url, base) {
    try {
      return new URL(url, base || document.baseURI).toString();
    } catch {
      return url;
    }
  }

  function createBadge() {
    var el = document.createElement('a');
    el.setAttribute('href', '#');
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noreferrer');
    el.style.display = 'inline-flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.gap = '8px';
    el.style.padding = '10px 12px';
    el.style.borderRadius = '9999px';
    el.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    el.style.fontSize = '14px';
    el.style.fontWeight = '600';
    el.style.textDecoration = 'none';
    el.style.border = '1px solid rgba(0,0,0,0.12)';
    el.style.background = '#f3f4f6';
    el.style.color = '#111827';
    el.textContent = 'Phoenix Zero — verificando…';
    return el;
  }

  function setBadgeState(badge, state) {
    if (!badge) return;

    if (state === 'verified') {
      badge.style.background = '#dcfce7';
      badge.style.color = '#14532d';
      badge.style.borderColor = 'rgba(20,83,45,0.25)';
      return;
    }

    if (state === 'suspected') {
      badge.style.background = '#fee2e2';
      badge.style.color = '#7f1d1d';
      badge.style.borderColor = 'rgba(127,29,29,0.25)';
      return;
    }

    if (state === 'not_verified') {
      badge.style.background = '#f3f4f6';
      badge.style.color = '#111827';
      badge.style.borderColor = 'rgba(0,0,0,0.12)';
      return;
    }

    badge.style.background = '#fef3c7';
    badge.style.color = '#78350f';
    badge.style.borderColor = 'rgba(120,53,15,0.25)';
  }

  async function runOne(hostEl) {
    if (!hostEl || hostEl.__phoenixZeroImageMountedV1) return;
    hostEl.__phoenixZeroImageMountedV1 = true;

    var apiBase = (hostEl.getAttribute('data-api-base') || '').trim();
    var imageUrl = (hostEl.getAttribute('data-image-url') || '').trim();
    var proofUrl = (hostEl.getAttribute('data-proof-url') || '').trim();

    if (!apiBase) {
      apiBase = window.location.origin;
    }

    imageUrl = normalizeUrl(imageUrl);
    proofUrl = normalizeUrl(proofUrl);

    var badge = createBadge();
    hostEl.innerHTML = '';
    hostEl.appendChild(badge);

    if (!imageUrl || !proofUrl) {
      badge.textContent = 'Phoenix Zero — faltam URLs';
      setBadgeState(badge, 'not_verified');
      return;
    }

    var endpoint =
      apiBase.replace(/\/+$/g, '') +
      '/api/auth-proxy?type=image&imageUrl=' +
      encodeURIComponent(imageUrl) +
      '&proofUrl=' +
      encodeURIComponent(proofUrl);

    try {
      var res = await fetch(endpoint, { method: 'GET', mode: 'cors', cache: 'no-store' });
      var json = await res.json().catch(function () {
        return null;
      });

      if (!json || json.ok !== true) {
        badge.textContent = 'Phoenix Zero — não verificado';
        setBadgeState(badge, 'not_verified');
        return;
      }

      var title = typeof json.title === 'string' ? json.title : 'Phoenix Zero';
      var hint = typeof json.hint === 'string' ? json.hint : '';
      var decision = typeof json.decision === 'string' ? json.decision : '';
      var shareUrl = typeof json.shareUrl === 'string' ? json.shareUrl : '';
      var verified = typeof json.verified === 'boolean' ? json.verified : null;

      badge.textContent = title;
      if (hint) badge.setAttribute('title', hint);
      if (shareUrl) badge.setAttribute('href', shareUrl);

      if (verified === true) {
        setBadgeState(badge, 'verified');
      } else if (decision === 'suspected_impersonation') {
        setBadgeState(badge, 'suspected');
      } else {
        setBadgeState(badge, 'not_verified');
      }
    } catch {
      badge.textContent = 'Phoenix Zero — erro';
      setBadgeState(badge, 'not_verified');
    }
  }

  function runAll() {
    var nodes = document.querySelectorAll('[data-phoenix-zero-image-embed]');
    for (var i = 0; i < nodes.length; i++) {
      runOne(nodes[i]);
    }
  }

  try {
    window.PhoenixZeroImageEmbed = { runAll: runAll, runOne: runOne };
  } catch {
  }

  try {
    var mo = new MutationObserver(function () {
      runAll();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch {
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAll);
  } else {
    runAll();
  }
})();
