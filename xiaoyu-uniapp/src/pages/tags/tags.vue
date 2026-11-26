<template>
  <view class="page">
    <xyl-empty v-if="!loggedIn" icon="🔒" text="登录后管理兴趣标签" />
    <xyl-empty v-else-if="loading" icon="⏳" text="加载中…" />
    <block v-else>
      <view class="sec">
        <view class="sec-t">我的标签</view>
        <view class="sub">标签会影响推荐给你的内容</view>
        <view v-for="(v, k) in flat" :key="k" class="group">
          <view class="group-t">{{ groupName(k) }}</view>
          <view class="chips">
            <view v-for="(t, i) in v" :key="i" class="chip">{{ t }}</view>
            <view v-if="!v.length" class="none">未设置</view>
          </view>
        </view>
      </view>
    </block>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../../api/index.js';
import { userStore } from '../../store/user.js';

const data = ref({ tags: {} });
const loading = ref(true);
const loggedIn = computed(() => userStore.loggedIn);

const flat = computed(() => {
  const t = (data.value && data.value.tags) || {};
  const out = {};
  for (const k of Object.keys(t)) {
    const v = t[k];
    out[k] = Array.isArray(v) ? v : [];
  }
  return out;
});

const NAMES = {
  cities: '城市',
  industries: '行业',
  businessTypes: '业务类型',
  personality: '性格',
  hobbies: '爱好',
};

function groupName(k) {
  return NAMES[k] || k;
}

onMounted(async () => {
  if (!userStore.loggedIn) {
    loading.value = false;
    return;
  }
  try {
    data.value = (await api.myTags()) || { tags: {} };
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.page { min-height: 100vh; padding-bottom: 60rpx; }
.sec { margin: 22rpx 24rpx 0; padding: 28rpx; background: #fff; border-radius: 16rpx; }
.sec-t { font-size: 29rpx; font-weight: 600; color: #10233d; }
.sub { margin-top: 8rpx; font-size: 23rpx; color: #8a97ab; }
.group { margin-top: 24rpx; }
.group-t { font-size: 25rpx; color: #607089; margin-bottom: 12rpx; }
.chips { display: flex; flex-wrap: wrap; gap: 12rpx; }
.chip { padding: 8rpx 22rpx; border-radius: 999rpx; background: #eef3fb; color: #1a6dff; font-size: 23rpx; }
.none { font-size: 23rpx; color: #c2cbd8; }
</style>
