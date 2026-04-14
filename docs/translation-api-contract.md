# Translation API Contract

フェーズ2後半以降でローカル翻訳モデルを接続するための API 契約案です。クラウド API、有料 API、外部 SaaS は使わず、Python 側のローカルサービスとして追加する前提です。

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

- Frontend: `TranslationService` を実装する `LocalTranslationService` を `src/infra/` に追加する。
- Backend: `backend/translation_service/` を追加し、ASR と同じく `backend/.venv` の依存だけを使う。
- 切替: `VITE_TRANSLATION_SERVICE=mock | local` のような環境変数を追加する。

## 初期候補

- OPUS-MT 系など無料・ローカル実行可能な翻訳モデルを候補にする。
- モデルのライセンスと配布条件を確認してから採用する。
- 初回ネット接続が必要な場合は、ASR と同様に `backend/models/` へ事前配置する手順を用意する。
