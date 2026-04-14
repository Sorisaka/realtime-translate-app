from __future__ import annotations

import json
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .config import CONFIG, AsrConfig


class LocalAsrEngine:
    def __init__(self, config: AsrConfig) -> None:
        self.config = config
        self._model: Any | None = None

    def transcribe(self, audio_path: Path) -> str:
        model = self._load_model()
        segments, _info = model.transcribe(
            str(audio_path),
            language=self.config.language,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": self.config.vad_min_silence_ms},
        )
        return " ".join(segment.text.strip() for segment in segments).strip()

    def _load_model(self) -> Any:
        if self._model is None:
            try:
                from faster_whisper import WhisperModel
            except ImportError as exc:
                raise RuntimeError(
                    "faster-whisper is not installed. Create backend/.venv and run "
                    "`python -m pip install -r backend/requirements.txt`."
                ) from exc

            model_ref = self.config.model_path or self.config.model_name
            self._model = WhisperModel(
                model_ref,
                device=self.config.device,
                compute_type=self.config.compute_type,
            )

        return self._model


class AsrRequestHandler(BaseHTTPRequestHandler):
    engine: LocalAsrEngine
    allowed_origins = {"http://127.0.0.1:5173", "http://localhost:5173"}

    def do_OPTIONS(self) -> None:
        self._send_empty(204)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path != "/health":
            self._send_json({"error": "not found"}, status=404)
            return

        self._send_json(
            {
                "status": "ok",
                "model": CONFIG.model_name,
                "modelPath": CONFIG.model_path,
                "device": CONFIG.device,
                "computeType": CONFIG.compute_type,
                "language": CONFIG.language,
                "vadMinSilenceMs": CONFIG.vad_min_silence_ms,
            }
        )

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path != "/api/asr/transcribe":
            self._send_json({"error": "not found"}, status=404)
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            self._send_json({"error": "empty audio body"}, status=400)
            return

        suffix = self._suffix_from_content_type(self.headers.get("Content-Type", ""))
        audio_bytes = self.rfile.read(content_length)

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as audio_file:
            audio_file.write(audio_bytes)
            audio_file.flush()

            try:
                text = self.engine.transcribe(Path(audio_file.name))
            except Exception as exc:  # pragma: no cover - operational detail
                self._send_json({"error": str(exc)}, status=500)
                return

        self._send_json({"text": text, "language": CONFIG.language, "status": "final"})

    def log_message(self, format: str, *args: Any) -> None:
        return

    def _suffix_from_content_type(self, content_type: str) -> str:
        if "webm" in content_type:
            return ".webm"
        if "ogg" in content_type:
            return ".ogg"
        if "wav" in content_type:
            return ".wav"
        return ".audio"

    def _send_empty(self, status: int) -> None:
        self.send_response(status)
        self._send_cors_headers()
        self.end_headers()

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        allowed_origin = origin if origin in self.allowed_origins else "http://127.0.0.1:5173"
        self.send_header("Access-Control-Allow-Origin", allowed_origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")


def main() -> None:
    AsrRequestHandler.engine = LocalAsrEngine(CONFIG)
    server = ThreadingHTTPServer((CONFIG.host, CONFIG.port), AsrRequestHandler)
    print(
        f"Local ASR service listening on http://{CONFIG.host}:{CONFIG.port} "
        f"(model={CONFIG.model_path or CONFIG.model_name}, device={CONFIG.device}, "
        f"compute_type={CONFIG.compute_type})"
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
