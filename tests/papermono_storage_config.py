#!/usr/bin/env python3
"""tools/papermono-thin-config --wifi and ONE_SECURE_STORAGE: which storage each setting picks, and that the
build key is owner-only and stays the same from build to build."""
import os, pathlib, re, stat, subprocess, tempfile

tool = pathlib.Path(__file__).resolve().parent.parent / "tools/papermono-thin-config"

def run(cwd, **env):
    return subprocess.run([str(tool), "--wifi"], cwd=cwd, capture_output=True, text=True,
                          env={**os.environ, "ONE_WIFI_SSID": "net", "ONE_WIFI_PASSWORD": "pass", **env})

with tempfile.TemporaryDirectory() as work:
    config = pathlib.Path(work, "build/papermono/wifi_config.ab")
    key = pathlib.Path(work, "build/papermono/storage.key")

    assert run(work).returncode == 0
    assert re.search(r'\s0, nativeStaticBytes\("\\x00"\), 0\)', config.read_text()), "plain by default"
    assert not key.exists(), "plain makes no key"

    assert run(work, ONE_SECURE_STORAGE="build-key").returncode == 0
    first = key.read_bytes()
    assert len(first) == 64, "both XTS keys"
    assert stat.S_IMODE(key.stat().st_mode) == 0o600 and stat.S_IMODE(config.stat().st_mode) == 0o600, "owner only"
    assert "".join(f"\\x{b:02x}" for b in first) in config.read_text(), "the key reaches the app"
    assert re.search(r'\s1, nativeStaticBytes', config.read_text())
    assert run(work, ONE_SECURE_STORAGE="build-key").returncode == 0
    assert key.read_bytes() == first, "the same key next build"

    assert run(work, ONE_SECURE_STORAGE="hmac").returncode == 0
    text = config.read_text()
    assert re.search(r'\s2, nativeStaticBytes\("\\x00"\), 5\)', text), "fuse key 5 by default"
    assert "".join(f"\\x{b:02x}" for b in first) not in text, "hmac has no key in the image"
    assert run(work, ONE_SECURE_STORAGE="hmac", ONE_SECURE_STORAGE_KEY_ID="2").returncode == 0
    assert re.search(r'\s2, nativeStaticBytes\("\\x00"\), 2\)', config.read_text())

    assert run(work, ONE_SECURE_STORAGE="hmac", ONE_SECURE_STORAGE_KEY_ID="6").returncode != 0, "only six key blocks"
    assert run(work, ONE_SECURE_STORAGE="flash").returncode != 0, "an unknown mode is refused, not plain"
print("PASS tests/papermono_storage_config.py")
