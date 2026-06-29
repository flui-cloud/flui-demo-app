export interface ActivityRow {
  id: number;
  actor: string;
  action: string;
  target: string;
  created_at: string;
}

export interface ActionCount {
  action: string;
  count: number;
}

export interface FeedState {
  total: number;
  top: ActionCount[];
  feed: ActivityRow[];
}

export interface FeedUpdate {
  total: number;
  top: ActionCount[];
  row: ActivityRow;
}
