import { Router } from 'express';
import { pool } from '../utils/db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { userEventLogger } from '../utils/db';
const router = Router();

// ========== 以下路由都需要认证 ==========
router.use(authenticateToken);

// 原有更新擅长英雄的接口
router.put('/heroes', async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: '未授权' });
    
    const { heroes }: { heroes: string[] } = req.body;
    if (!Array.isArray(heroes)) return res.status(400).json({ error: 'heroes 必须是一个数组' });
    if (heroes.length > 5) return res.status(400).json({ error: '擅长英雄不能超过5个' });
    
    const uniqueHeroes = [...new Map(heroes.map((name, idx) => [name, idx])).keys()];
    if (uniqueHeroes.length > 5) return res.status(400).json({ error: '去重后超过5个英雄' });

    let heroIds: number[] = [];
    if (uniqueHeroes.length > 0) {
        const placeholders = uniqueHeroes.map(() => '?').join(',');
        const [rows] = await pool.query<any[]>(`SELECT id, name FROM heroes WHERE name IN (${placeholders})`, uniqueHeroes);
        const foundMap = new Map(rows.map(row => [row.name, row.id]));
        const notFound = uniqueHeroes.filter(name => !foundMap.has(name));
        if (notFound.length > 0) return res.status(400).json({ error: `以下英雄不存在：${notFound.join(', ')}` });
        heroIds = uniqueHeroes.map(name => foundMap.get(name)!);
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
        await connection.query('DELETE FROM user_favorite_heroes WHERE user_id = ?', [userId]);
        if (heroIds.length > 0) {
            const values = heroIds.map((heroId, index) => [userId, heroId, index + 1]);
            await connection.query('INSERT INTO user_favorite_heroes (user_id, hero_id, sort_order) VALUES ?', [values]);
        }
        userEventLogger.logEvent({ userId: userId, eventType: 'update_heroes', eventData: { heroes: uniqueHeroes }})
        await connection.commit();
        res.json({ message: '擅长英雄更新成功', heroes: uniqueHeroes });
    } catch (error) {
        await connection.rollback();
        console.error('更新擅长英雄失败:', error);
        res.status(500).json({ error: '服务器错误，请稍后重试' });
    } finally {
        connection.release();
    }
});

export default router;