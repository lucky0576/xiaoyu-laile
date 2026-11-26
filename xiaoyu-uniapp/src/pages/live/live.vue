<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">直播</view>
      <view class="hero-s">项目路演与产业直播</view>
    </view>

    <xyl-empty v-if="loading" icon="⏳" text="加载中…" />
    <xyl-empty v-else-if="!items.length" icon="📺" text="暂无直播" />

    <view v-for="f in items" :key="f.id" class="card">
      <view class="row">
        <text class="name">{{ f.title }}</text>
        <text class="badge" v-if="f.live">● 直播中</text>
      </view>
      <view class="sub" v-if="f.subtitle || f.description">{{ f.subtitle || f.description }}</view>
      <view class="meta">
        <text v-if="f.typeName">{{ f.typeName }}</text>
        <text v-if="f.viewerCount">{{ f.viewerCount }} 人在看</text>
      </view>
    </view>

    <view class="note">小程序内播放直播流需要配置 video 组件的合法播放域名。</view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../api/index.js';

const items = ref([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const r = await api.feeds({ type: 'live', limit: 30 });
    items.value = (r && r.items) || [];
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
.badge { flex: none; margin-left: 14rpx; padding: 3rpx 14rpx; border-radius: 6rpx; background: #fdecec; color: #e04545; font-size: 20rpx; }
.sub { margin-top: 10rpx; font-size: 24rpx; color: #607089; line-height: 1.6; }
.meta { margin-top: 12rpx; font-size: 21rpx; color: #a8b3c4; }
.meta text { margin-right: 18rpx; }
.note { margin: 24rpx; padding: 22rpx; background: #f7faff; border-radius: 12rpx; font-size: 22rpx; color: #7d93b5; line-height: 1.8; }
</style>
