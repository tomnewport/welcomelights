FROM node:10
RUN apt update && apt install -y net-tools
RUN mkdir /app
WORKDIR /app
COPY . /app
RUN npm i
CMD ["node", "run.js"]
