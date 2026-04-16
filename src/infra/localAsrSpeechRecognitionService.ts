import type { AsrRuntimeStatus } from "../domain/asrRuntime";
import type { SpeechRecognitionService } from "../domain/services";
import type { TranscriptSegment } from "../domain/transcript";

type LocalAsrOptions = {
  endpoint: string;
  chunkMs: number;
  minChunkBytes: number;
  maxInFlightRequests: number;
  overlapMs: number;
  deviceId?: string;
  debugLoopback: boolean;
  onStatus?: (status: AsrRuntimeStatus) => void;
};

type AsrResponse = {
  text?: string;
  error?: string;
  debug?: Record<string, unknown>;
};

type TranscribeResult = {
  text: string;
  debug?: Record<string, unknown>;
};

const asrLogPrefix = "[ASR client]";

export class LocalAsrSpeechRecognitionService implements SpeechRecognitionService {
  constructor(private readonly options: LocalAsrOptions) {}

  start(onSegment: (segment: TranscriptSegment) => void): () => void {
    let stopped = false;
    let stream: MediaStream | null = null;
    const activeRecorders = new Set<MediaRecorder>();
    const timerIds = new Set<number>();
    let segmentIndex = 0;
    let inFlightRequests = 0;
    let lastFinalText = "";
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
      this.debugLog("getUserMedia stream acquired", {
        selectedDeviceId: this.options.deviceId,
        audioTrackCount: stream.getAudioTracks().length,
        tracks: stream.getAudioTracks().map((track) => ({
          label: track.label,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          settings: track.getSettings(),
        })),
      });

      cleanupLevelMeter = this.startLevelMeter(stream, (level) => {
        currentLevel = level;
        emitStatus({ phase: activeRecorders.size > 0 ? "recording" : "idle" });
      });
      this.debugLog("MediaRecorder support", this.getMimeTypeDiagnostics());

      const recordSegment = () => {
        if (stopped || !stream) return;

        const mimeType = this.selectMimeType();
        const chunks: Blob[] = [];
        const chunkByteLengths: number[] = [];
        const segmentStartedAt = Date.now();
        const overlapMs = Math.max(0, Math.min(this.options.overlapMs, this.options.chunkMs - 100));
        const nextSegmentDelayMs = Math.max(100, this.options.chunkMs - overlapMs);

        try {
          const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          activeRecorders.add(recorder);

          this.debugLog("MediaRecorder created", {
            selectedMimeType: mimeType || "browser-default",
            recorderMimeType: recorder.mimeType || "browser-default",
            recorderState: recorder.state,
            segmentIndex,
            chunkMs: this.options.chunkMs,
            overlapMs,
            nextSegmentDelayMs,
          });
          emitStatus({ phase: "recording", recorderMimeType: recorder.mimeType || "browser-default" });

          recorder.onstart = () => {
            this.debugLog("recorder.onstart", {
              recorderState: recorder.state,
              recorderMimeType: recorder.mimeType,
              segmentIndex,
            });
          };

          recorder.ondataavailable = (event) => {
            const chunkMeta = {
              size: event.data.size,
              type: event.data.type,
              recorderMimeType: recorder.mimeType,
              segmentIndex,
            };
            this.debugLog("recorder.ondataavailable", chunkMeta);

            if (event.data.size > 0) {
              void event.data.arrayBuffer().then((arrayBuffer) => {
                chunkByteLengths.push(arrayBuffer.byteLength);
                this.debugLog("chunk ArrayBuffer read", {
                  byteLength: arrayBuffer.byteLength,
                  chunkIndex: chunkByteLengths.length - 1,
                  segmentIndex,
                });
              });
              chunks.push(event.data);
              return;
            }

            this.debugLog("empty chunk received", chunkMeta, "warn");
          };

          recorder.onerror = (event) => {
            this.debugLog("recorder.onerror", { error: event.error?.message ?? event.error?.name, segmentIndex }, "error");
          };

          recorder.onstop = () => {
            activeRecorders.delete(recorder);
            const completedAtMs = Date.now();
            const blobType = recorder.mimeType || mimeType || chunks[0]?.type || "application/octet-stream";
            const audio = new Blob(chunks, { type: blobType });
            const durationMs = completedAtMs - segmentStartedAt;

            this.debugLog("recorder.onstop", {
              recorderState: recorder.state,
              chunkCount: chunks.length,
              chunkSizes: chunks.map((chunk) => chunk.size),
              chunkByteLengths,
              finalBlobType: audio.type,
              finalBlobSize: audio.size,
              minChunkBytes: this.options.minChunkBytes,
              inFlightRequests,
              durationMs,
              overlapMs,
              segmentIndex,
            });

            if (stopped) return;

            if (overlapMs <= 0) {
              recordSegment();
            }

            if (audio.size < this.options.minChunkBytes) {
              this.debugLog(
                "blob skipped because too small",
                { audioSize: audio.size, minChunkBytes: this.options.minChunkBytes, segmentIndex },
                "warn",
              );
              return;
            }

            if (inFlightRequests >= this.options.maxInFlightRequests) {
              this.debugLog(
                "blob skipped because max in-flight requests reached",
                { inFlightRequests, maxInFlightRequests: this.options.maxInFlightRequests, segmentIndex },
                "warn",
              );
              return;
            }

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

            void this.transcribe(audio, { id, durationMs, overlapMs })
              .then(({ text, debug }) => {
                if (stopped) return;
                const joinedText = this.removeRepeatedPrefix(text, lastFinalText);
                lastFinalText = this.appendFinalText(lastFinalText, joinedText);
                emitStatus({ phase: "recording", debug });
                onSegment({
                  id,
                  text: joinedText,
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
                  emitStatus({ phase: activeRecorders.size > 0 ? "recording" : "idle" });
                }
              });
          };

          recorder.start();
          this.debugLog("recorder.start called", { recorderState: recorder.state, chunkMs: this.options.chunkMs, overlapMs });

          if (overlapMs > 0) {
            const nextTimerId = window.setTimeout(() => {
              timerIds.delete(nextTimerId);
              recordSegment();
            }, nextSegmentDelayMs);
            timerIds.add(nextTimerId);
          }

          const stopTimerId = window.setTimeout(() => {
            timerIds.delete(stopTimerId);
            if (recorder.state === "recording") {
              this.debugLog("recorder.stop scheduled", { recorderState: recorder.state, segmentIndex });
              recorder.stop();
            }
          }, this.options.chunkMs);
          timerIds.add(stopTimerId);
        } catch (error) {
          this.debugLog("MediaRecorder creation failed", { error: this.errorToString(error), mimeType }, "error");
          throw error;
        }
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
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
      timerIds.clear();
      activeRecorders.forEach((recorder) => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      });
      activeRecorders.clear();
      cleanupLevelMeter?.();
      stream?.getTracks().forEach((track) => track.stop());
      this.debugLog("recording stopped", { stoppedTrackCount: stream?.getTracks().length ?? 0 });
    };
  }

  private async transcribe(audio: Blob, meta: { id: string; durationMs: number; overlapMs: number }): Promise<TranscribeResult> {
    this.debugLog("sending audio", {
      endpoint: this.options.endpoint,
      blobSize: audio.size,
      contentType: audio.type || "application/octet-stream",
      ...meta,
    });

    const response = await fetch(this.options.endpoint, {
      method: "POST",
      headers: { "Content-Type": audio.type || "application/octet-stream" },
      body: audio,
    });
    const payload = (await response.json()) as AsrResponse;

    this.debugLog("response received", {
      status: response.status,
      ok: response.ok,
      payload,
      debug: payload.debug,
    });

    if (!response.ok || payload.error) {
      throw new Error(payload.error ?? `ASR request failed with status ${response.status}`);
    }

    this.debugLog("ASR debug payload", payload.debug);

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
    analyser.fftSize = 512;
    const source = audioContext.createMediaStreamSource(stream);
    const data = new Uint8Array(analyser.fftSize);
    let frameId = 0;
    let stopped = false;
    let lastEmitAt = 0;

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

  private debugLog(message: string, data?: unknown, level: "log" | "warn" | "error" = "log"): void {
    if (!this.options.debugLoopback) return;
    console[level](asrLogPrefix, message, data ?? "");
  }

  private errorToString(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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

    const previousWords = normalizedPrevious.split(" ");
    const nextWords = normalizedText.split(" ");
    const previousTokens = previousWords.map((word) => this.normalizeToken(word));
    const nextTokens = nextWords.map((word) => this.normalizeToken(word));
    const maxOverlap = Math.min(previousWords.length, nextWords.length);

    for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
      const previousTail = previousTokens.slice(-overlap);
      const nextHead = nextTokens.slice(0, overlap);
      if (previousTail.every((token, index) => token !== "" && token === nextHead[index])) {
        this.debugLog("ASR join exact overlap", { overlap, text, previousText });
        return nextWords.slice(overlap).join(" ").trim();
      }
    }

    const fuzzyOverlap = this.findFuzzyTokenOverlap(previousTokens, nextTokens);
    if (fuzzyOverlap > 0) {
      this.debugLog("ASR join fuzzy overlap", { overlap: fuzzyOverlap, text, previousText });
      return nextWords.slice(fuzzyOverlap).join(" ").trim();
    }

    this.debugLog("ASR join no overlap", { text, previousText });
    return normalizedText;
  }

  private appendFinalText(previousText: string, nextText: string): string {
    if (!nextText.trim()) return previousText.trim();
    if (!previousText.trim()) return nextText.trim();
    return `${previousText.trim()} ${nextText.trim()}`.replace(/\s+/g, " ");
  }

  private findFuzzyTokenOverlap(previousTokens: string[], nextTokens: string[]): number {
    const maxOverlap = Math.min(previousTokens.length, nextTokens.length, 8);

    for (let overlap = maxOverlap; overlap >= 2; overlap -= 1) {
      const previousTail = previousTokens.slice(-overlap);
      const nextHead = nextTokens.slice(0, overlap);
      const matches = previousTail.filter((token, index) => token !== "" && this.areSimilarTokens(token, nextHead[index])).length;
      const requiredMatches = overlap <= 3 ? overlap : Math.ceil(overlap * 0.75);

      if (matches >= requiredMatches) {
        return overlap;
      }
    }

    return 0;
  }

  private areSimilarTokens(left: string, right: string): boolean {
    if (!left || !right) return false;
    if (left === right) return true;
    if (left.length < 4 || right.length < 4) return false;

    const distance = this.levenshteinDistance(left, right);
    const maxLength = Math.max(left.length, right.length);
    return distance <= 1 || distance / maxLength <= 0.25;
  }

  private normalizeToken(token: string): string {
    return token
      .toLowerCase()
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
      .replace(/[’']/g, "");
  }

  private levenshteinDistance(left: string, right: string): number {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    const current = Array.from({ length: right.length + 1 }, () => 0);

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      current[0] = leftIndex;
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
        current[rightIndex] = Math.min(
          current[rightIndex - 1] + 1,
          previous[rightIndex] + 1,
          previous[rightIndex - 1] + cost,
        );
      }
      previous.splice(0, previous.length, ...current);
    }

    return previous[right.length];
  }
}
