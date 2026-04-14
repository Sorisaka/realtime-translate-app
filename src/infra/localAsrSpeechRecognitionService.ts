import type { SpeechRecognitionService } from "../domain/services";
import type { TranscriptSegment } from "../domain/transcript";

type LocalAsrOptions = {
  endpoint: string;
  chunkMs: number;
  minChunkBytes: number;
  maxInFlightRequests: number;
};

type AsrResponse = {
  text?: string;
  error?: string;
  debug?: unknown;
};

export class LocalAsrSpeechRecognitionService implements SpeechRecognitionService {
  constructor(private readonly options: LocalAsrOptions) {}

  start(onSegment: (segment: TranscriptSegment) => void): () => void {
    let stopped = false;
    let recorder: MediaRecorder | null = null;
    let stream: MediaStream | null = null;
    let stopTimerId: number | undefined;
    let segmentIndex = 0;
    let inFlightRequests = 0;
    let lastFinalText = "";
    let hasLoggedMimeType = false;

    const startRecordingLoop = async () => {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.info("Local ASR MediaRecorder support", this.getMimeTypeDiagnostics());

      const recordSegment = () => {
        if (stopped || !stream) return;

        const mimeType = this.selectMimeType();
        const chunks: Blob[] = [];
        const segmentStartedAt = Date.now();
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        if (!hasLoggedMimeType) {
          console.info("Local ASR recorder mimeType", recorder.mimeType || "browser-default");
          hasLoggedMimeType = true;
        }

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onstop = () => {
          const completedAtMs = Date.now();
          const blobType = recorder?.mimeType || mimeType || chunks[0]?.type || "application/octet-stream";
          const audio = new Blob(chunks, { type: blobType });

          if (!stopped) {
            recordSegment();
          }

          if (stopped || audio.size < this.options.minChunkBytes) return;
          if (inFlightRequests >= this.options.maxInFlightRequests) return;

          const id = `local-asr-${segmentIndex}`;
          segmentIndex += 1;
          inFlightRequests += 1;

          onSegment({
            id,
            text: "Listening...",
            status: "partial",
            startedAtMs: segmentStartedAt,
          });

          void this.transcribe(audio)
            .then((text) => {
              if (stopped) return;
              const dedupedText = this.removeRepeatedPrefix(text, lastFinalText);
              lastFinalText = text.trim();
              onSegment({
                id,
                text: dedupedText,
                status: "final",
                startedAtMs: segmentStartedAt,
                completedAtMs,
              });
            })
            .catch((error) => {
              console.error("Local ASR request failed", error);
              onSegment({
                id,
                text: "",
                status: "final",
                startedAtMs: segmentStartedAt,
                completedAtMs,
              });
            })
            .finally(() => {
              inFlightRequests -= 1;
            });
        };

        recorder.start();
        stopTimerId = window.setTimeout(() => {
          if (recorder && recorder.state === "recording") {
            recorder.stop();
          }
        }, this.options.chunkMs);
      };

      recordSegment();
    };

    void startRecordingLoop().catch((error) => {
      console.error("Failed to start local ASR microphone capture", error);
    });

    return () => {
      stopped = true;
      if (stopTimerId) {
        window.clearTimeout(stopTimerId);
      }
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      stream?.getTracks().forEach((track) => track.stop());
    };
  }

  private async transcribe(audio: Blob): Promise<string> {
    const response = await fetch(this.options.endpoint, {
      method: "POST",
      headers: { "Content-Type": audio.type || "application/octet-stream" },
      body: audio,
    });
    const payload = (await response.json()) as AsrResponse;

    if (!response.ok || payload.error) {
      throw new Error(payload.error ?? `ASR request failed with status ${response.status}`);
    }

    if (payload.debug) {
      console.info("Local ASR debug", payload.debug);
    }

    return payload.text?.trim() ?? "";
  }

  private selectMimeType(): string {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
  }

  private getMimeTypeDiagnostics(): Record<string, boolean> {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];
    return Object.fromEntries(candidates.map((type) => [type, MediaRecorder.isTypeSupported(type)]));
  }

  private removeRepeatedPrefix(text: string, previousText: string): string {
    const normalizedText = text.trim().replace(/\s+/g, " ");
    const normalizedPrevious = previousText.trim().replace(/\s+/g, " ");

    if (!normalizedText) return "";
    if (!normalizedPrevious) return normalizedText;
    if (normalizedText === normalizedPrevious) return "";

    const previousWords = normalizedPrevious.toLowerCase().split(" ");
    const nextWords = normalizedText.split(" ");
    const nextLower = nextWords.map((word) => word.toLowerCase());
    const maxOverlap = Math.min(previousWords.length, nextWords.length);

    for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
      const previousTail = previousWords.slice(-overlap).join(" ");
      const nextHead = nextLower.slice(0, overlap).join(" ");
      if (previousTail === nextHead) {
        return nextWords.slice(overlap).join(" ").trim();
      }
    }

    return normalizedText;
  }
}
