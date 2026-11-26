<template>
  <view class="page">
    <xyl-empty v-if="!loggedIn" icon="🔒" text="登录后查看收藏" />
    <block v-else>
      <xyl-empty v-if="loading" icon="⏳" text="加载中…" />
      <xyl-empty v-else-if="!items.length" icon="⭐" text="还没有收藏内容" />
      <view v-for="f in items" :key="f.id" class="card">
        <view class="title">{{ f.title || '未命名' }}</view>
        <view class="sub" v-if="f.subtitle || f.description">{{ f.subtitle || f.description }}</view>
        <view class="meta"><text>{{ f.typeName || f.type || '' }}</text></view>
      </view>
    </block>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../../api/index.js';
import { userStore } from '../../store/user.js';

const items = ref([]);
const loading = ref(true);
const loggedIn = computed(() => userStore.loggedIn);

onMounted(async () => {
  if (!userStore.loggedIn) {
    loading.value = false;
    return;
  }
  try {
    const r = await api.favorites();
    items.value = (r && r.items) || [];
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.page { min-height: 100vh; padding: 20rpx 24rpx 60rpx; }
.card { margin-bottom: 16rpx; padding: 26rpx 28rpx; background: #fff; border-radius: 16rpx; }
.title { font-size: 29rpx; font-weight: 600; color: #10233d; line-height: 1.5; }
.sub { margin-top: 10rpx; font-size: 24rpx; color: #607089; line-height: 1.6; }
.meta { margin-top: 12rpx; font-size: 21rpx; color: #a8b3c4; }
</style>
