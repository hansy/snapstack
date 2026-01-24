export type YSyncProvider = {
  on: (event: string, handler: (payload: any) => void) => void;
  connect?: () => void | Promise<void>;
  disconnect: () => void;
  destroy: () => void;
  wsconnected?: boolean;
  synced?: boolean;
};
