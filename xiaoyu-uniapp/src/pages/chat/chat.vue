<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">群聊</view>
      <view class="hero-s">按项目与行业建立的讨论房间</view>
    </view>

    <xyl-empty v-if="!loggedIn" icon="🔒" text="登录后查看群聊" />
    <xyl-empty v-else-if="loading" icon="⏳" text="加载中…" />
    <xyl-empty v-else-if="!rooms.length" icon="💬" text="暂无群聊房间" />

    <view v-for="r in rooms" :key="r.id" class="card">
      <view class="row">
        <text class="name">{{ r.name || r.title }}</text>
        <text class="count" v-if="r.memberCount">{{ r.memberCount }} 人</text>
      </view>
      <view class="sub" v-if="r.lastMessage">{{ r.lastMessage }}</view>
    </view>

    <view class="note">
      实时聊天需要 WebSocket / SSE 长连接。<br />
      小程序端需接入对应的实时通道（或改用云开发实时数据库），当前仅展示房间列表。
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../../api/index.js';
import { userStore } from '../../store/user.js';

const rooms = ref([]);
const loading = ref(true);
const loggedIn = computed(() => userStore.loggedIn);

onMounted(async () => {
  if (!userStore.loggedIn) {
    loading.value = false;
    return;
  }
  try {
    const r = await api.chatRooms();
    rooms.value = (r && (r.items || r.rooms || (Array.isArray(r) ? r : []))) || [];
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.page { min-height: 100vh; padding-bottom: 60rpx; }
.hero { padding: 40rpx 32rpx 30rpx; background: linear-gradient(135deg, #0b1f3a, #1a4fa8); color: #fff; }
.hero-t { font-size: 38rpx; font-weight: 700; }
.hero-s { margin-top: 10rpx; font-size: 25rpx; opacity: 0.85; }
.card { margin: 16rpx 24rpx 0; padding: 26rpx 28rpx; background: #fff; border-radius: 16rpx; }
.row { display: flex; justify-content: space-between; align-items: baseline; }
.name { font-size: 29rpx; font-weight: 600; color: #10233d; }
.count { font-size: 21rpx; color: #a8b3c4; }
.sub { margin-top: 8rpx; font-size: 23rpx; color: #8a97ab; }
.note { margin: 24rpx; padding: 22rpx; background: #f7faff; border-radius: 12rpx; font-size: 22rpx; color: #7d93b5; line-height: 1.8; }
</style>
