export type IdentityStatus = 'unknown' | 'unregistered' | 'match' | 'mismatch';

export type IdentityAssessment = {
  status: IdentityStatus;
  creatorId?: string;
  expectedEd25519PublicKeyB64Url?: string;
  proofEd25519PublicKeyB64Url?: string;
  expectedPqPublicKeyB64Url?: string;
  proofPqPublicKeyB64Url?: string;
};

export function assessIdentity(params: {
  creatorId?: string;
  registryRecord?: { ed25519PublicKeyB64Url: string; pqPublicKeyB64Url?: string } | null;
  proofEd25519PublicKeyB64Url?: string;
  proofPqPublicKeyB64Url?: string;
}): IdentityAssessment {
  const creatorId = params.creatorId;
  if (!creatorId) return { status: 'unknown' };

  const proofEd = params.proofEd25519PublicKeyB64Url;
  const proofPq = params.proofPqPublicKeyB64Url;

  if (!params.registryRecord) {
    return { status: 'unregistered', creatorId, proofEd25519PublicKeyB64Url: proofEd, proofPqPublicKeyB64Url: proofPq };
  }

  const expectedEd = params.registryRecord.ed25519PublicKeyB64Url;
  const expectedPq = params.registryRecord.pqPublicKeyB64Url;

  const edMatches = !!proofEd && proofEd === expectedEd;
  const pqMatches = expectedPq ? !!proofPq && proofPq === expectedPq : true;

  const status: IdentityStatus = edMatches && pqMatches ? 'match' : 'mismatch';
  return {
    status,
    creatorId,
    expectedEd25519PublicKeyB64Url: expectedEd,
    proofEd25519PublicKeyB64Url: proofEd,
    expectedPqPublicKeyB64Url: expectedPq,
    proofPqPublicKeyB64Url: proofPq
  };
}
