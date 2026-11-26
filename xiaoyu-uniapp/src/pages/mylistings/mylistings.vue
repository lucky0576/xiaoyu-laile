<template>
  <view class="page">
    <view v-if="!loggedIn" class="tip">
      <view>登录后查看我发布的信息</view>
      <button class="btn primary mt20" @tap="goLogin">去登录</button>
    </view>

    <block v-else>
      <view class="tabs">
        <view
          v-for="s in statuses"
          :key="s.id"
          class="tab"
          :class="{ active: s.id === status }"
          @tap="pick(s.id)"
        >
          {{ s.name }}
        </view>
      </view>

      <view v-if="loading" class="tip">加载中…</view>
      <view v-else-if="!items.length" class="tip">这里还空着，去发布一条吧</view>

      <view v-for="it in items" :key="it.id" class="card" @tap="openDetail(it)">
        <view class="row">
          <text class="card-title">{{ it.title || '未命名' }}</text>
          <text class="status" :class="statusClass(it.status)">{{ statusName(it.status) }}</text>
        </view>
        <view class="card-sub">{{ it.subtitle || it.summary || '' }}</view>
        <view class="card-meta">
          <text>{{ fmtDate(it.createdAt) }}</text>
          <text v-if="it.views">浏览 {{ it.views }}</text>
          <text v-if="it.commentCount">留言 {{ it.commentCount }}</text>
        </view>
      </view>
    </block>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import api from '../../api/index.js';
import { userStore } from '../../store/user.js';

const statuses = [
  { id: 'all', name: '全部' },
  { id: 'published', name: '已发布' },
  { id: 'draft', name: '草稿' },
];
const status = ref('all');
const items = ref([]);
const loading = ref(true);

const loggedIn = computed(() => userStore.loggedIn);

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' });
}

async function load() {
  if (!userStore.loggedIn) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const r = await api.myListings(userStore.user && userStore.user.id, {
      status: status.value,
    });
    items.value = (r && (r.items || r.list)) || [];
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function pick(id) {
  if (status.value === id) return;
  status.value = id;
  load();
}

function statusName(s) {
  return { published: '已发布', draft: '草稿', expired: '已过期', hidden: '已隐藏' }[s] || s || '';
}
function statusClass(s) {
  return s === 'published' ? 'ok' : s === 'draft' ? 'muted' : 'warn';
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function openDetail(it) {
  uni.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(it.id)}` });
}

onMounted(load);
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 20rpx 24rpx 60rpx;
}
.tabs {
  display: flex;
  gap: 14rpx;
  padding: 10rpx 0 22rpx;
}
.tab {
  padding: 12rpx 30rpx;
  border-radius: 999rpx;
  background: #fff;
  color: #607089;
  font-size: 26rpx;
}
.tab.active {
  background: #1a6dff;
  color: #fff;
}
.card {
  margin-bottom: 16rpx;
  padding: 26rpx 28rpx;
  background: #fff;
  border-radius: 16rpx;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.card-title {
  flex: 1;
  font-size: 29rpx;
  font-weight: 600;
  color: #10233d;
}
.status {
  flex: none;
  margin-left: 16rpx;
  padding: 4rpx 14rpx;
  border-radius: 8rpx;
  font-size: 20rpx;
}
.status.ok {
  background: #e8f5ec;
  color: #2f8f4e;
}
.status.muted {
  background: #eef1f6;
  color: #7a8798;
}
.status.warn {
  background: #fdf1e6;
  color: #b77424;
}
.card-sub {
  margin-top: 10rpx;
  font-size: 25rpx;
  color: #607089;
  line-height: 1.6;
}
.card-meta {
  margin-top: 14rpx;
  font-size: 22rpx;
  color: #a8b3c4;
}
.card-meta text {
  margin-right: 20rpx;
}
.tip {
  padding: 90rpx 30rpx;
  text-align: center;
  color: #8a97ab;
  font-size: 26rpx;
}
.btn {
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 12rpx;
  font-size: 28rpx;
}
.btn.primary {
  background: #1a6dff;
  color: #fff;
}
.mt20 {
  margin-top: 30rpx;
}
</style>
