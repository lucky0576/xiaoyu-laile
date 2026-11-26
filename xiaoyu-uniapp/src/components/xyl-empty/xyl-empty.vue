<template>
  <view class="empty">
    <view class="emoji">{{ icon }}</view>
    <view class="text">{{ text }}</view>
    <slot />
  </view>
</template>

<script setup>
defineProps({
  icon: { type: String, default: '🐟' },
  text: { type: String, default: '暂无内容' },
});
</script>

<style scoped>
.empty {
  padding: 100rpx 40rpx;
  text-align: center;
}
.emoji {
  font-size: 64rpx;
}
.text {
  margin-top: 18rpx;
  font-size: 26rpx;
  color: #8a97ab;
}
</style>
