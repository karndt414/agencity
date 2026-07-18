import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useState } from 'react'
import City from './components/City'
import { CORE_CREATURES, useAgencity } from './hooks/useAgencity'
import './App.css'

const CAMERA = { position: [13, 11, 15] as [number, number, number], fov: 42 }

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
  const [showSpawn, setShowSpawn] = useState(false)
  const [spawnName, setSpawnName] = useState('Harbor')
  const [spawnInstructions, setSpawnInstructions] = useState(
    'Hunt for scheduling conflicts, missing preparation, and meetings without clear next steps.',
  )
  const [spawnData, setSpawnData] = useState('{"meetings": []}')
  const [spawnError, setSpawnError] = useState<string | null>(null)

  const submitSpawn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const data = JSON.parse(spawnData) as Record<string, unknown>
      await spawn(spawnName, spawnInstructions, data)
      setShowSpawn(false)
      setSpawnError(null)
    } catch (cause) {
      setSpawnError(cause instanceof Error ? cause.message : 'Could not build creature')
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AUTONOMOUS OPERATIONS NETWORK</p>
          <h1>AGENCITY</h1>
        </div>
        <div className={`connection-status ${connection}`}>
          <span className="status-dot" />
          {connection === 'online' ? 'BACKEND ONLINE' : connection.toUpperCase()}
        </div>
      </header>

      <nav className="creature-controls" aria-label="Creature controls">
        <button
          type="button"
          className="release-all"
          disabled={connection !== 'online' || !apiKeyConfigured}
          onClick={() => void releaseAll()}
        >
          Release all
        </button>
        {CORE_CREATURES.map((name) => (
          <button
            type="button"
            key={name}
            disabled={states[name] === 'hunting' || connection !== 'online' || !apiKeyConfigured}
            onClick={() => void hunt(name)}
          >
            {states[name] === 'hunting' ? 'Hunting' : `Release ${name}`}
          </button>
        ))}
      </nav>

      {!apiKeyConfigured && (
        <div className="configuration-warning" role="alert">
          OpenAI key missing. Put <code>OPENAI_API_KEY=...</code> in <code>backend/.env</code>, then restart the backend.
        </div>
      )}
      {error && <div className="runtime-error" role="alert">{error}</div>}

      <section className="city-panel" aria-label="Agencity 3D scene">
        <Canvas camera={CAMERA} dpr={[1, 2]}>
          <City
            onBuild={() => setShowSpawn(true)}
            onHunt={(name) => void hunt(name)}
            states={states}
          />
          <EffectComposer>
            <Bloom intensity={0.55} luminanceThreshold={0.2} mipmapBlur />
          </EffectComposer>
        </Canvas>
        <div className="scene-caption">
          <span>SECTOR 01</span>
          <strong>THE FOUNDERS' DISTRICT</strong>
          <small>Drag to orbit · Scroll to zoom</small>
        </div>

        <aside className="activity-panel" aria-live="polite">
          {CORE_CREATURES.map((name) => (
            <div key={name} className={`activity-row ${states[name] ?? 'idle'}`}>
              <b>{name}</b>
              <span>{states[name] ?? 'idle'}</span>
              {thoughts[name] && <small>{thoughts[name]}</small>}
            </div>
          ))}
        </aside>
      </section>

      <section className="alert-stack" aria-label="Creature alerts" aria-live="polite">
        {alerts.map((alert) => (
          <article className="alert-card" key={alert.id}>
            <header><b>{alert.creature}</b><span>{alert.impact}</span></header>
            <h2>{alert.headline}</h2>
            <p>{alert.details}</p>
            <strong>{alert.recommendation}</strong>
            <footer>
              <button type="button" onClick={() => dismissAlert(alert.id)}>Dismiss</button>
              <button type="button" onClick={() => void refine(alert.creature)}>Dig deeper</button>
            </footer>
          </article>
        ))}
      </section>

      {showSpawn && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowSpawn(false)}>
          <section
            className="spawn-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="spawn-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="spawn-title">Build a creature</h2>
            <form onSubmit={(event) => void submitSpawn(event)}>
              <label>Name<input value={spawnName} onChange={(event) => setSpawnName(event.target.value)} /></label>
              <label>Instructions<textarea value={spawnInstructions} onChange={(event) => setSpawnInstructions(event.target.value)} /></label>
              <label>Hunt data (JSON)<textarea value={spawnData} onChange={(event) => setSpawnData(event.target.value)} /></label>
              {spawnError && <p className="form-error" role="alert">{spawnError}</p>}
              <div className="modal-actions">
                <button type="button" onClick={() => setShowSpawn(false)}>Cancel</button>
                <button type="submit" disabled={!apiKeyConfigured}>Build &amp; hunt</button>
              </div>
            </form>
          </section>
        </div>
      )}

      <footer className="statusbar">
        <span><b>05</b> PLOTS</span>
        <span><b>{String(creatures.length).padStart(2, '0')}</b> CREATURES</span>
        <span className="statusbar-message">
          {connection === 'online' ? 'Creature manager connected' : 'Waiting for creature manager'}
        </span>
      </footer>
    </main>
  )
}

export default App
