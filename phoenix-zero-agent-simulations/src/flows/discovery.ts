import { httpJson } from '../lib/http';

export async function fetchWellKnown(baseUrl: string) {
  return httpJson({ method: 'GET', url: `${baseUrl}/.well-known/ai-service.json` });
}

export async function fetchCapabilities(baseUrl: string) {
  return httpJson({ method: 'GET', url: `${baseUrl}/api/capabilities` });
}
