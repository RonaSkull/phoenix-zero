import { chromium, expect, test } from '@playwright/test';
import { access, mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { dirname } from 'node:path';

type PlatformKey =
  | 'whatsapp'
  | 'instagram'
  | 'tiktok'
  | 'linkedin'
  | 'twitter'
  | 'telegram'
  | 'discord'
  | 'slack'
  | 'youtube';

function isEnabled() {
  return process.env.PW_SOCIAL_FLOWS === '1';
}

let cachedApiKey: string | null = null;

async function getTestApiKey(request: any): Promise<string> {
  if (cachedApiKey) return cachedApiKey;

  const predefined = (process.env.PHOENIX_ZERO_TEST_API_KEY || '').trim();
  if (predefined) {
    cachedApiKey = predefined;
    return cachedApiKey;
  }

  const adminToken = process.env.PHOENIX_ZERO_ADMIN_TOKEN || '';
  const res = await request.post('/api/admin/tenants', {
    headers: adminToken ? { 'x-admin-token': adminToken } : undefined,
    data: { name: `pw-social-${Date.now()}` }
  });

  expect(res.ok()).toBeTruthy();
  const json = (await res.json()) as any;
  expect(json && json.ok === true).toBeTruthy();
  expect(typeof json.apiKey).toBe('string');
  cachedApiKey = String(json.apiKey);
  return cachedApiKey;
}

function isStepMode() {
  return process.env.PW_SOCIAL_STEP === '1';
}

function isHoldOpen() {
  return process.env.PW_SOCIAL_HOLD === '1';
}

function effectiveWaitMs(): number {
  const ms = waitMs();
  return ms !== null ? ms : 0;
}

function statePath(): string {
  return process.env.PW_SOCIAL_STATE_PATH || 'playwright-artifacts/social.storage.json';
}

function userDataDir(): string | null {
  const raw = (process.env.PW_SOCIAL_USER_DATA_DIR || '').trim();
  return raw ? raw : null;
}

function browserChannel(): string | null {
  const raw = (process.env.PW_BROWSER_CHANNEL || '').trim();
  return raw ? raw : null;
}

function waitMs(): number | null {
  const raw = (process.env.PW_SOCIAL_WAIT_MS || '').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function skipPlatforms(): Set<string> {
  const raw = (process.env.PW_SOCIAL_SKIP_PLATFORMS || '').trim();
  if (!raw) return new Set();
  const parts = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set(parts);
}

function whatsappPhoneDigits(): string | null {
  const raw = (process.env.PW_SOCIAL_WHATSAPP_PHONE || process.env.PW_WHATSAPP_PHONE || '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

function isWhatsAppAutoSendEnabled() {
  return process.env.PW_SOCIAL_WHATSAPP_SEND === '1';
}

function isStrictWhatsApp() {
  return process.env.PW_SOCIAL_STRICT_WHATSAPP === '1';
}

async function tryEnsureWhatsAppText(tab: any, shareUrl: string): Promise<boolean> {
  try {
    const boxSelectors = [
      // WhatsApp often uses aria-label=Message/Mensagem on the editable input.
      'div[role="textbox"][contenteditable="true"][aria-label]',
      'div[contenteditable="true"][aria-label]',
      'div[role="textbox"][aria-label]',
      'div[role="textbox"][contenteditable="true"]',
      'div[contenteditable="true"][data-tab]',
      'div[role="textbox"]'
    ];

    for (const sel of boxSelectors) {
      try {
        const loc = tab.locator(sel).first();
        if ((await loc.count()) === 0) continue;
        await loc.waitFor({ timeout: 2000 });
        await loc.click({ timeout: 1200 });
        const current = await loc.evaluate((el: any) => (el?.textContent as string) || '').catch(() => '');
        if (current && current.includes(shareUrl)) return true;
        await tab.keyboard.press('Control+A').catch(() => undefined);
        await tab.keyboard.type(shareUrl, { delay: 5 }).catch(() => undefined);
        return true;
      } catch {
        // ignore
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function tryOpenWhatsAppChatFromList(tab: any, phoneDigits: string): Promise<boolean> {
  try {
    if (!phoneDigits) return false;
    const tail = phoneDigits.slice(-8);
    const candidates: Array<string | RegExp> = [phoneDigits, `+${phoneDigits}`, tail, new RegExp(tail)];

    // Give the sidebar time to render.
    await tab.waitForTimeout(800).catch(() => undefined);

    for (const c of candidates) {
      try {
        const row = tab
          .locator('div[role="listitem"], div[role="row"], div[role="gridcell"], div[role="button"]')
          .filter({ hasText: c as any })
          .first();
        if ((await row.count()) === 0) continue;
        await row.click({ timeout: 1500 });
        await tab.waitForTimeout(600).catch(() => undefined);
        return true;
      } catch {
        // ignore
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function tryAutoSendWhatsApp(tab: any, shareUrl: string): Promise<boolean> {
  if (!isWhatsAppAutoSendEnabled()) return false;
  try {
    if (typeof tab?.isClosed === 'function' && tab.isClosed()) return false;
    await tab.waitForTimeout(400);

    // Ensure we're in a chat textbox; deep links sometimes open a landing view.
    let hasBox = await tryEnsureWhatsAppText(tab, shareUrl).catch(() => false);
    if (!hasBox) {
      const phone = whatsappPhoneDigits();
      if (phone) {
        await tryOpenWhatsAppChatFromList(tab, phone).catch(() => false);
        hasBox = await tryEnsureWhatsAppText(tab, shareUrl).catch(() => false);
      }
    }

    if (!hasBox) return false;

    const sendSelectors = [
      'button[aria-label="Send"]',
      'div[role="button"][aria-label="Send"]',
      'button:has(span[data-icon="send"])',
      'span[data-icon="send"]'
    ];

    for (const sel of sendSelectors) {
      try {
        const loc = tab.locator(sel).first();
        if ((await loc.count()) === 0) continue;
        await loc.click({ timeout: 1200 });
        return true;
      } catch {
        // ignore
      }
    }

    // Fallback: press Enter in the message box.
    await tab.keyboard.press('Enter').catch(() => undefined);
    return true;

  } catch {
    return false;
  }
}

async function looksLikeWhatsAppLoggedIn(tab: any): Promise<boolean> {
  try {
    // Prefer positive signals of a logged-in UI.
    const candidates = [
      '#pane-side',
      'div[aria-label*="Pesquisar" i]',
      'div[aria-label*="Search" i]',
      'input[placeholder*="Pesquisar" i]',
      'input[placeholder*="Search" i]',
      'div[role="application"]'
    ];

    for (const sel of candidates) {
      try {
        const el = tab.locator(sel).first();
        if ((await el.count()) === 0) continue;
        const visible = await el.isVisible().catch(() => false);
        if (visible) return true;
      } catch {
        // ignore
      }
    }

    // Negative signal: QR container frequently contains a canvas.
    const qrCanvas = tab.locator('canvas').first();
    if ((await qrCanvas.count()) > 0) {
      const visible = await qrCanvas.isVisible().catch(() => false);
      if (visible) return false;
    }

    return false;
  } catch {
    return false;
  }
}

async function tryConfirmWhatsAppSent(tab: any, shareUrl: string): Promise<boolean> {
  try {
    if (typeof tab?.isClosed === 'function' && tab.isClosed()) return false;
    // 1) Strong signal: an outgoing bubble contains the full URL (text mode)
    const outText = tab.locator('div.message-out').filter({ hasText: shareUrl }).first();
    if (await outText.count()) {
      await outText.waitFor({ timeout: 2500 });
      return true;
    }

    // 2) Link is rendered as <a href="..."> inside outgoing bubble
    const outLink = tab
      .locator('div.message-out a[href]')
      .filter({ has: tab.locator(`a[href*="${shareUrl.replace(/"/g, '')}"]`) })
      .first();
    try {
      await outLink.waitFor({ timeout: 1200 });
      return true;
    } catch {
      // continue
    }

    // 3) Common fallback: outgoing bubble contains our /s/ path even if host is transformed
    try {
      const path = new URL(shareUrl).pathname;
      const outPath = tab.locator('div.message-out').filter({ hasText: path }).first();
      await outPath.waitFor({ timeout: 1200 });
      return true;
    } catch {
      // continue
    }

    // 4) Weak signal: textbox no longer contains the URL after send (message likely submitted)
    const box = tab.locator('div[role="textbox"][contenteditable="true"]').first();
    if ((await box.count()) > 0) {
      const current = await box.evaluate((el: any) => (el?.textContent as string) || '').catch(() => '');
      if (!current.includes(shareUrl)) return true;
    }

    return false;
  } catch {
    try {
      const anyMsg = tab.locator('span.selectable-text').filter({ hasText: shareUrl }).first();
      await anyMsg.waitFor({ timeout: 1200 });
      return true;
    } catch {
      return false;
    }
  }
}

async function safeScreenshot(tab: any, path: string): Promise<boolean> {
  try {
    if (typeof tab?.isClosed === 'function' && tab.isClosed()) return false;
    await tab.screenshot({ path, fullPage: false });
    return true;
  } catch {
    try {
      if (typeof tab?.isClosed === 'function' && tab.isClosed()) return false;
      await tab.screenshot({ path, fullPage: true });
      return true;
    } catch {
      return false;
    }
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function waitForEnter(prompt: string) {
  const ms = waitMs();
  if (ms !== null) {
    process.stdout.write(`${prompt}\nWaiting ${ms}ms...\n`);

    if (!process.stdin.isTTY) {
      await new Promise((r) => setTimeout(r, ms));
      return;
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      await Promise.race([
        new Promise<void>((r) => setTimeout(r, ms)),
        rl.question('(Press ENTER to continue early) ').then(() => undefined)
      ]);
    } finally {
      rl.close();
    }
    return;
  }

  if (!process.stdin.isTTY) {
    const fallbackMs = 120_000;
    process.stdout.write(
      `${prompt}\nNo TTY available; falling back to timed wait (${fallbackMs}ms). Set PW_SOCIAL_WAIT_MS to customize.\n`
    );
    await new Promise((r) => setTimeout(r, fallbackMs));
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question(`${prompt}\n(Click this terminal and press ENTER to continue) `);
  } finally {
    rl.close();
  }
}

async function makeShareUrl(params: { request: any; baseURL: string }) {
  const videoUrl = new URL('/demo/assets/v1/watermarked.mp4', params.baseURL).toString();
  const proofUrl = new URL('/demo/assets/v1/proof.json', params.baseURL).toString();

  const apiKey = await getTestApiKey(params.request);

  const shareRes = await params.request.post('/api/share-link', {
    headers: { 'x-api-key': apiKey },
    data: { videoUrl, proofUrl }
  });

  expect(shareRes.ok()).toBeTruthy();
  const shareJson = (await shareRes.json()) as { shareUrl?: string };
  const shareUrl = shareJson.shareUrl || '';
  expect(shareUrl).toMatch(/^https?:\/\//);
  return shareUrl;
}

function shareIntentUrl(platform: PlatformKey, shareUrl: string): string {
  const u = encodeURIComponent(shareUrl);

  switch (platform) {
    case 'whatsapp':
      // Web share composer
      {
        const phone = whatsappPhoneDigits();
        return phone
          ? `https://web.whatsapp.com/send/?phone=${phone}&text=${u}&type=phone_number&app_absent=0`
          : `https://web.whatsapp.com/send?text=${u}`;
      }

    case 'telegram':
      return `https://t.me/share/url?url=${u}`;

    case 'linkedin':
      return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;

    case 'twitter':
      return `https://twitter.com/intent/tweet?url=${u}`;

    case 'discord':
      // Discord has no official share intent web URL. We open the app web; user pastes link.
      return 'https://discord.com/channels/@me';

    case 'slack':
      // Slack requires a workspace; user pastes link.
      return 'https://slack.com/signin';

    case 'youtube':
      // Upload/share is not a single deterministic URL; open studio.
      return 'https://studio.youtube.com/';

    case 'instagram':
      // IG web posting is limited; open and user completes.
      return 'https://www.instagram.com/';

    case 'tiktok':
      return 'https://www.tiktok.com/';

    default:
      return shareUrl;
  }
}

function instructions(platform: PlatformKey, shareUrl: string): string {
  switch (platform) {
    case 'whatsapp':
      return `WhatsApp Web: confirme login/QR se necessário. Cole/valide que o texto contém o link:\n${shareUrl}\nDepois envie para um chat de teste e confirme se o preview aparece.`;
    case 'telegram':
      return `Telegram share: confirme login se necessário. Se abrir o share UI, selecione um chat e envie o link:\n${shareUrl}`;
    case 'linkedin':
      return `LinkedIn share: confirme login se necessário. Verifique preview e publique (ou cancele). Link:\n${shareUrl}`;
    case 'twitter':
      return `X/Twitter intent: confirme login. Verifique se o card aparece depois de publicar. Link:\n${shareUrl}`;
    case 'instagram':
      return `Instagram (web): web tem limitações para post/preview. Valide pelo menos que você consegue colar o link em DM/Notes/bio e que o link abre. Link:\n${shareUrl}`;
    case 'tiktok':
      return `TikTok (web): web tem limitações. Valide colagem do link e abertura. Para reencode, use upload de vídeo watermarked. Link:\n${shareUrl}`;
    case 'discord':
      return `Discord: abra um DM/canal de teste e cole o link para ver o unfurl (OG). Link:\n${shareUrl}`;
    case 'slack':
      return `Slack: faça login no workspace e cole o link em um canal para ver unfurl. Link:\n${shareUrl}`;
    case 'youtube':
      return `YouTube Studio: para reencode, envie o watermarked.mp4 e depois baixe o arquivo resultante (se aplicável) para verificação. Para link preview, cole o shareUrl em uma plataforma que faça unfurl. Link:\n${shareUrl}`;
    default:
      return shareUrl;
  }
}

const platforms: PlatformKey[] = [
  'whatsapp',
  'instagram',
  'tiktok',
  'linkedin',
  'twitter',
  'telegram',
  'discord',
  'slack',
  'youtube'
];

test.describe('social flows (assisted)', () => {
  test.skip(!isEnabled(), 'Set PW_SOCIAL_FLOWS=1 to run assisted social flows.');

  test('open share intents and capture evidence', async ({ browser, request, baseURL }) => {
    const hold = isHoldOpen();
    const extraWait = effectiveWaitMs();
    if (isStepMode() || hold || extraWait > 0 || !process.stdin.isTTY) {
      // Prevent global 90s timeout from killing long human-in-the-loop waits.
      test.setTimeout(0);
    }
    const base = baseURL || 'http://localhost:3000';
    const shareUrl = await makeShareUrl({ request, baseURL: base });

    await mkdir('playwright-artifacts', { recursive: true });

    const sp = statePath();
    await mkdir(dirname(sp), { recursive: true });

    const udir = userDataDir();
    const saveState = process.env.PW_SOCIAL_SAVE_STATE !== '0';

    const useState = process.env.PW_SOCIAL_USE_STATE !== '0';
    const hasState = useState && (await fileExists(sp));

    const ctx = udir
      ? await chromium.launchPersistentContext(udir, {
          headless: false,
          ...(browserChannel() ? { channel: browserChannel() as string } : {})
        })
      : await browser.newContext(hasState ? { storageState: sp } : {});

    // eslint-disable-next-line no-console
    console.log(
      udir
        ? `Persistent profile: ${udir}`
        : `Storage state: ${hasState ? `loaded from ${sp}` : useState ? `no state found at ${sp}` : 'disabled'}`
    );

    const page = ctx.pages?.()[0] || (await (ctx as any).newPage());

    // Always capture the canonical share page first (baseline evidence).
    await page.goto(shareUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'playwright-artifacts/share-page.png', fullPage: true });

    const step = isStepMode();
    const opened: Array<{ platform: PlatformKey; tab: any }> = [];
    const skip = skipPlatforms();

    for (const p of platforms) {
      if (skip.has(p)) continue;
      const intent = shareIntentUrl(p, shareUrl);
      // eslint-disable-next-line no-console
      console.log(`\n=== ${p.toUpperCase()} ===\n${instructions(p, shareUrl)}\nIntent: ${intent}\n`);

      const tab = step ? await ctx.newPage() : page;
      await tab.goto(intent, { waitUntil: 'domcontentloaded' });
      await tab.waitForTimeout(1500);
      await safeScreenshot(tab, `playwright-artifacts/${p}.png`);

      if (p === 'whatsapp') {
        const loggedIn = await looksLikeWhatsAppLoggedIn(tab);
        if (!loggedIn) {
          // eslint-disable-next-line no-console
          console.log('WhatsApp appears to require QR/login. If this is the first run, scan the QR and re-run to persist session.');
          await waitForEnter('Scan the WhatsApp QR code in the opened browser, then continue.');
          await tab.waitForTimeout(1200).catch(() => undefined);
        }

        const sent = await tryAutoSendWhatsApp(tab, shareUrl).catch(() => false);
        if (!step) {
          await tab.waitForTimeout(800).catch(() => undefined);
          const confirmed = await tryConfirmWhatsAppSent(tab, shareUrl).catch(() => false);
          // eslint-disable-next-line no-console
          console.log(`WhatsApp send attempt: sent=${sent} confirmed=${confirmed}`);
          if (isStrictWhatsApp() && !confirmed) {
            throw new Error('WhatsApp message send was not confirmed. Ensure you are logged in (QR scanned) and that the message was actually sent.');
          }
          await safeScreenshot(tab, `playwright-artifacts/${p}.after.png`);
        }
      }

      if (step) opened.push({ platform: p, tab });
    }

    if (step) {
      await opened[0]?.tab?.bringToFront?.().catch(() => undefined);
      await waitForEnter(`All tabs are open. Complete logins/actions, then continue. Share URL: ${shareUrl}`);

      for (const o of opened) {
        if (o.platform === 'whatsapp') {
          const sent = await tryAutoSendWhatsApp(o.tab, shareUrl).catch(() => false);
          const confirmed = await tryConfirmWhatsAppSent(o.tab, shareUrl).catch(() => false);
          // eslint-disable-next-line no-console
          console.log(`WhatsApp send attempt: sent=${sent} confirmed=${confirmed}`);
          if (isStrictWhatsApp() && !confirmed) {
            throw new Error('WhatsApp message send was not confirmed. Ensure you are logged in (QR scanned) and that the message was actually sent.');
          }
        }
      }

      if (saveState) {
        await ctx.storageState({ path: sp }).catch(() => undefined);
      }

      for (const o of opened) {
        await o.tab.bringToFront().catch(() => undefined);
        await o.tab.waitForTimeout(500).catch(() => undefined);
        await safeScreenshot(o.tab, `playwright-artifacts/${o.platform}.after.png`);
      }

      if (isHoldOpen()) {
        await waitForEnter('Browser is being held open. When ready, close and finish the run.');
      }

      for (const o of opened) {
        await o.tab.close().catch(() => undefined);
      }
    }

    if (!step && isHoldOpen()) {
      await waitForEnter('Browser is being held open. When ready, continue to close and finish the run.');
    }

    if (saveState && !udir) {
      await (ctx as any).storageState?.({ path: sp }).catch(() => undefined);
      // eslint-disable-next-line no-console
      console.log(`Storage state: saved to ${sp}`);
    }

    await page.close().catch(() => undefined);
    await (ctx as any).close?.().catch(() => undefined);

    // If we reached here, navigation + screenshots worked.
    expect(true).toBeTruthy();
  });
});
