import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import City from './components/City'
import './App.css'

function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AUTONOMOUS OPERATIONS NETWORK</p>
          <h1>AGENCITY</h1>
        </div>
        <div className="connection-status">
          <span className="status-dot" />
          SCAFFOLD ONLINE
        </div>
      </header>

      <section className="city-panel" aria-label="Agencity 3D scene">
        <Canvas camera={{ position: [13, 11, 15], fov: 42 }} dpr={[1, 2]}>
          <City />
          <EffectComposer>
            <Bloom intensity={0.55} luminanceThreshold={0.2} mipmapBlur />
          </EffectComposer>
        </Canvas>
        <div className="scene-caption">
          <span>SECTOR 01</span>
          <strong>THE FOUNDERS' DISTRICT</strong>
          <small>Drag to orbit · Scroll to zoom</small>
        </div>
      </section>

      <footer className="statusbar">
        <span><b>05</b> PLOTS</span>
        <span><b>04</b> CREATURES</span>
        <span className="statusbar-message">Awaiting creature manager connection</span>
      </footer>
    </main>
  )
}

export default App
