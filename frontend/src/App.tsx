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
const ALL_ROOMS_INBOX = '__all_rooms__'
const defaultRoomNames = new Map(ROOMS.map((room) => [room.id, room.room]))

function initialRooms(): RoomData[] {
  try {
    const saved = window.localStorage.getItem(ROOM_STORAGE_KEY)
    if (!saved) return ROOMS
    const parsed = JSON.parse(saved) as RoomData[]
    if (!Array.isArray(parsed) || parsed.length === 0) return ROOMS
    return parsed.map((room) => ({
      ...room,
      room: defaultRoomNames.get(room.id) ?? room.room,
      members: room.members ?? [],
    }))
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

function safeArtifactUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return /^\/api\/artifacts\/[0-9a-f]{12}-[a-z0-9][a-z0-9-]{0,80}\.html$/.test(value)
    ? value
    : null
}

function roomIdForCreature(rooms: RoomData[], creature: string): string | null {
  const room = rooms.find((candidate) => (
    candidate.id === creature
    || candidate.members.some((member) => member.backendCreature === creature)
  ))
  return room?.id ?? null
}

function formatInboxTime(createdAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(createdAt)
}

function App() {
  const {
    activities,
    alerts,
    apiKeyConfigured,
    connection,
    collaboration,
    creatures,
    dismissAlert,
    error,
    ensureCreature,
    giveQuest,
    refine,
    releaseAll,
    spawn,
    states,
    stopAgents,
    thoughts,
    usage,
  } = useAgencity()
  const [rooms, setRooms] = useState<RoomData[]>(initialRooms)
  const [selectedRoomId, setSelectedRoomId] = useState('patch')
  const [zoom, setZoom] = useState(1)
  const [fitZoom, setFitZoom] = useState(1)
  const [camera, setCamera] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const commandInputRef = useRef<HTMLInputElement>(null)
  const restoringCreaturesRef = useRef(new Set<string>())
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
  const [stopPending, setStopPending] = useState(false)
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
  const [inboxRoomId, setInboxRoomId] = useState<string | null>(null)
  const [activeInboxAlertId, setActiveInboxAlertId] = useState<string | null>(null)
  const [readAlertIds, setReadAlertIds] = useState<Set<string>>(() => new Set())
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
    lastQuest.target === 'all'
    || lastQuest.target === selectedRoom.id
    || selectedRoom.members.some((member) => `agent:${member.backendCreature}` === lastQuest.target)
  ) ? lastQuest.text : selectedRoom.task
  const selectedWorkingMember = selectedRoom.members.find((member) => (
    member.backendCreature && creatures.includes(member.backendCreature) && states[member.backendCreature] === 'hunting'
  ))
  const selectedRoomIsWorking = Boolean(selectedWorkingMember)
  const selectedSupportingMembers = selectedRoomIsWorking
    ? selectedRoom.members.filter((member) => member.level === 'subagent' && !member.backendCreature)
    : []
  const alertsByRoom = useMemo(() => {
    const grouped = Object.fromEntries(rooms.map((room) => [room.id, [] as CreatureAlert[]]))
    alerts.forEach((alert) => {
      const roomId = roomIdForCreature(rooms, alert.creature)
      if (roomId) grouped[roomId]?.push(alert)
    })
    return grouped
  }, [alerts, rooms])
  const unreadByRoom = useMemo(() => Object.fromEntries(rooms.map((room) => [
    room.id,
    (alertsByRoom[room.id] ?? []).filter((alert) => !readAlertIds.has(alert.id)).length,
  ])), [alertsByRoom, readAlertIds, rooms])
  const totalUnread = Object.values(unreadByRoom).reduce((total, count) => total + count, 0)
  const inboxShowsAllRooms = inboxRoomId === ALL_ROOMS_INBOX
  const inboxRoom = rooms.find((room) => room.id === inboxRoomId) ?? null
  const inboxAlerts = useMemo(
    () => {
      if (inboxRoomId === ALL_ROOMS_INBOX) {
        return alerts.filter((alert) => roomIdForCreature(rooms, alert.creature))
      }
      return inboxRoomId ? alertsByRoom[inboxRoomId] ?? [] : []
    },
    [alerts, alertsByRoom, inboxRoomId, rooms],
  )
  const inboxUnreadCount = inboxAlerts.filter((alert) => !readAlertIds.has(alert.id)).length
  const activeInboxAlert = inboxAlerts.find((alert) => alert.id === activeInboxAlertId) ?? null
  const activeArtifactUrl = safeArtifactUrl(activeInboxAlert?.artifact?.url)
  const activeInboxRoom = activeInboxAlert
    ? rooms.find((room) => room.id === roomIdForCreature(rooms, activeInboxAlert.creature)) ?? null
    : null
  const latestUnreadEntry = useMemo(() => {
    for (const alert of alerts) {
      if (readAlertIds.has(alert.id)) continue
      const roomId = roomIdForCreature(rooms, alert.creature)
      if (roomId) return { alert, roomId }
    }
    return null
  }, [alerts, readAlertIds, rooms])

  const roomStyle = {
    '--room-color': selectedRoom.color,
    '--room-soft': selectedRoom.softColor,
    '--room-dark': selectedRoom.darkColor,
    '--room-progress': `${selectedProgress}%`,
  } as CSSProperties

  const totalAgents = rooms.reduce((sum, room) => sum + room.members.length, 0)
  const runningAgentCount = Object.values(states).filter((state) => state === 'hunting').length

  const markAlertRead = useCallback((alertId: string) => {
    setReadAlertIds((current) => {
      if (current.has(alertId)) return current
      return new Set([...current, alertId])
    })
  }, [])

  const openRoomInbox = (scope: string, preferredAlertId?: string) => {
    const scopedAlerts = scope === ALL_ROOMS_INBOX
      ? alerts.filter((alert) => roomIdForCreature(rooms, alert.creature))
      : alertsByRoom[scope] ?? []
    const nextAlert = scopedAlerts.find((alert) => alert.id === preferredAlertId)
      ?? scopedAlerts.find((alert) => !readAlertIds.has(alert.id))
      ?? scopedAlerts[0]
    if (scope !== ALL_ROOMS_INBOX) {
      setSelectedRoomId(scope)
      setQuestTarget(scope)
    }
    setInboxRoomId(scope)
    setActiveInboxAlertId(nextAlert?.id ?? null)
    if (nextAlert) markAlertRead(nextAlert.id)
  }

  const selectInboxAlert = (alertId: string) => {
    setActiveInboxAlertId(alertId)
    markAlertRead(alertId)
  }

  const markInboxRead = () => {
    setReadAlertIds((current) => new Set([
      ...current,
      ...inboxAlerts.map((alert) => alert.id),
    ]))
  }

  const removeInboxAlert = (alertId: string) => {
    const remaining = inboxAlerts.filter((alert) => alert.id !== alertId)
    dismissAlert(alertId)
    const nextAlert = remaining[0]
    setActiveInboxAlertId(nextAlert?.id ?? null)
    if (nextAlert) markAlertRead(nextAlert.id)
  }

  useEffect(() => {
    if (!inboxRoomId || activeInboxAlertId || inboxAlerts.length === 0) return
    const nextAlert = inboxAlerts.find((alert) => !readAlertIds.has(alert.id)) ?? inboxAlerts[0]
    setActiveInboxAlertId(nextAlert.id)
    markAlertRead(nextAlert.id)
  }, [activeInboxAlertId, inboxAlerts, inboxRoomId, markAlertRead, readAlertIds])

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
    setFitZoom(nextZoom)
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
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y, moved: false }
  }

  const handlePanMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = panRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) {
      drag.moved = true
      event.currentTarget.setPointerCapture(event.pointerId)
      setIsPanning(true)
    }
    if (!drag.moved) return
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
    if (connection !== 'online') return

    const missingAgents = new Map<string, RoomMember>()
    rooms.forEach((room) => room.members.forEach((member) => {
      if (
        member.backendCreature
        && !creatures.includes(member.backendCreature)
        && !restoringCreaturesRef.current.has(member.backendCreature)
      ) {
        missingAgents.set(member.backendCreature, member)
      }
    }))

    missingAgents.forEach((member, expectedCreature) => {
      restoringCreaturesRef.current.add(expectedCreature)
      void ensureCreature(member.name, member.instructions ?? member.role)
        .then((restoredCreature) => {
          if (restoredCreature === expectedCreature) return
          setRooms((current) => current.map((room) => ({
            ...room,
            members: room.members.map((candidate) => (
              candidate.backendCreature === expectedCreature
                ? { ...candidate, backendCreature: restoredCreature }
                : candidate
            )),
          })))
        })
        .catch(() => undefined)
        .finally(() => restoringCreaturesRef.current.delete(expectedCreature))
    })
  }, [connection, creatures, ensureCreature, rooms])

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
      let backendTarget: string | null = null
      let backendSupporters: string[] = []
      if (questTarget === 'all') {
        backendTarget = 'all'
      } else if (questTarget.startsWith('agent:')) {
        const requestedCreature = questTarget.slice('agent:'.length)
        const targetMember = rooms
          .flatMap((room) => room.members)
          .find((member) => member.backendCreature === requestedCreature)
        if (!targetMember?.backendCreature) {
          throw new Error('That room agent is no longer assigned. Choose another target.')
        }
        backendTarget = creatures.includes(targetMember.backendCreature)
          ? targetMember.backendCreature
          : await ensureCreature(
            targetMember.name,
            targetMember.instructions ?? targetMember.role,
          )
      } else {
        const targetRoom = rooms.find((room) => room.id === questTarget)
        const targetLead = targetRoom?.members.find((member) => member.level === 'pm')
        if (targetLead?.backendCreature) {
          backendTarget = creatures.includes(targetLead.backendCreature)
            ? targetLead.backendCreature
            : await ensureCreature(
              targetLead.name,
              targetLead.instructions ?? targetLead.role,
            )
        } else if (creatures.includes(questTarget)) {
          backendTarget = questTarget
        }
        if (targetRoom) {
          const supportMembers = targetRoom.members.filter((member) => (
            member.level === 'subagent' && member.backendCreature
          ))
          backendSupporters = await Promise.all(supportMembers.map(async (member) => (
            creatures.includes(member.backendCreature!)
              ? member.backendCreature!
              : ensureCreature(member.name, member.instructions ?? member.role)
          )))
          backendSupporters = [...new Set(backendSupporters)].filter((name) => name !== backendTarget)
        }
      }
      if (!backendTarget) throw new Error('This department needs a PM connected to the backend before it can receive quests.')
      await giveQuest(cleanQuest, backendTarget, backendSupporters)
      setQuestText('')
    } catch (cause) {
      setQuestError(cause instanceof Error ? cause.message : 'Could not dispatch quest')
    } finally {
      setQuestPending(false)
    }
  }

  const runSelectedRoom = async () => {
    if (!selectedCreature) return
    const supportMembers = selectedRoom.members.filter((member) => (
      member.level === 'subagent' && member.backendCreature
    ))
    try {
      const supporters = await Promise.all(supportMembers.map(async (member) => (
        creatures.includes(member.backendCreature!)
          ? member.backendCreature!
          : ensureCreature(member.name, member.instructions ?? member.role)
      )))
      await giveQuest(
        selectedRoom.task,
        selectedCreature,
        [...new Set(supporters)].filter((name) => name !== selectedCreature),
      )
    } catch {
      // The agent hook exposes the specific runtime error in the system message area.
    }
  }

  const stopAllAgents = async () => {
    setStopPending(true)
    try {
      await stopAgents()
    } finally {
      setStopPending(false)
    }
  }

  const submitSpawn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const data = JSON.parse(spawnData) as Record<string, unknown>
      const assignedRoom = rooms.find((room) => room.id === spawnRoomId)
      const cleanMission = spawnInstructions.trim()
      const runtimeInstructions = spawnLevel === 'subagent'
        ? (
          `ROOM SUPPORT ROLE\nYou are a supporting subagent in the ${assignedRoom?.room ?? 'assigned'} room. `
          + 'You report to the current room PM. Work only on delegated specialist workstreams, '
          + 'return evidence and risks to the PM, and let the PM own the final room recommendation. '
          + `Your specialty mission: ${cleanMission}`
        )
        : (
          `ROOM PM ROLE\nYou lead the ${assignedRoom?.room ?? 'assigned'} room. Delegate specialist research `
          + 'to the room subagents, evaluate their evidence, resolve conflicts, and own the final room recommendation. '
          + `Your leadership mission: ${cleanMission}`
        )
      const creature = await spawn(
        spawnName,
        runtimeInstructions,
        data,
        spawnRunNow && spawnLevel === 'pm',
      )
      const member: RoomMember = {
        id: `${creature}-${crypto.randomUUID().slice(0, 8)}`,
        name: spawnName.trim(),
        role: cleanMission.split(/[.!?]/)[0] || 'Startup agent',
        kind: spawnKind,
        level: spawnLevel,
        backendCreature: creature,
        instructions: runtimeInstructions,
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
    setInboxRoomId(null)
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
          activities={activities}
          collaboration={collaboration}
          unreadByRoom={unreadByRoom}
          onSelectRoom={(room) => {
            if (!suppressRoomClickRef.current) handleFocusRoom(room)
          }}
          zoom={zoom}
          availableCreatures={creatures}
          camera={camera}
          isPanning={isPanning}
        />
      </div>

      <div className="zoom-hud pixel-panel" aria-label="Office zoom controls">
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(zoom - fitZoom * 0.2)}>−</button>
        <button className="zoom-readout" type="button" onClick={() => zoomAt(fitZoom)}>{Math.round((zoom / fitZoom) * 100)}%</button>
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(zoom + fitZoom * 0.2)}>+</button>
        <button className="zoom-fit" type="button" onClick={fitOffice}>FIT</button>
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
          <button className={totalUnread ? 'has-unread' : ''} type="button" onClick={() => openRoomInbox(ALL_ROOMS_INBOX)}><small>INBOX</small><strong>{totalUnread}</strong></button>
        </div>
      </header>

      <nav className="agent-hud pixel-panel" aria-label="Agent rooms">
        <div className="hud-title"><span>ROOMS</span><b>{rooms.length}</b></div>
        <div className="agent-room-list">
        {rooms.map((room) => {
          const leadCreature = room.members.find((member) => member.level === 'pm')?.backendCreature
          const agentState = states[leadCreature ?? room.id]
          const status = agentState ? stateLabels[agentState] : room.status
          const unreadCount = unreadByRoom[room.id] ?? 0
          return (
            <div className={`room-nav-entry ${unreadCount > 0 ? 'has-unread' : ''}`} key={room.id}>
              <button
                className={`agent-card state-${agentState ?? 'local'} ${selectedRoomId === room.id ? 'is-active' : ''}`}
                onClick={() => handleFocusRoom(room)}
                style={{ '--agent-color': room.color, '--agent-soft': room.softColor } as CSSProperties}
                type="button"
              >
                <span className="agent-icon">{roomIcon(room)}</span>
                <span className="agent-copy"><strong>{room.room}</strong><small>{status}</small></span>
                <span className="agent-online" />
              </button>
              <button
                className="room-inbox-shortcut"
                type="button"
                aria-label={`Open ${room.room} inbox${unreadCount ? `, ${unreadCount} unread` : ''}`}
                onClick={() => openRoomInbox(room.id)}
              >
                <span>✉ INBOX</span><b>{unreadCount || (alertsByRoom[room.id]?.length ?? 0)}</b>
              </button>
            </div>
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
        <button className={`mission-inbox-button ${unreadByRoom[selectedRoom.id] ? 'has-unread' : ''}`} type="button" onClick={() => openRoomInbox(selectedRoom.id)}>
          <span><i>✉</i> ROOM INBOX<small>{alertsByRoom[selectedRoom.id]?.length ?? 0} saved findings</small></span>
          <b>{unreadByRoom[selectedRoom.id] ? `${unreadByRoom[selectedRoom.id]} NEW` : 'OPEN'}</b>
        </button>
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
                      setQuestTarget(
                        member.level === 'pm'
                          ? selectedRoom.id
                          : `agent:${member.backendCreature}`,
                      )
                      commandInputRef.current?.focus()
                    }}>{member.level === 'pm' ? 'ASSIGN ROOM' : 'ASSIGN DIRECT'}</button>
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
          onClick={() => void runSelectedRoom()}
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

      {latestUnreadEntry && !inboxRoomId && (
        <button
          className="inbox-toast pixel-panel"
          type="button"
          aria-live="polite"
          onClick={() => openRoomInbox(latestUnreadEntry.roomId, latestUnreadEntry.alert.id)}
        >
          <span className="inbox-toast-icon">✉</span>
          <span><small>NEW FINDING · {rooms.find((room) => room.id === latestUnreadEntry.roomId)?.room}</small><strong>{latestUnreadEntry.alert.headline}</strong></span>
          <b>OPEN INBOX</b>
        </button>
      )}

      {inboxRoomId && (
        <div className="modal-backdrop inbox-backdrop" role="presentation" onMouseDown={() => setInboxRoomId(null)}>
          <section className="room-inbox pixel-panel" role="dialog" aria-modal="true" aria-labelledby="inbox-title" onMouseDown={(event) => event.stopPropagation()}>
            <header className="inbox-header">
              <div>
                <span className="inbox-header-icon">✉</span>
                <span><small>{inboxShowsAllRooms ? 'COMPANY MAIL' : 'DEPARTMENT MAIL'}</small><h2 id="inbox-title">{inboxShowsAllRooms ? 'All Rooms Inbox' : `${inboxRoom?.room ?? 'Room'} Inbox`}</h2></span>
              </div>
              <div className="inbox-header-actions">
                <select aria-label="Inbox scope" value={inboxRoomId} onChange={(event) => openRoomInbox(event.target.value)}>
                  <option value={ALL_ROOMS_INBOX}>ALL ROOMS · {totalUnread} NEW</option>
                  {rooms.map((room) => <option key={room.id} value={room.id}>{room.room.toUpperCase()} · {unreadByRoom[room.id] ?? 0} NEW</option>)}
                </select>
                <button type="button" disabled={inboxAlerts.length === 0} onClick={markInboxRead}>MARK ALL READ</button>
                <button className="inbox-close" type="button" aria-label="Close room inbox" onClick={() => setInboxRoomId(null)}>×</button>
              </div>
            </header>

            <div className="inbox-layout">
              <nav className="inbox-message-list" aria-label={`${inboxShowsAllRooms ? 'All rooms' : inboxRoom?.room ?? 'Room'} messages`}>
                <div className="inbox-list-summary"><span>{inboxAlerts.length} FINDINGS</span><b>{inboxUnreadCount} UNREAD</b></div>
                {inboxAlerts.length === 0 ? (
                  <div className="inbox-empty-list"><i>✉</i><strong>ALL CLEAR</strong><small>New agent findings will arrive here.</small></div>
                ) : inboxAlerts.map((alert) => {
                  const unread = !readAlertIds.has(alert.id)
                  const alertRoom = rooms.find((room) => room.id === roomIdForCreature(rooms, alert.creature))
                  return (
                    <button
                      className={`inbox-message ${activeInboxAlertId === alert.id ? 'is-active' : ''} ${unread ? 'is-unread' : ''}`}
                      key={alert.id}
                      style={alertRoom ? { '--room-color': alertRoom.color } as CSSProperties : undefined}
                      type="button"
                      onClick={() => selectInboxAlert(alert.id)}
                    >
                      <span className="inbox-message-meta"><b>{inboxShowsAllRooms && alertRoom ? `${alertRoom.room} · ${alert.creature}` : alert.creature}</b><time>{formatInboxTime(alert.createdAt)}</time></span>
                      <strong>{alert.headline}</strong>
                      <small>{alert.artifact ? `HTML FILE · ${alert.artifact.filename}` : alert.phase === 'synthesis' ? 'PARTY SYNTHESIS' : alert.impact}</small>
                      {unread && <i aria-label="Unread" />}
                    </button>
                  )
                })}
              </nav>

              <article className="inbox-reader" style={activeInboxRoom ? {
                '--room-color': activeInboxRoom.color,
                '--room-dark': activeInboxRoom.darkColor,
              } as CSSProperties : undefined}>
                {activeInboxAlert ? (
                  <>
                    <header className="inbox-reader-header">
                      <div><small>{activeInboxAlert.phase === 'synthesis' ? 'PARTY SYNTHESIS' : 'AGENT FINDING'} · {activeInboxRoom?.room.toUpperCase()} · {formatInboxTime(activeInboxAlert.createdAt)}</small><h3>{activeInboxAlert.headline}</h3></div>
                      <span>{activeInboxAlert.creature.toUpperCase()}</span>
                    </header>
                    <div className="inbox-impact"><small>IMPACT</small><strong>{activeInboxAlert.impact}</strong></div>
                    <section className="inbox-reading-section"><small>WHAT THE AGENT FOUND</small><p>{activeInboxAlert.details}</p></section>
                    <section className="inbox-reading-section recommendation"><small>RECOMMENDED NEXT ACTION</small><strong>{activeInboxAlert.recommendation}</strong></section>
                    {activeInboxAlert.artifact && activeArtifactUrl && (
                      <section className="inbox-artifact">
                        <header><span><small>GENERATED CODE FILE</small><strong>{activeInboxAlert.artifact.filename}</strong></span><b>HTML</b></header>
                        <iframe
                          title={`Preview of ${activeInboxAlert.artifact.filename}`}
                          src={activeArtifactUrl}
                          sandbox="allow-scripts"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <a href={activeArtifactUrl} target="_blank" rel="noreferrer">OPEN HTML ↗</a>
                          <a href={`${activeArtifactUrl}?download=true`}>DOWNLOAD FILE</a>
                        </div>
                      </section>
                    )}
                    {activeInboxAlert.sources.length > 0 && (
                      <section className="inbox-reading-section"><small>SOURCES</small><ul className="inbox-sources">{activeInboxAlert.sources.map((source) => (
                        <li key={source}>{safeSourceUrl(source) ? <a href={safeSourceUrl(source)!} target="_blank" rel="noreferrer">{source}</a> : <span>{source}</span>}</li>
                      ))}</ul></section>
                    )}
                    <footer className="inbox-reader-actions">
                      <button type="button" onClick={() => removeInboxAlert(activeInboxAlert.id)}>DELETE MESSAGE</button>
                      <button className="inbox-primary-action" type="button" onClick={() => openRefineComposer(activeInboxAlert)}>DIG DEEPER</button>
                    </footer>
                  </>
                ) : (
                  <div className="inbox-empty-reader"><i>✉</i><h3>No findings yet</h3><p>{inboxShowsAllRooms ? 'Run a quest for any room. Responses from the whole company will be saved here.' : `Run a quest for ${inboxRoom?.room ?? 'this room'}. Responses will be saved here instead of covering the office.`}</p></div>
                )}
              </article>
            </div>
          </section>
        </div>
      )}

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
              {spawnLevel === 'pm' ? (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={spawnRunNow}
                    disabled={!apiKeyConfigured}
                    onChange={(event) => setSpawnRunNow(event.target.checked)}
                  />
                  RUN THE FIRST HUNT AFTER RECRUITING
                </label>
              ) : (
                <p className="quest-help">SUB-AGENTS ACTIVATE WHEN THEIR ROOM PM RECEIVES A QUEST.</p>
              )}
              {spawnError && <p className="form-error" role="alert">{spawnError}</p>}
              <div className="modal-actions">
                <button type="button" onClick={() => setShowSpawn(false)}>CANCEL</button>
                <button type="submit" disabled={connection !== 'online'}>{spawnRunNow && spawnLevel === 'pm' ? 'RECRUIT & HUNT' : 'RECRUIT AGENT'}</button>
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
        <select className="command-department" aria-label="Quest target" value={questTarget} onChange={(event) => {
          const target = event.target.value
          const creatureTarget = target.startsWith('agent:') ? target.slice('agent:'.length) : null
          const room = rooms.find((candidate) => (
            candidate.id === target
            || candidate.members.some((member) => member.backendCreature === creatureTarget)
          ))
          if (room) handleFocusRoom(room)
          setQuestTarget(target)
        }}>
          <option value="all">ALL DEPTS</option>
          {rooms.map((room) => (
            <optgroup key={room.id} label={room.room.toUpperCase()}>
              <option value={room.id}>ROOM PM · {room.agent.toUpperCase()}</option>
              {room.members.filter((member) => member.level === 'subagent' && member.backendCreature).map((member) => (
                <option key={member.id} value={`agent:${member.backendCreature}`}>
                  DIRECT SUB · {member.name.toUpperCase()}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <input
          ref={commandInputRef}
          className="command-input"
          aria-label="Give agents a quest"
          placeholder="Give this room or agent a quest…"
          value={questText}
          onChange={(event) => setQuestText(event.target.value)}
        />
        <button className="dispatch-button" type="submit" disabled={questPending || !questText.trim() || connection !== 'online' || !apiKeyConfigured}>
          {questPending ? 'SENDING…' : 'SEND'}
        </button>
        <button
          className="stop-agents-button"
          type="button"
          disabled={runningAgentCount === 0 || stopPending || connection !== 'online'}
          onClick={() => void stopAllAgents()}
        >
          ■ {stopPending ? 'STOPPING…' : `STOP ${runningAgentCount || ''}`}
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
