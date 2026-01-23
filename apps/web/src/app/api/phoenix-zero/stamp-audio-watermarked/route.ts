import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

import JSZip from 'jszip';

import { base64UrlToBytes, bytesToBase64Url, ed25519KeyPairFromPrivateKey } from '@phoenix-zero/core';
import {
  createHybridSignature,
  embedInvisibleAudioWatermark,
  extractAudioFingerprintFromAudioPath,
  generateSphincsKeyPair,
  pqPrivateKeyFromB64Url,
  pqPublicKeyFromB64Url
} from '@phoenix-zero/core/node';

import { getCreatorRecord } from '../../../../lib/creator-registry';
import { maybeCreateIssuerAttestation } from '../../../../lib/issuer-attestation';
import { verifyCreatorRegistrySignature } from '../../../../lib/registry-signing';
import { getOrCreateBillingAccount, isBillingAccountActive } from '../../../../lib/billing-accounts';
import { requireTenant } from '../../../../lib/tenant-auth';
import { phoenixZeroTmpDir } from '../../../../lib/tmp-dir';
import { recordUsage } from '../../../../lib/usage-ledger';

export const runtime = 'nodejs';

function getEnvInt(name: string, fallback: number): number {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function safeInputExt(filename: string | undefined): string {
  const ext = extname(filename || '').toLowerCase();
  if (!ext) return '.bin';
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) return '.bin';
  return ext;
}

const MAX_AUDIO_BYTES = Math.max(1, getEnvInt('PHOENIX_ZERO_STAMP_AUDIO_WATERMARKED_MAX_AUDIO_BYTES', 20 * 1024 * 1024));

const ALLOWED_MIME = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/webm'
]);

type IssuerProof = {
  version: 5;
  createdAt: string;
  creatorId?: string;
  media: { mimeType?: string; byteLength?: number };
  watermark: {
    alg: 'audio_pair_gain_delta_v1';
    payloadByteLength: number;
    payloadB64Url: string;
    bitCount: number;
    sampleRate: number;
    windowMs: number;
    repeatPerBit: number;
    startWindow: number;
    gainDelta: number;
    maxBitErrors: number;
  };
  fingerprint: {
    alg: 'abs_amp_envelope_v1';
    cfg: { sampleRate: number; frameMs: number; targetLen: number; quant: number };
    samples: number[];
    hashB64Url: string;
    madThreshold: number;
  };
  signatureMode: 'compat' | 'strict';
};

async function readJsonMaybe<T>(filePath: string): Promise<T | null> {
  try {
    const txt = await readFile(filePath, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let inputPath: string | null = null;
  let outputPath: string | null = null;

  const startedAtMs = Date.now();
  let tenantId: string | null = null;
  let ok = false;
  let httpStatus = 500;

  try {
    const auth = await requireTenant(req);
    if (!auth.ok) {
      httpStatus = auth.status;
      return Response.json({ ok: false, reason: auth.reason }, { status: auth.status });
    }
    tenantId = auth.ctx.tenantId;

    const billing = await getOrCreateBillingAccount(auth.ctx.tenantId);
    if (!billing.ok) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: billing.reason }, { status: 400 });
    }
    if (!isBillingAccountActive(billing.account)) {
      httpStatus = 402;
      return Response.json(
        { ok: false, reason: 'Payment required', billing: { status: billing.account.status, isActive: false } },
        { status: 402 }
      );
    }

    const form = await req.formData();
    const audio = form.get('audio');

    if (!(audio instanceof File)) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Missing form field: audio' }, { status: 400 });
    }

    if (Number.isFinite(audio.size) && audio.size > MAX_AUDIO_BYTES) {
      httpStatus = 413;
      return Response.json({ ok: false, reason: 'File too large' }, { status: 413 });
    }

    if (audio.type && !ALLOWED_MIME.has(audio.type)) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Invalid file type' }, { status: 400 });
    }

    const mode = (typeof form.get('mode') === 'string' ? String(form.get('mode')) : 'compat') as 'compat' | 'strict';
    const creatorId = typeof form.get('creatorId') === 'string' ? String(form.get('creatorId')) : undefined;

    const privateKeyB64Url =
      (typeof form.get('privateKeyB64Url') === 'string' ? String(form.get('privateKeyB64Url')) : undefined) ??
      process.env.PHOENIX_ZERO_PRIVATE_KEY_B64URL ??
      (await readJsonMaybe<{ privateKeyB64Url?: string }>(
        resolve(process.cwd(), '..', '..', 'keys', 'phoenix-zero-ed25519.json')
      ))?.privateKeyB64Url;

    if (!privateKeyB64Url) {
      httpStatus = 400;
      return Response.json(
        { ok: false, reason: 'Missing signing key. Provide privateKeyB64Url or set PHOENIX_ZERO_PRIVATE_KEY_B64URL.' },
        { status: 400 }
      );
    }

    const edKeyPair = ed25519KeyPairFromPrivateKey(base64UrlToBytes(privateKeyB64Url));

    const enforceRegistry = process.env.PHOENIX_ZERO_ENFORCE_CREATOR_REGISTRY === '1';
    const requireSignedRegistry = process.env.PHOENIX_ZERO_REQUIRE_SIGNED_REGISTRY === '1';

    if (enforceRegistry && creatorId && requireSignedRegistry) {
      const trust = await verifyCreatorRegistrySignature();
      if (!trust.ok) {
        httpStatus = 503;
        return Response.json({ ok: false, reason: 'Creator registry is not trusted (missing/invalid signature).' }, { status: 503 });
      }
    }

    const registryRecord = enforceRegistry && creatorId ? await getCreatorRecord(creatorId) : null;
    if (enforceRegistry && creatorId && registryRecord) {
      const edPub = bytesToBase64Url(edKeyPair.publicKey);
      if (edPub !== registryRecord.ed25519PublicKeyB64Url) {
        httpStatus = 403;
        return Response.json({ ok: false, reason: 'Signing key does not match creator registry for creatorId.' }, { status: 403 });
      }
    }

    const watermarkCfg = {
      payloadByteLength: 4,
      bitCount: 32,
      sampleRate: 16000,
      windowMs: 25,
      repeatPerBit: 2,
      startWindow: 10,
      gainDelta: 0.08,
      maxBitErrors: 2
    };

    const wmPayload = randomBytes(watermarkCfg.payloadByteLength);
    const wmPayloadB64Url = bytesToBase64Url(new Uint8Array(wmPayload));

    const wmCfg = {
      payloadB64Url: wmPayloadB64Url,
      payloadByteLength: watermarkCfg.payloadByteLength,
      bitCount: watermarkCfg.bitCount,
      sampleRate: watermarkCfg.sampleRate,
      windowMs: watermarkCfg.windowMs,
      repeatPerBit: watermarkCfg.repeatPerBit,
      startWindow: watermarkCfg.startWindow,
      gainDelta: watermarkCfg.gainDelta
    };

    const fingerprintCfg = { sampleRate: 16000, frameMs: 50, targetLen: 64, quant: 4 };
    const madThreshold = 6;

    const tmpDir = phoenixZeroTmpDir();
    await mkdir(tmpDir, { recursive: true });

    const stampId = Date.now().toString(10);
    inputPath = join(tmpDir, `audio-in-${stampId}${safeInputExt(audio.name)}`);
    outputPath = join(tmpDir, `audio-wm-${stampId}.wav`);

    const audioBytes = new Uint8Array(await audio.arrayBuffer());
    await writeFile(inputPath, Buffer.from(audioBytes));

    await embedInvisibleAudioWatermark({ inputPath, outputPath, cfg: wmCfg });

    const watermarkedBytes = await readFile(outputPath);

    const fp = await extractAudioFingerprintFromAudioPath({ audioPath: outputPath, cfg: fingerprintCfg });

    const payload: IssuerProof = {
      version: 5,
      createdAt: new Date().toISOString(),
      creatorId,
      media: { mimeType: audio.type || undefined, byteLength: audioBytes.byteLength },
      watermark: {
        alg: 'audio_pair_gain_delta_v1',
        payloadByteLength: wmCfg.payloadByteLength,
        payloadB64Url: wmCfg.payloadB64Url,
        bitCount: wmCfg.bitCount,
        sampleRate: wmCfg.sampleRate,
        windowMs: wmCfg.windowMs,
        repeatPerBit: wmCfg.repeatPerBit,
        startWindow: wmCfg.startWindow,
        gainDelta: wmCfg.gainDelta,
        maxBitErrors: watermarkCfg.maxBitErrors
      },
      fingerprint: {
        alg: 'abs_amp_envelope_v1',
        cfg: fp.cfg,
        samples: fp.samples,
        hashB64Url: fp.hashB64Url,
        madThreshold
      },
      signatureMode: mode
    };

    let pqKeys:
      | {
          alg: 'sphincs';
          privateKey: Uint8Array;
          publicKey: Uint8Array;
        }
      | undefined;

    const pqPriv = process.env.PHOENIX_ZERO_PQ_PRIVATE_KEY_B64URL;
    const pqPub = process.env.PHOENIX_ZERO_PQ_PUBLIC_KEY_B64URL;

    const pqFromFile = await readJsonMaybe<{ privateKeyB64Url?: string; publicKeyB64Url?: string }>(
      resolve(process.cwd(), '..', '..', 'keys', 'phoenix-zero-sphincs.json')
    );

    const pqPriv2 = pqPriv ?? pqFromFile?.privateKeyB64Url;
    const pqPub2 = pqPub ?? pqFromFile?.publicKeyB64Url;

    if (pqPriv2 && pqPub2) {
      pqKeys = {
        alg: 'sphincs',
        privateKey: pqPrivateKeyFromB64Url(pqPriv2),
        publicKey: pqPublicKeyFromB64Url(pqPub2)
      };
    } else if (mode === 'strict') {
      const kp = await generateSphincsKeyPair();
      pqKeys = { alg: 'sphincs', privateKey: kp.privateKey, publicKey: kp.publicKey };
    }

    if (enforceRegistry && creatorId && registryRecord?.pqPublicKeyB64Url) {
      const pqPub = pqKeys ? bytesToBase64Url(pqKeys.publicKey) : '';
      if (!pqPub || pqPub !== registryRecord.pqPublicKeyB64Url) {
        httpStatus = 403;
        return Response.json({ ok: false, reason: 'PQ key does not match creator registry for creatorId.' }, { status: 403 });
      }
    }

    const hybridSignature = await createHybridSignature({
      payload,
      mode,
      ed25519: { privateKey: edKeyPair.privateKey, publicKey: edKeyPair.publicKey },
      pq: pqKeys
    });

    const issuerAttestation = await maybeCreateIssuerAttestation({ hybridId: hybridSignature.hybridId, creatorId });

    const proof = {
      ...payload,
      hybridSignature,
      issuerAttestation: issuerAttestation ?? undefined
    };

    const zip = new JSZip();
    zip.file('audio.wav', watermarkedBytes);
    zip.file('proof.json', JSON.stringify(proof, null, 2));

    const zipBytes = await zip.generateAsync({ type: 'nodebuffer' });

    ok = true;
    httpStatus = 200;
    return new Response(new Uint8Array(zipBytes), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="phoenix-zero-audio-watermarked.zip"'
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    ok = false;
    httpStatus = 500;
    return Response.json({ ok: false, reason: message }, { status: 500 });
  } finally {
    if (inputPath) {
      await rm(inputPath, { force: true }).catch(() => {
      });
    }
    if (outputPath) {
      await rm(outputPath, { force: true }).catch(() => {
      });
    }
    void recordUsage({ req, tenantId, op: 'stamp_audio_watermarked', ok, httpStatus, startedAtMs });
  }
}
