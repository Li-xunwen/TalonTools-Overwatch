import { Pool } from 'mysql2/promise';

export type EventType = 
  | 'login'
  | 'like'
  | 'update_heroes'
  | 'update_rank'
  | 'edit_evaluation'
  | 'view_profile'
  | 'view_summary'
  | 'view_match'
  | 'update_avatar'
  | 'change_password'
  | 'rename_user'
  | 'create_user'
  | 'dashen-quick-strength'
  | 'dashen-competitive-strength'
  | 'SMS_REQUEST'
;

export interface EventLogOptions {
  userId: number;
  eventType: EventType;
  targetUserId?: number | null;
  eventData?: Record<string, any> | null;
  ipAddress?: string | null;
}

export interface QueryEventsOptions {
  userId: number;
  eventType?: EventType | EventType[];
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}

/**
 * 用户事件日志工具
 */
export class UserEventLogger {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * 写入一条用户事件日志
   * 异步执行，不阻塞主流程（错误只记录到控制台）
   * 示例：await logger.logEvent({
                userId: 123,                          // 当前操作用户的 ID（必填）
                eventType: 'SMS_REQUEST',             // 事件类型（必须是 EventType 枚举中的值）
                targetUserId: null,                   // 目标用户 ID（如无则为 null）
                eventData: {                          // 附加数据（建议包含关键上下文）
                                                      //事件数据
                },
                ipAddress: '192.168.1.1',             // 客户端 IP（可从请求头获取）
              });
   */
  async logEvent(options: EventLogOptions): Promise<void> {
    const { userId, eventType, targetUserId = null, eventData = null, ipAddress = null } = options;

    try {
      const [result] = await this.pool.execute(
        `INSERT INTO user_events 
          (user_id, event_type, target_user_id, event_data, ip_address)
         VALUES (?, ?, ?, ?, ?)`,
        [
          userId,
          eventType,
          targetUserId,
          eventData ? JSON.stringify(eventData) : null,
          ipAddress,
        ]
      );
    } catch (err) {
      // 日志记录失败不应影响主业务，只打印警告
      console.error('[UserEventLogger] Failed to log event:', err);
    }
  }

  /**
   * 查询用户事件列表
   * 支持事件类型筛选、时间范围、分页
   */
  async getEvents(options: QueryEventsOptions): Promise<any[]> {
    const { userId, eventType, startTime, endTime, limit = 50, offset = 0 } = options;

    let sql = `SELECT * FROM user_events WHERE user_id = ?`;
    const params: any[] = [userId];

    if (eventType && Array.isArray(eventType) && eventType.length > 0) {
      const placeholders = eventType.map(() => '?').join(',');
      sql += ` AND event_type IN (${placeholders})`;
      params.push(...eventType);
    } else if (eventType && !Array.isArray(eventType)) {
      sql += ` AND event_type = ?`;
      params.push(eventType);
    }

    if (startTime) {
      sql += ` AND event_time >= ?`;
      params.push(startTime);
    }
    if (endTime) {
      sql += ` AND event_time <= ?`;
      params.push(endTime);
    }

    sql += ` ORDER BY event_time DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows as any[];
    } catch (err) {
      console.error('[UserEventLogger] Query events failed:', err, 'SQL:', sql, 'Params:', params);
      throw err; // 抛出错误以便前端捕获
    }
  }

  /**
   * 获取用户事件统计（按类型分组）
   */
  async getEventStats(userId: number, startTime?: Date, endTime?: Date): Promise<Record<string, number>> {
    let sql = `SELECT event_type, COUNT(*) as count FROM user_events WHERE user_id = ?`;
    const params: any[] = [userId];
    if (startTime) {
      sql += ` AND event_time >= ?`;
      params.push(startTime);
    }
    if (endTime) {
      sql += ` AND event_time <= ?`;
      params.push(endTime);
    }
    sql += ` GROUP BY event_type`;
    const [rows] = await this.pool.execute(sql, params);
    const stats: Record<string, number> = {};
    (rows as any[]).forEach(row => {
      stats[row.event_type] = row.count;
    });
    return stats;
  }
}

// 创建单例（可选，需要在 index.ts 中初始化）
let loggerInstance: UserEventLogger | null = null;

export function initUserEventLogger(pool: Pool): UserEventLogger {
  if (!loggerInstance) {
    loggerInstance = new UserEventLogger(pool);
  }
  return loggerInstance;
}

export function getUserEventLogger(): UserEventLogger {
  if (!loggerInstance) {
    throw new Error('UserEventLogger not initialized. Call initUserEventLogger(pool) first.');
  }
  return loggerInstance;
}