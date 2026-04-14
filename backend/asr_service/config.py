from dataclasses import dataclass
import os


@dataclass(frozen=True)
class AsrConfig:
    host: str = os.getenv("ASR_HOST", "127.0.0.1")
    port: int = int(os.getenv("ASR_PORT", "8765"))
    model_name: str = os.getenv("ASR_MODEL_NAME", "tiny.en")
    model_path: str | None = os.getenv("ASR_MODEL_PATH")
    device: str = os.getenv("ASR_DEVICE", "cpu")
    compute_type: str = os.getenv("ASR_COMPUTE_TYPE", "int8")
    language: str = os.getenv("ASR_LANGUAGE", "en")
    vad_min_silence_ms: int = int(os.getenv("ASR_VAD_MIN_SILENCE_MS", "700"))


CONFIG = AsrConfig()
