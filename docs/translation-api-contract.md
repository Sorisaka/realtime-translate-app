# Translation API Contract

ローカル翻訳モデル接続用の API 契約です。クラウド API、有料 API、外部 SaaS は使わず、Python backend の `POST /api/translate` として提供します。

## Endpoint

```http
POST /api/translate
Content-Type: application/json
```

## Request

```json
{
  "sourceLanguage": "en",
  "targetLanguage": "ja",
  "segments": [
    {
      "id": "segment-1",
      "text": "Today we will explore attention mechanisms.",
      "status": "final",
      "startedAtMs": 1713070800000,
      "completedAtMs": 1713070804000
    }
  ],
  "context": {
    "lectureTitle": "optional local title",
    "previousSourceText": "optional previous transcript text",
    "previousTargetText": "optional previous translation text"
  }
}
```

## Response

```json
{
  "translations": [
    {
      "id": "translation-segment-1",
      "sourceSegmentId": "segment-1",
      "text": "今日は注意機構について見ていきます。",
      "status": "final"
    }
  ]
}
```

## Error

```json
{
  "error": "message"
}
```

## Adapter Placement

- Frontend: `TranslationService` を実装する `LocalTranslationService` を `src/infra/` に置く。
- Backend: ASR と同じ `backend/asr_service/server.py` の HTTP server に `/api/translate` を追加する。
- 切替: `VITE_TRANSLATION_SERVICE=mock` の時だけ `MockTranslationService` を使う。既定は local translation。

## Local Model

- 既定実装は Argos Translate の英日ローカルモデルを使う。
- 依存は `backend/requirements.txt` に置く。
- 言語モデルはリポジトリに含めず、`backend/scripts/download-argos-translate-model.py` で取得する。
- 初回ネット接続が必要。取得後はローカルで翻訳する。
