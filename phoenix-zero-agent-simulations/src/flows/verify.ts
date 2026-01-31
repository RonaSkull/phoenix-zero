import { httpJson, httpText } from '../lib/http';

export async function fetchGuaranteeProof(baseUrl: string, proofId: string) {
  return httpJson({ method: 'GET', url: `${baseUrl}/api/guarantee-proofs/${encodeURIComponent(proofId)}` });
}

export async function fetchVerifyPageHtml(baseUrl: string, proofId: string) {
  return httpText({ method: 'GET', url: `${baseUrl}/verify/${encodeURIComponent(proofId)}` });
}
