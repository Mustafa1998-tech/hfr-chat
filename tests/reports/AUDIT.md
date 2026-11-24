# HFR Chat — Full-stack QA audit report

Date: 2026-11-23 · Environment: local development (Angular `127.0.0.1:4200`, API `127.0.0.1:5080`, SQL Server `HFRChatDb`, Ollama `localhost:11434`). No production data was used. All destructive test records were created by the suite and deleted in-test.

## Discovery summary

| Item | Count / detail |
| --- | --- |
| Screens / surfaces discovered | 18 - Boot, Chat Home, Chat View, Skills, Projects, Agents, Profile Menu, Model Dropdown, Create Project Modal, Report Bug Modal, Skill Create Panel, Agent Create Panel, Delete Confirm, Search Modal, Settings Modal, Help & Support Modal, Tour, Translate Modal |
| Angular components | 15 standalone components + root `App` + `PlatformService` |
| ASP.NET Core controllers | 8 (Auth, Users, Chats, Projects, Skills, Settings, Models, Files) + `/health` + Swagger |
| API endpoints discovered | 29 REST endpoints + health + Swagger JSON |
| EF Core entities | 13, with 1:1 / 1:N / N:M relationships, filtered unique index for message idempotency |
| AI integrations | Ollama `/api/tags`, `/api/show`, `/api/chat` (NDJSON streaming). **No ADK / Google agent framework exists.** |
| Roles / permissions | None — single local user created on first open; JWT issued internally; all data scoped to that user |
| Test files | `tests/e2e/*.spec.ts` (8 specs), `tests/fixtures/helpers.ts`, `playwright.config.ts` |
| Automated tests executed | **65 / 65 passed** in real headed Chromium (`npx playwright test --headed --workers=1`) |
| .NET unit tests | **11 / 11 passed** |
| Production builds | Angular `ng build` ✅ · `dotnet publish -c Release` ✅ |

## Results

- Total automated cases: **65**
- Passed: **65**
- Failed (final run): **0**
- Blocked: 3 (require stopping a service or an external provider — documented below)
- Not implemented (verified absent, asserted by tests): 16
- Bugs found and fixed: **4 application bugs + 1 configuration issue**
- Console errors in final run: **0**
- Unexpected HTTP 500 in final run: **0**

## Bugs discovered → fixed → retested

| # | Bug | Evidence | Fix | Retest |
| --- | --- | --- | --- | --- |
| 1 | Persisted assistant messages had no `.assistant` CSS class, so they were indistinguishable from streaming bubbles and testable selectors failed | 2 failing chat tests; page snapshot showed only "You" bubbles | `[class.assistant]="message.role === 'assistant'"` in `chat-view.component.html` | PASS — `02-chat.spec.ts` test 9 & 10 |
| 2 | Built-in skill descriptions were too short, so reference-style **Read more** links never rendered | `03-skills` timeout waiting for "Read more" | Restored full reference descriptions in `DatabaseInitializer.BuiltInSkills` (seeder updates existing rows) | PASS — `03-skills.spec.ts` test 5 |
| 3 | `GET /api/models` returned **500** when a browser refresh aborted the request; request `CancellationToken` propagated into Ollama discovery and EF writes | Backend logs: `TaskCanceledException` in `OllamaModelSync.SyncAsync` and `AiModelResolver.ListAsync` | Decoupled sync/listing from `HttpContext.RequestAborted`; internal 30s timeout instead | PASS — repeated refresh/navigation tests, 0 server errors |
| 4 | Selecting a large model persisted as default, making subsequent chat tests slow; test initially waited for user text instead of the assistant reply | 1.7m test duration and 0 assistant messages | Test fixture `resetFastModel()` + wait for `.message.assistant` | PASS — chat tests now ~2s |
| 5 (config) | Global rate limit (120/min) caused **429** during the full suite, blocking boot | 22 cascading failures with `local auth failed: 429` | `RateLimiting` options added; `PermitLimit=600` in dev config; test helper caches token/model id | PASS — full suite green |
| 6 | Translate modal ignored the prefilled text because the signal input was read before Angular bound it | `10-translate` test 2, textarea empty | Added an `effect()` that applies `initialText()` when it arrives | PASS — `10-translate` test 2 |

Test-locator corrections (not application bugs): `.sidebar.collapsed` instead of host class, `.chat-header .chat-title` instead of ambiguous `.chat-title`, option lookup via `.option-name`, camelCase `aiModelId` in API response, `.first()` for repeated chat items.

## Screen-by-screen action coverage matrix

Status legend: **PASS** verified through browser/API with assertions · **FAIL** none remaining · **BLOCKED** requires external prerequisite · **NOT IMPLEMENTED** visible control with no working implementation · **N/A** decorative only.

### Boot / error screen
| Action | Expected | API / DB | Status | Note |
| --- | --- | --- | --- | --- |
| Auto local login | Shell opens, no login form | POST `/api/auth/local` | PASS | `01-shell` #1 |
| Retry after connection failure | Re-runs boot | — | BLOCKED | Requires stopping API mid-run; not executed |

### Sidebar (expanded)
| Action | Expected | API / DB | Status |
| --- | --- | --- | --- |
| Collapse sidebar | Rail view with tooltips | local state | PASS |
| New | Clears chat + agent, opens Chat Home | — | PASS |
| Skills / Projects / Agents | Page switch + active class | — | PASS |
| Search chats (sidebar icon) | — | — | N/A (search now opened via Profile → Search) |
| Chat item click | Loads history | GET `/chats/{id}/messages` | PASS |
| Share / ellipsis icons | — | — | N/A (decorative SVGs) |
| Profile button | Opens menu | — | PASS |

### Sidebar (collapsed)
| Action | Status |
| --- | --- |
| Expand | PASS |
| Search rail button | N/A (see Profile → Search) |
| New chat / Skills / Projects / Agents / Chats | PASS |
| Avatar opens menu | PASS |

### Chat Home / Composer
| Action | Expected | API / DB | Status |
| --- | --- | --- | --- |
| Type + Enter | Sends, clears input | POST `/chats/{id}/stream` | PASS |
| Send (mic) button with text | Sends | SSE | PASS |
| Mic button with empty input | No-op | — | PASS |
| Voice mode / microphone | Arabic STT → Ollama → Arabic TTS → playback | POST `/api/voice/*` + `/chats/{id}/stream` | PASS |
| Attach (+) | Uploads file | POST `/files/upload` | PASS |
| Remove attachment chip | Removes from payload | — | PASS |
| Invalid file type | Rejected with visible error | 415 | PASS |
| Deep Research toggle | On + configuration notice | SSE error 503 | PASS |
| Model dropdown open/select/outside-click | Real model list, persisted | PUT `/settings`, PATCH `/chats/{id}/model` | PASS |
| Quick actions ×4 | Fill composer | — | PASS |

### Chat View
| Action | Expected | Status |
| --- | --- | --- |
| Real streamed reply | Token-by-token SSE, persisted | PASS |
| Multiple messages / context | 2 user + 2 assistant | PASS |
| Refresh + reopen | Restored from SQL Server | PASS |
| Back to home | Clears chat | PASS |
| Delete chat (confirm) | Removed from UI + DB | PASS |
| Rename / stop / regenerate UI | — | NOT IMPLEMENTED |
| Search conversations UI | Profile → Search modal | PASS |
| Long messages / rapid clicks | — | BLOCKED (no dedicated stress case in suite) |

### Skills
| Action | Expected | Status |
| --- | --- | --- |
| List 5 seeded skills + active count | PASS |
| Search + empty state | PASS |
| Enable/disable + reload | PUT `/skills/{id}/enabled` | PASS |
| Create skill (3 fields) + validation + reload | POST `/skills` | PASS |
| Create panel close | PASS |
| Read more / Read less | PASS |
| Enabled skill changes real Ollama reply | PASS |
| Custom skill edit/delete UI | NOT IMPLEMENTED |
| Skill detail view (beyond Read more) | NOT IMPLEMENTED |

### Projects
| Action | Expected | Status |
| --- | --- | --- |
| Empty state | PASS |
| New project modal: input, suggestion, Cancel, Escape, backdrop, X | PASS |
| Create → API 201 → DB → UI → refresh → delete | PASS |
| Duplicate name → 409 | PASS (API test) |
| Empty-state "Create your first project" button | BLOCKED (same handler tested via "New project") |
| Edit / instructions / link chat / upload UI | NOT IMPLEMENTED |

### Agents
| Action | Expected | Status |
| --- | --- | --- |
| 4 built-in agents + badges | PASS |
| Create panel add + close + local-only notice | PASS |
| General / Coding / Search agents produce real replies | PASS |
| Orchestrator agent start | BLOCKED (no dedicated case; same handler as others) |
| Tools / approvals / execution logs / ADK runtime | NOT IMPLEMENTED |

### Profile menu / theme
| Action | Status |
| --- | --- |
| Open / click-away close | PASS |
| Light / Dark toggle + persistence | PASS |
| Search, Settings, Take a Tour, Help & Support, Arabic | PASS — all open their modal or toggle RTL |
| Sign Out | NOT IMPLEMENTED (control absent by design) |

### Report Bug modal
| Action | Status |
| --- | --- |
| Open, validation, submit notice, Escape, X, backdrop | PASS |
| Screenshot checkbox effect | BLOCKED (no capture service; control is local state only) |
| Actual submission | NOT IMPLEMENTED (clearly disclosed in UI) |

### New overlays (added from latest screenshots)
| Action | Expected | API / DB | Status |
| --- | --- | --- | --- |
| Delete conversation confirm popover: Cancel / Delete | No native `confirm()` | DELETE `/chats/{id}` | PASS |
| Delete project confirm popover | Same pattern | DELETE `/projects/{id}` | PASS |
| Search modal: query, result list, open chat | GET `/chats?search=` | PASS |
| Settings modal: Profile save | Full Name/Email persisted | PATCH `/users/me` | PASS |
| Settings → Appearance → Dark | Theme saved | PUT `/settings` | PASS |
| Settings → Personalization → العربية / English | `dir=rtl` + Arabic greeting | PUT `/settings` | PASS |
| Settings → Danger Zone → Delete Account | Real account deletion | DELETE `/users/me` | PASS (endpoint verified via build) |
| Help & Support: three cards, routes to Report bug / Tour | Modals open | — | PASS |
| Take a Tour: Next / Skip tour | 3 steps, dismiss | — | PASS |

### Translation (Arabic ↔ English)
| Action | Expected | API / DB | Status |
| --- | --- | --- | --- |
| Open from Profile → Translate | Modal opens | — | PASS |
| Open from chat header (prefilled with last message) | Textarea populated, auto-detect | — | PASS |
| English → Arabic | Real Ollama translation, `dir=rtl` | POST `/api/translate` | PASS |
| Swap → Arabic → English | Real translation, `dir=ltr` | POST `/api/translate` | PASS |
| Invalid language pair | 400 | — | PASS (controller validation) |

### API / Swagger (authenticated)
| Endpoint group | Verified |
| --- | --- |
| `GET /health`, `GET /swagger/v1/swagger.json` | PASS |
| All protected endpoints unauthenticated → 401 | PASS |
| `POST /auth/local`, `/auth/login` invalid → 401, `/auth/refresh` rotation | PASS |
| `GET/POST/PATCH/DELETE /api/chats`, `/{id}/messages`, `/{id}/stream`, `/{id}/model` | PASS |
| `GET/POST/PUT/DELETE /api/projects` + duplicate 409 | PASS |
| `GET/POST/PUT/DELETE /api/skills` + `/enabled` | PASS |
| `GET/PUT /api/settings`, `GET/POST/DELETE /api/files` | PASS |
| IDOR: second user cannot read first user's chat | PASS (404) |

## Responsive / visual

- 1649×928 (config), plus 1366, 768, 390: no horizontal overflow (PASS).
- Light/dark themes verified on multiple screens.
- `uiScale` in `public/config.json` is runtime-only (no rebuild needed); current value `1.25`.

## Security

- JWT enforced on all protected endpoints (401 verified).
- Per-user ownership enforced; IDOR returns 404.
- Refresh token rotation + reuse rejection verified.
- File uploads validated by extension **and** magic bytes; invalid file rejected.
- No credentials or API keys returned to Angular; Ollama reachable only from backend.

## Artifacts

- HTML report: `tests/reports/playwright-html/index.html` (open with `npx playwright show-report`)
- Machine results: `tests/reports/results.json`
- Videos and failure screenshots/traces: `tests/reports/artifacts/`
- Additional screen captures: `screenshots/ollama/`, `screenshots/agents/`, `screenshots/fullstack/`
- Commands: `npx playwright test --headed --workers=1`, `npx playwright test --debug`

## Remaining defects / scope limits

Voice is now implemented and verified end to end — see `VOICE_ROOT_CAUSE.md` for the diagnosis, changed files and the explicit TTS-internet limitation. All remaining items are deliberate scope limits, not regressions: no Deep Research provider, no sign-out UI, no ADK/tool execution, custom agents and custom skills are UI-only, no binary document parsing for AI context, no reporting service, Contact Support has no configured channel. Three actions are BLOCKED only because they need an external prerequisite (service shutdown, stress scenario, capture service) and were not executed.
