/**
 * 轻量用户状态（不引 Pinia，一个小程序项目用不上）
 */
import { reactive } from 'vue';
import { getToken, setToken, getCachedUser, setCachedUser } from '../api/client.js';

export const userStore = reactive({
  token: getToken(),
  user: getCachedUser(),
  get loggedIn() {
    return Boolean(this.token);
  },
  get isAdmin() {
    return Boolean(this.user && this.user.isAdmin);
  },
});

export function applyLogin(res) {
  if (!res) return;
  userStore.token = res.token || '';
  userStore.user = res.user || null;
  setToken(userStore.token);
  setCachedUser(userStore.user);
}

export function logout() {
  userStore.token = '';
  userStore.user = null;
  setToken('');
  setCachedUser(null);
}

export default userStore;
