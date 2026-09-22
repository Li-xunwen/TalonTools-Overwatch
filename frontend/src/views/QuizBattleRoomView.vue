<template>
  <div class="room-page news-page">
    <Toast :message="toastMessage" :duration="3000" />

    <!-- 已选地图作为页面背景（毛玻璃模糊） -->
    <div
      v-if="mapBackdropUrl"
      class="map-backdrop"
      :style="{ backgroundImage: `url(${mapBackdropUrl})` }"
    ></div>

    <div ref="contentAreaRef" class="content-area">
      <!-- 顶栏：左侧退出房间，中间为缩小后的观战席（不再显示房间号与房间标题） -->
      <div ref="boardRef" class="room-header">
        <button class="leave-btn" @click="handleExitClick">退出</button>

        <!-- 观战席：1 × 5，整行最高 60px -->
        <div v-if="room" class="spectator-row">
          <div
            v-for="(slot, index) in room.spectators"
            :key="`spectator-${index}`"
            class="seat spectator-slot"
            :data-user-id="slot?.userId"
            data-team="spectator"
            :data-seat-index="index"
            :class="{ empty: !slot, mine: isMine(slot) }"
            @click="onSeatClick('spectator', index, slot, $event)"
            @pointerdown="onCardPointerDown($event, 'spectator', index, slot)"
          >
            <!-- 仅头像在上，标签在下；点击他人卡片弹出选项卡 -->
            <UndercoverMemberSlot
              :member="slot"
              :mine="isMine(slot)"
              stacked
              :name-class="idColorClass(slot?.seat)"
            />
          </div>
        </div>

        <!-- 道具：收起时只显示道具图标，点击展开悬浮窗；
             选中后收起悬浮窗，图标变为鸡蛋 / 玫瑰花并开始 3 秒倒计时 -->
        <div class="item-dock" @click.stop>
          <button
            class="item-trigger"
            :class="{ active: !!activeItem }"
            :title="activeItem ? activeItemTitle : '道具'"
            @click="toggleItemPanel"
          >
            <!-- 倒计时圆环：3 秒内逐渐减少 -->
            <svg v-if="activeItem" class="item-ring" viewBox="0 0 36 36">
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
            <img class="item-icon" :src="itemTriggerIcon" :alt="activeItemTitle">
          </button>

          <!-- 悬浮窗：鸡蛋 / 玫瑰花 -->
          <div v-if="showItemPanel" class="item-panel">
            <button
              v-for="item in ITEMS"
              :key="item.type"
              class="item-option"
              :title="item.title"
              @click="selectItem(item.type)"
            >
              <img class="item-icon" :src="item.icon" :alt="item.title">
            </button>
          </div>

          <span v-if="activeItem && !showItemPanel" class="item-tip">
            点击目标头像{{ activeItem === 'egg' ? '砸鸡蛋' : '献花' }}
            <template v-if="activeItemSentCount > 0">
              <b class="item-count">×</b>{{ activeItemSentCount }}
            </template>
          </span>
        </div>

        <!-- 设置：深色模式 / 自动播放语音 / 音量增益 -->
        <div class="settings-dock">
          <button class="settings-trigger" title="设置" @click="showSettings = true">
            <img class="settings-icon" src="/ico/设置.svg" alt="设置">
          </button>
        </div>
      </div>

      <div v-if="!room" class="list-tip">
        {{ errorMessage || '正在连接房间会话...' }}
      </div>

      <template v-else>
        <!-- 刷题战：演算面板独占一行（位于顶栏与队伍栏之间），下面是并排的两支队伍 -->
        <div class="quiz-teams">
          <template v-for="team in teamKeys" :key="team">
            <!-- 演算 / 阶段面板：整行宽度，不受队伍栏限制 -->
            <section v-if="team === 'team2'" ref="quizPanelRef" class="quiz-panel">
              <!-- 内容按面板高度自适应缩放（见 fitQuizPanel） -->
              <div ref="quizPanelInnerRef" class="quiz-panel-inner">
                <!-- 刷题战流程：配置 → 准备 → 作答 → 投票 → 结算 -->
                <!-- 配置阶段：房主选择题目范围与难度范围 -->
                <section v-if="quizPhase === 'config'" class="quiz-stage">
                  <h3 class="stage-title">设置题目范围</h3>
                  <p class="stage-hint">房主选择标签与难度区间，共抽 {{ QUIZ_QUESTION_TOTAL }} 道题</p>

                  <template v-if="isOwner">
                    <div class="stage-block">
                      <span class="stage-label">题目范围（标签，可多选；不选=全部）</span>
                      <div class="stage-tags">
                        <button
                          v-for="tag in quizTagOptions"
                          :key="tag.name"
                          class="stage-chip"
                          :class="{ active: quizConfig.tags.includes(tag.name) }"
                          @click="toggleQuizTag(tag.name)"
                        >{{ tag.name }}<span class="stage-chip-count">{{ tag.count }}</span></button>
                        <span v-if="!quizTagOptions.length" class="stage-hint">题库暂无标签</span>
                      </div>
                    </div>

                    <div class="stage-block">
                      <span class="stage-label">
                        难度范围：{{ quizConfig.minDifficulty }} ~ {{ quizConfig.maxDifficulty }} / 10
                      </span>
                      <div class="stage-range-row">
                        <input
                          v-model.number="quizConfig.minDifficulty"
                          class="stage-range"
                          type="range"
                          min="0"
                          max="10"
                          step="1"
                          @change="submitQuizConfig"
                        >
                        <input
                          v-model.number="quizConfig.maxDifficulty"
                          class="stage-range"
                          type="range"
                          min="0"
                          max="10"
                          step="1"
                          @change="submitQuizConfig"
                        >
                      </div>
                    </div>

                    <div class="stage-actions">
                      <button class="stage-btn" @click="submitQuizConfig">保存范围</button>
                      <button class="stage-btn primary" @click="prepareQuiz">进入准备阶段</button>
                    </div>
                  </template>
                  <p v-else class="stage-hint">等待房主设置题目范围…</p>
                </section>

                <!-- 准备阶段 -->
                <section v-else-if="quizPhase === 'ready'" class="quiz-stage">
                  <h3 class="stage-title">准备阶段</h3>
                  <p class="stage-hint">
                    范围：
                    <template v-if="quizConfig.tags.length">{{ quizConfig.tags.join('、') }}</template>
                    <template v-else>全部标签</template>
                    ｜难度 {{ quizConfig.minDifficulty }} ~ {{ quizConfig.maxDifficulty }} / 10
                  </p>
                  <p class="stage-hint">共 {{ QUIZ_QUESTION_TOTAL }} 道题，每题 {{ QUIZ_QUESTION_SECONDS }} 秒作答，之后 {{ QUIZ_VOTE_SECONDS }} 秒投票进入下一题</p>
                  <div class="stage-actions">
                    <button
                      v-if="!isOwner && !iAmSpectator"
                      class="stage-btn"
                      :class="{ primary: iAmQuizReady }"
                      @click="toggleQuizReady"
                    >{{ iAmQuizReady ? '已准备（点击取消）' : '准备' }}</button>

                    <button v-if="isOwner" class="stage-btn primary" @click="startQuizGame">
                      {{ quizAllReady ? '开始游戏' : `强制开始 ${quizReadyCount}/${quizMemberCount}` }}
                    </button>
                    <button v-if="isOwner" class="stage-btn" @click="backToQuizConfig">返回设置</button>
                    <span class="stage-hint">已准备 {{ quizReadyCount }}/{{ quizMemberCount }} 人</span>
                    <span v-if="iAmSpectator" class="stage-hint">观战席无需准备</span>
                  </div>
                </section>

                <!-- 作答 / 投票：渲染当前题目 -->
                <section v-else-if="quizQuestion" class="quiz-stage">
                  <div class="stage-head">
                    <h3 class="stage-title">
                      第 {{ quizIndex + 1 }} / {{ quizTotal }} 题
                      <span class="stage-tag">难度 {{ toDisplayDifficulty(quizQuestion.difficulty) }}/10</span>
                    </h3>
                    <span class="stage-countdown" :class="{ urgent: stageRemainSeconds <= 3 }">
                      {{ stagePhaseLabel }} {{ stageRemainSeconds }}s
                    </span>
                  </div>

                  <p v-if="quizQuestion.subtitle" class="stage-subtitle">{{ quizQuestion.subtitle }}</p>
                  <h4 class="question-title">{{ quizQuestion.title }}</h4>

                  <div class="question-body">
                    <img
                      v-if="quizResourceItem && quizResourceItem.kind === 'images'"
                      ref="questionImageRef"
                      class="question-image"
                      :src="quizResourceItem.url"
                      :alt="quizQuestion.title"
                      title="点击预览图片"
                      @click="openImagePreview(quizResourceItem.url)"
                      @load="fitQuizPanel"
                    >
                    <video
                      v-else-if="quizResourceItem && quizResourceItem.kind === 'videos'"
                      class="question-video"
                      :src="quizResourceItem.url"
                      controls
                      preload="metadata"
                    ></video>
                    <audio
                      v-else-if="quizResourceItem"
                      class="question-audio"
                      :src="quizResourceItem.url"
                      controls
                      preload="metadata"
                    ></audio>

                    <div class="question-options">
                      <div
                        v-for="option in quizQuestion.options"
                        :key="option.key"
                        class="option-wrapper"
                      >
                        <!-- 公布答案时：该选项上方浮现选择它的小头像 -->
                        <div v-if="quizVotersOf(option.key).length" class="option-voters">
                          <img
                            v-for="voter in quizVotersOf(option.key)"
                            :key="`${option.key}-${voter.userId}`"
                            class="option-voter-avatar"
                            :src="voter.avatar"
                            :alt="voter.displayName"
                            :title="voter.displayName"
                          >
                        </div>

                        <button
                          class="question-option"
                          :class="{
                            chosen: quizPhase === 'question' && myQuizAnswer === option.key,
                            correct: quizPhase === 'vote' && quizQuestion.answer === option.key,
                            wrong:
                              quizPhase === 'vote' &&
                              quizQuestion.answer !== option.key &&
                              quizVotersOf(option.key).length > 0
                          }"
                          :disabled="quizPhase !== 'question'"
                          @click="answerQuizQuestion(option.key)"
                        >
                          <span class="option-key">{{ option.key }}</span>
                          <span class="option-text">{{ option.text }}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <p v-if="quizPhase === 'question'" class="question-result">
                    <template v-if="myQuizAnswer">已选择 {{ myQuizAnswer }}（倒计时结束前可改选），等待本题结束…</template>
                    <template v-else>点击选项作答（{{ stageRemainSeconds }}s）</template>
                    ｜已作答 {{ quizAnsweredUserIds.length }}/{{ quizOnlineCount }} 人
                  </p>

                  <template v-else>
                    <p class="question-result">
                      正确答案：{{ quizQuestion.answer }}｜本题答对：{{ quizCorrectNames || '无人' }}
                    </p>
                    <div v-if="quizExplanation.text || quizExplanation.images.length" class="stage-explain">
                      <p v-if="quizExplanation.text" class="stage-explain-text">解析：{{ quizExplanation.text }}</p>
                      <div v-if="quizExplanation.images.length" class="stage-explain-images">
                        <img
                          v-for="url in quizExplanation.images"
                          :key="url"
                          class="stage-explain-image"
                          :src="url"
                          alt="解析配图"
                          @click="openImagePreview(url)"
                          @load="fitQuizPanel"
                        >
                      </div>
                    </div>
                    <div class="stage-actions">
                      <button
                        class="stage-btn primary"
                        :disabled="quizVotedUserIds.includes(myUserId ?? -1)"
                        @click="voteNextQuestion"
                      >
                        {{ quizVotedUserIds.includes(myUserId ?? -1) ? '已投票' : '投票进入下一题' }}
                      </button>
                      <span class="stage-hint">
                        已投票 {{ quizVotedUserIds.length }}/{{ quizOnlineCount }} 人 ·
                        {{ stageRemainSeconds }}s 后自动进入下一题
                      </span>
                    </div>
                  </template>
                </section>

                <!-- 结算 -->
                <section v-else-if="quizPhase === 'finished'" class="quiz-stage">
                  <h3 class="stage-title">本局结束（{{ quizTotal }} 道题）</h3>
                  <ol class="stage-scores">
                    <li v-for="row in quizScoreRows" :key="row.userId">
                      <span class="stage-score-name">{{ row.displayName }}</span>
                      <span class="stage-score-value">{{ row.score }} 题</span>
                    </li>
                  </ol>
                  <div class="stage-actions">
                    <button v-if="isOwner" class="stage-btn primary" @click="resetQuizGame">再来一局</button>
                    <p v-else class="stage-hint">等待房主开下一局…</p>
                  </div>
                </section>

                <p v-else class="stage-hint">正在连接刷题战…</p>
              </div>

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
                  class="seat quiz-seat"
                  :data-user-id="slot?.userId"
                  :data-team="team"
                  :data-seat-index="index"
                  :class="{ empty: !slot, mine: isMine(slot) }"
                  @click="onSeatClick(team, index, slot, $event)"
                  @pointerdown="onCardPointerDown($event, team, index, slot)"
                >
                  <!-- 成员展示与观战席共用同一个组件 -->
                  <UndercoverMemberSlot
                    :member="slot"
                    :mine="isMine(slot)"
                    :voters="undercoverVotersOf(slot?.userId)"
                    :name-class="idColorClass(slot?.seat)"
                  />
                </div>
              </div>

            </section>
          </template>
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
                :class="{ clickable: canOpenPrivateTag(message) }"
                :title="canOpenPrivateTag(message) ? '点击查看该用户' : '私密消息'"
                @click="openPrivateTagDialog(message, $event)"
              >{{ privateTagOf(message) }}</span><span
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
              title="切换频道：全局 / 友方"
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
      @request-swap="requestSeatSwapWith(dialogMember)"
      @switch-team="switchMemberTeam(dialogMember)"
      @to-spectator="moveMemberToSpectator(dialogMember)"
      @transfer-owner="transferOwnerToMember(dialogMember)"
      @copy="copyBattletag"
    />

    <!-- 对方申请与你交换位置：同意 / 拒绝 -->
    <div v-if="swapRequest" class="swap-mask">
      <div class="swap-panel">
        <p class="swap-title">
          <b>{{ swapRequest.fromDisplayName }}</b> 申请与你交换位置
        </p>
        <p class="swap-hint">同意后你们两人的席位（队伍 / 观战席）会互换</p>
        <div class="swap-actions">
          <button class="swap-btn" @click="respondSeatSwap(false)">拒绝</button>
          <button class="swap-btn primary" @click="respondSeatSwap(true)">同意</button>
        </div>
      </div>
    </div>

    <!-- 设置：深色模式 / 自动播放语音 / 音量增益 -->
    <UndercoverSettingsDialog v-if="showSettings" @close="showSettings = false" />

    <!-- 图片预览（项目自带的 ImageViewer） -->
    <ImageViewer
      :visible="showImageViewer"
      :src="previewImageSrc"
      @update:visible="showImageViewer = $event"
      @close="showImageViewer = false"
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
import { ref, reactive, computed, watch, onMounted, onActivated, onDeactivated, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Toast from '@/components/Toast.vue'
import UndercoverMemberSlot from '@/components/UndercoverMemberSlot.vue'
import UndercoverUserDialog from '@/components/UndercoverUserDialog.vue'
import UndercoverSettingsDialog from '@/components/UndercoverSettingsDialog.vue'
import ImageViewer from '@/components/ImageViewer.vue'
import { useRoomSettings } from '@/composables/useRoomSettings'
import type {
  ChatMessage,
  RoomState,
  SeatMember,
  SeatSwapRequestInfo
} from '@/types/undercover'
import { MAP_CATEGORIES } from '@/data/owMaps'
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
   房主拖动卡片：长按生成副本卡片，拖到目标席位松手交换位置
========================= */
const LONG_PRESS_MS = 350
// 手指自然抖动容忍度：超过这个位移才认为是「滑动」而不是长按
const DRAG_MOVE_TOLERANCE_PX = 12

interface CardPressState {
  userId: number
  seat: TeamKey | 'spectator'
  seatIndex: number
  rect: DOMRect
  offsetX: number
  offsetY: number
  card: HTMLElement
}

let cardPress: CardPressState | null = null
let cardDragGhost: HTMLElement | null = null
let cardDragTarget: HTMLElement | null = null
let longPressTimer: number | null = null
let pressStartX = 0
let pressStartY = 0
// 拖动结束后紧跟的 click 要忽略，避免又弹出选项卡 / 又移动一次
let suppressNextSeatClick = false

function clearLongPressTimer() {
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function removeCardPressListeners() {
  window.removeEventListener('pointermove', onCardPressMove)
  window.removeEventListener('pointerup', onCardPressEnd)
  window.removeEventListener('pointercancel', onCardPressCancel)
}

// 拖动期间必须拦下 touchmove 的默认行为：否则浏览器会把手势判成页面滚动，
// 一边滚动一边发 pointercancel 把拖动掐掉。
// 注意：这个监听必须在「手指按下那一刻」就已经存在，浏览器才会把 touchmove
// 标记为可取消（touch-action 是按下瞬间定死的，拖动中再改 body 已经来不及），
// 所以它在页面激活期间常驻，只在真正拖动时 preventDefault。
function onCardPressTouchMove(event: TouchEvent) {
  if (!cardDragGhost) return

  event.preventDefault()

  // 冗余：即使 pointermove 被浏览器吞掉，也靠触摸事件继续让副本卡片跟随手指
  const touch = event.touches[0]
  if (!touch) return
  moveGhostTo(touch.clientX, touch.clientY)
  updateCardDragTarget(touch.clientX, touch.clientY)
}

// 冗余：pointerup 万一没送到，靠 touchend 结束拖动
function onCardPressTouchEnd() {
  if (cardDragGhost) onCardPressEnd()
}

// 长按开始拖动（房主专用）
function onCardPointerDown(
  event: PointerEvent,
  team: TeamKey | 'spectator',
  index: number,
  slot: SeatMember | null
) {
  if (!isOwner.value || !room.value || room.value.game.rosterLocked) return
  if (!slot) return
  // 道具倒计时内点击卡片是「使用道具」，不启动拖动
  if (activeItem.value) return
  // 鼠标只响应左键
  if (event.pointerType === 'mouse' && event.button !== 0) return

  const card = event.currentTarget as HTMLElement | null
  if (!card) return

  const rect = card.getBoundingClientRect()
  cardPress = {
    userId: slot.userId,
    seat: team,
    seatIndex: index,
    rect,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    card
  }
  pressStartX = event.clientX
  pressStartY = event.clientY

  window.addEventListener('pointermove', onCardPressMove)
  window.addEventListener('pointerup', onCardPressEnd)
  window.addEventListener('pointercancel', onCardPressCancel)
  clearLongPressTimer()
  longPressTimer = window.setTimeout(startCardDrag, LONG_PRESS_MS)
}

function onCardPressMove(event: PointerEvent) {
  if (!cardPress) return

  if (!cardDragGhost) {
    // 还没进入拖动：位移超过阈值就当作滑动，取消长按
    const distance = Math.hypot(event.clientX - pressStartX, event.clientY - pressStartY)
    if (distance > DRAG_MOVE_TOLERANCE_PX) cancelCardPress()
    return
  }

  // 拖动中：禁止页面滚动 + 副本卡片跟随手指
  event.preventDefault()

  // 鼠标在窗口外松开时 pointerup 会丢，按「没有按键按下」兜底收尾
  if (event.pointerType === 'mouse' && event.buttons === 0) {
    onCardPressEnd()
    return
  }

  moveGhostTo(event.clientX, event.clientY)
  updateCardDragTarget(event.clientX, event.clientY)
}

// 生成副本卡片（克隆原卡片，随手指移动）
function startCardDrag() {
  clearLongPressTimer()
  if (!cardPress) return

  const { card, rect } = cardPress
  const ghost = card.cloneNode(true) as HTMLElement
  ghost.classList.add('card-drag-ghost')
  ghost.classList.remove('drag-over')
  ghost.style.width = `${rect.width}px`
  ghost.style.height = `${rect.height}px`
  document.body.appendChild(ghost)
  cardDragGhost = ghost
  card.classList.add('card-drag-source')

  // 拖动期间：整页禁止滚动与文本选择
  lockPageSelection('drag', true)
  window.addEventListener('touchend', onCardPressTouchEnd)

  moveGhostTo(pressStartX, pressStartY)
  updateCardDragTarget(pressStartX, pressStartY)
}

function moveGhostTo(clientX: number, clientY: number) {
  if (!cardDragGhost || !cardPress) return
  const left = clientX - cardPress.offsetX
  const top = clientY - cardPress.offsetY
  cardDragGhost.style.transform = `translate(${left}px, ${top}px)`
}

// 找出指针下方的席位格子并高亮
function updateCardDragTarget(clientX: number, clientY: number) {
  const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null
  const slot = element?.closest<HTMLElement>('[data-team][data-seat-index]') ?? null
  if (slot === cardDragTarget) return

  cardDragTarget?.classList.remove('drag-over')
  cardDragTarget = slot
  cardDragTarget?.classList.add('drag-over')
}

function cleanupCardDrag() {
  window.removeEventListener('touchend', onCardPressTouchEnd)
  cardDragTarget?.classList.remove('drag-over')
  cardDragTarget = null
  cardPress?.card.classList.remove('card-drag-source')
  cardDragGhost?.remove()
  cardDragGhost = null
  lockPageSelection('drag', false)
}

function cancelCardPress() {
  clearLongPressTimer()
  removeCardPressListeners()
  cleanupCardDrag()
  cardPress = null
}

function onCardPressCancel() {
  cancelCardPress()
}

// 松手：命中目标席位则吸附过去并交换位置
function onCardPressEnd() {
  clearLongPressTimer()
  removeCardPressListeners()

  const press = cardPress
  const wasDragging = !!cardDragGhost
  const target = cardDragTarget

  cleanupCardDrag()
  cardPress = null

  if (!wasDragging || !press) return

  // 拖动结束后的 click 一律忽略
  suppressNextSeatClick = true
  window.setTimeout(() => {
    suppressNextSeatClick = false
  }, 400)

  if (!target) {
    showToast('请拖到目标席位后松手')
    return
  }

  const team = target.dataset.team as TeamKey | 'spectator' | undefined
  const targetIndex = Number(target.dataset.seatIndex)
  if (!team || !Number.isInteger(targetIndex)) return
  if (team === press.seat && targetIndex === press.seatIndex) return

  send({
    type: 'hostDragSeat',
    userId: press.userId,
    seat: team,
    index: targetIndex
  })
}

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
   刷题战流程：配置 → 准备 → 每题 10s 作答 → 30s 投票 → 下一题 → 结算
========================= */
// 服务端是权威计时，这里只做展示
const QUIZ_QUESTION_TOTAL = 10
const QUIZ_QUESTION_SECONDS = 10
const QUIZ_VOTE_SECONDS = 30

const quizTagOptions = ref<{ name: string; count: number }[]>([])
const quizConfig = reactive({ tags: [] as string[], minDifficulty: 0, maxDifficulty: 255 })
// 每秒刷新一次倒计时展示
const nowTick = ref(Date.now())
let quizTickTimer: number | null = null

const quiz = computed(() => room.value?.quiz ?? null)
const quizPhase = computed(() => quiz.value?.phase ?? 'config')
const quizQuestion = computed(() => quiz.value?.question ?? null)
const quizIndex = computed(() => quiz.value?.index ?? 0)
const quizTotal = computed(() => quiz.value?.total ?? 0)
const quizAnsweredUserIds = computed(() => quiz.value?.answeredUserIds ?? [])
const quizVotedUserIds = computed(() => quiz.value?.votedUserIds ?? [])
const quizReadyUserIds = computed(() => quiz.value?.readyUserIds ?? [])
// 房主用「开始 / 强制开始」按钮，不计入需要准备的名单；观战席也无需准备
const quizMemberCount = computed(
  () => (room.value?.members ?? []).filter((member) => !member.isOwner && member.seat !== 'spectator').length
)
const iAmSpectator = computed(() => mySeat.value === 'spectator')
const quizReadyCount = computed(
  () => quizReadyUserIds.value.filter((id) => id !== room.value?.ownerUserId).length
)
const iAmQuizReady = computed(() => quizReadyUserIds.value.includes(myUserId.value ?? -1))
// 全员准备后房主按钮从「强制开始 x/y」变成「开始游戏」
const quizAllReady = computed(() => quizReadyCount.value >= quizMemberCount.value)
const myQuizAnswer = computed(() => (quiz.value as { yourAnswer?: string } | null)?.yourAnswer ?? '')

const quizResourceItem = computed<{ kind: 'images' | 'videos' | 'audios'; url: string } | null>(() => {
  const resources = quizQuestion.value?.resources
  if (!resources) return null
  for (const kind of ['images', 'videos', 'audios'] as const) {
    const url = resources[kind]?.[0]
    if (url) return { kind, url }
  }
  return null
})

/* 难度在界面上统一按 0~10 显示与修改（服务端 / 数据库仍是 0~255） */
function toDisplayDifficulty(raw: number): number {
  const value = Number(raw)
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(10, Math.round((value / 255) * 10)))
}

function toRawDifficulty(display: number): number {
  const value = Number(display)
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(255, Math.round((value / 10) * 255)))
}

// 解析文本与配图分开渲染（markdown 图片会被解析出来单独显示）
const quizExplanation = computed(() => {
  const raw = quizQuestion.value?.explanation ?? ''
  const images: string[] = []
  const text = raw
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, (_matched, url: string) => {
      images.push(url)
      return ''
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { text, images }
})

const quizOnlineCount = computed(() => (room.value?.members ?? []).filter((m) => m.connected).length)

const stagePhaseLabel = computed(() => (quizPhase.value === 'vote' ? '下一题投票' : '作答倒计时'))

// 当前阶段剩余秒数（作答 10s / 投票 30s）
const stageRemainSeconds = computed(() => {
  const state = quiz.value
  if (!state) return 0
  const endsAt = state.phase === 'vote' ? state.voteEndsAt : state.phase === 'question' ? state.questionEndsAt : 0
  if (!endsAt) return 0
  return Math.max(0, Math.ceil((endsAt - nowTick.value) / 1000))
})

// 本题答对的人
const quizCorrectNames = computed(() => {
  const ids = (quiz.value as { correctUserIds?: number[] } | null)?.correctUserIds ?? []
  return ids
    .map((id) => room.value?.members.find((member) => member.userId === id)?.displayName ?? '')
    .filter(Boolean)
    .join('、')
})

// 某个选项都有谁选了（公布答案后才下发；用于在选项上方浮现小头像）
function quizVotersOf(optionKey: string) {
  const ids = quiz.value?.optionChoices?.[optionKey] ?? []
  return ids
    .map((id) => room.value?.members.find((member) => member.userId === id))
    .filter((member): member is NonNullable<typeof member> => !!member)
}

// 结算排名
const quizScoreRows = computed(() => {
  const scores = quiz.value?.scores ?? {}
  return Object.entries(scores)
    .map(([userId, score]) => ({
      userId: Number(userId),
      displayName: room.value?.members.find((member) => member.userId === Number(userId))?.displayName ?? `#${userId}`,
      score: Number(score)
    }))
    .sort((a, b) => b.score - a.score)
})

// 房主改动范围时同步本地表单
watch(
  () => quiz.value?.config,
  (config) => {
    if (!config) return
    quizConfig.tags = [...config.tags]
    // 服务端存的是 0~255，界面上换算成 0~10
    quizConfig.minDifficulty = toDisplayDifficulty(config.minDifficulty)
    quizConfig.maxDifficulty = toDisplayDifficulty(config.maxDifficulty)
  },
  { immediate: true }
)

async function loadQuizTags() {
  try {
    const res = await authFetch('/api/quiz/tags')
    if (!res.ok) return
    const data = await res.json()
    quizTagOptions.value = data.tags ?? []
  } catch (error) {
    console.error(error)
  }
}

function toggleQuizTag(tag: string) {
  if (quizConfig.tags.includes(tag)) quizConfig.tags = quizConfig.tags.filter((item) => item !== tag)
  else quizConfig.tags = [...quizConfig.tags, tag]
  submitQuizConfig()
}

// 保存题目范围（标签 + 难度区间）
function submitQuizConfig() {
  send({
    type: 'quiz',
    action: 'config',
    tags: quizConfig.tags,
    // 0~10 → 0~255
    minDifficulty: toRawDifficulty(quizConfig.minDifficulty),
    maxDifficulty: toRawDifficulty(quizConfig.maxDifficulty)
  })
}

function prepareQuiz() {
  send({ type: 'quiz', action: 'prepare' })
}

// 准备阶段：普通成员点准备 / 取消准备
function toggleQuizReady() {
  send({ type: 'quiz', action: 'ready', value: !iAmQuizReady.value })
}

function startQuizGame() {
  send({ type: 'quiz', action: 'start' })
}

// 回到配置阶段（「返回设置」/「再来一局」）
function backToQuizConfig() {
  submitQuizConfig()
}

function resetQuizGame() {
  submitQuizConfig()
}

function answerQuizQuestion(option: string) {
  // 倒计时结束前可以改选
  if (quizPhase.value !== 'question') return
  if (myQuizAnswer.value === option) return
  send({ type: 'quiz', action: 'answer', option })
}

function voteNextQuestion() {
  if (quizPhase.value !== 'vote') return
  send({ type: 'quiz', action: 'vote' })
}

// 图片预览（项目自带的 ImageViewer）
const showImageViewer = ref(false)
const previewImageSrc = ref('')

function openImagePreview(src: string) {
  if (!src) return
  previewImageSrc.value = src
  showImageViewer.value = true
}

/* =========================
   面板内容按高度自适应（面板限高 400px）
   —— 优先压缩题目图片，图片到下限后仍放不下才整体等比缩小
========================= */
const QUIZ_PANEL_MAX_HEIGHT = 400
// 面板上下内边距 16px × 2
const QUIZ_PANEL_PADDING = 32
// 题目图片最小高度：再小就整体缩放了
const QUIZ_PANEL_MIN_IMAGE_HEIGHT = 96
// 面板内容最少保留高度（缩放下限）：与 .quiz-panel 的 min-height 320px 对应
const QUIZ_PANEL_MIN_CONTENT_HEIGHT = 288
// 聊天栏的最小高度（与 grid-template-rows 里的 160px 保持一致）
const QUIZ_CHAT_MIN_HEIGHT = 160
// 栅格行间距
const QUIZ_GRID_GAP = 16
// 房间页底部内边距（.room-page 的 padding-bottom）
const QUIZ_PAGE_BOTTOM_PADDING = 24
const quizPanelInnerRef = ref<HTMLElement | null>(null)
const questionImageRef = ref<HTMLImageElement | null>(null)
const quizPanelRef = ref<HTMLElement | null>(null)
const contentAreaRef = ref<HTMLElement | null>(null)
const boardRef = ref<HTMLElement | null>(null)

// 注意：写在 v-for 里的 ref 在运行时会拿到数组（这里只有 team2 那一次渲染会命中），
// 直接当元素用会报错，导致整个 fitQuizPanel 静默失败。
function singleElement<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function fitQuizPanel() {
  const inner = singleElement(quizPanelInnerRef.value)
  const panel = singleElement(quizPanelRef.value)
  const container = contentAreaRef.value
  const board = boardRef.value
  if (!inner || !panel) return

  // 投票 / 结算阶段要读解析（可能很长）：不缩放内容，交给面板自身滚动
  if (quizPhase.value === 'vote' || quizPhase.value === 'finished') {
    inner.style.transform = 'none'
    inner.style.height = 'auto'
    panel.style.height = ''
    return
  }

  // 先还原成自然尺寸再测量：图片自然高度、内容不缩放
  inner.style.transform = 'none'
  inner.style.height = 'auto'
  let image = singleElement(questionImageRef.value)
  if (image) image.style.height = 'auto'

  // 可用高度同时受「面板限高」和「视口剩余空间」约束：
  //   视口高 − 内容区顶部距文档顶部的距离 − 底部内边距 − 队伍区高 − 聊天栏最小高 − 行间距
  // 注意：不能用内容区自身的高度来算——页面变高时它会跟着被撑高，永远算得出「放得下」。
  let byViewport = Number.POSITIVE_INFINITY
  if (container && board) {
    const containerTop = container.getBoundingClientRect().top + window.scrollY
    // 第一行的高度取中栏与两支队伍栏里最高的那个（栅格行高由最高项决定）
    const rowHeights = [board.clientHeight]
    container.querySelectorAll<HTMLElement>('.team-column').forEach((el) => {
      rowHeights.push(el.clientHeight)
    })
    const firstRowHeight = Math.max(...rowHeights, 0)

    byViewport =
      window.innerHeight -
      containerTop -
      QUIZ_PAGE_BOTTOM_PADDING -
      firstRowHeight -
      QUIZ_CHAT_MIN_HEIGHT -
      QUIZ_GRID_GAP * 2 -
      // 面板自身的上下内边距也要扣掉，否则会正好多出 32px 导致页面还能滚动
      QUIZ_PANEL_PADDING
  }
  const available = Math.max(
    Math.min(QUIZ_PANEL_MAX_HEIGHT - QUIZ_PANEL_PADDING, byViewport),
    QUIZ_PANEL_MIN_CONTENT_HEIGHT
  )

  let contentHeight = inner.scrollHeight || inner.offsetHeight
  if (!contentHeight || contentHeight <= available) {
    // 放得下：面板高度交给内容
    panel.style.height = 'auto'
    return
  }

  // 1) 只压缩题目图片：把超出可用高度的部分从图片上扣掉
  //    （作答阶段不允许缩放文字与选项，选项大小与解析阶段保持一致；实在放不下就交给面板滚动）
  image = singleElement(questionImageRef.value)
  if (image) {
    const imageHeight = image.getBoundingClientRect().height
    // 除图片外的其它内容（标题、选项、结果提示、间距）
    const others = Math.max(contentHeight - imageHeight, 0)
    const target = Math.floor(available - others)

    image.style.height = `${Math.max(target, QUIZ_PANEL_MIN_IMAGE_HEIGHT)}px`
    contentHeight = inner.scrollHeight || contentHeight
  }

  // 图片压到下限仍放不下时不再缩放内容，交给面板内部滚动
  panel.style.height = ''
}

// 房间状态到位（面板首次渲染）后，按高度适配一次
watch(room, () => {
  void nextTick(fitQuizPanel)
})

// 进入解析阶段：平滑滚动到解析区域，方便直接看解析
watch(quizPhase, (phase) => {
  if (phase !== 'vote') return
  void nextTick(() => {
    window.setTimeout(scrollPanelToExplanation, 120)
  })
})

// 进入新题目：平滑滚回面板顶部
watch(quizIndex, () => {
  if (quizPhase.value !== 'question') return
  void nextTick(() => {
    window.setTimeout(scrollPanelToTop, 80)
  })
})

function scrollPanelToTop() {
  const panel = singleElement(quizPanelRef.value)
  if (!panel) return
  panel.scrollTo({ top: 0, behavior: 'smooth' })
}

function scrollPanelToExplanation() {
  const panel = singleElement(quizPanelRef.value)
  if (!panel) return

  const target = panel.querySelector<HTMLElement>('.stage-explain') ?? panel.querySelector<HTMLElement>('.stage-actions')
  const top = target ? target.offsetTop - 8 : panel.scrollHeight
  panel.scrollTo({ top, behavior: 'smooth' })
}

// 后端房间对象与卧底模式共用：这里的 game 是「卧底模式的对局状态」，
// 刷题战自己的流程状态在 room.quiz 里（见下面的 quiz* 变量）
const undercoverGame = computed(() => room.value?.game ?? null)
const showSettings = ref(false)


// 已选地图的图片：作为页面背景（毛玻璃模糊）
const mapBackdropUrl = computed(() => {
  const name = undercoverGame.value?.map
  if (!name) return ''

  for (const category of MAP_CATEGORIES) {
    const found = category.maps.find((map) => map.name === name)
    if (found) return found.image
  }
  return ''
})




// 卧底模式结算投票：谁给这个成员投了票（用于卡片上浮的小头像徽标）
function undercoverVotersOf(userId?: number) {
  if (!userId || !undercoverGame.value) return []

  return Object.entries(undercoverGame.value.undercoverVote.votes)
    .filter(([, target]) => target === userId)
    .map(([voterId]) => room.value?.members.find((member) => member.userId === Number(voterId)))
    .filter((member): member is NonNullable<typeof member> => !!member)
    .map((member) => ({ userId: member.userId, avatar: member.avatar, name: member.displayName }))
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

    case 'swapSent':
      showToast(`已向 ${msg.toDisplayName ?? '对方'} 发送交换位置申请，等待同意`)
      break

    case 'swapRequest':
      // 对方申请与你交换位置 → 弹确认框
      if (msg.request) swapRequest.value = msg.request as SeatSwapRequestInfo
      break

    case 'swapResult':
      showToast(
        msg.accepted
          ? `${msg.byDisplayName ?? '对方'} 同意与你交换位置`
          : `${msg.byDisplayName ?? '对方'} 拒绝了交换位置`
      )
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

// 频道：全局 → 友方 循环切换（刷题战不设敌方频道）；私密频道由「发送私密消息」临时进入，不参与循环
type ChatChannelValue = 'global' | 'friendly' | 'enemy' | 'private'

const CHANNELS: { value: ChatChannelValue; label: string }[] = [
  { value: 'global', label: '全局' },
  { value: 'friendly', label: '友方' }
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

// 道具音效（frontend/public/audio）：命中瞬间播放
const ITEM_SOUND: Record<ItemType, string> = {
  egg: '/audio/砸鸡蛋.mp3',
  rose: '/audio/玫瑰.mp3'
}

const itemAudioTemplates = new Map<ItemType, HTMLAudioElement>()

function playItemSound(item: ItemType) {
  let template = itemAudioTemplates.get(item)
  if (!template) {
    template = new Audio(ITEM_SOUND[item])
    template.preload = 'auto'
    itemAudioTemplates.set(item, template)
  }

  // 每次命中播一份副本，支持多人同时被砸/被献花
  const audio = template.cloneNode(true) as HTMLAudioElement
  // 跟随「音量增益」设置（元素音量上限为 1）
  audio.volume = Math.min(Math.max(sfxVolumeScale(), 0), 1)
  void audio.play().catch((error) => {
    console.error('道具音效播放失败（可能被浏览器自动播放策略拦截）', error)
  })
}

// 预热：进入房间时先把两个音效下载好，避免第一次命中才有延迟
function preloadItemSounds() {
  for (const item of ITEMS) {
    if (itemAudioTemplates.has(item.type)) continue
    const audio = new Audio(ITEM_SOUND[item.type])
    audio.preload = 'auto'
    itemAudioTemplates.set(item.type, audio)
  }
}

const ITEM_COOLDOWN_MS = 3000
const RING_LENGTH = 2 * Math.PI * 16   // 与模板里 r=16 对应

const activeItem = ref<ItemType | ''>('')
const itemProgress = ref(0)
// 提示里的数字是「已发送数量」，与 3 秒使用窗口无关，可以一直累加
const itemSentCounts = ref<Record<ItemType, number>>({ egg: 0, rose: 0 })
// 道具悬浮窗是否展开（收起时按钮只显示道具图标）
const showItemPanel = ref(false)

const activeItemSentCount = computed(() =>
  activeItem.value ? itemSentCounts.value[activeItem.value] : 0
)

// 收起状态显示道具图标；选中后变为鸡蛋 / 玫瑰花
const itemTriggerIcon = computed(() => {
  if (!activeItem.value) return '/ico/道具.svg'
  return ITEMS.find((item) => item.type === activeItem.value)?.icon ?? '/ico/道具.svg'
})

const activeItemTitle = computed(() => {
  const found = ITEMS.find((item) => item.type === activeItem.value)
  return found ? found.title : '道具'
})

let itemTimer: number | null = null

// 悬浮窗开关（点空白处自动收起）
function toggleItemPanel() {
  if (showItemPanel.value) {
    closeItemPanel()
    return
  }

  showItemPanel.value = true
  document.addEventListener('click', closeItemPanel)
}

function closeItemPanel() {
  showItemPanel.value = false
  document.removeEventListener('click', closeItemPanel)
}

// 点击道具：进入/重置 3 秒倒计时
function selectItem(item: ItemType) {
  // 选中后收起悬浮窗
  closeItemPanel()

  activeItem.value = item
  itemProgress.value = 0

  if (itemTimer !== null) clearInterval(itemTimer)

  const startedAt = Date.now()
  itemTimer = window.setInterval(() => {
    const elapsed = Date.now() - startedAt
    itemProgress.value = Math.min(elapsed / ITEM_COOLDOWN_MS, 1)

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
  closeItemPanel()
}

// 倒计时内点击目标头像 → 使用道具
function useItemOn(targetUserId: number) {
  if (!activeItem.value) return

  const item = activeItem.value
  send({ type: 'item', item, targetUserId })

  // 已发送数量 +1（只统计次数，不受动画并行上限影响）
  itemSentCounts.value[item] += 1

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

// 同时播放的道具动画 / 音效上限：超过就跳过这一条（数量显示照常累加），保证流畅
const ITEM_EFFECT_LIMIT = 10
let activeItemEffects = 0

function playItemAnimation(event: ItemEvent) {
  if (activeItemEffects >= ITEM_EFFECT_LIMIT) return

  const from = avatarRectOf(event.fromUserId)
  const to = avatarRectOf(event.toUserId)
  if (!from || !to) return

  activeItemEffects++

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
    // 命中特效（900ms）结束后才释放一个并发额度
    window.setTimeout(() => {
      activeItemEffects = Math.max(0, activeItemEffects - 1)
    }, 900)
  }
}

// 命中：鸡蛋破碎 / 玫瑰花绽放，并让目标头像抖一下
function playItemImpact(event: ItemEvent, x: number, y: number, size: number) {
  // 命中音效（public/audio 里的 mp3）
  playItemSound(event.item)

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

// 音量增益（0~200%）换算成倍数，作用于录音提示音与语音播放
function sfxVolumeScale(): number {
  return Math.max(0, Math.min(Number(voiceVolume.value) || 0, 200)) / 100
}

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

  // 跟随「音量增益」设置（最小 0.0001，exponentialRamp 不接受 0）
  const scaledGain = Math.max(gain * sfxVolumeScale(), 0.0001)

  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, startAt)
  if (toFreq !== freq) osc.frequency.exponentialRampToValueAtTime(toFreq, endAt)

  // 淡入淡出，避免「啪」的爆音
  volume.gain.setValueAtTime(0.0001, startAt)
  volume.gain.exponentialRampToValueAtTime(scaledGain, startAt + 0.012)
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

// 需要锁住整页手势的场景：录音（record）、长按拖动卡片（drag）
const selectionLockReasons = new Set<string>()
let selectionGuardActive = false

function lockPageSelection(reason: 'record' | 'drag', on: boolean) {
  if (on) selectionLockReasons.add(reason)
  else selectionLockReasons.delete(reason)

  const locked = selectionLockReasons.size > 0
  document.body.classList.toggle('is-recording', locked)
  document.body.classList.toggle('is-card-dragging', selectionLockReasons.has('drag'))

  if (locked === selectionGuardActive) return
  selectionGuardActive = locked

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
  lockPageSelection('record', true)
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
    lockPageSelection('record', false)
    return
  }

  // 没拿到流（权限被拒 / 超时）：直接复位，避免卡住后续按下
  if (!stream) {
    holdActive = false
    removeHoldListeners()
    lockPageSelection('record', false)
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
    lockPageSelection('record', false)
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
  lockPageSelection('record', false)
  // 离开房间页面 / 切后台时释放预热流（关掉系统录音指示灯）
  closeMicStream()
}

function stopRecording(send: boolean) {
  if (!isRecording.value) return

  isRecording.value = false
  isPreparing.value = false
  lockPageSelection('record', false)
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

// 本地偏好（设置弹窗里可改）：自动播放语音 / 音量增益
const { autoPlayVoice, voiceVolume } = useRoomSettings()

// 音量增益：≤100% 直接用元素音量；>100% 需要 Web Audio 增益节点
let voiceAudioContext: AudioContext | null = null
let voiceGainNode: GainNode | null = null

function ensureVoiceGainNode(): GainNode | null {
  if (voiceGainNode) return voiceGainNode

  const audio = audioEl.value
  if (!audio) return null

  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null

  try {
    voiceAudioContext = new Ctor()
    const source = voiceAudioContext.createMediaElementSource(audio)
    voiceGainNode = voiceAudioContext.createGain()
    source.connect(voiceGainNode).connect(voiceAudioContext.destination)
    return voiceGainNode
  } catch (error) {
    console.error('初始化音量增益失败，退回元素音量', error)
    voiceGainNode = null
    return null
  }
}

// 应用音量增益（0~200%）
function applyVoiceVolume() {
  const audio = audioEl.value
  if (!audio) return

  const percent = Math.max(0, Math.min(Number(voiceVolume.value) || 0, 200))

  if (percent > 100) {
    const gain = ensureVoiceGainNode()
    if (gain) {
      audio.volume = 1
      gain.gain.value = percent / 100
      return
    }
  }

  // 不超过 100%：不动 Web Audio 路由，直接改元素音量更稳
  audio.volume = Math.min(percent / 100, 1)
  if (voiceGainNode) voiceGainNode.gain.value = Math.min(percent / 100, 1)
}

watch(voiceVolume, () => applyVoiceVolume())
watch(audioEl, () => applyVoiceVolume())

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

  // 音量增益 + 唤醒音频上下文（首次播放可能是自动播放，需要 resume）
  applyVoiceVolume()
  if (voiceAudioContext && voiceAudioContext.state === 'suspended') void voiceAudioContext.resume()

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
    // 设置里关掉自动播放后，只累计未读、不自动出声
    if (!autoPlayVoice.value) return

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

/* =========================
   私密消息标记：显示私密对象，点击弹出该用户的详情选项卡
========================= */
// 自己发出的私密消息显示收件人；别人发来的显示「私密」（发送者紧跟在后面，无需重复）
function privateTargetOf(message: ChatMessage): SeatMember | null {
  if (message.userId !== myUserId.value || !message.toUserId) return null
  return (room.value?.members ?? []).find((member) => member.userId === message.toUserId) ?? null
}

function privateTagOf(message: ChatMessage): string {
  return privateTargetOf(message)?.displayName ?? '私密'
}

// 能定位到对方（还在房间里）时才允许点击
function canOpenPrivateTag(message: ChatMessage): boolean {
  return !!privateTargetOf(message)
}

function openPrivateTagDialog(message: ChatMessage, event: MouseEvent) {
  const target = privateTargetOf(message)
  if (!target) {
    if (message.userId === myUserId.value) showToast('该用户已离开房间')
    return
  }
  openUserDialog(target, event)
}

/* =========================
   申请交换位置（对方同意后互换席位）
========================= */
const swapRequest = ref<SeatSwapRequestInfo | null>(null)

function requestSeatSwapWith(member: SeatMember | null) {
  if (!member) return
  send({ type: 'requestSwap', userId: member.userId })
}

function respondSeatSwap(accept: boolean) {
  const request = swapRequest.value
  if (!request) return

  send({ type: 'respondSwap', requestId: request.id, accept })
  swapRequest.value = null
}

function onSeatClick(
  team: TeamKey | 'spectator',
  index: number,
  slot: SeatMember | null,
  event: MouseEvent
) {
  // 刚结束拖动：忽略这次 click，避免又弹出选项卡 / 又移动一次
  if (suppressNextSeatClick) return

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
  router.push('/QuizBattle')
}

async function dissolveRoomByOwner() {
  showExitDialog.value = false
  send({ type: 'dissolveRoom' })
  await new Promise((resolve) => setTimeout(resolve, 180))
  closeSocket()
  router.push('/QuizBattle')
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
  // 常驻的非 passive touchmove：拖动卡片时用它阻止页面滚动（详见 onCardPressTouchMove）
  window.addEventListener('touchmove', onCardPressTouchMove, { passive: false })
  // 预热道具音效，第一次砸鸡蛋 / 献花也不用等下载
  preloadItemSounds()
  // 面板内容按高度自适应缩放（窗口尺寸变化时重算）
  window.addEventListener('resize', fitQuizPanel)
  void nextTick(fitQuizPanel)
  // 刷题战：倒计时展示 + 题目标签选项
  void loadQuizTags()
  nowTick.value = Date.now()
  quizTickTimer = window.setInterval(() => {
    nowTick.value = Date.now()
  }, 250)
  // 回到房间页且处于语音模式时，重新预热麦克风
  if (inputMode.value === 'voice') void ensureMicStream()
  connect()
  startOnlineHeartbeat()
}

function deactivatePage() {
  if (!pageActive) return
  pageActive = false

  abortRecording()
  // 拖动中断（切页面 / 切后台）时清掉副本卡片与滚动锁
  cancelCardPress()
  // 会话断开后残留的交换请求确认框直接丢弃
  swapRequest.value = null
  stopItemTimer()
  stopOnlineHeartbeat()
  document.removeEventListener('visibilitychange', reportBackground)
  document.removeEventListener('visibilitychange', onMicVisibilityChange)
  window.removeEventListener('focus', reportBackground)
  window.removeEventListener('blur', reportBackground)
  window.removeEventListener('scroll', onChatScroll)
  window.removeEventListener('touchmove', onCardPressTouchMove)
  window.removeEventListener('resize', fitQuizPanel)
  if (quizTickTimer !== null) {
    clearInterval(quizTickTimer)
    quizTickTimer = null
  }
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
  /* 整页高度锁定在视口内：内容区高度确定后，栅格的 1fr 行才能正确地把
     「剩余高度」交给聊天栏；用 min-height 会被内容撑高，导致聊天栏变成几千像素 */
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  padding-bottom: 24px;
  /* 整页竖向 flex：内容区吃掉视口剩余高度，聊天栏再吃掉内容区的剩余高度 */
  display: flex;
  flex-direction: column;
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
  /* 刷题战布局：队伍1 | 中栏（room-header）| 队伍2，下面接演算面板与聊天 */
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
  /* 三行：中栏 + 队伍 | 演算面板 | 聊天（聊天占满剩余高度） */
  /* 中栏 + 队伍 | 演算面板 | 聊天：聊天栏始终吃掉屏幕剩余的全部高度 */
  grid-template-rows: auto minmax(0, auto) minmax(0, 1fr);
  flex: 1 1 auto;
  min-height: 0;
  gap: 16px;
  align-items: start;
}

/* 中栏：room-header 并入两队中间的空隙 */
.room-page .content-area > .room-header {
  grid-column: 2;
  grid-row: 1;
}

/* 演算 / 阶段面板：整行，位于队伍列表下方 */
.room-page .content-area > .quiz-panel {
  grid-column: 1 / -1;
  grid-row: 2;
}

/* 聊天栏：整行，位于面板下方 */
.room-page .content-area > .chat-area {
  grid-column: 1 / -1;
  grid-row: 3;
  /* 聊天栏弹性撑满剩余高度：内部只有聊天记录区滚动 */
  display: flex;
  flex-direction: column;
  align-self: stretch;
  min-height: 0;
  height: auto;
  /* 行间距交给栅格 gap，避免额外留白 */
  margin: 0;
}

/* 未连接房间时的提示条 */
.room-page .content-area > .list-tip {
  grid-column: 1 / -1;
  grid-row: 1;
}

/* =========================
   中栏（退出房间 + 观战席 + 道具 / 设置）——并入两队中间的空隙
========================= */
.room-header {
  display: grid;
  grid-template-columns: auto auto;
  justify-content: center;
  align-content: start;
  gap: 10px;
  background: var(--card-bg);
  border-radius: var(--glass-radius);
  padding: 12px;
  margin: 0;
  box-shadow: var(--shadow);
  min-width: 0;
}

/* 退出按钮：中栏第一行居中 */
.room-header .leave-btn {
  grid-column: 1 / -1;
  justify-self: center;
}

/* 观战席：中栏第二行 */
.room-header .spectator-row {
  grid-column: 1 / -1;
}

/* 道具 / 设置：中栏第三行并排 */
.room-header .item-dock {
  grid-column: 1;
  justify-self: end;
}

.room-header .settings-dock {
  grid-column: 2;
  justify-self: start;
}

.leave-btn {
  position: static;
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
  transform: scale(1.04);
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
   刷题战：两支队伍 + 演算面板（面板在队伍列表下方）
========================= */
/* 队伍容器不产生盒子，两支队伍直接参与 .content-area 的三列栅格 */
.quiz-teams {
  display: contents;
}

/* 演算 / 阶段面板：整行宽度，位于队伍列表下方 */
.quiz-panel {
  grid-column: 1 / -1;
  grid-row: 2;
  min-width: 0;
  align-self: start;
  /* 答题面板最小 320px，最大 400px，超出在面板内部滚动 */
  min-height: 320px;
  max-height: 400px;
  overflow-y: auto;
  padding: 16px;
  border-radius: var(--glass-radius);
  background: var(--section-bg);
  box-shadow: inset 0 0 0 1px var(--glass-border);
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
  /* 席位横排后按内容自适应（不超过所在栅格列宽） */
  max-width: 100%;
  background: var(--section-bg);
  border-radius: var(--glass-radius);
  /* 内边距同步缩小 30%（8px → 6px） */
  padding: 6px;
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

/* 左队在第 1 列、右队在第 3 列，分别贴左右两侧 */
.quiz-teams > .team-column:first-child {
  grid-column: 1;
  grid-row: 1;
  justify-self: start;
}

.quiz-teams > .team-column:last-child {
  grid-column: 3;
  grid-row: 1;
  justify-self: end;
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
  /* 垂直间距在 10px 基础上减少 60% → 4px */
  gap: 4px;
}

/* 队伍栏的人物卡片最大宽度 88px（观战席保持原有的 100px 上限） */
.seat-list .seat {
  max-width: 88px;
}

/* 席位容器：成员展示交给 UndercoverMemberSlot 组件（与观战席共用同一套显示） */
.seat {
  /* 卡片上限 100 × 80：上下内边距 6px，内容 68px，正好 80px 高，空位与有成员时等高 */
  padding: 6px 8px;
  max-width: 100px;
  max-height: 80px;
  min-width: 0;
  /* 只允许竖向滚动：横向滑动不会被浏览器判成横向平移（否则长按拖动会被 pointercancel 掐断） */
  touch-action: pan-y;
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
   观战席（在中栏内，1 × 2，整行最高 60px）
========================= */
/* 观战席：1 × 2 居中排布（2 个位置固定，坐满后新玩家默认进队伍栏） */
.spectator-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 100px));
  justify-content: center;
  column-gap: 8px;
  align-items: stretch;
  max-height: 60px;
  width: 100%;
  /* 底部间距改为 0 */
  margin: 0;
}

/* 观战席格子复用 .seat 卡片（stacked 变体：上方仅头像，下方只显示标签） */
.spectator-slot {
  min-width: 0;
  /* 顶栏里的观战席压缩：上下内边距收窄，整卡不超过 60px */
  max-height: 60px;
  padding: 3px 6px;
}

/* 观战席内部（子组件）跟着缩小：头像 36px、去掉 68px 的最小高度 */
.spectator-row :deep(.member-slot) {
  min-height: 0;
  gap: 2px;
}

.spectator-row :deep(.member-avatar),
.spectator-row :deep(.member-slot.empty .member-avatar),
.spectator-row :deep(.member-slot.stacked.empty .member-avatar) {
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
}

.spectator-row :deep(.member-tag),
.spectator-row :deep(.member-status) {
  font-size: 0.6rem;
  padding: 0 4px;
}

/* 观战席不显示虚线装饰框 */
.spectator-slot.empty {
  border: none;
}

/* =========================
   交换位置确认框
========================= */
.swap-mask {
  position: fixed;
  inset: 0;
  z-index: 3400;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.swap-panel {
  width: min(320px, 86vw);
  padding: 20px 18px 16px;
  border-radius: 22px;
  background: var(--bg-primary);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35), inset 0 0 0 1px var(--glass-border);
  text-align: center;
}

.swap-title {
  margin: 0;
  font-size: 1rem;
  color: var(--text-primary);
}

.swap-hint {
  margin: 8px 0 16px;
  font-size: 0.8rem;
  opacity: 0.7;
  color: var(--text-primary);
}

.swap-actions {
  display: flex;
  gap: 10px;
}

.swap-btn {
  flex: 1;
  padding: 10px 12px;
  border: none;
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  cursor: pointer;
  transition: 0.15s ease;
}

.swap-btn.primary {
  background: #2ecc71;
  color: #06281a;
  font-weight: 700;
}

.swap-btn:hover {
  filter: brightness(1.06);
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

/* 设置按钮：中栏第三行（不再是绝对定位到顶栏右侧） */
.settings-dock {
  position: static;
  display: flex;
  align-items: center;
}

.settings-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--bg-secondary);
  box-shadow: inset 0 0 0 1px var(--glass-border);
  cursor: pointer;
  transition: 0.15s ease;
}

.settings-trigger:hover {
  transform: translateY(-2px);
}

.settings-icon {
  /* 设置 / 道具图标统一上限 35px */
  width: 35px;
  height: 35px;
  max-width: 35px;
  max-height: 35px;
  object-fit: contain;
  pointer-events: none;
}

.item-dock {
  /* 中栏第三行，和设置按钮并排：相对定位作为悬浮窗的定位基准（否则弹窗会跑到视口下方看不见） */
  position: relative;
  display: flex;
  align-items: center;
}

.item-trigger {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--bg-secondary);
  box-shadow: inset 0 0 0 1px var(--glass-border);
  cursor: pointer;
  transition: 0.15s ease;
}

.item-trigger:hover {
  transform: translateY(-2px);
}

.item-trigger.active {
  background: rgba(46, 204, 113, 0.16);
}

/* 悬浮窗：鸡蛋 / 玫瑰花，向右对齐在按钮下方 */
.item-panel {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 999px;
  background: var(--bg-primary);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25), inset 0 0 0 1px var(--glass-border);
}

.item-option {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  transition: 0.15s ease;
}

.item-option:hover {
  transform: translateY(-2px);
  background: var(--bg-secondary);
}

.item-icon {
  width: 26px;
  height: 26px;
  object-fit: contain;
  /* 仅图标下移 2px，圆环等其它元素位置不变 */
  transform: translateY(2px);
  pointer-events: none;
}

/* 顶栏道具按钮里的图标同样上限 35px（悬浮窗里的选项图标保持小尺寸） */
.item-trigger .item-icon {
  width: 35px;
  height: 35px;
  max-width: 35px;
  max-height: 35px;
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
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 30;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--bg-primary);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25), inset 0 0 0 1px var(--glass-border);
  font-size: 0.78rem;
  color: #2ecc71;
  font-weight: 600;
  white-space: nowrap;
}

/* 剩余次数/倒计时前的「×」加粗 */
.item-count {
  font-weight: 800;
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

/* 聊天记录：高度由剩余空间决定（撑满聊天栏），超出在内部上下滚动 */
.chat-log {
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 380px;
  overflow-y: auto;
  font-size: 0.85rem;
  color: var(--text-primary);
}

/* 刷题战：覆盖上面的固定高度，聊天记录区弹性撑满聊天栏 */
.room-page .content-area > .chat-area .chat-log {
  flex: 1 1 auto;
  min-height: 0;
  height: auto;
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
  /* 私密对象名字过长时不显示完全（省略号） */
  max-width: 6em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
  margin-right: 4px;
  padding: 0 6px;
  border-radius: 10px;
  font-size: 0.7rem;
  color: #fff;
  background: #8b5cf6;
}

.chat-private-tag.clickable {
  cursor: pointer;
  transition: 0.15s ease;
}

.chat-private-tag.clickable:hover {
  filter: brightness(1.12);
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

/* 频道切换按钮（emoji 右侧，点击循环 全局 → 友方） */
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

/* =========================
   题目区（测试用示例题目：图片 + ABCD 选项）
========================= */
.quiz-stage {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.stage-title {
  margin: 0;
  font-size: 1rem;
  color: var(--text-primary);
}

.stage-tag {
  margin-left: 8px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--bg-secondary);
  box-shadow: inset 0 0 0 1px var(--glass-border);
  font-size: 0.7rem;
  opacity: 0.85;
}

.stage-countdown {
  flex: 0 0 auto;
  padding: 4px 12px;
  border-radius: 999px;
  background: #2c3e66;
  color: #fff;
  font-size: 0.82rem;
  font-weight: 700;
}

.stage-countdown.urgent {
  background: #ff4d4f;
}

.stage-hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-primary);
  opacity: 0.75;
}

.stage-subtitle {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-primary);
  opacity: 0.75;
}

.stage-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stage-label {
  font-size: 0.8rem;
  color: var(--text-primary);
  opacity: 0.85;
}

.stage-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.stage-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.76rem;
  font-family: inherit;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.stage-chip.active {
  background: #2c3e66;
  color: #fff;
}

.stage-chip-count {
  font-size: 0.68rem;
  opacity: 0.7;
}

.stage-range-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.stage-range {
  width: 100%;
  accent-color: #2ecc71;
  cursor: pointer;
}

.stage-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.stage-btn {
  padding: 9px 16px;
  border: none;
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.86rem;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--glass-border);
  transition: 0.15s ease;
}

.stage-btn:hover {
  transform: translateY(-1px);
}

.stage-btn.primary {
  background: linear-gradient(135deg, #2c3e66, #1f2c4b);
  color: #fff;
}

.stage-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.stage-scores {
  margin: 0;
  padding-left: 20px;
  color: var(--text-primary);
  font-size: 0.9rem;
  line-height: 1.9;
}

.stage-score-name {
  margin-right: 8px;
}

.stage-score-value {
  font-weight: 700;
}

.question-video {
  width: 100%;
  max-height: 220px;
  border-radius: 14px;
  background: #000;
}

.question-audio {
  width: 100%;
}

/* 解析区：文字 + 配图，内容长时由面板滚动 */
.stage-explain {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--bg-secondary);
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.stage-explain-text {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
}

.stage-explain-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.stage-explain-image {
  width: 160px;
  max-height: 120px;
  border-radius: 10px;
  object-fit: contain;
  cursor: zoom-in;
}

.quiz-question {
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--glass-border);
}

/* 面板内容容器：缩放时以顶部居中为基准 */
.quiz-panel-inner {
  width: 100%;
  transform-origin: top center;
}

.question-title {
  margin: 0 0 10px;
  font-size: 1rem;
  text-align: center;
  color: var(--text-primary);
}

.question-body {
  display: grid;
  /* 题目图片与选项始终纵排：图片在上、ABCD 选项在下 */
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.question-image {
  width: 100%;
  height: auto;
  max-height: 240px;
  /* 压缩图片时完整显示题目图（不裁切） */
  object-fit: contain;
  border-radius: 14px;
  /* 可点击用项目自带 ImageViewer 预览 */
  cursor: zoom-in;
}

.question-options {
  display: grid;
  gap: 10px;
}

/* 选项外层：给「浮现的小头像」留出定位基准 */
.option-wrapper {
  position: relative;
  padding-top: 8px;
}

/* 公布答案时：选了这个选项的人，小头像浮在选项上方 */
.option-voters {
  position: absolute;
  left: 10px;
  top: -2px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 1px 3px;
  border-radius: 999px;
  background: var(--bg-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25), inset 0 0 0 1px var(--glass-border);
}

.option-voter-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bg-secondary);
}

.question-option {
  /* 外层包了 .option-wrapper 后，按钮需要自己撑满整行（保持改动前的宽度） */
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: none;
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.92rem;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--glass-border);
  transition: 0.15s ease;
}

/* 去掉浏览器默认的白色焦点框（点选后会残留，和选中态/悬停蓝底对不上） */
.question-option:focus,
.question-option:focus-visible {
  outline: none;
}

.question-option:not(:disabled):hover {
  background: #2c3e66;
  color: #fff;
}

/* 选中态优先级最高：边框 + 浅绿底，悬停时也保持同一套样式 */
.question-option.chosen,
.question-option.chosen:hover {
  background: rgba(46, 204, 113, 0.18);
  color: var(--text-primary);
  box-shadow: inset 0 0 0 2px var(--accent, #2ecc71);
}

.question-option.correct,
.question-option.correct:hover {
  background: rgba(46, 204, 113, 0.28);
  color: var(--text-primary);
}

/* 公布答案时：选了错误选项的人 → 红色高亮 */
.question-option.wrong,
.question-option.wrong:hover {
  background: rgba(255, 77, 79, 0.18);
  color: var(--text-primary);
  box-shadow: inset 0 0 0 2px #ff4d4f;
}

.question-option:disabled {
  cursor: default;
}

.question-option.chosen .option-key,
.question-option.correct .option-key {
  background: #2ecc71;
  color: #06281a;
}

.question-option.wrong .option-key {
  background: #ff4d4f;
  color: #fff;
}

.option-key {
  flex: 0 0 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--button-bg, #2c3e66);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
}

.question-result {
  margin: 10px 0 0;
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-primary);
  opacity: 0.85;
}

/* =========================
   刷题战：队伍栏及其所有子元素整体缩小 30%
   尺寸写在 .seat.quiz-seat 与 .quiz-seat :deep(...) 上，
   这样长按拖动时克隆出来的副本卡片也保持同样大小
========================= */
.team-header {
  margin-bottom: 8px;
}

/* 允许队名变窄：宽度不够时用省略号，不撑破队伍栏 */
.team-header,
.team-name,
.team-name-input {
  min-width: 0;
}

.team-name {
  font-size: 0.74rem;
}

.team-name-input {
  padding: 4px 6px;
  font-size: 0.72rem;
}

.edit-hint {
  font-size: 0.56rem;
}

/* 队伍席位横排：席位并排，放不下时换行居中 */
.seat-list {
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
}

/* 队伍席位卡片：宽度限制 44px（头像 31px + 左右内边距正好放下） */
.seat.quiz-seat {
  flex: 0 0 auto;
  width: 44px;
  max-width: 44px;
  max-height: 56px;
  padding: 4px 6px;
  border-radius: 10px;
}

.quiz-seat :deep(.member-slot) {
  min-height: 46px;
  gap: 3px;
}

.quiz-seat :deep(.member-avatar),
.quiz-seat :deep(.member-slot.empty .member-avatar),
.quiz-seat :deep(.member-slot.stacked.empty .member-avatar) {
  flex: 0 0 31px;
  width: 31px;
  height: 31px;
}

.quiz-seat :deep(.member-name) {
  font-size: 0.67rem;
}

.quiz-seat :deep(.member-tag),
.quiz-seat :deep(.member-status) {
  font-size: 0.46rem;
  padding: 0 3px;
}

/* 空位：椅子图标在上、文字在下 */
.quiz-seat :deep(.member-empty) {
  flex-direction: column;
  gap: 2px;
  width: 100%;
}

@media (max-width: 768px) {
  /* 窄屏同样保持三列：只收窄间距，队伍栏宽度继续受 max-width 限制 */
  .room-page .content-area {
    gap: 10px;
  }

  .room-header {
    gap: 8px;
    padding: 8px 12px;
  }

  .leave-btn {
    padding: 6px 12px;
    font-size: 0.8rem;
  }

  /* 窄屏观战席：列间距收窄 */
  .spectator-row {
    column-gap: 4px;
  }
}
</style>
