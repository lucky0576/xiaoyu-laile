<template>
  <view class="page">
    <view class="hero">
      <view class="logo">🐟</view>
      <view class="name">小鱼来了</view>
      <view class="slogan">找项目 · 投资 · 产业</view>
    </view>

    <view class="perks">
      <view v-for="p in perks" :key="p.t" class="perk">
        <text class="perk-i">{{ p.i }}</text>
        <view class="perk-body">
          <view class="perk-t">{{ p.t }}</view>
          <view class="perk-s">{{ p.s }}</view>
        </view>
      </view>
    </view>

    <view class="cta">
      <button class="btn primary" @tap="goHome">进入首页</button>
      <button class="btn" @tap="goPublish">我要发布</button>
    </view>

    <view class="foot">
      运营主体：杭州硕鱼科技有限公司<br />
      统一社会信用代码：91330108MAKRA7J83D
    </view>
  </view>
</template>

<script setup>
const perks = [
  { i: '🤖', t: 'AI 自动整理', s: '导入 PPT / PDF / Word，自动生成标题、摘要与项目要点' },
  { i: '🏙️', t: '行业 + 城市', s: '按产业方向和地域筛选，快速找到对口资源' },
  { i: '🤝', t: '七步对接', s: '发布、审核、沟通、面谈、合约，全流程留痕' },
  { i: '🔒', t: '联系方式保护', s: '默认隐藏，授权后才可见，减少骚扰' },
];

function goHome() {
  uni.switchTab({ url: '/pages/home/home' });
}
function goPublish() {
  uni.switchTab({ url: '/pages/publish/publish' });
}
</script>

<style scoped>
.page { min-height: 100vh; padding-bottom: 50rpx; }
.hero { padding: 80rpx 32rpx 50rpx; text-align: center; background: linear-gradient(135deg, #0b1f3a, #1a4fa8); color: #fff; }
.logo { font-size: 90rpx; }
.name { margin-top: 16rpx; font-size: 44rpx; font-weight: 700; }
.slogan { margin-top: 10rpx; font-size: 25rpx; opacity: 0.85; }
.perks { margin: 24rpx 24rpx 0; }
.perk { display: flex; padding: 26rpx 28rpx; margin-bottom: 14rpx; background: #fff; border-radius: 16rpx; }
.perk-i { font-size: 40rpx; margin-right: 20rpx; }
.perk-body { flex: 1; }
.perk-t { font-size: 28rpx; font-weight: 600; color: #10233d; }
.perk-s { margin-top: 8rpx; font-size: 23rpx; color: #607089; line-height: 1.6; }
.cta { margin: 26rpx 24rpx 0; }
.btn { height: 88rpx; line-height: 88rpx; margin-bottom: 18rpx; border-radius: 12rpx; font-size: 30rpx; }
.btn.primary { background: #1a6dff; color: #fff; }
.btn { background: #fff; color: #1a6dff; }
.foot { margin-top: 40rpx; text-align: center; font-size: 21rpx; color: #a8b3c4; line-height: 1.9; }
</style>
