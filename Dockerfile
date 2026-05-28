# syntax=docker/dockerfile:1.7

FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache openssl tini

ENV PORT=3000

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN yarn prisma:generate
RUN yarn build

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/src/main.js"]
