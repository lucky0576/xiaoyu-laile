<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">地产信息</view>
      <view class="hero-s">出售 / 转让 / 融资 三类地产信息聚合</view>
    </view>

    <view class="chips">
      <view
        v-for="t in tabs"
        :key="t.id"
        class="chip"
        :class="{ active: tab === t.id }"
        @tap="pick(t.id)"
      >
        {{ t.name }}
      </view>
    </view>

    <xyl-listings :key="tab" :query="{ q: keywordFor(tab) }" empty-icon="🏢" empty-text="暂无地产信息" />
  </view>
</template>

<script setup>
import { ref } from 'vue';

const tabs = [
  { id: 'all', name: '全部' },
  { id: 'sale', name: '出售' },
  { id: 'transfer', name: '转让' },
  { id: 'financing', name: '融资' },
];
const tab = ref('all');

function keywordFor(id) {
  // 后端不支持按「地产类型」过滤，用关键词检索现有信息后归类
  if (id === 'sale') return '出售';
  if (id === 'transfer') return '转让';
  if (id === 'financing') return '融资';
  return '地产';
}

function pick(id) {
  tab.value = id;
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 40rpx;
}
.hero {
  padding: 40rpx 32rpx 30rpx;
  background: linear-gradient(135deg, #0b1f3a, #1a4fa8);
  color: #fff;
}
.hero-t {
  font-size: 38rpx;
  font-weight: 700;
}
.hero-s {
  margin-top: 10rpx;
  font-size: 25rpx;
  opacity: 0.85;
}
.chips {
  display: flex;
  gap: 14rpx;
  padding: 22rpx 24rpx 4rpx;
}
.chip {
  padding: 12rpx 30rpx;
  border-radius: 999rpx;
  background: #fff;
  color: #607089;
  font-size: 26rpx;
}
.chip.active {
  background: #1a6dff;
  color: #fff;
}
</style>
