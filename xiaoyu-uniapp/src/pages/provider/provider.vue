<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">服务商</view>
      <view class="hero-s">已认证的产业服务提供方</view>
    </view>

    <xyl-empty v-if="loading" icon="⏳" text="加载中…" />
    <xyl-empty v-else-if="!items.length" icon="🏢" text="暂无服务商" />

    <view v-for="p in items" :key="p.id" class="card">
      <view class="row">
        <text class="name">{{ p.name || p.company }}</text>
        <text class="badge" v-if="p.verified || p.status === 'approved'">已认证</text>
      </view>
      <view class="sub" v-if="p.desc || p.intro">{{ p.desc || p.intro }}</view>
      <view class="meta">
        <text v-if="p.city">{{ p.city }}</text>
        <text v-if="p.industry">{{ p.industry }}</text>
        <text v-if="p.services">{{ p.services }}</text>
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
    const r = await api.providers();
    items.value = (r && (r.items || r.providers || (Array.isArray(r) ? r : []))) || [];
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
.row { display: flex; align-items: center; }
.name { flex: 1; font-size: 29rpx; font-weight: 600; color: #10233d; }
.badge { padding: 3rpx 12rpx; border-radius: 6rpx; background: #e8f5ec; color: #2f8f4e; font-size: 19rpx; }
.sub { margin-top: 10rpx; font-size: 24rpx; color: #607089; line-height: 1.6; }
.meta { margin-top: 12rpx; font-size: 21rpx; color: #a8b3c4; }
.meta text { margin-right: 18rpx; }
</style>
