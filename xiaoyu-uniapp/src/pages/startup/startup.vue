<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">创业服务</view>
      <view class="hero-s">创业政策、空间载体与产业机会</view>
    </view>
    <xyl-listings :query="{ q: '创业' }" empty-icon="🚀" empty-text="暂无创业相关内容" />
  </view>
</template>

<style scoped>
.page { min-height: 100vh; padding-bottom: 40rpx; }
.hero { padding: 40rpx 32rpx 30rpx; background: linear-gradient(135deg, #0b1f3a, #1a4fa8); color: #fff; }
.hero-t { font-size: 38rpx; font-weight: 700; }
.hero-s { margin-top: 10rpx; font-size: 25rpx; opacity: 0.85; }
</style>
