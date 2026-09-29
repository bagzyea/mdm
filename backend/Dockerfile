# Backend image. Build from the repository root:
#   docker build -f backend/Dockerfile -t mdm-backend .
#
# The repo is an npm workspace and the backend depends on @mdm/shared-types, the wire
# contract shared with the dashboard and agent. The previous image was built from
# backend/ alone, so it could only ever carry a stale copy of that package.
FROM node:20-alpine

WORKDIR /repo

COPY package.json package-lock.json ./
COPY integration/shared-types/package.json integration/shared-types/
COPY backend/package.json backend/
COPY admin-dashboard/package.json admin-dashboard/
COPY backend/prisma backend/prisma

# Backend and shared-types only; the dashboard is not part of this image.
RUN npm ci --workspace backend --workspace @mdm/shared-types --include-workspace-root --no-audit --no-fund

COPY integration/shared-types integration/shared-types
RUN npm run build --workspace @mdm/shared-types

COPY backend backend
RUN cd backend && npx prisma generate

WORKDIR /repo/backend
EXPOSE 5001
CMD ["npm", "run", "dev"]
