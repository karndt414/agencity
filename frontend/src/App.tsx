import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from 'react'
import PixelOffice from './components/PixelOffice'
import {
  ROOMS,
  ROOM_PALETTES,
  SUPPORT_ACTIONS,
  getOfficeHeight,
  type AgentKind,
  type RoomData,
  type RoomMember,
} from './data/rooms'
import { CORE_CREATURES, useAgencity, type CreatureAlert, type CreatureState } from './hooks/useAgencity'
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
    collaboration,
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
    usage,
  } = useAgencity()
  const [rooms, setRooms] = useState<RoomData[]>(initialRooms)
  const [selectedRoomId, setSelectedRoomId] = useState('patch')
  const [zoom, setZoom] = useState(1)
  const [camera, setCamera] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const commandInputRef = useRef<HTMLInputElement>(null)
  const panRef = useRef<{ pointerId: number; x: number; y: number; cameraX: number; cameraY: number; moved: boolean } | null>(null)
  const suppressRoomClickRef = useRef(false)
  const [showAddRoom, setShowAddRoom] = useState(false)
  const [roomName, setRoomName] = useState('Strategy Studio')
  const [roomPurpose, setRoomPurpose] = useState('Turn founder priorities into clear weekly plans.')
  const [roomKind, setRoomKind] = useState<AgentKind>('research')
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
  const [refineTarget, setRefineTarget] = useState<CreatureAlert | null>(null)
  const [refinePrompt, setRefinePrompt] = useState('')
  const [refineError, setRefineError] = useState<string | null>(null)
  const [refinePending, setRefinePending] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: 'room' | 'member'
    roomId: string
    memberId?: string
    label: string
  } | null>(null)

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? rooms[0],
    [rooms, selectedRoomId],
  )
  const selectedLead = selectedRoom.members.find((member) => member.level === 'pm')
  const selectedLeadCreature = selectedLead?.backendCreature
  const selectedCreature = selectedLeadCreature && creatures.includes(selectedLeadCreature)
    ? selectedLeadCreature
    : (
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
  const selectedQuest = lastQuest && (
    lastQuest.target === 'all' || lastQuest.target === selectedRoom.id
  ) ? lastQuest.text : selectedRoom.task
  const selectedWorkingMember = selectedRoom.members.find((member) => (
    member.backendCreature && creatures.includes(member.backendCreature) && states[member.backendCreature] === 'hunting'
  ))
  const selectedRoomIsWorking = Boolean(selectedWorkingMember)
  const selectedSupportingMembers = selectedRoomIsWorking
    ? selectedRoom.members.filter((member) => member.level === 'subagent' && !member.backendCreature)
    : []

  const roomStyle = {
    '--room-color': selectedRoom.color,
    '--room-soft': selectedRoom.softColor,
    '--room-dark': selectedRoom.darkColor,
    '--room-progress': `${selectedProgress}%`,
  } as CSSProperties

  const totalAgents = rooms.reduce((sum, room) => sum + room.members.length, 0)

  const handleSelectRoom = (room: RoomData) => {
    setSelectedRoomId(room.id)
    setQuestTarget(room.id)
  }
  const handleFocusRoom = (room: RoomData) => {
    handleSelectRoom(room)
    const nextZoom = Math.max(1.15, zoom)
    setZoom(nextZoom)
    window.requestAnimationFrame(() => {
      const viewport = viewportRef.current
      const office = viewport?.querySelector<HTMLElement>('.pixel-office')
      const roomElement = office?.querySelector<HTMLElement>(`[data-room-id="${room.id}"]`)
      if (!viewport || !office || !roomElement) return
      let centerX = roomElement.offsetWidth / 2
      let centerY = roomElement.offsetHeight / 2
      let node: HTMLElement | null = roomElement
      while (node && node !== office) {
        centerX += node.offsetLeft
        centerY += node.offsetTop
        node = node.offsetParent as HTMLElement | null
      }
      setCamera({
        x: viewport.clientWidth / 2 - centerX * nextZoom,
        y: viewport.clientHeight / 2 - centerY * nextZoom,
      })
    })
  }

  const openRecruiter = (roomId = selectedRoomId) => {
    setSpawnRoomId(roomId)
    setShowSpawn(true)
    setSpawnError(null)
  }

  const fitOffice = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const officeHeight = getOfficeHeight(rooms.length)
    const officeWidth = 1180
    const nextZoom = Math.min(1, Math.max(0.45,
      Math.min((viewport.clientHeight - 20) / officeHeight, (viewport.clientWidth - 20) / officeWidth),
    ))
    setZoom(nextZoom)
    setCamera({
      x: (viewport.clientWidth - officeWidth * nextZoom) / 2,
      y: (viewport.clientHeight - officeHeight * nextZoom) / 2,
    })
  }, [rooms.length])

  const zoomAt = (nextZoom: number, clientX?: number, clientY?: number) => {
    const viewport = viewportRef.current
    if (!viewport) return
    const bounds = viewport.getBoundingClientRect()
    const anchorX = (clientX ?? bounds.left + bounds.width / 2) - bounds.left
    const anchorY = (clientY ?? bounds.top + bounds.height / 2) - bounds.top
    const clamped = Math.min(2.25, Math.max(0.45, nextZoom))
    setCamera((current) => ({
      x: anchorX - ((anchorX - current.x) / zoom) * clamped,
      y: anchorY - ((anchorY - current.y) / zoom) * clamped,
    }))
    setZoom(clamped)
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    zoomAt(zoom * Math.exp(-event.deltaY * 0.0012), event.clientX, event.clientY)
  }

  const handlePanStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y, moved: false }
    setIsPanning(true)
  }

  const handlePanMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = panRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) drag.moved = true
    setCamera({ x: drag.cameraX + event.clientX - drag.x, y: drag.cameraY + event.clientY - drag.y })
  }

  const handlePanEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return
    const moved = panRef.current.moved
    panRef.current = null
    setIsPanning(false)
    if (moved) {
      suppressRoomClickRef.current = true
      window.setTimeout(() => { suppressRoomClickRef.current = false }, 0)
    }
  }

  useEffect(() => {
    window.localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify(rooms))
  }, [rooms])

  useEffect(() => {
    const openQuestComposer = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        commandInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', openQuestComposer)
    return () => window.removeEventListener('keydown', openQuestComposer)
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(fitOffice)
    const handleResize = () => fitOffice()
    window.addEventListener('resize', handleResize)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleResize)
    }
  // Fit changes when the building gains or loses a floor.
  }, [fitOffice])

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
      const targetRoom = rooms.find((room) => room.id === questTarget)
      const targetLead = targetRoom?.members.find((member) => member.level === 'pm')
      const backendTarget = questTarget === 'all'
        ? 'all'
        : targetLead?.backendCreature ?? (creatures.includes(questTarget) ? questTarget : null)
      if (!backendTarget) throw new Error('This department needs a PM connected to the backend before it can receive quests.')
      await giveQuest(cleanQuest, backendTarget)
      setQuestText('')
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
    setQuestTarget(id)
    setShowAddRoom(false)
    window.requestAnimationFrame(() => handleFocusRoom(room))
  }

  const openRefineComposer = (alert: CreatureAlert) => {
    setRefineTarget(alert)
    setRefinePrompt('')
    setRefineError(null)
  }

  const closeRefineComposer = () => {
    setRefineTarget(null)
    setRefinePrompt('')
    setRefineError(null)
  }

  const submitRefine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!refineTarget) return

    const cleanPrompt = refinePrompt.trim()
    if (!cleanPrompt) {
      setRefineError('Tell the agent what you want it to investigate further.')
      return
    }

    setRefinePending(true)
    setRefineError(null)
    try {
      await refine(refineTarget.creature, cleanPrompt)
      setRefineTarget(null)
      setRefinePrompt('')
    } catch (cause) {
      setRefineError(cause instanceof Error ? cause.message : 'Could not dig deeper')
    } finally {
      setRefinePending(false)
    }
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    if (deleteTarget.kind === 'room') {
      if (rooms.length <= 1) {
        setQuestError('Agencity needs at least one department.')
        setDeleteTarget(null)
        return
      }
      const remaining = rooms.filter((room) => room.id !== deleteTarget.roomId)
      setRooms(remaining)
      if (selectedRoomId === deleteTarget.roomId) {
        setSelectedRoomId(remaining[0].id)
        setQuestTarget(remaining[0].id)
      }
    } else {
      setRooms((current) => current.map((room) => {
        if (room.id !== deleteTarget.roomId) return room
        const members = room.members.filter((member) => member.id !== deleteTarget.memberId)
        const lead = members.find((member) => member.level === 'pm')
        return {
          ...room,
          members,
          agent: lead?.name ?? 'Open PM seat',
          role: lead?.role ?? `${room.kind} workspace`,
        }
      }))
    }
    setDeleteTarget(null)
  }

  return (
    <main className="game-shell" style={roomStyle}>
      <div className="world-pixels" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <div
        ref={viewportRef}
        className={`office-viewport ${isPanning ? 'is-panning' : ''}`}
        onWheel={handleWheel}
        onPointerDown={handlePanStart}
        onPointerMove={handlePanMove}
        onPointerUp={handlePanEnd}
        onPointerCancel={handlePanEnd}
      >
        <PixelOffice
          rooms={rooms}
          selectedRoomId={selectedRoomId}
          agentStates={states}
          onSelectRoom={(room) => {
            if (!suppressRoomClickRef.current) handleFocusRoom(room)
          }}
          zoom={zoom}
          availableCreatures={creatures}
          camera={camera}
          isPanning={isPanning}
          collaboration={collaboration}
        />
      </div>

      <div className="zoom-hud pixel-panel" aria-label="Office zoom controls">
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(zoom - 0.2)}>−</button>
        <button className="zoom-readout" type="button" onClick={() => zoomAt(1)}>{Math.round(zoom * 100)}%</button>
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(zoom + 0.2)}>+</button>
        <button className="zoom-fit" type="button" onClick={fitOffice}>FIT</button>
        <span className="pan-hint">DRAG TO PAN · SCROLL TO ZOOM</span>
      </div>

      <header className="game-topbar">
        <div className="top-logo">
          <img src={agencityGreenLogo} alt="Agencity" />
        </div>

        <div className="resource-hud pixel-panel" aria-label="Company resources">
          <div><small>ROOMS</small><strong>{String(rooms.length).padStart(2, '0')}</strong></div>
          <div><small>AGENTS</small><strong>{String(totalAgents).padStart(2, '0')}</strong></div>
          <div title={`${usage.inputTokens.toLocaleString()} input · ${usage.outputTokens.toLocaleString()} output`}><small>TOKENS</small><strong>{usage.totalTokens >= 1000 ? `${(usage.totalTokens / 1000).toFixed(1)}K` : usage.totalTokens}</strong></div>
          <div title={usage.model ? `${usage.model} standard token pricing${usage.cachedInputTokens ? ` · ${usage.cachedInputTokens.toLocaleString()} cached` : ''}` : 'No API runs yet'}><small>EST. SPEND</small><strong>{usage.pricingAvailable ? `$${usage.estimatedCostUsd.toFixed(3)}` : 'N/A'}</strong></div>
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
              onClick={() => handleFocusRoom(room)}
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
          <div className="mission-actions"><b>{selectedState ? selectedState.toUpperCase() : 'LOCAL'}</b><button type="button" aria-label={`Delete ${selectedRoom.room}`} onClick={() => setDeleteTarget({ kind: 'room', roomId: selectedRoom.id, label: selectedRoom.room })}>DELETE</button></div>
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
          <div className={selectedSupportingMembers.length > 0 ? 'is-supporting' : ''}>
            <span>{selectedSupportingMembers.length > 0 ? '↯' : '✓'}</span>
            <p>
              <strong>{selectedSupportingMembers.length > 0 ? `${selectedSupportingMembers.length} SUBAGENTS SUPPORTING` : 'TEAM READY'}</strong>
              <small>{selectedSupportingMembers.length > 0 ? selectedSupportingMembers.map((member) => SUPPORT_ACTIONS[member.kind]).join(' · ') : 'Workspace ready'}</small>
            </p>
          </div>
          <div><span>↗</span><p><strong>{selectedWorkingMember ? `${selectedWorkingMember.name.toUpperCase()} IS WORKING` : 'AGENT THOUGHT'}</strong><small>{thoughts[selectedWorkingMember?.backendCreature ?? selectedCreature ?? selectedRoom.id] || 'Waiting for next run'}</small></p></div>
          <div className={`is-live state-${selectedState ?? 'local'}`}>
            <span>{selectedState === 'hunting' ? '…' : '●'}</span>
            <p><strong>{selectedState ? stateLabels[selectedState] : selectedRoom.status}</strong><small>{connection === 'online' ? 'Agent network connected' : 'Backend reconnecting'}</small></p>
          </div>
        </div>
        <div className="room-roster">
          <div className="roster-title"><span>ROOM TEAM</span><b>{selectedRoom.members.length}</b></div>
          {selectedRoom.members.length === 0 ? (
            <button className="empty-roster" type="button" onClick={() => openRecruiter(selectedRoom.id)}>+ STAFF THIS ROOM</button>
          ) : selectedRoom.members.map((member) => {
            const runtimeAvailable = Boolean(
              member.backendCreature && creatures.includes(member.backendCreature),
            )
            const memberState = runtimeAvailable ? states[member.backendCreature!] ?? 'idle' : undefined
            const supporting = Boolean(
              selectedRoomIsWorking
              && member.level === 'subagent'
              && !member.backendCreature,
            )
            const runtimeLabel = runtimeAvailable
              ? memberState === 'hunting'
                ? 'WORKING'
                : memberState === 'found'
                  ? 'DONE'
                  : memberState === 'error'
                    ? 'ERROR'
                    : 'LIVE'
              : supporting
                ? SUPPORT_ACTIONS[member.kind]
                : member.backendCreature
                ? 'OFFLINE'
                : 'ROSTER ONLY'

            return (
              <div className={`roster-member state-${memberState ?? (supporting ? 'supporting' : 'local')}`} key={member.id}>
                <i>{kindIcons[member.kind]}</i>
                <span><strong>{member.name}</strong><small>{member.role}</small></span>
                <div className="roster-runtime">
                  <em><i />{runtimeLabel}</em>
                  <b>{member.level === 'pm' ? 'PM' : 'SUB'}</b>
                </div>
                <div className="roster-actions">
                  {runtimeAvailable && member.backendCreature && (
                    <button type="button" onClick={() => {
                      setQuestTarget(selectedRoom.id)
                      commandInputRef.current?.focus()
                    }}>ASSIGN</button>
                  )}
                  <button className="remove-member" type="button" aria-label={`Remove ${member.name}`} onClick={() => setDeleteTarget({ kind: 'member', roomId: selectedRoom.id, memberId: member.id, label: member.name })}>×</button>
                </div>
              </div>
            )
          })}
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
              <button type="button" onClick={() => openRefineComposer(alert)}>DIG DEEPER</button>
            </footer>
          </article>
        ))}
      </section>

      {refineTarget && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeRefineComposer}>
          <section
            className="spawn-modal refine-modal pixel-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="refine-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <span>FOLLOW-UP · {refineTarget.creature.toUpperCase()}</span>
              <button type="button" aria-label="Close follow-up prompt" onClick={closeRefineComposer}>×</button>
            </header>
            <h2 id="refine-title">DIG DEEPER</h2>
            <div className="refine-context">
              <small>ORIGINAL FINDING</small>
              <strong>{refineTarget.headline}</strong>
            </div>
            <form onSubmit={(event) => void submitRefine(event)}>
              <label>
                WHAT SHOULD {refineTarget.creature.toUpperCase()} INVESTIGATE?
                <textarea
                  autoFocus
                  placeholder="Example: Verify the assumptions, find current web evidence, and give me three concrete next steps."
                  value={refinePrompt}
                  onChange={(event) => setRefinePrompt(event.target.value)}
                />
              </label>
              <p className="quest-help">The agent keeps its existing session context and will return a new alert based on your follow-up.</p>
              {refineError && <p className="form-error" role="alert">{refineError}</p>}
              <div className="modal-actions">
                <button type="button" onClick={closeRefineComposer}>{refinePending ? 'CLOSE & KEEP WORKING' : 'CANCEL'}</button>
                <button
                  type="submit"
                  disabled={refinePending || !refinePrompt.trim() || connection !== 'online' || !apiKeyConfigured}
                >
                  {refinePending ? 'INVESTIGATING…' : 'SEND FOLLOW-UP'}
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

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setDeleteTarget(null)}>
          <section className="spawn-modal delete-modal pixel-panel" role="dialog" aria-modal="true" aria-labelledby="delete-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><span>OFFICE MANAGER</span><button type="button" onClick={() => setDeleteTarget(null)}>×</button></header>
            <h2 id="delete-title">REMOVE {deleteTarget.label.toUpperCase()}?</h2>
            <p className="quest-help">{deleteTarget.kind === 'room' ? 'The room and its visible team will be removed from this office.' : 'This agent will be unassigned from the department.'}</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setDeleteTarget(null)}>KEEP IT</button>
              <button className="danger-button" type="button" onClick={confirmDelete}>REMOVE</button>
            </div>
          </section>
        </div>
      )}

      <form className="command-hud pixel-panel" onSubmit={(event) => void submitQuest(event)}>
        <div className="founder-avatar">S</div>
        <select className="command-department" aria-label="Quest department" value={questTarget} onChange={(event) => {
          setQuestTarget(event.target.value)
          const room = rooms.find((candidate) => candidate.id === event.target.value)
          if (room) handleFocusRoom(room)
        }}>
          <option value="all">ALL DEPTS</option>
          {rooms.map((room) => <option key={room.id} value={room.id}>{room.room.toUpperCase()}</option>)}
        </select>
        <input
          ref={commandInputRef}
          className="command-input"
          aria-label="Give agents a quest"
          placeholder="Give this department a quest…"
          value={questText}
          onChange={(event) => setQuestText(event.target.value)}
        />
        <button className="dispatch-button" type="submit" disabled={questPending || !questText.trim() || connection !== 'online' || !apiKeyConfigured}>
          {questPending ? 'SENDING…' : 'SEND'}
        </button>
        <button
          className="ship-button"
          type="button"
          disabled={connection !== 'online' || !apiKeyConfigured}
          onClick={() => void releaseAll()}
        >
          RELEASE ALL <b>{CORE_CREATURES.filter((name) => states[name] === 'hunting').length}</b>
        </button>
        {questError && <span className="command-error" role="alert">{questError}</span>}
      </form>
    </main>
  )
}

export default App
