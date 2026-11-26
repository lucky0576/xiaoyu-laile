<template>
  <view class="page">
    <view class="hero">
      <view class="hero-title">小鱼来了</view>
      <view class="hero-sub">找项目 · 投资 · 产业</view>
    </view>

    <scroll-view class="tabs" scroll-x>
      <view
        v-for="c in cats"
        :key="c.id"
        class="tab"
        :class="{ active: c.id === category }"
        @tap="pickCategory(c.id)"
      >
        {{ c.name }}
      </view>
    </scroll-view>

    <view v-if="loading" class="tip">加载中…</view>
    <view v-else-if="!items.length" class="tip">暂无内容，下拉刷新试试</view>

    <view v-for="it in items" :key="it.id" class="card" @tap="openDetail(it)">
      <view class="card-title">{{ it.title || '未命名' }}</view>
      <view class="card-sub">{{ it.subtitle || it.summary || '' }}</view>
      <view class="card-meta">
        <text v-if="it.city">{{ it.city }}</text>
        <text v-if="it.industry">{{ it.industry }}</text>
        <text class="cat">{{ it.categoryName || '' }}</text>
      </view>
    </view>

    <view class="foot">小鱼来了 · 杭州硕鱼科技有限公司</view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import api from '../../api/index.js';

const cats = ref([{ id: '', name: '全部' }]);
const category = ref('');
const items = ref([]);
const loading = ref(false);
const page = ref(1);
const finished = ref(false);

async function loadTaxonomy() {
  try {
    const t = await api.taxonomy();
    const list = (t && (t.categories || t.CATEGORIES)) || [];
    cats.value = [{ id: '', name: '全部' }].concat(
      list.map((c) => ({ id: c.id, name: c.name })),
    );
  } catch {
    /* 拿不到就用「全部」 */
  }
}

async function load(reset = false) {
  if (loading.value) return;
  if (reset) {
    page.value = 1;
    finished.value = false;
  }
  if (finished.value) return;
  loading.value = true;
  try {
    const r = await api.listings({
      category: category.value,
      page: page.value,
      pageSize: 10,
      sort: 'latest',
    });
    const list = (r && (r.items || r.list)) || [];
    items.value = reset ? list : items.value.concat(list);
    if (list.length < 10) finished.value = true;
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function pickCategory(id) {
  if (category.value === id) return;
  category.value = id;
  load(true);
}

function openDetail(it) {
  uni.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(it.id)}` });
}

onMounted(async () => {
  await loadTaxonomy();
  await load(true);
});

onPullDownRefresh(async () => {
  await load(true);
  uni.stopPullDownRefresh();
});

onReachBottom(() => {
  if (finished.value) return;
  page.value += 1;
  load();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 40rpx;
}
.hero {
  padding: 40rpx 32rpx 28rpx;
  background: linear-gradient(135deg, #0b1f3a, #1a4fa8);
  color: #fff;
}
.hero-title {
  font-size: 44rpx;
  font-weight: 700;
}
.hero-sub {
  margin-top: 8rpx;
  font-size: 26rpx;
  opacity: 0.85;
}
.tabs {
  white-space: nowrap;
  padding: 20rpx 24rpx;
  background: #fff;
}
.tab {
  display: inline-block;
  padding: 12rpx 26rpx;
  margin-right: 14rpx;
  border-radius: 999rpx;
  background: #eef3fb;
  color: #607089;
  font-size: 26rpx;
}
.tab.active {
  background: #1a6dff;
  color: #fff;
}
.card {
  margin: 20rpx 24rpx 0;
  padding: 28rpx;
  background: #fff;
  border-radius: 18rpx;
}
.card-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #10233d;
}
.card-sub {
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #607089;
  line-height: 1.6;
}
.card-meta {
  margin-top: 16rpx;
  font-size: 22rpx;
  color: #8a97ab;
}
.card-meta text {
  margin-right: 16rpx;
}
.cat {
  color: #1a6dff;
}
.tip {
  padding: 60rpx;
  text-align: center;
  color: #8a97ab;
  font-size: 26rpx;
}
.foot {
  margin-top: 40rpx;
  text-align: center;
  font-size: 22rpx;
  color: #a8b3c4;
}
</style>
