import { LocalStorageVocabularyNotebookService } from "../infra/localStorageVocabularyNotebookService";
import { LocalAsrSpeechRecognitionService } from "../infra/localAsrSpeechRecognitionService";
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
        deviceId: selectedDeviceId,
        onStatus: onAsrStatus,
      })
    : new MockSpeechRecognitionService();
  const translation = new MockTranslationService();

  return {
    lectureStream: new MockLectureStreamService(speechRecognition, translation),
    dictionary: new MockDictionaryService(),
    vocabularyNotebook: new LocalStorageVocabularyNotebookService(),
  };
};
