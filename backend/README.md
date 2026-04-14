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
- `ASR_DEVICE`: 既定値 `cpu`
- `ASR_COMPUTE_TYPE`: 既定値 `int8`
- `ASR_LANGUAGE`: 既定値 `en`

`tiny.en` は初回利用時にモデル取得が必要になる場合があります。完全オフライン運用では、事前にモデルをローカルキャッシュへ配置してください。
