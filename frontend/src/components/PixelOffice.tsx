import type { CSSProperties } from 'react'
import type { AgentKind, RoomData } from '../data/rooms'
import type { CreatureState } from '../hooks/useAgencity'

const gadgetLabel: Record<AgentKind, string> = {
  finance: 'BURN',
  growth: 'LEADS',
  research: 'INTEL',
  talent: 'CREW',
  coder: 'BUILD',
}

const liveStatus: Record<CreatureState, string> = {
  idle: 'Ready to hunt',
  hunting: 'Hunting signals',
  found: 'Opportunity found',
  error: 'Needs attention',
}

function PixelCharacter({ room }: { room: RoomData }) {
  return (
    <div className={`pixel-character character-${room.kind}`} aria-hidden="true">
      <span className="character-shadow" />
      <span className="character-legs"><i /><i /></span>
      <span className="character-body"><i className="character-badge" /></span>
      <span className="character-head">
        <i className="character-ear ear-left" />
        <i className="character-ear ear-right" />
        <i className="character-hair" />
        <i className="character-eye eye-left" />
        <i className="character-eye eye-right" />
        <i className="character-nose" />
        <i className="character-glasses" />
        <i className="character-headset" />
      </span>
      <span className="character-tool" />
    </div>
  )
}

function PixelPlant({ className = '' }: { className?: string }) {
  return (
    <span className={`pixel-plant ${className}`} aria-hidden="true">
      <i /><i /><i /><b />
    </span>
  )
}

function PixelRoom({
  room,
  index,
  selected,
  agentState,
  onSelect,
}: {
  room: RoomData
  index: number
  selected: boolean
  agentState?: CreatureState
  onSelect: () => void
}) {
  const style = {
    '--room-accent': room.color,
    '--room-soft': room.softColor,
    '--room-dark': room.darkColor,
    '--room-index': index,
  } as CSSProperties

  return (
    <button
      className={`pixel-room pixel-room-${index + 1} room-${room.kind} state-${agentState ?? 'local'} ${selected ? 'is-selected' : ''}`}
      style={style}
      onClick={onSelect}
      type="button"
      aria-label={`Open ${room.room} with ${room.agent}`}
      aria-pressed={selected}
    >
      <span className="room-sunbeam" aria-hidden="true" />
      <span className="room-window" aria-hidden="true"><i /><i /><b /></span>
      <span className="room-plaque"><i />{room.room}<small>{room.agent}</small></span>
      <span className="room-rug" aria-hidden="true"><i /></span>
      <span className="room-shelf" aria-hidden="true">
        <i /><i /><i /><i /><b /><b />
      </span>
      <span className="room-desk" aria-hidden="true">
        <i className="desk-screen"><b /><b /><b /></i>
        <i className="desk-keyboard" />
        <i className="desk-leg desk-leg-left" />
        <i className="desk-leg desk-leg-right" />
      </span>
      <span className="room-chair" aria-hidden="true"><i /></span>
      <span className="room-gadget" aria-hidden="true">
        <small>{gadgetLabel[room.kind]}</small><i /><i /><i />
      </span>
      <PixelPlant className="room-plant" />
      <PixelCharacter room={room} />
      <span className="room-status"><i />{agentState ? liveStatus[agentState] : room.status}</span>
      {selected && <span className="selected-corners" aria-hidden="true"><i /><i /><i /><i /></span>}
    </button>
  )
}

type PixelOfficeProps = {
  rooms: RoomData[]
  selectedRoomId: string
  agentStates?: Record<string, CreatureState>
  onSelectRoom: (room: RoomData) => void
}

export default function PixelOffice({ rooms, selectedRoomId, agentStates = {}, onSelectRoom }: PixelOfficeProps) {
  return (
    <section className="pixel-office" aria-label="Interactive Agencity office floor plan">
      <div className="office-roof-sign" aria-hidden="true">
        <span>AGENCITY</span><small>FOUNDERS' FLOOR</small>
      </div>

      <div className="office-building">
        <div className="office-plan">
          {rooms.map((room, index) => (
            <PixelRoom
              key={room.id}
              room={room}
              index={index}
              selected={selectedRoomId === room.id}
              agentState={agentStates[room.id]}
              onSelect={() => onSelectRoom(room)}
            />
          ))}

          <div className="office-corridor" aria-hidden="true">
            <div className="corridor-runner"><i /><i /><i /><i /><i /></div>
            <span className="corridor-label">FOUNDERS' HALL</span>
            <PixelPlant className="corridor-plant plant-left" />
            <PixelPlant className="corridor-plant plant-right" />
            <span className="water-cooler"><i /><b /></span>
          </div>
        </div>
      </div>

      <div className="office-entry" aria-hidden="true">
        <i /><span>LOBBY</span><i />
      </div>
    </section>
  )
}
