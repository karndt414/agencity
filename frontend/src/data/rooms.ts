export type AgentKind = 'finance' | 'growth' | 'research' | 'talent' | 'coder'

export const SUPPORT_ACTIONS: Record<AgentKind, string> = {
  finance: 'AUDITING',
  growth: 'DRAFTING',
  research: 'RESEARCHING',
  talent: 'MATCHING',
  coder: 'BUILDING',
}

export type RoomMember = {
  id: string
  name: string
  role: string
  kind: AgentKind
  level: 'pm' | 'subagent'
  backendCreature?: string
}

export type RoomData = {
  id: string
  agent: string
  room: string
  role: string
  status: string
  task: string
  note: string
  color: string
  softColor: string
  darkColor: string
  kind: AgentKind
  members: RoomMember[]
  position: [number, number, number]
}

export const ROOM_PALETTES: Record<AgentKind, Pick<RoomData, 'color' | 'softColor' | 'darkColor'>> = {
  finance: { color: '#d8734f', softColor: '#f2b898', darkColor: '#633528' },
  growth: { color: '#4d82a8', softColor: '#a9c8d5', darkColor: '#2a4556' },
  research: { color: '#628c72', softColor: '#b6ceb2', darkColor: '#30483a' },
  talent: { color: '#c99545', softColor: '#efd39a', darkColor: '#5b4727' },
  coder: { color: '#826e9f', softColor: '#cbbbe0', darkColor: '#443852' },
}

export function getOfficeHeight(roomCount: number): number {
  const floorRows = 3 + Math.ceil(Math.max(0, roomCount - 8) / 3)
  return 140 + floorRows * 300
}

export const ROOMS: RoomData[] = [
  {
    id: 'pyre',
    agent: 'Pyre',
    room: 'Runway Room',
    role: 'Finance watchdog',
    status: 'Reviewing burn',
    task: 'Found 3 silent SaaS renewals',
    note: 'Keeps the runway warm and the waste low.',
    color: '#d8734f',
    softColor: '#f2b898',
    darkColor: '#633528',
    kind: 'finance',
    members: [
      { id: 'pyre', name: 'Pyre', role: 'Finance PM', kind: 'finance', level: 'pm', backendCreature: 'pyre' },
      { id: 'ember', name: 'Ember', role: 'Spend analyst', kind: 'research', level: 'subagent' },
      { id: 'penny', name: 'Penny', role: 'Runway forecaster', kind: 'finance', level: 'subagent' },
    ],
    position: [-5.2, 0, 2.4],
  },
  {
    id: 'fetch',
    agent: 'Fetch',
    room: 'Deal Lounge',
    role: 'Growth closer',
    status: 'Drafting follow-up',
    task: '2 warm intros ready to send',
    note: 'Turns promising conversations into momentum.',
    color: '#4d82a8',
    softColor: '#a9c8d5',
    darkColor: '#2a4556',
    kind: 'growth',
    members: [
      { id: 'fetch', name: 'Fetch', role: 'Growth PM', kind: 'growth', level: 'pm', backendCreature: 'fetch' },
      { id: 'scout', name: 'Scout', role: 'Lead finder', kind: 'research', level: 'subagent' },
      { id: 'spark', name: 'Spark', role: 'Follow-up writer', kind: 'growth', level: 'subagent' },
    ],
    position: [0, 0, 2.4],
  },
  {
    id: 'sight',
    agent: 'Sight',
    room: 'Research Library',
    role: 'Market researcher',
    status: 'Scanning signals',
    task: 'Mapped 4 competitor moves',
    note: 'Notices the quiet signals before they become headlines.',
    color: '#628c72',
    softColor: '#b6ceb2',
    darkColor: '#30483a',
    kind: 'research',
    members: [
      { id: 'sight', name: 'Sight', role: 'Research PM', kind: 'research', level: 'pm', backendCreature: 'sight' },
      { id: 'atlas', name: 'Atlas', role: 'Market mapper', kind: 'research', level: 'subagent' },
      { id: 'clue', name: 'Clue', role: 'Signal verifier', kind: 'finance', level: 'subagent' },
    ],
    position: [5.2, 0, 2.4],
  },
  {
    id: 'lode',
    agent: 'Lode',
    room: 'Talent Atelier',
    role: 'Talent scout',
    status: 'Curating shortlist',
    task: '5 high-fit builders surfaced',
    note: 'Finds the people who make the city more capable.',
    color: '#c99545',
    softColor: '#efd39a',
    darkColor: '#5b4727',
    kind: 'talent',
    members: [
      { id: 'lode', name: 'Lode', role: 'Talent PM', kind: 'talent', level: 'pm', backendCreature: 'lode' },
      { id: 'moss', name: 'Moss', role: 'Culture researcher', kind: 'research', level: 'subagent' },
      { id: 'pip', name: 'Pip', role: 'Candidate scout', kind: 'talent', level: 'subagent' },
    ],
    position: [-2.6, 0, -2.1],
  },
  {
    id: 'patch',
    agent: 'Patch',
    room: 'Build Garage',
    role: 'Codex engineer',
    status: 'Running tests',
    task: 'Landing page build is 82% done',
    note: 'Ships working code from a protected project workspace.',
    color: '#826e9f',
    softColor: '#cbbbe0',
    darkColor: '#443852',
    kind: 'coder',
    members: [
      { id: 'patch', name: 'Patch', role: 'Engineering PM', kind: 'coder', level: 'pm' },
      { id: 'byte', name: 'Byte', role: 'Frontend builder', kind: 'coder', level: 'subagent' },
      { id: 'lint', name: 'Lint', role: 'QA keeper', kind: 'research', level: 'subagent' },
    ],
    position: [2.6, 0, -2.1],
  },
]
