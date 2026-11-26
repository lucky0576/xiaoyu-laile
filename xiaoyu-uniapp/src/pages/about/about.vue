<template>
  <view class="page">
    <view class="hero">
      <view class="logo">🐟</view>
      <view class="name">小鱼来了</view>
      <view class="slogan">找项目 · 投资 · 产业</view>
    </view>

    <view class="sec">
      <view class="sec-t">关于我们</view>
      <view class="p">
        小鱼来了是面向产业项目、贸易供需、活动赛事与科技成果的信息发布与对接平台。
        平台用 AI 把杂乱的原始材料整理成可读的项目摘要，帮助项目方、投资方与服务机构高效对接。
      </view>
    </view>

    <view class="sec">
      <view class="sec-t">合作资质</view>
      <view class="honor">
        <view class="honor-t">🏅 华为授权 · 官方服务商 / 经销商（浙江）</view>
        <view class="honor-s">华为云 / 华为终端 · 浙江省区域授权</view>
      </view>
      <view class="honor">
        <view class="honor-t">🤝 强脑科技官方指定合作伙伴</view>
        <view class="honor-s">脑机接口 / 具身智能 · 产品与解决方案合作</view>
      </view>
    </view>

    <view class="sec">
      <view class="sec-t">合作方式</view>
      <view class="line">· 直接使用：注册后即可发布园区、政策、项目与合作需求。</view>
      <view class="line">· 区域专区：为地方开设独立专区页，集中展示本地载体与招商方向。</view>
      <view class="line">· 私有化部署：部署到本地机房或政务云，数据不出域。</view>
    </view>

    <view class="sec">
      <view class="sec-t">主体信息</view>
      <view v-for="(r, i) in rows" :key="i" class="kv">
        <text class="kv-k">{{ r.k }}</text>
        <text class="kv-v">{{ r.v }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
const rows = [
  { k: '企业名称', v: '杭州硕鱼科技有限公司' },
  { k: '统一社会信用代码', v: '91330108MAKRA7J83D' },
  { k: '企业类型', v: '有限责任公司（自然人独资）' },
  { k: '法定代表人', v: '卢云' },
  { k: '注册资本', v: '壹佰万元整' },
  { k: '成立日期', v: '2026-11-23' },
  { k: '注册地址', v: '浙江省杭州市滨江区西兴街道滨文路7号1幢24楼2402-4室' },
  { k: '登记机关', v: '杭州高新技术产业开发区（滨江）市场监督管理局' },
];
</script>

<style scoped>
.page { min-height: 100vh; padding-bottom: 60rpx; }
.hero { padding: 70rpx 32rpx 44rpx; text-align: center; background: linear-gradient(135deg, #0b1f3a, #1a4fa8); color: #fff; }
.logo { font-size: 84rpx; }
.name { margin-top: 14rpx; font-size: 42rpx; font-weight: 700; }
.slogan { margin-top: 8rpx; font-size: 24rpx; opacity: 0.85; }
.sec { margin: 20rpx 24rpx 0; padding: 28rpx; background: #fff; border-radius: 16rpx; }
.sec-t { font-size: 29rpx; font-weight: 600; color: #10233d; margin-bottom: 14rpx; }
.p { font-size: 25rpx; color: #4a5b73; line-height: 1.9; }
.honor { padding: 18rpx 20rpx; margin-bottom: 12rpx; background: #f7faff; border-radius: 10rpx; }
.honor-t { font-size: 25rpx; font-weight: 600; color: #10233d; }
.honor-s { margin-top: 6rpx; font-size: 22rpx; color: #7d93b5; }
.line { font-size: 24rpx; color: #4a5b73; line-height: 2; }
.kv { display: flex; padding: 10rpx 0; font-size: 23rpx; }
.kv-k { width: 210rpx; flex: none; color: #8a97ab; }
.kv-v { flex: 1; color: #10233d; line-height: 1.6; }
</style>
