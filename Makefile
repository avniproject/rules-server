clean:
	rm -rf node_modules

deps:
	npm install

start:
	npm start
	#ENV='UTC' npm start

start-live-dev:
ifndef user
	@echo "Provde the user variable"
	exit 1
endif
ifndef password
	@echo "Provde the password variable"
	exit 1
endif
	OPENCHS_UPLOAD_USER_USER_NAME=$(user) OPENCHS_UPLOAD_USER_PASSWORD=$(password) npm start

tests:
	npm test

test: tests

zip-app:
	npm install
	make zip-app-only

zip-app-only:
	-rm rules-server.tgz
	tar -czvf rules-server.tgz  -C ../rules-server .
