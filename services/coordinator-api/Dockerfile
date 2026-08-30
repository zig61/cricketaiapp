# Deploy target confirmed working on Render (2026-08-30). One real fix needed:
# this package is an npm-workspaces member (root package.json declares
# "workspaces": ["apps/mobile", "services/coordinator-api"]) — npm workspaces
# only ever have ONE lockfile, at the repo root, so `package-lock.json*` here
# has always matched nothing, and `npm ci` (which requires an exact lockfile)
# failed hard as soon as this was actually built for the first time. `npm
# install` doesn't have that requirement, so it works standalone regardless.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist

EXPOSE 8080
CMD ["node", "dist/index.js"]
