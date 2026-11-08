/**
 * 强脑科技 BrainCo 专题页（#/brainco）
 *
 * 合作方：BrainCo 强脑科技（浙江强脑科技有限公司）
 * 内容来源：对方提供的产品彩页 / 配置清单 / 技术参数表（2026-06 版本）
 *
 * 四个板块：
 *   1. 公司简介
 *   2. 合作项目及产品介绍
 *   3. 产品报价采购（电商模式：加入采购单 → 提交采购需求）
 *   4. 一键生成项目 / 贸易发布
 *
 * 价格均为「市场价（含税）」口径，渠道价不对外展示。
 */

import * as ui from './ui.js';
import { api, service, isLoggedIn } from './api.js';

const PARTNER = {
  name: 'BrainCo 强脑科技',
  company: '浙江强脑科技有限公司',
  tagline: '脑机科技，开启生命更多可能性',
  site: 'https://www.brainco.cn',
};

/* 产品数据：按板块分组 */
const GROUPS = [
  {
    id: 'robot',
    name: '人形 / 双臂机器人',
    desc: '真机数据采集平台，支撑具身智能与高校实训',
    items: [
      {
        id: 'bundle-65',
        name: '双臂机器人 + 两对数据采集手套 + 数采平台（65 万套装）',
        short: '65万双臂数采套装',
        price: 650000,
        unit: '套',
        image: '/static/brainco/revohuman.jpg',
        specs: [
          '含 1 台双臂机器人（7DoF×2 机械臂 + Revo3 灵巧手）',
          '含 2 对数据采集手套（外骨骼式，21 自由度×2 / 手）',
          '含数据采集平台：真机运动控制 / 数据可视化 / 遥操作 / 数据导出',
          '到手即用的具身智能真机数据采集方案',
          '单套 650,000（市场参考价，含税）',
        ],
      },
      {
        id: 'revotron-fixed',
        name: 'RevoTron 重量级高性能双臂机器人（固定支架版）',
        short: 'RevoTron 固定版',
        price: 560000,
        unit: '套',
        image: '/static/brainco/revotron.jpg',
        specs: ['整机 17 自由度（不含末端）：头 2 + 双臂 7×2 + 腰 1', '末端标配 Revo3 基础版（21 自由度）', '双臂额定负载 10kg｜工作半径 910mm（含手）', '重复定位精度 ±0.05mm｜双臂标配全力控', '头部双目相机 + 腕部单目相机，Ultra7 工控机'],
      },
      {
        id: 'revotron-mobile',
        name: 'RevoTron 重量级高性能双臂机器人（移动折叠版）',
        short: 'RevoTron 移动版',
        price: 695000,
        unit: '套',
        image: '/static/brainco/revomate.jpg',
        specs: ['整机 25 自由度：头部 2 + 双臂 7×2 + 腰部 2 + 升降 3 + 底盘 4', '四轮四转底盘，带导航、自动回充', '折叠腰腿结构，可移动部署', '末端 Revo3 基础版（21 自由度）', '支持双臂 + 双手示教'],
      },
      {
        id: 'revohuman',
        name: 'RevoHuman 外骨骼式人类中心数采方案（P1 / PTV1 / PTVE1）',
        short: 'RevoHuman 数采方案',
        price: 0,
        unit: '套',
        image: '/static/brainco/revohuman.jpg',
        specs: [
          '外骨骼数据手套：21 自由度 × 2 + 6D 腕部位姿，精度 ±0.1°，范围 0~360°',
          '触觉：211 触觉点 × 2，0~25N，分辨率 0.01N（PTV1 / PTVE1）',
          '腕部相机：FOV 90°，1080P/720P@30FPS，电子卷帘快门',
          'Ego 头环：RGB 1080p + 灰度 640×480，vSLAM 定位精度 2mm',
          '采样 200Hz（角度/触觉），USB / 无线，整套 125g + 350g + 500g',
          '一站式 Ego + 触觉外骨骼灵巧操作人类数采方案',
        ],
        inquiry: true,
      },
      {
        id: 'dual-arm-lab',
        name: '科研双臂灵巧手控制平台',
        short: '科研双臂平台',
        price: 450000,
        unit: '套',
        image: '/static/brainco/robot.jpg',
        specs: ['7DoF × 2 机械臂，标配关节力控', '单臂额定负载 6kg，最大 10kg', '工作半径 695mm，重复定位 ±0.05mm', '末端 Revo3 基础版 × 2，头/腕相机齐全', '适合具身智能数据采集与算法验证'],
      },
      {
        id: 'single-arm-lab',
        name: '科研单臂灵巧手控制平台',
        short: '科研单臂平台',
        price: 200000,
        unit: '套',
        image: '/static/brainco/revo2-poster.jpg',
        specs: ['7DoF 机械臂 + 1 只 Revo3 基础版灵巧手', '腕部鱼眼相机，内走线', '1kHz EtherCAT 通讯', '位置 / 阻抗 / 力位混合控制'],
      },
      {
        id: 'revoarm',
        name: 'RevoArm 轻量级桌面七轴臂',
        short: 'RevoArm 七轴臂',
        price: 0,
        unit: '套',
        image: '/static/brainco/revo2-poster.jpg',
        specs: ['7 自由度，末端 Revo2 Pro 仿生手', '本体 5.18kg，额定负载 3kg', '工作半径 436mm（含手 658mm）', '重复定位精度 ±0.1mm，48V DC / CAN FD', '支持 C / C++ / Python SDK、ROS2 适配'],
        inquiry: true,
      },
      {
        id: 'revomate',
        name: 'RevoMate 轻量级双臂机器人',
        short: 'RevoMate',
        price: 0,
        unit: '套',
        image: '/static/brainco/revomate.jpg',
        specs: ['轻量化部署，高度仿人', '6 自由度触觉版灵巧手', '支撑基础数据采集、高校实训、家庭服务场景'],
        inquiry: true,
      },
    ],
  },
  {
    id: 'hand',
    name: '仿生灵巧手',
    desc: '6 电机 11 自由度 / 21 自由度全直驱，支持 ROS 与 SDK',
    items: [
      {
        id: 'revo2-basic',
        name: 'BrainCo 仿生灵巧手 Revo2 基础版',
        short: 'Revo2 基础版',
        price: 19999,
        unit: '只',
        image: '/static/brainco/revo2-poster.jpg',
        specs: ['6 电机 / 11 自由度仿生关节', '整手负载 20kg，五指握力 50N', '单指捏力 15N，开合 0.65s', 'RS485 / CAN FD，支持 ROS、SDK', '提供 URDF，可二次开发'],
      },
      {
        id: 'revo2-pro',
        name: 'BrainCo 仿生灵巧手 Revo2 Pro 版',
        short: 'Revo2 Pro',
        price: 24999,
        unit: '只',
        image: '/static/brainco/revoarm.jpg',
        specs: ['在基础版之上增加 EtherCAT 通讯', '12~64V 宽压供电', '位置/速度/电流/力控，柔顺控制', '自锁功能，360° 称重抓握不松脱'],
      },
      {
        id: 'revo2-touch',
        name: 'BrainCo 仿生灵巧手 Revo2 触觉版',
        short: 'Revo2 触觉版',
        price: 34999,
        unit: '只',
        image: '/static/brainco/revoarm.jpg',
        specs: ['全掌触觉传感器，力感知 0.1N / 0~25N', '其余规格同 Pro 版', '适合精细操作与力控研究'],
      },
      {
        id: 'revo3-basic',
        name: 'BrainCo 仿生灵巧手 Revo3 基础版（U21）',
        short: 'Revo3 基础版',
        price: 100000,
        unit: '只',
        image: '/static/brainco/revo3-poster.jpg',
        specs: ['21 自由度全直驱可反驱：四指 4×4 + 拇指 5', '整手负载 20kg，主动握力 >50N', '指尖最大捏力 >20N，重复精度 0.1°', 'EtherCAT / CAN FD / 485，500Hz', '支持位置、速度、电流、力位混合控制'],
      },
      {
        id: 'revo3-touch',
        name: 'BrainCo 仿生灵巧手 Revo3 触觉版（U21T）',
        short: 'Revo3 触觉版',
        price: 130000,
        unit: '只',
        image: '/static/brainco/revo3-poster.jpg',
        specs: ['全掌压阻触觉，感知精度 0.1N', '400+ 触觉点，其余规格同 U21', '适合灵巧操作与触觉反馈研究'],
      },
      {
        id: 'revo3-vtouch',
        name: 'BrainCo 仿生灵巧手 Revo3 视触觉版（U21VT）',
        short: 'Revo3 视触觉版',
        price: 200000,
        unit: '只',
        image: '/static/brainco/revo3-poster.jpg',
        specs: ['全掌压阻触觉 + 指尖视触觉', '最小可测形变 130 微米', '面向高精度装配与具身智能研究'],
      },
    ],
  },
  {
    id: 'bci',
    name: '脑机接口设备',
    desc: '32 通道无线脑电 / 多模态生理信号 / 遥操作采集',
    items: [
      {
        id: 'bcigo',
        name: 'BCIGo 智能脑机接口系统（32 通道无线脑电）',
        short: 'BCIGo 32 通道脑电',
        price: 250000,
        unit: '套',
        image: '/static/brainco/eeg.jpg',
        specs: ['32 通道，采样率最高 2kHz，24bit', '放大器仅 83g，WiFi 5GHz 无线传输', '兼容 Ag/AgCl 湿电极与柔性干电极', '实时伪影去除、频域/时频分析、脑电地形图', '支持 EDF+ / BDF 导出，兼容 EEGLAB'],
      },
      {
        id: 'biosensor',
        name: '神经电信号与生物传感器套装',
        short: '多模态生理信号套装',
        price: 68000,
        unit: '套',
        image: '/static/brainco/eeg.jpg',
        specs: ['EEG / ECG / EMG / PPG / IMU / 弯曲传感器', '噪声 <6uVpp，共模抑制比 >100dB', '蓝牙 >10 米，续航 >8 小时', '配套软件 + SDK，可二次开发'],
      },
      {
        id: 'remote',
        name: '遥操作集成套装（动捕手套 + 肌电臂环）',
        short: '遥操作套装',
        price: 65000,
        unit: '套',
        image: '/static/brainco/remote.jpg',
        specs: ['6 自由度动作捕捉手套（含 IMU）', '8 通道肌电臂环，噪声 <2uVpp', '手势识别延迟 <200ms', '可遥操作灵巧手 / 机械臂 / 机器人'],
      },
      {
        id: 'emg-band',
        name: '8 通道肌电臂环',
        short: '肌电臂环',
        price: 32500,
        unit: '只',
        image: '/static/brainco/remote.jpg',
        specs: ['8 通道 EMG，250Hz 可配置采样', '与任意外部受支持设备互联', '用于手势识别、遥操作、神经科学教学'],
      },
      {
        id: 'neuro-platform',
        name: '神经接口及跨学科实验平台 V1.0',
        short: '跨学科实验平台',
        price: 70000,
        unit: '套',
        image: '/static/brainco/eeg.jpg',
        specs: ['多设备同时连接与数据可视化', '兼容脑电/肌电/传感器/灵巧手等设备', '开放 SDK，支持课程与科研实验'],
      },
      {
        id: 'course',
        name: '脑机接口 / 机器人 / 人工智能实训课程',
        short: '实训课程（每门）',
        price: 100000,
        unit: '门',
        image: '/static/brainco/company.jpg',
        specs: ['脑机接口技术与应用实训课程', '机器人应用实训课程', '人工智能与图像处理应用实训课程', '高校教师联合编写，理论 + 实践结合'],
      },
    ],
  },
  {
    id: 'coop',
    name: '产教联合',
    desc: '产业学院 · 产教融合实训基地 · 创践中心共建 · 课程与师资培训',
    items: [
      {
        id: 'coop-center',
        sub: '产业学院',
        name: '脑机智能机器人创践中心（产教联合共建方案）',
        short: '创践中心共建',
        price: 0,
        unit: '套',
        image: '/static/brainco/company.jpg',
        specs: [
          '场地规划 + 设备配置清单 + 展示动线设计',
          '脑机接口 / 灵巧手 / 双臂机器人 / 数据采集平台组合配置',
          '课程体系 + 师资培训 + 科研合作支持',
          '可按学校学科方向与预算定制，一事一议',
        ],
        inquiry: true,
      },
      {
        id: 'coop-college',
        sub: '产业学院',
        name: '产业学院共建（专业共建 / 订单式培养）',
        short: '产业学院共建',
        price: 0,
        unit: '套',
        image: '/static/brainco/team.jpg',
        specs: [
          '专业方向共建：脑机接口 / 机器人 / 人工智能',
          '企业导师进课堂 + 订单式培养',
          '联合申报项目、共建课程与教材',
          '面向高校 / 职校，方案面议',
        ],
        inquiry: true,
      },
      {
        id: 'coop-base',
        sub: '实训基地',
        name: '产教融合实训基地共建',
        short: '产教融合实训基地',
        price: 0,
        unit: '套',
        image: '/static/brainco/team.jpg',
        specs: [
          '联合实验室 + 实习实训基地 + 双创竞赛支持',
          '真实项目场景与数据采集实训',
          '对接强脑科技产业资源',
          '面向高校 / 职校 / 园区，方案面议',
        ],
        inquiry: true,
      },
      {
        id: 'coop-course-bci',
        sub: '课程',
        name: '脑机接口技术与应用实训课程',
        short: '脑机接口实训课程',
        price: 100000,
        unit: '门',
        image: '/static/brainco/eeg.jpg',
        specs: ['脑机接口原理与范式（SSVEP / MI）', '脑电采集、信号处理与特征提取', '配合 BCIGo 32 通道脑电设备实训', '高校教师联合编写教材与实验手册'],
      },
      {
        id: 'coop-course-robot',
        sub: '课程',
        name: '机器人应用实训课程',
        short: '机器人实训课程',
        price: 100000,
        unit: '门',
        image: '/static/brainco/robot.jpg',
        specs: ['机器人技术通识 + 控制 + 信号处理', '配合机械臂 / 灵巧手 / 四足平台实训', '含项目案例与课程设计'],
      },
      {
        id: 'coop-course-ai',
        sub: '课程',
        name: '人工智能与图像处理应用实训课程',
        short: 'AI 实训课程',
        price: 100000,
        unit: '门',
        image: '/static/brainco/brainrobot.jpg',
        specs: ['CNN / ResNet / 迁移学习 / Vision Transformer', 'PyTorch 实战：搭建、训练与评估', '结合具身智能数据采集场景'],
      },
      {
        id: 'coop-platform',
        sub: '实训基地',
        name: '产教联合实验平台组合（按校定制）',
        short: '产教联合平台组合',
        price: 0,
        unit: '套',
        image: '/static/brainco/revohuman.jpg',
        specs: [
          '32 通道脑电 + Revo2/Revo3 灵巧手 + 跨学科实验平台',
          '可加配双臂机器人 / RevoHuman 数采方案',
          '配套课程 + 师资培训 + 售后交付',
          '按学科方向与预算组合，价格面议',
        ],
        inquiry: true,
      },
    ],
  },
  {
    id: 'solution',
    name: '整体解决方案',
    desc: '面向高校 / 科研 / 展示的一体化交付',
    items: [
      {
        id: 'brain-robot',
        name: '脑控机器人套件（32 通道脑电 + 宇树 G1 Edu）',
        short: '脑控机器人套件',
        price: 649000,
        unit: '套',
        image: '/static/brainco/brainrobot.jpg',
        specs: ['32 通道非侵入式脑电帽 + 智能分析算法', 'Unitree G1 Edu 人形机器人', 'SSVEP / MI 范式解码，意念控制机器人', '可用于脑机接口研究、人机交互、康复训练教学'],
      },
      {
        id: 'brain-arm',
        name: '脑控机械臂套件（32 通道脑电 + 六轴机械臂）',
        short: '脑控机械臂套件',
        price: 512000,
        unit: '套',
        image: '/static/brainco/brainrobot.jpg',
        specs: ['32 通道脑电 + 六自由度机械臂 + Revo2 灵巧手', 'SSVEP / MI 意图解码控制抓取', '适合高校科研与展示'],
      },
      {
        id: 'brain-arm-lite',
        name: '脑控机械臂（可穿戴脑电 + 视觉抓取机械臂）',
        short: '脑控机械臂（轻量版）',
        price: 166998,
        unit: '套',
        image: '/static/brainco/brainrobot.jpg',
        specs: ['FocusZen 可穿戴脑电检测设备 × 2', '视觉抓取机械臂（6 自由度，负载 5kg）', '专注力数据 + 机械臂动作联动展示'],
      },
      {
        id: 'piano',
        name: '仿生灵巧手机械臂弹奏电子琴控制平台',
        short: '灵巧手弹琴平台',
        price: 221500,
        unit: '套',
        image: '/static/brainco/revotron.jpg',
        specs: ['灵巧手 + 六轴机械臂 + 61 键电子琴', '可弹奏 10+ 首曲子，展示高速运动能力', '含控制主机与演示软件'],
      },
      {
        id: 'emg-platform',
        name: '智能仿生灵巧手 EMG 控制平台',
        short: '肌电控制灵巧手平台',
        price: 90500,
        unit: '套',
        image: '/static/brainco/remote.jpg',
        specs: ['多通道肌电臂环 + 灵巧手 + 控制主机', '肌电信号采集 → 意图识别 → 灵巧手控制', '智能假肢核心原理展示'],
      },
      {
        id: 'teleop-platform',
        name: '灵巧手视觉 / 臂环 / 手套遥操作控制平台',
        short: '遥操作综合平台',
        price: 290688,
        unit: '套',
        image: '/static/brainco/remote.jpg',
        specs: ['灵巧手 + 六轴机械臂 + 深度视觉', '手套 / 肌电臂环 / 视觉三种控制方式', '含三个项目案例软件'],
      },
      {
        id: 'dog',
        name: '四足机器狗（肌电臂环遥操作）',
        short: '肌电控制四足狗',
        price: 182500,
        unit: '套',
        image: '/static/brainco/revomate.jpg',
        specs: ['工业级 IMU，支持上下楼梯/斜坡/匍匐', '肌电臂环遥操作 + 语音控制', '可用于机器人教学与展示'],
      },
      {
        id: 'particle',
        name: '离散粒子控制平台',
        short: '离散粒子平台',
        price: 50000,
        unit: '套',
        image: '/static/brainco/remote.jpg',
        specs: ['8 通道肌电臂环 + 离散粒子演示软件', '肌电信号实时控制粒子运动', '适合课堂演示与科普'],
      },
    ],
  },
];

const VIDEOS = [
  { src: '/files/f_mw6o4jgo95hkih/v1.mp4', tag: '双臂机器人', cap: 'BrainCo 双臂机器人 / 数据采集演示', poster: '/static/brainco/robot.jpg' },
  { src: '/files/f_mw7zdutmnuibgf/v02.mp4', tag: '双臂机器人', cap: '双臂机器人互动演示', poster: '/static/brainco/revotron.jpg' },
  { src: '/files/f_mw7zdv2nq9kk70/v04.mp4', tag: '双臂机器人', cap: '双臂机器人精细操作特写', poster: '/static/brainco/revotron.jpg' },
  { src: '/files/f_mw7zdur3r3yeum/v01.mp4', tag: '灵巧手', cap: '灵巧手弹奏电子琴（灵巧手弹琴平台）', poster: '/static/brainco/revo2-poster.jpg' },
  { src: '/files/f_mw7zdv6v71dsg9/v05.mp4', tag: '灵巧手', cap: '灵巧手精细抓取小件物体', poster: '/static/brainco/revo2-poster.jpg' },
  { src: '/files/f_mw7zdvvtcrqwn2/v06.mp4', tag: '灵巧手', cap: '灵巧手与人手协同操作', poster: '/static/brainco/revo2-poster.jpg' },
  { src: '/files/f_mw6o4jmmifl6l0/v2.mp4', tag: '灵巧手', cap: '灵巧手 / 机器人操作演示', poster: '/static/brainco/revo3-poster.jpg' },
  { src: '/files/f_mw7zdw9em1j7wr/v07.mp4', tag: '遥操作', cap: '遥操作：数据手套 + 机械臂', poster: '/static/brainco/remote.jpg' },
  { src: '/files/f_mw7zdwg863roli/v08.mp4', tag: '数据采集', cap: '真机数据采集平台（软件界面 + 双手数据）', poster: '/static/brainco/revohuman.jpg' },
  { src: '/files/f_mw7zdx5ola5efz/v10.mp4', tag: 'RevoHuman', cap: 'RevoHuman 外骨骼数采 · 双手操作', poster: '/static/brainco/revohuman.jpg' },
  { src: '/files/f_mw7zdyj68d5uuq/v15.mp4', tag: 'RevoHuman', cap: 'RevoHuman 数采 · 整理衣物', poster: '/static/brainco/revohuman.jpg' },
];

/* 每个产品组绑定的视频与资料（资料只预览，不提供下载） */
const GROUP_EXTRAS = {
  robot: {
    videos: [
      { src: '/files/f_mw6o4jgo95hkih/v1.mp4', cap: '双臂机器人 / 数据采集演示', poster: '/static/brainco/robot.jpg' },
      { src: '/files/f_mw7zdutmnuibgf/v02.mp4', cap: '双臂机器人互动演示', poster: '/static/brainco/revotron.jpg' },
      { src: '/files/f_mw7zdv2nq9kk70/v04.mp4', cap: '双臂机器人精细操作特写', poster: '/static/brainco/revotron.jpg' },
      { src: '/files/f_mw7zdx5ola5efz/v10.mp4', cap: 'RevoHuman 外骨骼数采 · 双手操作', poster: '/static/brainco/revohuman.jpg' },
      { src: '/files/f_mw7zdyj68d5uuq/v15.mp4', cap: 'RevoHuman 数采 · 整理衣物', poster: '/static/brainco/revohuman.jpg' },
    ],
    docs: [
      { name: 'RevoHuman 参数页', imgs: ['/static/brainco/revohuman-spec.jpg'], kind: '图片' },
      { name: 'RevoHuman 产品彩页', imgs: ['/static/brainco/revohuman.jpg'], kind: '图片' },
      { name: '双臂灵巧真机数采平台彩页', imgs: ['/static/brainco/hero-poster.jpg'], kind: '图片' },
    ],
  },
  hand: {
    videos: [
      { src: '/files/f_mw7zdur3r3yeum/v01.mp4', cap: '灵巧手弹奏电子琴（弹琴平台）', poster: '/static/brainco/revo2-poster.jpg' },
      { src: '/files/f_mw7zdv6v71dsg9/v05.mp4', cap: '灵巧手精细抓取小件物体', poster: '/static/brainco/revo2-poster.jpg' },
      { src: '/files/f_mw7zdvvtcrqwn2/v06.mp4', cap: '灵巧手与人手协同操作', poster: '/static/brainco/revo2-poster.jpg' },
      { src: '/files/f_mw6o4jmmifl6l0/v2.mp4', cap: '灵巧手 / 机器人操作演示', poster: '/static/brainco/revo3-poster.jpg' },
    ],
    docs: [
      { name: 'Revo2 产品参数页', imgs: ['/static/brainco/revo2-spec.jpg'], kind: '图片' },
      {
        name: 'Revo2 灵巧手 FAQ',
        kind: '文档预览',
        imgs: Array.from({ length: 9 }, (_, i) => `/static/brainco/preview/revo2-faq-p${String(i + 1).padStart(2, '0')}.jpg`),
      },
      { name: 'Revo3 产品参数页', imgs: ['/static/brainco/revo3-spec.jpg'], kind: '图片' },
      {
        name: 'Revo3 参数表（2026-10）',
        kind: '文档预览',
        imgs: Array.from({ length: 10 }, (_, i) => `/static/brainco/preview/revo3-spec-p${String(i + 1).padStart(2, '0')}.jpg`),
      },
      {
        name: 'Revo3 灵巧手 FAQ',
        kind: '文档预览',
        imgs: Array.from({ length: 8 }, (_, i) => `/static/brainco/preview/revo3-faq-p${String(i + 1).padStart(2, '0')}.jpg`),
      },
      { name: 'Revo2 产品海报', imgs: ['/static/brainco/revo2-poster.jpg'], kind: '图片' },
      { name: 'Revo3 产品海报', imgs: ['/static/brainco/revo3-poster.jpg'], kind: '图片' },
    ],
  },
  bci: {
    videos: [
      { src: '/files/f_mw7zdw9em1j7wr/v07.mp4', cap: '遥操作：数据手套 + 机械臂', poster: '/static/brainco/remote.jpg' },
    ],
    docs: [],
  },
  solution: {
    videos: [
      { src: '/files/f_mw7zdwg863roli/v08.mp4', cap: '真机数据采集平台（软件界面 + 双手数据）', poster: '/static/brainco/revohuman.jpg' },
    ],
    docs: [],
  },
};

const ALL_ITEMS = GROUPS.flatMap((g) => g.items.map((it) => ({ ...it, group: g.name })));

const CART_KEY = 'xyl_brainco_cart';

function money(n) {
  if (!n) return '';
  return '¥' + Number(n).toLocaleString('zh-CN');
}

function getCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function setCart(cart) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    /* ignore */
  }
}

function cartCount(cart) {
  return Object.values(cart).reduce((a, b) => a + (Number(b) || 0), 0);
}

function cartTotal(cart) {
  return Object.entries(cart).reduce((sum, [id, qty]) => {
    const it = ALL_ITEMS.find((x) => x.id === id);
    return sum + (it && it.price ? it.price * (Number(qty) || 0) : 0);
  }, 0);
}

function productCard(it, inCart) {
  const qty = Number(inCart[it.id] || 0);
  return `<div class="bc-card" data-item="${ui.esc(it.id)}" data-sub="${ui.esc(it.sub || '')}">
    <div class="bc-card-img">
      <button class="bc-share-ico" type="button" data-bc-share="${ui.esc(it.id)}" aria-label="分享这个产品">↗</button>
      <img src="${ui.esc(it.image)}" alt="${ui.esc(it.short)}" loading="lazy">
      ${it.inquiry ? '<span class="bc-tag">询价</span>' : `<span class="bc-tag price">${money(it.price)}</span>`}
    </div>
    <div class="bc-card-body">
      <div class="bc-card-name">${ui.esc(it.short)}</div>
      <div class="bc-card-full tiny dim">${ui.esc(it.name)}</div>
      <ul class="bc-specs">${it.specs.map((s) => `<li>${ui.esc(s)}</li>`).join('')}</ul>
      <div class="bc-card-foot">
        <div class="bc-price">${it.inquiry ? '<span class="bc-inquiry">价格面议</span>' : `${money(it.price)}<span class="tiny dim">/${ui.esc(it.unit)}</span>`}</div>
        ${
          it.inquiry
            ? `<button class="btn btn-sm btn-outline" data-bc-inquiry="${ui.esc(it.id)}" type="button">咨询报价</button>`
            : qty > 0
              ? `<div class="bc-qty" data-qty-box="${ui.esc(it.id)}">
                   <button type="button" data-bc-minus="${ui.esc(it.id)}">−</button>
                   <span data-bc-qty="${ui.esc(it.id)}">${qty}</span>
                   <button type="button" data-bc-plus="${ui.esc(it.id)}">+</button>
                 </div>`
              : `<button class="btn btn-sm btn-primary" data-bc-add="${ui.esc(it.id)}" type="button">加入采购单</button>`
        }
      </div>
    </div>
  </div>`;
}

export async function renderBrainco(ctx, query) {
  const params = query || {};
  const cart = getCart();
  const groupExtraHtml = (gid) => {
    const ex = GROUP_EXTRAS[gid] || {};
    const vids = ex.videos || [];
    const docs = ex.docs || [];
    if (!vids.length && !docs.length) return '';
    return `<div class="bc-group-extra">
      ${
        vids.length
          ? `<div class="bc-extra-t">🎬 相关视频 <span class="tiny dim">（${vids.length} 条）</span></div>
             <div class="bc-videos bc-videos-inline">
               ${vids
                 .map(
                   (v) => `<div class="bc-video-card">
                   <video class="bc-video" src="${ui.esc(v.src)}" poster="${ui.esc(v.poster || '')}" controls playsinline webkit-playsinline preload="metadata"></video>
                   <div class="bc-video-cap">${ui.esc(v.cap)}</div>
                 </div>`,
                 )
                 .join('')}
             </div>`
          : ''
      }
      ${
        docs.length
          ? `<div class="bc-extra-t">📄 相关资料 <span class="tiny dim">（点击预览，无需下载）</span></div>
             <div class="bc-docs">
               ${docs
                 .map(
                   (d) => `<button class="bc-doc" type="button" data-bc-imgs="${ui.esc(d.imgs.join('|'))}" data-bc-title="${ui.esc(d.name)}">
                   <span class="bc-doc-ico">${d.kind === '文档预览' ? '📘' : '🖼️'}</span>
                   <span class="bc-doc-body"><b>${ui.esc(d.name)}</b><i>${ui.esc(d.kind)} · 点击预览</i></span>
                   <span class="bc-doc-go">预览</span>
                 </button>`,
                 )
                 .join('')}
             </div>`
          : ''
      }
    </div>`;
  };
  const groupsHtml = GROUPS.map((g, gi) => {
    const items = g.items.map((it) => productCard(it, cart)).join('');
    return `<div class="bc-group" id="bc-group-${ui.esc(g.id)}">
      <div class="bc-group-head">
        <div class="bc-group-name">${ui.esc(g.name)}</div>
        <div class="bc-group-desc">${ui.esc(g.desc)}</div>
      </div>
      ${
        g.id === 'coop'
          ? `<div class="bc-subtabs" data-subtabs="coop">
               <button class="bc-subtab active" type="button" data-sub="all">全部</button>
               <button class="bc-subtab" type="button" data-sub="产业学院">产业学院</button>
               <button class="bc-subtab" type="button" data-sub="实训基地">实训基地</button>
               <button class="bc-subtab" type="button" data-sub="课程">课程</button>
             </div>`
          : ''
      }
      <div class="bc-grid">${items}</div>
      ${groupExtraHtml(g.id)}
    </div>`;
  }).join('');

  const html = `<div class="page bc-page">
    <div class="bc-hero">
      <div class="bc-hero-left">
        <div class="bc-partner-badge">🤝 小鱼来了 战略合作伙伴</div>
        <div class="bc-logo">BrainCo <span>强脑科技</span></div>
        <div class="bc-hero-t">脑机接口 + 具身智能<br>校企合作整体解决方案</div>
        <div class="bc-hero-d">非侵入式脑机接口领军企业 · 国家级专精特新「小巨人」· 脑机接口领域独角兽</div>
        <div class="bc-hero-points">
          <span>双形态部署</span><span>自研灵巧手</span><span>精细移动操作</span><span>多模态数采方案</span>
        </div>
        <div class="row gap8 mt16" style="flex-wrap:wrap">
          <a class="btn btn-primary" href="#bc-products">看产品与报价</a>
          <button class="btn btn-outline" id="bc-visit" type="button">🏫 申请参访</button>
          <button class="btn btn-outline" id="bc-share-page" type="button">↗ 分享专题</button>
        </div>
      </div>
      <div class="bc-hero-right">
        <img src="/static/brainco/robot.jpg" alt="BrainCo 双臂机器人">
      </div>
    </div>

    <!-- 1. 公司简介 -->
    <div class="bc-section" id="bc-about">
      <div class="bc-section-head">
        <div class="bc-section-t">01 公司简介</div>
        <div class="bc-section-d">BrainCo 强脑科技 · 全球非侵入式脑机接口技术领军企业</div>
      </div>
      <div class="bc-about">
        <div class="bc-about-text">
          <p>BrainCo 强脑科技创立于 <b>2015 年</b>，是首家入选哈佛大学创新实验室（Harvard Innovation Lab）的中国团队，也是全球非侵入式脑机接口技术领军企业。</p>
          <p>目前已完成约 <b>3 亿美元</b>融资并投入研发；在全球脑机接口领域，与马斯克的 Neuralink 分别为非侵入式和侵入式领域融资规模最大的两家公司。同时，BrainCo 强脑科技也是国内首家脑机接口领域「独角兽」，被认定为国家级专精特新「小巨人」企业，承担、参与多项脑机接口领域国家级重点项目，并入选工信部人工智能医疗器械创新任务揭榜优胜单位。</p>
          <p>企业秉持「脑机科技，开启生命更多可能性」的使命，致力于将实验室里的技术应用于现实。团队中来自哈佛、MIT、清华、北大等顶尖学府的校友占比超过 70%；在脑机接口领域已申请 <b>630 余项</b>专利，获得 <b>400 余项</b>授权，其中核心发明专利 <b>220 余项</b>，位居全球前列。</p>
          <div class="bc-stats">
            <div><b>2015</b><span>成立年份</span></div>
            <div><b>≈3 亿美元</b><span>累计融资</span></div>
            <div><b>630+</b><span>专利申请</span></div>
            <div><b>400+</b><span>专利授权</span></div>
            <div><b>70%+</b><span>顶尖学府校友</span></div>
          </div>
          <div class="bc-cities">📍 杭州 · 深圳 · 波士顿 · 奥斯汀</div>
        </div>
        <div class="bc-about-media">
          <img src="/static/brainco/company.jpg" alt="BrainCo 公司介绍">
          <img src="/static/brainco/team.jpg" alt="BrainCo 科学家团队">
        </div>
      </div>
    </div>

    <!-- 2. 产品与方案 -->
    <div class="bc-section" id="bc-products">
      <div class="bc-section-head">
        <div class="bc-section-t">02 合作项目及产品介绍</div>
        <div class="bc-section-d">人形/双臂机器人 · 仿生灵巧手 · 脑机接口设备 · 整体解决方案</div>
      </div>
      <div class="bc-tabs">
        ${GROUPS.map((g, i) => `<a class="bc-tab ${i === 0 ? 'active' : ''}" href="#bc-group-${ui.esc(g.id)}" data-bc-jump="${ui.esc(g.id)}">${ui.esc(g.name)}</a>`).join('')}
      </div>
      ${groupsHtml}
    </div>

    <!-- 3. 采购 -->
    <div class="bc-section" id="bc-buy">
      <div class="bc-section-head">
        <div class="bc-section-t">03 产品报价采购（电商模式）</div>
        <div class="bc-section-d">加入采购单 → 提交采购需求，平台与强脑科技商务对接</div>
      </div>
      <div class="bc-buy-note">
        <div>💡 以上价格均为<b>市场参考价（含税）</b>，高校/科研批量采购可申请优惠方案；开具发票与交付由强脑科技统一执行。</div>
        <button class="btn btn-sm btn-outline" id="bc-clear-cart" type="button">清空采购单</button>
      </div>
    </div>

    <!-- 4. 寻求合作 / 贸易发布 -->
    <div class="bc-section" id="bc-publish">
      <div class="bc-section-head">
        <div class="bc-section-t">04 寻求合作 / 发布需求</div>
        <div class="bc-section-d">填写合作需求（含产教联合），平台与强脑科技商务对接</div>
      </div>
      <div class="bc-publish-grid">
        <div class="bc-publish-card">
          <div class="bc-publish-t">🤝 寻求合作</div>
          <div class="bc-publish-d">
            面向高校 / 科研机构 / 园区 / 企业，寻求以下方向合作：<br>
            <b>产教联合</b>（产业学院、产教融合实训基地、实习实训）<br>
            脑机智能机器人创践中心共建 · 联合实验室 · 课程共建 · 设备采购 · 成果转化<br>
            提交后自动生成「寻求合作」项目信息并发布，附联系人与补充资料。
          </div>
          <button class="btn btn-primary btn-block" id="bc-coop-open" type="button">填写寻求合作需求</button>
        </div>
        <div class="bc-publish-card">
          <div class="bc-publish-t">📦 贸易供货</div>
          <div class="bc-publish-d">RevoTron 双臂机器人、Revo3 灵巧手、BCIGo 32 通道脑电等产品供货信息，自动生成贸易信息并发布。</div>
          <button class="btn btn-primary btn-block" id="bc-publish-trade" type="button">一键发布贸易信息</button>
        </div>
      </div>
    </div>

    <div class="bc-foot">
      <div>BrainCo 强脑科技 × 小鱼来了 · 战略合作伙伴专题</div>
      <div class="tiny dim mt6">产品参数与价格来自强脑科技 2026-06 版彩页 / 配置清单，最终以合同与官方报价为准。</div>
      <div class="row gap8 mt8" style="justify-content:center">
        <a class="btn btn-sm btn-outline" href="#/services">企业服务</a>
        <a class="btn btn-sm btn-outline" href="#contact">联系平台</a>
      </div>
    </div>

    <div class="bc-cart-bar ${cartCount(cart) ? '' : 'hide'}" id="bc-cart-bar">
      <div class="bc-cart-info">
        <b id="bc-cart-count">${cartCount(cart)}</b> 件 · 合计 <b id="bc-cart-total">${cartTotal(cart) ? money(cartTotal(cart)) : '面议'}</b>
      </div>
      <button class="btn btn-primary" id="bc-cart-submit" type="button">提交采购单</button>
    </div>
  </div>`;

  return {
    title: 'BrainCo 强脑科技专题',
    content: html,
    showBack: true,
    activeTab: 'home',
    mount(root) {
      const cartNow = () => getCart();
      const repaintBar = () => {
        const c = cartNow();
        const bar = root.querySelector('#bc-cart-bar');
        const n = cartCount(c);
        bar.classList.toggle('hide', n === 0);
        const cnt = root.querySelector('#bc-cart-count');
        const tot = root.querySelector('#bc-cart-total');
        if (cnt) cnt.textContent = String(n);
        if (tot) tot.textContent = cartTotal(c) ? money(cartTotal(c)) : '面议';
      };
      const repaintCard = (id) => {
        const card = root.querySelector(`.bc-card[data-item="${id}"]`);
        const item = ALL_ITEMS.find((x) => x.id === id);
        if (!card || !item) return;
        const c = cartNow();
        const qty = Number(c[id] || 0);
        const foot = card.querySelector('.bc-card-foot');
        if (!foot) return;
        const priceHtml = item.inquiry
          ? '<span class="bc-inquiry">价格面议</span>'
          : `${money(item.price)}<span class="tiny dim">/${ui.esc(item.unit)}</span>`;
        foot.innerHTML = `<div class="bc-price">${priceHtml}</div>${
          item.inquiry
            ? `<button class="btn btn-sm btn-outline" data-bc-inquiry="${id}" type="button">咨询报价</button>`
            : qty > 0
              ? `<div class="bc-qty"><button type="button" data-bc-minus="${id}">−</button><span>${qty}</span><button type="button" data-bc-plus="${id}">+</button></div>`
              : `<button class="btn btn-sm btn-primary" data-bc-add="${id}" type="button">加入采购单</button>`
        }`;
      };
      const changeQty = (id, delta) => {
        const c = cartNow();
        const cur = Number(c[id] || 0) + delta;
        if (cur <= 0) delete c[id];
        else c[id] = Math.min(cur, 99);
        setCart(c);
        repaintCard(id);
        repaintBar();
      };

      /* ---------- 分享专题 ---------- */
      const shareUrl = () => `${location.origin}/#/brainco`;
      const doShare = async (title, url) => {
        try {
          if (navigator.share) {
            await navigator.share({ title, url });
            return true;
          }
        } catch {
          /* 用户取消 */
        }
        try {
          await navigator.clipboard.writeText(`${title}\n${url}`);
          ui.toast('链接已复制，可粘贴到微信', 'ok');
          return true;
        } catch {
          ui.toast(url, 'ok');
          return false;
        }
      };
      root.querySelector('#bc-share-page')?.addEventListener('click', () => {
        doShare('BrainCo 强脑科技 × 小鱼来了 · 脑机接口与具身智能专题', shareUrl());
      });

      /* ---------- 产品分享（链接带 ?item=，打开自动定位） ---------- */
      root.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-bc-share]');
        if (!btn) return;
        e.stopPropagation();
        const id = btn.dataset.bcShare;
        const it = ALL_ITEMS.find((x) => x.id === id);
        const url = `${location.origin}/#/brainco?item=${encodeURIComponent(id)}`;
        await doShare(it ? `强脑科技 ${it.short}` : '强脑科技产品', url);
      });

      /* ---------- 申请参访 ---------- */
      root.querySelector('#bc-visit')?.addEventListener('click', () => {
        if (!isLoggedIn()) {
          ui.toast('登录后才能提交参访申请', 'err');
          ctx.nav('#/login');
          return;
        }
        ui.openSheet({
          title: '申请参访',
          content: `<div class="tiny dim mb8">提交后平台与强脑科技商务会联系您确认参访时间（杭州 / 深圳展厅）。</div>
            <div class="field"><label>姓名 <span style="color:#e74c3c">*</span></label><input class="input" id="bc-visit-name" maxlength="30" placeholder="您的姓名"></div>
            <div class="field"><label>单位 <span style="color:#e74c3c">*</span></label><input class="input" id="bc-visit-org" maxlength="80" placeholder="学校 / 企业 / 园区"></div>
            <div class="field"><label>电话 <span style="color:#e74c3c">*</span></label><input class="input" id="bc-visit-phone" maxlength="20" placeholder="手机号"></div>
            <div class="field"><label>城市</label><input class="input" id="bc-visit-city" maxlength="30" placeholder="您所在城市"></div>
            <div class="row gap8">
              <div class="field grow"><label>参访人数</label><input class="input" id="bc-visit-people" type="number" min="1" max="50" value="2"></div>
              <div class="field grow"><label>意向日期</label><input class="input" id="bc-visit-date" type="date"></div>
            </div>
            <div class="field"><label>备注</label><textarea class="textarea" id="bc-visit-note" rows="3" maxlength="500" placeholder="想重点了解的产品 / 方向"></textarea></div>
            <button class="btn btn-primary btn-block mt8" id="bc-visit-submit">提交参访申请</button>`,
          onMount(sheet, close) {
            sheet.querySelector('#bc-visit-submit').addEventListener('click', async (e) => {
              const btn = e.currentTarget;
              const name = String(sheet.querySelector('#bc-visit-name').value || '').trim();
              const org = String(sheet.querySelector('#bc-visit-org').value || '').trim();
              const phone = String(sheet.querySelector('#bc-visit-phone').value || '').trim();
              const city = String(sheet.querySelector('#bc-visit-city').value || '').trim();
              const people = String(sheet.querySelector('#bc-visit-people').value || '2').trim();
              const date = String(sheet.querySelector('#bc-visit-date').value || '').trim();
              const note = String(sheet.querySelector('#bc-visit-note').value || '').trim();
              if (!name || !org || !phone) return ui.toast('请填写姓名、单位、电话', 'err');
              btn.disabled = true;
              btn.textContent = '提交中…';
              try {
                await service.feedbackSubmit({
                  text: `【申请参访 BrainCo 强脑科技】\n姓名：${name}\n单位：${org}\n电话：${phone}\n城市：${city || '（未填）'}\n人数：${people}\n意向日期：${date || '待定'}\n备注：${note || '（无）'}`,
                  contact: phone,
                  page: '#/brainco',
                  topics: ['强脑科技', '申请参访'],
                });
                close();
                ui.toast('参访申请已提交，商务会尽快联系您', 'ok');
              } catch (err) {
                btn.disabled = false;
                btn.textContent = '提交参访申请';
                ui.toast(err.message || '提交失败', 'err');
              }
            });
          },
        });
      });

      /* ---------- 图片查看（用弹层，不跳走） ---------- */
      const viewer = document.createElement('div');
      viewer.className = 'bc-viewer hide';
      viewer.innerHTML =
        '<div class="bc-viewer-panel"><div class="bc-viewer-head"><b class="bc-viewer-title"></b><button type="button" class="bc-viewer-x" aria-label="关闭">✕</button></div><div class="bc-viewer-body"></div></div>';
      root.appendChild(viewer);
      root.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-bc-imgs]');
        if (btn) {
          e.preventDefault();
          const imgs = String(btn.dataset.bcImgs || '').split('|').filter(Boolean);
          if (!imgs.length) return;
          viewer.querySelector('.bc-viewer-title').textContent = btn.dataset.bcTitle || '资料预览';
          viewer.querySelector('.bc-viewer-body').innerHTML = imgs
            .map((u, i) => `<img src="${ui.esc(u)}" alt="第 ${i + 1} 页" loading="lazy">`)
            .join('');
          viewer.querySelector('.bc-viewer-body').scrollTop = 0;
          viewer.classList.remove('hide');
          return;
        }
        if (e.target === viewer || e.target.classList.contains('bc-viewer-x')) {
          viewer.classList.add('hide');
        }
      });

      /* ---------- 分享链接 ?item= 定位高亮 ---------- */
      if (params.item) {
        const card = root.querySelector(`.bc-card[data-item="${params.item}"]`);
        if (card) {
          card.classList.add('bc-card-hl');
          setTimeout(() => card.scrollIntoView({ block: 'center' }), 300);
        }
      }

      /* 产教联合子 tab：产业学院 / 实训基地 / 课程 */
      root.querySelectorAll('.bc-subtabs [data-sub]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const group = btn.closest('[data-subtabs]');
          if (!group) return;
          group.querySelectorAll('.bc-subtab').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          const want = btn.dataset.sub;
          root.querySelectorAll('#bc-group-coop .bc-card').forEach((card) => {
            card.classList.toggle('bc-card-hide', want !== 'all' && card.dataset.sub !== want);
          });
        });
      });

      root.querySelectorAll('[data-bc-jump]').forEach((tab) => {
        tab.addEventListener('click', (e) => {
          e.preventDefault();
          const target = root.querySelector('#bc-group-' + tab.dataset.bcJump);
          root.querySelectorAll('.bc-tab').forEach((t) => t.classList.remove('active'));
          tab.classList.add('active');
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });

      root.addEventListener('click', (e) => {
        const add = e.target.closest('[data-bc-add]');
        if (add) return changeQty(add.dataset.bcAdd, 1);
        const plus = e.target.closest('[data-bc-plus]');
        if (plus) return changeQty(plus.dataset.bcPlus, 1);
        const minus = e.target.closest('[data-bc-minus]');
        if (minus) return changeQty(minus.dataset.bcMinus, -1);
        const inq = e.target.closest('[data-bc-inquiry]');
        if (inq) {
          const it = ALL_ITEMS.find((x) => x.id === inq.dataset.bcInquiry);
          return openInquiry(it);
        }
      });

      const openInquiry = (it) => {
        ui.openSheet({
          title: '咨询报价',
          content: `<div class="field"><label>产品</label><input class="input" value="${ui.esc(it ? it.name : '')}" disabled></div>
            <div class="field"><label>联系人</label><input class="input" id="bc-inq-name" maxlength="30" placeholder="怎么称呼您"></div>
            <div class="field"><label>手机号</label><input class="input" id="bc-inq-phone" maxlength="20" placeholder="方便商务联系"></div>
            <div class="field"><label>需求说明</label><textarea class="textarea" id="bc-inq-note" rows="3" maxlength="500" placeholder="采购数量、使用场景、预算等"></textarea></div>
            <button class="btn btn-primary btn-block mt8" id="bc-inq-submit">提交咨询</button>`,
          onMount(sheet, close) {
            sheet.querySelector('#bc-inq-submit').addEventListener('click', async () => {
              const name = String(sheet.querySelector('#bc-inq-name').value || '').trim();
              const phone = String(sheet.querySelector('#bc-inq-phone').value || '').trim();
              const note = String(sheet.querySelector('#bc-inq-note').value || '').trim();
              if (!name || !phone) return ui.toast('请填写联系人与手机号', 'err');
              if (!isLoggedIn()) {
                close();
                ui.toast('登录后才能提交询价', 'err');
                ctx.nav('#/login');
                return;
              }
              try {
                await service.feedbackSubmit({
                  text: `【强脑科技询价】\n产品：${it ? it.name : ''}\n联系人：${name}\n手机：${phone}\n需求：${note || '（未填写）'}`,
                  contact: phone,
                  page: '#/brainco',
                  topics: ['强脑科技', '询价'],
                });
                close();
                ui.toast('已提交，商务会尽快联系您', 'ok');
              } catch (err) {
                ui.toast(err.message || '提交失败', 'err');
              }
            });
          },
        });
      };

      const submitCart = async () => {
        if (!isLoggedIn()) {
          ui.toast('登录后才能提交采购单', 'err');
          ctx.nav('#/login');
          return;
        }
        const c = cartNow();
        if (!cartCount(c)) return ui.toast('采购单是空的', 'err');
        const rows = Object.entries(c).map(([id, qty]) => {
          const it = ALL_ITEMS.find((x) => x.id === id);
          return { it, qty: Number(qty) };
        }).filter((r) => r.it);
        const total = cartTotal(c);
        ui.openSheet({
          title: '提交采购单',
          content: `<div class="field"><label>采购内容</label>
              <div class="bc-cart-list">${rows
                .map((r) => `<div class="row between tiny" style="padding:6px 0"><span>${ui.esc(r.it.short)} × ${r.qty}</span><span>${r.it.price ? money(r.it.price * r.qty) : '面议'}</span></div>`)
                .join('')}</div>
              <div class="tiny dim">合计：${total ? money(total) : '含面议产品'}</div>
            </div>
            <div class="field"><label>联系人</label><input class="input" id="bc-order-name" maxlength="30" placeholder="怎么称呼您"></div>
            <div class="field"><label>手机号</label><input class="input" id="bc-order-phone" maxlength="20" placeholder="商务联系手机号"></div>
            <div class="field"><label>单位 / 学校</label><input class="input" id="bc-order-company" maxlength="60" placeholder="选填"></div>
            <div class="field"><label>备注</label><textarea class="textarea" id="bc-order-note" rows="3" maxlength="1000" placeholder="交付时间、开票要求、采购流程等"></textarea></div>
            <button class="btn btn-primary btn-block mt8" id="bc-order-submit">确认提交</button>`,
          onMount(sheet, close) {
            sheet.querySelector('#bc-order-submit').addEventListener('click', async (e) => {
              const btn = e.currentTarget;
              const name = String(sheet.querySelector('#bc-order-name').value || '').trim();
              const phone = String(sheet.querySelector('#bc-order-phone').value || '').trim();
              const companyName = String(sheet.querySelector('#bc-order-company').value || '').trim();
              const note = String(sheet.querySelector('#bc-order-note').value || '').trim();
              if (!name || !phone) return ui.toast('请填写联系人与手机号', 'err');
              btn.disabled = true;
              btn.textContent = '提交中…';
              try {
                const lines = rows.map((r) => `· ${r.it.name} × ${r.qty}（${r.it.price ? money(r.it.price * r.qty) : '价格面议'}）`);
                const text = `【强脑科技采购需求】\n\n${lines.join('\n')}\n\n合计：${total ? money(total) : '含面议产品'}\n联系人：${name}\n手机：${phone}${companyName ? '\n单位：' + companyName : ''}${note ? '\n备注：' + note : ''}`;
                const title = `采购｜强脑科技 ${rows
                  .map((r) => r.it.short)
                  .slice(0, 3)
                  .join('、')}${rows.length > 3 ? ' 等' : ''}（${cartCount(c)} 件）`;
                const res = await service.createListing(
                  api.form({
                    category: 'trade',
                    title,
                    text,
                    subtitle: `强脑科技产品采购 · ${cartCount(c)} 件 · ${total ? money(total) : '面议'}`,
                    type: '采购',
                    durationDays: 90,
                    contactName: name,
                    phone,
                    company: companyName,
                    publish: '1',
                  }),
                );
                setCart({});
                close();
                ui.toast('采购单已提交，已生成贸易信息', 'ok');
                ctx.nav(`#/detail/${res.listing.id}`);
              } catch (err) {
                btn.disabled = false;
                btn.textContent = '确认提交';
                ui.toast(err.message || '提交失败', 'err');
              }
            });
          },
        });
      };

      root.querySelector('#bc-cart-submit')?.addEventListener('click', submitCart);
      root.querySelector('#bc-clear-cart')?.addEventListener('click', () => {
        setCart({});
        ALL_ITEMS.forEach((it) => repaintCard(it.id));
        repaintBar();
        ui.toast('采购单已清空', 'ok');
      });

      const COOP_DIRECTIONS = ['产教联合', '创践中心共建', '联合实验室', '课程共建', '设备采购', '成果转化'];

      /* 寻求合作：填需求 + 可选补充资料 → 自动发布一条「寻求合作」项目 */
      const openCoopForm = () => {
        if (!isLoggedIn()) {
          ui.toast('登录后才能提交合作需求', 'err');
          ctx.nav('#/login');
          return;
        }
        const picked = new Set(['产教联合']);
        ui.openSheet({
          title: '寻求合作',
          content: `<div class="field"><label>姓名 <span style="color:#e74c3c">*</span></label>
              <input class="input" id="bc-coop-name" maxlength="30" placeholder="您的姓名"></div>
            <div class="field"><label>单位 <span style="color:#e74c3c">*</span></label>
              <input class="input" id="bc-coop-org" maxlength="80" placeholder="学校 / 企业 / 园区名称"></div>
            <div class="field"><label>电话 <span style="color:#e74c3c">*</span></label>
              <input class="input" id="bc-coop-phone" maxlength="20" placeholder="手机号，方便商务联系"></div>
            <div class="field"><label>城市 <span style="color:#e74c3c">*</span></label>
              <input class="input" id="bc-coop-city" maxlength="30" placeholder="例如：杭州 / 深圳"></div>
            <div class="field"><label>合作方向 <span class="tiny dim">（可多选）</span></label>
              <div class="chips" id="bc-coop-dirs">
                ${COOP_DIRECTIONS.map((d) => `<a class="chip ${picked.has(d) ? 'active' : ''}" data-dir="${d}" href="javascript:;">${d}</a>`).join('')}
              </div>
            </div>
            <div class="field"><label>需求说明</label>
              <textarea class="textarea" id="bc-coop-note" rows="3" maxlength="1000" placeholder="例如：想共建产业学院 / 采购灵巧手与双臂机器人 / 联合申报项目"></textarea></div>
            <div class="field"><label>补充资料 <span class="tiny dim">（选填，可多选：PDF / Word / 图片 / 视频）</span></label>
              <input type="file" id="bc-coop-files" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,image/*,video/*">
              <div class="tiny dim mt6" id="bc-coop-file-tip">可上传需求文档、建设方案、场地照片等，作为补充资料随需求一起发布</div>
            </div>
            <button class="btn btn-primary btn-block mt8" id="bc-coop-submit" type="button">提交并发布</button>`,
          onMount(sheet, close) {
            const dirsBox = sheet.querySelector('#bc-coop-dirs');
            dirsBox?.addEventListener('click', (ev) => {
              const chip = ev.target.closest('[data-dir]');
              if (!chip) return;
              ev.preventDefault();
              const d = chip.dataset.dir;
              if (picked.has(d)) picked.delete(d);
              else picked.add(d);
              chip.classList.toggle('active', picked.has(d));
            });
            const btn = sheet.querySelector('#bc-coop-submit');
            btn.addEventListener('click', async () => {
              const name = String(sheet.querySelector('#bc-coop-name').value || '').trim();
              const org = String(sheet.querySelector('#bc-coop-org').value || '').trim();
              const phone = String(sheet.querySelector('#bc-coop-phone').value || '').trim();
              const city = String(sheet.querySelector('#bc-coop-city').value || '').trim();
              const note = String(sheet.querySelector('#bc-coop-note').value || '').trim();
              const fileInput = sheet.querySelector('#bc-coop-files');
              const fileList = Array.from(fileInput?.files || []);
              if (!name) return ui.toast('请填写姓名', 'err');
              if (!org) return ui.toast('请填写单位', 'err');
              if (!phone) return ui.toast('请填写电话', 'err');
              if (!city) return ui.toast('请填写城市', 'err');
              btn.disabled = true;
              const old = btn.textContent;
              try {
                // 先上传补充资料
                const fileIds = [];
                for (let k = 0; k < fileList.length; k += 1) {
                  btn.textContent = `上传资料 ${k + 1}/${fileList.length}…`;
                  try {
                    const up = await api.uploadFile(fileList[k], {
                      onProgress: (pct) => {
                        btn.textContent = `上传资料 ${k + 1}/${fileList.length} ${pct}%`;
                      },
                    });
                    const rec = (up && up.files && up.files[0]) || up;
                    if (rec && rec.id) fileIds.push(rec.id);
                  } catch {
                    /* 单个资料失败不影响提交 */
                  }
                }
                btn.textContent = '提交中…';
                const dirText = [...picked].join('、') || '产教联合';
                const title = `寻求合作｜${org} · 强脑科技${dirText}`;
                const text = `【寻求合作】BrainCo 强脑科技 × 小鱼来了

合作单位：${org}
联系人：${name}
电话：${phone}
城市：${city}
合作方向：${dirText}

需求说明：
${note || '（未填写，可由商务电话沟通）'}

合作方向说明：
· 产教联合：产业学院、产教融合实训基地、实习实训基地共建
· 创践中心共建：高校 / 科研机构「脑机智能机器人创践中心」
· 联合实验室：脑机接口 / 具身智能联合实验室
· 课程共建：脑机接口、机器人、人工智能实训课程与师资培训
· 设备采购：Revo 灵巧手、RevoTron 双臂机器人、BCIGo 脑电系统等
· 成果转化：科研设备联合采购、项目对接、技术落地场景

（补充资料 ${fileIds.length} 个，见附件）`;
                const res = await service.createListing(
                  api.form({
                    category: 'project',
                    title: title.slice(0, 80),
                    subtitle: `${city} · ${org} · 强脑科技产教联合 / 合作需求`,
                    text,
                    type: '寻求合作',
                    durationDays: 180,
                    contactName: name,
                    phone,
                    company: org,
                    publish: '1',
                    fileIds,
                  }),
                );
                close();
                ui.toast('已提交并发布，商务会尽快联系您', 'ok');
                ctx.nav(`#/detail/${res.listing.id}`);
              } catch (err) {
                btn.disabled = false;
                btn.textContent = old;
                ui.toast(err.message || '提交失败', 'err');
              }
            });
          },
        });
      };

      /* 贸易供货：一键发布 */
      const publishTrade = async () => {
        if (!isLoggedIn()) {
          ui.toast('登录后才能发布', 'err');
          ctx.nav('#/login');
          return;
        }
        const btn = root.querySelector('#bc-publish-trade');
        const old = btn.textContent;
        btn.disabled = true;
        btn.textContent = '生成中…';
        try {
          const title = '供货｜强脑科技 RevoTron 双臂机器人 / Revo3 灵巧手 / 32 通道脑电';
          const text = `【产品供货】BrainCo 强脑科技

一、供货产品
· RevoTron 重量级双臂机器人（固定版 ¥560,000 / 移动版 ¥695,000）
· 科研双臂灵巧手平台 ¥450,000｜科研单臂平台 ¥200,000
· Revo2 灵巧手 ¥19,999 起｜Revo3 灵巧手 ¥100,000 起
· RevoHuman 外骨骼式人类中心数采方案（面议）
· BCIGo 32 通道无线脑电系统 ¥250,000
· 脑控机器人套件 ¥649,000｜脑控机械臂套件 ¥512,000
· 遥操作套装 ¥65,000｜多模态生理信号套装 ¥68,000

二、适用场景
高校实训 / 科研实验室 / 具身智能数据采集 / 脑机接口教学

三、交付
原厂交付、安装调试、质保 1 年；可提供课程与师资培训。

四、采购方式
通过小鱼来了平台提交采购需求，由强脑科技商务统一报价。`;
          const res = await service.createListing(
            api.form({
              category: 'trade',
              title,
              text,
              subtitle: '原厂供货 · 高校科研教育场景',
              durationDays: 180,
              publish: '1',
            }),
          );
          ui.toast('已生成并发布', 'ok');
          ctx.nav(`#/detail/${res.listing.id}`);
        } catch (err) {
          btn.disabled = false;
          btn.textContent = old;
          ui.toast(err.message || '发布失败', 'err');
        }
      };
      root.querySelector('#bc-coop-open')?.addEventListener('click', openCoopForm);
      root.querySelector('#bc-publish-trade')?.addEventListener('click', publishTrade);
    },
  };
}

export default { renderBrainco };
