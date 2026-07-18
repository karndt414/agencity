import { useCallback, useEffect, useState } from 'react'

export const CORE_CREATURES = ['pyre', 'fetch', 'sight', 'lode'] as const

export type CreatureState = 'idle' | 'hunting' | 'found' | 'error'

export type OfficeActivity = {
  mode: 'working' | 'talking' | 'celebrating' | 'error'
  message: string
  updatedAt: number
}

export type OfficeCollaboration = {
  phase: 'gathering' | 'meeting' | 'returning'
  participants: string[]
  coordinator?: string
  workflow?: string
}

export type ApiUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  runs: number
  model: string
  pricingAvailable: boolean
}

export type CreatureAlert = {
  id: string
  createdAt: number
  creature: string
  headline: string
  details: string
  impact: string
  recommendation: string
  sources: string[]
  phase?: string
}

export type TaskReport = {
  task: string
  summary: string
  findings: Array<{
    worker: string
    headline: string
    details: string
    impact: string
    recommendation: string
    sources: string[]
  }>
  recommendations: string[]
  risks: string[]
  sources: string[]
}

type ConnectionState = 'connecting' | 'online' | 'offline'

type ReleaseAllResponse = {
  results: Record<string, { status: 'found' | 'error'; error?: string }>
}

type QuestResponse = {
  results: Record<string, { status: 'found' | 'error'; error?: string }>
}

type CityEvent = {
  type: string
  creature?: string
  state?: CreatureState
  creatures?: string[]
  token?: string
  tool?: string
  phase?: string
  from?: string
  to?: string
  headline?: string
  coordinator?: string
  participants?: string[]
  workflow?: string
  model?: string
  input_tokens?: number
  cached_input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  estimated_cost_usd?: number
  pricing_available?: boolean
  error?: string
  alert?: Omit<CreatureAlert, 'id' | 'createdAt' | 'creature'>
  report?: TaskReport
}

const initialStates = Object.fromEntries(
  CORE_CREATURES.map((name) => [name, 'idle']),
) as Record<string, CreatureState>

function websocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

async function errorMessage(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null) as { detail?: unknown } | null
  if (typeof payload?.detail === 'string') return payload.detail
  return `Request failed with status ${response.status}`
}

export function useAgencity() {
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
  const [creatures, setCreatures] = useState<string[]>([...CORE_CREATURES])
  const [states, setStates] = useState<Record<string, CreatureState>>(initialStates)
  const [alerts, setAlerts] = useState<CreatureAlert[]>([])
  const [reports, setReports] = useState<TaskReport[]>([])
  const [thoughts, setThoughts] = useState<Record<string, string>>({})
  const [activities, setActivities] = useState<Record<string, OfficeActivity>>({})
  const [collaboration, setCollaboration] = useState<OfficeCollaboration | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [usage, setUsage] = useState<ApiUsage>({
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    runs: 0,
    model: '',
    pricingAvailable: true,
  })

  useEffect(() => {
    const controller = new AbortController()
    let socket: WebSocket | undefined
    let retryTimer: number | undefined
    let collaborationTimer: number | undefined
    const activityTimers = new Map<string, number>()
    let active = true

    const showActivity = (
      creature: string,
      activity: Omit<OfficeActivity, 'updatedAt'>,
      duration?: number,
    ) => {
      const previousTimer = activityTimers.get(creature)
      if (previousTimer) window.clearTimeout(previousTimer)
      setActivities((current) => ({
        ...current,
        [creature]: { ...activity, updatedAt: Date.now() },
      }))
      if (duration) {
        activityTimers.set(creature, window.setTimeout(() => {
          setActivities((current) => {
            const next = { ...current }
            delete next[creature]
            return next
          })
          activityTimers.delete(creature)
        }, duration))
      }
    }

    const checkHealth = () => {
      fetch('/api/health', { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(await errorMessage(response))
          return response.json() as Promise<{ api_key_configured: boolean }>
        })
        .then((health) => {
          setApiKeyConfigured(health.api_key_configured)
          setError(null)
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          setError(cause instanceof Error ? cause.message : 'Backend health check failed')
        })
    }

    checkHealth()

    const connect = () => {
      if (!active) return
      setConnection('connecting')
      socket = new WebSocket(websocketUrl())

      socket.addEventListener('open', () => {
        setConnection('online')
        checkHealth()
      })
      socket.addEventListener('message', (message) => {
        let event: CityEvent
        try {
          event = JSON.parse(String(message.data)) as CityEvent
        } catch {
          setError('Received an invalid event from the backend')
          return
        }

        if (event.type === 'connected' && event.creatures) {
          setCreatures(event.creatures)
          setStates((current) => ({
            ...Object.fromEntries(event.creatures!.map((name) => [name, 'idle'])),
            ...current,
          }))
        }
        if (event.type === 'spawned' && event.creature) {
          setCreatures((current) => [...new Set([...current, event.creature!])])
          setStates((current) => ({ ...current, [event.creature!]: 'idle' }))
        }
        if (event.type === 'state' && event.creature && event.state) {
          setStates((current) => ({ ...current, [event.creature!]: event.state! }))
          if (event.state === 'hunting') {
            showActivity(event.creature, {
              mode: 'working',
              message: event.phase === 'synthesis'
                ? 'Synthesizing the team’s findings…'
                : 'Investigating the new quest…',
            })
          }
          if (event.state === 'found') {
            showActivity(event.creature, {
              mode: 'celebrating',
              message: event.phase === 'synthesis' ? 'Council synthesis complete!' : 'Found something useful!',
            }, 6000)
          }
        }
        if (event.type === 'thought' && event.creature && event.token) {
          setThoughts((current) => ({
            ...current,
            [event.creature!]: `${current[event.creature!] ?? ''}${event.token}`.slice(-240),
          }))
        }
        if (event.type === 'tool_call' && event.creature) {
          const toolMessage = `Using ${event.tool ?? 'a tool'} to research the quest…`
          setThoughts((current) => ({
            ...current,
            [event.creature!]: toolMessage,
          }))
          showActivity(event.creature, { mode: 'working', message: toolMessage })
        }
        if (event.type === 'collaboration' && event.to) {
          const sharedMessage = `${event.from ?? 'A teammate'} shared: ${event.headline ?? 'new findings'}`
          setThoughts((current) => ({
            ...current,
            [event.to!]: sharedMessage,
          }))
          showActivity(event.to, { mode: 'talking', message: 'Connecting the team’s findings…' })
          if (event.from) {
            showActivity(event.from, {
              mode: 'talking',
              message: `Shared: ${event.headline ?? 'new findings'}`,
            })
          }
        }
        if (event.type === 'collaboration_start' && event.participants) {
          if (collaborationTimer) window.clearTimeout(collaborationTimer)
          setCollaboration({
            phase: 'gathering',
            participants: event.participants,
            coordinator: event.coordinator,
            workflow: event.workflow,
          })
          event.participants.forEach((creature) => showActivity(creature, {
            mode: 'talking',
            message: event.workflow === 'room_hierarchy'
              ? 'Joining the PM’s room briefing…'
              : 'Heading to the Collaboration Hub…',
          }))
          if (event.coordinator) {
            setThoughts((current) => ({
              ...current,
              [event.coordinator!]: event.workflow === 'room_hierarchy'
                ? 'Delegating workstreams to the room’s subagents…'
                : 'Reviewing the party’s specialist reports…',
            }))
          }
          collaborationTimer = window.setTimeout(() => {
            setCollaboration((current) => current ? { ...current, phase: 'meeting' } : null)
          }, 1450)
        }
        if (event.type === 'collaboration_end' || event.type === 'collaboration_error') {
          if (collaborationTimer) window.clearTimeout(collaborationTimer)
          setCollaboration((current) => current ? { ...current, phase: 'returning' } : null)
          const participants = event.participants ?? []
          participants.forEach((creature) => showActivity(creature, {
            mode: 'celebrating',
            message: 'Council wrapped — back to my room!',
          }, 4200))
          collaborationTimer = window.setTimeout(() => setCollaboration(null), 1450)
        }
        if (event.type === 'handoff' && event.from && event.to) {
          showActivity(event.from, { mode: 'talking', message: `Looping in ${event.to}…` }, 5000)
          showActivity(event.to, { mode: 'talking', message: `${event.from} sent me context.` }, 5000)
        }
        if (event.type === 'usage') {
          setUsage((current) => ({
            inputTokens: current.inputTokens + (event.input_tokens ?? 0),
            cachedInputTokens: current.cachedInputTokens + (event.cached_input_tokens ?? 0),
            outputTokens: current.outputTokens + (event.output_tokens ?? 0),
            totalTokens: current.totalTokens + (event.total_tokens ?? 0),
            estimatedCostUsd: current.estimatedCostUsd + (event.estimated_cost_usd ?? 0),
            runs: current.runs + 1,
            model: event.model ?? current.model,
            pricingAvailable: current.pricingAvailable && (event.pricing_available ?? false),
          }))
        }
        if (event.type === 'alert' && event.creature && event.alert) {
          setAlerts((current) => [
            {
              ...event.alert!,
              id: crypto.randomUUID(),
              createdAt: Date.now(),
              creature: event.creature!,
              phase: event.phase,
              sources: event.alert!.sources ?? [],
            },
            ...current,
          ])
          setError(null)
        }
        if (event.type === 'report' && event.report) {
          setReports((current) => [event.report!, ...current].slice(0, 4))
          setError(null)
        }
        if (event.type === 'error') {
          if (event.creature) {
            setStates((current) => ({ ...current, [event.creature!]: 'error' }))
            showActivity(event.creature, { mode: 'error', message: 'I hit a snag — check the alert.' }, 7000)
          }
          setError(event.error ?? 'The backend reported an error')
        }
      })
      socket.addEventListener('close', () => {
        if (!active) return
        setConnection('offline')
        setCollaboration(null)
        if (collaborationTimer) window.clearTimeout(collaborationTimer)
        retryTimer = window.setTimeout(connect, 1500)
      })
      socket.addEventListener('error', () => socket?.close())
    }

    connect()
    return () => {
      active = false
      controller.abort()
      if (retryTimer) window.clearTimeout(retryTimer)
      if (collaborationTimer) window.clearTimeout(collaborationTimer)
      activityTimers.forEach((timer) => window.clearTimeout(timer))
      socket?.close()
    }
  }, [])

  const request = useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const response = await fetch(path, {
      method: 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) throw new Error(await errorMessage(response))
    return response.json() as Promise<T>
  }, [])

  const hunt = useCallback(async (creature: string, data?: Record<string, unknown>) => {
    setError(null)
    setStates((current) => ({ ...current, [creature]: 'hunting' }))
    setThoughts((current) => ({ ...current, [creature]: '' }))
    try {
      await request(`/api/creatures/${encodeURIComponent(creature)}/hunt`, data ? { data } : undefined)
      setStates((current) => ({ ...current, [creature]: 'found' }))
    } catch (cause) {
      setStates((current) => ({ ...current, [creature]: 'error' }))
      setError(cause instanceof Error ? cause.message : 'Hunt failed')
    }
  }, [request])

  const releaseAll = useCallback(async () => {
    setError(null)
    setStates((current) => ({
      ...current,
      ...Object.fromEntries(CORE_CREATURES.map((name) => [name, 'hunting'])),
    }))
    try {
      const result = await request<ReleaseAllResponse>('/api/creatures/release-all')
      setStates((current) => ({
        ...current,
        ...Object.fromEntries(CORE_CREATURES.map((name) => [
          name,
          result.results[name]?.status === 'found' ? 'found' : 'error',
        ])),
      }))
    } catch (cause) {
      setStates((current) => ({
        ...current,
        ...Object.fromEntries(CORE_CREATURES.map((name) => [name, 'error'])),
      }))
      setError(cause instanceof Error ? cause.message : 'Release all failed')
    }
  }, [request])

  const giveQuest = useCallback(async (quest: string, target: string, supporters: string[] = []) => {
    const selected = target === 'all' ? creatures : [...new Set([target, ...supporters])]
    setError(null)
    setStates((current) => ({
      ...current,
      ...Object.fromEntries(selected.map((name) => [name, 'hunting'])),
    }))
    setThoughts((current) => ({
      ...current,
      ...Object.fromEntries(selected.map((name) => [name, ''])),
    }))

    try {
      const result = await request<QuestResponse>('/api/quests', { quest, target, supporters })
      setStates((current) => ({
        ...current,
        ...Object.fromEntries(selected.map((name) => [
          name,
          result.results[name]?.status === 'found' ? 'found' : 'error',
        ])),
      }))
    } catch (cause) {
      setStates((current) => ({
        ...current,
        ...Object.fromEntries(selected.map((name) => [name, 'error'])),
      }))
      const message = cause instanceof Error ? cause.message : 'Quest dispatch failed'
      setError(message)
      throw cause
    }
  }, [creatures, request])

  const refine = useCallback(async (creature: string, followUp: string) => {
    const cleanFollowUp = followUp.trim()
    if (!cleanFollowUp) throw new Error('A follow-up prompt is required')

    setError(null)
    setStates((current) => ({ ...current, [creature]: 'hunting' }))
    setThoughts((current) => ({ ...current, [creature]: '' }))
    try {
      await request(`/api/creatures/${encodeURIComponent(creature)}/refine`, {
        follow_up: cleanFollowUp,
      })
      setStates((current) => ({ ...current, [creature]: 'found' }))
    } catch (cause) {
      setStates((current) => ({ ...current, [creature]: 'error' }))
      setError(cause instanceof Error ? cause.message : 'Refine failed')
      throw cause
    }
  }, [request])

  const spawn = useCallback(async (
    name: string,
    instructions: string,
    data: Record<string, unknown> = {},
    runImmediately = false,
  ) => {
    setError(null)
    const result = await request<{ creature: string }>('/api/creatures/spawn', {
      name,
      instructions,
    })
    setCreatures((current) => [...new Set([...current, result.creature])])
    setStates((current) => ({ ...current, [result.creature]: 'idle' }))
    if (runImmediately) await hunt(result.creature, data)
    return result.creature
  }, [hunt, request])

  const ensureCreature = useCallback(async (name: string, instructions: string) => {
    try {
      const result = await request<{ creature: string }>('/api/creatures/ensure', {
        name,
        instructions,
      })
      setCreatures((current) => [...new Set([...current, result.creature])])
      setStates((current) => ({
        ...current,
        [result.creature]: current[result.creature] ?? 'idle',
      }))
      return result.creature
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : `Could not restore ${name}`
      setError(message)
      throw cause
    }
  }, [request])

  const dismissAlert = useCallback((id: string) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id))
  }, [])

  return {
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
    hunt,
    refine,
    releaseAll,
    reports,
    spawn,
    states,
    thoughts,
    usage,
  }
}
