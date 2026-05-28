# Use official Node.js image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first (for caching)
COPY package*.json ./

# Install dependencies
RUN npm install -g expo-cli
RUN npm install

# Copy the rest of the frontend source files
COPY . .

# Expose ports used by Expo
EXPOSE 19000 19001 19002

# Start Expo in tunnel mode
CMD ["npx", "expo", "start", "--tunnel"]