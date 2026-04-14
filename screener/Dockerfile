# Backend Dockerfile
FROM node:18

# Create app directory
WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Copy app source
COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/data

# Default environment variables
ENV PORT=3000
ENV NODE_ENV=production
ENV DB_PATH=/app/data/stocks.db

EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
