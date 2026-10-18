FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4002

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
USER node

EXPOSE 4002

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
