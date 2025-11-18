FROM node:20-alpine
WORKDIR /app
# Configure npm to handle certificate issues in CI/corporate environments
RUN npm config set strict-ssl false || true
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["node", "generator.js"]
