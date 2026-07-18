# Agencity

## Description

Agencity is a browser-based multi-agent workspace presented as an interactive city. Its OpenAI-powered creatures can receive founder-directed tasks, search the web, collaborate, hand work to specialist agents, stream their progress to the interface, and create viewable HTML artifacts. The app consists of a FastAPI backend using the OpenAI Agents SDK and a React/Vite frontend connected through HTTP and WebSockets.

## Setup

### 1. Install the prerequisites

Install:

- Python 3.13 or newer
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- Node.js 20.19 or newer, or Node.js 22.12 or newer
- An [OpenAI API key](https://platform.openai.com/api-keys)

### 2. Configure the OpenAI API key

From the repository root, create the backend environment file:

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and put the key after `OPENAI_API_KEY=`:

```dotenv
OPENAI_API_KEY=your_openai_api_key
AGENTS_MODEL=gpt-5.4-mini
ORCHESTRATOR_MODEL=gpt-5.4-mini
WORKER_MODEL=gpt-5.4-nano
```

The key must be in `backend/.env`. Do not put it in the frontend, a `VITE_*` variable, source code, or Git. The environment file is ignored by Git.

### 3. Install dependencies

Run these commands from the repository root:

```bash
uv sync --project backend
npm --prefix frontend ci
```

### 4. Start the backend

In the first terminal, from the repository root, run:

```bash
uv run --project backend uvicorn backend.main:app --reload
```

The backend runs at `http://localhost:8000`. Its health endpoint is `http://localhost:8000/api/health`.

### 5. Start the frontend

Keep the backend running. In a second terminal, from the repository root, run:

```bash
npm --prefix frontend run dev
```

Open `http://localhost:5173` in a browser. The Vite development server automatically proxies API and WebSocket traffic to the backend.

To stop either service, press `Ctrl+C` in its terminal. To restart it, stop it and run the same start command again.
