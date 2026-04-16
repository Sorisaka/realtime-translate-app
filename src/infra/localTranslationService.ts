import type { TranslationService } from "../domain/services";
import type { TranscriptSegment, TranslationSegment } from "../domain/transcript";

type LocalTranslationOptions = {
  endpoint: string;
};

type TranslationResponse = {
  translations?: TranslationSegment[];
  error?: string;
};

export class LocalTranslationService implements TranslationService {
  constructor(private readonly options: LocalTranslationOptions) {}

  async translate(segment: TranscriptSegment): Promise<TranslationSegment> {
    const response = await fetch(this.options.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceLanguage: "en",
        targetLanguage: "ja",
        segments: [segment],
      }),
    });
    const payload = (await response.json()) as TranslationResponse;

    if (!response.ok || payload.error) {
      throw new Error(payload.error ?? `Translation request failed with status ${response.status}`);
    }

    const translation = payload.translations?.[0];
    if (!translation) {
      throw new Error("Translation response did not include a translated segment.");
    }

    return translation;
  }
}
