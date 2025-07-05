declare type BroadcastedEvent = {
  type: "count" | "screwed-up" | "win";
  user: string;
  "user-team": "UP" | "DOWN";
  resultingCount: number;
};
