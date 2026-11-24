# Voice chat — root cause, fix and verification

## 1. Diagnosis (evidence, not assumption)

Repository inspection found **no voice implementation at all**:

| Item | Finding |
| --- | --- |
| `chat-composer.component.html` | "Microphone" button was only a dynamic label on the **Send** button; click always called `submit()`, which no-ops when the draft is empty. |
| Voice mode button | No `(click)` handler — purely decorative. |
| `PlatformService` | No `getUserMedia`, `MediaRecorder`, audio upload, synthesis or playback methods. |
| Backend | No voice endpoints, no STT/TTS services, no speech configuration. |
| Audio APIs | `MediaRecorder`, `AudioContext`, `<audio>`, Web Speech API absent from application source. |
| Tests | `07-not-implemented.spec.ts` explicitly asserted voice mode does nothing. |

**Root cause:** the visible microphone/voice controls were placeholders. The reported symptom ("chatbot does not respond when I speak") is the expected behaviour of an empty-draft `submit()` no-op — there was never a capture → STT → AI → TTS pipeline.

## 2. Environment verification

- Ollama **0.40.16**, models: `qwen2.5:3b`, `qwen2.5:7b`, `qwen3:8b`, `deepseek-r1:7b`, `gemma3:12b`, `nomic-embed-text`. **No audio models** and no Ollama speech API — Ollama was correctly kept text-only.
- Windows SAPI voices: only English (`Microsoft Zira`, `Microsoft Hazel`) — **no Arabic voice**.
- Python 3.15 could not build `av`; Python **3.13** with `av==16.1.0` works.
- Installed: `faster-whisper 1.2.1` (offline STT, `small` model, int8 CPU) and `edge-tts 7.3.1` (neural Arabic voice `ar-SA-ZariyahNeural`).

Real measurement with generated Arabic fixture:
`tests/fixtures/arabic-test.mp3` → STT `{"text":"صباح الخير، كيف حالك؟ أريد اختبار الصوت","language":"ar","language_probability":0.998}`.

## 3. Implemented pipeline

```
Chrome getUserMedia → MediaRecorder(webm/opus) → POST /api/voice/transcribe
→ faster-whisper (offline) → Arabic transcript
→ existing POST /api/chats/{id}/stream (Ollama)
→ POST /api/voice/synthesize → edge-tts Arabic MP3
→ HTMLAudioElement.play() with replay/stop/cancel
```

Files changed / added:

**Backend**
- `Controllers/VoiceController.cs` (new) — `/api/voice/status`, `/transcribe`, `/synthesize`
- `Services/SpeechService.cs` (new) — Python process bridge, timeouts, validation, error mapping
- `Configuration/Options.cs` — `SpeechOptions`
- `Program.cs`, `appsettings.json` — registration, Python path, model/voice config
- `Backend/speech/stt.py`, `tts.py`, `to_wav.py` (new)

**Frontend**
- `services/voice.service.ts` (new) — state machine `idle/listening/processing/thinking/speaking/error`, MediaRecorder lifecycle, mic release, replay/stop/cancel
- `services/platform.service.ts` — `transcribeAudio`, `synthesize`, `sendMessage()` now returns the completed reply
- `components/chat-composer/*` — mic/voice buttons wired, status strip, recording/speaking styling
- `styles.scss` — no change to base visual design

**Tests/config**
- `playwright.config.ts` — fake media device + Arabic WAV fixture + autoplay policy
- `tests/fixtures/arabic-test.mp3`, `arabic-test.wav` (new)
- `tests/e2e/11-voice.spec.ts` (new), `07-not-implemented.spec.ts` updated
- `tests/reports/voice-conversation.png`, `voice-permission-error.png`

## 4. Bugs found while testing and fixed

| # | Defect | Fix |
| --- | --- | --- |
| 1 | `sendMessage()` returned `assembled` **after** clearing it on the SSE `done` event, so voice TTS received an empty string | Capture `completedText` from the `done` payload and return it |
| 2 | Voice status strip disappeared when playback ended, so Replay was unreachable | Keep the strip visible while a reply exists |
| 3 | `Cancel voice` left transcript/reply signals populated | Clear all voice signals on cancel |
| 4 | Python 3.15 `av` build failure / `av 19` API incompatibility | Use Python 3.13 with `av==16.1.0` (documented in config) |

## 5. Test results

`npx playwright test --headed --workers=1 tests/e2e/11-voice.spec.ts` → **3/3 PASS**:
1. Fake-device Arabic recording → real transcript containing `صباح الخير` → real Ollama assistant message → Arabic TTS MP3 → playback reached `speaking` then `idle` → Replay available → history persisted after refresh.
2. Denied microphone permission → actionable error, mic state released.
3. Backend rejects invalid audio (415) and empty synthesis text (400).

Full suite: `npx playwright test --headed --workers=1` → **63/63 PASS** (final run recorded in `results.json`).

## 6. Remaining limitations (explicit)

- **TTS provider requires outbound internet** (edge-tts/Microsoft neural service). STT is fully offline. If the TTS service is unreachable, the UI shows `Speech synthesis failed` and the text reply remains available.
- Automated Chromium cannot prove what a human hears; manual playback/headset verification is still required on the target machine. The fake-device test proves bytes, transcript, model reply, MP3 generation and playback API success.
- `Speech:ScriptDirectory` in `appsettings.json` is an absolute development path. On IIS set it to the deployed absolute `Backend\speech` folder and ensure the app pool identity can execute Python 3.13.
- Microphone requires `localhost`/HTTPS origin; over plain HTTP on a remote host browsers block `getUserMedia`.
- Only `small` Whisper model was benchmarked (~7 s on this CPU for a short clip); larger models improve accuracy at higher latency.
