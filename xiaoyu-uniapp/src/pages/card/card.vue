<template>
  <view class="page">
    <view class="card">
      <view class="avatar">卢</view>
      <view class="name">卢云</view>
      <view class="title">创始人兼 CEO</view>
      <view class="org">杭州硕鱼科技有限公司</view>

      <view class="rows">
        <view class="row" @tap="call">
          <text class="row-k">电话</text>
          <text class="row-v">{{ tel }}</text>
        </view>
        <view class="row" @tap="copyEmail">
          <text class="row-k">邮箱</text>
          <text class="row-v">{{ email }}</text>
        </view>
        <view class="row">
          <text class="row-k">官网</text>
          <text class="row-v">xiaoyulaile.online</text>
        </view>
      </view>

      <view class="actions">
        <button class="btn primary" @tap="copyVcard">复制名片信息</button>
        <button class="btn" @tap="call">拨打电话</button>
      </view>
    </view>
  </view>
</template>

<script setup>
const tel = '15606768989';
const email = 'service@xiaoyulaile.online';

function call() {
  uni.makePhoneCall({ phoneNumber: tel, fail: () => {} });
}

function copyEmail() {
  uni.setClipboardData({
    data: email,
    success: () => uni.showToast({ title: '邮箱已复制', icon: 'none' }),
  });
}

function copyVcard() {
  const text = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:卢云',
    'ORG:杭州硕鱼科技有限公司',
    'TITLE:创始人兼 CEO',
    `TEL;TYPE=CELL:${tel}`,
    `EMAIL;TYPE=WORK:${email}`,
    'URL:https://xiaoyulaile.online',
    'END:VCARD',
  ].join('\n');
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '名片信息已复制，可粘贴到通讯录', icon: 'none' }),
  });
}

defineExpose({ vcard: true });
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 40rpx 32rpx;
}
.card {
  padding: 50rpx 34rpx 40rpx;
  background: #fff;
  border-radius: 24rpx;
  text-align: center;
}
.avatar {
  width: 130rpx;
  height: 130rpx;
  margin: 0 auto;
  border-radius: 50%;
  background: linear-gradient(135deg, #0b1f3a, #1a4fa8);
  color: #fff;
  font-size: 56rpx;
  line-height: 130rpx;
  font-weight: 700;
}
.name {
  margin-top: 24rpx;
  font-size: 40rpx;
  font-weight: 700;
  color: #10233d;
}
.title {
  margin-top: 8rpx;
  font-size: 26rpx;
  color: #1a6dff;
}
.org {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #8a97ab;
}
.rows {
  margin-top: 34rpx;
  text-align: left;
}
.row {
  display: flex;
  padding: 24rpx 0;
  border-top: 1px solid #f0f4fa;
  font-size: 27rpx;
}
.row-k {
  width: 110rpx;
  color: #8a97ab;
}
.row-v {
  color: #10233d;
}
.actions {
  margin-top: 34rpx;
}
.btn {
  height: 86rpx;
  line-height: 86rpx;
  margin-top: 18rpx;
  border-radius: 12rpx;
  font-size: 28rpx;
}
.btn.primary {
  background: #1a6dff;
  color: #fff;
}
.btn {
  background: #eef3fb;
  color: #1a6dff;
}
</style>
