"""Reviewed model inventory. Runtime never fetches an asset from the network."""

from __future__ import annotations

import hashlib
from pathlib import Path

CHATTERBOX_SOURCE_REVISION = "5de7a54aa4e5e2baadb0182dde554908b48b85c2"
MODEL_REPOSITORY = "ResembleAI/chatterbox-nano"
MODEL_REVISION = "71ccd1d0081b430592cea481f4307e764e07bc64"
PERTH_SOURCE_REVISION = "ff1c8ac55a976971245cdd53c18d6131ca00d993"
PERTH_CHECKPOINT_SHA256 = "a15bce457ebc53ce5e6c9c3f11df78cf7ee2bf9cdab0a798902135b4c4027670"

# Deliberately exclude s3gen.safetensors: Nano uses s3gen_meanflow.safetensors.
MODEL_ASSETS: dict[str, tuple[int, str]] = {
    "added_tokens.json": (418, "72e4ab6acb0d9309ac3df4b526ae5fd80a2da5bc5ab7bb02d85096a374f69193"),
    "conds.pt": (169454, "b1852099306fd6a7814eb9d0bd10186caba7249596cc23868f78a0eefbfa5033"),
    "merges.txt": (456318, "1ce1664773c50f3e0cc8842619a93edc4624525b728b188a9e0be33b7726adc5"),
    "s3gen_meanflow.safetensors": (1064875036, "d65cb687a2ed581ee6cc297e919ffefa63386944f42364ae13b78a594945514f"),
    "special_tokens_map.json": (470, "92ba8063bf40aa163eadebbfe0de07c2aebe44cf0d4a9e8726580b0781fd2640"),
    "t3_nano_v1.safetensors": (869899204, "72b110185087d945dbdf54dee4e333848e1811bdd5fd6cb16ceb8da50006f0c9"),
    "tokenizer_config.json": (3878, "bca16a2ac1ddbd78b8d6228f0031884cc74b6ea54b967d6f6d2ebae9ccde23e6"),
    "ve.safetensors": (5695784, "f0921cab452fa278bc25cd23ffd59d36f816d7dc5181dd1bef9751a7fb61f63c"),
    "vocab.json": (999186, "f6bd25a65e4e63ca31360e9fb11c7e4f9a391a78385d640acd814092dd6eee4f"),
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_model_assets(directory: Path) -> None:
    """Fail closed before deserializing even the trusted built-in conditionals."""
    for name, (size, digest) in MODEL_ASSETS.items():
        path = directory / name
        if not path.is_file() or path.stat().st_size != size or sha256_file(path) != digest:
            raise RuntimeError("model_assets_unavailable")
