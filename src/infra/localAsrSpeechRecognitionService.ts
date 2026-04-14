import type { SpeechRecognitionService } from "../domain/services";
import type { TranscriptSegment } from "../domain/transcript";
import type { AsrRuntimeStatus } from "../domain/asrRuntime";

type LocalAsrOptions = {
  endpoint: string;
  chunkMs: number;
  minChunkBytes: number;
  maxInFlightRequests: number;
  deviceId?: string;
  onStatus?: (status: AsrRuntimeStatus) => void;
};

type AsrResponse = {
  text?: string;
  error?: string;
  debug?: unknown;
};

type TranscribeResult = {
  text: string;
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
    let currentLevel = 0;
    let cleanupLevelMeter: (() => void) | undefined;

    const emitStatus = (status: Partial<AsrRuntimeStatus>) => {
      this.options.onStatus?.({
        phase: "idle",
        inputLevel: currentLevel,
        inFlightRequests,
        selectedDeviceId: this.options.deviceId,
        ...status,
      });
    };

    const startRecordingLoop = async () => {
      emitStatus({ phase: "requesting-microphone" });
      stream = await navigator.mediaDevices.getUserMedia({
        audio: this.options.deviceId ? { deviceId: { exact: this.options.deviceId } } : true,
      });
      cleanupLevelMeter = this.startLevelMeter(stream, (level) => {
        currentLevel = level;
        emitStatus({ phase: recorder?.state === "recording" ? "recording" : "idle" });
      });
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
        emitStatus({ phase: "recording", recorderMimeType: recorder.mimeType || "browser-default" });

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
          emitStatus({ phase: "recognizing", recorderMimeType: blobType });

          onSegment({
            id,
            text: "Listening...",
            status: "partial",
            startedAtMs: segmentStartedAt,
          });

          void this.transcribe(audio)
            .then(({ text, debug }) => {
              if (stopped) return;
              const dedupedText = this.removeRepeatedPrefix(text, lastFinalText);
              lastFinalText = text.trim();
              emitStatus({ phase: "recording", debug });
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
              emitStatus({
                phase: "error",
                errorMessage: this.toUserFacingError(error),
              });
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
              if (!stopped) {
                emitStatus({ phase: recorder?.state === "recording" ? "recording" : "idle" });
              }
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
      emitStatus({
        phase: "error",
        errorMessage: this.toUserFacingError(error),
      });
    });

    return () => {
      stopped = true;
      emitStatus({ phase: "idle", inputLevel: 0 });
      if (stopTimerId) {
        window.clearTimeout(stopTimerId);
      }
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      cleanupLevelMeter?.();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }

  private async transcribe(audio: Blob): Promise<TranscribeResult> {
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

    return { text: payload.text?.trim() ?? "", debug: payload.debug };
  }

  private selectMimeType(): string {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
  }

  private startLevelMeter(stream: MediaStream, onLevel: (level: number) => void): () => void {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return () => undefined;

    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    const data = new Uint8Array(analyser.fftSize);
    let frameId = 0;
    let stopped = false;
    let lastEmitAt = 0;

    analyser.fftSize = 512;
    source.connect(analyser);

    const tick = () => {
      if (stopped) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const sample of data) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      const now = performance.now();
      if (now - lastEmitAt > 100) {
        lastEmitAt = now;
        onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
      }
      frameId = window.requestAnimationFrame(tick);
    };

    tick();

    return () => {
      stopped = true;
      window.cancelAnimationFrame(frameId);
      source.disconnect();
      void audioContext.close();
    };
  }

  private getMimeTypeDiagnostics(): Record<string, boolean> {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];
    return Object.fromEntries(candidates.map((type) => [type, MediaRecorder.isTypeSupported(type)]));
  }

  private toUserFacingError(error: unknown): string {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      return "マイク権限が拒否されています。ブラウザのサイト設定でマイクを許可してください。";
    }
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return "利用できるマイクが見つかりません。入力デバイスの接続を確認してください。";
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Failed to fetch")) {
      return "ASR backend に接続できません。backend が起動しているか確認してください。";
    }
    if (message.toLowerCase().includes("ffmpeg")) {
      return "backend で音声変換に失敗しました。ffmpeg のインストールと ASR_FFMPEG_PATH を確認してください。";
    }
    if (message.includes("500")) {
      return "ASR backend でエラーが発生しました。backend のログと debug 情報を確認してください。";
    }
    return `ASR エラー: ${message}`;
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
