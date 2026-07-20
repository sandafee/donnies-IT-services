FROM node:24-slim

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

# Expose backend port
EXPOSE 8080

# Environment variables
ENV PORT=8080
ENV NODE_ENV=production

# Run database setup & start server
CMD ["node", "server.js"]
