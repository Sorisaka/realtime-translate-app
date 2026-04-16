# Translation and ASR Improvement

## 問題整理

- 翻訳は `MockTranslationService` が既定で使われており、実講義音声の翻訳になっていなかった。
- ASR は 4 秒ごとのチャンクを順番に送っていたため、チャンク境界付近の語が `with` -> `we` や `difference` -> `different` のように崩れやすかった。
- 連結処理は前回末尾と次回先頭の完全一致に近い重複除去が中心で、句読点、大文字小文字、短い誤認識に弱かった。

## 今回の改善

- `LocalTranslationService` を追加し、frontend から backend の `POST /api/translate` に翻訳リクエストを送るようにした。
- backend に Argos Translate 用のローカル翻訳エンドポイントを追加した。
- `VITE_TRANSLATION_SERVICE=mock` を明示した時だけモック翻訳を使う。既定は local translation。
- 翻訳失敗時は console にエラーを出し、UI には失敗メッセージを表示する。英語文字起こしの更新は止めない。
- `VITE_ASR_OVERLAP_MS` を追加し、既定で 800ms のオーバーラップ録音を行う。
- ASR 結合処理で token の小文字化、空白正規化、句読点除去、短い Levenshtein 距離による fuzzy overlap を使うようにした。
- `VITE_ASR_CLIENT_DEBUG=1` の時に、チャンク秒数、overlap 秒数、結合判定を console に出す。

## 実行方法

Python backend の依存を入れる。

```bash
bash backend/scripts/setup-python-venv.sh
```

Argos Translate の英日モデルを取得する。初回のみネットワーク接続が必要。

```bash
cd /home/yukikago/projects/realtime-translate-app
. backend/.venv/bin/activate
python backend/scripts/download-argos-translate-model.py --source en --target ja
```

backend を起動する。

```bash
cd /home/yukikago/projects/realtime-translate-app/backend
. .venv/bin/activate
ASR_MODEL_PATH=/home/yukikago/projects/realtime-translate-app/backend/models/tiny.en python -m asr_service.server
```

frontend を実 ASR で起動する。

```bash
cd /home/yukikago/projects/realtime-translate-app
VITE_SPEECH_SERVICE=local-asr npm run dev
```

翻訳だけ一時的にモックへ戻す場合。

```bash
VITE_TRANSLATION_SERVICE=mock VITE_SPEECH_SERVICE=local-asr npm run dev
```

## 主要な設定値

- `VITE_ASR_CHUNK_MS`: ASR チャンク長。既定値 `4000`
- `VITE_ASR_OVERLAP_MS`: 次チャンクと重ねる録音時間。既定値 `800`。`0` でオーバーラップなし。
- `VITE_ASR_MIN_CHUNK_BYTES`: 小さすぎる音声 Blob を送らない閾値。既定値 `512`
- `VITE_ASR_MAX_IN_FLIGHT`: 同時 ASR リクエスト数上限。既定値 `1`
- `VITE_ASR_CLIENT_DEBUG`: `1` で frontend の ASR debug console log を有効化
- `VITE_ASR_ENDPOINT`: ASR endpoint。既定値 `http://127.0.0.1:8765/api/asr/transcribe`
- `VITE_TRANSLATION_ENDPOINT`: 翻訳 endpoint。既定値 `http://127.0.0.1:8765/api/translate`
- `VITE_TRANSLATION_SERVICE`: `mock` の時だけモック翻訳
- `TRANSLATION_SOURCE_LANGUAGE`: backend 翻訳元言語。既定値 `en`
- `TRANSLATION_TARGET_LANGUAGE`: backend 翻訳先言語。既定値 `ja`

## Debug 有効化

frontend 側:

```bash
VITE_SPEECH_SERVICE=local-asr VITE_ASR_CLIENT_DEBUG=1 npm run dev
```

backend 側:

```bash
cd backend
. .venv/bin/activate
python -m asr_service.server --debug-loopback
```

確認する値:

- `durationMs`: frontend が送ったチャンクの実時間
- `overlapMs`: そのチャンクで使った overlap
- `ASR join exact overlap`: 完全一致で重複を除去した箇所
- `ASR join fuzzy overlap`: 短い誤認識を許容して重複を除去した箇所
- backend response の `decoded_duration_ms`, `segment_count`, `vad_no_speech_detected`

## 長尺音声での確認

1. TED などの原文 script を `tmp/reference.txt` に保存する。
2. アプリの English transcript を `tmp/transcript-before.txt` に保存する。
3. `VITE_ASR_OVERLAP_MS=800` で同じ音声を流し、結果を `tmp/transcript-after.txt` に保存する。
4. 簡易評価を実行する。

```bash
python scripts/evaluate_transcript.py tmp/reference.txt tmp/transcript-before.txt
python scripts/evaluate_transcript.py tmp/reference.txt tmp/transcript-after.txt
```

比較観点:

- `rough_word_error_rate` が下がるか。
- `function_word_error_blocks` が減るか。
- `near_miss_blocks` の例に境界語の崩れが集中していないか。
- `with`, `we`, `difference`, `different` など境界で崩れやすい語の前後が自然か。
- 重複ゼロより、意味が落ちずに読みやすくなっているか。

## チャンク秒数と overlap 秒数の試し方

短めの遅延を優先する場合:

```bash
VITE_SPEECH_SERVICE=local-asr VITE_ASR_CHUNK_MS=3000 VITE_ASR_OVERLAP_MS=600 npm run dev
```

境界保護を優先する場合:

```bash
VITE_SPEECH_SERVICE=local-asr VITE_ASR_CHUNK_MS=5000 VITE_ASR_OVERLAP_MS=1000 npm run dev
```

既存挙動に近づける場合:

```bash
VITE_SPEECH_SERVICE=local-asr VITE_ASR_OVERLAP_MS=0 npm run dev
```

## 既知の制限

- Argos Translate の言語モデルはリポジトリに含めない。初回取得または事前配置が必要。
- `VITE_ASR_MAX_IN_FLIGHT=1` のまま overlap を増やすと、backend が遅い環境ではチャンクが skip される場合がある。
- fuzzy overlap は保守的にしているため、境界の誤認識を完全には吸収しない。
- 現時点では VAD ベースの文境界分割や本格ストリーミング ASR には踏み込んでいない。
