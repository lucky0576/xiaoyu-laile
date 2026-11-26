<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">开放接口</view>
      <view class="hero-s">只列已上线、已验证的接口。公开接口免登录。</view>
    </view>

    <view class="tabs">
      <view class="tab" :class="{ active: tab === 'pub' }" @tap="tab = 'pub'">公开接口</view>
      <view class="tab" :class="{ active: tab === 'auth' }" @tap="tab = 'auth'">需登录</view>
    </view>

    <view v-for="a in shown" :key="a.path" class="api" @tap="copyOne(a)">
      <view class="api-top">
        <text class="method" :class="a.method === 'GET' ? 'get' : 'post'">{{ a.method }}</text>
        <text class="path">{{ a.path }}</text>
      </view>
      <view class="desc">{{ a.desc }}</view>
    </view>

    <view class="foot">点任意一条可复制 curl 示例</view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';

const BASE = 'https://xiaoyulaile.online';

const PUB = [
  { method: 'GET', path: '/api/site', desc: '站点基本信息（名称、备案、运营主体、公告）' },
  { method: 'GET', path: '/api/stats', desc: '平台统计（信息数、用户数等）' },
  { method: 'GET', path: '/api/listings', desc: '信息列表（项目 / 活动 / 贸易 / 成果 / 招投标…）' },
  { method: 'GET', path: '/api/listings/:id', desc: '单条信息详情（含 AI 摘要、城市、行业、附件列表）' },
  { method: 'GET', path: '/api/listings/:id/share', desc: '分享页数据（标题、封面、二维码短链）' },
  { method: 'GET', path: '/api/search/suggest', desc: '搜索联想词' },
  { method: 'GET', path: '/api/taxonomy', desc: '行业 / 城市 / 类型分类字典' },
  { method: 'GET', path: '/api/news', desc: '资讯列表' },
  { method: 'GET', path: '/api/feeds', desc: '短视频 / 直播列表' },
  { method: 'GET', path: '/api/cases', desc: '项目案例列表' },
  { method: 'GET', path: '/api/levels', desc: '会员档位与权益' },
];

const AUTH = [
  { method: 'POST', path: '/api/auth/sms/send', desc: '发送短信验证码' },
  { method: 'POST', path: '/api/auth/sms/login', desc: '手机号验证码登录 / 注册' },
  { method: 'POST', path: '/api/listings', desc: '发布信息（multipart，可带附件）' },
  { method: 'GET', path: '/api/notifications', desc: '我的通知列表' },
  { method: 'GET', path: '/api/auth/me', desc: '当前登录用户信息' },
];

const tab = ref('pub');
const shown = computed(() => (tab.value === 'pub' ? PUB : AUTH));

function copyOne(a) {
  const curl =
    a.method === 'GET'
      ? `curl '${BASE}${a.path}'`
      : `curl -X ${a.method} '${BASE}${a.path}' -H 'Content-Type: application/json' -d '{}'`;
  uni.setClipboardData({
    data: curl,
    success: () => uni.showToast({ title: 'curl 已复制', icon: 'none' }),
  });
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 60rpx;
}
.hero {
  padding: 40rpx 32rpx 30rpx;
  background: linear-gradient(135deg, #0b1f3a, #1a4fa8);
  color: #fff;
}
.hero-t {
  font-size: 38rpx;
  font-weight: 700;
}
.hero-s {
  margin-top: 10rpx;
  font-size: 24rpx;
  opacity: 0.85;
  line-height: 1.6;
}
.tabs {
  display: flex;
  gap: 14rpx;
  padding: 22rpx 24rpx 4rpx;
}
.tab {
  padding: 12rpx 30rpx;
  border-radius: 999rpx;
  background: #fff;
  color: #607089;
  font-size: 26rpx;
}
.tab.active {
  background: #1a6dff;
  color: #fff;
}
.api {
  margin: 16rpx 24rpx 0;
  padding: 24rpx 26rpx;
  background: #fff;
  border-radius: 14rpx;
}
.api-top {
  display: flex;
  align-items: center;
}
.method {
  flex: none;
  padding: 4rpx 14rpx;
  margin-right: 14rpx;
  border-radius: 8rpx;
  font-size: 20rpx;
  font-weight: 600;
}
.method.get {
  background: #e8f1ff;
  color: #1a6dff;
}
.method.post {
  background: #fdf1e6;
  color: #b77424;
}
.path {
  font-size: 25rpx;
  color: #10233d;
  word-break: break-all;
}
.desc {
  margin-top: 10rpx;
  font-size: 23rpx;
  color: #8a97ab;
  line-height: 1.6;
}
.foot {
  padding: 30rpx;
  text-align: center;
  font-size: 22rpx;
  color: #a8b3c4;
}
</style>
