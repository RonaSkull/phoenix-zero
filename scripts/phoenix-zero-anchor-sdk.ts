export type SuggestProfileRequest = {
  isLive: boolean;
  sessionDurationSec?: number;
  verificationTiming?: 'during' | 'after';
  highFraudRisk?: boolean;
  unstableNetwork?: boolean;
  needsOfflineVerification?: boolean;
  requiresPqc?: boolean;
  sector?: 'social' | 'sports' | 'finance' | 'health' | 'government' | 'media' | 'other';
};

export type SuggestProfileResponse =
  | {
      ok: true;
      suggestedProfileId: string;
      reason: string;
      config: {
        kind: 'live' | 'vod';
        ttlSeconds: number;
        mode: 'compat' | 'strict';
        anchorProfileId: string;
      };
    }
  | { ok: false; reason: string };

export type AnchorProfile = {
  id: string;
  label: string;
  kind: 'live' | 'vod';
  ttlSecondsDefault: number;
  ttlSecondsMin: number;
  ttlSecondsMax: number;
  modeDefault: 'compat' | 'strict';
  maxRefreshIntervalSeconds?: number;
  gracePeriodSeconds?: number;
  minConfidenceThreshold?: number;
  requiresPqc?: boolean;
  complianceRetentionYears?: number;
};

export type AnchorProfilesResponse =
  | { ok: true; profiles: AnchorProfile[] }
  | { ok: false; reason: string };

export type CreateTimeAnchorRequest = {
  contentCommitB64Url: string;
  profile?: string;
  kind?: 'live' | 'vod';
  ttlSeconds?: number;
  mode?: 'compat' | 'strict';
  creatorId?: string;
  clientId?: string;
};

export type CreateTimeAnchorResponse =
  | {
      ok: true;
      anchorId: string;
      verifyUrl: string;
      verifyUrlWithCommit: string;
      applied: {
        kind: 'live' | 'vod';
        ttlSeconds: number | null;
        mode: 'compat' | 'strict';
        profile: string | null;
        clientId: string | null;
      };
      record: any;
    }
  | { ok: false; reason: string };

export type VerifyPublicAnchorResponse =
  | {
      ok: true;
      anchorId: string;
      verified: any;
      record: any;
    }
  | { ok: false; reason: string };

export type TimeAnchorLogResponse =
  | {
      ok: true;
      log: {
        format: string;
        totalLines: number;
        lastHash: string;
        entries: any[];
      };
    }
  | { ok: false; reason: string };

export type PhoenixZeroAnchorClient = {
  baseUrl: string;
  suggestProfile(req: SuggestProfileRequest): Promise<SuggestProfileResponse>;
  listProfiles(): Promise<AnchorProfilesResponse>;
  createTimeAnchor(req: CreateTimeAnchorRequest): Promise<CreateTimeAnchorResponse>;
  verifyPublicAnchor(params: { anchorId: string; contentCommitB64Url?: string }): Promise<VerifyPublicAnchorResponse>;
  readTimeAnchorLog(params?: { limit?: number; anchorId?: string; auditToken?: string }): Promise<TimeAnchorLogResponse>;
};

function normBaseUrl(baseUrl: string): string {
  const v = (baseUrl || '').trim();
  if (!v) return 'http://localhost:3000';
  return v.endsWith('/') ? v.slice(0, -1) : v;
}

async function safeFetchJson(url: string, init: RequestInit, label: string): Promise<any> {
  try {
    const res = await fetch(url, init);
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const text = await res.text().catch(() => '');

    const tryParseJson = () => {
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    };

    if (!res.ok) {
      const parsed = tryParseJson();
      if (parsed && typeof parsed === 'object' && typeof (parsed as any).ok === 'boolean') {
        return parsed;
      }
      const msg = text ? text.slice(0, 400) : '';
      return { ok: false, reason: `${label} HTTP ${res.status}${msg ? `: ${msg}` : ''}` };
    }

    if (!text) {
      return { ok: false, reason: `${label} empty response` };
    }

    const parsed = tryParseJson();
    if (parsed !== null) return parsed;

    const sample = text.slice(0, 400);
    return {
      ok: false,
      reason: `${label} non-JSON response` + (contentType ? ` (content-type=${contentType})` : ''),
      sample
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `${label} fetch failed: ${message}` };
  }
}

export function createPhoenixZeroAnchorClient(baseUrl: string): PhoenixZeroAnchorClient {
  const base = normBaseUrl(baseUrl);

  return {
    baseUrl: base,

    async suggestProfile(req) {
      return (await safeFetchJson(
        `${base}/api/suggest-profile`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req)
        },
        'suggestProfile'
      )) as SuggestProfileResponse;
    },

    async listProfiles() {
      return (await safeFetchJson(
        `${base}/api/anchor-profiles`,
        { method: 'GET', cache: 'no-store' },
        'listProfiles'
      )) as AnchorProfilesResponse;
    },

    async createTimeAnchor(req) {
      return (await safeFetchJson(
        `${base}/api/time-anchor`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req)
        },
        'createTimeAnchor'
      )) as CreateTimeAnchorResponse;
    },

    async verifyPublicAnchor(params) {
      const qs = params.contentCommitB64Url ? `?contentCommit=${encodeURIComponent(params.contentCommitB64Url)}` : '';
      return (await safeFetchJson(
        `${base}/api/public-anchor/${encodeURIComponent(params.anchorId)}${qs}`,
        { method: 'GET', cache: 'no-store' },
        'verifyPublicAnchor'
      )) as VerifyPublicAnchorResponse;
    },

    async readTimeAnchorLog(params) {
      const limit = typeof params?.limit === 'number' ? params.limit : undefined;
      const anchorId = typeof params?.anchorId === 'string' ? params.anchorId : undefined;
      const q = new URLSearchParams();
      if (limit) q.set('limit', String(limit));
      if (anchorId) q.set('anchorId', anchorId);
      const qs = q.toString() ? `?${q.toString()}` : '';

      const auditToken = typeof params?.auditToken === 'string' ? params.auditToken.trim() : '';
      const headers: Record<string, string> = {};
      if (auditToken) headers['x-audit-token'] = auditToken;

      return (await safeFetchJson(
        `${base}/api/time-anchor-log${qs}`,
        { method: 'GET', cache: 'no-store', headers },
        'readTimeAnchorLog'
      )) as TimeAnchorLogResponse;
    }
  };
}
