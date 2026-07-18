import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { getOfficeHeight, type AgentKind, type RoomData, type RoomMember } from '../data/rooms'
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

function PixelCharacter({ member, index }: { member: RoomMember; index: number }) {
  return (
    <div
      className={`pixel-character character-${member.kind} ${member.level === 'pm' ? 'is-pm' : 'is-subagent'} character-slot-${index + 1}`}
      title={`${member.name} · ${member.role}`}
      aria-hidden="true"
    >
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
      <span className="character-name">{member.name}<b>{member.level === 'pm' ? 'PM' : 'SUB'}</b></span>
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

function PixelWorkstation({ member, index }: { member?: RoomMember; index: number }) {
  return (
    <span
      className={`room-workstation workstation-slot-${index + 1} ${member ? '' : 'is-vacant'}`}
      data-desk-owner={member?.name ?? 'Vacant'}
      aria-hidden="true"
    >
      <span className="room-desk">
        <i className="desk-screen"><b /><b /><b /></i>
        <i className="desk-keyboard" />
        <i className="desk-leg desk-leg-left" />
        <i className="desk-leg desk-leg-right" />
        <small>{member?.name ?? 'VACANT'}</small>
      </span>
      <span className="room-chair"><i /></span>
      {member && <PixelCharacter member={member} index={index} />}
    </span>
  )
}

function CollaborationRoom() {
  return (
    <div className="office-corridor collaboration-room" aria-hidden="true">
      <div className="meeting-whiteboard">
        <small>FOUNDER SYNC</small>
        <i /><i /><i />
        <b>SHIP • LEARN • GROW</b>
      </div>
      <div className="meeting-table">
        <span className="meeting-chair chair-north-1" /><span className="meeting-chair chair-north-2" />
        <span className="meeting-chair chair-south-1" /><span className="meeting-chair chair-south-2" />
        <span className="meeting-chair chair-west" /><span className="meeting-chair chair-east" />
        <i className="meeting-laptop"><b /><b /></i>
        <i className="meeting-notes" />
        <i className="meeting-coffee" />
      </div>
      <span className="corridor-label">COLLABORATION HUB<small>CROSS-AGENT MEETING ROOM</small></span>
      <PixelPlant className="corridor-plant plant-left" />
      <PixelPlant className="corridor-plant plant-right" />
      <span className="water-cooler"><i /><b /></span>
    </div>
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
      data-room-id={room.id}
    >
      <span className="room-sunbeam" aria-hidden="true" />
      <span className="room-window" aria-hidden="true"><i /><i /><b /></span>
      <span className="room-plaque"><i />{room.room}<small>{room.agent}</small></span>
      <span className="room-rug" aria-hidden="true"><i /></span>
      <span className="room-shelf" aria-hidden="true">
        <i /><i /><i /><i /><b /><b />
      </span>
      <span className="room-gadget" aria-hidden="true">
        <small>{gadgetLabel[room.kind]}</small><i /><i /><i />
      </span>
      <PixelPlant className="room-plant" />
      <span className="room-team-count" aria-hidden="true">{room.members.length || '0'} CREW</span>
      <span
        className="room-workstations"
        style={{ '--workstation-count': Math.max(1, room.members.length) } as CSSProperties}
        aria-hidden="true"
      >
        {(room.members.length ? room.members : [undefined]).map((member, memberIndex) => (
          <PixelWorkstation key={member?.id ?? 'vacant'} member={member} index={memberIndex} />
        ))}
      </span>
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
  zoom: number
  focusedRoomId?: string | null
  pan?: { x: number; y: number }
}

export default function PixelOffice({
  rooms,
  selectedRoomId,
  agentStates = {},
  onSelectRoom,
  zoom,
  focusedRoomId = null,
  pan = { x: 0, y: 0 },
}: PixelOfficeProps) {
  const officeRef = useRef<HTMLElement>(null)
  const [camera, setCamera] = useState({ x: 0, y: 0 })
  const firstFloorBreak = Math.min(3, Math.ceil(rooms.length / 2))
  const officeHeight = getOfficeHeight(rooms.length)

  useLayoutEffect(() => {
    const updateCamera = () => {
      const office = officeRef.current
      if (!office || zoom === 1) {
        setCamera({ x: 0, y: 0 })
        return
      }


      const viewport = office.parentElement
      const cameraCenterX = viewport ? viewport.clientWidth / 2 - office.offsetLeft : office.clientWidth / 2
      const cameraCenterY = viewport ? viewport.clientHeight / 2 - office.offsetTop : office.clientHeight / 2

      if (!focusedRoomId) {
        setCamera({
          x: cameraCenterX - office.clientWidth * zoom / 2,
          y: cameraCenterY - office.clientHeight * zoom / 2,
        })
        return
      }

      const room = office.querySelector<HTMLElement>(`[data-room-id="${focusedRoomId}"]`)
      if (!room) return

      let x = room.offsetWidth / 2
      let y = room.offsetHeight / 2
      let node: HTMLElement | null = room
      while (node && node !== office) {
        x += node.offsetLeft
        y += node.offsetTop
        node = node.offsetParent as HTMLElement | null
      }

      setCamera({
        x: cameraCenterX - x * zoom,
        y: cameraCenterY - y * zoom,
      })
    }

    updateCamera()
    window.addEventListener('resize', updateCamera)
    return () => window.removeEventListener('resize', updateCamera)
  }, [focusedRoomId, rooms.length, zoom])

  const officeStyle = {
    '--office-height': `${officeHeight}px`,
    transform: `matrix(${zoom}, 0, 0, ${zoom}, ${camera.x + pan.x}, ${camera.y + pan.y})`,
  } as CSSProperties

  const renderRoom = (room: RoomData, index: number) => {
    const leadCreature = room.members.find((member) => member.level === 'pm')?.backendCreature
    return (
      <PixelRoom
        key={room.id}
        room={room}
        index={index}
        selected={selectedRoomId === room.id}
        agentState={agentStates[leadCreature ?? room.id]}
        onSelect={() => onSelectRoom(room)}
      />
    )
  }

  return (
    <section ref={officeRef} className="pixel-office" style={officeStyle} aria-label="Interactive Agencity office floor plan">
      <div className="office-roof-sign" aria-hidden="true">
        <span>AGENCITY</span><small>FOUNDERS' FLOOR</small>
      </div>

      <div className="office-building">
        <div className="office-plan">
          {rooms.slice(0, firstFloorBreak).map(renderRoom)}

          <CollaborationRoom />

          {rooms.slice(firstFloorBreak).map((room, index) => renderRoom(room, firstFloorBreak + index))}
        </div>
      </div>

      <div className="office-entry" aria-hidden="true">
        <i /><span>LOBBY</span><i />
      </div>
    </section>
  )
}
