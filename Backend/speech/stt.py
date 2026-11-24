"""Offline Arabic/English STT using faster-whisper.

Usage: python stt.py <audio-file> [model-size]
Prints JSON: {"text": "...", "language": "ar", "duration": 1.2}
"""
import json
import sys
import time

from faster_whisper import WhisperModel

sys.stdout.reconfigure(encoding="utf-8")
path = sys.argv[1]
size = sys.argv[2] if len(sys.argv) > 2 else "small"
started = time.time()
model = WhisperModel(size, device="cpu", compute_type="int8")
segments, info = model.transcribe(path, beam_size=5, vad_filter=True, language=None)
parts = [segment.text.strip() for segment in segments]
print(json.dumps({
    "text": " ".join(parts).strip(),
    "language": info.language,
    "language_probability": round(info.language_probability, 3),
    "duration": round(time.time() - started, 2),
}, ensure_ascii=False))
