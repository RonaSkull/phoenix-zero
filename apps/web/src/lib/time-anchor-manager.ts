import { createTimeAnchor, getTimeAnchor, verifyTimeAnchor, type TimeAnchorKind, type TimeAnchorRecord, type TimeAnchorVerifyResult } from './time-anchors';

export class TimeAnchorManager {
  async create(params: {
    creatorId?: string;
    clientId?: string;
    anchorProfileId?: string;
    kind: TimeAnchorKind;
    contentCommitB64Url: string;
    ttlSeconds?: number;
    mode?: 'compat' | 'strict';
  }): Promise<{ ok: true; record: TimeAnchorRecord } | { ok: false; reason: string }> {
    return createTimeAnchor(params);
  }

  async get(anchorId: string): Promise<TimeAnchorRecord | null> {
    return getTimeAnchor(anchorId);
  }

  async verify(params: { anchorId: string; contentCommitB64Url?: string }): Promise<TimeAnchorVerifyResult> {
    return verifyTimeAnchor(params);
  }
}
