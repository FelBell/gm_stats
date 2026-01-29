export interface Kill {
  attacker_steamid: string | null;
  attacker_role: string | null;
  victim_steamid: string;
  victim_role: string;
  weapon: string;
  headshot: boolean;
}

export interface RoundPlayer {
  steam_id: string;
  role_start: string;
  role_end: string;
  karma_diff: number | null;
  points_diff: number | null;
}

export interface RoundBuy {
  steam_id: string;
  role: string;
  item: string;
}

export interface Round {
  id: string;
  map_name: string;
  winner: string;
  duration: number;
  timestamp: string;
  kills: Kill[];
  players: RoundPlayer[];
  buys: RoundBuy[];
}

export interface Player {
  steam_id: string;
  display_name: string;
}

export interface HealthResponse {
  status: string;
}

// TTT Role types for styling
export type TTTRole =
  | 'innocent'
  | 'traitor'
  | 'detective'
  | 'jester'
  | 'swapper'
  | 'glitch'
  | 'phantom'
  | 'hypnotist'
  | 'revenger'
  | 'drunk'
  | 'clown'
  | 'deputy'
  | 'mercenary'
  | 'impersonator'
  | 'beggar'
  | 'oldman'
  | 'killer'
  | 'zombie'
  | 'vampire'
  | 'assassin'
  | 'detraitor'
  | string;

// Winner types
export type TTTWinner = 'innocents' | 'traitors' | 'timelimit' | 'jester' | string;
