import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import PixelOffice from './components/PixelOffice'
import {
  ROOMS,
  ROOM_PALETTES,
  getOfficeHeight,
  type AgentKind,
  type RoomData,
  type RoomMember,
} from './data/rooms'
import { CORE_CREATURES, useAgencity, type CreatureState } from './hooks/useAgencity'
import agencityGreenLogo from '../../assets/agencitygreen.png'
import './App.css'

const agentIcons: Record<string, string> = {
  pyre: '$',
  fetch: '↗',
  sight: '?',
  lode: '★',
  patch: '</>',
}

const kindIcons: Record<AgentKind, string> = {
  finance: '$',
  growth: '↗',
  research: '?',
  talent: '★',
  coder: '</>',
}

const ROOM_STORAGE_KEY = 'agencity.rooms.v2'

function initialRooms(): RoomData[] {
  try {
    const saved = window.localStorage.getItem(ROOM_STORAGE_KEY)
    if (!saved) return ROOMS
    const parsed = JSON.parse(saved) as RoomData[]
    if (!Array.isArray(parsed) || parsed.length === 0) return ROOMS
    return parsed.map((room) => ({ ...room, members: room.members ?? [] }))
  } catch {
    return ROOMS
  }
}

function roomIcon(room: RoomData): string {
  return agentIcons[room.id] ?? kindIcons[room.kind]
}

const progressByAgent: Record<string, number> = {
  pyre: 62,
  fetch: 44,
  sight: 76,
  lode: 58,
  patch: 82,
}

const stateLabels: Record<CreatureState, string> = {
  idle: 'Ready to hunt',
  hunting: 'Hunting signals',
  found: 'Opportunity found',
  error: 'Needs attention',
}

function safeSourceUrl(source: string): string | null {
  try {
    const url = new URL(source)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

function isLongAlert(alert: {
  details: string
  recommendation: string
  sources: string[]
}): boolean {
  return alert.details.length + alert.recommendation.length > 420 || alert.sources.length > 3
}

function App() {
  const {
    alerts,
    apiKeyConfigured,
    connection,
    creatures,
    dismissAlert,
    error,
    giveQuest,
    hunt,
    refine,
    releaseAll,
    spawn,
    states,
    thoughts,
  } = useAgencity()
  const [rooms, setRooms] = useState<RoomData[]>(initialRooms)
  const [selectedRoomId, setSelectedRoomId] = useState('patch')
  const [focusedRoomId, setFocusedRoomId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [showAddRoom, setShowAddRoom] = useState(false)
  const [roomName, setRoomName] = useState('Strategy Studio')
  const [roomPurpose, setRoomPurpose] = useState('Turn founder priorities into clear weekly plans.')
  const [roomKind, setRoomKind] = useState<AgentKind>('research')
  const [showQuest, setShowQuest] = useState(false)
  const [questText, setQuestText] = useState('')
  const [questTarget, setQuestTarget] = useState('all')
  const [questError, setQuestError] = useState<string | null>(null)
  const [questPending, setQuestPending] = useState(false)
  const [lastQuest, setLastQuest] = useState<{ text: string; target: string } | null>(null)
  const [showSpawn, setShowSpawn] = useState(false)
  const [spawnRoomId, setSpawnRoomId] = useState('patch')
  const [spawnLevel, setSpawnLevel] = useState<RoomMember['level']>('subagent')
  const [spawnKind, setSpawnKind] = useState<AgentKind>('coder')
  const [spawnRunNow, setSpawnRunNow] = useState(false)
  const [spawnName, setSpawnName] = useState('Harbor')
  const [spawnInstructions, setSpawnInstructions] = useState(
    'Hunt for scheduling conflicts, missing preparation, and meetings without clear next steps.',
  )
  const [spawnData, setSpawnData] = useState('{"meetings": []}')
  const [spawnError, setSpawnError] = useState<string | null>(null)

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? rooms[0],
    [rooms, selectedRoomId],
  )
  const selectedLead = selectedRoom.members.find((member) => member.level === 'pm')
  const selectedCreature = selectedLead?.backendCreature ?? (
    creatures.includes(selectedRoom.id) ? selectedRoom.id : undefined
  )
  const selectedState = selectedCreature ? states[selectedCreature] ?? 'idle' : undefined
  const selectedProgress = selectedState === 'hunting'
    ? 38
    : selectedState === 'found'
      ? 100
      : selectedState === 'error'
        ? 8
        : progressByAgent[selectedRoom.id] ?? 24
  const canRunSelected = Boolean(
    selectedCreature && connection === 'online' && apiKeyConfigured && selectedState !== 'hunting',
  )
  const selectedQuest = lastQuest && selectedCreature && (
    lastQuest.target === 'all' || lastQuest.target === selectedCreature
  ) ? lastQuest.text : selectedRoom.task

  const roomStyle = {
    '--room-color': selectedRoom.color,
    '--room-soft': selectedRoom.softColor,
    '--room-dark': selectedRoom.darkColor,
    '--room-progress': `${selectedProgress}%`,
  } as CSSProperties

  const totalAgents = rooms.reduce((sum, room) => sum + room.members.length, 0)

  const handleSelectRoom = (room: RoomData) => setSelectedRoomId(room.id)
  const handleFocusRoom = (room: RoomData) => {
    setSelectedRoomId(room.id)
    setFocusedRoomId(room.id)
    setZoom((current) => Math.max(1.65, current))
  }

  const openRecruiter = (roomId = selectedRoomId) => {
    setSpawnRoomId(roomId)
    setShowSpawn(true)
    setSpawnError(null)
  }

  const fitOffice = () => {
    const officeHeight = getOfficeHeight(rooms.length)
    const officeWidth = Math.max(window.innerWidth, 900)
    setFocusedRoomId(null)
    setZoom(Math.min(1, Math.max(0.55,
      Math.min((window.innerHeight - 16) / officeHeight, (window.innerWidth - 16) / officeWidth),
    )))
  }

  useEffect(() => {
    window.localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify(rooms))
  }, [rooms])

  useEffect(() => {
    const openQuestComposer = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setShowQuest(true)
      }
    }
    window.addEventListener('keydown', openQuestComposer)
    return () => window.removeEventListener('keydown', openQuestComposer)
  }, [])

  const submitQuest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanQuest = questText.trim()
    if (!cleanQuest) {
      setQuestError('Describe the quest before dispatching it.')
      return
    }

    setQuestPending(true)
    setQuestError(null)
    setLastQuest({ text: cleanQuest, target: questTarget })
    try {
      await giveQuest(cleanQuest, questTarget)
      setQuestText('')
      setShowQuest(false)
    } catch (cause) {
      setQuestError(cause instanceof Error ? cause.message : 'Could not dispatch quest')
    } finally {
      setQuestPending(false)
    }
  }

  const submitSpawn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const data = JSON.parse(spawnData) as Record<string, unknown>
      const creature = await spawn(spawnName, spawnInstructions, data, spawnRunNow)
      const member: RoomMember = {
        id: `${creature}-${crypto.randomUUID().slice(0, 8)}`,
        name: spawnName.trim(),
        role: spawnInstructions.trim().split(/[.!?]/)[0] || 'Startup agent',
        kind: spawnKind,
        level: spawnLevel,
        backendCreature: creature,
      }
      setRooms((current) => current.map((room) => {
        if (room.id !== spawnRoomId) return room
        const members = spawnLevel === 'pm'
          ? [member, ...room.members.filter((candidate) => candidate.level !== 'pm')]
          : [...room.members, member]
        return {
          ...room,
          agent: spawnLevel === 'pm' ? member.name : room.agent,
          role: spawnLevel === 'pm' ? member.role : room.role,
          members,
        }
      }))
      setSelectedRoomId(spawnRoomId)
      setShowSpawn(false)
      setSpawnError(null)
    } catch (cause) {
      setSpawnError(cause instanceof Error ? cause.message : 'Could not recruit agent')
    }
  }

  const submitRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanName = roomName.trim()
    if (!cleanName) return
    const id = `room-${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString(36)}`
    const palette = ROOM_PALETTES[roomKind]
    const room: RoomData = {
      id,
      agent: 'Open PM seat',
      room: cleanName,
      role: `${roomKind} workspace`,
      status: 'Ready to staff',
      task: roomPurpose.trim() || 'Waiting for its first quest',
      note: roomPurpose.trim() || 'A fresh room ready for a new agent team.',
      ...palette,
      kind: roomKind,
      members: [],
      position: [0, 0, 0],
    }
    setRooms((current) => [...current, room])
    setSelectedRoomId(id)
    setFocusedRoomId(id)
    setZoom(1.65)
    setShowAddRoom(false)
  }

  return (
    <main className="game-shell" style={roomStyle}>
      <div className="world-pixels" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <div
        className="office-viewport"
        onWheel={(event) => {
          event.preventDefault()
          setZoom((current) => Math.min(2.25, Math.max(0.55, current - event.deltaY * 0.001)))
        }}
      >
        <PixelOffice
          rooms={rooms}
          selectedRoomId={selectedRoomId}
          agentStates={states}
          onSelectRoom={handleFocusRoom}
          zoom={zoom}
          focusedRoomId={focusedRoomId}
        />
      </div>

      <div className="zoom-hud pixel-panel" aria-label="Office zoom controls">
        <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.55, value - 0.2))}>−</button>
        <button className="zoom-readout" type="button" onClick={() => { setFocusedRoomId(null); setZoom(1) }}>{Math.round(zoom * 100)}%</button>
        <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(2.25, value + 0.2))}>+</button>
        <button className="zoom-fit" type="button" onClick={fitOffice}>FIT</button>
      </div>

      <header className="game-topbar">
        <div className="top-logo">
          <img src={agencityGreenLogo} alt="Agencity" />
        </div>

        <div className="resource-hud pixel-panel" aria-label="Company resources">
          <div><small>ROOMS</small><strong>{String(rooms.length).padStart(2, '0')}</strong></div>
          <div><small>AGENTS</small><strong>{String(totalAgents).padStart(2, '0')}</strong></div>
          <div><small>XP</small><strong>078</strong></div>
          <div><small>CREDITS</small><strong>$398</strong></div>
        </div>
      </header>

      <nav className="agent-hud pixel-panel" aria-label="Agent rooms">
        <div className="hud-title"><span>ROOMS</span><b>{rooms.length}</b></div>
        <div className="agent-room-list">
        {rooms.map((room) => {
          const leadCreature = room.members.find((member) => member.level === 'pm')?.backendCreature
          const agentState = states[leadCreature ?? room.id]
          const status = agentState ? stateLabels[agentState] : room.status
          return (
            <button
              className={`agent-card state-${agentState ?? 'local'} ${selectedRoomId === room.id ? 'is-active' : ''}`}
              key={room.id}
              onClick={() => handleSelectRoom(room)}
              style={{ '--agent-color': room.color, '--agent-soft': room.softColor } as CSSProperties}
              type="button"
            >
              <span className="agent-icon">{roomIcon(room)}</span>
              <span className="agent-copy"><strong>{room.room}</strong><small>{room.agent} · {status}</small></span>
              <span className="agent-online" />
            </button>
          )
        })}
        </div>
        <div className="hud-build-actions">
          <button className="add-agent" type="button" onClick={() => setShowAddRoom(true)}>+ ADD ROOM</button>
          <button className="add-agent" type="button" onClick={() => openRecruiter()}>+ ADD AGENT</button>
        </div>
      </nav>

      <aside className="mission-hud pixel-panel">
        <div className="mission-kicker">
          <span><i /> ACTIVE ROOM</span>
          <b>{selectedState ? selectedState.toUpperCase() : 'LOCAL'}</b>
        </div>
        <div className="mission-agent">
          <div className="mission-avatar">{roomIcon(selectedRoom)}</div>
          <div><h2>{selectedRoom.agent}</h2><p>{selectedRoom.room}</p></div>
        </div>
        <div className="mission-role">{selectedRoom.role}</div>
        <div className="mission-card">
          <small>CURRENT QUEST</small>
          <strong>{selectedQuest}</strong>
          <div className="mission-progress"><i /></div>
          <span>{selectedProgress}% COMPLETE <em>{selectedState === 'hunting' ? 'LIVE' : '~8 MIN'}</em></span>
        </div>
        <div className="room-log">
          <div><span>✓</span><p><strong>CONTEXT LOADED</strong><small>Workspace ready</small></p></div>
          <div><span>↗</span><p><strong>AGENT THOUGHT</strong><small>{thoughts[selectedRoom.id] || 'Waiting for next run'}</small></p></div>
          <div className={`is-live state-${selectedState ?? 'local'}`}>
            <span>{selectedState === 'hunting' ? '…' : '●'}</span>
            <p><strong>{selectedState ? stateLabels[selectedState] : selectedRoom.status}</strong><small>{connection === 'online' ? 'Agent network connected' : 'Backend reconnecting'}</small></p>
          </div>
        </div>
        <div className="room-roster">
          <div className="roster-title"><span>ROOM TEAM</span><b>{selectedRoom.members.length}</b></div>
          {selectedRoom.members.length === 0 ? (
            <button className="empty-roster" type="button" onClick={() => openRecruiter(selectedRoom.id)}>+ STAFF THIS ROOM</button>
          ) : selectedRoom.members.map((member) => (
            <div className="roster-member" key={member.id}>
              <i>{kindIcons[member.kind]}</i>
              <span><strong>{member.name}</strong><small>{member.role}</small></span>
              <b>{member.level === 'pm' ? 'PM' : 'SUB'}</b>
            </div>
          ))}
          {selectedRoom.members.length > 0 && (
            <button className="roster-add" type="button" onClick={() => openRecruiter(selectedRoom.id)}>+ ADD SUB-AGENT</button>
          )}
        </div>
        <button
          className="enter-room-button"
          type="button"
          disabled={!canRunSelected}
          onClick={() => selectedCreature && void hunt(selectedCreature)}
        >
          {selectedState === 'hunting' ? 'HUNTING…' : selectedCreature ? `RELEASE ${selectedRoom.agent.toUpperCase()}` : 'RECRUIT A PM TO RUN'}
          <span>▶</span>
        </button>
      </aside>

      <div className="system-messages" aria-live="polite">
        {connection === 'online' && !apiKeyConfigured && (
          <div className="configuration-warning pixel-panel" role="alert">ADD <code>OPENAI_API_KEY</code> TO <code>backend/.env</code></div>
        )}
        {error && <div className="runtime-error pixel-panel" role="alert">{error}</div>}
      </div>

      <section
        className={`alert-stack ${alerts.some(isLongAlert) ? 'has-long-output' : ''}`}
        aria-label="Agent alerts"
        aria-live="polite"
      >
        {alerts.map((alert) => (
          <article
            className={`alert-card pixel-panel ${isLongAlert(alert) ? 'is-expanded' : ''}`}
            key={alert.id}
          >
            <header>
              <b>{alert.creature}</b>
              <span>{alert.phase === 'synthesis' ? 'PARTY SYNTHESIS · ' : ''}{alert.impact}</span>
            </header>
            <h2>{alert.headline}</h2>
            <p>{alert.details}</p>
            <strong>{alert.recommendation}</strong>
            {alert.sources.length > 0 && (
              <ul className="alert-sources" aria-label="Research sources">
                {alert.sources.map((source) => (
                  <li key={source}>
                    {safeSourceUrl(source) ? (
                      <a href={safeSourceUrl(source)!} target="_blank" rel="noreferrer">{source}</a>
                    ) : <span>{source}</span>}
                  </li>
                ))}
              </ul>
            )}
            <footer>
              <button type="button" onClick={() => dismissAlert(alert.id)}>DISMISS</button>
              <button type="button" onClick={() => void refine(alert.creature)}>DIG DEEPER</button>
            </footer>
          </article>
        ))}
      </section>

      {showQuest && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !questPending && setShowQuest(false)}>
          <section
            className="spawn-modal quest-modal pixel-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quest-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <span>PARTY COMMAND</span>
              <button type="button" disabled={questPending} onClick={() => setShowQuest(false)}>×</button>
            </header>
            <h2 id="quest-title">GIVE THE PARTY A QUEST</h2>
            <form onSubmit={(event) => void submitQuest(event)}>
              <label>
                ASSIGN TO
                <select value={questTarget} onChange={(event) => setQuestTarget(event.target.value)}>
                  <option value="all">ENTIRE PARTY</option>
                  {creatures.map((creature) => (
                    <option key={creature} value={creature}>{creature.toUpperCase()}</option>
                  ))}
                </select>
              </label>
              <label>
                QUEST
                <textarea
                  autoFocus
                  placeholder="Example: Find the most urgent risk we should address this week."
                  value={questText}
                  onChange={(event) => setQuestText(event.target.value)}
                />
              </label>
              <p className="quest-help">
                Agents use their specialty, seeded data, session memory, and live web search when current public information is needed.
              </p>
              {questError && <p className="form-error" role="alert">{questError}</p>}
              <div className="modal-actions">
                <button type="button" disabled={questPending} onClick={() => setShowQuest(false)}>CANCEL</button>
                <button
                  type="submit"
                  disabled={questPending || !apiKeyConfigured || connection !== 'online'}
                >
                  {questPending ? 'DISPATCHING…' : 'DISPATCH QUEST'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showAddRoom && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowAddRoom(false)}>
          <section
            className="spawn-modal pixel-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header><span>OFFICE BUILDER</span><button type="button" onClick={() => setShowAddRoom(false)}>×</button></header>
            <h2 id="room-title">ADD A NEW ROOM</h2>
            <form onSubmit={submitRoom}>
              <label>ROOM NAME<input autoFocus value={roomName} onChange={(event) => setRoomName(event.target.value)} /></label>
              <label>
                SPECIALTY
                <select value={roomKind} onChange={(event) => setRoomKind(event.target.value as AgentKind)}>
                  <option value="finance">FINANCE</option>
                  <option value="growth">GROWTH</option>
                  <option value="research">RESEARCH</option>
                  <option value="talent">TALENT</option>
                  <option value="coder">ENGINEERING</option>
                </select>
              </label>
              <label>PURPOSE<textarea value={roomPurpose} onChange={(event) => setRoomPurpose(event.target.value)} /></label>
              <p className="quest-help">The room will be saved to this office. Recruit a PM or sub-agents after it opens.</p>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowAddRoom(false)}>CANCEL</button>
                <button type="submit">BUILD ROOM</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showSpawn && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowSpawn(false)}>
          <section
            className="spawn-modal pixel-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="spawn-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header><span>NEW ROOM</span><button type="button" onClick={() => setShowSpawn(false)}>×</button></header>
            <h2 id="spawn-title">RECRUIT AN AGENT</h2>
            <form onSubmit={(event) => void submitSpawn(event)}>
              <label>NAME<input value={spawnName} onChange={(event) => setSpawnName(event.target.value)} /></label>
              <div className="form-row">
                <label>
                  ASSIGN TO ROOM
                  <select value={spawnRoomId} onChange={(event) => setSpawnRoomId(event.target.value)}>
                    {rooms.map((room) => <option key={room.id} value={room.id}>{room.room.toUpperCase()}</option>)}
                  </select>
                </label>
                <label>
                  TEAM LEVEL
                  <select value={spawnLevel} onChange={(event) => setSpawnLevel(event.target.value as RoomMember['level'])}>
                    <option value="subagent">SUB-AGENT</option>
                    <option value="pm">ROOM PM</option>
                  </select>
                </label>
              </div>
              <label>
                SPECIALTY
                <select value={spawnKind} onChange={(event) => setSpawnKind(event.target.value as AgentKind)}>
                  <option value="finance">FINANCE</option>
                  <option value="growth">GROWTH</option>
                  <option value="research">RESEARCH</option>
                  <option value="talent">TALENT</option>
                  <option value="coder">ENGINEERING</option>
                </select>
              </label>
              <label>MISSION<textarea value={spawnInstructions} onChange={(event) => setSpawnInstructions(event.target.value)} /></label>
              <label>STARTING DATA (JSON)<textarea value={spawnData} onChange={(event) => setSpawnData(event.target.value)} /></label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={spawnRunNow}
                  disabled={!apiKeyConfigured}
                  onChange={(event) => setSpawnRunNow(event.target.checked)}
                />
                RUN THE FIRST HUNT AFTER RECRUITING
              </label>
              {spawnError && <p className="form-error" role="alert">{spawnError}</p>}
              <div className="modal-actions">
                <button type="button" onClick={() => setShowSpawn(false)}>CANCEL</button>
                <button type="submit" disabled={connection !== 'online'}>{spawnRunNow ? 'RECRUIT & HUNT' : 'RECRUIT AGENT'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      <footer className="command-hud pixel-panel">
        <div className="founder-avatar">S</div>
        <button className="command-input" type="button" onClick={() => setShowQuest(true)}>
          <span>{lastQuest?.text ?? 'Give the party a new quest...'}</span><kbd>⌘K</kbd>
        </button>
        <button
          className="ship-button"
          type="button"
          disabled={connection !== 'online' || !apiKeyConfigured}
          onClick={() => void releaseAll()}
        >
          RELEASE ALL <b>{CORE_CREATURES.filter((name) => states[name] === 'hunting').length}</b>
        </button>
      </footer>
    </main>
  )
}

export default App
