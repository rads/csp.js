test/tests.js: index.js test/index_test.js
	./node_modules/.bin/browserify test/index_test.js > test/tests.js
