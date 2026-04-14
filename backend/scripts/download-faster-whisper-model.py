from __future__ import annotations

import argparse
from pathlib import Path

from huggingface_hub import snapshot_download


MODEL_REPOS = {
    "tiny.en": "Systran/faster-whisper-tiny.en",
    "base.en": "Systran/faster-whisper-base.en",
    "small.en": "Systran/faster-whisper-small.en",
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Download a faster-whisper model for offline use.")
    parser.add_argument("--model", default="tiny.en", choices=MODEL_REPOS.keys())
    parser.add_argument("--output-dir", default="backend/models")
    args = parser.parse_args()

    output_path = Path(args.output_dir).resolve() / args.model
    output_path.mkdir(parents=True, exist_ok=True)

    snapshot_download(
        repo_id=MODEL_REPOS[args.model],
        local_dir=output_path,
    )

    print(f"Downloaded {args.model} to {output_path}")
    print(f"Use ASR_MODEL_PATH={output_path}")


if __name__ == "__main__":
    main()
