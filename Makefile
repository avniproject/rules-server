clean:
	rm -rf node_modules

deps:
	npm install

start:
	npm start
	#ENV='UTC' npm start

tests:
	npm test

test: tests

zip-app:
	npm install
	make zip-app-only

zip-app-only:
	-rm rules-server.tgz
	tar -czvf rules-server.tgz  -C ../rules-server .
