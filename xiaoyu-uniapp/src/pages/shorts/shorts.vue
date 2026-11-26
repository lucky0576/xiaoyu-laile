<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">短视频</view>
      <view class="hero-s">项目介绍与产业内容</view>
    </view>

    <xyl-empty v-if="loading && !items.length" icon="⏳" text="加载中…" />
    <xyl-empty v-else-if="!items.length" icon="📹" text="暂无短视频" />

    <view v-for="f in items" :key="f.id" class="card">
      <view class="title">{{ f.title }}</view>
      <view class="sub" v-if="f.subtitle || f.description">{{ f.subtitle || f.description }}</view>
      <view class="meta">
        <text v-if="f.typeName">{{ f.typeName }}</text>
        <text v-if="f.likeCount">❤️ {{ f.likeCount }}</text>
        <text v-if="f.viewCount">👁 {{ f.viewCount }}</text>
      </view>
      <view class="tip">在小程序内播放视频需接入 video 组件与合法域名</view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../api/index.js';

const items = ref([]);
const loading = ref(true);

async function load() {
  loading.value = true;
  try {
    const r = await api.feeds({ type: 'short', limit: 30 });
    items.value = (r && r.items) || [];
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.page { min-height: 100vh; padding-bottom: 50rpx; }
.hero { padding: 40rpx 32rpx 30rpx; background: linear-gradient(135deg, #0b1f3a, #1a4fa8); color: #fff; }
.hero-t { font-size: 38rpx; font-weight: 700; }
.hero-s { margin-top: 10rpx; font-size: 25rpx; opacity: 0.85; }
.card { margin: 16rpx 24rpx 0; padding: 26rpx 28rpx; background: #fff; border-radius: 16rpx; }
.title { font-size: 29rpx; font-weight: 600; color: #10233d; }
.sub { margin-top: 10rpx; font-size: 24rpx; color: #607089; line-height: 1.6; }
.meta { margin-top: 14rpx; font-size: 21rpx; color: #a8b3c4; }
.meta text { margin-right: 18rpx; }
.tip { margin-top: 14rpx; font-size: 20rpx; color: #c2cbd8; }
</style>
