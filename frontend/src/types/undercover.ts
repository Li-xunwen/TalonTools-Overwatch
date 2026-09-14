// 「谁是守望先锋卧底」房间内成员的展示数据（由服务端 state 消息下发）
export interface SeatMember {
  userId: number
  battletag: string
  displayName: string
  avatar: string
  seat: string
  seatIndex: number
  isOwner: boolean
  connected: boolean
  ready: boolean
  background: boolean
}

export interface RoomTeam {
  name: string
  slots: (SeatMember | null)[]
}

export interface ChatMessage {
  id: number
  system: boolean
  kind: ChatKind
  userId: number | null
  battletag: string
  seat: string | null
  isOwner: boolean
  channel: ChatChannel
  toUserId: number | null
  text: string
  voiceId: number | null
  duration: number | null
  at: number
}

export type ChatChannel = 'global' | 'friendly' | 'enemy' | 'private'
export type ChatKind = 'text' | 'voice'

// 房间内的游戏阶段：选图 → 选择卧底 → 准备 → 开始 → 结算
export type GameState = 'map' | 'undercover' | 'ready' | 'start' | 'settle'

// 互动道具：鸡蛋 / 玫瑰花
export type ItemType = 'egg' | 'rose'

export interface ItemEvent {
  id: number
  item: ItemType
  fromUserId: number
  fromBattletag: string
  toUserId: number
  toBattletag: string
  at: number
}

export interface RoomGame {
  state: GameState
  map: string
  mapOwnerUserId: number
  mapOwnerDisplayName: string
  vote: {
    active: boolean
    votes: Record<string, string>
  }
  recommendations: MapRecommendation[]
  /** 卧底是否已选出（具体身份只下发给卧底本人） */
  undercoverPicked: boolean
  /** 进入准备阶段后名单锁定 */
  rosterLocked: boolean
  /** 仅卧底本人为 true */
  youAreUndercover: boolean
  /** 已准备人数（两支队伍，包含离线成员） */
  readyCount: number
  /** 两支队伍总人数（包含离线成员） */
  teamTotal: number
}

export interface MapRecommendation {
  userId: number
  displayName: string
  map: string
}

export interface RoomState {
  id: number
  roomNo: string
  name: string
  ownerUserId: number
  ownerBattletag: string
  ownerDisplayName: string
  playerCount: number
  maxPlayers: number
  team1: RoomTeam
  team2: RoomTeam
  spectators: (SeatMember | null)[]
  members: SeatMember[]
  chat: ChatMessage[]
  game: RoomGame
}
