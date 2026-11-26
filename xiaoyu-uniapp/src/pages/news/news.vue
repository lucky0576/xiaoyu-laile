<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">资讯</view>
      <view class="hero-s">产业动态与政策信息</view>
    </view>

    <xyl-empty v-if="loading && !items.length" icon="⏳" text="加载中…" />
    <xyl-empty v-else-if="!items.length" icon="📰" text="暂无资讯" />

    <view v-for="n in items" :key="n.id" class="card" @tap="open(n)">
      <view class="title">{{ n.title }}</view>
      <view class="sub" v-if="n.summary">{{ n.summary }}</view>
      <view class="meta">
        <text v-if="n.source">{{ n.source }}</text>
        <text>{{ fmtDate(n.publishedAt || n.createdAt) }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import api from '../../api/index.js';

const items = ref([]);
const loading = ref(true);

async function load() {
  loading.value = true;
  try {
    const r = await api.news({ limit: 30 });
    items.value = (r && (r.items || r.list)) || [];
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function open(n) {
  if (n.url) {
    // 小程序不能直接开外链，复制让用户到浏览器看
    uni.setClipboardData({
      data: n.url,
      success: () => uni.showToast({ title: '原文链接已复制', icon: 'none' }),
    });
    return;
  }
  if (n.url === undefined && n.id) {
    uni.navigateTo({ url: `/pages/news/detail?id=${encodeURIComponent(n.id)}` });
  }
}

onMounted(load);
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
</script>

<style scoped>
.page { min-height: 100vh; padding-bottom: 50rpx; }
.hero { padding: 40rpx 32rpx 30rpx; background: linear-gradient(135deg, #0b1f3a, #1a4fa8); color: #fff; }
.hero-t { font-size: 38rpx; font-weight: 700; }
.hero-s { margin-top: 10rpx; font-size: 25rpx; opacity: 0.85; }
.card { margin: 16rpx 24rpx 0; padding: 26rpx 28rpx; background: #fff; border-radius: 16rpx; }
.title { font-size: 29rpx; font-weight: 600; color: #10233d; line-height: 1.5; }
.sub { margin-top: 10rpx; font-size: 24rpx; color: #607089; line-height: 1.6; }
.meta { margin-top: 14rpx; font-size: 21rpx; color: #a8b3c4; }
.meta text { margin-right: 18rpx; }
</style>
