"""Arabic/English TTS using edge-tts neural voices.

Usage: python tts.py <output-mp3> "<text>" [voice]
Prints JSON: {"file": "...", "voice": "..."}
"""
import asyncio
import json
import sys

import edge_tts

sys.stdout.reconfigure(encoding="utf-8")

output = sys.argv[1]
text = sys.argv[2]
voice = sys.argv[3] if len(sys.argv) > 3 else "ar-SA-ZariyahNeural"


async def main():
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output)


asyncio.run(main())
print(json.dumps({"file": output, "voice": voice}, ensure_ascii=False))
