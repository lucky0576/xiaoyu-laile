<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">主理人</view>
      <view class="hero-s">区域与行业的主理人合作计划</view>
    </view>

    <xyl-empty v-if="loading" icon="⏳" text="加载中…" />
    <xyl-empty v-else-if="!items.length" icon="🤝" text="暂无主理人信息" />

    <view v-for="s in items" :key="s.id" class="card">
      <view class="row">
        <text class="name">{{ s.name || s.nickname || s.region }}</text>
        <text class="level" v-if="s.levelName || s.level">{{ s.levelName || s.level }}</text>
      </view>
      <view class="sub" v-if="s.region || s.industry">
        <text v-if="s.region">{{ s.region }}</text>
        <text v-if="s.industry"> · {{ s.industry }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../api/index.js';

const items = ref([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const r = await api.stewards();
    items.value = (r && (r.items || r.stewards || (Array.isArray(r) ? r : []))) || [];
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
.level { font-size: 21rpx; color: #1a6dff; }
.sub { margin-top: 8rpx; font-size: 23rpx; color: #8a97ab; }
</style>
