<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">{{ doc.title }}</view>
      <view class="hero-s">{{ doc.intro }}</view>
    </view>

    <view v-for="(s, i) in doc.sections" :key="i" class="sec">
      <view class="sec-h">{{ s.h }}</view>
      <view v-for="(p, j) in s.p" :key="j" class="sec-p">{{ p }}</view>
    </view>

    <view class="meta">
      更新日期：2026-11-27 · 运营主体：{{ COMPANY.name }}<br />
      统一社会信用代码：{{ COMPANY.creditCode }}
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';

const COMPANY = {
  name: '杭州硕鱼科技有限公司',
  creditCode: '91330108MAKRA7J83D',
  address: '浙江省杭州市滨江区西兴街道滨文路7号1幢24楼2402-4室',
  legalPerson: '卢云',
  phone: '13456693544',
  email: 'service@xiaoyulaile.online',
};

const CONTACT_BLOCK = [
  `运营主体：${COMPANY.name}`,
  `统一社会信用代码：${COMPANY.creditCode}`,
  `注册地址：${COMPANY.address}`,
  `法定代表人：${COMPANY.legalPerson}`,
  `联系电话：${COMPANY.phone}`,
  `邮箱：${COMPANY.email}`,
];

const DOCS = {
  privacy: {
    title: '隐私政策',
    intro: '我们收集哪些信息、用来做什么、你能怎么控制。',
    sections: [
      {
        h: '一、我们收集的信息',
        p: [
          '账号信息：手机号或邮箱、昵称、头像。手机号用于登录和找回账号。',
          '发布内容：你主动填写的项目、贸易、活动等信息，以及上传的图片和文档。',
          '使用记录：浏览、收藏、留言等操作记录，用于改进产品与安全风控。',
          '设备与日志：IP 地址、浏览器类型、访问时间，用于安全防护与故障排查。',
        ],
      },
      {
        h: '二、我们如何使用这些信息',
        p: [
          '提供核心功能：发布信息、检索、对接、通知。',
          '安全与合规：防止刷注册、诈骗、侵权内容传播。',
          '改进产品：统计功能使用情况，不针对个人做画像推送。',
          '我们不会出售你的个人信息。',
        ],
      },
      {
        h: '三、联系方式如何保护',
        p: [
          '默认情况下，联系方式仅本人、管理员以及已完成对接的成员可见。',
          '居间信息仅发布者、管理员与发布者指定手机号可见，接口层按身份下发。',
          '公开页面不会下发隐藏字段，不是「前端藏起来」，是服务端根本不给。',
        ],
      },
      {
        h: '四、你的权利',
        p: [
          '你可以随时修改或删除自己发布的内容。',
          '你可以申请注销账号：删除账号及其内容（法律要求保留的除外）。',
          '如需导出或删除数据，可通过下方联系方式提出。',
        ],
      },
      {
        h: '五、数据存储与安全',
        p: [
          '传输全程使用 HTTPS 加密。',
          '我们采取访问控制、限流、参数校验等措施降低风险，但无法承诺绝对安全。',
          '内容以软删除方式保留一段时间以便恢复与审计。',
        ],
      },
      { h: '六、联系我们', p: CONTACT_BLOCK },
    ],
  },
  terms: {
    title: '用户协议',
    intro: '使用本平台前请阅读。继续使用即表示你同意以下条款。',
    sections: [
      {
        h: '一、服务内容',
        p: [
          '本平台提供产业项目、贸易供需、活动赛事、科技成果、招投标等信息的发布、检索与对接服务。',
          '平台仅提供信息展示与撮合工具，不参与交易本身，不构成对任何一方的担保。',
        ],
      },
      {
        h: '二、账号与实名',
        p: [
          '你应使用真实、有效的手机号或邮箱注册，并对账号下的行为负责。',
          '涉及资质核验的场景，需要完成实名认证或提交相应证明材料。',
        ],
      },
      {
        h: '三、发布规范',
        p: [
          '禁止发布违法违规、虚假、侵权、涉密、传销、诈骗等内容。',
          '禁止发布与产业无关的广告、刷屏信息，或冒用他人身份发布。',
          '平台有权对违规内容下架、限制功能或封禁账号。',
        ],
      },
      {
        h: '四、信息来源说明',
        p: [
          '平台部分内容来自公开渠道（政府网站、公共资源交易平台、媒体）的采集与整理，并标注来源链接。',
          '转发、引用前请自行核实，遵守原发布方的版权与使用要求。',
        ],
      },
      {
        h: '五、知识产权',
        p: [
          '你发布的内容，你保留权利，并授权平台在本服务范围内展示、检索与分享。',
          '平台的界面、代码与产品设计归运营方所有。',
        ],
      },
      { h: '六、联系我们', p: CONTACT_BLOCK },
    ],
  },
  disclaimer: {
    title: '免责声明',
    intro: '关于内容真实性、对接风险与责任边界。',
    sections: [
      {
        h: '一、信息真实性',
        p: [
          '平台不保证所有信息的真实、准确与完整，发布者对内容负责。',
          '涉及投资、交易、合作前，请自行核实对方资质与项目情况。',
        ],
      },
      {
        h: '二、对接风险',
        p: [
          '平台提供撮合工具，不对交易结果、履约情况承担责任。',
          '任何要求提前支付、承诺高回报、索要验证码的行为都应警惕。',
        ],
      },
      {
        h: '三、AI 生成内容',
        p: [
          'AI 生成的标题、摘要、分析仅供参考，不构成专业意见。',
          '关键数据请以原始材料为准。',
        ],
      },
      { h: '四、联系我们', p: CONTACT_BLOCK },
    ],
  },
};

const kind = ref('privacy');
const doc = computed(() => DOCS[kind.value] || DOCS.privacy);

onLoad((opts) => {
  kind.value = opts && opts.kind ? String(opts.kind) : 'privacy';
});

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
.sec {
  margin: 20rpx 24rpx 0;
  padding: 28rpx;
  background: #fff;
  border-radius: 16rpx;
}
.sec-h {
  font-size: 28rpx;
  font-weight: 600;
  color: #10233d;
  margin-bottom: 12rpx;
}
.sec-p {
  font-size: 25rpx;
  color: #4a5b73;
  line-height: 1.9;
}
.meta {
  padding: 34rpx 32rpx;
  text-align: center;
  font-size: 21rpx;
  color: #a8b3c4;
  line-height: 1.9;
}
</style>
