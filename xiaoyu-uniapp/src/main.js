import { createSSRApp } from 'vue';
import App from './App.vue';
import { initApi } from './api/client.js';

export function createApp() {
  initApi();
  const app = createSSRApp(App);
  return { app };
}
