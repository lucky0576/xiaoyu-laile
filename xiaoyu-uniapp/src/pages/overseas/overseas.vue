<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">出海 / 海外项目</view>
      <view class="hero-s">聚合平台内与出海、跨境、国际相关的信息</view>
    </view>

    <view class="chips">
      <view
        v-for="q in quick"
        :key="q.q"
        class="chip"
        :class="{ active: cur === q.q }"
        @tap="pick(q.q)"
      >
        {{ q.name }}
      </view>
    </view>

    <xyl-listings :key="cur" :query="{ q: cur }" empty-icon="🌏" empty-text="暂无海外相关内容" />
  </view>
</template>

<script setup>
import { ref } from 'vue';

const quick = [
  { name: '海外项目', q: '海外' },
  { name: '出海服务', q: '出海' },
  { name: '跨境贸易', q: '跨境' },
  { name: '东南亚', q: '东南亚' },
  { name: '中东', q: '中东' },
  { name: '一带一路', q: '一带一路' },
];
const cur = ref('海外');

function pick(q) {
  cur.value = q;
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
  flex-wrap: wrap;
  gap: 14rpx;
  padding: 22rpx 24rpx 4rpx;
}
.chip {
  padding: 12rpx 28rpx;
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
