/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPEECH_SERVICE?: "mock" | "local-asr";
  readonly VITE_ASR_ENDPOINT?: string;
  readonly VITE_ASR_CHUNK_MS?: string;
  readonly VITE_ASR_MIN_CHUNK_BYTES?: string;
  readonly VITE_ASR_MAX_IN_FLIGHT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
