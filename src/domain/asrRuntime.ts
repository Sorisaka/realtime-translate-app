export type AsrRuntimePhase =
  | "idle"
  | "requesting-microphone"
  | "recording"
  | "recognizing"
  | "error";

export type AsrRuntimeStatus = {
  phase: AsrRuntimePhase;
  inputLevel: number;
  inFlightRequests: number;
  selectedDeviceId?: string;
  recorderMimeType?: string;
  errorMessage?: string;
  debug?: unknown;
};
