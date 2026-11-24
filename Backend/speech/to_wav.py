"""Convert any audio file to 16 kHz mono PCM WAV for Chromium fake-device capture."""
import sys
import wave

import av

source, target = sys.argv[1], sys.argv[2]
with av.open(source) as container:
    stream = container.streams.audio[0]
    resampler = av.audio.resampler.AudioResampler(format="s16", layout="mono", rate=16000)
    with wave.open(target, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        for frame in container.decode(audio=0):
            for resampled in resampler.resample(frame):
                wav.writeframes(resampled.to_ndarray().tobytes())
print(target)
