import bmo from '../assets/pets/bmo.webp'
import capybara from '../assets/pets/capybara.webp'
import dario from '../assets/pets/dario.webp'
import mikasa from '../assets/pets/mikasa.webp'
import panda from '../assets/pets/panda.webp'
import zoro from '../assets/pets/zoro.webp'
import type { AgentKind, RoomMember } from './rooms'

export type PetAtlas = {
  id: string
  label: string
  src: string
  rows: 9 | 11
}

const PETS: PetAtlas[] = [
  { id: 'dario', label: 'Dario', src: dario, rows: 9 },
  { id: 'capybara', label: 'Melon Capybara', src: capybara, rows: 9 },
  { id: 'bmo', label: 'BMO', src: bmo, rows: 11 },
  { id: 'panda', label: 'Kungfu Panda', src: panda, rows: 9 },
  { id: 'mikasa', label: 'Mikasa', src: mikasa, rows: 11 },
  { id: 'zoro', label: 'Zoro', src: zoro, rows: 9 },
]

const KIND_OFFSET: Record<AgentKind, number> = {
  finance: 0,
  growth: 1,
  research: 2,
  talent: 3,
  coder: 4,
}

export function petForMember(
  member: RoomMember,
  memberIndex: number,
  roomKind: AgentKind = member.kind,
): PetAtlas {
  return PETS[(KIND_OFFSET[roomKind] + memberIndex) % PETS.length]
}
