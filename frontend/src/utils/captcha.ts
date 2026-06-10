// utils/captcha.ts

// 验证码实例类型
interface CaptchaInstance {
  show: () => void;
  refresh: () => void;
}

// 配置参数
interface CaptchaOptions {
  sceneId: string;          // 场景ID
  mode?: 'popup' | 'embed'; // 模式，默认 popup
  button?: string | HTMLElement | null; // 触发按钮（选择器或元素），为 null 时手动控制
  container?: string;       // 渲染容器选择器，默认 '#captcha-container'
  slideStyle?: { width: number; height: number };
  language?: 'cn' | 'tw' | 'en';
}

// 验证结果
interface CaptchaResult {
  success: boolean;
  captchaVerifyParam?: string; // 验证凭证（成功时存在）
}

/**
 * 创建验证码控制器
 * @param options 配置
 * @returns 包含 show 方法的对象，调用 show() 返回 Promise<CaptchaResult>
 */
export function createCaptcha(options: CaptchaOptions) {
  const {
    sceneId,
    mode = 'popup',
    button = null,
    container = '#captcha-element',
    slideStyle = { width: 360, height: 40 },
    language = 'cn',
  } = options;

  let captchaInstance: CaptchaInstance | null = null;
  let pendingResolve: ((result: CaptchaResult) => void) | null = null;

  // 成功回调
  const onSuccess = (captchaVerifyParam: string) => {
    if (pendingResolve) {
      pendingResolve({ success: true, captchaVerifyParam });
      pendingResolve = null;
    }
  };

  // 失败回调
  const onFail = (error: any) => {
    console.error('验证码失败:', error);
    if (pendingResolve) {
      pendingResolve({ success: false });
      pendingResolve = null;
    }
  };

  // 获取实例
  const getInstance = (instance: CaptchaInstance) => {
    captchaInstance = instance;
  };

  // 初始化验证码
  const init = () => {
    // 如果已有容器不存在，则创建（可选）
    let containerEl = document.querySelector(container);
    if (!containerEl) {
      containerEl = document.createElement('div');
      containerEl.id = container.replace('#', '');
      document.body.appendChild(containerEl);
    }

    // 处理按钮：如果传入的是选择器字符串或元素，转换为元素或 null
    let buttonElement: HTMLElement | null = null;
    if (typeof button === 'string') {
      buttonElement = document.querySelector(button);
    } else if (button instanceof HTMLElement) {
      buttonElement = button;
    }

    window.initAliyunCaptcha({
      SceneId: sceneId,
      mode,
      element: container,
      button: buttonElement, // 如果为 null，则不自动绑定，需要手动调用 show
      success: onSuccess,
      fail: onFail,
      getInstance,
      slideStyle,
      language,
    });
  };

  // 显示验证码（弹出层），返回验证结果
  const show = (): Promise<CaptchaResult> => {
    return new Promise((resolve) => {
      if (!captchaInstance) {
        // 未初始化时尝试初始化（但通常应先调用 init）
        init();
        // 等待实例就绪（简单延时或轮询）
        const checkInterval = setInterval(() => {
          if (captchaInstance) {
            clearInterval(checkInterval);
            pendingResolve = resolve;
            captchaInstance.show();
          }
        }, 50);
        // 超时保护
        setTimeout(() => {
          clearInterval(checkInterval);
          if (pendingResolve === resolve) {
            resolve({ success: false });
            pendingResolve = null;
          }
        }, 3000);
      } else {
        pendingResolve = resolve;
        captchaInstance.show();
      }
    });
  };

  // 刷新验证码
  const refresh = () => {
    if (captchaInstance && captchaInstance.refresh) {
      captchaInstance.refresh();
    }
  };

  // 销毁（可选）
  const destroy = () => {
    // 清理容器等（根据实际需要）
  };

  init();

  return { show, refresh, destroy };
}

// 全局声明
declare global {
  interface Window {
    initAliyunCaptcha: (config: any) => void;
  }
}