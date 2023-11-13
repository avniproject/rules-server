FROM node:10

COPY . rules-server/
RUN cd rules-server && npm install
CMD cd rules-server && npm start