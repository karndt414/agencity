export type AgentKind = 'finance' | 'growth' | 'research' | 'talent' | 'coder'

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
  position: [number, number, number]
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
    position: [2.6, 0, -2.1],
  },
]
