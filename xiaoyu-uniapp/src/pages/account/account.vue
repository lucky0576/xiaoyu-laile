<template>
  <view class="page">
    <view class="head">
      <view class="avatar">{{ initial }}</view>
      <view class="who">
        <view class="name">{{ user ? user.nickname || '未设置昵称' : '未登录' }}</view>
        <view class="sub" v-if="user">{{ user.company || user.industry || '个人用户' }}</view>
        <view class="sub" v-else>登录后可发布与对接</view>
      </view>
    </view>

    <view class="card" v-if="!user">
      <button class="btn primary" @tap="goLogin">登录 / 注册</button>
      <view class="hint">支持手机号、邮箱、抖音登录</view>
    </view>

    <view class="mine" v-else>
      <view class="item" @tap="goMine('project')">
        <text>我发布的信息</text><text class="arrow">›</text>
      </view>
      <view class="item" @tap="goMine('followed')">
        <text>我的关注</text><text class="arrow">›</text>
      </view>
      <view class="item" v-if="user.isAdmin">
        <text>管理后台</text><text class="arrow">仅网页端</text>
      </view>
      <view class="item" @tap="doLogout">
        <text class="danger">退出登录</text><text class="arrow">›</text>
      </view>
    </view>

    <view class="foot">
      小鱼来了 · 杭州硕鱼科技有限公司
      <view class="tiny">统一社会信用代码 91330108MAKRA7J83D</view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
import api from '../../api/index.js';
import { userStore, logout } from '../../store/user.js';

const user = ref(userStore.user);

const initial = computed(() => {
  const n = (user.value && user.value.nickname) || '鱼';
  return String(n).slice(0, 1);
});

onMounted(async () => {
  if (!userStore.loggedIn) return;
  try {
    const r = await api.me();
    user.value = (r && (r.user || r)) || user.value;
    userStore.user = user.value;
  } catch {
    /* 登录态过期就保持现状 */
  }
});

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' });
}

function goMine(kind) {
  uni.showToast({ title: '该页面待迁移', icon: 'none' });
}

function doLogout() {
  logout();
  user.value = null;
  uni.showToast({ title: '已退出', icon: 'none' });
}
</script>

<style scoped>
.page {
  min-height: 100vh;
}
.head {
  display: flex;
  align-items: center;
  padding: 50rpx 32rpx;
  background: linear-gradient(135deg, #0b1f3a, #1a4fa8);
  color: #fff;
}
.avatar {
  width: 110rpx;
  height: 110rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44rpx;
  font-weight: 700;
}
.who {
  margin-left: 26rpx;
}
.name {
  font-size: 34rpx;
  font-weight: 600;
}
.sub {
  margin-top: 8rpx;
  font-size: 24rpx;
  opacity: 0.85;
}
.card {
  margin: 24rpx;
  padding: 30rpx;
  background: #fff;
  border-radius: 18rpx;
}
.mine {
  margin: 24rpx;
  background: #fff;
  border-radius: 18rpx;
  overflow: hidden;
}
.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 30rpx;
  border-bottom: 1px solid #eef3fb;
  font-size: 28rpx;
}
.item:last-child {
  border-bottom: none;
}
.arrow {
  color: #a8b3c4;
}
.danger {
  color: #e04545;
}
.btn {
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 12rpx;
  font-size: 30rpx;
}
.btn.primary {
  background: #1a6dff;
  color: #fff;
}
.hint {
  margin-top: 16rpx;
  font-size: 22rpx;
  color: #8a97ab;
  text-align: center;
}
.foot {
  margin-top: 60rpx;
  text-align: center;
  font-size: 22rpx;
  color: #a8b3c4;
  line-height: 1.9;
}
.tiny {
  font-size: 20rpx;
  color: #bcc5d3;
}
</style>
