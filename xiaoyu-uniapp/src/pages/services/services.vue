<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">企业服务</view>
      <view class="hero-s">给政府、园区、产业基金与企业提供的落地方案</view>
    </view>

    <view v-for="p in plans" :key="p.id" class="plan">
      <view class="plan-top">
        <text class="plan-icon">{{ p.icon }}</text>
        <view class="plan-main">
          <view class="plan-name">{{ p.name }}</view>
          <view class="plan-tag">{{ p.tag }}</view>
        </view>
        <view class="plan-price">{{ p.price }}</view>
      </view>
      <view class="plan-items">
        <view v-for="(it, i) in p.items" :key="i" class="plan-item">· {{ it }}</view>
      </view>
    </view>

    <view class="cta">
      <view class="cta-t">需要定制方案？</view>
      <view class="cta-s">提交需求后由平台负责人直接回复，不转第三方。</view>
      <button class="btn primary" @tap="contact">提交咨询</button>
    </view>
  </view>
</template>

<script setup>
const plans = [
  {
    id: 'deploy',
    icon: '🏛️',
    name: '私有化部署',
    tag: '最推荐 · 政府 / 园区 / 国企',
    price: '3.8 万 / 年',
    items: ['部署到本地机房或政务云', '数据不出域', '含一年技术支持与版本升级'],
  },
  {
    id: 'data',
    icon: '📊',
    name: '区域产业数据库',
    tag: '招商部门 / 产业基金 / 投行',
    price: '1.8 万 / 年',
    items: ['区域产业链与企业数据', '按需导出结构化数据', '定期更新'],
  },
  {
    id: 'ops',
    icon: '📝',
    name: '信息代运营',
    tag: '中小企业 / 工程项目方',
    price: '3,000 元 / 月',
    items: ['项目信息整理与发布', 'AI 生成标题与摘要', '每月内容复盘'],
  },
  {
    id: 'dd',
    icon: '🔍',
    name: 'AI 项目尽调报告',
    tag: '投资机构 / 需要评估项目的企业',
    price: '800 元 / 份',
    items: ['项目背景与主体核查', '行业对标与风险提示', '可研口径的结构化输出'],
  },
  {
    id: 'bid',
    icon: '📑',
    name: 'AI 自动化招投标助手',
    tag: '仅限杭州 · 400 万以下小额交易',
    price: '10,000 元 / 年',
    items: ['标书资料清单生成', '投标文件排版', '投标流程咨询'],
  },
  {
    id: 'finance',
    icon: '💰',
    name: '企业融资服务',
    tag: '中小企业 / 项目方 / 需要融资的产业项目',
    price: '10 万起 / 年',
    items: ['融资材料梳理', '对接资金方', '居间与结算约定留痕'],
  },
];

function contact() {
  uni.showToast({ title: '咨询表单将在小程序端接入', icon: 'none' });
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 60rpx;
}
.hero {
  padding: 44rpx 32rpx 36rpx;
  background: linear-gradient(135deg, #0b1f3a, #1a4fa8);
  color: #fff;
}
.hero-t {
  font-size: 40rpx;
  font-weight: 700;
}
.hero-s {
  margin-top: 12rpx;
  font-size: 25rpx;
  opacity: 0.85;
  line-height: 1.6;
}
.plan {
  margin: 20rpx 24rpx 0;
  padding: 28rpx;
  background: #fff;
  border-radius: 18rpx;
}
.plan-top {
  display: flex;
  align-items: flex-start;
}
.plan-icon {
  font-size: 40rpx;
  margin-right: 18rpx;
}
.plan-main {
  flex: 1;
}
.plan-name {
  font-size: 30rpx;
  font-weight: 600;
  color: #10233d;
}
.plan-tag {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #8a97ab;
}
.plan-price {
  flex: none;
  margin-left: 14rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #1a6dff;
}
.plan-items {
  margin-top: 18rpx;
  padding-top: 16rpx;
  border-top: 1px dashed #e6ecf7;
}
.plan-item {
  font-size: 24rpx;
  color: #607089;
  line-height: 1.9;
}
.cta {
  margin: 26rpx 24rpx 0;
  padding: 30rpx;
  background: #fff;
  border-radius: 18rpx;
}
.cta-t {
  font-size: 30rpx;
  font-weight: 600;
}
.cta-s {
  margin: 10rpx 0 22rpx;
  font-size: 24rpx;
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
</style>
