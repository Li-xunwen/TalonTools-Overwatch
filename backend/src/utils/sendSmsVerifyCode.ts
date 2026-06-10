// src/utils/sendSmsVerifyCode.ts
import Dypnsapi20170525, * as $Dypnsapi20170525 from '@alicloud/dypnsapi20170525';
import OpenApi, * as $OpenApi from '@alicloud/openapi-client';
import Util, * as $Util from '@alicloud/tea-util';

// 注意：生产环境请勿硬编码 AK！此处仅为演示
const ACCESS_KEY_ID = process.env.ALIYUN_ACCESS_KEY_ID;
const ACCESS_KEY_SECRET = process.env.ALIYUN_ACCESS_KEY_SECRET;

/**
 * 创建阿里云短信客户端
 */
function createClient(): Dypnsapi20170525 {
  if (!ACCESS_KEY_ID || !ACCESS_KEY_SECRET) {
    throw new Error('缺少阿里云凭证，请配置 ACCESS_KEY_ID 和 ACCESS_KEY_SECRET');
  }

  const config = new $OpenApi.Config({
    accessKeyId: ACCESS_KEY_ID,
    accessKeySecret: ACCESS_KEY_SECRET,
    endpoint: 'dypnsapi.aliyuncs.com',
    connectTimeout: 5000,
    readTimeout: 5000,
  });

  return new Dypnsapi20170525(config);
}

/**
 * 发送短信验证码
 * @param phoneNumber 接收短信的手机号（如 "13800138000"）
 * @param code 验证码（如 "123456"）
 * @param expireMinutes 有效时间（分钟），默认 5
 */
export async function sendSmsVerifyCode(
  phoneNumber: string,
  code: string,
  expireMinutes: number = 5
): Promise<void> {
  const client = createClient();

  const request = new $Dypnsapi20170525.SendSmsVerifyCodeRequest({
    phoneNumber,
    signName: "云渚科技验证服务",
    templateCode: "100004",
    templateParam: JSON.stringify({ code, min: String(expireMinutes) }),
  });

  const runtime = new $Util.RuntimeOptions({});
  try {
    await client.sendSmsVerifyCodeWithOptions(request, runtime);
  } catch (error) {
    if (error instanceof Error) {
      console.error('发送短信失败:', error.message);
      throw error; // 重新抛出以便调用方处理
    } else {
      console.error('未知错误:', error);
      throw new Error('发送短信时发生未知错误');
    }
  }
}

// 保留原有的 main 用于测试（可选）
if (require.main === module) {
  (async () => {
    try {
      await sendSmsVerifyCode("19264505004", "6666");
      console.log('短信发送成功！');
    } catch (err) {
      console.error('测试失败:', err);
    }
  })();
}