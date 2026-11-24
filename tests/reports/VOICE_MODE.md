# Continuous two-way voice mode — delivery & verification

## What the user now experiences

One click on **Voice mode** starts a phone-style conversation:

1. Microphone permission is requested (browser secure context: `localhost` or HTTPS).
2. A Web Audio `AnalyserNode` monitors RMS continuously; `getUserMedia` uses
   `echoCancellation`, `noiseSuppression` and `autoGainControl`.
3. When speech starts the app begins a `MediaRecorder` chunk; when silence exceeds
   the configurable threshold (1200 ms, minimum turn 600 ms) the turn is closed.
4. The recorded audio is transcribed by real Arabic STT, the transcript is shown live.
5. The transcript is sent through the **existing** `/api/chats/{id}/stream` Ollama pipeline.
6. The AI text is shown, then synthesized to Arabic speech and played automatically.
7. When playback ends the app returns to `listening` — no Send click, no mic re-click.
8. The user can mute, interrupt, or end the call; ending releases all media resources.

## Explicit state machine

`idle → listening → user_speaking → transcribing → ai_thinking → ai_speaking → listening`
plus `interrupted` and `error`. The indicator shows who is speaking and the current state.

## Barge-in

Real speech during `ai_speaking` sustained for >350 ms stops audio playback and aborts
the in-flight generation (`AbortController` passed into `sendMessage`), then returns to
listening. A manual **مقاطعة** button is always available as the documented fallback when
hardware/browser echo cancellation is insufficient. Full-duplex simultaneous speech is
**not** claimed.

## Measured latency (Chromium fake microphone, headed, 2026-11-23)

| Run | STT | AI (first complete reply) | TTS | Speech-end → audible reply |
| --- | --- | --- | --- | --- |
| 1 | 7559 ms | 1156 ms | 1156 ms | 10706 ms |
| 2 | 7926 ms | 2500 ms | 5743 ms | 16169 ms |
| 3 (full suite) | 7156 ms | 4573 ms | 4717 ms | 16446 ms |

These are real measurements displayed in the UI; they are **not** real-time latency.
STT dominates because the `small` Whisper model runs on CPU. Model caching is already in
place (loaded once per Python process per request; the model files are cached on disk).

## Provider — now Whisper.net + Piper (requested stack)

The Python implementation was replaced by the native stack:

- `Whisper.net 1.9.1` + `Whisper.net.Runtime`, model `ggml-small.bin` (487 MB), language `ar`, 4 threads.
- Piper Windows AMD64 release with Arabic voice `ar_JO-kareem-medium` (+ `libtashkeel_model.ort` and `espeak-ng-data`).
- `ffmpeg.exe` converts browser WebM/Opus to 16 kHz mono PCM before Whisper.net.
- `NativeSpeechService` caches the Whisper model in a singleton and serialises inference with a semaphore.
- The old Python provider remains selectable with `Speech:Provider=python` as a fallback.

Verified in this environment:
- Arabic fixture STT: `صباح الخير، كيف حالك؟ أريد اختبار الصوت` — **4.4–4.7 s** (was 7–8 s with Python).
- Piper Arabic TTS output round-trips back to `صباح الخير كيف حالك اليومة` — **~1.5 s**, fully offline.
- Full Playwright suite: 65/65 PASS; continuous call measured **STT 4.1–4.9 s · AI 3.9–6.3 s · first audible sentence 1.1–1.5 s · total 9–13 s**.
- TTS now plays sentence-by-sentence; the first audible sentence starts as soon as its
  WAV is ready instead of waiting for the whole reply.

## Files added / changed for continuous mode

- `src/app/services/voice-conversation.service.ts` — VAD state machine, turn detection,
  interruption, mute, resource cleanup, latency measurement
- `src/app/services/platform.service.ts` — optional `AbortSignal` for generation cancellation
- `src/app/components/chat-composer/*` — call panel, live transcript, AI text, state
  indicator, mute / interrupt / end controls
- `tests/e2e/12-continuous-voice.spec.ts` — two headed Chromium tests
- `tests/reports/continuous-voice.png`, `results.json`

## Test results

- `npx playwright test --headed --workers=1 tests/e2e/12-continuous-voice.spec.ts` → **2/2 PASS**
- Full regression `npx playwright test --headed --workers=1` → **65/65 PASS**
- `dotnet test` → 11/11 PASS; Angular production build and .NET publish succeed.

## Remaining limitations

- TTS no longer requires internet (Piper local). Both STT and TTS are fully offline.
- Automated Chromium cannot prove physical speaker quality; manual headset testing is required.
- Barge-in depends on browser/OS acoustic echo cancellation; the interrupt button is the
  guaranteed fallback.
- VAD is energy-based with configurable thresholds, not Silero neural VAD; noisy environments
  may need threshold tuning. Turns whose peak RMS is below the speech threshold, or whose audio
  is smaller than 2 KB, are discarded locally — they are never sent to STT (avoids `422 EmptyTranscript`).
- An expired access token with a failed refresh now triggers a silent local re-login instead of
  leaving the app unauthenticated (fixes spurious `401 /api/users/me` after ~15 minutes).
- `ERR_CONNECTION_REFUSED` in an earlier console capture happened while the API process was being
  restarted during database cleanup; both services are running again.
- Plain HTTP on a remote host blocks `getUserMedia`; deploy over HTTPS.
