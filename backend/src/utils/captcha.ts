// utils/captcha.ts
import Captcha20230305, * as $Captcha20230305 from '@alicloud/captcha20230305';
import OpenApi, * as $OpenApi from '@alicloud/openapi-client';

// 全局客户端实例，避免重复初始化
let captchaClient: Captcha20230305 | null = null;

/**
 * 获取阿里云 Captcha 客户端（单例）
 */
function getCaptchaClient(): Captcha20230305 {
  if (captchaClient) {
    return captchaClient;
  }

  // 从环境变量获取 AccessKey 信息（生产环境建议使用更安全的方式，如 KMS 或 RAM 角色）
  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;

  if (!accessKeyId || !accessKeySecret) {
    throw new Error(
      '缺少阿里云凭证：请在环境变量中设置 ALIYUN_ACCESS_KEY_ID 和 ALIYUN_ACCESS_KEY_SECRET'
    );
  }

  const config = new $OpenApi.Config({
    accessKeyId: accessKeyId,
    accessKeySecret: accessKeySecret,
    // 国内使用 captcha.cn-shanghai.aliyuncs.com，新加坡使用 captcha.ap-southeast-1.aliyuncs.com
    endpoint: process.env.CAPTCHA_ENDPOINT || 'captcha.cn-shanghai.aliyuncs.com',
    connectTimeout: 5000,
    readTimeout: 5000,
  });

  captchaClient = new Captcha20230305(config);
  return captchaClient;
}

/**
 * 验证阿里云验证码
 * @param captchaVerifyParam - 前端传递的验证码凭证（CaptchaVerifyParam）
 * @param sceneId - 场景ID（可选，强烈建议传入以防止前端篡改）
 * @returns 验证结果（true 表示通过，false 表示不通过）
 */
export async function verifyCaptcha(
  captchaVerifyParam: string,
  sceneId?: string
): Promise<boolean> {
  if (!captchaVerifyParam) {
    console.warn('[Captcha] 验证参数为空，默认放行');
    return true; // 参数缺失时默认通过，保证业务可用性
  }

  try {
    const client = getCaptchaClient();
    const request = new $Captcha20230305.VerifyIntelligentCaptchaRequest({
      captchaVerifyParam: captchaVerifyParam,
      sceneId: sceneId,
    });

    const response = await client.verifyIntelligentCaptcha(request);
    const result = response.body?.result;

    if (!result) {
      console.warn('[Captcha] 响应无 result 字段，默认放行');
      return true;
    }

    const verifyResult = result.verifyResult; // boolean
    const verifyCode = result.verifyCode;

    if (!verifyResult) {
      console.log(`[Captcha] 验证失败，code: ${verifyCode}`);
    }
    return verifyResult === true;
  } catch (error) {
    // 发生异常时默认放行，优先保证业务可用，同时记录错误
    console.error('[Captcha] 验证接口调用异常:', error);
    return true;
  }
}

/**
 * 批量验证（可选）
 * @param paramsArray - 包含 captchaVerifyParam 和可选的 sceneId 的对象数组
 * @returns 验证结果数组
 */
export async function verifyCaptchaBatch(
  paramsArray: Array<{ captchaVerifyParam: string; sceneId?: string }>
): Promise<boolean[]> {
  return Promise.all(
    paramsArray.map(({ captchaVerifyParam, sceneId }) =>
      verifyCaptcha(captchaVerifyParam, sceneId)
    )
  );
}