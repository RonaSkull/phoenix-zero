import type { TimeAnchorKind } from './time-anchors';

export type AnchorProfileId =
  | 'live_social_short'
  | 'live_social_basic'
  | 'live_sports_mobile'
  | 'live_kyc_enterprise'
  | 'live_telemed'
  | 'live_broadcast_official'
  | 'live_stories_1h'
  | 'live_stories_24h'
  | 'vod_media_standard'
  | 'vod_kyc_2y'
  | 'vod_kyc_5y_pqc'
  | 'vod_forensic_max';

export type AnchorProfile = {
  id: AnchorProfileId;
  label: string;
  kind: TimeAnchorKind;
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

export const ANCHOR_PROFILES: Record<AnchorProfileId, AnchorProfile> = {
  live_social_short: {
    id: 'live_social_short',
    label: 'Janela curta (Social — curta)',
    kind: 'live',
    ttlSecondsDefault: 30,
    ttlSecondsMin: 5,
    ttlSecondsMax: 24 * 3600,
    modeDefault: 'compat',
    maxRefreshIntervalSeconds: 15,
    gracePeriodSeconds: 5,
    minConfidenceThreshold: 0.85,
    complianceRetentionYears: 0
  },
  live_social_basic: {
    id: 'live_social_basic',
    label: 'Janela curta (Social — padrão)',
    kind: 'live',
    ttlSecondsDefault: 120,
    ttlSecondsMin: 60,
    ttlSecondsMax: 24 * 3600,
    modeDefault: 'compat',
    maxRefreshIntervalSeconds: 45,
    gracePeriodSeconds: 10,
    minConfidenceThreshold: 0.85,
    complianceRetentionYears: 0
  },
  live_sports_mobile: {
    id: 'live_sports_mobile',
    label: 'Janela curta (Esportes — mobile)',
    kind: 'live',
    ttlSecondsDefault: 180,
    ttlSecondsMin: 60,
    ttlSecondsMax: 24 * 3600,
    modeDefault: 'compat',
    maxRefreshIntervalSeconds: 60,
    gracePeriodSeconds: 15,
    minConfidenceThreshold: 0.88,
    complianceRetentionYears: 0
  },
  live_kyc_enterprise: {
    id: 'live_kyc_enterprise',
    label: 'Janela curta (KYC — enterprise)',
    kind: 'live',
    ttlSecondsDefault: 180,
    ttlSecondsMin: 120,
    ttlSecondsMax: 24 * 3600,
    modeDefault: 'strict',
    maxRefreshIntervalSeconds: 60,
    gracePeriodSeconds: 15,
    minConfidenceThreshold: 0.97,
    requiresPqc: true,
    complianceRetentionYears: 5
  },
  live_telemed: {
    id: 'live_telemed',
    label: 'Janela curta (Telemedicina)',
    kind: 'live',
    ttlSecondsDefault: 240,
    ttlSecondsMin: 120,
    ttlSecondsMax: 24 * 3600,
    modeDefault: 'compat',
    maxRefreshIntervalSeconds: 90,
    gracePeriodSeconds: 20,
    minConfidenceThreshold: 0.95,
    complianceRetentionYears: 0
  },
  live_broadcast_official: {
    id: 'live_broadcast_official',
    label: 'Janela curta (Transmissão oficial — delay)',
    kind: 'live',
    ttlSecondsDefault: 300,
    ttlSecondsMin: 120,
    ttlSecondsMax: 24 * 3600,
    modeDefault: 'compat',
    maxRefreshIntervalSeconds: 120,
    gracePeriodSeconds: 30,
    minConfidenceThreshold: 0.9,
    complianceRetentionYears: 0
  },
  live_stories_1h: {
    id: 'live_stories_1h',
    label: 'Janela curta (Ephemeral — 1h)',
    kind: 'live',
    ttlSecondsDefault: 3600,
    ttlSecondsMin: 3600,
    ttlSecondsMax: 24 * 3600,
    modeDefault: 'compat',
    minConfidenceThreshold: 0.8,
    complianceRetentionYears: 0
  },
  live_stories_24h: {
    id: 'live_stories_24h',
    label: 'Janela curta (Ephemeral — 24h)',
    kind: 'live',
    ttlSecondsDefault: 24 * 3600,
    ttlSecondsMin: 3600,
    ttlSecondsMax: 24 * 3600,
    modeDefault: 'compat',
    minConfidenceThreshold: 0.8,
    complianceRetentionYears: 0
  },
  vod_media_standard: {
    id: 'vod_media_standard',
    label: 'Janela longa (Mídia — padrão)',
    kind: 'vod',
    ttlSecondsDefault: 365 * 24 * 3600,
    ttlSecondsMin: 30 * 24 * 3600,
    ttlSecondsMax: 10 * 365 * 24 * 3600,
    modeDefault: 'compat',
    minConfidenceThreshold: 0.9,
    complianceRetentionYears: 1
  },
  vod_kyc_2y: {
    id: 'vod_kyc_2y',
    label: 'Janela longa (KYC — 2 anos)',
    kind: 'vod',
    ttlSecondsDefault: 2 * 365 * 24 * 3600,
    ttlSecondsMin: 180 * 24 * 3600,
    ttlSecondsMax: 10 * 365 * 24 * 3600,
    modeDefault: 'compat',
    minConfidenceThreshold: 0.95,
    complianceRetentionYears: 2
  },
  vod_kyc_5y_pqc: {
    id: 'vod_kyc_5y_pqc',
    label: 'Janela longa (KYC — 5 anos, PQC)',
    kind: 'vod',
    ttlSecondsDefault: 5 * 365 * 24 * 3600,
    ttlSecondsMin: 365 * 24 * 3600,
    ttlSecondsMax: 10 * 365 * 24 * 3600,
    modeDefault: 'strict',
    minConfidenceThreshold: 0.98,
    requiresPqc: true,
    complianceRetentionYears: 5
  },
  vod_forensic_max: {
    id: 'vod_forensic_max',
    label: 'Janela longa (Forense — máximo)',
    kind: 'vod',
    ttlSecondsDefault: 10 * 365 * 24 * 3600,
    ttlSecondsMin: 365 * 24 * 3600,
    ttlSecondsMax: 10 * 365 * 24 * 3600,
    modeDefault: 'strict',
    minConfidenceThreshold: 0.99,
    requiresPqc: true,
    complianceRetentionYears: 10
  }
};

export function isAnchorProfileId(v: string): v is AnchorProfileId {
  return v in ANCHOR_PROFILES;
}

export function getAnchorProfile(id: string): AnchorProfile | null {
  const key = (id || '').trim();
  if (!key) return null;
  return isAnchorProfileId(key) ? ANCHOR_PROFILES[key] : null;
}

export type SuggestAnchorProfileAnswers = {
  isLive: boolean;
  sessionDurationSec?: number;
  verificationTiming?: 'during' | 'after';
  highFraudRisk?: boolean;
  unstableNetwork?: boolean;
  needsOfflineVerification?: boolean;
  requiresPqc?: boolean;
  sector?: 'social' | 'sports' | 'finance' | 'health' | 'government' | 'media' | 'other';
};

export type SuggestedAnchorProfile = {
  suggestedProfileId: AnchorProfileId;
  profile: AnchorProfile;
  reason: string;
};

export function suggestAnchorProfile(answers: SuggestAnchorProfileAnswers): SuggestedAnchorProfile {
  const isLive = Boolean(answers?.isLive);
  const highFraudRisk = Boolean(answers?.highFraudRisk);
  const unstableNetwork = Boolean(answers?.unstableNetwork);
  const requiresPqc = Boolean(answers?.requiresPqc);
  const sector = answers?.sector;
  const verificationTiming = answers?.verificationTiming;
  const sessionDurationSec = typeof answers?.sessionDurationSec === 'number' ? answers.sessionDurationSec : undefined;

  let suggestedProfileId: AnchorProfileId;
  let reason = '';

  if (isLive) {
    if (verificationTiming === 'after') {
      if (requiresPqc && highFraudRisk) {
        suggestedProfileId = 'vod_kyc_5y_pqc';
        reason = 'live event but verificationTiming=after -> treat as VOD (PQC + highFraudRisk)';
      } else if (highFraudRisk || sector === 'finance' || sector === 'government') {
        suggestedProfileId = 'vod_kyc_2y';
        reason = 'live event but verificationTiming=after -> treat as VOD (regulated/highFraudRisk)';
      } else {
        suggestedProfileId = 'vod_media_standard';
        reason = 'live event but verificationTiming=after -> treat as VOD';
      }
    } else if (sector === 'health') {
      suggestedProfileId = 'live_telemed';
      reason = 'sector=health';
    } else if (highFraudRisk || sector === 'finance' || sector === 'government') {
      suggestedProfileId = 'live_kyc_enterprise';
      reason = 'highFraudRisk/regulated sector';
    } else if (sector === 'sports' || unstableNetwork) {
      if ((sessionDurationSec ?? 0) >= 180) {
        suggestedProfileId = 'live_broadcast_official';
        reason = 'sector=sports/unstableNetwork + long session -> broadcast/delay tolerant';
      } else {
        suggestedProfileId = 'live_sports_mobile';
        reason = 'sector=sports or unstable network';
      }
    } else if (sector === 'media' && (sessionDurationSec ?? 0) >= 180) {
      suggestedProfileId = 'live_broadcast_official';
      reason = 'sector=media + long session -> broadcast/delay tolerant';
    } else if ((sessionDurationSec ?? 0) > 0 && (sessionDurationSec ?? 0) <= 30) {
      suggestedProfileId = 'live_social_short';
      reason = 'very short sessionDurationSec -> short live window';
    } else {
      suggestedProfileId = 'live_social_basic';
      reason = 'default live social';
    }
  } else {
    if (requiresPqc && highFraudRisk) {
      suggestedProfileId = 'vod_kyc_5y_pqc';
      reason = 'requiresPqc + highFraudRisk';
    } else if (highFraudRisk || sector === 'finance' || sector === 'government') {
      suggestedProfileId = 'vod_kyc_2y';
      reason = 'highFraudRisk/regulated sector';
    } else {
      suggestedProfileId = 'vod_media_standard';
      reason = 'default vod media';
    }
  }

  return { suggestedProfileId, profile: ANCHOR_PROFILES[suggestedProfileId], reason };
}

export type ResolvedTimeAnchorConfig = {
  kind: TimeAnchorKind;
  ttlSeconds?: number;
  mode: 'compat' | 'strict';
  anchorProfileId?: AnchorProfileId;
};

export function resolveTimeAnchorConfig(input: {
  kind?: TimeAnchorKind;
  ttlSeconds?: number;
  mode?: 'compat' | 'strict';
  profile?: string;
}): { ok: true; config: ResolvedTimeAnchorConfig } | { ok: false; reason: string } {
  const profileRaw = (input.profile || '').trim();

  if (profileRaw) {
    const profile = getAnchorProfile(profileRaw);
    if (!profile) return { ok: false, reason: `Unknown profile: ${profileRaw}` };

    if (input.kind && input.kind !== profile.kind) {
      return { ok: false, reason: `Profile kind mismatch: profile=${profile.kind} kind=${input.kind}` };
    }

    const mode = input.mode ?? profile.modeDefault;
    const ttl = input.ttlSeconds ?? profile.ttlSecondsDefault;
    const ttlClamped = Math.max(profile.ttlSecondsMin, Math.min(profile.ttlSecondsMax, ttl));

    return {
      ok: true,
      config: {
        kind: profile.kind,
        ttlSeconds: ttlClamped,
        mode,
        anchorProfileId: profile.id
      }
    };
  }

  return {
    ok: true,
    config: {
      kind: input.kind ?? 'live',
      ttlSeconds: input.ttlSeconds,
      mode: input.mode ?? 'compat'
    }
  };
}
