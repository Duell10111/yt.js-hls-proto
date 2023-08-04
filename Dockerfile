FROM node:18-alpine

WORKDIR /opt/node

EXPOSE 7500

COPY ./ ./
RUN ls -l
RUN yarn install && yarn build

CMD node build/index.js
