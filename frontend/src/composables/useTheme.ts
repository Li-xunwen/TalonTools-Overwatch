// src/composables/useTheme.ts
import { ref } from "vue";

const isDark = ref(false);
let initialized = false;

export function useTheme() {
  // 初始化逻辑：仅在首次调用时执行
  if (!initialized) {
    const savedTheme = localStorage.getItem("theme");
    // 默认深色，或者根据保存的值
    const dark = savedTheme === null || savedTheme === "dark";
    applyTheme(dark);
    initialized = true;
  }

  function applyTheme(dark: boolean) {
    isDark.value = dark;
    const html = document.documentElement;

    if (dark) {
      html.classList.add("dark-theme");
      html.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    } else {
      html.classList.remove("dark-theme");
      html.setAttribute("data-theme", "light");
      localStorage.setItem("theme", "light");
    }
  }

  function toggleTheme() {
    applyTheme(!isDark.value);
  }

  return {
    isDark,
    toggleTheme,
    // 暴露 initTheme 以便在需要的地方手动触发（虽然上面已经自动触发了）
    initTheme: () => {
        if (!initialized) {
             const savedTheme = localStorage.getItem("theme");
             const dark = savedTheme === null || savedTheme === "dark";
             applyTheme(dark);
             initialized = true;
        }
    }
  };
}