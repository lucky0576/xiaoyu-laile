<template>
  <view class="page">
    <view class="bar">
      <input
        v-model="keyword"
        class="input"
        confirm-type="search"
        placeholder="搜项目 / 城市 / 行业"
        :focus="true"
        @confirm="doSearch"
      />
      <button class="btn" @tap="doSearch">搜索</button>
    </view>

    <!-- 输入提示 -->
    <view v-if="!searched && suggest.length" class="block">
      <view class="block-t">猜你想搜</view>
      <view
        v-for="(s, i) in suggest"
        :key="`${s.type}-${s.id}-${i}`"
        class="sug"
        @tap="pickSuggest(s)"
      >
        <text class="sug-label">{{ s.label }}</text>
        <text class="sug-type">{{ typeName(s.type) }}</text>
      </view>
    </view>

    <!-- 结果 -->
    <block v-if="searched">
      <view v-if="loading" class="tip">搜索中…</view>
      <view v-else-if="!results.length" class="tip">没有找到相关内容</view>
      <view v-for="it in results" :key="it.id" class="card" @tap="openDetail(it)">
        <view class="card-title">{{ it.title || '未命名' }}</view>
        <view class="card-sub">{{ it.subtitle || it.summary || '' }}</view>
        <view class="card-meta">
          <text v-if="it.city">{{ it.city }}</text>
          <text v-if="it.industry">{{ it.industry }}</text>
          <text class="cat">{{ it.categoryName || '' }}</text>
        </view>
      </view>
    </block>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../api/index.js';

const keyword = ref('');
const suggest = ref([]);
const results = ref([]);
const loading = ref(false);
const searched = ref(false);

let timer = null;
watch(keyword, (v) => {
  clearTimeout(timer);
  const q = String(v || '').trim();
  if (!q) {
    suggest.value = [];
    return;
  }
  // 输入防抖，避免每敲一个字都打一次接口
  timer = setTimeout(async () => {
    try {
      const r = await api.searchSuggest(q);
      suggest.value = ((r && r.items) || []).slice(0, 12);
    } catch {
      suggest.value = [];
    }
  }, 300);
});

function typeName(t) {
  return (
    { industry: '行业', sub: '细分', city: '城市', listing: '信息' }[t] || ''
  );
}

async function doSearch() {
  const q = keyword.value.trim();
  if (!q) return;
  loading.value = true;
  searched.value = true;
  try {
    const r = await api.listings({ q, pageSize: 20, sort: 'latest' });
    results.value = (r && (r.items || r.list)) || [];
  } catch (e) {
    uni.showToast({ title: e.message || '搜索失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function pickSuggest(s) {
  if (s.type === 'listing') {
    uni.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(s.id)}` });
    return;
  }
  keyword.value = s.label;
  doSearch();
}

function openDetail(it) {
  uni.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(it.id)}` });
}
</script>

<style scoped>
.page {
  padding: 24rpx;
}
.bar {
  display: flex;
  gap: 16rpx;
}
.input {
  flex: 1;
  height: 84rpx;
  padding: 0 24rpx;
  background: #fff;
  border: 1px solid #dce3ef;
  border-radius: 12rpx;
  font-size: 28rpx;
}
.btn {
  height: 84rpx;
  line-height: 84rpx;
  padding: 0 34rpx;
  background: #1a6dff;
  color: #fff;
  border-radius: 12rpx;
  font-size: 28rpx;
}
.block {
  margin-top: 28rpx;
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
}
.block-t {
  padding: 24rpx 26rpx 8rpx;
  font-size: 24rpx;
  color: #8a97ab;
}
.sug {
  display: flex;
  justify-content: space-between;
  padding: 24rpx 26rpx;
  border-top: 1px solid #f0f4fa;
  font-size: 28rpx;
}
.sug-type {
  font-size: 22rpx;
  color: #a8b3c4;
}
.card {
  margin-top: 20rpx;
  padding: 28rpx;
  background: #fff;
  border-radius: 16rpx;
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
  margin-top: 14rpx;
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
  padding: 70rpx;
  text-align: center;
  color: #8a97ab;
  font-size: 26rpx;
}
</style>
