COMPILER := ./node_modules/.bin/browserify -t regeneratorify

all: test/tests.js examples/build/robpike.js examples/build/timeout.js

test: test/tests.js

test/tests.js: index.js test/index_test.js
	$(COMPILER) test/index_test.js > test/tests.js

examples/build/robpike.js: examples/robpike.js index.js
	$(COMPILER) examples/robpike.js > examples/build/robpike.js

examples/build/timeout.js: examples/timeout.js index.js
	$(COMPILER) examples/timeout.js > examples/build/timeout.js
