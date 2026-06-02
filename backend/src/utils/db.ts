//utils/db.ts
import mysql from 'mysql2/promise';

export let pool: mysql.Pool;

export function initPool(config: mysql.PoolOptions) {
    pool = mysql.createPool(config);
}