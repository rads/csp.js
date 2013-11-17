COMPILER := ./node_modules/.bin/browserify -t regeneratorify

test: test/browser_tests.js

all: test/browser_tests.js examples/build/robpike.js examples/build/timeout.js

test/browser_tests.js: index.js lib test/index_test.js
	$(COMPILER) test/index_test.js > test/browser_tests.js

examples/build/robpike.js: examples/robpike.js index.js lib
	$(COMPILER) examples/robpike.js > examples/build/robpike.js

examples/build/timeout.js: examples/timeout.js index.js lib
	$(COMPILER) examples/timeout.js > examples/build/timeout.js
