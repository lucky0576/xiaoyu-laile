<template>
  <view class="page">
    <xyl-empty v-if="loading" icon="⏳" text="加载中…" />
    <xyl-empty v-else-if="!items.length" icon="💬" text="这个板块还没有帖子" />
    <view v-for="p in items" :key="p.id" class="card">
      <view class="title">{{ p.title }}</view>
      <view class="body" v-if="p.content || p.body">{{ (p.content || p.body).slice(0, 120) }}</view>
      <view class="meta">
        <text>{{ p.authorName || p.nickname || '匿名' }}</text>
        <text v-if="p.likeCount">❤️ {{ p.likeCount }}</text>
        <text v-if="p.commentCount">💬 {{ p.commentCount }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import api from '../../api/index.js';

const items = ref([]);
const loading = ref(true);

onLoad(async (opts) => {
  try {
    const r = await api.forumPosts(opts.slug, { page: 1, size: 30 });
    items.value = (r && (r.items || r.posts)) || [];
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.page { min-height: 100vh; padding: 20rpx 24rpx 60rpx; }
.card { margin-bottom: 16rpx; padding: 26rpx 28rpx; background: #fff; border-radius: 16rpx; }
.title { font-size: 29rpx; font-weight: 600; color: #10233d; }
.body { margin-top: 10rpx; font-size: 24rpx; color: #607089; line-height: 1.6; }
.meta { margin-top: 14rpx; font-size: 21rpx; color: #a8b3c4; }
.meta text { margin-right: 18rpx; }
</style>
