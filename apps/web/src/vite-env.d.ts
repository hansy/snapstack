/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEBSOCKET_SERVER?: string;
  readonly VITE_USE_COMMAND_LOG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
