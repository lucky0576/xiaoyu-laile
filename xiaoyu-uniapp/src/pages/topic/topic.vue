<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">创业大赛</view>
      <view class="hero-s">赛事信息、政策与人才支持</view>
    </view>

    <xyl-empty v-if="loading" icon="⏳" text="加载中…" />

    <block v-else>
      <view v-if="!contests.length" class="sec">
        <xyl-empty icon="🏆" text="暂无赛事信息" />
      </view>

      <view v-for="c in contests" :key="c.id || c.name" class="card">
        <view class="row">
          <text class="name">{{ c.name }}</text>
          <text class="status" v-if="c.countdown">{{ c.countdown }}</text>
        </view>
        <view class="sub" v-if="c.desc || c.intro">{{ c.desc || c.intro }}</view>
        <view class="meta">
          <text v-if="c.deadline">截止 {{ c.deadline }}</text>
          <text v-if="c.prize">奖金 {{ c.prize }}</text>
        </view>
      </view>

      <view v-if="policies.length" class="sec">
        <view class="sec-t">政策支持</view>
        <view v-for="(p, i) in policies" :key="i" class="line">· {{ p.title || p.name || p }}</view>
      </view>

      <view v-if="talent.length" class="sec">
        <view class="sec-t">人才政策</view>
        <view v-for="(t, i) in talent" :key="i" class="line">· {{ t.title || t.name || t }}</view>
      </view>
    </block>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../api/index.js';

const contests = ref([]);
const policies = ref([]);
const talent = ref([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const r = await api.contestList();
    contests.value = (r && r.contests) || [];
    policies.value = (r && r.policies) || [];
    talent.value = (r && r.talent) || [];
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.page { min-height: 100vh; padding-bottom: 50rpx; }
.hero { padding: 40rpx 32rpx 30rpx; background: linear-gradient(135deg, #0b1f3a, #1a4fa8); color: #fff; }
.hero-t { font-size: 38rpx; font-weight: 700; }
.hero-s { margin-top: 10rpx; font-size: 25rpx; opacity: 0.85; }
.card { margin: 16rpx 24rpx 0; padding: 26rpx 28rpx; background: #fff; border-radius: 16rpx; }
.row { display: flex; justify-content: space-between; align-items: flex-start; }
.name { flex: 1; font-size: 29rpx; font-weight: 600; color: #10233d; }
.status { flex: none; margin-left: 16rpx; padding: 4rpx 14rpx; border-radius: 8rpx; background: #eef4ff; color: #1a6dff; font-size: 20rpx; }
.sub { margin-top: 10rpx; font-size: 24rpx; color: #607089; line-height: 1.6; }
.meta { margin-top: 12rpx; font-size: 21rpx; color: #a8b3c4; }
.meta text { margin-right: 18rpx; }
.sec { margin: 20rpx 24rpx 0; padding: 26rpx 28rpx; background: #fff; border-radius: 16rpx; }
.sec-t { font-size: 28rpx; font-weight: 600; color: #10233d; margin-bottom: 14rpx; }
.line { font-size: 24rpx; color: #4a5b73; line-height: 1.9; }
</style>
