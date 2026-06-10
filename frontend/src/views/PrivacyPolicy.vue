<template>
  <div class="privacy-page">
    <ThemeToggle class="theme-toggle" />
    <div class="privacy-container">
      <h1 class="title">隐私政策</h1>
      <div class="update-time">最后更新日期：2026年6月10日</div>

      <section class="section">
        <h2>1. 引言</h2>
        <p>黑爪会议室（以下简称“我们”）尊重并保护所有用户的个人隐私。本隐私政策将详细说明我们在您使用我们的服务时如何收集、使用、存储及保护您的个人信息，特别是您提供的手机号码。请您在使用我们的服务前仔细阅读本政策。一旦您使用我们的服务，即表示您同意我们按照本政策处理您的相关信息。</p>
      </section>

      <section class="section">
        <h2>2. 我们收集的信息</h2>
        <p>为了向您提供基本的账户服务及保障账号安全，我们仅收集以下必要信息：</p>
        <ul>
          <li><strong>战网ID (Battletag)</strong>：用于标识您的游戏身份，是您登录和组队的主要凭证。</li>
          <li><strong>手机号码</strong>：用于账号安全验证、密码找回以及在必要时与您取得联系。根据国家法律法规，游戏工具类服务平台需要完成手机号实名绑定。</li>
          <li><strong>密码哈希值</strong>：您的密码经过bcrypt加密后存储，我们无法获取您的原始密码。</li>
        </ul>
        <p>我们不会收集您的任何敏感生物信息、通讯录、位置信息或与游戏无关的其他数据。</p>
      </section>

      <section class="section">
        <h2>3. 手机号的使用与保护</h2>
        <p>手机号是您账户安全的核心保障。我们承诺：</p>
        <ul>
          <li><strong>最小化收集</strong>：仅当您首次登录时要求绑定手机号，且每账号仅能绑定一个手机号。</li>
          <li><strong>严格保密</strong>：您的手机号存储在加密数据库中，只有经过授权的服务器端程序才能解密访问。所有开发人员均签署保密协议，禁止任何形式的非授权访问。</li>
          <li><strong>用途限制</strong>：手机号仅用于身份验证（登录校验）、密码找回和安全提醒。我们绝不会将您的手机号用于营销推广、转售、共享给第三方（法律法规要求除外）。</li>
          <li><strong>绑定与更换</strong>：您可以在绑定后通过验证原手机号的方式来更换绑定的手机号。如果您遇到无法更换的情况，可以联系客服人工处理。</li>
          <li><strong>防骚扰</strong>：我们仅在您主动请求（如点击“获取验证码”）时向您的手机发送短信，不会主动发送任何广告信息。</li>
        </ul>
      </section>

      <section class="section">
        <h2>4. 信息的存储与安全</h2>
        <p>我们采用行业标准的安全措施保护您的个人信息：</p>
        <ul>
          <li>数据传输：所有API请求均通过HTTPS加密传输，防止中间人攻击。</li>
          <li>数据存储：密码使用bcrypt哈希，手机号使用AES-256对称加密，数据库连接使用SSL。</li>
          <li>访问控制：生产环境数据库仅允许后端服务访问，运维人员需要多重身份认证。</li>
          <li>应急响应：定期备份数据，制定数据泄露应急预案，发现风险会在72小时内通知受影响用户。</li>
        </ul>
      </section>

      <section class="section">
        <h2>5. 您的权利</h2>
        <p>根据《个人信息保护法》，您享有以下权利：</p>
        <ul>
          <li><strong>查询权</strong>：您可以随时登录后查看您绑定的手机号（部分掩码显示）。</li>
          <li><strong>更正权</strong>：如果手机号有误，您可以通过验证流程更改。</li>
          <li><strong>删除权</strong>：当您注销账户时，我们将删除您所有个人信息，包括手机号。</li>
          <li><strong>撤回同意</strong>：您可以联系我们要求停止收集手机号，但这将导致您无法使用需要手机号验证的功能。</li>
        </ul>
      </section>

      <section class="section">
        <h2>6. 未成年人保护</h2>
        <p>我们平台主要面向成年游戏玩家。如果您未满14周岁，请勿使用我们的服务。如果我们发现无意收集了未成年人的信息，将立即删除。</p>
      </section>

      <section class="section">
        <h2>7. 隐私政策的修改</h2>
        <p>我们可能会不时更新本隐私政策。重大变更（如手机号用途改变）将通过站内信或弹窗方式通知您。您继续使用服务即表示同意更新后的政策。</p>
      </section>

      <section class="section">
        <h2>8. 联系我们</h2>
        <p>如果您对隐私政策有任何疑问或需要行使您的权利，请通过以下方式联系我们：</p>
        <p>邮箱：Li_xunwen@foxmail.com<br>（为保护隐私，请勿在邮件中发送密码）</p>
      </section>

      <div class="back-link">
        <router-link to="/">返回登录</router-link>
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

const icpNumber = import.meta.env.VITE_ICP_NUMBER || "待备案";
const policeNumber = import.meta.env.VITE_POLICE_NUMBER || "办理中";
</script>

<style scoped>
* {
  box-sizing: border-box;
}

.privacy-page {
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
  max-width: 800px;
  margin: 0 auto;
  background: var(--card-bg, #ffffff);
  border-radius: 16px;
  box-shadow: var(--shadow, 0 8px 24px rgba(0, 0, 0, 0.1));
  padding: 40px 32px;
}

.title {
  text-align: center;
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary, #1f2d3d);
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
  margin-bottom: 32px;
}

.section h2 {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary, #1f2d3d);
  margin-bottom: 16px;
  padding-left: 8px;
  border-left: 4px solid var(--button-bg, #42b983);
}

.section p,
.section li {
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-secondary, #e2e8f0);
  margin-bottom: 10px;
}

.section ul {
  padding-left: 24px;
  margin: 12px 0;
}

.section li {
  margin-bottom: 8px;
}

.back-link {
  text-align: center;
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px solid var(--input-border, #e2e8f0);
}

.back-link a {
  color: var(--button-bg, #42b983);
  text-decoration: none;
  font-weight: 500;
  transition: opacity 0.2s;
}

.back-link a:hover {
  opacity: 0.8;
  text-decoration: underline;
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

@media (max-width: 640px) {
  .privacy-container {
    padding: 24px 20px;
  }
  .title {
    font-size: 24px;
  }
  .section h2 {
    font-size: 18px;
  }
}
</style>