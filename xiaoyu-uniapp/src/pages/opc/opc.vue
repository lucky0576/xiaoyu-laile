<template>
  <view class="page">
    <view class="hero">
      <view class="hero-tag">OPC 服务专区</view>
      <view class="hero-title">把项目拆成你能接的服务包</view>
      <view class="hero-sub">
        OPC / 超级个体可承接的执行服务。展示的是「可拆解方向」，接单前需项目方确认。
      </view>
    </view>

    <view class="sec">
      <view class="sec-t">可承接的服务方向</view>
      <view class="svcs">
        <view v-for="s in services" :key="s.id" class="svc">
          <view class="svc-name">{{ s.name }}</view>
          <view class="svc-desc">{{ s.desc }}</view>
        </view>
      </view>
    </view>

    <view class="sec">
      <view class="sec-t">可接的真实项目</view>
      <view v-if="loading" class="tip">加载中…</view>
      <view v-else-if="!items.length" class="tip">暂无项目</view>
      <view v-for="it in items" :key="it.id" class="opp" @tap="openDetail(it)">
        <view class="opp-top">
          <text class="opp-type">{{ it.category === 'bidding' ? '招投标' : '产业项目' }}</text>
          <text class="opp-date">{{ fmtDate(it.createdAt) }}</text>
        </view>
        <view class="opp-title">{{ it.title || '平台真实项目' }}</view>
        <view class="opp-meta">
          <text v-if="it.city">{{ it.city }}</text>
          <text v-if="it.industry">{{ it.industry }}</text>
        </view>
      </view>
    </view>

    <view class="sec cta">
      <view class="cta-t">想入驻 OPC？</view>
      <view class="cta-sub">填写入驻申请，1 个工作日内联系，不收入驻费。</view>
      <button class="btn primary" @tap="apply">填写入驻申请</button>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../api/index.js';

const services = [
  { id: 'shortvideo', name: '短视频 / 短剧', desc: '脚本、拍摄、剪辑、账号代运营' },
  { id: 'ai', name: 'AI 工具 / Agent', desc: '知识库、自动化流程、数据看板' },
  { id: 'data', name: '数据标注 / 清洗', desc: '标注、结构化、行业数据库' },
  { id: 'research', name: '行业研究 / 招商材料', desc: '行业报告、招商 PPT、路演材料' },
  { id: 'design3d', name: 'BIM / 3D / 数字人', desc: '3D 展厅、数字人讲解、BIM 轻量化' },
  { id: 'pv', name: '光伏 / 储能测算', desc: '选址、收益测算、方案材料' },
  { id: 'bid', name: '投标服务包', desc: '标书排版、资料清单、投标咨询' },
];

const items = ref([]);
const loading = ref(true);

async function load() {
  loading.value = true;
  try {
    const [p, b] = await Promise.all([
      api.listings({ category: 'project', pageSize: 8, sort: 'latest' }).catch(() => ({ items: [] })),
      api.listings({ category: 'bidding', pageSize: 8, sort: 'latest' }).catch(() => ({ items: [] })),
    ]);
    items.value = [...((p && p.items) || []), ...((b && b.items) || [])].slice(0, 12);
  } finally {
    loading.value = false;
  }
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function openDetail(it) {
  uni.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(it.id)}` });
}

function apply() {
  uni.showToast({ title: '入驻表单将在小程序端接入', icon: 'none' });
}

onMounted(load);
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 60rpx;
}
.hero {
  padding: 46rpx 32rpx 40rpx;
  background: linear-gradient(135deg, #0b1f3a, #1a4fa8);
  color: #fff;
}
.hero-tag {
  display: inline-block;
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.18);
  font-size: 22rpx;
}
.hero-title {
  margin-top: 18rpx;
  font-size: 38rpx;
  font-weight: 700;
  line-height: 1.4;
}
.hero-sub {
  margin-top: 14rpx;
  font-size: 25rpx;
  line-height: 1.7;
  opacity: 0.85;
}
.sec {
  margin: 24rpx 24rpx 0;
  padding: 28rpx;
  background: #fff;
  border-radius: 18rpx;
}
.sec-t {
  font-size: 30rpx;
  font-weight: 600;
  color: #10233d;
  margin-bottom: 20rpx;
}
.svcs {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.svc {
  width: calc(50% - 8rpx);
  box-sizing: border-box;
  padding: 20rpx;
  border: 1px solid #e8eefa;
  border-radius: 12rpx;
}
.svc-name {
  font-size: 26rpx;
  font-weight: 600;
  color: #1a4fa8;
}
.svc-desc {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #8a97ab;
  line-height: 1.5;
}
.opp {
  padding: 22rpx 0;
  border-top: 1px solid #f0f4fa;
}
.opp-top {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10rpx;
}
.opp-type {
  font-size: 22rpx;
  color: #1a6dff;
}
.opp-date {
  font-size: 22rpx;
  color: #a8b3c4;
}
.opp-title {
  font-size: 28rpx;
  color: #10233d;
  line-height: 1.5;
}
.opp-meta {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #8a97ab;
}
.opp-meta text {
  margin-right: 18rpx;
}
.cta-t {
  font-size: 30rpx;
  font-weight: 600;
}
.cta-sub {
  margin: 10rpx 0 22rpx;
  font-size: 25rpx;
  color: #607089;
  line-height: 1.6;
}
.btn {
  height: 86rpx;
  line-height: 86rpx;
  border-radius: 12rpx;
  font-size: 29rpx;
}
.btn.primary {
  background: #1a6dff;
  color: #fff;
}
.tip {
  padding: 50rpx;
  text-align: center;
  color: #8a97ab;
  font-size: 25rpx;
}
</style>
