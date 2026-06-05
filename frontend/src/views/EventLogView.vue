<template>
  <div class="event-log-page">
    <ThemeToggle />

    <div class="container">
      <h1>用户事件日志</h1>

      <!-- 筛选栏 -->
      <div class="filters">
        <div class="filter-group">
          <label>事件类型：</label>
          <select
            v-model="filters.eventType"
            multiple
            @change="applyFilters"
          >
            <option
              v-for="type in eventTypes"
              :key="type"
              :value="type"
            >
              {{ type }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label>时间范围：</label>

          <input
            type="datetime-local"
            v-model="filters.startTime"
            @change="applyFilters"
          />

          <span>至</span>

          <input
            type="datetime-local"
            v-model="filters.endTime"
            @change="applyFilters"
          />
        </div>

        <button @click="resetFilters">
          重置筛选
        </button>
      </div>

      <div v-if="loading" class="loading">
        加载中...
      </div>

      <div v-else class="scroll-container">
        <table class="event-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>操作用户</th>
              <th>事件类型</th>
              <th>目标用户</th>
              <th>事件数据</th>
              <th>IP地址</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="event in events"
              :key="event.id"
            >
              <td>{{ formatDateTime(event.event_time) }}</td>

              <td>
                {{ event.user_battletag || event.user_id }}
              </td>

              <td>
                {{ event.event_type }}
              </td>

              <td>
                {{
                  event.target_battletag ||
                  event.target_user_id ||
                  '-'
                }}
              </td>

              <td>
                {{ formatEventData(event.event_data) }}
              </td>

              <td>
                {{ event.ip_address || '-' }}
              </td>
            </tr>

            <tr v-if="events.length === 0">
              <td colspan="6">
                暂无日志
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页 -->
      <div
        class="pagination"
        v-if="total > 0"
      >
        <button
          :disabled="offset === 0"
          @click="changePage(-1)"
        >
          上一页
        </button>

        <span>
          第 {{ currentPage }} 页 /
          共 {{ totalPages }} 页
        </span>

        <button
          :disabled="offset + limit >= total"
          @click="changePage(1)"
        >
          下一页
        </button>
      </div>
    </div>

    <BottomNav />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import BottomNav from '@/components/BottomNav.vue';
import { authFetch } from '@/utils/request';

interface EventLog {
  id: number;
  user_id: number;
  user_battletag: string | null;
  event_type: string;
  event_time: string;
  target_user_id: number | null;
  target_battletag: string | null;
  event_data: any;
  ip_address: string | null;
}

const eventTypes = [
  'login',
  'like',
  'update_heroes',
  'update_rank',
  'edit_evaluation',
  'view_profile',
  'view_summary',
  'upload_avatar',
  'change_password',
  'rename_user',
  'create_user'
];

const loading = ref(false);

const events = ref<EventLog[]>([]);

const total = ref(0);

const limit = ref(50);

const offset = ref(0);

const filters = ref({
  eventType: [] as string[],
  startTime: '',
  endTime: ''
});

const currentPage = computed(
  () => Math.floor(offset.value / limit.value) + 1
);

const totalPages = computed(
  () => Math.ceil(total.value / limit.value)
);

async function fetchEvents() {
  loading.value = true;

  try {
    const params = new URLSearchParams();

    if (filters.value.eventType.length) {
      filters.value.eventType.forEach(type => {
        params.append('eventType', type);
      });
    }

    if (filters.value.startTime) {
      params.append(
        'startTime',
        new Date(filters.value.startTime).toISOString()
      );
    }

    if (filters.value.endTime) {
      params.append(
        'endTime',
        new Date(filters.value.endTime).toISOString()
      );
    }

    params.append(
      'limit',
      limit.value.toString()
    );

    params.append(
      'offset',
      offset.value.toString()
    );

    const res = await authFetch(
      `/api/admin/events?${params.toString()}`
    );

    if (!res.ok) {
      throw new Error('获取日志失败');
    }

    const data = await res.json();

    events.value = data.events;
    total.value = data.total;
  } catch (err) {
    console.error(err);
    alert('加载日志失败');
  } finally {
    loading.value = false;
  }
}

function applyFilters() {
  offset.value = 0;
  fetchEvents();
}

function resetFilters() {
  filters.value = {
    eventType: [],
    startTime: '',
    endTime: ''
  };

  offset.value = 0;

  fetchEvents();
}

function changePage(delta: number) {
  const newOffset =
    offset.value + delta * limit.value;

  if (
    newOffset >= 0 &&
    newOffset < total.value
  ) {
    offset.value = newOffset;
    fetchEvents();
  }
}

function formatDateTime(
  iso: string
): string {
  return new Date(iso).toLocaleString();
}

function formatEventData(
  data: any
): string {
  if (!data) return '-';

  if (typeof data === 'object') {
    return JSON.stringify(data);
  }

  return String(data);
}

onMounted(() => {
  fetchEvents();
});
</script>

<style scoped>
.event-log-page {
  min-height: 100vh;
  background: var(--bg-body);
  padding-bottom: 80px;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

h1 {
  margin-bottom: 20px;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;

  margin-bottom: 24px;

  background: var(--card-bg);

  padding: 16px;

  border-radius: 12px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-group select {
  min-width: 150px;
  padding: 6px;
}

.filter-group input {
  padding: 6px;
}

button {
  padding: 6px 12px;
  cursor: pointer;
}

.scroll-container {
  width: 100%;

  overflow-x: auto;
  overflow-y: hidden;

  -webkit-overflow-scrolling: touch;

  background: var(--card-bg);

  border-radius: 12px;
}

.event-table {
  border-collapse: collapse;

  min-width: 100%;
  width: max-content;

  white-space: nowrap;
}

.event-table th,
.event-table td {
  padding: 10px;
  text-align: left;

  border-bottom: 1px solid
    var(--border-color);
}

.event-table th {
  background: var(--bg-secondary);
  position: sticky;
  top: 0;
}

.loading {
  text-align: center;
  padding: 40px;
}

.pagination {
  margin-top: 20px;

  display: flex;
  justify-content: center;
  align-items: center;

  gap: 16px;
}
</style>