<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">会员权益</view>
      <view class="hero-s">按需选择档位，随时可升级</view>
    </view>

    <xyl-empty v-if="loading" icon="⏳" text="加载中…" />
    <xyl-empty v-else-if="!levels.length" icon="💎" text="暂无会员档位" />

    <view v-for="l in levels" :key="l.id" class="card" :class="{ hot: l.recommended }">
      <view class="row">
        <text class="name">{{ l.name }}</text>
        <text class="price">{{ l.priceText || (l.price ? `¥${l.price}` : '免费') }}</text>
      </view>
      <view class="term" v-if="l.term">{{ l.term }}</view>
      <view class="items">
        <view v-for="(b, i) in (l.benefits || [])" :key="i" class="item">· {{ b }}</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../api/index.js';

const levels = ref([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const r = await api.levels();
    levels.value = (r && (r.levels || r.items || (Array.isArray(r) ? r : []))) || [];
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
.card { margin: 16rpx 24rpx 0; padding: 28rpx; background: #fff; border-radius: 16rpx; }
.card.hot { border: 2rpx solid #1a6dff; }
.row { display: flex; justify-content: space-between; align-items: baseline; }
.name { font-size: 30rpx; font-weight: 600; color: #10233d; }
.price { font-size: 30rpx; font-weight: 700; color: #1a6dff; }
.term { margin-top: 6rpx; font-size: 22rpx; color: #a8b3c4; }
.items { margin-top: 16rpx; padding-top: 14rpx; border-top: 1px dashed #e6ecf7; }
.item { font-size: 24rpx; color: #4a5b73; line-height: 1.9; }
</style>
