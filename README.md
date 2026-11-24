# HFR Chat

Full-stack AI chat application: Angular 22 + ASP.NET Core 10 + SQL Server + local Ollama,
with continuous Arabic voice conversation (Whisper.net STT + Piper TTS).

## Architecture

```
Angular 22  ──HTTP/SSE──▶  ASP.NET Core 10 Web API  ──▶ SQL Server (HfrChatDb)
                                   │
                                   └──▶ Ollama (localhost:11434)
```

The browser never talks to Ollama or to the speech models directly.

## Features

- Direct local sign-in (no username/password screen), JWT + refresh tokens
- Chats with real SSE streaming, persisted history, model preference per conversation
- Skills (enable/disable creates real prompt effects), Projects, static Agents
- Arabic ⇄ English text translation through Ollama
- Continuous voice mode: VAD turn detection, Whisper.net STT, Ollama, Piper Arabic TTS,
  interruption, mute, end call
- Light/dark themes and RTL Arabic UI
- Swagger UI at `/swagger`, health at `/health`

## First-time setup

1. Install Node 20+, .NET 10 SDK, Ollama, SQL Server, and Python 3.13 with `imageio-ffmpeg`.
2. Recreate the local speech assets (excluded from Git because of size):

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/setup-models.ps1
   ```

3. Pull an Ollama chat model, e.g. `ollama pull qwen2.5:3b`.
4. Review `Backend/ChatPlatform.API/appsettings.json` (connection string, JWT key,
   `Speech:*` absolute paths, `Cors:AllowedOrigins`).
5. Apply migrations:

   ```powershell
   dotnet ef database update --project Backend/ChatPlatform.API/ChatPlatform.API.csproj
   ```

6. Start both apps:

   ```powershell
   dotnet run --project Backend/ChatPlatform.API/ChatPlatform.API.csproj --urls http://127.0.0.1:5080
   npm start
   ```

## Verification

```powershell
npx playwright test --headed --workers=1
dotnet test Backend/ChatPlatform.Tests/ChatPlatform.Tests.csproj
```

Reports: `tests/reports/AUDIT.md`, `VOICE_MODE.md`, `VOICE_ROOT_CAUSE.md`.

## Deployment

See `DEPLOYMENT.md` for IIS, HTTPS, environment variables and speech model paths.
