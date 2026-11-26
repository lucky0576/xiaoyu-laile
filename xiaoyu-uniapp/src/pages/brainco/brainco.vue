<template>
  <view class="page">
    <view class="hero">
      <view class="badge">官方指定合作伙伴</view>
      <view class="hero-t">强脑科技 BrainCo</view>
      <view class="hero-s">脑机接口 · 仿生灵巧手 · 具身智能</view>
    </view>

    <view class="partner">
      <view class="partner-t">🤝 杭州硕鱼科技有限公司 · 强脑科技官方指定合作伙伴</view>
      <view class="partner-s">
        可承接脑机接口与具身智能产品的方案咨询、采购与本地化交付。
      </view>
    </view>

    <view v-for="g in groups" :key="g.id" class="sec">
      <view class="sec-h">
        <text class="sec-name">{{ g.name }}</text>
        <text class="sec-count">{{ g.items.length }} 款</text>
      </view>
      <view v-for="p in g.items" :key="p.id" class="prod">
        <text class="prod-dot">·</text>
        <text class="prod-name">{{ p.name }}</text>
      </view>
    </view>

    <view class="cta">
      <view class="cta-t">需要产品方案或报价？</view>
      <view class="cta-s">通过平台发起咨询，由官方合作伙伴对接。</view>
      <button class="btn primary" @tap="contact">发起咨询</button>
    </view>
  </view>
</template>

<script setup>
const groups = [
  {
    id: 'robot',
    name: '人形 / 双臂机器人',
    items: [
      { id: 'revotron-fixed', name: 'RevoTron 重量级高性能双臂机器人（固定支架版）' },
      { id: 'revotron-mobile', name: 'RevoTron 重量级高性能双臂机器人（移动折叠版）' },
      { id: 'revohuman', name: 'RevoHuman 外骨骼式人类中心数采方案（P1 / PTV1 / PTVE1）' },
      { id: 'dual-arm-lab', name: '科研双臂灵巧手控制平台' },
      { id: 'single-arm-lab', name: '科研单臂灵巧手控制平台' },
      { id: 'revoarm', name: 'RevoArm 轻量级桌面七轴臂' },
      { id: 'revomate', name: 'RevoMate 轻量级双臂机器人' },
    ],
  },
  {
    id: 'hand',
    name: '仿生灵巧手',
    items: [
      { id: 'revo2-basic', name: '仿生灵巧手 Revo2 基础版' },
      { id: 'revo2-pro', name: '仿生灵巧手 Revo2 Pro 版' },
      { id: 'revo2-touch', name: '仿生灵巧手 Revo2 触觉版' },
      { id: 'revo3-basic', name: '仿生灵巧手 Revo3 基础版（U21）' },
      { id: 'revo3-touch', name: '仿生灵巧手 Revo3 触觉版（U21T）' },
      { id: 'revo3-vtouch', name: '仿生灵巧手 Revo3 视触觉版（U21VT）' },
    ],
  },
  {
    id: 'bci',
    name: '脑机接口设备',
    items: [
      { id: 'bcigo', name: 'BCIGo 消费级脑机接口系统（32 通道脑电）' },
      { id: 'biosensor', name: '神经电信号生物传感器套装' },
      { id: 'remote', name: '远程控制套装（智能手套 + 机械臂）' },
      { id: 'emg-band', name: '8 通道肌电手环' },
      { id: 'neuro-platform', name: '神经接口教学与实验平台 V1.0' },
    ],
  },
  {
    id: 'solution',
    name: '解决方案',
    items: [
      { id: 'brain-robot', name: '脑控机器人标准套装（32 通道脑电 + 四足 G1 Edu）' },
      { id: 'brain-arm', name: '脑控机械臂标准套装（32 通道脑电 + 桌面机械臂）' },
      { id: 'brain-arm-lite', name: '脑控机械臂（可穿戴脑电 + 视觉抓取机械臂）' },
      { id: 'piano', name: '智能钢琴机械手单点触控平台' },
      { id: 'emg-platform', name: '智能仿生手 EMG 控制平台' },
      { id: 'teleop-platform', name: '基于视觉 / 脑控 / 手柄遥操作控制平台' },
      { id: 'dog', name: '四足机器人脑机遥操作套件' },
    ],
  },
  {
    id: 'course',
    name: '实训课程',
    items: [
      { id: 'course-neuro', name: '脑机接口 / 神经科学实训课程' },
      { id: 'course-ai', name: '人工智能与具身智能实训课程' },
    ],
  },
];

function contact() {
  uni.showToast({ title: '咨询入口将在小程序端接入', icon: 'none' });
}
</script>

<style scoped>
.page { min-height: 100vh; padding-bottom: 60rpx; }
.hero { padding: 44rpx 32rpx 38rpx; background: linear-gradient(135deg, #0b1f3a, #241a4f); color: #fff; }
.badge { display: inline-block; padding: 6rpx 18rpx; border-radius: 999rpx; background: rgba(255,255,255,.18); font-size: 21rpx; }
.hero-t { margin-top: 16rpx; font-size: 40rpx; font-weight: 700; }
.hero-s { margin-top: 10rpx; font-size: 25rpx; opacity: 0.85; }
.partner { margin: 20rpx 24rpx 0; padding: 26rpx 28rpx; background: #fff; border-radius: 16rpx; }
.partner-t { font-size: 26rpx; font-weight: 600; color: #10233d; }
.partner-s { margin-top: 10rpx; font-size: 23rpx; color: #607089; line-height: 1.7; }
.sec { margin: 16rpx 24rpx 0; padding: 26rpx 28rpx; background: #fff; border-radius: 16rpx; }
.sec-h { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12rpx; }
.sec-name { font-size: 28rpx; font-weight: 600; color: #10233d; }
.sec-count { font-size: 21rpx; color: #a8b3c4; }
.prod { display: flex; padding: 6rpx 0; }
.prod-dot { color: #1a6dff; margin-right: 10rpx; }
.prod-name { flex: 1; font-size: 24rpx; color: #4a5b73; line-height: 1.7; }
.cta { margin: 22rpx 24rpx 0; padding: 30rpx; background: #fff; border-radius: 16rpx; }
.cta-t { font-size: 29rpx; font-weight: 600; }
.cta-s { margin: 10rpx 0 20rpx; font-size: 24rpx; color: #607089; }
.btn { height: 86rpx; line-height: 86rpx; border-radius: 12rpx; font-size: 29rpx; }
.btn.primary { background: #1a6dff; color: #fff; }
</style>
