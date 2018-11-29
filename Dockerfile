FROM node:10
RUN mkdir /app
WORKDIR /app
COPY . /app
RUN npm i
CMD ['node', 'run.js']
