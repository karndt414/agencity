# Agencity — Project Plan (Three.js)
## OpenAI Build Week · Fayetteville · July 18, 2026 · 12 Hours

---

## 1. WHAT WE'RE BUILDING

Agencity is a living 3D city rendered in the browser. Each creature has a
building. You orbit the camera. You see them work. When a creature hunts, its
building pulses. When it finds something, the city lights up and an alert
crashes onto the screen.

You're not managing agents — you're watching a city run itself.

Track: **UX for Agentic Applications**

---

## 2. THE CITY

```
                        🌙  AGENCITY  🌙

    ┌─────────┐                              ┌─────────┐
    │  🔥     │                              │  ⚡     │
    │  PYRE   │          ┌──────┐            │  LODE   │
    │ ▓▓▓▓▓▓▓▓│          │ PLAZA│            │ ▓▓▓▓▓▓▓▓│
    │ BURN    │          │  🏛️  │            │ TALENT  │
    │ TOWER   │          │      │            │ FORGE   │
    └─────────┘          └──────┘            └─────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
    ┌─────────┐          ┌─────────┐          ┌─────────┐
    │  👁️     │          │  🐺     │          │  🌀     │
    │  SIGHT  │          │  FETCH  │          │  EMPTY  │
    │ ▓▓▓▓▓▓▓▓│          │ ▓▓▓▓▓▓▓▓│          │  PLOT   │
    │ WATCH-  │          │ HOUND   │          │         │
    │ TOWER   │          │ DEN     │          │ [BUILD] │
    └─────────┘          └─────────┘          └─────────┘
```

- **Pyre's Burn Tower** — orange glow, smoke particles when hunting, erupts when it finds waste
- **Fetch's Hound Den** — blue pulse, papers flying out when it finds a dropped thread
- **Sight's Watchtower** — green scanning beam sweeping the horizon
- **Lode's Talent Forge** — yellow spark, anvil-hammering when it finds a candidate
- **Empty Plot** — grassy patch with a "Build" hologram. Judge says "can it do X?" → you build it live.

---

## 3. ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                    THREE.JS SCENE (Browser)                      │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  OrbitControls — click/drag to rotate, scroll to zoom     │   │
│  │  Post-processing — bloom, ambient particles, fog          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │Pyre      │  │Fetch     │  │Sight     │  │Lode      │        │
│  │Tower     │  │Den       │  │Watchtower│  │Forge     │        │
│  │▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓│        │
│  │🔥 IDLE   │  │🐺 IDLE   │  │👁️ IDLE   │  │⚡ IDLE   │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              ALERT OVERLAY (HTML/CSS)                     │   │
│  │  ⚠️ PYRE: $514/mo zombie SaaS found · 30s ago            │   │
│  │  ⚠️ FETCH: a16z follow-up ghosted 11 days                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            │ WebSocket
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FASTAPI BACKEND                               │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐       │
│  │  Creature    │  │  Data Loader  │  │  Alert Pipeline  │       │
│  │  Manager     │  │  (JSON files) │  │  (WebSocket)     │       │
│  └─────────────┘  └──────────────┘  └──────────────────┘       │
│         │                  │                   │                │
│         ▼                  ▼                   │                │
│  ┌──────────────────────────────────┐          │                │
│  │     OpenAI Agents SDK            │          │                │
│  │  Runner.run_streamed()           │          │                │
│  │  4 agents, handoffs, sessions    │          │                │
│  └──────────────────────────────────┘          │                │
└─────────────────────────────────────────────────────────────────┘
```

**Stack:**
- Frontend: Vite + React + Three.js (React Three Fiber + Drei) + Tailwind overlay
- Backend: FastAPI + WebSockets + asyncio
- AI: OpenAI Agents SDK (`agents` package) — handoffs, sessions, streaming, built-in loop
- Data: Optional local JSON fixtures; never loaded automatically into agent runs
- Deployment: Browser only — no Electron. F11 fullscreen for demo.

**Why Vite website, not Electron:**
Electron adds 30 minutes of config, 200MB of Chromium overhead, and zero benefit.
The FastAPI backend talks to the Agents SDK — the frontend just renders the city.
Judges can open it on their phone. One fewer thing to break in 12 hours.
`npm create vite@latest` → coding in 30 seconds.

---

## 4. AGENTS SDK INTEGRATION

### Why the Agents SDK

OpenAI ships three things. Only one is built for multi-agent orchestration:

| | `openai` package | Codex CLI | **Agents SDK** |
|---|---|---|---|
| Agent loop | ❌ Build it | ✅ Black-box | ✅ **Built-in, fully visible** |
| Subagents / Handoffs | ❌ Build it | ✅ Internal `.toml` only | ✅ **`agent.handoffs = [other]`** |
| Streaming visibility | ✅ Token stream | ❌ 20s silence | ✅ **Event stream — handoffs, tool calls, thoughts** |
| Session memory | ❌ Manage it | ✅ `--session` | ✅ **Built-in sessions** |
| Tracing | ❌ None | ❌ Hidden | ✅ **Built-in dashboard** |
| What you write | 200+ lines | Subprocess fragility | **50 lines. Agents + handoffs + stream.** |

The Agents SDK is the official, production-ready framework for exactly what
Agencity is: multiple agents with handoffs, streaming visibility, and persistent
memory. It's the harness Codex CLI won't expose.

### Credits

Agents SDK uses API credits (`OPENAI_API_KEY`). The Fayetteville event provides
both Codex Credits AND API Credits to all attendees. You're covered.

### Local setup and API key

1. Copy `backend/.env.example` to `backend/.env` (a starter file is included locally).
2. Put the server-side key in `backend/.env` as `OPENAI_API_KEY=...`.
3. From the repository root, run the backend with
   `uv run --project backend uvicorn backend.main:app --reload`.
4. In a second terminal, run `cd frontend && npm install && npm run dev`.

The backend loads `backend/.env` automatically. Never put the OpenAI key in
`frontend/`, a `VITE_*` variable, source code, or this README.

The current tool inventory is available at `GET /api/tools`. Agents have web
search, specialist handoffs, bounded source-file read/write tools, an
inspection-only repository terminal, and compile-only Python checks. Generated
code and Markdown files are written without execute permission. The terminal
does not run application code, tests, package scripts, network commands, or
shell operators; it is limited to `pwd`, `ls`, `rg`, selected `git` inspection,
and Python `compileall`/`json.tool` checks.

For multi-step work, `POST /api/tasks` runs the four specialist workers in
parallel using `WORKER_MODEL`, then sends their reports to a separate
`ORCHESTRATOR_MODEL` agent for structured synthesis. Set both model roles in
`backend/.env`; `report_path` can persist the compiled Markdown report under a
safe workspace path. Workers must cite exact URLs for public research or exact
repository/data references for supplied records; the orchestrator omits uncited
findings from the final report and records the omission as a risk.

### How the web layer controls the agents

The user never opens a terminal. Never sees code. The city IS the interface.

```
User clicks "Release Pyre" in Three.js city
        │
        ▼  POST /api/creatures/pyre/hunt
FastAPI creature_manager.py
        │
        ▼  asyncio — Runner.run_streamed()
Agents SDK fires pyre agent with bank data
        │
        ▼  Stream events: thought → tool_call → handoff → output
        │              │
        │              ▼  WebSocket pushes every event to city
        │              Burn Tower: IDLE → HUNTING (thoughts stream in)
        │
        ▼  Runner returns final result
Alert parsed from JSON output
        │
        ▼  WebSocket push
Burn Tower: FOUND → erupts → alert overlay slides in
```

### Defining creatures as Agents

```python
# backend/creatures.py
from agents import Agent, Runner, handoff, function_tool
import json

# --- Define creatures ---

pyre = Agent(
    name="Pyre",
    instructions="""
    You are Pyre, a burn-rate watchdog. You live in a founder's financial data.
    Hunt for zombie SaaS, calculate runway, flag waste.
    When you find waste, hand off to Fetch for negotiations.
    """,
    model="gpt-5.4",
    tools=[],  # read-only analysis
    handoffs=[],  # filled below after other agents are defined
)

fetch = Agent(
    name="Fetch",
    instructions="""
    You are Fetch, a deal closer. Hunt for dropped conversations,
    draft follow-ups, track warm intros. When a follow-up succeeds,
    hand off to Lode if it involves hiring.
    """,
    model="gpt-5.4",
)

sight = Agent(
    name="Sight",
    instructions="""
    You are Sight, a competitor watcher. Detect hiring signals,
    funding rounds, positioning threats. Alert Pyre if a competitor
    is spending aggressively in your category.
    """,
    model="gpt-5.4",
)

lode = Agent(
    name="Lode",
    instructions="""
    You are Lode, a talent scout. Screen candidates, find warm intros,
    draft outreach. Hand off to Fetch if a candidate was referred by
    someone Fetch knows.
    """,
    model="gpt-5.4",
)

# --- Set up handoffs (creatures can delegate to each other) ---

pyre.handoffs = [
    handoff(fetch,
        tool_name_override="hand_to_fetch",
        tool_description_override="When you find SaaS to cancel, hand off to Fetch for negotiation"
    ),
]

fetch.handoffs = [
    handoff(lode,
        tool_name_override="hand_to_lode",
        tool_description_override="When scheduling a meeting that could lead to hiring, alert Lode"
    ),
]

sight.handoffs = [
    handoff(pyre,
        tool_name_override="alert_pyre",
        tool_description_override="When a competitor raises money in your space, alert Pyre to model the threat"
    ),
]

# Creature registry
CREATURES = {
    "pyre": pyre,
    "fetch": fetch,
    "sight": sight,
    "lode": lode,
}
```

### Running a hunt with live streaming

```python
# backend/creature_manager.py
from agents import Runner
from backend.creatures import CREATURES
import json

async def hunt_creature(name: str, data: dict, websocket):
    """
    Run one creature's hunt. Stream every thought, tool call,
    and handoff to the city in real time.
    """
    agent = CREATURES[name]
    
    # Fire the agent with streaming
    result = Runner.run_streamed(
        agent,
        input=json.dumps(data),
    )
    
    # Stream EVERY event to the city
    async for event in result.stream_events():
        if event.type == "raw_response_event":
            # LLM is thinking — push token to city
            if hasattr(event.data, 'delta') and event.data.delta:
                await websocket.send_json({
                    "creature": name,
                    "type": "thought",
                    "token": event.data.delta
                })
        
        elif event.type == "run_item_stream_event":
            item = event.item
            
            if item.type == "tool_call":
                # Creature is using a tool
                await websocket.send_json({
                    "creature": name,
                    "type": "tool_call",
                    "tool": item.raw_item.name,
                    "args": item.raw_item.arguments
                })
            
            elif item.type == "handoff":
                # Creature is delegating to another creature!
                await websocket.send_json({
                    "creature": name,
                    "type": "handoff",
                    "from": name,
                    "to": item.raw_item.name,
                    "reason": item.raw_item.arguments
                })
    
    # Done — parse the final output
    final_output = result.final_output
    return json.loads(final_output)
```

### What the city sees during a hunt

```
🔥 Pyre — HUNTING
   "Scanning 47 transactions..."
   "Calculating runway: $76,500 / $18,200 = 4.2 months..."
   "Mixpanel $350/mo — last login 74 days ago..."
   "Typeform $89/mo — last login 95 days ago..."
   "Figma $75/mo — seat belongs to departed intern..."
   ➡️  HANDOFF: Pyre → Fetch ("Cancel these 3 subscriptions")
   
🐺 Fetch — HUNTING (triggered by Pyre's handoff)
   "Drafting cancellation for Mixpanel..."
   "Drafting cancellation for Typeform..."
   "Figma requires 30-day notice — flagging..."
   
⚠️  ALERT: $514/mo zombie SaaS. 3 cancellation drafts ready.
```

The city is ALIVE. Every thought. Every handoff. Every decision.
The user watches creatures collaborate in real time.

### Parallel execution — "Release All"

```python
import asyncio

async def release_all(creature_names: list, data: dict, websocket):
    """Fire all creatures simultaneously. Each runs independently."""
    tasks = [
        hunt_creature(name, data[name], websocket)
        for name in creature_names
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return dict(zip(creature_names, results))
```

4 agents. 4 parallel streams. All 4 buildings hunt simultaneously.
Handoffs chain across creatures. The city erupts in 15-30 seconds.

### Persistent memory — creatures learn over time

The Agents SDK `Session` object stores conversation history automatically:

```python
from agents import Session

# Each creature gets a persistent session
creature_sessions = {
    "pyre": Session(),
    "fetch": Session(),
    "sight": Session(),
    "lode": Session(),
}

async def hunt_with_memory(name: str, data: dict, websocket):
    """Run a hunt with persistent memory from all previous hunts."""
    agent = CREATURES[name]
    session = creature_sessions[name]  # remembers everything
    
    result = Runner.run_streamed(
        agent,
        input=json.dumps(data),
        session=session,  # past context injected automatically
    )
    # ... stream events as above ...
```

Pyre remembers every bank scan. Fetch remembers every draft. Sight builds
a competitor database across hunts. Memory is automatic — the SDK handles it.

### Refining — "Dig Deeper" into the same session

```python
async def refine_hunt(name: str, follow_up: str, websocket):
    """Follow-up prompt into the SAME session. Creature remembers context."""
    agent = CREATURES[name]
    session = creature_sessions[name]  # same session!
    
    result = Runner.run_streamed(
        agent,
        input=follow_up,
        session=session,  # all prior context is available
    )
    # ... stream ...
```

**Demo moment:** Pyre finds zombie SaaS. You click "Dig deeper — what's the
biggest waste?" Pyre responds: *"Mixpanel at $350/mo. Unused 74 days. But I
can see your team is paying for Amplitude too — $500/mo. You're double-paying
for analytics. That's $850/mo total. Want me to hand this to Fetch?"*

### Spawning a new creature live

```python
# backend/spawn.py
from agents import Agent, handoff

def spawn_creature(name: str, instructions: str, model: str = "gpt-5.4"):
    """Create a new creature at runtime. Add it to the registry."""
    new_agent = Agent(
        name=name,
        instructions=instructions,
        model=model,
    )
    
    # Register it
    CREATURES[name.lower()] = new_agent
    creature_sessions[name.lower()] = Session()
    
    return new_agent
```

Judge asks "can it track my calendar?" → you type: `"You are Harbor. Hunt for
calendar conflicts, double-bookings, and missed prep time before meetings."`
→ click spawn → new building rises from the empty plot → Harbor starts hunting.

### The full flow (Release All)

```
┌─────────────────────────────────────────────────────────────────┐
│                        THREE.JS CITY                             │
│                                                                 │
│   Burn Tower       Hound Den      Watchtower     Talent Forge   │
│   [🔥 HUNTING]     [🐺 HUNTING]   [👁️ HUNTING]  [⚡ HUNTING]   │
│   "Scanning..."    "Scanning..."  "Scanning..."  "Matching..."  │
└────────┬───────────────┬───────────────┬──────────────┬─────────┘
         │               │               │              │
         ▼               ▼               ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FASTAPI BACKEND                             │
│                                                                 │
│  asyncio.gather(                                                │
│      hunt_creature("pyre",   bank_data,    ws),                 │
│      hunt_creature("fetch",  inbox_data,   ws),                 │
│      hunt_creature("sight",  competitor_data, ws),              │
│      hunt_creature("lode",   candidate_data, ws),              │
│  )                                                              │
└────────┬───────────────┬───────────────┬──────────────┬─────────┘
         │               │               │              │
         ▼               ▼               ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AGENTS SDK (4 parallel agents)                │
│                                                                 │
│  Runner.run_streamed(pyre,  input=bank_data)                    │
│  Runner.run_streamed(fetch, input=inbox_data)                   │
│  Runner.run_streamed(sight, input=competitor_data)              │
│  Runner.run_streamed(lode,  input=candidate_data)               │
│                                                                 │
│  Each agent has:                                                │
│  · Built-in agent loop (tools, retries, fallbacks)              │
│  · Persistent session (memory across hunts)                     │
│  · Handoffs to other creatures                                  │
│  · Live event stream → WebSocket → city reacts                  │
└────────┬───────────────┬───────────────┬──────────────┬─────────┘
         │               │               │              │
         ▼               ▼               ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GPT-5.6 (via Agents SDK)                      │
│                                                                 │
│  Pyre:  bank.json    → 🧠 "4.2mo runway. $514/mo zombie SaaS."  │
│                        ➡️  HANDOFF to Fetch                      │
│                                                                 │
│  Fetch: inbox.json   → 🧠 "a16z follow-up. 11 days. Drafted."   │
│                                                                 │
│  Sight: competitors  → 🧠 "AgentStack raised $6.2M."            │
│                        ➡️  HANDOFF to Pyre                       │
│                                                                 │
│  Lode:  candidates   → 🧠 "2 engineers. 1 warm intro."          │
│                        ➡️  HANDOFF to Fetch                      │
└────────┬───────────────┬───────────────┬──────────────┬─────────┘
         │               │               │              │
         ▼               ▼               ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ALERT PIPELINE                               │
│                                                                 │
│  Parse final output → Format alert → WebSocket push → City      │
│                                                                 │
│  Burn Tower: FOUND (erupts)     Alert: "$514/mo zombie SaaS"    │
│  Hound Den:   FOUND (flashes)   Alert: "a16z follow-up"         │
│  Watchtower:  FOUND (red beam)  Alert: "Competitor raised $6.2M"│
│  Talent Forge: FOUND (ring)     Alert: "2 candidates found"     │
│                                                                 │
│  And the handoffs ripple through the city:                       │
│  Pyre → Fetch wire glows. Sight → Pyre wire pulses.             │
│  Lode → Fetch wire sparks. The city is a living network.        │
└─────────────────────────────────────────────────────────────────┘
```

### Why the Agents SDK over alternatives

| Concern | Agents SDK |
|---------|------------|
| **"Is it a hack?"** | No — it's the official agent framework. OpenAI ships it for exactly this. |
| **"Will it work with hackathon credits?"** | Yes. Fayetteville event provides API Credits. Agents SDK uses API credits. |
| **"What about handoffs / subagents?"** | Built-in. `agent.handoffs = [other]`. One line. Fully streamed. |
| **"Can we see what's happening?"** | Every thought, tool call, and handoff fires an event. The city is alive. |
| **"What about session memory?"** | `Session()` object. Persistent across hunts. Automatic. |
| **"What happens when the API changes?"** | The Agents SDK is maintained by OpenAI. It tracks API changes. You don't. |

---

## 5. THREE.JS SCENE SPECS

### The Ground
- Dark grid plane with subtle glow lines (Tron-style)
- Floating particles (fog/mist at ground level)
- Orbiting ambient lights

### Buildings (per creature)

| Building | Geometry | Color | Idle | Hunting | Found Something |
|----------|----------|-------|------|---------|-----------------|
| **Burn Tower** | Stacked boxes, chimney | Orange/red | Flickering top window | Smoke particles from chimney | Eruption — fire particles + tower grows taller |
| **Hound Den** | Low dome, antenna | Blue/cyan | Subtle pulse | Papers orbiting antenna | Den flashes, paper particles scatter |
| **Watchtower** | Tall cylinder, lens on top | Green | Slow sweep beam | Fast sweep beam, lens glow | Beam turns red, alarm pulse |
| **Talent Forge** | Anvil shape, chimney | Yellow/gold | Sparks every few seconds | Hammering animation, sparks increase | Golden glow, anvil rings, spark fountain |

### Empty Plot
- Flat grass-green plane
- Hovering translucent wireframe box
- Text label: "BUILD"
- Clickable → opens Spawn modal

### Camera
- OrbitControls: click-drag to rotate, scroll to zoom
- Start position: isometric view showing all 5 plots
- Auto-fly to building when alert fires (optional, skip if time)

### Post-Processing
- Bloom pass (important — makes the city glow)
- Fog at ground level
- Skip if performance tanks on laptop

---

## 6. ANIMATION SYSTEM

Each building has 3 states → 3 animation presets:

```
IDLE ────────▶ HUNTING ────────▶ FOUND ────────▶ IDLE
(subtle       (active         (dramatic       (cooldown,
ambient)      particles,      eruption,       return to
              pulse,          flash,          idle after
              movement)       alert fires)    5 seconds)
```

Implementation: use GSAP or Three.js built-in animation. Each state transition is a tween.

---

## 7. ALERT SYSTEM

When a creature finds something:
1. Building plays FOUND animation
2. Camera optionally auto-pans to the building (can skip)
3. HTML overlay slides in from the right:

```
┌─────────────────────────────────────┐
│ ⚠️  PYRE  ·  just now               │
│                                     │
│  $514/mo in zombie SaaS             │
│                                     │
│  Mixpanel unused 74 days · $350/mo  │
│  Typeform unused 95 days · $89/mo   │
│  Figma seat (ex-intern) · $75/mo    │
│                                     │
│  Cut all three → +1.1 months runway │
│                                     │
│  [DISMISS]  [ACT ON IT]             │
└─────────────────────────────────────┘
```

Multiple alerts stack vertically. Oldest auto-dismiss after 10 seconds.

---

## 8. BUILDINGS: EXACT GEOMETRY

### Burn Tower (Pyre)
```
      ▲
     /|\        ← flame particle system on top
    / | \
   /  |  \
  ┌───┼───┐
  │   │   │    ← stacked BoxGeometry, 3 tiers
  │▓▓▓│▓▓▓│
  │▓▓▓│▓▓▓│    ← emissive orange material
  │▓▓▓│▓▓▓│
  └───┴───┘
  ▓▓▓▓▓▓▓▓▓    ← foundation glow plane
```

### Hound Den (Fetch)
```
      📡        ← thin cylinder antenna
      │
   ╭──────╮     ← flattened SphereGeometry (dome)
  ╱        ╲
 ╱   ▓▓▓▓   ╲   ← emissive blue, glass-like
╱────────────╲
▓▓▓▓▓▓▓▓▓▓▓▓▓   ← foundation
```

### Watchtower (Sight)
```
      ┌─┐       ← lens on top (TorusGeometry + spotlight)
      │ │
      │ │
      │▓│       ← tall CylinderGeometry
      │▓│
      │▓│       ← emissive green
      │▓│
      └─┘
    ▓▓▓▓▓▓▓▓
```

### Talent Forge (Lode)
```
      ⚡        ← spark particle system
    ┌─────┐
    │     │     ← BoxGeometry (forge body)
    │ ▓▓▓ │
    │ ▓▓▓ │     ← emissive yellow, glowing cracks
    │     │
    └──┬──┘
       │        ← anvil base
    ▓▓▓▓▓▓▓▓
```

### Empty Plot
```
    ┌ ─ ─ ─ ┐
    │       │   ← wireframe box, translucent
    │ BUILD │   ← floating text sprite
    └ ─ ─ ─ ┘
    ░░░░░░░░░   ← grass-green plane
```

Time budget: 2 hours to model, texture, and light all 5 buildings. Use `@react-three/drei` helpers (Box, Cylinder, Sphere, Text) to avoid raw Three.js boilerplate.

---

## 9. TIMELINE

### HOUR 0–2: SCAFFOLD (10:00 AM – 12:00 PM)

```
[ ] Create project (Vite + React + Three.js via @react-three/fiber + @react-three/drei)
[ ] Set up basic scene: ground plane, lights, OrbitControls, bloom post-processing
[ ] Set up FastAPI + WebSocket endpoint
[ ] Verify ChatGPT API key works
[ ] Create creature system prompts (4 markdown files)
[ ] Create demo data files (bank.json, inbox.json, competitors.json, candidates.json)
```

**Deliverable:** Empty dark city grid renders in browser. You can orbit the camera.
             API test passes. Demo data exists.

### HOUR 2–4: BUILDINGS (12:00 PM – 2:00 PM)

```
[ ] Build Burn Tower (Pyre) — stacked boxes, orange emissive, flame particles
[ ] Build Hound Den (Fetch) — dome, antenna, blue emissive
[ ] Build Watchtower (Sight) — cylinder, lens, green beam
[ ] Build Talent Forge (Lode) — anvil, yellow glow, spark particles
[ ] Build Empty Plot — wireframe box, grass plane, "BUILD" text
[ ] Add idle animations (Pyre flicker, Fetch pulse, Sight beam sweep, Lode sparks)
```

**Deliverable:** All 5 buildings visible in the city. Each has idle animation.
             City looks alive even before anything happens.

### HOUR 2–3: LUNCH (eat while tweaking building colors)

### HOUR 4–6: LOGIC (2:00 PM – 4:00 PM)

```
[ ] Build Creature Manager backend (triggers API calls for each creature)
[ ] Build Alert Pipeline (GPT-5.6 response → parse → WebSocket → frontend)
[ ] Wire Pyre end-to-end: API call → tower erupts → alert overlay appears
[ ] Build alert overlay component (HTML/CSS, slide-in from right, stackable)
[ ] Add HUNTING animation state (triggered when API call is in flight)
[ ] Add FOUND animation state (triggered when alert arrives)
```

**Deliverable:** Pyre works end-to-end. Tower hunts, erupts, alert slides in.
             One creature complete, full stack.

### HOUR 6–8: ALL CREATURES (4:00 PM – 6:00 PM)

```
[ ] Wire Fetch, Sight, Lode (copy Pyre pattern — same pipeline, different prompts)
[ ] Add "Release All" button (fires all 4 API calls simultaneously)
[ ] Add evolution visual (building grows, changes color, new particle effects)
[ ] Wire evolution trigger (Pyre saves $500+ → Burn Tower upgrades)
[ ] Add Empty Plot click → Spawn Modal → create new creature from template
[ ] Add timeline sidebar (HTML overlay, scrollable history of all alerts)
```

**Deliverable:** All 4 creatures working. Evolution visual works. Spawn works.
             "Release All" = all 4 buildings erupt simultaneously.

### HOUR 8–10: POLISH (6:00 PM – 8:00 PM)

```
[ ] Bloom tuning (city glow looks premium)
[ ] Particle effects polish (smoke, sparks, beam, papers)
[ ] Alert overlay animation polish (slide-in easing, auto-dismiss timer)
[ ] Camera fly-to on alert (optional — skip if janky)
[ ] City ambient sounds (subtle hum, alert chime — Web Audio API, skip if time)
[ ] Mobile-responsive alert overlay (city is desktop-only, alerts work on phone)
[ ] Performance check (60fps on MacBook — reduce particles if needed)
```

**Deliverable:** Polished, premium-feeling city. Judges orbit, zoom, explore.

### HOUR 10–12: DEMO PREP + CONTINGENCY (8:00 PM – 10:00 PM)

```
[ ] Choreograph demo sequence (see Section 9)
[ ] Record backup video
[ ] Fine-tune demo data for maximum simultaneous drama
[ ] Practice demo with timer (90 seconds)
[ ] Q&A prep
[ ] Bug fixes only
```

---

## 10. DEMO SEQUENCE (90 seconds)

### 0:00–0:15 — THE CITY REVEAL
> "This is Agencity."

*Camera slowly orbits the dark city. 4 buildings glow faintly. Particles drift.
Empty plot waits. The city hums.*

> "Every building is a creature. Every creature hunts for something."

### 0:15–0:45 — THE HUNT
> "Pyre hunts for burn."

*Click "Release Pyre." Burn Tower pulses. Smoke rises. 15 seconds.*

> ⚠️ *Tower erupts. Alert crashes in.*
> "4.2 months runway. $514/mo in zombie SaaS. Mixpanel unused 74 days.
> Typeform unused 95 days. Figma seat from an intern who left in March."

> "Release them all."

*Click "Release All." All 4 buildings enter HUNTING state simultaneously.
Smoke from Burn Tower. Papers orbit Hound Den. Watchtower beam sweeps
faster. Talent Forge hammers.*

*Cascade of alerts:*

> ⚠️ **Fetch:** "a16z follow-up. 11 days. Drafted."
> ⚠️ **Sight:** "Competitor raised $6.2M. In your space. Today."
> ⚠️ **Lode:** "2 founding engineers. One through your angel."

### 0:45–1:00 — THE EVOLUTION
> "Pyre just saved you $514. The city rewards that."

*Burn Tower grows. Color shifts from orange to deep crimson. New particle
effects. Name changes: PYRE → INFERNAL.*

> "Every building evolves when its creature delivers."

### 1:00–1:15 — THE SPAWN
> "This isn't four buildings. It's a foundation."

*Click Empty Plot. Modal opens. Name: "Harbor." Data source: product analytics.
Hit spawn. Wireframe solidifies. New building rises from the ground. Harbor
starts hunting.*

> "Any creature. Any data source. The city grows."

### 1:15–1:30 — THE CLOSE
> "Agencity — autonomous creatures that live in your data, hunt for what you'd
> miss, and evolve when they deliver."

*Camera pulls back. 5 buildings glowing. Alerts scrolling. Infernal burning
bright. City humming.*

---

## 11. THREE.JS PITFALLS TO AVOID

| Pitfall | Fix |
|---------|-----|
| **Performance tanking** | Keep particle counts under 500. Use InstancedMesh for particles. Limit draw calls. |
| **@react-three/fiber learning curve** | Start with vanilla Three.js if team is new to R3F. Vanilla is more code but fewer surprises. |
| **Bloom too intense** | Start subtle. Bloom at 0.3 strength. Crank up only for demo. |
| **Camera fly-to jank** | Use GSAP or `drei`'s `CameraControls`. If it stutters, skip — manual orbit is fine. |
| **Alert overlay blocking the city** | Alerts are semi-transparent, slide in from right edge, cover 30% of screen max. City always visible behind them. |
| **Building geometry takes too long** | Default to primitives (Box, Cylinder, Sphere). Add detail with emissive materials and particles, not complex meshes. |
| **WebGL not supported** | Fallback: show the FastAPI backend dashboard as backup. City won't render on ancient hardware. |

---

## 12. FILE STRUCTURE

```
agencity/
├── frontend/
│   ├── src/
│   │   ├── App.tsx                      # Scene + overlay shell
│   │   ├── components/
│   │   │   ├── City.tsx                 # Three.js scene (ground, lights, fog, bloom)
│   │   │   ├── buildings/
│   │   │   │   ├── BurnTower.tsx        # Pyre's building
│   │   │   │   ├── HoundDen.tsx         # Fetch's building
│   │   │   │   ├── Watchtower.tsx       # Sight's building
│   │   │   │   ├── TalentForge.tsx      # Lode's building
│   │   │   │   └── EmptyPlot.tsx        # Spawn location
│   │   │   ├── particles/
│   │   │   │   ├── SmokeParticles.tsx
│   │   │   │   ├── SparkParticles.tsx
│   │   │   │   ├── PaperParticles.tsx
│   │   │   │   └── BeamEffect.tsx
│   │   │   ├── overlay/
│   │   │   │   ├── AlertStack.tsx       # Slide-in alert panel
│   │   │   │   ├── AlertItem.tsx        # Single alert
│   │   │   │   ├── SpawnModal.tsx       # New creature modal
│   │   │   │   └── Timeline.tsx         # Alert history sidebar
│   │   │   └── HUD.tsx                  # City name, creature status bar
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   └── useCreatureState.ts      # IDLE → HUNTING → FOUND → IDLE
│   │   ├── data/
│   │   │   └── creatures.ts             # Creature definitions + building mappings
│   │   └── styles/
│   │       └── overlay.css              # Alert panel styles
│   ├── package.json
│   └── vite.config.ts
│
├── backend/
│   ├── main.py                          # FastAPI + WebSocket
│   ├── creatures.py                     # Agent definitions + handoffs + registry
│   ├── creature_manager.py              # hunt_creature(), release_all(), streaming
│   ├── sessions.py                      # Persistent Session() objects per creature
│   ├── spawn.py                         # Runtime creature creation
│   └── data/
│       ├── bank.json
│       ├── inbox.json
│       ├── competitors.json
│       └── candidates.json
│
├── README.md
├── DEMO.md
└── ARCHITECTURE.md
```

---

## 13. RISKS & CONTINGENCIES

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Three.js eats too much time | HIGH | If buildings take >2 hours, simplify to colored cubes with text labels. Particle effects are 15 minutes each, not 30. |
| Three.js bugs eat demo | Medium | Alert overlay is pure HTML/CSS — it works regardless of 3D scene state. City can be half-broken, alerts still deliver the demo. |
| React Three Fiber learning curve | Medium | Fallback: vanilla Three.js in a single `City.tsx` file. Fewer abstractions, easier debugging. |
| API latency during demo | Low | 4 simultaneous calls, 15-30 seconds max. Fill gap with narration. |
| Building evolution visual is janky | Medium | Skip evolution visuals if time is tight. Core demo works without it. |
| WiFi dies | Low | Localhost + API calls. Hotspot backup. |
| Laptop can't handle bloom + particles | Medium | Test on the actual demo laptop by Hour 4. Reduce particles/disable bloom if <30fps. |

---

## 14. TEAM ROLES (2–4 people)

| Role | Focus |
|------|-------|
| **3D/Frontend Lead** | Three.js scene, buildings, particles, animations, camera, bloom |
| **Backend/API Lead** | FastAPI, WebSocket, ChatGPT API calls, alert pipeline, creature manager |
| **Overlay/UX (optional)** | Alert overlay HTML/CSS, spawn modal, timeline, responsive polish |
| **Floater (optional)** | Demo data, creature prompts, evolution logic, demo script, video backup |

---

## 15. WHY THIS WINS

| Thing | Why |
|-------|-----|
| **Nobody has done it** | Every other team has a chat interface or a flat dashboard. One team has a living 3D city. That team is remembered. |
| **The framing is the substance** | "A city of agents" isn't a gimmick — the city IS the management interface. You watch buildings work. You see the city grow. The 3D isn't decoration, it's the product. |
| **Visual density in 90 seconds** | Judges see: dark glowing city → buildings erupt → alerts cascade → tower evolves → new building spawns. That's more visual information than 20 flat dashboards combined. |
| **"Build a new one live" moment** | Judge says "can it track my calendar?" → click empty plot → new building rises → city grows. That's the mic drop. |
| **Deeply on-track** | "UX for Agentic Applications" — this is the most ambitious take on the track. The city IS the UX. |

---

## 16. ONE-SENTENCE PITCH

*"Agencity — a living 3D city where autonomous creatures hunt through your
data and evolve when they deliver."*
