<template>
  <div class="room-page news-page">
    <ThemeToggle />
    <Toast :message="toastMessage" :duration="3000" />

    <!-- 已选地图作为页面背景（毛玻璃模糊） -->
    <div
      v-if="mapBackground"
      class="map-backdrop"
      :style="{ backgroundImage: `url(${mapBackground})` }"
    ></div>

    <div class="content-area">
      <!-- 房间标题卡片 -->
      <div class="room-header">
        <div class="room-header-main">
          <div class="room-no">{{ room?.roomNo ?? roomNo }}</div>
          <div class="room-title">{{ room?.name ?? '正在连接房间...' }}</div>
        </div>
        <button class="leave-btn" @click="handleExitClick">退出房间</button>
      </div>

      <div v-if="!room" class="list-tip">
        {{ errorMessage || '正在连接房间会话...' }}
      </div>

      <template v-else>
        <!-- 观战席：1 × 6，位于顶栏与队伍栏之间 -->
        <div class="spectator-row">
            <div
              v-for="(slot, index) in room.spectators"
              :key="`spectator-${index}`"
            class="seat spectator-slot"
            :data-user-id="slot?.userId"
            :class="{ empty: !slot, mine: isMine(slot) }"
              @click="onSeatClick('spectator', index, slot, $event)"
            >
            <!-- 仅头像在上，标签在下；点击他人卡片弹出选项卡 -->
            <UndercoverMemberSlot
              :member="slot"
              :mine="isMine(slot)"
              stacked
              :has-map-right="!!game && game.state === 'map' && game.mapOwnerUserId === slot?.userId"
              :name-class="idColorClass(slot?.seat)"
            />
          </div>
        </div>

        <!-- 左右两个队伍栏 -->
        <div class="battle-area">
          <template v-for="team in teamKeys" :key="team">
            <!-- 中间预留 1/3 空位 -->
            <!-- 中间 1/3：游戏阶段面板 -->
            <section v-if="team === 'team2'" class="game-panel">
              <h3 class="game-title">{{ gameTitle }}</h3>
              <!-- 其他用户获得选图权时的绿色提示 -->
              <p v-if="game?.state === 'map' && iGotMapRight" class="map-right-hint">您获得选图权</p>
              <!-- 卧底身份：只展示给卧底本人；其他人只知道「卧底已选出」 -->
              <p v-if="game?.youAreUndercover" class="undercover-me">你为本局卧底</p>
              <p v-else-if="game?.undercoverPicked" class="game-hint">
                {{ game.undercoverPickMode === 'random' ? '已随机选择卧底' : '房主已指定卧底' }}
              </p>

              <!-- 选图阶段 -->
              <template v-if="game?.state === 'map'">
                <!-- 投票中：所有人可投 -->
                <template v-if="game.vote.active">
                  <p class="game-hint">已投票 {{ votedCount }} 人</p>
                  <p v-if="myVote" class="game-chosen">已投给：{{ myVote }}</p>
                  <button class="game-btn" @click="openMapPicker('vote')">
                    {{ myVote ? '修改投票' : '投票选图' }}
                  </button>
                  <button v-if="hasMapRight" class="game-btn primary" @click="gameAction('finishMapVote')">
                    结束投票
                  </button>
                  <p v-else class="game-hint">等待 {{ game.mapOwnerDisplayName || '房主' }} 结束投票</p>
                </template>

                <!-- 拥有选图权：四个选项 -->
                <template v-else-if="hasMapRight">
                  <p v-if="game.map" class="game-chosen">当前地图：{{ game.map }}</p>

                  <template v-if="panelMode === 'members'">
                    <p class="game-hint">把选图权授予谁</p>
                    <div class="member-list">
                      <button
                        v-for="member in otherMembers"
                        :key="`grant-${member.userId}`"
                        class="member-item"
                        :disabled="!member.connected"
                        @click="gameAction('grantMapRight', { userId: member.userId })"
                      >
                        <img class="member-mini-avatar" :src="member.avatar" :alt="member.displayName">
                        <span class="member-mini-name">{{ member.displayName }}</span>
                      </button>
                    </div>
                    <button class="game-btn plain" @click="panelMode = ''">返回</button>
                  </template>

                  <template v-else>
                    <button class="game-btn" @click="openMapPicker('choose')">选择地图</button>
                    <button class="game-btn" @click="pickRandomMap">随机地图</button>
                    <!-- 授予选图权仅房主可见 -->
                    <button v-if="isOwner" class="game-btn" @click="panelMode = 'members'">授予选图权</button>
                    <button class="game-btn" @click="gameAction('startMapVote')">投票选图</button>
                    <button
                      v-if="isOwner && game.map"
                      class="game-btn primary"
                      @click="advancePhase"
                    >下一步：{{ nextStateLabel }}</button>

                  </template>
                </template>

                <!-- 非选图权持有者：推荐 -->
                <template v-else>
                  <p v-if="game.map" class="game-chosen">当前地图：{{ game.map }}</p>
                  <button class="game-btn" @click="recommendMapHint">
                    向 {{ game.mapOwnerDisplayName || '房主' }} 推荐选图
                  </button>
                </template>

                <!-- 选图卡片最下方：所有人的推荐（不分身份都展示） -->
                <div v-if="game.recommendations.length" class="recommend-list">
                  <p
                    v-for="item in game.recommendations"
                    :key="`recommend-${item.userId}`"
                    class="recommend-item"
                  >{{ item.displayName }}推荐选图 [{{ item.map }}]</p>
                </div>
              </template>

              <!-- 选择卧底阶段 -->
              <template v-else-if="game?.state === 'undercover'">
                <!-- 房主：两个选项 -->
                <template v-if="isOwner">
                  <template v-if="panelMode === 'undercover'">
                    <p class="game-hint">
                      点击成员指定为本局卧底{{ isSpectatorSeat ? '（再点其他成员可更换）' : '（需坐在观战席）' }}
                    </p>
                    <div class="member-list">
                      <button
                        v-for="item in otherMembers"
                        :key="`uw-${item.userId}`"
                        class="member-item"
                        :class="{ chosen: manualUndercoverId === item.userId }"
                        :disabled="!isSpectatorSeat"
                        @click="assignUndercover(item.userId)"
                      >
                        <img class="member-mini-avatar" :src="item.avatar" :alt="item.displayName">
                        <span class="member-mini-name">{{ item.displayName }}</span>
                        <span v-if="manualUndercoverId === item.userId" class="undercover-mark">卧底</span>
                      </button>
                    </div>
                    <button class="game-btn plain" @click="panelMode = ''">返回</button>
                  </template>

                  <template v-else>
                    <button class="game-btn" @click="randomUndercover">随机选择卧底</button>
                    <button
                      class="game-btn"
                      :class="{ 'is-disabled': !isSpectatorSeat }"
                      :disabled="!isSpectatorSeat"
                      :title="isSpectatorSeat ? '指定本局卧底' : '需要坐在观战席才能指定卧底'"
                      @click="panelMode = 'undercover'"
                    >指定卧底</button>
                    <button class="game-btn primary" @click="advancePhase">
                      下一步：{{ nextStateLabel }}
                    </button>
                  </template>
                </template>

                <p v-else class="game-hint">等待选择卧底</p>
              </template>

              <!-- 准备阶段：队伍成员「准备 / 取消准备」，房主「强制开始 / 比赛开始」 -->
              <template v-else-if="game?.state === 'ready'">
                <p class="game-chosen">已准备 {{ game.readyCount }} / {{ game.teamTotal }} 人</p>

                <button
                  v-if="mySeat === 'team1' || mySeat === 'team2'"
                  class="game-btn"
                  @click="gameAction('toggleReady')"
                >{{ myReady ? '取消准备' : '准备' }}</button>
                <p v-else class="game-hint">观战席无需准备</p>

                <button
                  v-if="isOwner"
                  class="game-btn primary"
                  :disabled="game.teamTotal === 0"
                  @click="gameAction('startMatch')"
                >{{ allReady ? '比赛开始' : '强制开始' }} {{ game.readyCount }}/{{ game.teamTotal }}</button>

                <p class="game-hint">成员名单已锁定，不可更换席位</p>
              </template>

              <!-- 结算阶段：投票卧底 -->
              <template v-else-if="game?.state === 'settle'">
                <template v-if="game.undercoverVote.active">
                  <p class="game-chosen">开始投票卧底</p>
                  <p class="game-hint">
                    {{ mySeat === 'team1' || mySeat === 'team2' ? '只能投给本队成员，也可弃权' : '观战席不能投票' }}
                  </p>

                  <p v-if="myUndercoverVote !== null" class="game-hint">
                    你已投票{{ myUndercoverVote === 0 ? '（弃权）' : '' }}，等待其他成员
                  </p>

                  <div v-if="mySeat === 'team1' || mySeat === 'team2'" class="vote-list">
                    <button
                      v-for="item in myTeamMembers"
                      :key="`uv-${item.userId}`"
                      class="vote-item"
                      :class="{ chosen: myUndercoverVote === item.userId }"
                      :disabled="myUndercoverVote !== null && myUndercoverVote !== item.userId"
                      @click="voteUndercover(item.userId)"
                    >
                      <img class="member-mini-avatar" :src="item.avatar" :alt="item.displayName">
                      <span class="member-mini-name">{{ item.displayName }}</span>
                      <span class="vote-count">{{ undercoverVoteCount(item.userId) }} 票</span>
                    </button>

                    <button
                      class="vote-item"
                      :class="{ chosen: myUndercoverVote === 0 }"
                      :disabled="myUndercoverVote !== null && myUndercoverVote !== 0"
                      @click="voteUndercover(0)"
                    >
                      <span class="member-mini-name">弃权</span>
                      <span class="vote-count">{{ abstainCount }} 票</span>
                    </button>
                  </div>

                  <button v-if="isOwner" class="game-btn primary" @click="askFinishVote">
                    结束投票({{ votedTotal }}/{{ game.teamTotal }})
                  </button>
                  <p v-else class="game-hint">等待房主结束投票</p>
                </template>

                <!-- 已公布结果：中屏展示卧底 -->
                <template v-else>
                  <p class="undercover-result">卧底是：{{ revealedUndercoverNames || '（未指定）' }}</p>
                  <p class="game-hint">投票已结束</p>
                  <button v-if="isOwner" class="game-btn primary" @click="advancePhase">
                    下一步：{{ nextStateLabel }}
                  </button>
                </template>
              </template>

              <!-- 其它阶段 -->
              <template v-else>
                <p v-if="game?.map" class="game-chosen">地图：{{ game.map }}</p>
                <p class="game-hint">{{ gameStateHint }}</p>
                <button
                  v-if="isOwner"
                  class="game-btn primary"
                  @click="advancePhase"
                >下一步：{{ nextStateLabel }}</button>
                <p v-else class="game-hint">等待房主推进阶段</p>
              </template>
            </section>

            <section class="team-column">
              <header class="team-header">
                <input
                  v-if="editingTeam === team"
                  :ref="(el) => setTeamInputRef(el, team)"
                  v-model="teamNameDraft"
                  class="team-name-input"
                  maxlength="12"
                  @keyup.enter="saveTeamName(team)"
                  @blur="saveTeamName(team)"
                >
                <h2
                  v-else
                  class="team-name"
                  :class="[idColorClass(team), { editable: isOwner }]"
                  :title="isOwner ? '点击修改队伍名称' : ''"
                  @click="startEditTeam(team)"
                >
                  {{ room[team].name }}
                  <span v-if="isOwner" class="edit-hint">✏️</span>
                </h2>
              </header>

              <div class="seat-list">
                <div
                  v-for="(slot, index) in room[team].slots"
                  :key="`${team}-${index}`"
                  class="seat"
                  :data-user-id="slot?.userId"
                  :data-team="team"
                  :data-seat-index="index"
                  :class="{ empty: !slot, mine: isMine(slot) }"
                  @click="onSeatClick(team, index, slot, $event)"
                >
                  <!-- 成员展示与观战席共用同一个组件 -->
                  <UndercoverMemberSlot
                    :member="slot"
                    :mine="isMine(slot)"
                    :has-map-right="!!game && game.state === 'map' && game.mapOwnerUserId === slot?.userId"
                    :voters="votersOf(slot?.userId)"
                    :name-class="idColorClass(slot?.seat)"
                  />
                </div>
              </div>

              <!-- 仅房主：强制添加成员 -->
              <button
                v-if="isOwner"
                class="add-member-btn"
                :title="`强制添加成员到${room[team].name}`"
                @click.stop="openAddMember(team, $event)"
              >+</button>
            </section>
          </template>
        </div>

        <!-- 道具栏：38px 高，位于队伍列表与聊天列表之间 -->
        <div class="item-bar">
          <button
            v-for="item in ITEMS"
            :key="item.type"
            class="item-btn"
            :class="{ active: activeItem === item.type }"
            :title="item.title"
            @click="selectItem(item.type)"
          >
            <!-- 倒计时圆环：3 秒内逐渐减少 -->
            <svg v-if="activeItem === item.type" class="item-ring" viewBox="0 0 36 36">
              <circle class="ring-track" cx="18" cy="18" r="16" />
              <circle
                class="ring-progress"
                cx="18"
                cy="18"
                r="16"
                :stroke-dasharray="RING_LENGTH"
                :stroke-dashoffset="RING_LENGTH * itemProgress"
              />
            </svg>
            <img class="item-icon" :src="item.icon" :alt="item.title">
          </button>

          <span v-if="activeItem" class="item-tip">
            点击目标头像{{ activeItem === 'egg' ? '砸鸡蛋' : '献花' }}（{{ itemRemainSeconds }}s）
          </span>
        </div>

        <!-- 聊天栏：记录区最高 100px 可上下滚动，下方为输入框 + emoji + 发送 -->
        <section class="chat-area">
          <!-- 未读消息球（系统消息不计入），点击回到底部 -->
          <button v-if="unreadCount > 0" class="unread-ball" title="回到最新消息" @click="jumpToLatest">
            {{ unreadCount > 99 ? '99+' : unreadCount }}
          </button>

          <div ref="chatLogRef" class="chat-log" @scroll="onChatScroll">
            <div v-if="!visibleChatMessages.length" class="chat-empty">暂无聊天消息</div>
            <div
              v-for="message in visibleChatMessages"
              :key="message.id"
              class="chat-line"
              :class="{ system: message.system }"
            >
              <template v-if="message.system">[系统消息]：{{ message.text }}</template>
              <template v-else><span
                v-if="message.channel === 'private'"
                class="chat-private-tag"
              >私密</span><span
                class="chat-sender"
                :class="idColorClass(message.seat)"
              >{{ message.battletag }}</span><span
                v-if="message.isOwner"
                class="chat-owner-tag"
              >房主</span>：<button
                v-if="message.kind === 'voice'"
                class="voice-play"
                :class="{ playing: playingVoiceId === message.voiceId }"
                @click="playVoice(message)"
              >{{ playingVoiceId === message.voiceId ? '⏸' : '▶' }} 语音 {{ (message.duration ?? 0).toFixed(1) }}s</button><template
                v-else
              >{{ message.text }}</template></template>
            </div>
          </div>

          <audio ref="audioEl" hidden @ended="playingVoiceId = null" />

          <div class="chat-input-row">
            <div v-if="showEmojiPanel" class="emoji-panel">
              <span
                v-for="emoji in EMOJIS"
                :key="emoji"
                class="emoji-item"
                @click="appendEmoji(emoji)"
              >{{ emoji }}</span>
            </div>

            <!-- 麦克风模式下隐藏 emoji -->
            <button
              v-if="inputMode === 'text'"
              class="emoji-btn"
              title="表情"
              @click="showEmojiPanel = !showEmojiPanel"
            >😀</button>
            <button
              class="channel-btn"
              :class="`channel-${chatChannel}`"
              title="切换频道：全局 / 友方 / 敌方"
              @click="cycleChatChannel"
            >{{ chatChannelLabel }}</button>

            <textarea
              v-if="inputMode === 'text'"
              ref="chatInputRef"
              v-model="chatDraft"
              class="chat-input"
              rows="1"
              maxlength="200"
              placeholder="说点什么..."
              @input="autoGrowInput"
              @keydown.enter.exact.prevent="sendChat"
            ></textarea>
            <button
              v-else
              class="record-btn"
              :class="{ recording: isRecording, preparing: isPreparing }"
              @pointerdown.prevent="startRecording"
              @touchstart.prevent="startRecording"
              @touchend.prevent
              @mousedown.prevent="startRecording"
              @dragstart.prevent
              @contextmenu.prevent
            ><span class="record-label">{{ recordButtonLabel }}</span></button>

            <!-- 录音浮层：上滑到阈值后切换成红色 ✗ 取消提示 -->
            <div v-if="isRecording" class="record-hud" :class="{ cancel: cancelRecord }">
              <span v-if="cancelRecord" class="cancel-icon">✗</span>
              <span class="hud-text">{{ cancelRecord ? '松开手指，取消发送' : '手指上滑，取消发送' }}</span>
              <span class="hud-time">{{ recordingSeconds.toFixed(1) }}s / 15s</span>
            </div>

            <!-- 发送键左侧：点击在 ⌨️ / 🎙️ 之间切换 -->
            <button
              class="mode-btn"
              :title="inputMode === 'text' ? '点击切换到语音输入' : '点击切换到文字输入'"
              @click="toggleMode"
            >{{ inputMode === 'text' ? '🎙️' : '⌨️' }}</button>

            <button
              class="chat-send"
              :disabled="inputMode === 'voice'"
              :title="inputMode === 'voice' ? '语音模式：停止录音后自动发送' : '发送'"
              @click="sendChat"
            >发送</button>
          </div>
        </section>
      </template>
    </div>

    <!-- 点击他人卡片弹出的选项卡 -->
    <UndercoverUserDialog
      v-if="dialogMember"
      :member="dialogMember"
      :is-host="isOwner"
      :origin="dialogOrigin"
      @close="closeUserDialog"
      @private="startPrivateMessage(dialogMember)"
      @switch-team="switchMemberTeam(dialogMember)"
      @to-spectator="moveMemberToSpectator(dialogMember)"
      @transfer-owner="transferOwnerToMember(dialogMember)"
      @copy="copyBattletag"
    />

    <!-- 房主强制添加成员：搜索悬浮框 -->
    <div v-if="addMemberTeam" class="add-member-mask" @click="closeAddMember">
      <div class="add-member-panel" :style="addMemberStyle" @click.stop>
        <input
          v-model="addMemberKeyword"
          class="add-member-input"
          placeholder="搜索战网ID"
        >

        <div class="add-member-results">
          <p v-if="searchingUsers" class="add-member-tip">搜索中...</p>
          <p v-else-if="searchError" class="add-member-tip error">{{ searchError }}</p>
          <p v-else-if="!searchResults.length" class="add-member-tip">
            {{ addMemberKeyword.trim() ? '没有匹配的用户' : '输入战网ID开始搜索' }}
          </p>
          <button
            v-for="user in searchResults"
            :key="`search-${user.userId ?? user.battletag}`"
            class="add-member-item"
            @click="forceAddMemberToTeam(user)"
          >
            <img class="member-mini-avatar" :src="avatarOf(user.battletag)" :alt="user.battletag">
            <span class="member-mini-name">{{ user.battletag }}</span>
          </button>
        </div>

        <button class="game-btn plain" @click="closeAddMember">关闭</button>
      </div>
    </div>

    <!-- 二次确认弹窗（进入结算 / 结束投票） -->
    <div v-if="confirmState" class="confirm-mask" @click="confirmState = null">
      <div class="confirm-dialog" @click.stop>
        <p class="confirm-text">{{ confirmState.message }}</p>
        <div class="confirm-actions">
          <button class="confirm-btn" @click="confirmState = null">取消</button>
          <button class="confirm-btn primary" @click="runConfirm">确定</button>
        </div>
      </div>
    </div>

    <!-- 选图组件：800 × 500 -->
    <UndercoverMapPicker
      v-if="showMapPicker"
      :selected="game?.map"
      :mode="mapPickerMode"
      :voted-map="myVote"
      :vote-counts="voteCounts"
      @select="chooseMapFromPicker"
      @confirm="recommendMapFromPicker"
      @close="showMapPicker = false"
    />

    <!-- 房主退出：可选转让房主 / 解散房间 -->
    <div v-if="showExitDialog" class="exit-mask" @click="showExitDialog = false">
      <div class="exit-dialog" @click.stop>
        <h3 class="exit-title">{{ pickingTransferTarget ? '选择新的房主' : '退出房间' }}</h3>

        <template v-if="!pickingTransferTarget">
          <p class="exit-desc">你是房主，请选择退出方式</p>
          <button class="exit-item" @click="pickingTransferTarget = true">转让房主</button>
          <button class="exit-item danger" @click="dissolveRoomByOwner">解散房间</button>
          <button class="exit-item plain" @click="showExitDialog = false">取消</button>
        </template>

        <template v-else>
          <p v-if="!transferCandidates.length" class="exit-desc">
            房间里暂时没有其他玩家，只能解散房间
          </p>
          <div v-else class="exit-list">
            <button
              v-for="member in transferCandidates"
              :key="member.userId"
              class="exit-member"
              :disabled="!member.connected"
              @click="transferOwnerAndExit(member)"
            >
              <img class="exit-avatar" :src="member.avatar" :alt="member.displayName">
              <span class="exit-name">{{ member.displayName }}</span>
              <span v-if="!member.connected" class="exit-offline">断线</span>
            </button>
          </div>
          <button class="exit-item plain" @click="pickingTransferTarget = false">返回</button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onActivated, onDeactivated, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ThemeToggle from '@/components/ThemeToggle.vue'
import Toast from '@/components/Toast.vue'
import UndercoverMemberSlot from '@/components/UndercoverMemberSlot.vue'
import UndercoverUserDialog from '@/components/UndercoverUserDialog.vue'
import UndercoverMapPicker from '@/components/UndercoverMapPicker.vue'
import type { ChatMessage, RoomState, SeatMember } from '@/types/undercover'
import type { GameState } from '@/types/undercover'
import { ALL_MAP_NAMES, MAP_CATEGORIES } from '@/data/owMaps'
import type { ItemEvent, ItemType } from '@/types/undercover'
import { authFetch } from '@/utils/request'

type TeamKey = 'team1' | 'team2'

const RECONNECT_MS = 3000

const route = useRoute()
const router = useRouter()

const roomNo = computed(() => String(route.params.roomNo ?? ''))
const room = ref<RoomState | null>(null)
const myUserId = ref<number | null>(null)
const errorMessage = ref('')
const toastMessage = ref('')

const teamKeys: TeamKey[] = ['team1', 'team2']
const editingTeam = ref<TeamKey | ''>('')
const teamNameDraft = ref('')
const teamInputs: Record<string, HTMLInputElement | null> = {}

// 点击他人卡片弹出的选项卡（从该卡头像位置缩放到页面中间）
const dialogMember = ref<SeatMember | null>(null)
const dialogOrigin = ref<{ x: number; y: number; size: number } | null>(null)

let socket: WebSocket | null = null
let reconnectTimer: number | null = null
let pageActive = false

const isOwner = computed(
  () => myUserId.value !== null && room.value?.ownerUserId === myUserId.value
)

/* =========================
   ID 颜色：按「我」与对方的席位关系
   观战席 → 一律白色
   观战席视角看队伍 → 左队红 / 右队蓝
   队伍成员视角看队伍 → 友方蓝 / 敌方红
========================= */
type SeatTypeValue = 'team1' | 'team2' | 'spectator'

const mySeat = computed<SeatTypeValue | null>(() => {
  const me = room.value?.members.find((member) => member.userId === myUserId.value)
  return (me?.seat as SeatTypeValue | undefined) ?? null
})

function idColorClass(seat: string | null | undefined): string {
  if (!seat) return ''

  // 观战席始终白色
  if (seat === 'spectator') return 'uw-id-white'

  const mine = mySeat.value
  if (!mine) return ''

  // 观战席看队伍：左队红、右队蓝
  if (mine === 'spectator') return seat === 'team1' ? 'uw-id-red' : 'uw-id-blue'

  // 队伍成员看队伍：友方蓝、敌方红
  return seat === mine ? 'uw-id-blue' : 'uw-id-red'
}

/* =========================
   游戏阶段面板：选图 → 选择卧底 → 准备 → 开始 → 结算
========================= */
const GAME_STATE_LABELS: Record<GameState, string> = {
  map: '选图',
  undercover: '选择卧底',
  ready: '准备',
  start: '开始',
  settle: '结算'
}

const GAME_STATE_ORDER: GameState[] = ['map', 'undercover', 'ready', 'start', 'settle']

const GAME_STATE_HINTS: Record<GameState, string> = {
  map: '房主或选图权持有者选择地图',
  undercover: '房主指定本局卧底',
  ready: '等待全员准备',
  start: '比赛进行中',
  settle: '本局结算'
}

const game = computed(() => room.value?.game ?? null)
// 房主始终共同拥有选图权
const hasMapRight = computed(
  () => isOwner.value || (!!game.value && game.value.mapOwnerUserId === myUserId.value)
)
// 「其他用户获得选图权」：自己不是房主但拿到了选图权
const iGotMapRight = computed(
  () => !isOwner.value && !!game.value && game.value.mapOwnerUserId === myUserId.value
)
const panelMode = ref<'' | 'members' | 'undercover'>('')
const showMapPicker = ref(false)
const mapPickerMode = ref<'choose' | 'vote' | 'recommend'>('choose')

// 选图组件里选了地图（choose = 直接选图；vote = 投票）
function chooseMapFromPicker(name: string) {
  showMapPicker.value = false

  if (mapPickerMode.value === 'vote') {
    send({ type: 'game', action: 'voteMap', map: name })
    showToast(`已投给 ${name}`)
    return
  }

  gameAction('chooseMap', { map: name })
}

function openMapPicker(mode: 'choose' | 'vote' | 'recommend') {
  mapPickerMode.value = mode
  showMapPicker.value = true
}

// 推荐选图：确认后公屏发送「推荐选择[地图]」，并在持图权者的选图卡片底部展示
function recommendMapFromPicker(name: string) {
  showMapPicker.value = false
  if (!name) return

  send({ type: 'game', action: 'recommendMap', map: name })
  showToast(`已向 ${game.value?.mapOwnerDisplayName || '房主'} 推荐 ${name}`)
}

// 随机地图：从本地清单里随机取一张（清单由 public/map 目录生成）
function pickRandomMap() {
  if (!ALL_MAP_NAMES.length) return
  gameAction('chooseMap', { map: ALL_MAP_NAMES[Math.floor(Math.random() * ALL_MAP_NAMES.length)] })
}

// 已选地图的图片：作为页面背景（毛玻璃模糊）
const mapBackground = computed(() => {
  const name = game.value?.map
  if (!name) return ''

  for (const category of MAP_CATEGORIES) {
    const found = category.maps.find((map) => map.name === name)
    if (found) return found.image
  }
  return ''
})

const gameTitle = computed(() => GAME_STATE_LABELS[game.value?.state ?? 'map'])
const gameStateHint = computed(() => GAME_STATE_HINTS[game.value?.state ?? 'map'])
const nextStateLabel = computed(() => {
  const state = game.value?.state ?? 'map'
  // 选择卧底 → 准备阶段：这一步会锁定成员名单
  if (state === 'undercover') return '准备阶段（锁定成员名单）'
  // 结算 → 新对局（回到选图）
  if (state === 'settle') return '新对局'

  const index = GAME_STATE_ORDER.indexOf(state)
  return GAME_STATE_LABELS[GAME_STATE_ORDER[(index + 1) % GAME_STATE_ORDER.length]]
})

// 房主是否坐在观战席（只有坐观战席才能「指定卧底」）
const isSpectatorSeat = computed(() => mySeat.value === 'spectator')

// 房主手动指定的卧底（服务端不公开身份，这里只做本地高亮反馈）
const manualUndercoverId = ref<number | null>(null)

/* =========================
   结算阶段：投票卧底
========================= */
// 只能投本队成员（不含自己），另有弃权
const myTeamMembers = computed(() =>
  (room.value?.members ?? []).filter(
    (member) => member.seat === mySeat.value && member.userId !== myUserId.value
  )
)

const myUndercoverVote = computed(() => {
  const votes = game.value?.undercoverVote.votes ?? {}
  const value = votes[String(myUserId.value)]
  return typeof value === 'number' ? value : null
})

function undercoverVoteCount(targetUserId: number): number {
  return Object.values(game.value?.undercoverVote.votes ?? {}).filter((id) => id === targetUserId).length
}

const abstainCount = computed(() => undercoverVoteCount(0))
const votedTotal = computed(() => Object.keys(game.value?.undercoverVote.votes ?? {}).length)

const revealedUndercoverNames = computed(() =>
  (game.value?.revealedUndercoverIds ?? [])
    .map((id) => room.value?.members.find((member) => member.userId === id)?.displayName ?? '')
    .filter(Boolean)
    .join('、')
)

// 投票需要二次确认，确认后即锁定（不可修改），此时才会发出投票并生成系统消息
// 谁给这个成员投了票（用于卡片上浮的小头像徽标）
function votersOf(userId?: number) {
  if (!userId || !game.value) return []

  return Object.entries(game.value.undercoverVote.votes)
    .filter(([, target]) => target === userId)
    .map(([voterId]) => room.value?.members.find((member) => member.userId === Number(voterId)))
    .filter((member): member is NonNullable<typeof member> => !!member)
    .map((member) => ({ userId: member.userId, avatar: member.avatar, name: member.displayName }))
}

function voteUndercover(targetUserId: number) {
  if (myUndercoverVote.value !== null) {
    showToast('你已投票，不可修改')
    return
  }

  const label = targetUserId === 0
    ? '弃权'
    : room.value?.members.find((member) => member.userId === targetUserId)?.displayName ?? '该成员'

  askConfirm(
    `确定投票给「${label}」吗？投票后不可修改。`,
    () => gameAction('voteUndercover', { userId: targetUserId })
  )
}

// 结束投票需要二次确认
function askFinishVote() {
  askConfirm('确定结束投票并公布卧底吗？', () => gameAction('finishUndercoverVote'))
}

/* ---------- 二次确认弹窗 ---------- */
const confirmState = ref<{ message: string; action: () => void } | null>(null)

function askConfirm(message: string, action: () => void) {
  confirmState.value = { message, action }
}

function runConfirm() {
  const action = confirmState.value?.action
  confirmState.value = null
  action?.()
}

// 推进阶段：进入结算阶段前需要二次确认
function advancePhase() {
  // 还没选择卧底分配方式就推进 → 二次确认是否强制下一步
  if (game.value?.state === 'undercover' && !game.value.undercoverPicked) {
    askConfirm('尚未选择卧底分配方式，确定强制进入下一步吗？', () => gameAction('next'))
    return
  }

  if (game.value?.state === 'start') {
    askConfirm('确定进入结算阶段并开始投票卧底吗？', () => gameAction('next'))
    return
  }

  if (game.value?.state === 'settle') {
    askConfirm('确定开始新对局吗？（将回到选图阶段）', () => gameAction('next'))
    return
  }

  gameAction('next')
}

/* ---------- 公布结果：两个红框在双方队伍头像中上下扫过，最后停在卧底头像上 ---------- */
function seatElement(team: 'team1' | 'team2', index: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-team="${team}"][data-seat-index="${index}"]`)
}

async function playUndercoverReveal() {
  const undercovers = game.value?.revealedUndercoverIds ?? []
  if (!undercovers.length) return

  const toggleScan = (index: number, on: boolean) => {
    for (const team of ['team1', 'team2'] as const) {
      seatElement(team, index)?.classList.toggle('reveal-scan', on)
    }
  }

  // 上下扫两轮（0→5→0→5）
  const sweep = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5]
  for (const index of sweep) {
    toggleScan(index, true)
    await new Promise((resolve) => setTimeout(resolve, 70))
    toggleScan(index, false)
  }

  // 停在卧底头像上
  for (const team of ['team1', 'team2'] as const) {
    const target = (room.value?.members ?? []).find(
      (member) => member.seat === team && undercovers.includes(member.userId)
    )
    if (!target) continue
    seatElement(team, target.seatIndex)?.classList.add('reveal-hit')
  }
}

// 公布结果时播放扫过动画；新一局开始时清掉红框
watch(
  () => game.value?.revealedUndercoverIds.length ?? 0,
  (length, previous) => {
    if (length > 0 && !previous) void playUndercoverReveal()
    if (length === 0 && previous) {
      document.querySelectorAll('.reveal-scan, .reveal-hit').forEach((el) => {
        el.classList.remove('reveal-scan', 'reveal-hit')
      })
    }
  }
)

// 准备阶段：自己是否已准备、是否全员准备
const myReady = computed(() => {
  const me = room.value?.members.find((member) => member.userId === myUserId.value)
  return !!me?.ready
})

const allReady = computed(
  () => !!game.value && game.value.teamTotal > 0 && game.value.readyCount === game.value.teamTotal
)

function assignUndercover(userId: number) {
  manualUndercoverId.value = userId
  gameAction('assignUndercover', { userId })
}

function randomUndercover() {
  manualUndercoverId.value = null
  gameAction('randomUndercover')
}

// 进入准备阶段：名单锁定提示
watch(
  () => game.value?.rosterLocked,
  (locked, wasLocked) => {
    if (locked && !wasLocked) showToast('名单已经锁定，不可更换席位')
  }
)

const otherMembers = computed(() =>
  (room.value?.members ?? []).filter((member) => member.userId !== myUserId.value)
)

const myVote = computed(() => String(game.value?.vote.votes?.[String(myUserId.value)] ?? ''))
const votedCount = computed(() => Object.keys(game.value?.vote.votes ?? {}).length)

// 每张地图当前得票数（投票阶段显示在选图卡片上）
const voteCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  for (const map of Object.values(game.value?.vote.votes ?? {})) {
    counts[map] = (counts[map] ?? 0) + 1
  }
  return counts
})

function gameAction(action: string, payload: Record<string, unknown> = {}) {
  send({ type: 'game', action, ...payload })
  panelMode.value = ''
}

function recommendMapHint() {
  openMapPicker('recommend')
}

function showToast(message: string) {
  toastMessage.value = message
  setTimeout(() => {
    toastMessage.value = ''
  }, 3000)
}

/* =========================
   WebSocket 会话
========================= */

function socketUrl() {
  const token = localStorage.getItem('authToken') ?? ''
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${location.host}/api/undercover/ws?room=${encodeURIComponent(roomNo.value)}&token=${encodeURIComponent(token)}`
}

function send(message: Record<string, unknown>) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message))
  }
}

function handleMessage(event: MessageEvent) {
  let msg: any
  try {
    msg = JSON.parse(event.data)
  } catch {
    return
  }

  switch (msg?.type) {
    case 'ready':
      myUserId.value = Number(msg.you)
      errorMessage.value = ''
      break

    case 'state':
      myUserId.value = Number(msg.you)
      room.value = msg.room as RoomState
      errorMessage.value = ''
      break

    case 'error':
      showToast(String(msg.message ?? '操作失败'))
      break

    case 'closed':
      errorMessage.value = String(msg.message ?? '房间已解散')
      room.value = null
      showToast(errorMessage.value)
      closeSocket()
      break

    case 'kicked':
      // 被管理员移出房间：不再自动重连
      errorMessage.value = String(msg.message ?? '你已被移出房间')
      room.value = null
      showToast(errorMessage.value)
      closeSocket()
      break

    case 'item':
      // 道具动画：房间内所有人都会收到
      if (msg.event) playItemAnimation(msg.event as ItemEvent)
      break

    default:
      break
  }
}

function connect() {
  closeSocket()

  const ws = new WebSocket(socketUrl())
  socket = ws

  ws.onopen = () => {
    // 连接建立后立即同步一次前后台状态（房主后台存活 5 分钟依赖该标记）
    send({ type: 'background', value: judgeBackground() })
  }
  ws.onmessage = handleMessage
  ws.onclose = () => {
    socket = null
    if (pageActive) {
      reconnectTimer = window.setTimeout(connect, RECONNECT_MS)
    }
  }
  ws.onerror = () => {
    // 交给 onclose 统一处理重连
  }
}

function closeSocket() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (socket) {
    socket.onclose = null
    socket.onmessage = null
    socket.onerror = null
    socket.close()
    socket = null
  }
}

/* =========================
   前后台状态
========================= */

function judgeBackground(): boolean {
  return document.visibilityState === 'hidden' || !document.hasFocus()
}

function reportBackground() {
  const background = judgeBackground()
  send({ type: 'background', value: background })
  void sendOnlineHeartbeat(background)
}

/* =========================
   在线心跳：房间内每 2 秒上报一次，
   这样大厅「房间列表」下方的在线列表也能看到房间里的人
========================= */
const ONLINE_HEARTBEAT_MS = 2000
let onlineHeartbeatTimer: number | null = null

async function sendOnlineHeartbeat(background = judgeBackground()) {
  try {
    await authFetch('/api/undercover/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ background })
    })
  } catch (error) {
    // 失败不打断房间内其它功能，等下一次心跳自动恢复
    console.error('房间内在线心跳发送失败', error)
  }
}

function startOnlineHeartbeat() {
  stopOnlineHeartbeat()
  void sendOnlineHeartbeat()
  onlineHeartbeatTimer = window.setInterval(() => void sendOnlineHeartbeat(), ONLINE_HEARTBEAT_MS)
}

function stopOnlineHeartbeat() {
  if (onlineHeartbeatTimer !== null) {
    clearInterval(onlineHeartbeatTimer)
    onlineHeartbeatTimer = null
  }
}

/* =========================
   聊天（输入 / emoji / 发送）
========================= */

/* 聊天：输入、emoji、发送 */
const EMOJIS = [
  '😀', '😄', '😂', '😊', '😎', '🤔', '😭', '😡', '👍', '👎',
  '🎉', '🔥', '💀', '🤡', '🕵️', '👻', '🐮', '🐔', '🥇', '🚀'
]

const chatDraft = ref('')
const showEmojiPanel = ref(false)
const chatLogRef = ref<HTMLElement | null>(null)
// 未读消息球计数（系统消息不计入）
const unreadCount = ref(0)

// 输入模式：⌨️ 文字 / 🎙️ 语音
type InputMode = 'text' | 'voice'
const inputMode = ref<InputMode>('text')

// 文字输入框自动换行 + 加高
const chatInputRef = ref<HTMLTextAreaElement | null>(null)
const CHAT_INPUT_MAX_HEIGHT = 120

function autoGrowInput() {
  const el = chatInputRef.value
  if (!el) return

  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, CHAT_INPUT_MAX_HEIGHT)}px`
}

function switchMode(mode: InputMode) {
  if (isRecording.value && mode !== 'voice') stopRecording(false)

  inputMode.value = mode

  if (mode === 'text') {
    // 回到文字模式：释放预热流，关掉系统录音指示灯
    closeMicStream()
    nextTick(() => autoGrowInput())
    return
  }

  // 语音模式：emoji 不显示，并提前把麦克风流预热好（按下即可录音）
  showEmojiPanel.value = false
  // 顺手在用户手势里把音频上下文唤醒，保证录音/发送音效能出声（iOS 要求）
  getSfxContext()
  void ensureMicStream().then((stream) => {
    // 权限被拒时退回文字模式，避免停在无法录音的状态
    if (!stream && inputMode.value === 'voice') inputMode.value = 'text'
  })
}

function toggleMode() {
  switchMode(inputMode.value === 'text' ? 'voice' : 'text')
}

/* =========================
   麦克风「预热」：进入语音模式时就拿到流并一直保留，
   按下录音时只做 new MediaRecorder(stream).start()
   ——避免每次按下都先等 getUserMedia（手机上通常 200~800ms，首次更久）
========================= */
// 取流兜底超时：浏览器/系统卡住时必须给用户一个结果，不能一直挂着
const MIC_ACQUIRE_TIMEOUT_MS = 8000

let micStream: MediaStream | null = null
let micStreamPromise: Promise<MediaStream | null> | null = null

function withTimeout<T>(task: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), ms)
    task.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        console.error(error)
        resolve(null)
      }
    )
  })
}

function isStreamLive(stream: MediaStream | null): stream is MediaStream {
  return !!stream && stream.getAudioTracks().some((track) => track.readyState === 'live')
}

// 拿到（或复用）麦克风流；已预热时同步返回缓存，几乎不产生延迟
async function ensureMicStream(): Promise<MediaStream | null> {
  if (isStreamLive(micStream)) return micStream
  if (micStreamPromise) return micStreamPromise

  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('当前浏览器不支持录音')
    return null
  }

  micStreamPromise = (async () => {
    // 显式开启回声消除：录音提示音是外放的，靠 AEC 保证它不会被录进语音里
    const pending = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    })
    const stream = await withTimeout(pending, MIC_ACQUIRE_TIMEOUT_MS)

    if (!stream) {
      // 超时（例如权限弹窗一直没处理）后才拿到流的话，立刻关掉，避免麦克风一直开着
      void pending
        .then((lateStream) => lateStream.getTracks().forEach((track) => track.stop()))
        .catch(() => {})
      showToast('无法访问麦克风，请检查浏览器权限')
      return null
    }

    micStream = stream
    return stream
  })()

  try {
    return await micStreamPromise
  } finally {
    micStreamPromise = null
  }
}

// 释放预热流（离开语音模式 / 离开页面 / 页面切后台时调用，关掉系统录音指示灯）
function closeMicStream() {
  micStream?.getTracks().forEach((track) => track.stop())
  micStream = null
}

// 页面可见性变化：后台释放麦克风，回到前台且仍在语音模式则重新预热
function onMicVisibilityChange() {
  // 正在录音时不关（关了会让 MediaRecorder 报错、上传半截音频）
  if (document.visibilityState === 'hidden') {
    if (!isRecording.value) closeMicStream()
  } else if (pageActive && inputMode.value === 'voice' && !isRecording.value) {
    void ensureMicStream()
  }
}

const chatMessages = computed<ChatMessage[]>(() => room.value?.chat ?? [])

// 频道：全局 → 友方 → 敌方 循环切换；私密频道由「发送私密消息」临时进入，不参与循环
type ChatChannelValue = 'global' | 'friendly' | 'enemy' | 'private'

const CHANNELS: { value: ChatChannelValue; label: string }[] = [
  { value: 'global', label: '全局' },
  { value: 'friendly', label: '友方' },
  { value: 'enemy', label: '敌方' }
]

const chatChannel = ref<ChatChannelValue>('global')
const privateTarget = ref<SeatMember | null>(null)

// 私密频道标签：对方战网ID（不带 #1234），最长 4 字，紫色
const chatChannelLabel = computed(() => {
  if (chatChannel.value === 'private') {
    const name = privateTarget.value?.displayName ?? ''
    return Array.from(name).slice(0, 4).join('') || '私密'
  }
  return CHANNELS.find((channel) => channel.value === chatChannel.value)?.label ?? '全局'
})

function cycleChatChannel() {
  unreadCount.value = 0

  // 私密频道不在循环列表里，点一下回到全局
  if (chatChannel.value === 'private') {
    chatChannel.value = 'global'
    privateTarget.value = null
    return
  }

  const index = CHANNELS.findIndex((channel) => channel.value === chatChannel.value)
  chatChannel.value = CHANNELS[(index + 1) % CHANNELS.length].value
}

// 频道可见性：系统/全局消息人人可见；友方只看同队；敌方只看对面；自己的消息始终可见
function canSeeMessage(message: ChatMessage): boolean {
  if (message.system || message.channel === 'global') return true

  // 私密消息只给收发双方（服务端也已按人过滤）
  if (message.channel === 'private') {
    return message.userId === myUserId.value || message.toUserId === myUserId.value
  }

  if (message.userId === myUserId.value) return true

  const mine = mySeat.value
  if (!mine || mine === 'spectator') return false
  if (!message.seat || message.seat === 'spectator') return false

  const sameSide = message.seat === mine
  return message.channel === 'friendly' ? sameSide : !sameSide
}

const visibleChatMessages = computed(() => chatMessages.value.filter(canSeeMessage))

function isChatAtBottom(): boolean {
  const el = chatLogRef.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 24
}

function scrollChatToBottom() {
  nextTick(() => {
    const el = chatLogRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

/* ---------- 未读消息球（系统消息不计入） ---------- */
// 聊天窗口是否完整可见（页面滚动到看不全时也算「没读完」）
function isChatFullyVisible(): boolean {
  const el = document.querySelector<HTMLElement>('.chat-area')
  if (!el) return false

  const rect = el.getBoundingClientRect()
  return (
    rect.top >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.left >= 0 &&
    rect.right <= window.innerWidth
  )
}

// 已读完 = 内部滚到底部 且 聊天窗口完整可见
function isChatRead(): boolean {
  return isChatAtBottom() && isChatFullyVisible()
}

// 点击消息球：清空未读并回到底部
function jumpToLatest() {
  unreadCount.value = 0
  // 若聊天窗口不在可视区域，先把它滚进视野
  document.querySelector<HTMLElement>('.chat-area')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  scrollChatToBottom()
}

// 聊天内部滚动 / 页面滚动后，若已读完则清空未读
function onChatScroll() {
  if (isChatRead()) unreadCount.value = 0
}

function sendChat() {
  const text = chatDraft.value.trim()
  if (!text) {
    showToast('消息不能为空')
    return
  }

  const isPrivate = chatChannel.value === 'private'
  if (isPrivate && !privateTarget.value) {
    chatChannel.value = 'global'
    showToast('私密对象已离开房间')
    return
  }

  send({
    type: 'chat',
    text,
    channel: isPrivate ? 'private' : chatChannel.value,
    toUserId: isPrivate ? privateTarget.value?.userId : undefined
  })
  chatDraft.value = ''
  showEmojiPanel.value = false
  scrollChatToBottom()
}

function appendEmoji(emoji: string) {
  chatDraft.value = `${chatDraft.value}${emoji}`.slice(0, 200)
  nextTick(() => autoGrowInput())
}

/* =========================
   他人卡片选项卡的动作
========================= */
function scrollToChatInput() {
  document.querySelector('.chat-area')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  nextTick(() => {
    if (inputMode.value === 'text') chatInputRef.value?.focus()
  })
}

// 发送私密消息：滚动到聊天输入框，频道切成紫色「对方ID(去#数字，最长4字)」
function startPrivateMessage(member: SeatMember | null) {
  if (!member) return

  unreadCount.value = 0
  privateTarget.value = member
  chatChannel.value = 'private'
  scrollToChatInput()
}

// 房主：切换对方队伍（观战席 → 队伍1，队伍1 ↔ 队伍2）
function switchMemberTeam(member: SeatMember | null) {
  if (!member) return

  send({ type: 'moveMember', userId: member.userId, seat: member.seat === 'team1' ? 'team2' : 'team1' })
}

// 房主：把对方移到观战席
function moveMemberToSpectator(member: SeatMember | null) {
  if (!member) return
  send({ type: 'moveMember', userId: member.userId, seat: 'spectator' })
}

// 房主：把房主转让给对方
function transferOwnerToMember(member: SeatMember | null) {
  if (!member) return
  send({ type: 'transferOwner', userId: member.userId })
}

async function copyBattletag(battletag: string) {
  try {
    await navigator.clipboard.writeText(battletag)
    showToast('已复制完整 ID')
  } catch (error) {
    console.error(error)
    showToast('复制失败，请手动选择复制')
  }
}

/* =========================
   房主：强制添加成员（搜索悬浮框）
========================= */

/* =========================
   互动道具：鸡蛋 / 玫瑰花（3 秒倒计时内点击目标头像使用）
========================= */
const ITEMS: { type: ItemType; icon: string; title: string }[] = [
  { type: 'egg', icon: '/ico/鸡蛋.svg', title: '砸鸡蛋' },
  { type: 'rose', icon: '/ico/玫瑰花.svg', title: '献花' }
]

// 道具图标与命中后的动画图
const ITEM_FLY_ICON: Record<ItemType, string> = {
  egg: '/ico/鸡蛋.svg',
  rose: '/ico/玫瑰花.svg'
}

const ITEM_IMPACT_ICON: Record<ItemType, string> = {
  egg: '/ico/鸡蛋破碎.svg',
  rose: '/ico/玫瑰花绽放.svg'
}

const ITEM_COOLDOWN_MS = 3000
const RING_LENGTH = 2 * Math.PI * 16   // 与模板里 r=16 对应

const activeItem = ref<ItemType | ''>('')
const itemProgress = ref(0)
const itemRemainSeconds = ref(3)

let itemTimer: number | null = null

// 点击道具：进入/重置 3 秒倒计时
function selectItem(item: ItemType) {
  activeItem.value = item
  itemProgress.value = 0
  itemRemainSeconds.value = 3

  if (itemTimer !== null) clearInterval(itemTimer)

  const startedAt = Date.now()
  itemTimer = window.setInterval(() => {
    const elapsed = Date.now() - startedAt
    itemProgress.value = Math.min(elapsed / ITEM_COOLDOWN_MS, 1)
    itemRemainSeconds.value = Math.max(0, Math.ceil((ITEM_COOLDOWN_MS - elapsed) / 1000))

    if (elapsed >= ITEM_COOLDOWN_MS) {
      if (itemTimer !== null) clearInterval(itemTimer)
      itemTimer = null
      activeItem.value = ''
      itemProgress.value = 0
    }
  }, 50)
}

function stopItemTimer() {
  if (itemTimer !== null) {
    clearInterval(itemTimer)
    itemTimer = null
  }
  activeItem.value = ''
  itemProgress.value = 0
}

// 倒计时内点击目标头像 → 使用道具
function useItemOn(targetUserId: number) {
  if (!activeItem.value) return

  const item = activeItem.value
  send({ type: 'item', item, targetUserId })

  // 使用后重新计时 3 秒，方便在窗口内连续使用
  selectItem(item)
}

/* ---------- 道具动画：从本用户头像飞向目标头像 ---------- */
function avatarRectOf(userId: number): DOMRect | null {
  const card = document.querySelector<HTMLElement>(`[data-user-id="${userId}"]`)
  if (!card) return null

  const avatar = card.querySelector<HTMLElement>('.member-avatar') ?? card
  return avatar.getBoundingClientRect()
}

function playItemAnimation(event: ItemEvent) {
  const from = avatarRectOf(event.fromUserId)
  const to = avatarRectOf(event.toUserId)
  if (!from || !to) return

  const size = Math.max(Math.min(from.width, 56), 26)
  const startX = from.left + from.width / 2
  const startY = from.top + from.height / 2
  const endX = to.left + to.width / 2
  const endY = to.top + to.height / 2
  const dx = endX - startX
  const dy = endY - startY

  const flying = document.createElement('img')
  flying.className = 'item-fly'
  flying.src = ITEM_FLY_ICON[event.item]
  flying.style.width = `${size}px`
  flying.style.height = `${size}px`
  flying.style.left = `${startX - size / 2}px`
  flying.style.top = `${startY - size / 2}px`
  document.body.appendChild(flying)

  // 鸡蛋中途旋转，玫瑰不旋转
  const midRotate = event.item === 'egg' ? '330deg' : '0deg'
  const endRotate = event.item === 'egg' ? '660deg' : '0deg'

  const animation = flying.animate(
    [
      { transform: 'translate(0, 0) rotate(0deg) scale(0.85)', opacity: 1 },
      {
        transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 46}px) rotate(${midRotate}) scale(1.1)`,
        opacity: 1,
        offset: 0.55
      },
      { transform: `translate(${dx}px, ${dy}px) rotate(${endRotate}) scale(1)`, opacity: 1 }
    ],
    { duration: 720, easing: 'ease-in-out', fill: 'forwards' }
  )

  animation.onfinish = () => {
    flying.remove()
    playItemImpact(event, endX, endY, size)
  }
}

// 命中：鸡蛋破碎 / 玫瑰花绽放，并让目标头像抖一下
function playItemImpact(event: ItemEvent, x: number, y: number, size: number) {
  const host = document.createElement('div')
  host.className = `item-impact ${event.item}`
  host.style.left = `${x}px`
  host.style.top = `${y}px`

  const core = document.createElement('img')
  core.className = 'impact-core'
  core.src = ITEM_IMPACT_ICON[event.item]
  core.style.width = `${size * 1.6}px`
  core.style.height = `${size * 1.6}px`
  host.appendChild(core)
  document.body.appendChild(host)

  window.setTimeout(() => host.remove(), 900)

  const targetCard = document.querySelector<HTMLElement>(`[data-user-id="${event.toUserId}"]`)
  if (targetCard) {
    targetCard.classList.add('item-hit')
    window.setTimeout(() => targetCard.classList.remove('item-hit'), 420)
  }
}
interface SearchUser {
  userId?: number
  battletag: string
}

const addMemberTeam = ref<'' | 'team1' | 'team2'>('')
const addMemberStyle = ref<Record<string, string>>({})
const addMemberKeyword = ref('')
const searchResults = ref<SearchUser[]>([])
const searchingUsers = ref(false)
const searchError = ref('')
let searchTimer: number | null = null

function avatarOf(battletag: string) {
  return `/api/users/${encodeURIComponent(battletag)}/avatar`
}

function openAddMember(team: 'team1' | 'team2', event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect()

  addMemberTeam.value = team
  addMemberKeyword.value = ''
  searchResults.value = []
  searchError.value = ''

  if (rect) {
    addMemberStyle.value = {
      top: `${Math.min(rect.bottom + 8, Math.max(window.innerHeight - 300, 8))}px`,
      left: `${Math.max(8, Math.min(rect.left - 40, window.innerWidth - 280))}px`
    }
  }
}

function closeAddMember() {
  addMemberTeam.value = ''
  addMemberKeyword.value = ''
  searchResults.value = []
  searchError.value = ''
}

// 用 watch 而不是 @input：同一个 input 上 v-model 与 @input 的执行顺序不保证，
// 直接用 @input 会读到上一次的关键字，导致第一次搜索关键字为空
watch(addMemberKeyword, () => {
  if (searchTimer !== null) clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => void searchUsers(), 260)
})

async function searchUsers() {
  const keyword = addMemberKeyword.value.trim()
  if (!keyword) {
    searchResults.value = []
    searchError.value = ''
    return
  }

  searchingUsers.value = true
  searchError.value = ''

  try {
    const res = await authFetch(`/api/undercover/users/search?q=${encodeURIComponent(keyword)}`)

    if (res.ok) {
      const data = await res.json()
      searchResults.value = data.users ?? []
      return
    }

    // 专用搜索接口不可用时（例如后端还没重启）兜底用完整战网ID列表本地过滤
    console.warn('[Undercover] 搜索接口不可用，改用战网ID列表兜底:', res.status)
    await searchUsersFallback(keyword)
  } catch (error) {
    console.error(error)
    await searchUsersFallback(keyword)
  } finally {
    searchingUsers.value = false
  }
}

async function searchUsersFallback(keyword: string) {
  try {
    const res = await fetch('/api/users/battletaglist', { cache: 'no-store' })
    if (!res.ok) throw new Error('获取战网ID列表失败')

    const tags: string[] = await res.json()
    const lower = keyword.toLowerCase()

    searchResults.value = tags
      .filter((tag) => tag.toLowerCase().includes(lower))
      .slice(0, 20)
      .map((battletag) => ({ battletag }))
  } catch (error) {
    console.error(error)
    searchResults.value = []
    searchError.value = '搜索失败，请确认已登录后重试'
  }
}

function forceAddMemberToTeam(user: SearchUser) {
  if (!addMemberTeam.value) return

  const team = addMemberTeam.value
  send({
    type: 'forceAddMember',
    battletag: user.battletag,
    seat: team
  })

  showToast(`已把 ${user.battletag.split('#')[0]} 加到${team === 'team1' ? '队伍1' : '队伍2'}`)
  closeAddMember()

  // 1.5 秒内没有生效（例如后端未更新、连接异常）就给出提示，避免静默失败
  window.setTimeout(() => {
    const applied = (room.value?.members ?? []).some(
      (member) => member.battletag === user.battletag && member.seat === team
    )
    if (!applied) showToast('添加未生效，请稍后重试或刷新页面')
  }, 1500)
}

// 私密对象离开房间时自动退出私密频道
watch(
  () => room.value?.members.map((member) => member.userId).join(','),
  () => {
    if (chatChannel.value !== 'private' || !privateTarget.value) return
    const stillInRoom = room.value?.members.some((member) => member.userId === privateTarget.value?.userId)
    if (stillInRoom) return

    chatChannel.value = 'global'
    privateTarget.value = null
    showToast('私密对象已离开房间')
  }
)

/* =========================
   录音提示音 / 发送音效
   Web Audio 合成短音，不需要素材文件也没有加载延迟；
   音频上下文在按下的手势里创建，不受浏览器自动播放限制。
   （麦克风默认开着回声消除，扬声器放出的提示音基本不会被录进语音里）
========================= */
let sfxContext: AudioContext | null = null

function getSfxContext(): AudioContext | null {
  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null

  if (!sfxContext) sfxContext = new Ctor()
  if (sfxContext.state === 'suspended') void sfxContext.resume()
  return sfxContext
}

// 播放一个短音：freq 起始频率，toFreq 结束频率（不等时做滑音），duration 毫秒
function playTone(
  freq: number,
  toFreq: number,
  duration: number,
  delaySeconds = 0,
  gain = 0.09
) {
  const context = getSfxContext()
  if (!context) return

  const startAt = context.currentTime + delaySeconds
  const endAt = startAt + duration / 1000
  const osc = context.createOscillator()
  const volume = context.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, startAt)
  if (toFreq !== freq) osc.frequency.exponentialRampToValueAtTime(toFreq, endAt)

  // 淡入淡出，避免「啪」的爆音
  volume.gain.setValueAtTime(0.0001, startAt)
  volume.gain.exponentialRampToValueAtTime(gain, startAt + 0.012)
  volume.gain.exponentialRampToValueAtTime(0.0001, endAt)

  osc.connect(volume).connect(context.destination)
  osc.start(startAt)
  osc.stop(endAt + 0.02)
}

// 开始录音：上扬双音「嘀嘟」
function playRecordStartSfx() {
  playTone(740, 740, 0.07)
  playTone(1180, 1180, 0.09, 0.07)
}

// 语音发送成功：短促下滑「嗖」
function playVoiceSendSfx() {
  playTone(1380, 900, 0.1)
  playTone(680, 680, 0.08, 0.09, 0.07)
}

// 离开房间页时释放音频上下文，避免一直占着音频会话
function closeSfxContext() {
  void sfxContext?.close()
  sfxContext = null
}

/* =========================
   语音录制（最长 15 秒，base64 发送）
========================= */
const VOICE_MAX_SECONDS = 15
// 短于这个时长的录音不发（纯点击/误触），并给一次提示
const VOICE_MIN_SECONDS = 0.5
const isRecording = ref(false)
// 正在等麦克风流就绪（预热后这一步几乎瞬时完成，仅用于给按下瞬间的视觉反馈）
const isPreparing = ref(false)
const recordingSeconds = ref(0)

// 按住时的按钮文案：预热后「正在启动…」几乎不可见，但保证按下一定有反馈
const recordButtonLabel = computed(() => {
  if (isPreparing.value) return '正在启动…'
  if (isRecording.value) return `松开结束 ${recordingSeconds.value.toFixed(1)}s / 15s`
  return '按住说话'
})

let mediaRecorder: MediaRecorder | null = null
let recordedChunks: Blob[] = []
let recordTimer: number | null = null
let holdFailsafeTimer: number | null = null
let recordStartedAt = 0
let pendingVoiceDuration = 0
let pendingVoiceSend = false

// 按住说话：按住开始录音，上滑超过阈值松开即取消
const CANCEL_SLIDE_PX = 60
const cancelRecord = ref(false)

let holdActive = false
let holdStartY = 0

// 按住说话期间锁住整页的文本选择与长按菜单（手机上滑取消时容易触发系统「复制/选择」）
// 注意：必须「按下瞬间同步」调用。申请麦克风权限 / getUserMedia 都是异步的，
// 等拿到音频流再加锁时，浏览器早已用按下那一刻的状态弹出了长按菜单。
function blockSelectionGesture(event: Event) {
  event.preventDefault()
}

function clearDocumentSelection() {
  const selection = window.getSelection()
  if (selection && !selection.isCollapsed) selection.removeAllRanges()
}

let selectionGuardActive = false

function lockPageSelection(on: boolean) {
  document.body.classList.toggle('is-recording', on)
  if (on === selectionGuardActive) return
  selectionGuardActive = on

  if (on) {
    // 捕获阶段拦截：长按选中、系统长按菜单、拖拽、上滑触发的页面滚动
    document.addEventListener('selectstart', blockSelectionGesture, true)
    document.addEventListener('contextmenu', blockSelectionGesture, true)
    document.addEventListener('dragstart', blockSelectionGesture, true)
    document.addEventListener('touchstart', blockSelectionGesture, { capture: true, passive: false })
    document.addEventListener('touchmove', blockSelectionGesture, { capture: true, passive: false })
    document.addEventListener('selectionchange', clearDocumentSelection)
  } else {
    document.removeEventListener('selectstart', blockSelectionGesture, true)
    document.removeEventListener('contextmenu', blockSelectionGesture, true)
    document.removeEventListener('dragstart', blockSelectionGesture, true)
    document.removeEventListener('touchstart', blockSelectionGesture, true)
    document.removeEventListener('touchmove', blockSelectionGesture, true)
    document.removeEventListener('selectionchange', clearDocumentSelection)
    clearDocumentSelection()
  }
}

type HoldEvent = PointerEvent | TouchEvent | MouseEvent

// 取出手势的纵向坐标：Pointer 事件直接用 clientY，触摸事件取第一个触点
function holdEventClientY(event: HoldEvent): number {
  if ('touches' in event && event.touches.length > 0) return event.touches[0].clientY
  if ('changedTouches' in event && event.changedTouches.length > 0) {
    return event.changedTouches[0].clientY
  }
  return (event as MouseEvent).clientY ?? 0
}

async function startRecording(event: HoldEvent) {
  if (isRecording.value || holdActive) return

  holdActive = true
  holdStartY = holdEventClientY(event)
  cancelRecord.value = false
  // 按下瞬间就给反馈：按钮立刻变成「正在启动…」，不会再出现「按了没反应」
  isPreparing.value = true
  // 在按下的手势里同步唤醒音频上下文（iOS 上异步回调里创建会没声音）
  getSfxContext()
  // 先加锁，再申请权限（同步执行，不给浏览器的长按菜单留窗口）
  lockPageSelection(true)
  // 输入法还停留在输入框上时，长按可能会顺带弹出「复制 / emoji」面板，先把焦点收掉
  const focused = document.activeElement as HTMLElement | null
  if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) focused.blur()
  // 指针捕获：手指/鼠标滑出窗口再松开也能收到 pointerup，
  // 避免状态卡在「一直按住」导致之后按什么都不响应
  try {
    const target = event.currentTarget as HTMLElement | null
    if (target && 'pointerId' in event) target.setPointerCapture?.(event.pointerId)
  } catch {
    // 某些浏览器不支持指针捕获，忽略
  }
  // 监听也同步挂上：申请权限 / 取流是异步的，期间松手必须能被捕获，
  // 否则「快速点一下」会被当成一直按住，录音停不下来
  window.addEventListener('pointermove', onHoldMove)
  window.addEventListener('pointerup', handlePointerEnd)
  window.addEventListener('pointercancel', handlePointerEnd)
  // 兜底：老内核（如部分内置浏览器）没有 Pointer Events，退回 touch / mouse 事件
  window.addEventListener('touchmove', onHoldMove)
  window.addEventListener('touchend', handlePointerEnd)
  window.addEventListener('touchcancel', handlePointerEnd)
  window.addEventListener('mousemove', onHoldMove)
  window.addEventListener('mouseup', handlePointerEnd)
  // 兜底：任何异常情况下 20 秒后强制收口（正常录音 15 秒自动结束）
  holdFailsafeTimer = window.setTimeout(() => endHold(true), 20000)

  // 语音模式进入时已经预热好麦克风，这里通常同步拿到流
  const stream = await ensureMicStream()
  isPreparing.value = false

  // 取流期间就松手了：什么都不做，锁在 endHold 里已经解除
  if (!holdActive) {
    removeHoldListeners()
    lockPageSelection(false)
    return
  }

  // 没拿到流（权限被拒 / 超时）：直接复位，避免卡住后续按下
  if (!stream) {
    holdActive = false
    removeHoldListeners()
    lockPageSelection(false)
    return
  }

  recordedChunks = []
  pendingVoiceSend = false
  mediaRecorder = new MediaRecorder(stream)
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data)
  }
  mediaRecorder.onstop = () => {
    void uploadRecording()
  }
  mediaRecorder.start()

  isRecording.value = true
  recordStartedAt = Date.now()
  recordingSeconds.value = 0
  // 开始录音提示音
  playRecordStartSfx()

  // 到 15 秒自动结束并发送
  recordTimer = window.setInterval(() => {
    recordingSeconds.value = (Date.now() - recordStartedAt) / 1000
    if (Date.now() - recordStartedAt >= VOICE_MAX_SECONDS * 1000) endHold(true)
  }, 100)
}

// 按住过程中上滑超过阈值 → 松开后取消发送
function onHoldMove(event: HoldEvent) {
  if (!isRecording.value) return
  cancelRecord.value = holdStartY - holdEventClientY(event) > CANCEL_SLIDE_PX
}

function handlePointerEnd() {
  endHold()
}

function removeHoldListeners() {
  window.removeEventListener('pointermove', onHoldMove)
  window.removeEventListener('pointerup', handlePointerEnd)
  window.removeEventListener('pointercancel', handlePointerEnd)
  window.removeEventListener('touchmove', onHoldMove)
  window.removeEventListener('touchend', handlePointerEnd)
  window.removeEventListener('touchcancel', handlePointerEnd)
  window.removeEventListener('mousemove', onHoldMove)
  window.removeEventListener('mouseup', handlePointerEnd)
  if (holdFailsafeTimer !== null) {
    clearTimeout(holdFailsafeTimer)
    holdFailsafeTimer = null
  }
}

// 松手 / 取消 / 超时统一收口
function endHold(forceSend = false) {
  holdActive = false
  isPreparing.value = false
  removeHoldListeners()

  if (!isRecording.value) {
    cancelRecord.value = false
    // 在「申请权限 / 取流」窗口内就松手了：解除长按锁定
    lockPageSelection(false)
    return
  }

  stopRecording(forceSend || !cancelRecord.value)
  cancelRecord.value = false
}

// 离开页面等场景：直接丢弃，不发送
function abortRecording() {
  holdActive = false
  isPreparing.value = false
  removeHoldListeners()
  cancelRecord.value = false
  if (isRecording.value) stopRecording(false)
  // 可能停在「申请权限 / 取流」窗口，兜底解锁
  lockPageSelection(false)
  // 离开房间页面 / 切后台时释放预热流（关掉系统录音指示灯）
  closeMicStream()
}

function stopRecording(send: boolean) {
  if (!isRecording.value) return

  isRecording.value = false
  isPreparing.value = false
  lockPageSelection(false)
  pendingVoiceSend = send
  pendingVoiceDuration = Math.min((Date.now() - recordStartedAt) / 1000, VOICE_MAX_SECONDS)

  if (recordTimer !== null) {
    clearInterval(recordTimer)
    recordTimer = null
  }

  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
  else mediaRecorder = null
}

async function uploadRecording() {
  const mime = mediaRecorder?.mimeType || 'audio/webm'
  const chunks = recordedChunks

  recordedChunks = []
  mediaRecorder = null
  // 预热流不在这里释放：保持热态，下次按下仍是零延迟

  const blob = new Blob(chunks, { type: mime })
  if (!pendingVoiceSend || blob.size === 0) return
  // 纯点击 / 误触：给一次明确提示，而不是「按了没反应」
  if (pendingVoiceDuration < VOICE_MIN_SECONDS) {
    showToast(`按住时间太短（不足 ${VOICE_MIN_SECONDS} 秒），已取消发送`)
    return
  }

  try {
    const dataUrl = await blobToDataUrl(blob)
    send({
      type: 'chat',
      kind: 'voice',
      channel: chatChannel.value,
      voice: { dataUrl, duration: Number(pendingVoiceDuration.toFixed(1)) }
    })
    // 发送成功音效
    playVoiceSendSfx()
    scrollChatToBottom()
  } catch (error) {
    console.error(error)
    showToast('语音发送失败')
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/* =========================
   语音播放（频道内自动播放 + 点击回放）
========================= */
const audioEl = ref<HTMLAudioElement | null>(null)
const playingVoiceId = ref<number | null>(null)
const voiceCache = new Map<number, string>()
let lastAutoPlayedMessageId = 0

function stopVoice() {
  const audio = audioEl.value
  if (audio) {
    audio.pause()
    audio.currentTime = 0
  }
  playingVoiceId.value = null
}

async function playVoice(message: ChatMessage) {
  const voiceId = message.voiceId
  if (!voiceId) return

  // 点击正在播放的语音 → 停止
  if (playingVoiceId.value === voiceId) {
    stopVoice()
    return
  }

  let src = voiceCache.get(voiceId)
  if (!src) {
    try {
      const res = await authFetch(`/api/undercover/rooms/${roomNo.value}/voice/${voiceId}`)
      if (!res.ok) throw new Error('语音已过期')

      const data = await res.json()
      src = String(data.dataUrl ?? '')
      if (src) voiceCache.set(voiceId, src)
    } catch (error) {
      console.error(error)
      showToast('语音已过期，无法播放')
      return
    }
  }

  const audio = audioEl.value
  if (!audio || !src) return

  audio.src = src
  audio.currentTime = 0
  playingVoiceId.value = voiceId

  try {
    await audio.play()
  } catch (error) {
    console.error('自动播放被拦截', error)
    playingVoiceId.value = null
  }
}

// 有新消息时自动滚到底部（用户正在翻看历史则不打断）；他人发来的语音自动播放
watch(
  () => visibleChatMessages.value.length,
  (length, previous = 0) => {
    const added = length - previous
    // 已读完 = 内部在底部 且 聊天窗口完整可见
    const read = isChatRead()

    if (read) {
      scrollChatToBottom()
    } else if (added > 0) {
      // 不在底部时累计未读，系统消息不计入
      unreadCount.value += visibleChatMessages.value
        .slice(previous)
        .filter((message) => !message.system)
        .length
    }

    const latest = visibleChatMessages.value[visibleChatMessages.value.length - 1]
    if (!latest || latest.system) return
    if (latest.kind !== 'voice') return
    if (latest.userId === myUserId.value) return
    if (latest.id === lastAutoPlayedMessageId) return

    lastAutoPlayedMessageId = latest.id
    void playVoice(latest)
  }
)

/* =========================
   席位操作
========================= */
function isMine(slot: SeatMember | null): boolean {
  return !!slot && slot.userId === myUserId.value
}

// 点击他人卡片：以该卡头像为原点弹出选项卡
function openUserDialog(member: SeatMember, event: MouseEvent) {
  const card = event.currentTarget as HTMLElement | null
  const avatar = card?.querySelector('.member-avatar') as HTMLElement | null
  const rect = (avatar ?? card)?.getBoundingClientRect()

  dialogOrigin.value = rect
    ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: Math.max(rect.width, 28) }
    : null
  dialogMember.value = member
}

function closeUserDialog() {
  dialogMember.value = null
}

function onSeatClick(
  team: TeamKey | 'spectator',
  index: number,
  slot: SeatMember | null,
  event: MouseEvent
) {
  if (!room.value) return

  // 道具倒计时内：点谁就对谁使用道具
  if (activeItem.value && slot) {
    if (isMine(slot)) {
      showToast('不能对自己使用道具')
      return
    }
    useItemOn(slot.userId)
    return
  }

  if (isMine(slot)) {
    showToast('你已在这个席位')
    return
  }
  if (slot) {
    // 点击他人卡片 → 弹出选项卡（不再提示席位已被占用）
    openUserDialog(slot, event)
    return
  }

  send({ type: 'move', seat: team, index })
}

/* =========================
   队伍名称（房主可编辑）
========================= */

function setTeamInputRef(el: unknown, team: TeamKey) {
  teamInputs[team] = (el as HTMLInputElement | null) ?? null
}

function startEditTeam(team: TeamKey) {
  if (!isOwner.value || !room.value) return

  editingTeam.value = team
  teamNameDraft.value = room.value[team].name
  nextTick(() => teamInputs[team]?.focus())
}

function saveTeamName(team: TeamKey) {
  if (editingTeam.value !== team) return

  const name = teamNameDraft.value.trim()
  editingTeam.value = ''

  if (!name || name === room.value?.[team].name) return
  send({ type: 'renameTeam', team, name })
}

/* =========================
   其他
========================= */

/* =========================
   退出房间：房主可选转让房主 / 解散房间
========================= */
const showExitDialog = ref(false)
const pickingTransferTarget = ref(false)

const transferCandidates = computed(() =>
  (room.value?.members ?? []).filter((member) => member.userId !== myUserId.value)
)

function handleExitClick() {
  if (!isOwner.value) {
    void leaveRoomNow()
    return
  }

  pickingTransferTarget.value = false
  showExitDialog.value = true
}

// 等一拍让消息发出去，再关连接跳回大厅
async function leaveRoomNow() {
  send({ type: 'exit' })
  await new Promise((resolve) => setTimeout(resolve, 140))
  closeSocket()
  router.push('/Undercover')
}

async function dissolveRoomByOwner() {
  showExitDialog.value = false
  send({ type: 'dissolveRoom' })
  await new Promise((resolve) => setTimeout(resolve, 180))
  closeSocket()
  router.push('/Undercover')
}

async function transferOwnerAndExit(member: SeatMember) {
  showExitDialog.value = false
  send({ type: 'transferOwner', userId: member.userId })
  await new Promise((resolve) => setTimeout(resolve, 180))
  await leaveRoomNow()
}

/* =========================
   生命周期（路由被 keep-alive 缓存，必须用 activated / deactivated）
========================= */

function activatePage() {
  if (pageActive) return
  pageActive = true

  document.addEventListener('visibilitychange', reportBackground)
  document.addEventListener('visibilitychange', onMicVisibilityChange)
  window.addEventListener('focus', reportBackground)
  window.addEventListener('blur', reportBackground)
  // 页面滚动也会影响「聊天窗口是否完整可见」，用于未读判定
  window.addEventListener('scroll', onChatScroll, { passive: true })
  // 回到房间页且处于语音模式时，重新预热麦克风
  if (inputMode.value === 'voice') void ensureMicStream()
  connect()
  startOnlineHeartbeat()
}

function deactivatePage() {
  if (!pageActive) return
  pageActive = false

  abortRecording()
  stopItemTimer()
  stopOnlineHeartbeat()
  document.removeEventListener('visibilitychange', reportBackground)
  document.removeEventListener('visibilitychange', onMicVisibilityChange)
  window.removeEventListener('focus', reportBackground)
  window.removeEventListener('blur', reportBackground)
  window.removeEventListener('scroll', onChatScroll)
  closeSfxContext()
  closeSocket()
}

onMounted(activatePage)
onActivated(activatePage)
onDeactivated(deactivatePage)
onUnmounted(deactivatePage)
</script>

<style scoped>
.room-page {
  min-height: 100vh;
  padding-bottom: 24px;
}

/* 已选地图背景：铺满 + 毛玻璃模糊 */
.map-backdrop {
  position: fixed;
  inset: 0;
  z-index: 0;
  background-size: cover;
  background-position: center;
  /* 只轻微模糊，保留地图本身的辨识度 */
  filter: blur(2px);
  transform: scale(1.02);
  opacity: 0.5;
  pointer-events: none;
}

.room-page .content-area {
  max-width: 1200px;
  /* 顶栏不再与页面上方留间距 */
  padding-top: 0;
  /* 保留 5% 的毛玻璃：极淡的底 + 原模糊强度的 5% */
  background: rgba(128, 128, 128, 0.05);
  backdrop-filter: blur(calc(var(--glass-blur) * 0.05));
  -webkit-backdrop-filter: blur(calc(var(--glass-blur) * 0.05));
}

/* =========================
   房间标题卡片
========================= */
.room-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--card-bg);
  border-radius: 32px;
  padding: 10px 16px;
  /* 底部间距改为 0 */
  margin: 0;
  box-shadow: var(--shadow);
}

.room-header-main {
  flex: 1;
  min-width: 0;
  text-align: center;
}

.room-no {
  font-size: 1.3rem;
  line-height: 1.25;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--text-primary);
}

.room-title {
  font-size: 0.9rem;
  opacity: 0.75;
  color: var(--text-primary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.leave-btn {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  border-radius: 48px;
  padding: 7px 16px;
  font-size: 0.85rem;
  font-weight: 700;
  font-family: inherit;
  color: white;
  background: #ff4d4f;
  cursor: pointer;
  transition: 0.2s ease;
}

.leave-btn:hover {
  transform: translateY(-50%) scale(1.04);
  filter: brightness(1.06);
}

.list-tip {
  text-align: center;
  font-size: 0.95rem;
  opacity: 0.75;
  color: var(--text-primary);
  padding: 60px 12px;
}

/* =========================
   两个队伍栏
========================= */
.battle-area {
  display: grid;
  /* 队伍1 | 游戏面板 | 队伍2：两侧队伍栏各占 1/4、中间面板占 1/2 */
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr);
  gap: 16px;
  /* 抵消 content-area 的左右内边距，让两侧队伍栏贴到两边边框（与边框距离 0） */
  margin-left: -20px;
  margin-right: -20px;
  /* 裁掉队伍栏向外移动后超出 content-area 的部分（边框不会露在外面） */
  overflow: hidden;
}

/* 中间 1/2：游戏阶段面板 */
.game-panel {
  min-width: 0;
  align-self: start;
  padding: 16px;
  border-radius: var(--glass-radius);
  background: var(--section-bg);
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

/* 队伍栏下方的「+」：仅房主可见 */
.add-member-btn {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 6px 0;
  border: 1px dashed var(--input-border, rgba(0, 0, 0, 0.12));
  border-radius: 12px;
  background: transparent;
  color: var(--text-primary);
  font-size: 18px;
  line-height: 1;
  font-family: inherit;
  cursor: pointer;
  transition: 0.15s ease;
}

.add-member-btn:hover {
  background: #2c3e66;
  color: #fff;
  border-color: transparent;
}

/* 搜索悬浮框 */
.add-member-mask {
  position: fixed;
  inset: 0;
  z-index: 3100;
  background: rgba(0, 0, 0, 0.25);
}

.add-member-panel {
  position: fixed;
  width: min(260px, 86vw);
  padding: 12px;
  border-radius: 16px;
  background: var(--bg-primary);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35), inset 0 0 0 1px var(--glass-border);
}

.add-member-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid var(--input-border, rgba(0, 0, 0, 0.12));
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.85rem;
  font-family: inherit;
}

.add-member-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
  margin: 8px 0;
}

.add-member-tip {
  margin: 0;
  font-size: 0.78rem;
  text-align: center;
  opacity: 0.65;
  color: var(--text-primary);
}

.add-member-tip.error {
  opacity: 1;
  color: #ff4d4f;
}

.add-member-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: none;
  border-radius: 12px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.85rem;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.add-member-item:hover {
  background: #2c3e66;
  color: #fff;
}

.game-title {
  margin: 0 0 10px;
  font-size: 1.05rem;
  text-align: center;
  color: var(--text-primary);
}

.game-hint,
.game-chosen {
  margin: 0 0 8px;
  font-size: 0.8rem;
  text-align: center;
  opacity: 0.75;
  color: var(--text-primary);
}

.game-chosen {
  font-weight: 700;
  opacity: 1;
}

/* 「您获得选图权」：绿色提示 */
.map-right-hint {
  margin: 0 0 10px;
  padding: 4px 10px;
  border-radius: 10px;
  background: rgba(46, 204, 113, 0.18);
  color: #2ecc71;
  font-size: 0.85rem;
  font-weight: 700;
  text-align: center;
}

/* 「你为本局卧底」：醒目的红色提示（只发给卧底本人） */
.undercover-me {
  margin: 0 0 10px;
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(255, 77, 79, 0.18);
  color: #ff4d4f;
  font-size: 0.9rem;
  font-weight: 700;
  text-align: center;
}

/* 指定卧底列表里已选中的成员 */
.member-item.chosen {
  box-shadow: inset 0 0 0 2px #ff4d4f;
}

.undercover-mark {
  flex: 0 0 auto;
  padding: 0 6px;
  border-radius: 8px;
  background: #ff4d4f;
  color: #fff;
  font-size: 0.68rem;
  font-weight: 700;
}

/* 置灰不可用的选项（例如房主不在观战席时的「指定卧底」） */
.game-btn.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* 「卧底是：xxx」中屏公布 */
.undercover-result {
  margin: 0 0 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 77, 79, 0.16);
  color: #ff4d4f;
  font-size: 1rem;
  font-weight: 700;
  text-align: center;
  word-break: break-all;
}

/* 结算阶段投票列表：每个选项下方显示票数 */
.vote-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
  margin-bottom: 10px;
}

.vote-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: none;
  border-radius: 12px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.85rem;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--glass-border);
  transition: 0.15s ease;
}

.vote-item:hover {
  background: #2c3e66;
  color: #fff;
}

.vote-item.chosen {
  box-shadow: inset 0 0 0 2px #ff4d4f;
}

.vote-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.vote-count {
  flex: 0 0 auto;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(255, 159, 28, 0.2);
  color: #ff9f1c;
  font-size: 0.72rem;
  font-weight: 700;
}

/* 二次确认弹窗 */
.confirm-mask {
  position: fixed;
  inset: 0;
  z-index: 3400;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
}

.confirm-dialog {
  width: min(300px, 86vw);
  padding: 20px 18px 16px;
  border-radius: 18px;
  background: var(--bg-primary);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35), inset 0 0 0 1px var(--glass-border);
}

.confirm-text {
  margin: 0 0 16px;
  font-size: 0.92rem;
  line-height: 1.5;
  text-align: center;
  color: var(--text-primary);
}

.confirm-actions {
  display: flex;
  gap: 10px;
}

.confirm-btn {
  flex: 1;
  padding: 9px 14px;
  border: none;
  border-radius: 12px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  cursor: pointer;
  transition: 0.15s ease;
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.confirm-btn.primary {
  background: #2c3e66;
  color: #fff;
  font-weight: 700;
}

.confirm-btn:hover {
  filter: brightness(1.1);
}

/* 公布结果：红框扫过 / 停在卧底头像上 */
.seat.reveal-scan {
  box-shadow: 0 0 0 3px #ff4d4f;
}

.seat.reveal-hit {
  box-shadow: 0 0 0 3px #ff4d4f, 0 0 22px rgba(255, 77, 79, 0.75);
  animation: reveal-hit-pulse 0.9s ease-in-out infinite;
}

@keyframes reveal-hit-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 3px #ff4d4f, 0 0 12px rgba(255, 77, 79, 0.5);
  }
  50% {
    box-shadow: 0 0 0 4px #ff4d4f, 0 0 26px rgba(255, 77, 79, 0.9);
  }
}

/* 选图卡片最下方：其他人对本人的选图推荐 */
.recommend-list {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--glass-border);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.recommend-item {
  margin: 0;
  font-size: 0.8rem;
  color: #ff9f1c;
  /* 推荐文本靠左对齐 */
  text-align: left;
  word-break: break-all;
}

.game-btn {
  display: block;
  width: 100%;
  margin-bottom: 8px;
  padding: 10px 14px;
  border: none;
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.88rem;
  font-family: inherit;
  cursor: pointer;
  transition: 0.15s ease;
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.game-btn:hover {
  background: #2c3e66;
  color: #fff;
}

.game-btn.primary {
  background: #2c3e66;
  color: #fff;
  font-weight: 700;
}

.game-btn.plain {
  margin-bottom: 0;
  background: transparent;
  box-shadow: none;
  opacity: 0.8;
}

/* 授予选图权：成员列表 */
.member-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
  margin-bottom: 8px;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: none;
  border-radius: 12px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.85rem;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.member-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.member-item:not(:disabled):hover {
  background: #2c3e66;
  color: #fff;
}

.member-mini-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
}

.member-mini-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-column {
  min-width: 0;
  /* 用户栏（队伍栏）最大宽度 130px */
  max-width: 130px;
  background: var(--section-bg);
  border-radius: var(--glass-radius);
  /* 到内部元素的距离缩小 50%（16px → 8px） */
  padding: 8px;
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

/* 左栏贴左、右栏贴右，保持向两边边框融入 */
.battle-area > .team-column:first-child {
  justify-self: start;
  /* 向外移动 8px，超出部分被 .battle-area 裁掉 */
  transform: translateX(-8px);
}

.battle-area > .team-column:last-child {
  justify-self: end;
  transform: translateX(8px);
}

.team-header {
  margin-bottom: 12px;
}

.team-name {
  margin: 0;
  font-size: 1.05rem;
  text-align: center;
  /* 颜色由 uw-id-* 类决定（与聊天显示逻辑一致），未匹配时从父级继承 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-name.editable {
  cursor: pointer;
}

.edit-hint {
  font-size: 0.8rem;
  opacity: 0.6;
}

.team-name-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid var(--input-border, rgba(0, 0, 0, 0.12));
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 1rem;
  text-align: center;
  font-family: inherit;
}

.seat-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 席位容器：成员展示交给 UndercoverMemberSlot 组件（与观战席共用同一套显示） */
.seat {
  /* 卡片上限 100 × 80：上下内边距 6px，内容 68px，正好 80px 高，空位与有成员时等高 */
  padding: 6px 8px;
  max-width: 100px;
  max-height: 80px;
  min-width: 0;
  border-radius: 14px;
  background: var(--bg-secondary);
  box-shadow: inset 0 0 0 1px var(--glass-border);
  cursor: pointer;
  transition: 0.15s ease;
}

.seat:hover {
  transform: translateY(-2px);
}

.seat.empty {
  opacity: 0.72;
  border: 1px dashed rgba(140, 140, 140, 0.5);
  box-shadow: none;
}

.seat.mine {
  box-shadow: inset 0 0 0 2px var(--accent);
}

/* =========================
   观战席
========================= */
/* 观战席：1 × 6 居中排布，整行最高 80px（卡片本身也受 .seat 的 100 × 80 限制） */
.spectator-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 100px));
  justify-content: center;
  column-gap: 8px;
  max-height: 80px;
  /* 底部间距改为 0 */
  margin: 0;
}

/* 观战席格子复用 .seat 卡片（stacked 变体：上方仅头像，下方只显示标签） */
.spectator-slot {
  min-width: 0;
}

/* 观战席不显示虚线装饰框 */
.spectator-slot.empty {
  border: none;
}

/* =========================
   房主退出弹窗
========================= */
.exit-mask {
  position: fixed;
  inset: 0;
  z-index: 3200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
}

.exit-dialog {
  width: min(300px, 86vw);
  padding: 18px;
  border-radius: 20px;
  background: var(--bg-primary);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35), inset 0 0 0 1px var(--glass-border);
}

.exit-title {
  margin: 0 0 8px;
  font-size: 1.05rem;
  text-align: center;
  color: var(--text-primary);
}

.exit-desc {
  margin: 0 0 12px;
  font-size: 0.82rem;
  text-align: center;
  opacity: 0.7;
  color: var(--text-primary);
}

.exit-item {
  display: block;
  width: 100%;
  margin-bottom: 8px;
  padding: 11px 14px;
  border: none;
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  cursor: pointer;
  transition: 0.15s ease;
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.exit-item:hover {
  background: #2c3e66;
  color: #fff;
}

.exit-item.danger:hover {
  background: #ff4d4f;
}

.exit-item.plain {
  margin-bottom: 0;
  box-shadow: none;
  opacity: 0.8;
}

/* 转让房主：候选列表 */
.exit-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
  margin-bottom: 10px;
}

.exit-member {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: none;
  border-radius: 12px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.88rem;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.exit-member:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.exit-member:not(:disabled):hover {
  background: #2c3e66;
  color: #fff;
}

.exit-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
}

.exit-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exit-offline {
  flex: 0 0 auto;
  padding: 0 6px;
  border-radius: 8px;
  font-size: 0.65rem;
  color: #fff;
  background: #ff4d4f;
}

/* =========================
   手机适配
========================= */
/* =========================
   聊天栏
========================= */

/* 道具栏：38px 高，位于队伍列表与聊天列表之间 */
.item-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  margin: 12px 0;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--bg-secondary);
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.item-btn {
  position: relative;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  transition: 0.15s ease;
}

.item-btn:hover {
  transform: translateY(-2px);
}

.item-btn.active {
  background: rgba(46, 204, 113, 0.16);
}

.item-icon {
  width: 26px;
  height: 26px;
  object-fit: contain;
  /* 仅图标下移 2px，圆环等其它元素位置不变 */
  transform: translateY(2px);
  pointer-events: none;
}

/* 3 秒倒计时圆环（随进度减少） */
.item-ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
  pointer-events: none;
}

.item-ring .ring-track {
  fill: none;
  stroke: rgba(128, 128, 128, 0.25);
  stroke-width: 2.5;
}

.item-ring .ring-progress {
  fill: none;
  stroke: #2ecc71;
  stroke-width: 2.5;
  stroke-linecap: round;
}

.item-tip {
  font-size: 0.78rem;
  color: #2ecc71;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-area {
  position: relative;
  margin-top: 16px;
  background: var(--section-bg);
  border-radius: var(--glass-radius);
  padding: 10px 12px;
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

/* 未读消息球：聊天栏右上角 */
.unread-ball {
  position: absolute;
  top: 6px;
  right: 10px;
  z-index: 5;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border: none;
  border-radius: 999px;
  background: #ff4d4f;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  font-family: inherit;
  line-height: 22px;
  text-align: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  transition: 0.15s ease;
}

.unread-ball:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

/* 聊天记录：固定 380px 高度，超出可上下滚动 */
.chat-log {
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 380px;
  overflow-y: auto;
  font-size: 0.85rem;
  color: var(--text-primary);
}

.chat-line {
  line-height: 1.5;
  word-break: break-all;
}

/* 系统消息：[系统消息]：xxx */
.chat-line.system {
  opacity: 0.75;
  font-style: italic;
}

.chat-sender {
  font-weight: 700;
}

/* 聊天里的房主标签：放在 ID 后面 */
.chat-owner-tag {
  display: inline-block;
  margin: 0 2px;
  padding: 0 6px;
  border-radius: 10px;
  font-size: 0.7rem;
  color: #fff;
  background: #2c3e66;
}

/* 私密消息标记 */
.chat-private-tag {
  display: inline-block;
  margin-right: 4px;
  padding: 0 6px;
  border-radius: 10px;
  font-size: 0.7rem;
  color: #fff;
  background: #8b5cf6;
}

.chat-empty {
  text-align: center;
  padding: 8px 0;
  opacity: 0.6;
}

/* 输入框 + emoji + 发送按钮 */
.chat-input-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  /* 输入栏本身不可选中：Chrome 长按按钮时会把选区「向上找」到可选的祖先元素，
     只让录音按钮 user-select:none 挡不住（下方 textarea 单独恢复可选中） */
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.chat-input {
  flex: 1;
  min-width: 0;
  padding: 7px 12px;
  border-radius: 20px;
  border: 1px solid var(--input-border, rgba(0, 0, 0, 0.12));
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.85rem;
  font-family: inherit;
  line-height: 1.4;
  /* 自动换行 + 随内容加高（最高 120px，超出内部滚动） */
  resize: none;
  max-height: 120px;
  overflow-y: auto;
  /* 文字输入框仍然可以正常选中 / 复制 */
  user-select: text;
  -webkit-user-select: text;
  -webkit-touch-callout: default;
}

.emoji-btn,
.chat-send {
  flex: 0 0 auto;
  border: none;
  cursor: pointer;
  font-family: inherit;
  transition: 0.15s ease;
}

.emoji-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  font-size: 18px;
  line-height: 1;
  background: var(--bg-secondary);
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.chat-send {
  padding: 7px 16px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 700;
  color: #fff;
  background: #2c3e66;
}

.emoji-btn:hover,
.chat-send:hover {
  filter: brightness(1.08);
}

/* 频道切换按钮（emoji 右侧，点击循环 全局 → 友方 → 敌方） */
.channel-btn {
  flex: 0 0 auto;
  padding: 7px 12px;
  border: none;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 700;
  font-family: inherit;
  color: #fff;
  cursor: pointer;
  transition: 0.15s ease;
}

.channel-global {
  background: #6c757d;
}

.channel-friendly {
  background: #4dabf7;
}

.channel-enemy {
  background: #ff4d4f;
}

/* 私密频道：紫色 */
.channel-private {
  background: #8b5cf6;
}

.channel-btn:hover {
  filter: brightness(1.08);
}

/* 录音按钮（语音模式） */
.record-btn {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border-radius: 20px;
  border: 1px dashed var(--input-border, rgba(0, 0, 0, 0.12));
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
  transition: 0.15s ease;
  /* 按住说话：不要触发页面滚动 / 长按选中 */
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.record-btn.recording {
  border-style: solid;
  border-color: #ff4d4f;
  background: rgba(255, 77, 79, 0.15);
  color: #ff4d4f;
  font-weight: 700;
}

/* 按下瞬间（等麦克风流就绪）：立刻给出可见反馈 */
.record-btn.preparing {
  border-style: solid;
  border-color: #ff9c6e;
  color: #ff9c6e;
}

/* 按住说话时的浮层：提示上滑取消 / 已进入取消状态 */
.record-hud {
  position: absolute;
  left: 50%;
  bottom: 46px;
  z-index: 6;
  /* 绝不拦截指针：浮层所在区域绝不能挡住录音按钮 */
  pointer-events: none;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 18px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.78);
  color: #fff;
  font-size: 0.82rem;
  white-space: nowrap;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.3);
}

.record-hud .hud-time {
  font-size: 0.75rem;
  opacity: 0.75;
}

.record-hud.cancel {
  background: rgba(122, 20, 22, 0.92);
}

/* 上滑超过阈值后的红色 ✗（呼吸动画） */
.cancel-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #ff4d4f;
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  animation: cancel-pulse 0.7s ease-in-out infinite;
}

@keyframes cancel-pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 77, 79, 0.65);
  }
  70% {
    transform: scale(1.14);
    box-shadow: 0 0 0 12px rgba(255, 77, 79, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 77, 79, 0);
  }
}

/* 发送键左侧：点击在 ⌨️ / 🎙️ 之间切换（按钮显示的是「切换目标」） */
.mode-btn {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 50%;
  font-size: 17px;
  line-height: 1;
  background: var(--bg-secondary);
  box-shadow: inset 0 0 0 1px var(--glass-border);
  cursor: pointer;
  transition: 0.15s ease;
}

.mode-btn:hover {
  filter: brightness(1.08);
}

.chat-send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* 聊天里的语音消息：点击播放 / 回放 */
.voice-play {
  display: inline-block;
  margin: 0 4px;
  padding: 2px 10px;
  border: none;
  border-radius: 14px;
  font-size: 0.78rem;
  font-family: inherit;
  color: #fff;
  background: #2c3e66;
  cursor: pointer;
  transition: 0.15s ease;
}

.voice-play.playing {
  background: #4dabf7;
}

.voice-play:hover {
  filter: brightness(1.1);
}

/* emoji 面板 */
.emoji-panel {
  position: absolute;
  left: 0;
  bottom: 44px;
  z-index: 5;
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 4px;
  padding: 8px;
  border-radius: 14px;
  background: var(--bg-primary);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25), inset 0 0 0 1px var(--glass-border);
}

.emoji-item {
  cursor: pointer;
  padding: 3px;
  border-radius: 6px;
  font-size: 18px;
  line-height: 1;
  text-align: center;
}

.emoji-item:hover {
  background: var(--bg-secondary);
}

@media (max-width: 768px) {
  .battle-area {
    gap: 10px;
  }

  .room-header {
    padding: 8px 12px;
  }

  .leave-btn {
    left: 8px;
    padding: 6px 12px;
    font-size: 0.8rem;
  }
}
</style>
