# Deployment and configuration guide — Ollama edition

## Architecture

```
Angular 22  →  ASP.NET Core 10 Web API  →  Ollama (private local endpoint)
                        ↓
                   SQL Server
```

Angular never contacts Ollama. `localhost:11434` is resolved by the **backend machine**. If Ollama runs on another server, set `Ollama:BaseUrl` to a private network address and restrict access with a firewall; never expose port 11434 publicly.

## What is implemented

* Ollama is the **primary** provider: `GET /api/tags`, `POST /api/show`, `POST /api/chat` with NDJSON streaming parsed into SSE token events.
* Model list is discovered from installed Ollama models at startup and on every `GET /api/models`. No invented ALLAM model names are shown. Embedding-only models are filtered out.
* `Ollama:DefaultModel` must name an installed model; otherwise the smallest installed chat model is selected.
* Model preference is persisted per user (settings) and per conversation (`PATCH /api/chats/{id}/model`).
* Prompt context = system instructions + enabled skills + project instructions + relevant chat history + selected text documents + latest message.
* Skills and project instructions demonstrably change the AI response (verified by marker tests).
* **No login screen:** the app opens directly as a single local user. `POST /api/auth/local` creates that account on first use with a random, never-exposed password and issues an internal JWT/refresh token. No username or password is requested anywhere in the UI. Existing register/login endpoints remain available for API clients but are not shown.
* JWT + rotating refresh tokens, PBKDF2 hashing, per-user isolation, rate limiting, CORS.
* Chats, messages, projects, skills, settings and uploaded files persist in SQL Server.
* Swagger UI `/swagger`, health check `/health`.

## Local configuration

`Backend/ChatPlatform.API/appsettings.json`:

```json
"Ollama": {
  "BaseUrl": "http://localhost:11434",
  "DefaultModel": "qwen2.5:3b",
  "TimeoutSeconds": 300
}
```

Environment variables on a server: `Ollama__BaseUrl`, `Ollama__DefaultModel`, `Ollama__TimeoutSeconds`, `ConnectionStrings__DefaultConnection`, `Jwt__Key`, `Cors__AllowedOrigins__0`.

## Migration

```powershell
dotnet ef database update --project Backend/ChatPlatform.API/ChatPlatform.API.csproj
```

The API also migrates and synchronises Ollama models on startup. Only models, providers and built-in skill definitions are seeded — no users, chats or projects.

## Build and publish

```powershell
npx ng build
dotnet publish Backend/ChatPlatform.API/ChatPlatform.API.csproj -c Release -o publish/api
```

IIS: application pool with **No managed code**, point at `publish/api`, ASP.NET Core 10 Hosting Bundle installed, environment variables above, SQL access for the pool identity. For Angular, serve `dist/hfr-chat-clone/browser` as a static site with an SPA fallback rule to `index.html`, and set the API base URL in `src/app/services/platform.service.ts` before building.

## IIS: ports and deployment (important)

**Ollama is not deployed to IIS.** It stays a Windows service listening on `11434`; models are local files. IIS hosts only the API and the Angular static files.

| Component | Where it runs | Port |
| --- | --- | --- |
| Angular site | IIS static site | e.g. `8080` (or 80/443) |
| ASP.NET Core API | IIS site/application, ASP.NET Core Module V2, `hostingModel="inprocess"` | e.g. `5080` (or 443) |
| Ollama | Windows service (or private server) | `11434` — **never public** |

### 1. Publish

```powershell
npx ng build
dotnet publish Backend/ChatPlatform.API/ChatPlatform.API.csproj -c Release -o publish/api
```

`publish/api/web.config` is generated automatically with `AspNetCoreModuleV2`.

### 2. Install prerequisites

Install **.NET 10 ASP.NET Core Hosting Bundle** on the IIS server and recycle the app pool. Create an app pool with **.NET CLR version = No managed code**.

### 3. Create the API site

IIS Manager → Sites → Add Website:
- Physical path: `...\publish\api`
- Port: choose `5080` (or 443 with a certificate)
- Application pool: the No-managed-code pool

Set environment variables on that app pool / machine:

```
ConnectionStrings__DefaultConnection = Server=...;Database=HfrChatDb;...
Jwt__Key                             = <random 32+ byte key>
Ollama__BaseUrl                      = http://localhost:11434
Ollama__DefaultModel                 = qwen2.5:3b
Cors__AllowedOrigins__0              = http://<server>:8080
```

### 4. Create the Angular site

IIS Manager → Sites → Add Website → physical path `dist/hfr-chat-clone/browser`, port `8080`. Add a **URL Rewrite** rule: if the request is not a file/directory, rewrite to `/index.html` (SPA fallback). Make sure the rule does not capture `/api`.

### 5. Point Angular at the API port — no rebuild needed

Edit `config.json` **inside the deployed Angular folder**:

```json
{ "apiBaseUrl": "http://<server>:5080/api", "uiScale": 1.25 }
```

It is fetched at startup (`public/config.json` → `dist/.../browser/config.json`). If omitted, the app falls back to `http://127.0.0.1:5080/api`.

`uiScale` enlarges the whole interface independently of browser zoom. `1` = original reference size, `1.15` slight, `1.25` larger, `1.4` very large. Change it in the deployed `config.json` and refresh — no rebuild required.

### 6. Ollama location

Same machine as IIS: keep `http://localhost:11434`. Different machine: on that machine set `OLLAMA_HOST=0.0.0.0:11434`, open the firewall **only for the IIS server IP**, and set `Ollama__BaseUrl=http://<private-ip>:11434` on the API. `localhost` always means the machine running the backend, not the user's browser.

### 7. How to find the API port / verify

In IIS Manager: **Sites → select API site → Bindings** shows the port. From PowerShell on the server:

```powershell
Import-Module WebAdministration
Get-Website | Select-Object Name, State, PhysicalPath
Get-WebBinding | Select-Object BindingInformation, Protocol
netsh http show urlacl
```

Then test:

```powershell
Invoke-WebRequest http://<server>:5080/health
Invoke-WebRequest http://<server>:5080/swagger/v1/swagger.json
```

Open `http://<server>:8080` — the app opens directly with no login. Swagger is at `http://<server>:5080/swagger`.

**Common problems:** 502.5 → Hosting Bundle missing or wrong app pool; CORS error → `Cors__AllowedOrigins__0` must exactly match the Angular origin including port; "No Ollama models" → `Ollama__BaseUrl` unreachable from the IIS server account; 404 on Angular deep links → missing URL Rewrite fallback.

## Verification performed

| Check | Result |
| --- | --- |
| Ollama connectivity, `/api/tags`, `/api/chat` non-streaming and streaming | passed |
| `dotnet test` | 10/10 unit tests |
| `tests/api-smoke.ps1` | 31/31 assertions, including a real `OLLAMA_OK` completion through SSE |
| `tests/ollama-context.ps1` | skill + project instruction injection verified against the model |
| `tests/e2e-full.cjs` | Playwright Chromium: real streamed reply in Angular, persistence, models, skills, projects, theme, collapsed sidebar; no console errors |
| Production builds | Angular and .NET publish succeed |

## Deliberately unavailable

* **Deep Research** — needs a search provider; shows a configuration-required notice.
* **Voice** — implemented with the native stack: Angular `MediaRecorder` → `POST /api/voice/transcribe` (Whisper.net `ggml-small`, offline) → Ollama → `POST /api/voice/synthesize` (Piper `ar_JO-kareem-medium`, offline) → browser playback. Configure `Speech:WhisperModelPath`, `PiperExecutable`, `PiperModelPath`, `PiperTashkeelPath`, `PiperEspeakData` and `FfmpegExecutable` as absolute paths on IIS. Legacy Python provider remains available via `Speech:Provider=python`. See `tests/reports/VOICE_MODE.md`.
* **Binary document parsing** — text files (`.txt/.md/.csv/.json`) selected as context are sent as text; PDF/Office/image files are attached but only their names/types are provided to the model. No raw bytes are sent as chat text.
* **Report a bug** — modal is UI-only; no reporting service is configured, so submitting does not claim that anything was sent.
* **Agents** — four built-in conversational agents (General, Search, Coding, Orchestrator). Their instructions are injected into the Ollama request from the backend and change real responses. Custom agents added from the UI are local-only and clearly labelled as such. Search Agent has no live search tool connected and must say so rather than invent sources.
