<template>
  <view class="page">
    <view v-if="!loggedIn" class="tip">
      <view>登录后查看消息</view>
      <button class="btn primary mt20" @tap="goLogin">去登录</button>
    </view>

    <block v-else>
      <view class="head">
        <view class="head-t">消息 <text class="badge" v-if="unread">{{ unread }}</text></view>
        <view class="head-act" @tap="markAll" v-if="unread">全部已读</view>
      </view>

      <view v-if="loading" class="tip">加载中…</view>
      <view v-else-if="!items.length" class="tip">暂无消息</view>

      <view
        v-for="n in visible"
        :key="n.id"
        class="item"
        :class="{ unread: !n.read }"
        @tap="openItem(n)"
      >
        <view class="item-top">
          <text class="type">{{ n.typeName || n.type || '通知' }}</text>
          <text class="time">{{ fmtTime(n.createdAt) }}</text>
        </view>
        <view class="title">{{ n.title || '通知' }}</view>
        <view class="body" v-if="n.body">{{ n.body }}</view>
        <view class="dot" v-if="!n.read"></view>
      </view>

      <view v-if="hasMore" class="more" @tap="showAll">展开全部</view>
    </block>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import api from '../../api/index.js';
import { userStore } from '../../store/user.js';

const items = ref([]);
const unread = ref(0);
const loading = ref(true);
const expanded = ref(false);

const loggedIn = computed(() => userStore.loggedIn);
const visible = computed(() => (expanded.value ? items.value : items.value.slice(0, 8)));
const hasMore = computed(() => !expanded.value && items.value.length > 8);

function showAll() {
  expanded.value = true;
}

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
    const r = await api.notifications({ limit: 60 });
    items.value = (r && r.items) || [];
    unread.value = (r && r.unread) || 0;
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function markAll() {
  try {
    await api.notificationsRead([]);
    items.value = items.value.map((n) => ({ ...n, read: true }));
    unread.value = 0;
    uni.showToast({ title: '已全部标为已读', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: e.message || '操作失败', icon: 'none' });
  }
}

function openItem(n) {
  if (n.link) {
    // 主站的 link 是 #/xxx 形式，这里优先按详情页处理
    const m = String(n.link).match(/\/detail\/([^?&#]+)/);
    if (m) {
      uni.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(m[1])}` });
      return;
    }
  }
  if (!n.read) {
    api.notificationsRead([n.id]).catch(() => {});
    n.read = true;
    unread.value = Math.max(0, unread.value - 1);
  }
  if (n.body) uni.showModal({ title: n.title || '通知', content: n.body, showCancel: false });
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
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
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 6rpx 24rpx;
}
.head-t {
  font-size: 32rpx;
  font-weight: 600;
}
.badge {
  display: inline-block;
  margin-left: 10rpx;
  padding: 2rpx 14rpx;
  border-radius: 999rpx;
  background: #e04545;
  color: #fff;
  font-size: 20rpx;
}
.head-act {
  font-size: 24rpx;
  color: #1a6dff;
}
.item {
  position: relative;
  margin-bottom: 16rpx;
  padding: 26rpx 28rpx;
  background: #fff;
  border-radius: 16rpx;
}
.item.unread {
  border-left: 6rpx solid #1a6dff;
}
.item-top {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10rpx;
}
.type {
  font-size: 22rpx;
  color: #1a6dff;
}
.time {
  font-size: 22rpx;
  color: #a8b3c4;
}
.title {
  font-size: 29rpx;
  font-weight: 600;
  color: #10233d;
}
.body {
  margin-top: 8rpx;
  font-size: 25rpx;
  color: #607089;
  line-height: 1.6;
}
.dot {
  position: absolute;
  top: 26rpx;
  right: 26rpx;
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #e04545;
}
.more {
  padding: 26rpx;
  text-align: center;
  font-size: 26rpx;
  color: #1a6dff;
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
