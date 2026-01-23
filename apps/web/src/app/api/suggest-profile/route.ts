import { suggestAnchorProfile, type SuggestAnchorProfileAnswers } from '../../../lib/anchor-profiles';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as null | Partial<SuggestAnchorProfileAnswers>;

    if (typeof body?.isLive !== 'boolean') {
      return Response.json({ ok: false, reason: 'Missing isLive' }, { status: 400, headers: jsonUtf8Headers() });
    }

    const res = suggestAnchorProfile({
      isLive: body.isLive,
      sessionDurationSec: typeof body.sessionDurationSec === 'number' ? body.sessionDurationSec : undefined,
      verificationTiming: body.verificationTiming === 'during' || body.verificationTiming === 'after' ? body.verificationTiming : undefined,
      highFraudRisk: typeof body.highFraudRisk === 'boolean' ? body.highFraudRisk : undefined,
      unstableNetwork: typeof body.unstableNetwork === 'boolean' ? body.unstableNetwork : undefined,
      needsOfflineVerification: typeof body.needsOfflineVerification === 'boolean' ? body.needsOfflineVerification : undefined,
      requiresPqc: typeof body.requiresPqc === 'boolean' ? body.requiresPqc : undefined,
      sector:
        body.sector === 'social' ||
        body.sector === 'sports' ||
        body.sector === 'finance' ||
        body.sector === 'health' ||
        body.sector === 'government' ||
        body.sector === 'media' ||
        body.sector === 'other'
          ? body.sector
          : undefined
    });

    return Response.json(
      {
        ok: true,
        suggestedProfileId: res.suggestedProfileId,
        profile: res.profile,
        reason: res.reason,
        config: {
          kind: res.profile.kind,
          ttlSeconds: res.profile.ttlSecondsDefault,
          mode: res.profile.modeDefault,
          anchorProfileId: res.profile.id
        }
      },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json({ ok: false, reason: message }, { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  }
}
