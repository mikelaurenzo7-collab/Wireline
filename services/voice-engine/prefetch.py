"""Explicit operator-only download; never imported by the HTTP request path."""

from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import tempfile
import urllib.request

from assets import MODEL_ASSETS, MODEL_REPOSITORY, MODEL_REVISION, sha256_file, verify_model_assets


def prefetch(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for name, (expected_size, expected_hash) in MODEL_ASSETS.items():
        destination = directory / name
        if destination.is_file() and destination.stat().st_size == expected_size and sha256_file(destination) == expected_hash:
            continue
        temporary: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(dir=directory, prefix=".download-", delete=False) as output:
                temporary = Path(output.name)
                url = f"https://huggingface.co/{MODEL_REPOSITORY}/resolve/{MODEL_REVISION}/{name}"
                digest = hashlib.sha256()
                length = 0
                with urllib.request.urlopen(url, timeout=60) as response:
                    while block := response.read(1024 * 1024):
                        length += len(block)
                        if length > expected_size:
                            raise RuntimeError("asset_size_mismatch")
                        output.write(block)
                        digest.update(block)
                if length != expected_size or digest.hexdigest() != expected_hash:
                    raise RuntimeError("asset_integrity_mismatch")
            os.replace(temporary, destination)
            temporary = None
            print(f"Verified {name}")
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    verify_model_assets(directory)


def main() -> None:
    parser = argparse.ArgumentParser(description="Download the reviewed Nano snapshot (~1.94 GB).")
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--verify-only", action="store_true", help="Check existing bytes without network access")
    args = parser.parse_args()
    if args.verify_only:
        verify_model_assets(args.model_dir)
        print("Model assets verified")
    else:
        prefetch(args.model_dir)


if __name__ == "__main__":
    main()
