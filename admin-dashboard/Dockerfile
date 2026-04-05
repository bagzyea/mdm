FROM node:18-alpine

WORKDIR /app

# Install all dependencies (including dev: vite, typescript, etc.)
COPY package*.json ./
RUN npm install

EXPOSE 5000

CMD ["npm", "run", "dev"]
