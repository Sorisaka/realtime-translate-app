from __future__ import annotations

from dataclasses import dataclass
import json
import shutil
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

from .config import CONFIG, AsrConfig


@dataclass(frozen=True)
class TranscriptionResult:
    text: str
    segment_count: int


class LocalAsrEngine:
    def __init__(self, config: AsrConfig) -> None:
        self.config = config
        self._model: Any | None = None

    def transcribe(self, audio_path: Path) -> TranscriptionResult:
        model = self._load_model()
        segments, _info = model.transcribe(
            str(audio_path),
            language=self.config.language,
            vad_filter=self.config.vad_filter,
            vad_parameters={"min_silence_duration_ms": self.config.vad_min_silence_ms}
            if self.config.vad_filter
            else None,
        )
        segment_texts = [segment.text.strip() for segment in segments]
        return TranscriptionResult(text=" ".join(segment_texts).strip(), segment_count=len(segment_texts))

    def normalize_audio(self, input_path: Path, output_path: Path) -> None:
        command = [
            self.config.ffmpeg_path,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(input_path),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-f",
            "wav",
            str(output_path),
        ]

        try:
            subprocess.run(
                command,
                check=True,
                capture_output=True,
                text=True,
                timeout=self.config.ffmpeg_timeout_sec,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                f"ffmpeg was not found at `{self.config.ffmpeg_path}`. Install ffmpeg or set ASR_FFMPEG_PATH."
            ) from exc
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.strip() or "no stderr"
            raise RuntimeError(f"ffmpeg failed to decode audio: {stderr}") from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"ffmpeg timed out after {self.config.ffmpeg_timeout_sec} seconds") from exc

    def probe_duration_ms(self, audio_path: Path) -> int | None:
        command = [
            self.config.ffprobe_path,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(audio_path),
        ]
        try:
            result = subprocess.run(
                command,
                check=True,
                capture_output=True,
                text=True,
                timeout=self.config.ffmpeg_timeout_sec,
            )
        except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            return None

        try:
            duration_sec = float(json.loads(result.stdout)["format"]["duration"])
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            return None

        return round(duration_sec * 1000)

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
                "vadFilter": CONFIG.vad_filter,
                "vadMinSilenceMs": CONFIG.vad_min_silence_ms,
                "ffmpegPath": CONFIG.ffmpeg_path,
                "ffprobePath": CONFIG.ffprobe_path,
                "ffmpegTimeoutSec": CONFIG.ffmpeg_timeout_sec,
                "debugKeepAudio": CONFIG.debug_keep_audio,
                "debugDir": CONFIG.debug_dir,
                "allowedOrigins": sorted(CONFIG.allowed_origins),
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
        content_type = self.headers.get("Content-Type", "")
        audio_bytes = self.rfile.read(content_length)

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            input_path = temp_path / f"input{suffix}"
            normalized_path = temp_path / "normalized.wav"
            input_path.write_bytes(audio_bytes)
            normalized_duration_ms: int | None = None
            saved_debug_paths: dict[str, str] = {}

            try:
                transcribe_path = input_path
                if suffix != ".wav":
                    self.engine.normalize_audio(input_path, normalized_path)
                    transcribe_path = normalized_path
                normalized_duration_ms = self.engine.probe_duration_ms(transcribe_path)
                result = self.engine.transcribe(transcribe_path)
                saved_debug_paths = self._keep_debug_audio(input_path, normalized_path if normalized_path.exists() else None)
            except Exception as exc:  # pragma: no cover - operational detail
                self._send_json({"error": str(exc)}, status=500)
                return

        debug = {
            "input_bytes": len(audio_bytes),
            "content_type": content_type,
            "input_suffix": suffix,
            "decoded_duration_ms": normalized_duration_ms,
            "vad_filter_enabled": CONFIG.vad_filter,
            "vad_no_speech_detected": CONFIG.vad_filter and result.segment_count == 0 and normalized_duration_ms is not None,
            "segment_count": result.segment_count,
            "debug_audio_saved": bool(saved_debug_paths),
            "debug_audio_paths": saved_debug_paths,
        }
        self._send_json({"text": result.text, "language": CONFIG.language, "status": "final", "debug": debug})

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

    def _keep_debug_audio(self, input_path: Path, normalized_path: Path | None) -> dict[str, str]:
        if not CONFIG.debug_keep_audio:
            return {}

        debug_dir = Path(CONFIG.debug_dir)
        if not debug_dir.is_absolute():
            debug_dir = Path.cwd() / debug_dir
        debug_dir.mkdir(parents=True, exist_ok=True)

        request_id = uuid4().hex
        saved_input = debug_dir / f"{request_id}{input_path.suffix}"
        shutil.copyfile(input_path, saved_input)
        paths = {"input": str(saved_input)}

        if normalized_path and normalized_path.exists():
            saved_normalized = debug_dir / f"{request_id}.wav"
            shutil.copyfile(normalized_path, saved_normalized)
            paths["normalized_wav"] = str(saved_normalized)

        return paths

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
        if origin in CONFIG.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
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
