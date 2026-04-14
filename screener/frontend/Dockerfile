# Frontend Dockerfile
# Stage 1: Build
FROM node:18 AS build

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Build the app
COPY . .
# Note: VITE_API_URL is handled by Nginx reverse proxy in this setup
RUN npm run build

# Stage 2: Serve
FROM nginx:stable-alpine

# Copy build artifacts to Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
