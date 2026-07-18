import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import PixelOffice from './components/PixelOffice'
import { ROOMS, type RoomData } from './data/rooms'
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

function App() {
  const {
    alerts,
    apiKeyConfigured,
    connection,
    creatures,
    dismissAlert,
    error,
    hunt,
    refine,
    releaseAll,
    spawn,
    states,
    thoughts,
  } = useAgencity()
  const [selectedRoomId, setSelectedRoomId] = useState('patch')
  const [showSpawn, setShowSpawn] = useState(false)
  const [spawnName, setSpawnName] = useState('Harbor')
  const [spawnInstructions, setSpawnInstructions] = useState(
    'Hunt for scheduling conflicts, missing preparation, and meetings without clear next steps.',
  )
  const [spawnData, setSpawnData] = useState('{"meetings": []}')
  const [spawnError, setSpawnError] = useState<string | null>(null)

  const selectedRoom = useMemo(
    () => ROOMS.find((room) => room.id === selectedRoomId) ?? ROOMS[0],
    [selectedRoomId],
  )
  const selectedCreature = CORE_CREATURES.find((name) => name === selectedRoom.id)
  const selectedState = selectedCreature ? states[selectedCreature] ?? 'idle' : undefined
  const selectedProgress = selectedState === 'hunting'
    ? 38
    : selectedState === 'found'
      ? 100
      : selectedState === 'error'
        ? 8
        : progressByAgent[selectedRoom.id]
  const canRunSelected = Boolean(
    selectedCreature && connection === 'online' && apiKeyConfigured && selectedState !== 'hunting',
  )

  const roomStyle = {
    '--room-color': selectedRoom.color,
    '--room-soft': selectedRoom.softColor,
    '--room-dark': selectedRoom.darkColor,
    '--room-progress': `${selectedProgress}%`,
  } as CSSProperties

  const handleSelectRoom = (room: RoomData) => setSelectedRoomId(room.id)

  const submitSpawn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const data = JSON.parse(spawnData) as Record<string, unknown>
      await spawn(spawnName, spawnInstructions, data)
      setShowSpawn(false)
      setSpawnError(null)
    } catch (cause) {
      setSpawnError(cause instanceof Error ? cause.message : 'Could not recruit agent')
    }
  }

  return (
    <main className="game-shell" style={roomStyle}>
      <div className="world-pixels" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <div className="office-viewport">
        <PixelOffice
          rooms={ROOMS}
          selectedRoomId={selectedRoomId}
          agentStates={states}
          onSelectRoom={handleSelectRoom}
        />
      </div>

      <header className="game-topbar">
        <div className="top-logo">
          <img src={agencityGreenLogo} alt="Agencity" />
        </div>

        <div className="resource-hud pixel-panel" aria-label="Company resources">
          <div><small>AGENTS</small><strong>{String(creatures.length).padStart(2, '0')}</strong></div>
          <div><small>XP</small><strong>078</strong></div>
          <div><small>CREDITS</small><strong>$398</strong></div>
        </div>
      </header>

      <nav className="agent-hud pixel-panel" aria-label="Agent rooms">
        <div className="hud-title"><span>PARTY</span><b>{creatures.length}/5</b></div>
        {ROOMS.map((room) => {
          const agentState = states[room.id]
          const status = agentState ? stateLabels[agentState] : room.status
          return (
            <button
              className={`agent-card state-${agentState ?? 'local'} ${selectedRoomId === room.id ? 'is-active' : ''}`}
              key={room.id}
              onClick={() => handleSelectRoom(room)}
              style={{ '--agent-color': room.color, '--agent-soft': room.softColor } as CSSProperties}
              type="button"
            >
              <span className="agent-icon">{agentIcons[room.id]}</span>
              <span className="agent-copy"><strong>{room.agent}</strong><small>{status}</small></span>
              <span className="agent-online" />
            </button>
          )
        })}
        <button className="add-agent" type="button" onClick={() => setShowSpawn(true)}>+ RECRUIT AGENT</button>
      </nav>

      <aside className="mission-hud pixel-panel">
        <div className="mission-kicker">
          <span><i /> ACTIVE ROOM</span>
          <b>{selectedState ? selectedState.toUpperCase() : 'LOCAL'}</b>
        </div>
        <div className="mission-agent">
          <div className="mission-avatar">{agentIcons[selectedRoom.id]}</div>
          <div><h2>{selectedRoom.agent}</h2><p>{selectedRoom.room}</p></div>
        </div>
        <div className="mission-role">{selectedRoom.role}</div>
        <div className="mission-card">
          <small>CURRENT QUEST</small>
          <strong>{selectedRoom.task}</strong>
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
        <button
          className="enter-room-button"
          type="button"
          disabled={!canRunSelected}
          onClick={() => selectedCreature && void hunt(selectedCreature)}
        >
          {selectedState === 'hunting' ? 'HUNTING…' : selectedCreature ? `RELEASE ${selectedRoom.agent.toUpperCase()}` : 'PATCH WORKSPACE'}
          <span>▶</span>
        </button>
      </aside>

      <div className="system-messages" aria-live="polite">
        {connection === 'online' && !apiKeyConfigured && (
          <div className="configuration-warning pixel-panel" role="alert">ADD <code>OPENAI_API_KEY</code> TO <code>backend/.env</code></div>
        )}
        {error && <div className="runtime-error pixel-panel" role="alert">{error}</div>}
      </div>

      <section className="alert-stack" aria-label="Agent alerts" aria-live="polite">
        {alerts.map((alert) => (
          <article className="alert-card pixel-panel" key={alert.id}>
            <header><b>{alert.creature}</b><span>{alert.impact}</span></header>
            <h2>{alert.headline}</h2>
            <p>{alert.details}</p>
            <strong>{alert.recommendation}</strong>
            <footer>
              <button type="button" onClick={() => dismissAlert(alert.id)}>DISMISS</button>
              <button type="button" onClick={() => void refine(alert.creature)}>DIG DEEPER</button>
            </footer>
          </article>
        ))}
      </section>

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
              <label>MISSION<textarea value={spawnInstructions} onChange={(event) => setSpawnInstructions(event.target.value)} /></label>
              <label>STARTING DATA (JSON)<textarea value={spawnData} onChange={(event) => setSpawnData(event.target.value)} /></label>
              {spawnError && <p className="form-error" role="alert">{spawnError}</p>}
              <div className="modal-actions">
                <button type="button" onClick={() => setShowSpawn(false)}>CANCEL</button>
                <button type="submit" disabled={!apiKeyConfigured || connection !== 'online'}>BUILD &amp; HUNT</button>
              </div>
            </form>
          </section>
        </div>
      )}

      <footer className="command-hud pixel-panel">
        <div className="founder-avatar">S</div>
        <button className="command-input" type="button" onClick={() => setShowSpawn(true)}><span>Give the party a new quest...</span><kbd>⌘K</kbd></button>
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
