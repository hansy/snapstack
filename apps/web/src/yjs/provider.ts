export type YSyncProvider = {
  on: (event: string, handler: (payload: any) => void) => void;
  disconnect: () => void;
  destroy: () => void;
  wsconnected?: boolean;
  synced?: boolean;
};
