<template>
  <view class="page">
    <xyl-empty v-if="!loggedIn" icon="🔒" text="登录后管理账号绑定" />
    <xyl-empty v-else-if="loading" icon="⏳" text="加载中…" />
    <block v-else>
      <view v-for="b in list" :key="b.id" class="card">
        <view class="row">
          <text class="icon">{{ b.icon }}</text>
          <view class="info">
            <view class="name">{{ b.name }}</view>
            <view class="val">{{ b.bound ? b.value : '未绑定' }}</view>
          </view>
          <text class="state" :class="b.bound ? 'ok' : ''">{{ b.bound ? '已绑定' : '—' }}</text>
        </view>
      </view>
      <view class="note">小程序端暂不支持直接跳转微信/抖音授权，请在网页端完成绑定。</view>
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

const list = computed(() => {
  const b = data.value || {};
  return [
    {
      id: 'email',
      icon: '📧',
      name: '邮箱',
      bound: Boolean(b.email && b.email.bound),
      value: (b.email && b.email.address) || '',
    },
    {
      id: 'wechat',
      icon: '💚',
      name: '微信',
      bound: Boolean(b.wechat && b.wechat.bound),
      value: (b.wechat && b.wechat.nickname) || '',
    },
    {
      id: 'douyin',
      icon: '🎵',
      name: '抖音',
      bound: Boolean(b.douyin && b.douyin.bound),
      value: (b.douyin && b.douyin.nickname) || '',
    },
    {
      id: 'address',
      icon: '📦',
      name: '通讯地址',
      bound: Boolean(b.address && (b.address.detail || b.address.phone)),
      value: (b.address && b.address.detail) || '',
    },
  ];
});

onMounted(async () => {
  if (!userStore.loggedIn) {
    loading.value = false;
    return;
  }
  try {
    data.value = (await api.bindings()) || {};
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.page { min-height: 100vh; padding: 22rpx 24rpx 60rpx; }
.card { margin-bottom: 14rpx; padding: 26rpx 28rpx; background: #fff; border-radius: 16rpx; }
.row { display: flex; align-items: center; }
.icon { font-size: 38rpx; margin-right: 20rpx; }
.info { flex: 1; }
.name { font-size: 28rpx; font-weight: 600; color: #10233d; }
.val { margin-top: 6rpx; font-size: 23rpx; color: #8a97ab; }
.state { font-size: 21rpx; color: #c2cbd8; }
.state.ok { color: #2f8f4e; }
.note { margin-top: 20rpx; padding: 22rpx; background: #f7faff; border-radius: 12rpx; font-size: 22rpx; color: #7d93b5; line-height: 1.7; }
</style>
