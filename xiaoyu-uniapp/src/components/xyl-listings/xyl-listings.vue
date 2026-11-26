<template>
  <view class="wrap">
    <xyl-empty v-if="loading && !items.length" icon="⏳" text="加载中…" />
    <xyl-empty v-else-if="!items.length" :icon="emptyIcon" :text="emptyText" />

    <view v-for="it in items" :key="it.id" class="card" @tap="openDetail(it)">
      <view class="card-title">{{ it.title || it.name || '未命名' }}</view>
      <view class="card-sub" v-if="it.subtitle || it.summary || it.desc">
        {{ it.subtitle || it.summary || it.desc }}
      </view>
      <view class="card-meta">
        <text v-if="it.city">{{ it.city }}</text>
        <text v-if="it.industry">{{ it.industry }}</text>
        <text v-if="it.region">{{ it.region }}</text>
        <text class="cat">{{ it.categoryName || '' }}</text>
      </view>
    </view>

    <view v-if="loading && items.length" class="more">加载中…</view>
    <view v-else-if="finished && items.length" class="more">没有更多了</view>
  </view>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import api from '../../api/index.js';

const props = defineProps({
  category: { type: String, default: '' },
  query: { type: Object, default: () => ({}) },
  pageSize: { type: Number, default: 10 },
  detailPath: { type: String, default: '/pages/detail/detail' },
  emptyIcon: { type: String, default: '🐟' },
  emptyText: { type: String, default: '暂无内容' },
  autoLoad: { type: Boolean, default: true },
});

const items = ref([]);
const loading = ref(false);
const finished = ref(false);
const page = ref(1);

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
      category: props.category,
      page: page.value,
      pageSize: props.pageSize,
      sort: 'latest',
      ...(props.query || {}),
    });
    const list = (r && (r.items || r.list)) || [];
    items.value = reset ? list : items.value.concat(list);
    if (list.length < props.pageSize) finished.value = true;
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
    finished.value = true;
  } finally {
    loading.value = false;
  }
}

function openDetail(it) {
  uni.navigateTo({ url: `${props.detailPath}?id=${encodeURIComponent(it.id)}` });
}

function refresh() {
  return load(true);
}

defineExpose({ refresh, load });

watch(
  () => [props.category, JSON.stringify(props.query)],
  () => load(true),
  { deep: false },
);

onMounted(() => {
  if (props.autoLoad) load(true);
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
.wrap {
  min-height: 200rpx;
}
.card {
  margin: 16rpx 24rpx 0;
  padding: 26rpx 28rpx;
  background: #fff;
  border-radius: 16rpx;
}
.card-title {
  font-size: 29rpx;
  font-weight: 600;
  color: #10233d;
  line-height: 1.5;
}
.card-sub {
  margin-top: 10rpx;
  font-size: 25rpx;
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
.more {
  padding: 30rpx;
  text-align: center;
  font-size: 23rpx;
  color: #a8b3c4;
}
</style>
