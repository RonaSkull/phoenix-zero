import { mkdir, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { phoenixZeroTmpDir } from '../../../../lib/tmp-dir';

import {
  extractAudioFingerprintFromAudioPath,
  extractInvisibleAudioWatermark,
  meanAbsDiff,
  verifyHybridSignature
} from '@phoenix-zero/core/node';

import { getOrCreateBillingAccount, isBillingAccountActive } from '../../../../lib/billing-accounts';
import { requireTenant } from '../../../../lib/tenant-auth';
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

const MAX_AUDIO_BYTES = Math.max(1, getEnvInt('PHOENIX_ZERO_VERIFY_AUDIO_MAX_AUDIO_BYTES', 20 * 1024 * 1024));

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

type Proof = {
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
    maxBitErrors?: number;
  };
  fingerprint?: {
    alg: 'abs_amp_envelope_v1';
    cfg: { sampleRate: number; frameMs: number; targetLen: number; quant: number };
    samples: number[];
    hashB64Url: string;
    madThreshold: number;
  };
  signatureMode: 'compat' | 'strict';
  hybridSignature: any;
};

export async function POST(req: Request) {
  let inputPath: string | null = null;

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

    const proofField = form.get('proof');
    const proofCompact = typeof form.get('proofCompact') === 'string' ? String(form.get('proofCompact')) : undefined;

    const proof: Proof | null =
      proofCompact != null
        ? (JSON.parse(new TextDecoder().decode(Buffer.from(proofCompact, 'base64url'))) as Proof)
        : typeof proofField === 'string'
          ? (JSON.parse(proofField) as Proof)
          : proofField instanceof File
            ? (JSON.parse(await proofField.text()) as Proof)
            : null;

    if (!proof) {
      httpStatus = 400;
      return Response.json(
        { ok: false, reason: 'Missing proof. Provide proof (string/file) or proofCompact.' },
        { status: 400 }
      );
    }

    if (proof.version !== 5) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Unsupported proof version.' }, { status: 400 });
    }

    const payload = {
      version: proof.version,
      createdAt: proof.createdAt,
      creatorId: proof.creatorId,
      media: proof.media,
      watermark: proof.watermark,
      fingerprint: proof.fingerprint,
      signatureMode: proof.signatureMode
    };

    const sigResult = await verifyHybridSignature({ payload, sig: proof.hybridSignature });

    const tmpDir = phoenixZeroTmpDir();
    await mkdir(tmpDir, { recursive: true });

    const stampId = Date.now().toString(10);
    inputPath = join(tmpDir, `verify-audio-${stampId}${safeInputExt(audio.name)}`);

    const audioBytes = new Uint8Array(await audio.arrayBuffer());
    await writeFile(inputPath, Buffer.from(audioBytes));

    const wmCfg = {
      payloadB64Url: proof.watermark.payloadB64Url,
      payloadByteLength: proof.watermark.payloadByteLength,
      bitCount: proof.watermark.bitCount,
      sampleRate: proof.watermark.sampleRate,
      windowMs: proof.watermark.windowMs,
      repeatPerBit: proof.watermark.repeatPerBit,
      startWindow: proof.watermark.startWindow,
      gainDelta: proof.watermark.gainDelta
    };

    const wm = await extractInvisibleAudioWatermark({
      audioPath: inputPath,
      cfg: wmCfg,
      expectedPayloadB64Url: proof.watermark.payloadB64Url
    });

    const watermarkMatch = wm.extractedPayloadB64Url === proof.watermark.payloadB64Url;
    const maxBitErrors = Number.isFinite(proof.watermark.maxBitErrors) ? Number(proof.watermark.maxBitErrors) : 2;
    const bestBitErrors = typeof wm.bestBitErrors === 'number' ? wm.bestBitErrors : undefined;
    const watermarkOk = watermarkMatch || (bestBitErrors !== undefined && bestBitErrors <= maxBitErrors);

    let fingerprint: any = { present: false, ok: true as const };

    if (proof.fingerprint?.alg === 'abs_amp_envelope_v1') {
      const extracted = await extractAudioFingerprintFromAudioPath({ audioPath: inputPath, cfg: proof.fingerprint.cfg });
      const mad = meanAbsDiff(extracted.samples, proof.fingerprint.samples);
      const threshold = proof.fingerprint.madThreshold;
      fingerprint = {
        present: true,
        ok: mad <= threshold,
        mad,
        threshold,
        referenceHash: proof.fingerprint.hashB64Url,
        extractedHash: extracted.hashB64Url
      };
    }

    ok = sigResult.ok && watermarkOk && (fingerprint.present ? fingerprint.ok : true);
    httpStatus = ok ? 200 : 400;

    return Response.json(
      {
        ok,
        signature: sigResult,
        watermark: {
          ok: watermarkOk,
          expectedPayloadB64Url: proof.watermark.payloadB64Url,
          extractedPayloadB64Url: wm.extractedPayloadB64Url,
          bestBitErrors,
          maxBitErrors,
          threshold: wm.threshold,
          polarity: wm.polarity
        },
        fingerprint
      },
      { status: httpStatus }
    );
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
    void recordUsage({ req, tenantId, op: 'verify_audio', ok, httpStatus, startedAtMs });
  }
}
