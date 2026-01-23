export function isAiClientMode(): boolean {
  return (process.env.PHOENIX_ZERO_CLIENT_MODE || '').trim().toLowerCase() === 'ai';
}
