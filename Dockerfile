# ===========================
# 1️⃣ Build stage
# ===========================
FROM node:20-alpine AS builder

ARG POSTGRES_USER
ARG POSTGRES_PASSWORD
ARG PORT

ENV POSTGRES_USER=$POSTGRES_USER
ENV POSTGRES_PASSWORD=$POSTGRES_PASSWORD
ENV PORT=$PORT

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

# ===========================
# 2️⃣ Production stage
# ===========================
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

RUN npm install --omit=dev

EXPOSE 5000

CMD ["node", "dist/index.js", "&&", "node", "dist/cron.js"]