import { httpJson } from '../lib/http';

export async function fetchPricingCatalog(baseUrl: string, apiKey?: string) {
  return httpJson({ method: 'GET', url: `${baseUrl}/api/pricing`, apiKey });
}
