<div align="center">

# TierMax — Autonomous AI Gateway & Model Orchestrator

**A high-performance, self-hosted AI API gateway with smart routing, virtual consensus fusion, proactive rate-limit guardian, self-healing model deprecation, and zero-config local database.**

[![Version](https://img.shields.io/badge/version-3.0-orange?style=flat-square)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)
[![Database](https://img.shields.io/badge/database-SQLite%20(Local)%20%7C%20Supabase-success?style=flat-square)](#-multi-database-architecture-sqlite--supabase)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white)](#option-2-docker-compose-1-command)
[![API](https://img.shields.io/badge/API-OpenAI%20Compatible-green?style=flat-square)](#usage)

</div>

---

## 🌟 What is TierMax?

**TierMax** is an enterprise-grade AI reverse proxy and autonomous model orchestrator designed to sit between your AI applications (such as [OpenClaw](https://github.com/Yeri0101/openclaw-bridge), Cursor, Cline, LangChain, or custom autonomous agents) and multiple upstream LLM providers — Google Gemini, Groq, OpenRouter, Cerebras, Mistral, OpenAI, DeepSeek, Puter, and more.

Instead of hardcoding a single API key per provider and constantly crashing into rate limits, 429 throttles, or retired model tags, **TierMax** manages a **resilient pool of upstream keys**, dynamically routes requests based on complexity and latency, executes multi-model consensus fusion, auto-calibrates free-tier quotas, and transparently heals deprecated model tags.

It exposes a 100% **OpenAI-compatible API** at `/v1/chat/completions` — zero client code modifications needed.

---

## 🚀 Key Features

| Feature | Description |
|---|---|
| 💾 **Zero-Config Local SQLite** | Runs out-of-the-box with Node's native `node:sqlite`. **No Supabase, PostgreSQL, or external cloud DB required**. |
| ☁️ **Multi-Database Architecture** | Seamlessly toggle between local SQLite and cloud Supabase. Includes 1-click cloud-to-local sync (`npm run db:pull`). |
| 🧠 **Dual Engine Intelligence** | **System 1 (TypeSafe AI Jev)** for sub-millisecond routing decisions + **System 2 (Manager LLM)** for automated quota calibration and diagnostic reasoning. |
| 🔮 **Virtual Consensus Fusion** | Synthesizes answers via parallel 3-model competition (`fusion:m1,m2,m3` or `model: "fusion"`) resolved by an autonomous Judge Arbiter. |
| 🛡️ **Free-Tier Guardian** | Proactive sliding-window RPM, TPM, RPD, and TPD tracking with smooth queue delay (up to 6s) and passive 429 backoff cooldown. |
| ⚡ **One-API Channel Ping** | 1-click real-time latency testing (`⚡ ms`) for individual keys and project-wide channels with auto-detection of available models. |
| 🩹 **Self-Healing Model Registry** | Automatically updates retired or deprecated model tags (e.g. `gpt-4-turbo` → `gpt-4o`, `gemini-1.5` → `gemini-2.0`) without breaking active agent workflows. |
| 🔄 **Multi-Key Round-Robin & Failover** | Balances load across dozens of keys per provider. If a provider errors or throttles, the next is tried instantly. |
| 🏎️ **Semantic Cache (LRU)** | In-memory SHA-256 cache returns identical prompts instantly at zero cost with `X-Cache: HIT`. |
| ✂️ **Context & Token Guards** | Intelligent context trimming to fit provider limits and per-provider output token caps (`max_tokens`). |
| 🎛️ **Modern React Console** | Bilingual (EN/ES) dashboard with real-time SSE typewriter playground, live telemetry inspector, and project management. |

---

## ⚡ Quickstart Setup (< 1 Minute)

TierMax includes an **Embedded Zero-Config Local Database (SQLite)**. You do **NOT** need Supabase, PostgreSQL, or any cloud database account to run TierMax.

### Option 1: 1-Click Automated Setup (Recommended)

```bash
git clone https://github.com/Yeri0101/TierMax.git
cd TierMax
chmod +x quickstart.sh
./quickstart.sh
```

Or using npm scripts:
```bash
npm run setup
npm run dev
```

- **Dashboard UI**: [http://localhost:5173](http://localhost:5173)
- **OpenAI Gateway API**: [http://localhost:3000/v1](http://localhost:3000/v1)
- **Default Admin Credentials**: `admin` / `admin` (changeable directly in the dashboard)
- **Database**: Local SQLite stored at `./data/tiermax.db` (auto-bootstrapped and seeded).

---

### Option 2: Docker Compose (1-Command Deployment)

```bash
docker compose up -d
```

Starts the entire gateway and web dashboard on port `3000` with persistent local SQLite storage mounted at `./data`.

---

### Option 3: Supabase Cloud (Optional)

If you prefer using Supabase Cloud instead of local SQLite:
1. In `backend/.env` (or root `.env`):
   ```env
   DB_TYPE=supabase
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   ```
2. **Instant Cloud-to-Local Migration**:
   Want to clone all your cloud Supabase data into local SQLite to run 100% offline? Simply run:
   ```bash
   npm run db:pull
   ```
   This copies all projects, upstream keys, gateway keys, routing rules, and pricing tables in seconds.

---

## 🏗️ Architecture Overview

```
Your AI Agents / Apps (OpenClaw, Cursor, Python SDK)
                     │
                     │  POST /v1/chat/completions (Bearer gk_xxxxx)
                     ▼
┌───────────────────────────────────────────────────────────┐
│                      TierMax Gateway                      │
│                                                           │
│  1. Auth & Model Allowlist (SQLite / Supabase)            │
│  2. Free-Tier Guardian (Sliding-window RPM/TPM check)     │
│  3. Semantic Cache (SHA-256 LRU)                          │
│  4. Dual Engine Decision:                                 │
│     ├─ Virtual Consensus Fusion (3 Drafts + Judge)        │
│     ├─ System 1: TypeSafe AI Jev (Fast intelligent route) │
│     └─ Heuristic SOAT Router (Economy/Standard/Premium)   │
│  5. Upstream Dispatch (Round-robin + failover)            │
│  6. Context Trimming & Output Token Cap                   │
│  7. Logging & Telemetry (ms latency, tokens, cost)        │
└─────────────────────────────┬─────────────────────────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       ▼                      ▼                      ▼
  Google AI Studio          Groq                OpenRouter
(gemini-2.5-flash)     (llama-3.3-70b)       (deepseek-chat)
```

---

## 🔮 Virtual Consensus Fusion

TierMax includes a **Multi-Model Consensus Fusion Engine**. Instead of relying on a single model's hallucination or bias, TierMax can run a 3-model parallel draft competition and synthesize the absolute best response through an Arbiter Judge.

### Calling Consensus Fusion:
In your agent or request payload, simply specify `model: "fusion"`:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer gk_your_gateway_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "fusion",
    "messages": [{"role": "user", "content": "Explain quantum entanglement vs superposition."}]
  }'
```

### Dynamic Trios:
You can customize the contenders and judge on the fly in the model string:
```json
{
  "model": "fusion:deepseek-chat,qwen/qwen3.8-27b,moonshotai/kimi-k3",
  "messages": [{"role": "user", "content": "Optimize this distributed database query."}]
}
```
1. **Contender 1 (Draft A)**, **Contender 2 (Draft B)**, and **Contender 3 (Draft C)** execute in parallel.
2. The **Synthesizer Judge** compares all drafts, resolves discrepancies, filters hallucinations, and returns the unified consensus answer.

---

## 🛡️ Free-Tier Guardian & Anti-429 Resilience

Managing free-tier keys (e.g. Gemini 15 RPM, Groq 30 RPM) is notoriously prone to `429 Too Many Requests` errors.

TierMax's **Free-Tier Guardian** operates proactively:
- **Sliding-Window Tracking**: Continuously tracks Requests per Minute (RPM), Tokens per Minute (TPM), Requests per Day (RPD), and Tokens per Day (TPD).
- **Proactive Smoothing Queue**: If a key is at 90% quota, TierMax introduces a sub-second smooth delay (up to 6s) to allow the quota window to reset without dropping the request.
- **Silent Failover**: If a key hits its threshold or receives a 429, TierMax immediately retries the next key in the pool.
- **Passive Rate-Limit Header Ingestion**: Parses standard provider response headers (`x-ratelimit-remaining-requests`, `x-ratelimit-reset-requests`) to stay synchronized with upstream servers.
- **Autonomous Auto-Calibration**: Powered by System 2 (Manager LLM), TierMax can auto-tune custom limits based on live provider policies.

---

## ⚡ One-API Channel Testing & Model Discovery

From the **Configured Providers** panel in the dashboard:
- **1-Click Ping Test (`⚡ ms`)**: Test individual upstream keys or test an entire project's provider pool concurrently with live latency measurements.
- **Project-Scoped Model Discovery**: Automatically populates available models for each provider key.
- **Model Deprecation Self-Healing**: Endpoints like `GET /v1/diagnose` allow external agents to inspect active models, deprecation rules, and auto-healed routes in real time.

---

## 🚦 Gateway Limits & Execution Pipeline

TierMax applies multi-layer protection to every request in strict execution order:

```
Incoming request
    │
    ├─ 1. Auth Guard          → Validates gateway key against DB (SQLite / Supabase)
    ├─ 2. Model Allowlist     → Rejects models not assigned to this key (HTTP 403)
    ├─ 3. Project Budget      → Blocks requests when spend ≥ budget_usd (HTTP 402)
    ├─ 4. Free-Tier Guardian  → Sliding-window RPM/TPM check + smooth queue delaying
    ├─ 5. Provider Health     → Skips paused, 429 rate-limited, or errored providers
    ├─ 6. Latency Guard       → Skips providers flagged as slow (consecutive > 15s)
    ├─ 7. Semantic Cache      → Returns cached response for identical prompts (X-Cache: HIT)
    ├─ 8. Orchestrator Engine → Consensus Fusion (3 drafts + Judge) or System 1 (Jev/SOAT)
    ├─ 9. Context Trim Guard  → Trims oldest messages to fit provider context window
    └─ 10. Output Token Cap   → Truncates max_tokens to per-provider (or global) limit
```

### Context Trim Guard
If an upstream key has `max_context_tokens` configured, the gateway automatically trims older conversation messages before forwarding — preserving the system prompt and the latest user message. This prevents context-overflow errors without failing the request.

### Output Token Cap (`max_output_tokens`)
The `max_tokens` field in every request is silently capped before it reaches the provider:
1. **Per-provider value** — set from the dashboard **Output Limit** pill (stored in `upstream_keys`).
2. **Global env default** — `SOAT_DEFAULT_MAX_TOKENS` (default: `16000`).
3. **Hardcoded fallback** — `16,000`.

---

## 💻 Usage & Code Integration

### 1. Direct cURL
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer gk_your_gateway_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [{"role": "user", "content": "Explain what an AI gateway is in one sentence."}]
  }'
```

### 2. Python OpenAI SDK
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="gk_your_gateway_key"
)

response = client.chat.completions.create(
    model="gemini-2.5-flash",
    messages=[{"role": "user", "content": "Hello from TierMax!"}]
)

print(response.choices[0].message.content)
```

### 3. JavaScript / TypeScript
```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "http://localhost:3000/v1",
  apiKey: "gk_your_gateway_key",
});

const completion = await openai.chat.completions.create({
  model: "fusion",
  messages: [{ role: "user", content: "Synthesize the advantages of Rust vs Go." }],
});

console.log(completion.choices[0].message.content);
```

### 4. Integration with OpenClaw Agent
In your OpenClaw agent configuration (`agent.json` or agent UI):
```json
{
  "provider": "openai",
  "baseUrl": "http://localhost:3000/v1",
  "apiKey": "gk_your_gateway_key",
  "model": "gemini-2.5-flash"
}
```
OpenClaw immediately inherits multi-key load balancing, auto-retry on 429s, semantic caching, and full request telemetry.

---

## 🏃 Running in Production (PM2)

For production environments without Docker, run all processes using PM2:

```bash
# Install PM2 globally (once)
npm install -g pm2

# Start all services using the included config
pm2 start ecosystem.config.js

# Save process list for system reboot persistence
pm2 save
pm2 startup
```

Useful PM2 commands:
```bash
pm2 list                    # View process table
pm2 logs openclaw-backend   # View backend logs
pm2 restart all             # Restart services
pm2 stop all                # Stop services
```

---

## 📁 Project Structure

```
TierMax/
├── backend/                   # Hono (Node.js) API gateway
│   ├── src/
│   │   ├── db/
│   │   │   └── sqliteAdapter.ts  ← Zero-config embedded SQLite adapter
│   │   ├── routes/
│   │   │   ├── v1.ts             ← /v1/chat/completions, /v1/models, /v1/diagnose
│   │   │   ├── channelTesting.ts ← 1-click ping latency testing (One-API parity)
│   │   │   ├── engineConfig.ts   ← System 1 & System 2 configuration & calibration
│   │   │   ├── projects.ts       ← Project management CRUD
│   │   │   ├── gatewayKeys.ts    ← Gateway key issuance & reveal
│   │   │   └── analytics.ts      ← Latency, tokens, cost analytics
│   │   ├── utils/
│   │   │   ├── freeTierGuardian.ts ← Sliding-window RPM/TPM rate limiter
│   │   │   ├── engineBridge.ts     ← TypeSafe Jev & Manager LLM bridge
│   │   │   ├── modelHealing.ts     ← Deprecation migration tables
│   │   │   ├── completionEngine.ts ← Upstream dispatch & stream handling
│   │   │   └── dbSync.ts           ← Cloud-to-Local database pull utility
│   │   └── db.ts                   ← Universal DB selector (SQLite / Supabase)
│   └── data/                       ← Local SQLite database storage (.gitignore)
│
├── frontend/                  # React + Vite Admin Console (TierMax UI)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx       ← Projects overview & instant key copy
│   │   │   ├── ProjectDetail.tsx   ← Providers, channels, rate limits, analytics
│   │   │   ├── Playground.tsx      ← Real-time SSE streaming typewriter console
│   │   │   └── EngineSettings.tsx  ← Dual engine, fusion trios, & auto-calibration
│   │   ├── App.tsx                 ← Auth shell, DB mode indicator, navbar
│   │   └── i18n.tsx                ← Full bilingual (EN / ES) localization
│
├── scripts/
│   ├── dev.mjs                ← Unified dev runner (ports 3000 + 5173)
│   └── setup.mjs              ← Interactive setup wizard
├── quickstart.sh              ← 1-click bash starter script
├── Dockerfile                 ← Production multi-stage Docker build
├── docker-compose.yml         ← Single-command persistent container
└── ecosystem.config.js        ← PM2 process manager definition
```

---

## ⚙️ Environment Variables Reference

### Backend (`backend/.env` or root `.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | Port for the backend API server |
| `DB_TYPE` | No | `sqlite` | Database engine: `sqlite` (embedded local) or `supabase` |
| `SQLITE_DB_PATH` | No | `./data/tiermax.db` | File path for the local SQLite database |
| `SUPABASE_URL` | No | — | Supabase project URL (only needed if `DB_TYPE=supabase`) |
| `SUPABASE_ANON_KEY` | No | — | Supabase anon key (only needed if `DB_TYPE=supabase`) |
| `ADMIN_JWT_SECRET` | No | `auto-generated` | Secret key used to sign Admin session JWTs |
| `SOAT_DEFAULT_MAX_TOKENS` | No | `16000` | Global default max output token cap |
| `CACHE_TTL_SECONDS` | No | `60` | In-memory semantic cache TTL in seconds |
| `CACHE_MAX_SIZE` | No | `500` | Max entries in semantic LRU cache |
| `LATENCY_TIMEOUT_MS` | No | `15000` | Threshold (ms) to flag a provider as slow |

### Frontend (`frontend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_URL` | No | `http://localhost:3000/api` | Base URL for TierMax management API |

---

## 📜 Changelog

### v3.0 (2026-09-24)
- **Zero-Config Local SQLite** — Embedded database using Node.js native `node:sqlite`. Automatic table bootstrapping and default seed data. No external cloud dependencies required.
- **Universal Multi-DB Architecture** — Seamless switching between SQLite and Supabase Cloud. Included `npm run db:pull` migration script to pull cloud data to local offline storage.
- **1-Click Installer** — Added `./quickstart.sh`, `npm run setup`, and unified concurrent runner `npm run dev`.
- **Docker Compose Deployment** — Ready-to-deploy `Dockerfile` and `docker-compose.yml` with persistent storage volume.
- **Dual Engine System** — System 1: TypeSafe AI Jev integration for rapid intelligent routing decisions; System 2: Manager LLM for self-healing and auto-calibrating free tiers.
- **Virtual Consensus Fusion** — Parallel 3-contender competition (`Draft A`, `Draft B`, `Draft C`) synthesized by an autonomous Arbiter Judge (`model: "fusion"`).
- **Free-Tier Guardian** — Sliding-window proactive rate-limit guardian tracking RPM/TPM/RPD/TPD with anti-429 queue smoothing and passive header ingestion.
- **One-API Channel Ping & Auto-Discovery** — Real-time latency measurement (`⚡ ms`) and project-scoped provider model detection.
- **Interactive Playground Console** — Real-time SSE streaming typewriter viewer, parameter controls, and live execution telemetry inspector.
- **Live DB Indicator Badge** — Real-time indicator in the navigation bar displaying active storage engine (`💾 SQLite Local` vs `☁️ Supabase`).

### v2.2 (2026-04-25)
- Dynamic output token cap controls per provider and globally.
- Token limit modal with quick presets (4K to 128K).
- In-memory provider health state recovery.

### v2.1 (2026-04-24)
- Rebrand to **TierMax**.
- Instant 📋 copy gateway API keys from dashboard project cards.
- Protected `/reveal` endpoint.

---

## 📄 License

MIT © [Yeri0101](https://github.com/Yeri0101) — Free to use, modify, and build upon.

<div align="center">
  <b>TierMax</b> — Built to run free. Keep your providers flexible, your keys safe, and your agents unstoppable.
</div>
