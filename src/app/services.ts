import { LocalStorageVocabularyNotebookService } from "../infra/localStorageVocabularyNotebookService";
import { LocalAsrSpeechRecognitionService } from "../infra/localAsrSpeechRecognitionService";
import { LocalTranslationService } from "../infra/localTranslationService";
import { MockDictionaryService } from "../infra/mockDictionaryService";
import { MockLectureStreamService } from "../infra/mockLectureStreamService";
import { MockSpeechRecognitionService } from "../infra/mockSpeechRecognitionService";
import { MockTranslationService } from "../infra/mockTranslationService";
import type { AsrRuntimeStatus } from "../domain/asrRuntime";

type CreateServicesOptions = {
  selectedDeviceId?: string;
  onAsrStatus?: (status: AsrRuntimeStatus) => void;
};

export const isLocalAsrMode = import.meta.env.VITE_SPEECH_SERVICE === "local-asr";

export const createServices = ({ selectedDeviceId, onAsrStatus }: CreateServicesOptions = {}) => {
  const speechRecognition = isLocalAsrMode
    ? new LocalAsrSpeechRecognitionService({
        endpoint: import.meta.env.VITE_ASR_ENDPOINT ?? "http://127.0.0.1:8765/api/asr/transcribe",
        chunkMs: Number(import.meta.env.VITE_ASR_CHUNK_MS ?? 4000),
        minChunkBytes: Number(import.meta.env.VITE_ASR_MIN_CHUNK_BYTES ?? 512),
        maxInFlightRequests: Number(import.meta.env.VITE_ASR_MAX_IN_FLIGHT ?? 1),
        overlapMs: Number(import.meta.env.VITE_ASR_OVERLAP_MS ?? 800),
        deviceId: selectedDeviceId,
        debugLoopback: import.meta.env.VITE_ASR_CLIENT_DEBUG === "1",
        onStatus: onAsrStatus,
      })
    : new MockSpeechRecognitionService();
  const translation =
    import.meta.env.VITE_TRANSLATION_SERVICE === "mock"
      ? new MockTranslationService()
      : new LocalTranslationService({
          endpoint: import.meta.env.VITE_TRANSLATION_ENDPOINT ?? "http://127.0.0.1:8765/api/translate",
        });

  return {
    lectureStream: new MockLectureStreamService(speechRecognition, translation),
    dictionary: new MockDictionaryService(),
    vocabularyNotebook: new LocalStorageVocabularyNotebookService(),
  };
};
