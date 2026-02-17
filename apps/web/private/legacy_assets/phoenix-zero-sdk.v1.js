(function () {
  function normalizeUrl(url, base) {
    try {
      return new URL(url, base || document.baseURI).toString();
    } catch {
      return url;
    }
  }

  function normalizeBase(apiBase) {
    apiBase = (apiBase || '').trim();
    if (!apiBase) apiBase = (typeof window !== 'undefined' && window.location ? window.location.origin : '');
    apiBase = normalizeUrl(apiBase);
    return apiBase.replace(/\/+$/g, '');
  }

  async function fetchJson(fetchImpl, url, init) {
    try {
      var res = await fetchImpl(url, init);
      var json = await res.json().catch(function () {
        return null;
      });
      if (!json || typeof json.ok !== 'boolean') {
        return { ok: false, reason: 'Invalid JSON response', status: res && typeof res.status === 'number' ? res.status : undefined };
      }
      return json;
    } catch (e) {
      var msg = e && e.message ? e.message : 'Network error';
      return { ok: false, reason: msg };
    }
  }

  function createClient(opts) {
    opts = opts || {};
    var apiBase = normalizeBase(opts.apiBase);
    var fetchImpl = opts.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);

    if (!fetchImpl) {
      return {
        apiBase: apiBase,
        verifyVideoByUrl: function () {
          return Promise.resolve({ ok: false, reason: 'fetch is not available in this environment' });
        },
        verifyImageByUrl: function () {
          return Promise.resolve({ ok: false, reason: 'fetch is not available in this environment' });
        },
        verifyLiveByJobId: function () {
          return Promise.resolve({ ok: false, reason: 'fetch is not available in this environment' });
        }
      };
    }

    function verifyVideoByUrl(params) {
      params = params || {};
      var videoUrl = (params.videoUrl || '').trim();
      var proofUrl = (params.proofUrl || '').trim();
      var includeUpstream = params.includeUpstream === true ? '1' : '0';
      var url =
        apiBase +
        '/api/auth-proxy?type=video&videoUrl=' +
        encodeURIComponent(videoUrl) +
        '&proofUrl=' +
        encodeURIComponent(proofUrl) +
        '&includeUpstream=' +
        includeUpstream;
      return fetchJson(fetchImpl, url, { method: 'GET', mode: 'cors', cache: 'no-store', signal: params.signal });
    }

    function verifyImageByUrl(params) {
      params = params || {};
      var imageUrl = (params.imageUrl || '').trim();
      var proofUrl = (params.proofUrl || '').trim();
      var includeUpstream = params.includeUpstream === true ? '1' : '0';
      var url =
        apiBase +
        '/api/auth-proxy?type=image&imageUrl=' +
        encodeURIComponent(imageUrl) +
        '&proofUrl=' +
        encodeURIComponent(proofUrl) +
        '&includeUpstream=' +
        includeUpstream;
      return fetchJson(fetchImpl, url, { method: 'GET', mode: 'cors', cache: 'no-store', signal: params.signal });
    }

    function verifyLiveByJobId(params) {
      params = params || {};
      var jobId = (params.jobId || '').trim();
      var includeUpstream = params.includeUpstream === true ? '1' : '0';
      var url =
        apiBase +
        '/api/auth-proxy?type=live&jobId=' +
        encodeURIComponent(jobId) +
        '&includeUpstream=' +
        includeUpstream;
      return fetchJson(fetchImpl, url, { method: 'GET', mode: 'cors', cache: 'no-store', signal: params.signal });
    }

    return {
      apiBase: apiBase,
      verifyVideoByUrl: verifyVideoByUrl,
      verifyImageByUrl: verifyImageByUrl,
      verifyLiveByJobId: verifyLiveByJobId
    };
  }

  try {
    globalThis.PhoenixZeroSDK = { createClient: createClient };
  } catch {
  }
})();
