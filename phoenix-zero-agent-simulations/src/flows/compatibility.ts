import { httpJson } from '../lib/http';

export async function checkCompatibility(baseUrl: string, body: { operation?: string; intent?: string; agentType?: string; supportsPpo?: boolean }) {
  return httpJson({ method: 'POST', url: `${baseUrl}/api/compatibility`, body });
}
