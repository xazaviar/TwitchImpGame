export interface EventChoice {
  id: string;
  label: string;
  description?: string;
}

export interface EventInfo {
  id: string;
  name: string;
  description: string;
  choices: EventChoice[];
}

export interface EventOutcome {
  choiceId: string;
  narrative: string;
  success: boolean;
  rewards?: {
    gold?: number;
    materials?: number;
    healAll?: number;
  };
  penalties?: {
    damageToAll?: number;
    damageToRandom?: number;
  };
}
