FROM node:20-alpine

WORKDIR /app

# Install dependencies (including dev: nodemon, ts-node, etc.)
COPY package*.json ./
RUN npm install

# Copy prisma schema and generate client before source mount
COPY prisma ./prisma
RUN npx prisma generate

EXPOSE 5001

CMD ["npm", "run", "dev"]
