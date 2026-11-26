<template>
  <view class="page">
    <view v-if="loading" class="tip">加载中…</view>
    <view v-else-if="!item" class="tip">内容不存在或已下架</view>

    <block v-else>
      <view class="head">
        <view class="title">{{ item.title }}</view>
        <view class="meta">
          <text v-if="item.city">{{ item.city }}</text>
          <text v-if="item.industry">{{ item.industry }}</text>
          <text class="cat">{{ item.categoryName || '' }}</text>
        </view>
      </view>

      <view class="body">
        <view class="sub" v-if="item.subtitle">{{ item.subtitle }}</view>
        <view class="text">{{ item.text || item.summary || '暂无正文' }}</view>
      </view>

      <view class="ai" v-if="item.ai && item.ai.summary">
        <view class="ai-t">🤖 AI 解读</view>
        <view class="ai-body">{{ item.ai.summary }}</view>
      </view>

      <view class="actions">
        <button class="btn" open-type="share">分享到抖音 / 微信</button>
      </view>
    </block>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app';
import api from '../../api/index.js';

const item = ref(null);
const loading = ref(true);

onLoad(async (opts) => {
  try {
    const r = await api.listing(opts.id);
    item.value = (r && (r.listing || r)) || null;
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
});

onShareAppMessage(() => {
  const it = item.value || {};
  return {
    title: it.title || '小鱼来了',
    path: `/pages/detail/detail?id=${it.id || ''}`,
  };
});
</script>

<style scoped>
.page {
  padding-bottom: 60rpx;
}
.head {
  padding: 36rpx 32rpx 24rpx;
  background: #fff;
}
.title {
  font-size: 38rpx;
  font-weight: 700;
  color: #10233d;
  line-height: 1.4;
}
.meta {
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #8a97ab;
}
.meta text {
  margin-right: 18rpx;
}
.cat {
  color: #1a6dff;
}
.body {
  margin-top: 16rpx;
  padding: 32rpx;
  background: #fff;
}
.sub {
  font-size: 28rpx;
  color: #607089;
  margin-bottom: 20rpx;
}
.text {
  font-size: 28rpx;
  color: #10233d;
  line-height: 1.85;
  white-space: pre-wrap;
}
.ai {
  margin-top: 16rpx;
  padding: 30rpx 32rpx;
  background: #eef4ff;
}
.ai-t {
  font-size: 28rpx;
  font-weight: 600;
  color: #1a4fa8;
  margin-bottom: 12rpx;
}
.ai-body {
  font-size: 26rpx;
  color: #2c4260;
  line-height: 1.8;
}
.actions {
  padding: 30rpx 32rpx;
}
.btn {
  height: 88rpx;
  line-height: 88rpx;
  background: #1a6dff;
  color: #fff;
  border-radius: 12rpx;
  font-size: 30rpx;
}
.tip {
  padding: 80rpx;
  text-align: center;
  color: #8a97ab;
}
</style>
