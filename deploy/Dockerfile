# 小鱼来了 —— 生产镜像（零依赖，无需 npm install）
FROM node:20-alpine

LABEL org.opencontainers.image.title="xiaoyu-laile" \
      org.opencontainers.image.description="小鱼来了 · AI 信息发布平台"

WORKDIR /app

# 项目自带完整运行时代码，没有任何第三方依赖
COPY package.json ./
COPY server.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

# 数据目录（集合 JSON、上传文件、日志）—— 必须挂卷持久化
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DATA_DIR=/app/data

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=6s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

STOPSIGNAL SIGTERM

CMD ["node", "server.js"]
