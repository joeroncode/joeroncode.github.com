FROM node:22-alpine AS base
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/api/package.json services/api/package.json
COPY services/vision/package.json services/vision/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
RUN npm install --workspaces --if-present --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY services/api services/api
RUN npm run build -w @ordercheck/shared
RUN npm run prisma:generate -w @ordercheck/api
RUN npm run build -w @ordercheck/api

EXPOSE 4000
CMD ["node", "services/api/dist/index.js"]
