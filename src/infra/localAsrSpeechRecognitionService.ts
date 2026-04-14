import type { SpeechRecognitionService } from "../domain/services";
import type { TranscriptSegment } from "../domain/transcript";

type LocalAsrOptions = {
  endpoint: string;
  chunkMs: number;
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

    const startRecording = async () => {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = this.selectMimeType();
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (stopped || event.data.size === 0) return;
        const id = `local-asr-${segmentIndex}`;
        segmentIndex += 1;

        void this.transcribe(event.data).then((text) => {
          if (stopped || !text) return;
          onSegment({
            id,
            text,
            status: "final",
            startedAtMs: Date.now() - this.options.chunkMs,
            completedAtMs: Date.now(),
          });
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
}
