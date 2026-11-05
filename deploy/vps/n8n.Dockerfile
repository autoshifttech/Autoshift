# n8n with the AutoShift node preinstalled. Build context: the repository root.
FROM node:22-alpine AS build
WORKDIR /build
COPY n8n-nodes-autoshift/package.json n8n-nodes-autoshift/package-lock.json ./
RUN npm ci
COPY n8n-nodes-autoshift/ ./
RUN npm run build

FROM docker.n8n.io/n8nio/n8n:stable
# dist/ holds the node files; node_modules/ beside it lets them load n8n-workflow.
COPY --from=build --chown=node:node /build/dist /opt/autoshift-n8n/dist
COPY --from=build --chown=node:node /build/node_modules /opt/autoshift-n8n/node_modules
ENV N8N_CUSTOM_EXTENSIONS=/opt/autoshift-n8n/dist
