<template>
  <view class="page">
    <xyl-empty v-if="!loggedIn" icon="🔒" text="登录后查看通讯录" />
    <block v-else>
      <view class="bar">
        <input v-model="q" class="input" placeholder="搜索联系人或公司" @confirm="load" />
      </view>
      <view class="stat">共 {{ total }} 位联系人 · 其中 {{ registered }} 位已注册</view>

      <xyl-empty v-if="loading" icon="⏳" text="加载中…" />
      <xyl-empty v-else-if="!items.length" icon="👥" text="通讯录还是空的" />

      <view v-for="c in items" :key="c.id || c.phone" class="card">
        <view class="avatar">{{ (c.name || '?').slice(0, 1) }}</view>
        <view class="info">
          <view class="row1">
            <text class="name">{{ c.name || '未命名' }}</text>
            <text class="tag" v-if="c.isRegistered">已注册</text>
          </view>
          <view class="sub" v-if="c.company">{{ c.company }}<text v-if="c.title"> · {{ c.title }}</text></view>
          <view class="phone" v-if="c.phone">{{ c.phone }}</view>
        </view>
      </view>
    </block>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../../api/index.js';
import { userStore } from '../../store/user.js';

const items = ref([]);
const total = ref(0);
const registered = ref(0);
const loading = ref(true);
const q = ref('');
const loggedIn = computed(() => userStore.loggedIn);

async function load() {
  if (!userStore.loggedIn) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const r = await api.contacts({ q: q.value });
    items.value = (r && r.items) || [];
    total.value = (r && r.total) || 0;
    registered.value = (r && r.registered) || 0;
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.page { min-height: 100vh; padding: 20rpx 24rpx 60rpx; }
.bar { margin-bottom: 14rpx; }
.input { height: 80rpx; padding: 0 24rpx; background: #fff; border: 1px solid #dce3ef; border-radius: 12rpx; font-size: 26rpx; }
.stat { padding: 6rpx 4rpx 18rpx; font-size: 22rpx; color: #8a97ab; }
.card { display: flex; margin-bottom: 14rpx; padding: 24rpx 26rpx; background: #fff; border-radius: 16rpx; }
.avatar { flex: none; width: 84rpx; height: 84rpx; border-radius: 50%; background: linear-gradient(135deg, #0b1f3a, #1a4fa8); color: #fff; font-size: 34rpx; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.info { flex: 1; margin-left: 22rpx; }
.row1 { display: flex; align-items: center; }
.name { font-size: 28rpx; font-weight: 600; color: #10233d; }
.tag { margin-left: 12rpx; padding: 2rpx 12rpx; border-radius: 6rpx; background: #e8f5ec; color: #2f8f4e; font-size: 19rpx; }
.sub { margin-top: 6rpx; font-size: 23rpx; color: #607089; }
.phone { margin-top: 6rpx; font-size: 22rpx; color: #1a6dff; }
</style>
