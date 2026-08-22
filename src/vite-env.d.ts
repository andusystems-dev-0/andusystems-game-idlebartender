/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAME_ID?: string;
  readonly VITE_ENV?: "prod" | "uat" | "dev";
  readonly VITE_API_BASE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
