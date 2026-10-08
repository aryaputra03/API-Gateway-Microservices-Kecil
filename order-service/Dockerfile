FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4004

# Salin package*.json dulu: layer "npm ci" ter-cache selama dependensi tidak berubah
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# Jalankan sebagai user biasa, bukan root
USER node

EXPOSE 4004

# Container dianggap "sehat" jika /health menjawab 200
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]