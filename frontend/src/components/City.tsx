import { Float, OrbitControls, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { MathUtils } from 'three'
import type { Group, Mesh } from 'three'
import type { CreatureState } from '../hooks/useAgencity'

type Plot = {
  name: string
  role: string
  color: string
  position: [number, number, number]
  height: number
}

const plots: Plot[] = [
  { name: 'PYRE', role: 'BURN TOWER', color: '#ff6b2c', position: [-6, 0, -2], height: 4.8 },
  { name: 'FETCH', role: 'HOUND DEN', color: '#32c7ff', position: [-2, 0, 2.5], height: 2.7 },
  { name: 'SIGHT', role: 'WATCH TOWER', color: '#67e69b', position: [2.4, 0, 2.2], height: 4.4 },
  { name: 'LODE', role: 'TALENT FORGE', color: '#ffd166', position: [6, 0, -1.8], height: 3.3 },
]

type BuildingProps = {
  onActivate: (name: string) => void
  plot: Plot
  state: CreatureState
}

function Building({ onActivate, plot, state }: BuildingProps) {
  const group = useRef<Group>(null)
  const beacon = useRef<Mesh>(null)

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime()
    if (group.current) {
      group.current.rotation.y = Math.sin(time * 0.35 + plot.position[0]) * 0.025
      const targetScale = state === 'hunting' ? 1.08 : state === 'found' ? 1.14 : 1
      const scale = MathUtils.lerp(group.current.scale.x, targetScale, 0.08)
      group.current.scale.setScalar(scale)
    }
    if (beacon.current) {
      const speed = state === 'hunting' ? 7 : 2.4
      beacon.current.scale.y = 0.82 + Math.sin(time * speed + plot.position[2]) * 0.12
    }
  })

  const intensity = state === 'hunting' ? 1.2 : state === 'found' ? 2 : state === 'error' ? 0.1 : 0.3

  return (
    <group
      ref={group}
      position={plot.position}
      onClick={(event) => {
        event.stopPropagation()
        onActivate(plot.name.toLowerCase())
      }}
      onPointerEnter={() => { document.body.style.cursor = 'pointer' }}
      onPointerLeave={() => { document.body.style.cursor = 'default' }}
    >
      <mesh position={[0, 0.18, 0]} receiveShadow>
        <boxGeometry args={[3.1, 0.36, 3.1]} />
        <meshStandardMaterial color="#071d29" emissive={plot.color} emissiveIntensity={0.12} />
      </mesh>
      <mesh position={[0, plot.height / 2 + 0.35, 0]} castShadow>
        <boxGeometry args={[2.15, plot.height, 2.15]} />
        <meshStandardMaterial
          color="#102332"
          emissive={plot.color}
          emissiveIntensity={intensity}
          metalness={0.45}
          roughness={0.45}
        />
      </mesh>
      <mesh ref={beacon} position={[0, plot.height + 0.6, 0]}>
        <boxGeometry args={[1.3, 0.12, 1.3]} />
        <meshBasicMaterial color={plot.color} />
      </mesh>
      <Float speed={1.2} rotationIntensity={0.08} floatIntensity={0.18}>
        <Text
          position={[0, plot.height + 1.15, 0]}
          color={plot.color}
          fontSize={0.42}
          anchorX="center"
          anchorY="middle"
          outlineColor="#03070d"
          outlineWidth={0.035}
        >
          {plot.name}
        </Text>
      </Float>
      <Text
        position={[0, 0.45, 1.11]}
        color="#9eb7c4"
        fontSize={0.2}
        anchorX="center"
        anchorY="middle"
        rotation={[-Math.PI / 2, 0, 0]}
      >
        {plot.role}
      </Text>
    </group>
  )
}

function EmptyPlot({ onBuild }: { onBuild: () => void }) {
  return (
    <group
      position={[0, 0, -3.4]}
      onClick={(event) => {
        event.stopPropagation()
        onBuild()
      }}
      onPointerEnter={() => { document.body.style.cursor = 'pointer' }}
      onPointerLeave={() => { document.body.style.cursor = 'default' }}
    >
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[3.1, 0.32, 3.1]} />
        <meshStandardMaterial color="#11291f" emissive="#4ac77d" emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[0, 1.45, 0]}>
        <boxGeometry args={[2.3, 2.3, 2.3]} />
        <meshBasicMaterial color="#4ac77d" transparent opacity={0.3} wireframe />
      </mesh>
      <Float speed={1.5} floatIntensity={0.3}>
        <Text
          position={[0, 2.85, 0]}
          color="#71df9c"
          fontSize={0.42}
          anchorX="center"
          anchorY="middle"
        >
          BUILD
        </Text>
      </Float>
      <Text
        position={[0, 0.43, 1.11]}
        color="#80a992"
        fontSize={0.2}
        anchorX="center"
        anchorY="middle"
        rotation={[-Math.PI / 2, 0, 0]}
      >
        EMPTY PLOT
      </Text>
    </group>
  )
}

type CityProps = {
  onBuild: () => void
  onHunt: (name: string) => void
  states: Record<string, CreatureState>
}

export default function City({ onBuild, onHunt, states }: CityProps) {
  return (
    <>
      <color attach="background" args={['#03070d']} />
      <fog attach="fog" args={['#03070d', 14, 34]} />
      <ambientLight intensity={0.42} color="#8eb7cf" />
      <hemisphereLight args={['#18354a', '#02070b', 0.7]} />
      <directionalLight position={[5, 12, 8]} intensity={1.4} color="#b8ddff" castShadow />
      <pointLight position={[0, 4, 0]} intensity={4} distance={14} color="#166589" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[34, 34]} />
        <meshStandardMaterial color="#04111b" roughness={0.9} metalness={0.15} />
      </mesh>
      <gridHelper args={[34, 34, '#25516a', '#0b2432']} position={[0, 0.02, 0]} />

      {plots.map((plot) => (
        <Building
          key={plot.name}
          onActivate={onHunt}
          plot={plot}
          state={states[plot.name.toLowerCase()] ?? 'idle'}
        />
      ))}
      <EmptyPlot onBuild={onBuild} />
      <OrbitControls enablePan={false} minDistance={9} maxDistance={25} maxPolarAngle={Math.PI / 2.05} />
    </>
  )
}
