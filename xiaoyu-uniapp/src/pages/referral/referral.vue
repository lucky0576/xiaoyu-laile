<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">推广有礼</view>
      <view class="hero-s">邀请同行注册，双方都有奖励</view>
    </view>

    <xyl-empty v-if="!loggedIn" icon="🔒" text="登录后查看我的推广数据" />
    <xyl-empty v-else-if="loading" icon="⏳" text="加载中…" />

    <block v-else>
      <view class="stats">
        <view class="stat">
          <view class="stat-n">{{ data.invited || 0 }}</view>
          <view class="stat-l">已邀请</view>
        </view>
        <view class="stat">
          <view class="stat-n">{{ data.registered || 0 }}</view>
          <view class="stat-l">已注册</view>
        </view>
        <view class="stat">
          <view class="stat-n">{{ data.reward || 0 }}</view>
          <view class="stat-l">奖励（元）</view>
        </view>
      </view>

      <view class="card">
        <view class="card-t">我的邀请码</view>
        <view class="code">{{ data.code || '—' }}</view>
        <button class="btn" @tap="copyCode">复制邀请码</button>
      </view>
    </block>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../../api/index.js';
import { userStore } from '../../store/user.js';

const data = ref({});
const loading = ref(true);
const loggedIn = computed(() => userStore.loggedIn);

onMounted(async () => {
  if (!userStore.loggedIn) {
    loading.value = false;
    return;
  }
  try {
    data.value = (await api.referralMe()) || {};
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
});

function copyCode() {
  if (!data.value.code) return;
  uni.setClipboardData({
    data: data.value.code,
    success: () => uni.showToast({ title: '邀请码已复制', icon: 'none' }),
  });
}
</script>

<style scoped>
.page { min-height: 100vh; padding-bottom: 60rpx; }
.hero { padding: 40rpx 32rpx 30rpx; background: linear-gradient(135deg, #0b1f3a, #1a4fa8); color: #fff; }
.hero-t { font-size: 38rpx; font-weight: 700; }
.hero-s { margin-top: 10rpx; font-size: 25rpx; opacity: 0.85; }
.stats { display: flex; gap: 14rpx; padding: 24rpx; }
.stat { flex: 1; padding: 26rpx 0; background: #fff; border-radius: 14rpx; text-align: center; }
.stat-n { font-size: 38rpx; font-weight: 700; color: #1a6dff; }
.stat-l { margin-top: 6rpx; font-size: 21rpx; color: #8a97ab; }
.card { margin: 0 24rpx; padding: 30rpx; background: #fff; border-radius: 16rpx; }
.card-t { font-size: 27rpx; font-weight: 600; color: #10233d; }
.code { margin: 20rpx 0; font-size: 44rpx; font-weight: 700; letter-spacing: 4rpx; color: #1a6dff; text-align: center; }
.btn { height: 82rpx; line-height: 82rpx; background: #eef3fb; color: #1a6dff; border-radius: 12rpx; font-size: 27rpx; }
</style>
