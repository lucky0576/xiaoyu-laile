<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">会议</view>
      <view class="hero-s">线上项目对接与路演</view>
    </view>

    <xyl-empty v-if="loading" icon="⏳" text="加载中…" />
    <xyl-empty v-else-if="!items.length" icon="📹" text="暂无会议" />

    <view v-for="m in items" :key="m.id" class="card">
      <view class="row">
        <text class="name">{{ m.title || m.name }}</text>
        <text class="state" :class="stateClass(m)">{{ stateName(m) }}</text>
      </view>
      <view class="meta">
        <text v-if="m.startAt">{{ fmtTime(m.startAt) }}</text>
        <text v-if="m.hostName">主持 {{ m.hostName }}</text>
      </view>
    </view>

    <view class="note">
      加入会议需要 WebRTC / 第三方会议 SDK。<br />
      小程序端可跳转腾讯会议等 App，或在网页端直接参会。
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../api/index.js';

const items = ref([]);
const loading = ref(true);

function stateName(m) {
  if (m.status === 'ended') return '已结束';
  if (m.startAt && new Date(m.startAt).getTime() > Date.now()) return '未开始';
  return '进行中';
}
function stateClass(m) {
  if (m.status === 'ended') return 'muted';
  if (m.startAt && new Date(m.startAt).getTime() > Date.now()) return 'wait';
  return 'live';
}
function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

onMounted(async () => {
  try {
    const r = await api.meetings();
    items.value = (r && (r.items || r.meetings || (Array.isArray(r) ? r : []))) || [];
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
.name { flex: 1; font-size: 29rpx; font-weight: 600; color: #10233d; }
.state { flex: none; margin-left: 14rpx; padding: 3rpx 14rpx; border-radius: 6rpx; font-size: 20rpx; }
.state.live { background: #e8f5ec; color: #2f8f4e; }
.state.wait { background: #eef4ff; color: #1a6dff; }
.state.muted { background: #eef1f6; color: #7a8798; }
.meta { margin-top: 10rpx; font-size: 22rpx; color: #a8b3c4; }
.meta text { margin-right: 18rpx; }
.note { margin: 24rpx; padding: 22rpx; background: #f7faff; border-radius: 12rpx; font-size: 22rpx; color: #7d93b5; line-height: 1.8; }
</style>
