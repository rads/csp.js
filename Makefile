COMPILER := ./node_modules/.bin/browserify -t regeneratorify-no-runtime
COMPILER_STANDALONE := ./node_modules/.bin/browserify -t regeneratorify-no-runtime --standalone CSP

test: test/browser_tests.js

all: test/browser_tests.js examples/build/robpike.js examples/build/timeout.js examples/build/search.js csp.js csp.min.js

clean:
	rm -rf examples/build/*
	rm -f csp.js csp.min.js test/browser_tests.js

csp.js: index.js lib
	$(COMPILER_STANDALONE) index.js > csp.js

csp.min.js: index.js lib
	./node_modules/.bin/uglifyjs csp.js > csp.min.js

test/browser_tests.js: index.js lib test/index_test.js
	$(COMPILER) test/index_test.js > test/browser_tests.js

examples/build/robpike.js: examples/robpike.js index.js lib
	$(COMPILER) examples/robpike.js > examples/build/robpike.js

examples/build/timeout.js: examples/timeout.js index.js lib
	$(COMPILER) examples/timeout.js > examples/build/timeout.js

examples/build/search.js: examples/search.js index.js lib
	$(COMPILER) examples/search.js > examples/build/search.js
