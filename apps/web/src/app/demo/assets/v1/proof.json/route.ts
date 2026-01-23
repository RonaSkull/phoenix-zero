import { access, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { maybeCreateIssuerAttestation, computeHybridIdFromParts } from '../../../../../lib/issuer-attestation';

export const runtime = 'nodejs';

async function pickProofPath(): Promise<string> {
  const preferred = resolve(process.cwd(), '..', '..', 'platform-tests', 'demo-assets', 'v1', 'proof.json');
  try {
    await access(preferred);
    return preferred;
  } catch {
    return resolve(process.cwd(), '..', '..', 'platform-tests', 'proofs', 'original.proof.json');
  }
}

export async function GET() {
  const proofPath = await pickProofPath();
  const bytes = await readFile(proofPath);

  try {
    const proof = JSON.parse(new TextDecoder().decode(bytes)) as any;
    const payload = {
      version: proof.version,
      createdAt: proof.createdAt,
      creatorId: proof.creatorId,
      preset: proof.preset,
      media: proof.media,
      temporal: proof.temporal,
      watermark: proof.watermark,
      signatureMode: proof.signatureMode
    };

    const edSigB64Url = proof?.hybridSignature?.ed25519?.signatureB64Url as string | undefined;
    const pqSigB64Url = proof?.hybridSignature?.pq?.signatureB64Url as string | undefined;

    if (typeof edSigB64Url === 'string' && edSigB64Url) {
      const hybridId = computeHybridIdFromParts({ payload, edSigB64Url, pqSigB64Url });
      const issuerAttestation = await maybeCreateIssuerAttestation({ hybridId, creatorId: proof.creatorId });
      if (issuerAttestation) {
        proof.issuerAttestation = issuerAttestation;
        const out = new TextEncoder().encode(JSON.stringify(proof, null, 2));
        return new Response(out, {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
          }
        });
      }
    }
  } catch {
  }

  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function HEAD() {
  try {
    const proofPath = await pickProofPath();
    const info = await stat(proofPath);
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': String(info.size),
        'Cache-Control': 'no-store'
      }
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
