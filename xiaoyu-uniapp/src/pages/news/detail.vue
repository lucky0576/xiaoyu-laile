<template>
  <view class="page">
    <xyl-empty v-if="loading" icon="⏳" text="加载中…" />
    <view v-else-if="!item" class="wrap">
      <xyl-empty icon="📰" text="资讯不存在" />
    </view>
    <view v-else class="wrap">
      <view class="title">{{ item.title }}</view>
      <view class="meta">{{ item.source || '小鱼来了' }} · {{ fmtDate(item.publishedAt || item.createdAt) }}</view>
      <view class="body">{{ item.content || item.summary || '' }}</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import api from '../../api/index.js';

const item = ref(null);
const loading = ref(true);

onLoad(async (opts) => {
  try {
    const r = await api.newsDetail(opts.id);
    item.value = (r && (r.news || r.item || r)) || null;
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
});

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
</script>

<style scoped>
.page { min-height: 100vh; padding-bottom: 60rpx; }
.wrap { padding: 34rpx 32rpx; background: #fff; min-height: 100vh; }
.title { font-size: 38rpx; font-weight: 700; color: #10233d; line-height: 1.45; }
.meta { margin-top: 16rpx; font-size: 22rpx; color: #a8b3c4; }
.body { margin-top: 26rpx; font-size: 28rpx; color: #2c3e57; line-height: 1.9; white-space: pre-wrap; }
</style>
