async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];
  return tab && typeof tab.id === 'number' ? tab.id : null;
}

function setStatus(text, kind) {
  const el = document.getElementById('status');
  if (!el) return;
  el.className = `status ${kind}`;
  el.textContent = text;
}

async function refresh() {
  const tabId = await getActiveTabId();

  const settings = await chrome.runtime.sendMessage({ type: 'getSettings' }).catch(() => null);
  const verifyOriginFromSettings = settings && typeof settings.verifyOrigin === 'string' ? String(settings.verifyOrigin).trim() : '';
  const verifyOriginUser = settings && typeof settings.verifyOriginUser === 'string' ? String(settings.verifyOriginUser).trim() : '';
  const verifyOriginAuto = settings && typeof settings.verifyOriginAuto === 'string' ? String(settings.verifyOriginAuto).trim() : '';
  const source = settings && typeof settings.source === 'string' ? String(settings.source) : '';
  const verifyOriginInput = document.getElementById('verifyOrigin');
  if (verifyOriginInput && verifyOriginFromSettings) {
    verifyOriginInput.value = verifyOriginFromSettings;
  }

  const status = tabId != null ? await chrome.runtime.sendMessage({ type: 'getStatus', tabId }).catch(() => null) : null;

  const originInfo = document.getElementById('originInfo');
  if (originInfo) {
    const used = status && typeof status.verifyOriginUsed === 'string' ? String(status.verifyOriginUsed).trim() : '';
    const hint = status && typeof status.verifyOriginHint === 'string' ? String(status.verifyOriginHint).trim() : '';
    const resolved = used || verifyOriginFromSettings;

    if (source === 'user') {
      originInfo.textContent = `Fonte: manual (${verifyOriginUser || resolved})`;
    } else {
      const detected = hint || verifyOriginAuto || resolved;
      originInfo.textContent = `Fonte: auto (detectado: ${detected})`;
    }
  }

  const openDetails = document.getElementById('openDetails');
  if (openDetails) openDetails.disabled = true;

  const state = status && typeof status.state === 'string' ? status.state : '';
  const attOk = !!(status && status.result && status.result.attestation && status.result.attestation.ok === true);

  if (!state) {
    setStatus('Sem prova detectada nesta página.', 'warn');
    return;
  }

  if (state === 'verified_ok') {
    setStatus(attOk ? 'Autêntico ✅+' : 'Autêntico ✅', 'ok');
  } else if (state === 'verified_warn') {
    setStatus('Autêntico (criador não verificado)', 'mid');
  } else if (state === 'verified_suspect') {
    setStatus('Suspeito (possível impostor)', 'bad');
  } else if (state === 'verified_fail') {
    setStatus('Falhou / Suspeito', 'bad');
  } else if (state === 'proof_found') {
    setStatus('Prova encontrada. Verificando…', 'warn');
  } else if (state === 'no_proof') {
    setStatus('Sem prova detectada nesta página.', 'warn');
  } else {
    setStatus('Prova encontrada. Clique para detalhes.', 'warn');
  }

  if (openDetails && status.proofUrl && status.videoUrl) {
    openDetails.disabled = false;
    openDetails.onclick = async () => {
      const settings2 = await chrome.runtime.sendMessage({ type: 'getSettings' }).catch(() => null);
      const verifyOriginSetting = settings2 && typeof settings2.verifyOrigin === 'string' ? String(settings2.verifyOrigin).trim() : '';
      const verifyOrigin = (status.verifyOriginUsed && String(status.verifyOriginUsed).trim()) || verifyOriginSetting;
      const u = new URL(`${verifyOrigin}/verify`);
      u.searchParams.set('proofUrl', status.proofUrl);
      u.searchParams.set('videoUrl', status.videoUrl);
      if (status.pageUrl) u.searchParams.set('pageUrl', status.pageUrl);
      chrome.runtime.sendMessage({ type: 'open', url: u.toString() });
      window.close();
    };
  }
}

document.getElementById('openDemo')?.addEventListener('click', async () => {
  const settings = await chrome.runtime.sendMessage({ type: 'getSettings' }).catch(() => null);
  let verifyOrigin = settings && typeof settings.verifyOrigin === 'string' ? String(settings.verifyOrigin).trim() : '';

  if (!verifyOrigin) {
    const tabId = await getActiveTabId();
    const status = tabId != null ? await chrome.runtime.sendMessage({ type: 'getStatus', tabId }).catch(() => null) : null;
    const used = status && typeof status.verifyOriginUsed === 'string' ? String(status.verifyOriginUsed).trim() : '';
    const hint = status && typeof status.verifyOriginHint === 'string' ? String(status.verifyOriginHint).trim() : '';
    verifyOrigin = used || hint;
  }

  if (!verifyOrigin) return;
  chrome.runtime.sendMessage({ type: 'open', url: `${verifyOrigin}/demo` });
  window.close();
});

document.getElementById('save')?.addEventListener('click', async () => {
  const input = document.getElementById('verifyOrigin');
  const v = input && 'value' in input ? String(input.value || '').trim() : '';
  if (!v) return;
  await chrome.runtime.sendMessage({ type: 'setSettings', verifyOrigin: v }).catch(() => null);
  await refresh();
});

document.getElementById('useAuto')?.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'clearSettings' }).catch(() => null);
  await refresh();
});

document.getElementById('refresh')?.addEventListener('click', async () => {
  await refresh();
});

refresh();
