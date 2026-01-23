export type CommitmentEventType = 'assumption_confirmed' | 'assumption_adjusted';

export type CommitmentEvent = {
  type: CommitmentEventType;
  key: string;
  value: string;
  timestamp: number;
};
