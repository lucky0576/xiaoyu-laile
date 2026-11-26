<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">产业基金</view>
      <view class="hero-s">已核实与已审核的基金条目</view>
    </view>

    <xyl-empty v-if="loading && !items.length" icon="⏳" text="加载中…" />
    <xyl-empty v-else-if="!items.length" icon="💰" text="暂无基金条目" />

    <view v-for="(f, i) in items" :key="f.id || i" class="card">
      <view class="title">{{ f.name }}</view>
      <view class="sub" v-if="f.desc || f.description">{{ f.desc || f.description }}</view>
      <view class="meta">
        <text v-if="f.region">{{ f.region }}</text>
        <text v-if="f.scale">规模 {{ f.scale }}</text>
        <text v-if="f.stage">阶段 {{ f.stage }}</text>
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
    const r = await api.fundsList();
    items.value = (r && (r.funds || r.items || r.list)) || [];
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
.card { margin: 16rpx 24rpx 0; padding: 26rpx 28rpx; background: #fff; border-radius: 16rpx; }
.title { font-size: 29rpx; font-weight: 600; color: #10233d; }
.sub { margin-top: 10rpx; font-size: 24rpx; color: #607089; line-height: 1.6; }
.meta { margin-top: 14rpx; font-size: 21rpx; color: #a8b3c4; }
.meta text { margin-right: 18rpx; }
</style>
