import { randomBytes } from 'node:crypto';
import { exec, spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { access, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { createPhoenixZeroAnchorClient } from './phoenix-zero-anchor-sdk';

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  const positionals: string[] = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith('--')) {
        args[key] = val;
        i++;
      } else {
        args[key] = 'true';
      }
    } else {
      positionals.push(a);
    }
  }
  return { args, positionals };
}

function jsonOut(v: unknown) {
  process.stdout.write(JSON.stringify(v, null, 2) + '\n');
}

function out(line: string = '') {
  process.stdout.write(line + '\n');
}

function boolFlag(args: Record<string, string>, key: string): boolean {
  const raw = (args[key] || '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function openUrl(url: string) {
  const u = (url || '').trim();
  if (!u) return;
  const platform = process.platform;
  const cmd =
    platform === 'win32'
      ? `cmd /c start "" "${u}"`
      : platform === 'darwin'
        ? `open "${u}"`
        : `xdg-open "${u}"`;

  exec(cmd, () => {
  });
}

function randomCommitB64Url(): string {
  return randomBytes(32).toString('base64url');
}

async function sha256FileBase64Url(filePath: string): Promise<{ ok: true; value: string } | { ok: false; reason: string }> {
  try {
    const hash = createHash('sha256');
    await new Promise<void>((resolve, reject) => {
      const s = createReadStream(filePath);
      s.on('error', reject);
      s.on('data', (chunk) => hash.update(chunk));
      s.on('end', () => resolve());
    });
    return { ok: true, value: hash.digest('base64url') };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `Failed to hash file: ${message}` };
  }
}

async function existsPath(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureSampleVideo(filePath: string): Promise<{ ok: true; file: string } | { ok: false; reason: string }> {
  try {
    if (await existsPath(filePath)) return { ok: true, file: filePath };

    await mkdir(dirname(filePath), { recursive: true });

    const mod = (await import('ffmpeg-static')) as unknown as { default?: unknown };
    const maybe = (mod as { default?: unknown }).default ?? mod;
    if (typeof maybe !== 'string') return { ok: false, reason: 'ffmpeg-static did not resolve to a path string' };
    const ffmpegPath = maybe;

    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=3:size=720x1280:rate=30',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=1000:duration=3',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      filePath
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (d: string) => {
        err += String(d);
      });
      child.on('error', (e: Error) => reject(e));
      child.on('close', (code: number | null) => {
        if (code !== 0) return reject(new Error(err || `ffmpeg exited with code ${code}`));
        resolve();
      });
    });

    return { ok: true, file: filePath };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `Failed to generate sample video: ${message}` };
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function previewCommit(commitB64Url: string): string {
  const c = (commitB64Url || '').trim();
  if (!c) return '';
  return c.length <= 12 ? c : `${c.slice(0, 8)}…${c.slice(-4)}`;
}

function printHumanDemo(params: {
  report: any;
  commit: string;
  profile: string;
  create: any;
  verify: any;
  log: any;
  showTips?: boolean;
}) {
  const r = params.report;
  const ok = Boolean(r?.ok);
  const reason = typeof r?.reason === 'string' ? r.reason : '';

  const anchorId = typeof r?.demo?.anchorId === 'string' ? r.demo.anchorId : '';
  const createdAt = params?.create?.ok ? params.create.record?.createdAt : undefined;
  const expiresAt = params?.create?.ok ? params.create.record?.expiresAt : undefined;
  const ttl = params?.create?.ok ? params.create.applied?.ttlSeconds : undefined;

  const verifyWindow = typeof r?.demo?.verify?.window === 'string' ? r.demo.verify.window : 'unknown';
  const verifyOk = Boolean(r?.demo?.verify?.verifiedOk);
  const coincidence = Boolean(r?.demo?.verify?.coincidence);

  out('PHOENIX ZERO — TIME ANCHOR DEMO');
  out('');

  if (!ok) {
    out('STATUS: FALHOU');
    if (reason) out(`MOTIVO: ${reason}`);
    out('');
    if (reason.includes('Failed to hash file') || reason.includes('ENOENT')) {
      out('Como resolver (arquivo):');
      out('- passe um caminho real em --file (ex.: .\\out\\video3s.mp4)');
      out('- ou use: npm run anchor:demo -- --sample true --open true');
      out('- ou gere um sample: npm run make:testvideo (gera ./out/video3s.mp4)');
    } else {
      out('O que este comando precisava para funcionar (servidor):');
      out('- o servidor Phoenix Zero disponível no baseUrl');
      out('- o endpoint /api/anchor-profiles respondendo JSON');
      out('');
      out('Como testar no navegador:');
      out(`- ${r?.demo?.baseUrl || ''}/api/anchor-profiles`);
    }
    out('');
    return;
  }

  out('STATUS: OK');
  out('');
  out('O que aconteceu (em 3 passos):');
  out(`1) Geramos um identificador do conteúdo (contentCommit): ${previewCommit(params.commit)}`);
  out(`2) Criamos uma âncora assinada (anchorId): ${anchorId}`);
  out(`   - profile: ${params.profile}`);
  if (typeof ttl === 'number') out(`   - TTL (janela de validade): ${ttl}s`);
  if (createdAt) out(`   - createdAt: ${createdAt}`);
  if (expiresAt) out(`   - expiresAt: ${expiresAt}`);
  out(`3) Verificamos a âncora agora: window=${verifyWindow} verifiedOk=${verifyOk} matchDoConteudo=${coincidence}`);
  out('');

  out('O que isso prova (mensagem de venda):');
  out('- Existe uma prova assinada de que um conteúdo com esse identificador existia naquele momento.');
  out('- Em LIVE: isso prova recência/liveness dentro do TTL (anti-replay básico).');
  out('- Em VOD: você usa perfis de anos (retenção) para prova jurídica de publicação/autoria.');
  out('');

  out('Links plug-and-play para mostrar para qualquer pessoa:');
  out(`- 1) Verificação (prova + coincidência do conteúdo): ${r.demo.links.verifyUrlWithCommit}`);
  out(`- 2) Auditoria (log append-only): ${r.demo.links.logUrl}`);
  out('');
  out('Opcional (não usar para fechar a demo):');
  out(`- Prova temporal sem coincidência (sem contentCommit): ${r.demo.links.verifyUrl}`);
  out('');

  const logFound = Boolean(r?.demo?.transparencyLog?.found);
  out(`Auditoria: entry no log append-only encontrada = ${logFound}`);
  if (params.log?.ok && params.log?.log?.entries) {
    out(`Entradas retornadas (filtradas por anchorId): ${params.log.log.entries.length}`);
  }
  if (params.showTips) {
    out('');
    out('Perfis prontos (opcional):');
    out('- Live social: use profile live_social_basic (120s)');
    out('- Live esportes (móvel): live_sports_mobile (180s)');
    out('- Telemedicina: live_telemed (240s)');
    out('- Publicação VOD: vod_media_standard (1 ano)');
  }
}

function shortReport(params: {
  baseUrl: string;
  create: any;
  verify: any;
  log: any;
  startedAt: string;
  finishedAt: string;
  includeRaw?: boolean;
}) {
  const anchorId = params?.create?.ok ? params.create.anchorId : '';
  const verifyOk = params?.verify?.ok ? params.verify?.verified?.ok : false;
  const window = params?.verify?.ok ? params.verify?.verified?.window : 'unknown';
  const coincidence = params?.verify?.ok ? params.verify?.verified?.coincidence : false;
  const logFound = Boolean(params?.log?.ok && Array.isArray(params.log?.log?.entries) && params.log.log.entries.length > 0);

  const reason =
    params?.create && params.create.ok === false
      ? params.create.reason
      : params?.verify && params.verify.ok === false
        ? params.verify.reason
        : params?.log && params.log.ok === false
          ? params.log.reason
          : '';

  return {
    ok: Boolean(params?.create?.ok && params?.verify?.ok),
    ...(reason ? { reason } : null),
    demo: {
      startedAt: params.startedAt,
      finishedAt: params.finishedAt,
      baseUrl: params.baseUrl,
      anchorId,
      verify: {
        window,
        verifiedOk: Boolean(verifyOk),
        coincidence: Boolean(coincidence)
      },
      transparencyLog: {
        checked: true,
        found: logFound
      },
      links: params?.create?.ok
        ? {
            verifyUrl: params.create.verifyUrl,
            verifyUrlWithCommit: params.create.verifyUrlWithCommit,
            logUrl: `${params.baseUrl.replace(/\/$/, '')}/api/time-anchor-log?anchorId=${encodeURIComponent(anchorId)}`
          }
        : null
    },
    ...(params.includeRaw
      ? {
          raw: {
            create: params.create,
            verify: params.verify,
            log: params.log
          }
        }
      : null)
  };
}

async function main() {
  const { args, positionals } = parseArgs(process.argv);
  const cmd = (positionals[0] || '').trim() || 'help';

  const base = (args.base || args.url || 'http://localhost:3000').trim();
  const client = createPhoenixZeroAnchorClient(base);

  if (cmd === 'help') {
    jsonOut({
      ok: true,
      usage: {
        base: 'tsx ./scripts/phoenix-zero-anchor-cli.ts --base http://localhost:3000 <cmd> [flags]',
        cmds: {
          profiles: 'List anchor profiles',
          suggest: 'Suggest profile from answers',
          hash: 'Compute contentCommit (sha256 base64url) from a file',
          create: 'Create time anchor',
          verify: 'Verify public anchor',
          log: 'Read time anchor transparency log',
          demo: 'Create + verify + check log (one command demo report)'
        },
        examples: {
          profiles: 'tsx ./scripts/phoenix-zero-anchor-cli.ts profiles',
          suggest: 'tsx ./scripts/phoenix-zero-anchor-cli.ts suggest --isLive true --sector social',
          hash: 'tsx ./scripts/phoenix-zero-anchor-cli.ts hash --file ./path/to/video.mp4',
          create: 'tsx ./scripts/phoenix-zero-anchor-cli.ts create --commit <base64url> --profile live_social_basic --creator creator-demo --client demo-client',
          verify: 'tsx ./scripts/phoenix-zero-anchor-cli.ts verify --anchor <id> --commit <base64url>',
          log: 'tsx ./scripts/phoenix-zero-anchor-cli.ts log --limit 50',
          demo: 'tsx ./scripts/phoenix-zero-anchor-cli.ts demo --file ./path/to/video.mp4 --profile live_social_basic --creator creator-demo --client demo-client'
        }
      }
    });
    return;
  }

  if (cmd === 'profiles') {
    const res = await client.listProfiles();
    jsonOut(res);
    process.exit(res.ok ? 0 : 2);
    return;
  }

  if (cmd === 'hash') {
    const file = (args.file || '').trim();
    if (!file) {
      jsonOut({ ok: false, reason: 'Missing --file' });
      process.exit(2);
      return;
    }

    const r = await sha256FileBase64Url(file);
    if (!r.ok) {
      jsonOut(r);
      process.exit(2);
      return;
    }

    jsonOut({ ok: true, alg: 'sha256_b64url_v1', contentCommitB64Url: r.value, file });
    process.exit(0);
    return;
  }

  if (cmd === 'suggest') {
    const isLive = boolFlag(args, 'isLive');

    const res = await client.suggestProfile({
      isLive,
      sector: (args.sector as any) || undefined,
      verificationTiming: (args.verificationTiming as any) || undefined,
      sessionDurationSec: args.sessionDurationSec ? Number(args.sessionDurationSec) : undefined,
      highFraudRisk: args.highFraudRisk ? args.highFraudRisk === 'true' || args.highFraudRisk === '1' : undefined,
      unstableNetwork: args.unstableNetwork ? args.unstableNetwork === 'true' || args.unstableNetwork === '1' : undefined,
      needsOfflineVerification: args.needsOfflineVerification ? args.needsOfflineVerification === 'true' || args.needsOfflineVerification === '1' : undefined,
      requiresPqc: args.requiresPqc ? args.requiresPqc === 'true' || args.requiresPqc === '1' : undefined
    });
    jsonOut(res);
    process.exit(res.ok ? 0 : 2);
    return;
  }

  if (cmd === 'create') {
    const commit = (args.commit || args.contentCommit || '').trim();
    const profile = (args.profile || '').trim();
    const creatorId = (args.creator || args.creatorId || '').trim();
    const clientId = (args.client || args.clientId || '').trim();

    const res = await client.createTimeAnchor({
      contentCommitB64Url: commit,
      profile: profile || undefined,
      creatorId: creatorId || undefined,
      clientId: clientId || undefined,
      kind: (args.kind as any) || undefined,
      ttlSeconds: args.ttlSeconds ? Number(args.ttlSeconds) : undefined,
      mode: (args.mode as any) || undefined
    });
    jsonOut(res);
    process.exit(res.ok ? 0 : 2);
    return;
  }

  if (cmd === 'verify') {
    const anchorId = (args.anchor || args.anchorId || '').trim();
    const commit = (args.commit || args.contentCommit || '').trim();

    const res = await client.verifyPublicAnchor({
      anchorId,
      contentCommitB64Url: commit || undefined
    });
    jsonOut(res);
    process.exit(res.ok ? 0 : 2);
    return;
  }

  if (cmd === 'log') {
    const limit = args.limit ? Number(args.limit) : undefined;
    const anchorId = (args.anchorId || args.anchor || '').trim();
    const auditToken = (args.auditToken || args.audit || '').trim();

    if (anchorId && (anchorId.includes('<') || anchorId.includes('>'))) {
      jsonOut({ ok: false, reason: 'Invalid anchorId (replace <ID> placeholder with a real anchorId)' });
      process.exit(2);
      return;
    }

    const res = await client.readTimeAnchorLog({ limit, anchorId: anchorId || undefined, auditToken: auditToken || undefined });
    jsonOut(res);
    process.exit(res.ok ? 0 : 2);
    return;
  }

  if (cmd === 'demo') {
    const startedAt = new Date().toISOString();

    const includeRaw = boolFlag(args, 'raw');
    const wantJson = boolFlag(args, 'json');
    const wantHuman = boolFlag(args, 'human') || !wantJson;
    const wantOpen = boolFlag(args, 'open');
    const showTips = boolFlag(args, 'tips');

    let commit = ((args.commit || args.contentCommit || '').trim() || '').trim();
    const useSample = boolFlag(args, 'sample');
    let file = (args.file || '').trim();
    if (!file && useSample) file = './out/video3s.mp4';

    if (!commit && useSample) {
      const ensured = await ensureSampleVideo(file);
      if (!ensured.ok) {
        const finishedAt = new Date().toISOString();
        const report = shortReport({
          baseUrl: client.baseUrl,
          create: { ok: false, reason: ensured.reason },
          verify: { ok: false, reason: 'Skipped verify' },
          log: { ok: false, reason: 'Skipped log' },
          startedAt,
          finishedAt,
          includeRaw
        });
        if (wantHuman) {
          printHumanDemo({ report, commit: '', profile: ((args.profile || '').trim() || 'live_social_basic').trim(), create: { ok: false, reason: ensured.reason }, verify: { ok: false }, log: { ok: false }, showTips });
        }
        if (wantJson) jsonOut(report);
        process.exit(2);
        return;
      }
    }

    if (!commit && file) {
      const r = await sha256FileBase64Url(file);
      if (!r.ok) {
        const finishedAt = new Date().toISOString();
        const report = shortReport({
          baseUrl: client.baseUrl,
          create: { ok: false, reason: r.reason },
          verify: { ok: false, reason: 'Skipped verify' },
          log: { ok: false, reason: 'Skipped log' },
          startedAt,
          finishedAt,
          includeRaw
        });

        if (wantHuman) {
          printHumanDemo({
            report,
            commit: '',
            profile: ((args.profile || '').trim() || 'live_social_basic').trim(),
            create: { ok: false, reason: r.reason },
            verify: { ok: false },
            log: { ok: false },
            showTips
          });
        }
        if (wantJson) jsonOut(report);
        process.exit(2);
        return;
      }
      commit = r.value;
    }
    if (!commit) commit = randomCommitB64Url();
    const profile = ((args.profile || '').trim() || 'live_social_basic').trim();
    const creatorId = ((args.creator || args.creatorId || '').trim() || 'creator-demo').trim();
    const clientId = ((args.client || args.clientId || '').trim() || 'demo-client').trim();
    const auditToken = (args.auditToken || args.audit || '').trim();

    // Preflight: wait a bit for dev server cold start / compilation.
    const waitMs = args.waitMs ? Math.max(0, Number(args.waitMs)) : 12_000;
    const deadline = Date.now() + (Number.isFinite(waitMs) ? waitMs : 12_000);
    let preflight: any = null;
    while (Date.now() < deadline) {
      preflight = await client.listProfiles();
      if (preflight && preflight.ok) break;
      await sleepMs(600);
    }

    if (!preflight || !preflight.ok) {
      const finishedAt = new Date().toISOString();
      const reason = preflight?.reason || 'Server not reachable or not ready';
      const report = shortReport({
          baseUrl: client.baseUrl,
          create: { ok: false, reason: `Preflight failed: ${reason}` },
          verify: { ok: false, reason: 'Skipped verify' },
          log: { ok: false, reason: 'Skipped log' },
          startedAt,
          finishedAt,
          includeRaw
        });

      if (wantHuman) {
        printHumanDemo({ report, commit, profile, create: { ok: false, reason: `Preflight failed: ${reason}` }, verify: { ok: false }, log: { ok: false }, showTips });
      }
      if (wantJson) jsonOut(report);
      process.exit(2);
      return;
    }

    const create = await client.createTimeAnchor({
      contentCommitB64Url: commit,
      profile: profile || undefined,
      creatorId: creatorId || undefined,
      clientId: clientId || undefined,
      kind: (args.kind as any) || undefined,
      ttlSeconds: args.ttlSeconds ? Number(args.ttlSeconds) : undefined,
      mode: (args.mode as any) || undefined
    });

    if (!create.ok) {
      const finishedAt = new Date().toISOString();
      const report = shortReport({
          baseUrl: client.baseUrl,
          create,
          verify: { ok: false, reason: 'Skipped verify' },
          log: { ok: false, reason: 'Skipped log' },
          startedAt,
          finishedAt,
          includeRaw
        });

      if (wantHuman) {
        printHumanDemo({ report, commit, profile, create, verify: { ok: false }, log: { ok: false }, showTips });
      }
      if (wantJson) jsonOut(report);
      process.exit(2);
      return;
    }

    const verify = await client.verifyPublicAnchor({
      anchorId: create.anchorId,
      contentCommitB64Url: commit || undefined
    });

    const logFiltered = await client.readTimeAnchorLog({ anchorId: create.anchorId, auditToken: auditToken || undefined });

    const finishedAt = new Date().toISOString();
    const report = shortReport({ baseUrl: client.baseUrl, create, verify, log: logFiltered, startedAt, finishedAt, includeRaw });

    if (wantHuman) {
      printHumanDemo({ report, commit, profile, create, verify, log: logFiltered, showTips });
      out('');
    }
    if (wantJson) jsonOut(report);

    if (wantOpen && report.ok && report.demo?.links?.verifyUrlWithCommit) {
      openUrl(report.demo.links.verifyUrlWithCommit);
      openUrl(report.demo.links.logUrl);
    }
    process.exit(report.ok ? 0 : 2);
    return;
  }

  jsonOut({ ok: false, reason: `Unknown cmd: ${cmd}` });
  process.exit(2);
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  process.stderr.write(message + '\n');
  process.exit(1);
});
