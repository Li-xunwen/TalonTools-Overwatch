// utils/db.ts
import mysql from 'mysql2/promise';
import { initUserEventLogger, UserEventLogger } from '../utils/userEventLogger';

export let pool: mysql.Pool;
export let userEventLogger: UserEventLogger;

export function initPool(config: mysql.PoolOptions) {
    pool = mysql.createPool(config);
    userEventLogger = initUserEventLogger(pool);
}