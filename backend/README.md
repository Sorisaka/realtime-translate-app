# Local ASR Backend

フェーズ2前半のローカル ASR サービスです。クラウド API や有料 API は使わず、`faster-whisper` をプロジェクト内の venv に入れて実行します。

## セットアップ

```bash
bash backend/scripts/setup-python-venv.sh
```

手動で行う場合:

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

## 起動

```bash
cd backend
. .venv/bin/activate
python -m asr_service.server
```

既定では `http://127.0.0.1:8765` で起動します。

## 設定

環境変数で変更できます。

- `ASR_HOST`: 既定値 `127.0.0.1`
- `ASR_PORT`: 既定値 `8765`
- `ASR_MODEL_NAME`: 既定値 `tiny.en`
- `ASR_MODEL_PATH`: 事前配置済みモデルのローカルパス
- `ASR_DEVICE`: 既定値 `cpu`
- `ASR_COMPUTE_TYPE`: 既定値 `int8`
- `ASR_LANGUAGE`: 既定値 `en`
- `ASR_VAD_FILTER`: 既定値 `true`
- `ASR_VAD_MIN_SILENCE_MS`: 既定値 `700`
- `ASR_FFMPEG_PATH`: 既定値 `ffmpeg`
- `ASR_FFPROBE_PATH`: 既定値 `ffprobe`
- `ASR_FFMPEG_TIMEOUT_SEC`: 既定値 `20`
- `ASR_DEBUG_KEEP_AUDIO`: 既定値 `false`
- `ASR_DEBUG_DIR`: 既定値 `debug-audio`
- `ASR_ALLOWED_ORIGINS`: CORS 許可 origin のカンマ区切り。既定値は `http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:5173,http://localhost:5174`

`tiny.en` は初回利用時にモデル取得が必要になる場合があります。完全オフライン運用では、事前にモデルをローカルキャッシュへ配置してください。

## ffmpeg

ブラウザの `MediaRecorder` は通常 `audio/webm;codecs=opus` を送ります。frontend は一定秒数録音して `stop()` した完成 Blob を送信します。backend は受信した WebM/OGG を ffmpeg で 16kHz mono WAV に変換してから faster-whisper に渡します。

Ubuntu 例:

```bash
sudo apt install ffmpeg
```

別パスの ffmpeg を使う場合:

```bash
ASR_FFMPEG_PATH=/path/to/ffmpeg python -m asr_service.server
```

## 空文字レスポンスの確認

`{"text": ""}` が返る場合は、受信音声に声が入っているか、VAD で無音扱いになっているかを切り分けます。

```bash
cd /home/yukikago/projects/realtime-translate-app/backend
. .venv/bin/activate
ASR_DEBUG_KEEP_AUDIO=1 ASR_VAD_FILTER=false ASR_MODEL_PATH=/home/yukikago/projects/realtime-translate-app/backend/models/tiny.en python -m asr_service.server
```

`ASR_DEBUG_KEEP_AUDIO=1` の時、受信音声と変換後 WAV は `backend/debug-audio/` に保存されます。レスポンスの `debug` には以下が含まれます。

- `input_bytes`
- `content_type`
- `decoded_duration_ms`
- `vad_filter_enabled`
- `vad_no_speech_detected`
- `segment_count`
- `debug_audio_paths`

保存された WAV を再生して声が入っているか確認してください。
`ASR_VAD_FILTER=false` は切り分け用です。無音でも Whisper が短い語を hallucinate する場合があるため、通常運用では既定値の `true` に戻してください。

## CORS

Vite の開発サーバーが `5173` または `5174` で起動しても使えるよう、既定で以下を許可しています。

- `http://127.0.0.1:5173`
- `http://127.0.0.1:5174`
- `http://localhost:5173`
- `http://localhost:5174`

別の origin を使う場合は `ASR_ALLOWED_ORIGINS` を指定してください。

```bash
ASR_ALLOWED_ORIGINS=http://127.0.0.1:5174 python -m asr_service.server
```

## オフライン用モデル配置

ネットワークが使える環境で一度だけモデルを取得します。

```bash
cd /home/yukikago/projects/realtime-translate-app
. backend/.venv/bin/activate
python backend/scripts/download-faster-whisper-model.py --model tiny.en
```

取得後、オフライン環境では `ASR_MODEL_PATH` にローカルパスを指定して起動します。

```bash
cd /home/yukikago/projects/realtime-translate-app/backend
. .venv/bin/activate
ASR_MODEL_PATH=/home/yukikago/projects/realtime-translate-app/backend/models/tiny.en python -m asr_service.server
```
