<template>
    <div class="tutorial-page">
        <ThemeToggle class="theme-toggle" />
        <div class="privacy-container">
            <router-link to="/">返回首页</router-link>
            <h1 class="title">鸣谢名单 </h1>
            <div class="update-time">📅 最后更新：2026年6月15日</div>

            <!-- 感谢引言 -->
            <section class="section">
                <h2>💖 致谢每一位同行者</h2>
                <p>黑爪服务器的诞生与成长，离不开每一位建设者、贡献者与支持者的热情付出。从比赛组织到服务器运维，从守望先锋到黑爪会议室，这个未来值得为之奋战。特此向所有给予帮助的朋友致以最诚挚的谢意！</p>
            </section>

            <!-- 核心开发与运维团队 -->
            <section class="section">
                <h2>🧙 核心团队 · 坚守与开拓</h2>
                <div class="thanks-grid">
                    <div class="thanks-card">
                        <div class="card-name">Node#51456</div>
                        <div class="card-role">服主 / 项目发起人</div>
                        <div class="card-desc">无所事事，游手好闲</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">莱因哈德孩的礼席#5998</div>
                        <div class="card-role">赛事组织</div>
                        <div class="card-desc">黑爪赛事组织先锋</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">kerosene#51139</div>
                        <div class="card-role">群组管理</div>
                        <div class="card-desc">黑爪运营管理先锋</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">白色的酱油#51330</div>
                        <div class="card-role">团建组织 / 金主</div>
                        <div class="card-desc">团建策划先锋</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">雨姐无敌大汉脚#5965</div>
                        <div class="card-role">吉祥物 / 金主</div>
                        <div class="card-desc">黑爪指定锦鲤</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">高额头梵高#5275</div>
                        <div class="card-role">吉祥物饲养员</div>
                        <div class="card-desc">黑爪招牌源氏</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">Vanki#51189</div>
                        <div class="card-role">教官 / 战术指导</div>
                        <div class="card-desc">黑爪战术训练先锋</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">Nasako#5792</div>
                        <div class="card-role">HR / 招生办</div>
                        <div class="card-desc">黑爪招生办主任</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">阿霜#51515</div>
                        <div class="card-role">Minecraft / 技术顾问</div>
                        <div class="card-desc">黑爪Minecraft先锋</div>
                    </div>
                </div>
            </section>

            <!-- 特别鸣谢（外部支持） -->
            <section class="section">
                <h2>🌟 特别鸣谢 · 闪耀的星光</h2>
                <div class="thanks-grid">
                    <div class="thanks-card">
                        <div class="card-name">心是灰蒙雨季#5273</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">KENOSIS#51905</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">北风夕何#5606</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">秋媛#5732</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">宋哈娜#51473</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">小猪猪舰长#5623</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">血腥灬玛丽#5847</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">成果#51355</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">Vitro2410#5858</div>
                    </div>
                </div>
            </section>

            <!-- 赞助者与支持者 -->
            <section class="section">
                <h2>💎 赞助者与支持者 · 信任的力量</h2>
                <div class="thanks-grid">
                    <div class="thanks-card">
                        <div class="card-name">北风夕何#5606</div>
                        <div class="card-role">金牌赞助</div>
                        <div class="card-desc">￥88</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">白色的酱油#51330</div>
                        <div class="card-role">金牌赞助</div>
                        <div class="card-desc">￥86</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">宋哈娜#51473</div>
                        <div class="card-role">金牌赞助</div>
                        <div class="card-desc">￥66.66</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">血腥灬玛丽#5847</div>
                        <div class="card-role">金牌赞助</div>
                        <div class="card-desc">￥50</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">安之若素#52657</div>
                        <div class="card-role">金牌赞助</div>
                        <div class="card-desc">￥50</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">雨姐无敌大汉脚#5965</div>
                        <div class="card-role">金牌赞助</div>
                        <div class="card-desc">￥27</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">帅帅的牛皮蛋#5349</div>
                        <div class="card-role">比赛赞助</div>
                        <div class="card-desc">￥12</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">秋媛#5732</div>
                        <div class="card-role">比赛赞助</div>
                        <div class="card-desc">￥10</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">Rec#51482</div>
                        <div class="card-role">比赛赞助</div>
                        <div class="card-desc">￥10</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">Vanki#51189</div>
                        <div class="card-role">赞助</div>
                        <div class="card-desc">￥8.88</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">青悟#5691</div>
                        <div class="card-role">比赛赞助</div>
                        <div class="card-desc">￥7</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">咖喱味咖喱酱#5531</div>
                        <div class="card-role">赞助</div>
                        <div class="card-desc">￥6.66</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">Nekojoke#5807</div>
                        <div class="card-role">赞助</div>
                        <div class="card-desc">￥5</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">希望李倩永远开心#5311</div>
                        <div class="card-role">赞助</div>
                        <div class="card-desc">￥5</div>
                    </div>
                </div>
                <p class="supporter-note"><strong>❤️ 同时感谢所有通过宣传、反馈与陪伴支持黑爪的每一位玩家！</strong></p>
                <p class="supporter-note"><strong>如果存在遗漏请联系Node</strong></p>
            </section>

            <!-- 花费 -->
            <section class="section">
                <h2>花费公示</h2>
                <div class="thanks-grid">
                    <div class="thanks-card">
                        <div class="card-name">阿里云轻量应用服务器</div>
                        <div class="card-role">￥68已购一年</div>
                        <div class="card-desc">提供黑爪会议室网站前端服务与战绩查询统计服务</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">Nodebeta.top域名</div>
                        <div class="card-role">￥14已购一年</div>
                        <div class="card-desc">提供网站域名与Minecraft服务解析</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">阿里云服务器ECS</div>
                        <div class="card-role">学生认证免费一年</div>
                        <div class="card-desc">提供黑爪会议室后端服务与数据存储</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">阿里云短信认证套餐</div>
                        <div class="card-role">￥3.99已购100条</div>
                        <div class="card-desc">早期生存测试与流程验证</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">磐石云8核8G服务器</div>
                        <div class="card-role">￥69已购一年</div>
                        <div class="card-desc">提供Minecraft服务器</div>
                    </div>
                    <div class="thanks-card">
                        <div class="card-name">腾讯云COS云存储</div>
                        <div class="card-role">￥12.7按量计费</div>
                        <div class="card-desc">提供如Minecraft大型资源高速下载服务</div>
                    </div>
                </div>
                <section class="section closing-section">
                    <p>由于Node的决策失误造成的服务器资源浪费向大家致歉，来年的服务器花费将竭力降至￥120，感谢大家的信任</p>
                </section>

            </section>

            <!-- 致谢收尾 -->
            <section class="section closing-section">
                <p>黑爪服务器因为有你而精彩，这个世界值得我们为之奋战，再次感谢大家 ❤️</p>
            </section>

            <div class="back-link">
                <router-link to="/">🏠 返回首页</router-link>
            </div>
        </div>
        <div class="footer-beian">
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
                {{ icpNumber }}
            </a>
            <span class="sep">|</span>
            <a href="https://www.beian.gov.cn/" target="_blank" rel="noopener noreferrer">
                {{ policeNumber }}
            </a>
        </div>
    </div>
</template>

<script setup lang="ts">
import ThemeToggle from "@/components/ThemeToggle.vue";

const icpNumber = import.meta.env.VITE_ICP_NUMBER || "沪ICP备备2026XXXX号";
const policeNumber = import.meta.env.VITE_POLICE_NUMBER || "沪公网安备 3101150200XXXX号";
</script>

<style scoped>
* {
    box-sizing: border-box;
}

.tutorial-page {
    min-height: 100vh;
    background: var(--bg-color, #f5f7fa);
    padding: 40px 20px 80px;
    position: relative;
}

.theme-toggle {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 100;
}

.privacy-container {
    max-width: 1000px;
    margin: 0 auto;
    background: var(--card-bg, #ffffff);
    border-radius: 28px;
    box-shadow: var(--shadow, 0 20px 35px -10px rgba(0, 0, 0, 0.1));
    padding: 40px 32px;
}

.title {
    text-align: center;
    font-size: 28px;
    font-weight: 700;
    background: linear-gradient(135deg, var(--text-primary, #1f2d3d) 0%, var(--button-bg, #42b983) 100%);
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
    margin-bottom: 12px;
}

.update-time {
    text-align: center;
    font-size: 14px;
    color: var(--text-secondary, #6c757d);
    margin-bottom: 32px;
    border-bottom: 1px solid var(--input-border, #e2e8f0);
    padding-bottom: 16px;
}

.section {
    margin-bottom: 42px;
}

.section h2 {
    font-size: 22px;
    font-weight: 600;
    color: var(--text-primary, #1f2d3d);
    margin-bottom: 20px;
    padding-left: 12px;
    border-left: 5px solid var(--button-bg, #42b983);
}

.section p {
    font-size: 15px;
    line-height: 1.65;
    color: var(--text-secondary, #4b5563);
    margin-bottom: 16px;
}

/* 鸣谢网格卡片布局 */
.thanks-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 20px;
    margin: 20px 0 12px;
}

.thanks-card {
    background: var(--bg-secondary, #f9fafb);
    border-radius: 20px;
    padding: 18px 16px;
    transition: all 0.25s ease;
    border: 1px solid var(--border-color, #eef2f6);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}

.thanks-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 20px -12px rgba(0, 0, 0, 0.12);
    background: var(--card-bg, #ffffff);
    border-color: var(--button-bg, #42b983);
}

.card-name {
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--text-primary, #1e293b);
    margin-bottom: 4px;
}

.card-role {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--button-bg, #42b983);
    margin-bottom: 8px;
}

.card-desc {
    font-size: 0.85rem;
    color: var(--text-secondary, #5b6e8c);
    line-height: 1.4;
}

.supporter-note {
    margin-top: 16px;
    font-size: 0.9rem;
    background: var(--code-bg, #f0f4fa);
    padding: 10px 16px;
    border-radius: 28px;
    display: inline-block;
    color: var(--text-secondary, #2c3e50);
}

.closing-section p {
    font-style: italic;
    background: var(--bg-secondary, #f1f5f9);
    padding: 18px 24px;
    border-radius: 28px;
    text-align: center;
    font-size: 0.95rem;
}

.back-link {
    text-align: center;
    margin-top: 48px;
    padding-top: 28px;
    border-top: 1px solid var(--input-border, #e2e8f0);
}

.back-link a {
    color: var(--button-bg, #42b983);
    text-decoration: none;
    font-weight: 600;
    transition: all 0.2s;
    font-size: 15px;
}

.back-link a:hover {
    opacity: 0.75;
    text-decoration: underline;
    letter-spacing: 0.3px;
}

.footer-beian {
    position: absolute;
    bottom: 20px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 12px;
    color: var(--text-secondary, #6c757d);
    background: transparent;
    z-index: 1;
}

.footer-beian a {
    color: inherit;
    text-decoration: none;
    transition: opacity 0.2s;
}

.footer-beian a:hover {
    opacity: 0.7;
    text-decoration: underline;
}

.footer-beian .sep {
    margin: 0 8px;
    color: var(--text-muted, #adb5bd);
}

/* 深色模式增强 */
html[data-theme="dark"] .tutorial-page,
html.dark .tutorial-page,
.dark .tutorial-page {
    --text-primary: #f3f4f6 !important;
    --text-secondary: #d1d5db !important;
    --text-muted: #9ca3af !important;
    --card-bg: #1f2937 !important;
    --bg-secondary: #111827 !important;
    --input-border: #374151 !important;
    --border-color: #334155 !important;
    --code-bg: #00000066 !important;
}

html[data-theme="dark"] .section p,
html[data-theme="dark"] .card-desc,
html[data-theme="dark"] .supporter-note,
html[data-theme="dark"] .update-time,
html[data-theme="dark"] .back-link a {
    color: var(--text-secondary, #d1d5db) !important;
}

html[data-theme="dark"] .section h2,
html[data-theme="dark"] .title,
html[data-theme="dark"] .card-name {
    color: var(--text-primary, #f3f4f6) !important;
}

html[data-theme="dark"] .thanks-card {
    background: #1e293b !important;
    border-color: #2d3a4e;
}

html[data-theme="dark"] .thanks-card:hover {
    background: #2d3a4e !important;
    border-color: #42b983;
}

html[data-theme="dark"] .closing-section p,
html[data-theme="dark"] .supporter-note {
    background: #00000040;
}

@media (max-width: 760px) {
    .privacy-container {
        padding: 24px 20px;
    }

    .title {
        font-size: 24px;
    }

    .section h2 {
        font-size: 19px;
    }

    .thanks-grid {
        grid-template-columns: 1fr;
        gap: 14px;
    }
}
</style>