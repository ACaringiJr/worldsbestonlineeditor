FROM ubuntu:22.04

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
      build-essential g++ nodejs npm python3 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json /app/package.json
RUN npm install --omit=dev

COPY server.js /app/server.js
EXPOSE 8080
CMD ["node", "server.js"]
