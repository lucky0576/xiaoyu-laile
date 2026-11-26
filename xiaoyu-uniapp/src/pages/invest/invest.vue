<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">投资专区</view>
      <view class="hero-s">产业项目与资金方对接</view>
    </view>

    <xyl-empty v-if="loading" icon="⏳" text="加载中…" />
    <xyl-empty v-else-if="!plan" icon="📈" text="暂无投资方案" />

    <block v-else>
      <view class="sec">
        <view class="sec-t">当前方案</view>
        <view v-for="(p, i) in plans" :key="i" class="plan">
          <view class="plan-name">{{ p.name || p.title || `方案 ${i + 1}` }}</view>
          <view class="plan-sub" v-if="p.desc || p.description">{{ p.desc || p.description }}</view>
          <view class="plan-meta">
            <text v-if="p.minAmount">起投 {{ p.minAmount }}</text>
            <text v-if="p.quota">额度 {{ p.quota }}</text>
            <text v-if="p.term">期限 {{ p.term }}</text>
          </view>
        </view>
      </view>
    </block>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../../api/index.js';

const plan = ref(null);
const loading = ref(true);

const plans = computed(() => {
  const p = plan.value;
  if (!p) return [];
  if (Array.isArray(p)) return p;
  if (Array.isArray(p.plans)) return p.plans;
  if (Array.isArray(p.items)) return p.items;
  return [p];
});

onMounted(async () => {
  try {
    plan.value = await api.investPlan();
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
.sec { margin: 20rpx 24rpx 0; padding: 28rpx; background: #fff; border-radius: 16rpx; }
.sec-t { font-size: 29rpx; font-weight: 600; color: #10233d; margin-bottom: 16rpx; }
.plan { padding: 22rpx; margin-bottom: 14rpx; background: #f7faff; border-radius: 12rpx; }
.plan-name { font-size: 27rpx; font-weight: 600; color: #10233d; }
.plan-sub { margin-top: 8rpx; font-size: 24rpx; color: #607089; line-height: 1.6; }
.plan-meta { margin-top: 12rpx; font-size: 22rpx; color: #1a6dff; }
.plan-meta text { margin-right: 18rpx; }
</style>
