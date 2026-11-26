<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">招投标</view>
      <view class="hero-s">公共资源交易与产业招标信息</view>
    </view>
    <xyl-listings category="bidding" empty-icon="📑" empty-text="暂无招投标信息" />
  </view>
</template>

<style scoped>
.page { min-height: 100vh; padding-bottom: 40rpx; }
.hero { padding: 40rpx 32rpx 30rpx; background: linear-gradient(135deg, #0b1f3a, #1a4fa8); color: #fff; }
.hero-t { font-size: 38rpx; font-weight: 700; }
.hero-s { margin-top: 10rpx; font-size: 25rpx; opacity: 0.85; }
</style>
