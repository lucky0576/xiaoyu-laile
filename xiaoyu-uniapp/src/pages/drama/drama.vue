<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">短剧</view>
      <view class="hero-s">产业短剧与剧情内容</view>
    </view>

    <xyl-empty v-if="loading && !items.length" icon="⏳" text="加载中…" />
    <xyl-empty v-else-if="!items.length" icon="🎬" text="暂无短剧" />

    <view v-for="d in items" :key="d.id" class="card">
      <view class="row">
        <view class="cover" :style="d.coverUrl ? `background-image:url(${d.coverUrl})` : ''">
          <text v-if="!d.coverUrl" class="ph">🎬</text>
        </view>
        <view class="info">
          <view class="title">{{ d.title }}</view>
          <view class="sub" v-if="d.subtitle || d.desc">{{ d.subtitle || d.desc }}</view>
          <view class="meta">
            <text v-if="d.categoryName || d.category">{{ d.categoryName || d.category }}</text>
            <text v-if="d.episodeCount">{{ d.episodeCount }} 集</text>
          </view>
        </view>
      </view>
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
    const r = await api.dramas({ size: 20 });
    items.value = (r && (r.items || r.list || r.dramas)) || [];
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
.card { margin: 16rpx 24rpx 0; padding: 22rpx; background: #fff; border-radius: 16rpx; }
.row { display: flex; }
.cover { flex: none; width: 150rpx; height: 200rpx; border-radius: 10rpx; background: #eef3fb; background-size: cover; background-position: center; display: flex; align-items: center; justify-content: center; }
.ph { font-size: 48rpx; }
.info { flex: 1; margin-left: 22rpx; }
.title { font-size: 29rpx; font-weight: 600; color: #10233d; }
.sub { margin-top: 10rpx; font-size: 24rpx; color: #607089; line-height: 1.6; }
.meta { margin-top: 14rpx; font-size: 21rpx; color: #a8b3c4; }
.meta text { margin-right: 16rpx; }
</style>
