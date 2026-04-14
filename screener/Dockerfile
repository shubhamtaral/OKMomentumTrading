# Production Dockerfile - PostgreSQL Optimized
FROM node:18-slim

# Install essential runtime tools
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Copy app source
COPY . .

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check to ensure API is responsive
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["node", "server.js"]
