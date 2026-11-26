<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">交流区</view>
      <view class="hero-s">产业话题与同行讨论</view>
    </view>

    <xyl-empty v-if="loading" icon="⏳" text="加载中…" />
    <xyl-empty v-else-if="!forums.length" icon="💬" text="暂无板块" />

    <view v-for="f in forums" :key="f.slug || f.id" class="card" @tap="openForum(f)">
      <view class="row">
        <text class="name">{{ f.name || f.title }}</text>
        <text class="count" v-if="f.postCount">{{ f.postCount }} 帖</text>
      </view>
      <view class="sub" v-if="f.desc || f.description">{{ f.desc || f.description }}</view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../api/index.js';

const forums = ref([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const r = await api.forums();
    forums.value = (r && (r.items || r.forums || (Array.isArray(r) ? r : []))) || [];
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
});

function openForum(f) {
  uni.navigateTo({ url: `/pages/forum/posts?slug=${encodeURIComponent(f.slug || f.id)}&name=${encodeURIComponent(f.name || '')}` });
}
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
.sub { margin-top: 10rpx; font-size: 24rpx; color: #607089; line-height: 1.6; }
</style>
