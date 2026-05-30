<template>
  <button
    class="theme-toggle"
    @click="toggleTheme"
  >
    {{ isDark ? "☀️" : "🌙" }}
  </button>
</template>

<script setup lang="ts">
import { useTheme } from "@/composables/useTheme";

const {
  isDark,
  toggleTheme
} = useTheme();
</script>

<style scoped>
.theme-toggle {
  position: fixed;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  font-size: 20px;
  color: var(--text-primary);
  display: flex;
  justify-content: center;
  align-items: center;
  transition: 0.2s;
  z-index: 1000;
}

.theme-toggle:hover {
  background: rgba(255, 255, 255, 0.1);
}
</style>