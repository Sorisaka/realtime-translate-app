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
};

export class LocalAsrSpeechRecognitionService implements SpeechRecognitionService {
  constructor(private readonly options: LocalAsrOptions) {}

  start(onSegment: (segment: TranscriptSegment) => void): () => void {
    let stopped = false;
    let recorder: MediaRecorder | null = null;
    let stream: MediaStream | null = null;
    let segmentIndex = 0;
    let inFlightRequests = 0;
    let lastFinalText = "";

    const startRecording = async () => {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = this.selectMimeType();
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (stopped || event.data.size < this.options.minChunkBytes) return;
        if (inFlightRequests >= this.options.maxInFlightRequests) return;

        const id = `local-asr-${segmentIndex}`;
        segmentIndex += 1;
        inFlightRequests += 1;

        onSegment({
          id,
          text: "Listening...",
          status: "partial",
          startedAtMs: Date.now() - this.options.chunkMs,
        });

        void this.transcribe(event.data).then((text) => {
          if (stopped) return;
          const dedupedText = this.removeRepeatedPrefix(text, lastFinalText);
          lastFinalText = text.trim();
          onSegment({
            id,
            text: dedupedText,
            status: "final",
            startedAtMs: Date.now() - this.options.chunkMs,
            completedAtMs: Date.now(),
          });
        }).catch((error) => {
          console.error("Local ASR request failed", error);
          onSegment({
            id,
            text: "",
            status: "final",
            startedAtMs: Date.now() - this.options.chunkMs,
            completedAtMs: Date.now(),
          });
        }).finally(() => {
          inFlightRequests -= 1;
        });
      };

      recorder.start(this.options.chunkMs);
    };

    void startRecording().catch((error) => {
      console.error("Failed to start local ASR microphone capture", error);
    });

    return () => {
      stopped = true;
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

    return payload.text?.trim() ?? "";
  }

  private selectMimeType(): string {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
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
