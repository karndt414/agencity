import { SUPPORT_ACTIONS, getOfficeHeight, type AgentKind, type RoomData, type RoomMember } from '../data/rooms'
import { type CSSProperties } from 'react'
import { petForMember } from '../data/pets'
import type { CreatureState, OfficeActivity, OfficeCollaboration } from '../hooks/useAgencity'

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

const characterStatus: Record<CreatureState, string> = {
  idle: 'LIVE',
  hunting: 'WORKING',
  found: 'DONE',
  error: 'ERROR',
}

function OfficeActor({
  member,
  memberIndex,
  roomKind,
  roomIndex,
  officeRows,
  agentState,
  runtimeAvailable,
  supporting,
  activity,
  collaboration,
}: {
  member: RoomMember
  memberIndex: number
  roomKind: AgentKind
  roomIndex: number
  officeRows: number
  agentState?: CreatureState
  runtimeAvailable: boolean
  supporting: boolean
  activity?: OfficeActivity
  collaboration: OfficeCollaboration | null
}) {
  const pet = petForMember(member, memberIndex, roomKind)
  const creatureKey = member.backendCreature ?? member.id
  const isParticipant = collaboration?.participants.includes(creatureKey) ?? false
  const goingToMeeting = isParticipant && collaboration?.phase !== 'returning'
  const isMoving = isParticipant && collaboration?.phase !== 'meeting'
  const [gridRow, gridColumn] = roomGridCoordinates(roomIndex)
  const roomWidth = 100 / 3
  const roomHeight = 100 / officeRows
  const workstationColumn = memberIndex % 3
  const workstationRow = Math.floor(memberIndex / 3)
  const homeX = (gridColumn - 1) * roomWidth + ((workstationColumn + 0.5) / 3) * roomWidth
  const homeY = (gridRow - 1) * roomHeight + Math.min(0.78, 0.64 + workstationRow * 0.15) * roomHeight
  const meetingSeats = [
    [-5.2, -2.4], [0, -3.2], [5.2, -2.4], [-5.2, 3.2], [0, 4], [5.2, 3.2],
  ] as const
  const participantIndex = Math.max(0, collaboration?.participants.indexOf(creatureKey) ?? 0)
  const [meetingOffsetX, meetingOffsetY] = meetingSeats[participantIndex % meetingSeats.length]
  const meetingX = 50 + meetingOffsetX
  const meetingY = (1.5 / officeRows) * 100 + meetingOffsetY
  const targetX = goingToMeeting ? meetingX : homeX
  const targetY = goingToMeeting ? meetingY : homeY
  const movingRight = collaboration?.phase === 'returning' ? homeX >= meetingX : meetingX >= homeX

  let spriteRow = 0
  let frameCount = 6
  let motion = 'idle'
  if (isMoving) {
    spriteRow = movingRight ? 1 : 2
    frameCount = 8
    motion = 'walking'
  } else if (isParticipant) {
    spriteRow = 8
    motion = 'meeting'
  } else if (supporting || agentState === 'hunting' || activity?.mode === 'working') {
    spriteRow = 7
    motion = 'working'
  } else if (agentState === 'error' || activity?.mode === 'error') {
    spriteRow = 5
    frameCount = 8
    motion = 'error'
  } else if (agentState === 'found' || activity?.mode === 'celebrating') {
    spriteRow = 3
    frameCount = 4
    motion = 'celebrating'
  } else if (!runtimeAvailable && member.backendCreature) {
    spriteRow = 6
    motion = 'waiting'
  }

  const runtimeLabel = runtimeAvailable
    ? characterStatus[agentState ?? 'idle']
    : supporting
      ? SUPPORT_ACTIONS[member.kind]
      : member.backendCreature
      ? 'OFFLINE'
      : 'ROSTER'
  const runtimeClass = agentState ?? (supporting ? 'supporting' : runtimeAvailable ? 'idle' : 'local')
  const bubble = isMoving
    ? collaboration?.phase === 'returning' ? 'Back to my desk!' : 'On my way to the council!'
    : supporting
      ? `${SUPPORT_ACTIONS[member.kind].toLowerCase()} with the PM…`
      : activity?.message
  const style = {
    left: `${targetX}%`,
    top: `${targetY}%`,
    '--sprite-image': `url("${pet.src}")`,
    '--sprite-rows': pet.rows,
    '--sprite-row': `${(spriteRow / (pet.rows - 1)) * 100}%`,
    '--actor-delay': `${-(memberIndex % 6) * 0.11}s`,
  } as CSSProperties

  return (
    <div
      className={`office-actor actor-${member.kind} actor-${motion} frames-${frameCount} ${member.level === 'pm' ? 'is-pm' : 'is-subagent'} runtime-${runtimeClass}`}
      style={style}
      title={`${member.name} · ${member.role} · ${runtimeLabel} · ${pet.label}`}
      aria-hidden="true"
    >
      {bubble && <span className="agent-bubble">{bubble}</span>}
      <span className="pet-sprite" />
      <span className="actor-name">{member.name}<b>{member.level === 'pm' ? 'PM' : 'SUB'}</b></span>
      <span className={`actor-runtime ${runtimeAvailable ? 'is-live' : supporting ? 'is-supporting' : 'is-local'}`}><i />{runtimeLabel}</span>
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

function PixelWorkstation({
  member,
  index,
  agentState,
  supporting,
  atCouncil,
}: {
  member?: RoomMember
  index: number
  agentState?: CreatureState
  supporting: boolean
  atCouncil: boolean
}) {
  return (
    <span
      className={`room-workstation workstation-slot-${index + 1} runtime-${agentState ?? 'local'} ${member ? '' : 'is-vacant'} ${supporting ? 'is-supporting' : ''} ${atCouncil ? 'is-at-council' : ''}`}
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
    </span>
  )
}

function CollaborationRoom({
  active,
}: {
  active: boolean
}) {
  return (
    <div className={`office-corridor collaboration-room ${active ? 'is-active' : ''}`} aria-hidden="true">
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
      {active && <span className="council-status">COUNCIL IN SESSION</span>}
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
  agentStates,
  availableCreatures,
  councilParticipants,
  onSelect,
}: {
  room: RoomData
  index: number
  selected: boolean
  agentStates: Record<string, CreatureState>
  availableCreatures: Set<string>
  councilParticipants: Set<string>
  onSelect: () => void
}) {
  const runtimeMembers = room.members.filter((member) => (
    member.backendCreature && availableCreatures.has(member.backendCreature)
  ))
  const runtimeStates = runtimeMembers.map((member) => agentStates[member.backendCreature!])
  const roomState = runtimeStates.includes('hunting')
    ? 'hunting'
    : runtimeStates.includes('error')
      ? 'error'
      : runtimeStates.includes('found')
        ? 'found'
        : runtimeMembers.length > 0
          ? 'idle'
          : undefined
  const style = {
    '--room-accent': room.color,
    '--room-soft': room.softColor,
    '--room-dark': room.darkColor,
    '--room-index': index,
    ...roomGridPosition(index),
  } as CSSProperties

  return (
    <button
      className={`pixel-room pixel-room-${index + 1} room-${room.kind} state-${roomState ?? 'local'} ${selected ? 'is-selected' : ''}`}
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
      <span className="room-team-count" aria-hidden="true">{room.members.length || '0'} CREW · {runtimeMembers.length} LIVE</span>
      <span
        className="room-workstations"
        style={{ '--workstation-count': Math.max(1, room.members.length) } as CSSProperties}
        aria-hidden="true"
      >
        {(room.members.length ? room.members : [undefined]).map((member, memberIndex) => {
          const runtimeAvailable = Boolean(
            member?.backendCreature && availableCreatures.has(member.backendCreature),
          )
          const supporting = Boolean(
            roomState === 'hunting'
            && member?.level === 'subagent'
            && !member.backendCreature,
          )
          const atCouncil = Boolean(
            member?.backendCreature && councilParticipants.has(member.backendCreature),
          )
          return (
            <PixelWorkstation
              key={member?.id ?? 'vacant'}
              member={member}
              index={memberIndex}
              agentState={runtimeAvailable ? agentStates[member!.backendCreature!] : undefined}
              supporting={supporting}
              atCouncil={atCouncil}
            />
          )
        })}
      </span>
      <span className="room-status"><i />{roomState ? liveStatus[roomState] : room.status}</span>
      {selected && <span className="selected-corners" aria-hidden="true"><i /><i /><i /><i /></span>}
    </button>
  )
}

type PixelOfficeProps = {
  rooms: RoomData[]
  selectedRoomId: string
  agentStates?: Record<string, CreatureState>
  activities?: Record<string, OfficeActivity>
  collaboration?: OfficeCollaboration | null
  onSelectRoom: (room: RoomData) => void
  zoom: number
  availableCreatures?: string[]
  camera: { x: number; y: number }
  isPanning?: boolean
}

const RING_POSITIONS = [
  [1, 2], [2, 1], [2, 3], [3, 1], [3, 3], [1, 1], [1, 3], [3, 2],
] as const

function roomGridCoordinates(index: number): [number, number] {
  if (index < RING_POSITIONS.length) return [...RING_POSITIONS[index]]
  const overflowIndex = index - RING_POSITIONS.length
  return [4 + Math.floor(overflowIndex / 3), 1 + (overflowIndex % 3)]
}

function roomGridPosition(index: number): CSSProperties {
  const [row, column] = roomGridCoordinates(index)
  return { gridRow: row, gridColumn: column }
}

export default function PixelOffice({
  rooms,
  selectedRoomId,
  agentStates = {},
  activities = {},
  collaboration = null,
  onSelectRoom,
  zoom,
  availableCreatures = [],
  camera,
  isPanning = false,
}: PixelOfficeProps) {
  const officeHeight = getOfficeHeight(rooms.length)
  const officeRows = 3 + Math.ceil(Math.max(0, rooms.length - 8) / 3)
  const availableCreatureSet = new Set(availableCreatures)
  const councilParticipantSet = new Set(collaboration?.participants ?? [])

  const officeStyle = {
    '--office-height': `${officeHeight}px`,
    transform: `matrix(${zoom}, 0, 0, ${zoom}, ${camera.x}, ${camera.y})`,
  } as CSSProperties

  const renderRoom = (room: RoomData, index: number) => {
    return (
      <PixelRoom
        key={room.id}
        room={room}
        index={index}
        selected={selectedRoomId === room.id}
        agentStates={agentStates}
        availableCreatures={availableCreatureSet}
        councilParticipants={councilParticipantSet}
        onSelect={() => onSelectRoom(room)}
      />
    )
  }

  const actors = rooms.flatMap((room, roomIndex) => {
    const roomIsWorking = room.members.some((member) => (
      member.backendCreature
      && availableCreatureSet.has(member.backendCreature)
      && agentStates[member.backendCreature] === 'hunting'
    ))
    return room.members.map((member, memberIndex) => {
      const runtimeAvailable = Boolean(
        member.backendCreature && availableCreatureSet.has(member.backendCreature),
      )
      const supporting = Boolean(
        roomIsWorking && member.level === 'subagent' && !member.backendCreature,
      )
      const creatureKey = member.backendCreature ?? member.id
      return (
        <OfficeActor
          key={`${room.id}-${member.id}`}
          member={member}
          memberIndex={memberIndex}
          roomKind={room.kind}
          roomIndex={roomIndex}
          officeRows={officeRows}
          runtimeAvailable={runtimeAvailable}
          agentState={runtimeAvailable ? agentStates[member.backendCreature!] : undefined}
          supporting={supporting}
          activity={activities[creatureKey]}
          collaboration={collaboration}
        />
      )
    })
  })

  return (
    <section className={`pixel-office ${isPanning ? 'is-panning' : ''}`} style={officeStyle} aria-label="Interactive Agencity office floor plan">
      <div className="office-building">
        <div className="office-plan">
          <CollaborationRoom active={Boolean(collaboration)} />
          {rooms.map(renderRoom)}
          <div className="office-actors">{actors}</div>
        </div>
      </div>

      <div className="office-entry" aria-hidden="true">
        <i /><span>LOBBY</span><i />
      </div>
    </section>
  )
}
