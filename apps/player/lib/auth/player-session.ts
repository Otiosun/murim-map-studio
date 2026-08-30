export interface PlayerSession {
  sessionVersion: 1;
  playerId: string;
}

export interface PlayerSessionResolver {
  resolve(): Promise<PlayerSession | null>;
}
