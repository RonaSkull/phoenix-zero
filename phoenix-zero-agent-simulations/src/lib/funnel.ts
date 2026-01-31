export type FunnelStage =
  | 'DISCOVERY'
  | 'UNDERSTANDING'
  | 'DECISION'
  | 'ONBOARDING'
  | 'PURCHASE'
  | 'PAYMENT_CONFIRMED'
  | 'EXECUTION'
  | 'VERIFICATION'
  | 'REFUND'
  | 'DONE';

export type FunnelEvent = {
  at: string;
  stage: FunnelStage;
  ok: boolean;
  message: string;
  meta?: any;
};

export class FunnelLogger {
  readonly personaId: string;
  readonly runId: string;
  readonly events: FunnelEvent[] = [];

  constructor(params: { personaId: string; runId: string }) {
    this.personaId = params.personaId;
    this.runId = params.runId;
  }

  push(stage: FunnelStage, ok: boolean, message: string, meta?: any) {
    this.events.push({ at: new Date().toISOString(), stage, ok, message, meta });
  }

  blockers(): string[] {
    return this.events.filter((e) => !e.ok).map((e) => `[${e.stage}] ${e.message}`);
  }
}
