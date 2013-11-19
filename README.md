# CSP.js

This library provides CSP primitives for vanilla JavaScript. If you've used Clojure's [core.async](https://github.com/clojure/core.async) before, picking up CSP.js is easy.

Much thanks to the [contributors of core.async](https://github.com/clojure/core.async/graphs/contributors). Most of this library is a direct translation of core.async's Clojure code to JavaScript.

## Example

The following example can be found in [examples/search.js](https://github.com/rads/csp.js/blob/master/examples/search.js). You can try it out in the browser [at this page](http://rads.github.io/csp.js/examples/search.html) (make sure to have your console open).

    // This function simulates a search request to a remote source, such as an HTTP
    // request to Google.
    function fakeRemoteSearch(query) {
      var latency = (Math.random() * 200);
      return CSP.go(function*() {
        yield CSP.take(CSP.timeout(latency));
        return {query: query, latency: latency};
      });
    }

    function performSearch(n) {
      return CSP.go(function*() {
        // Closes after 100 ms.
        var timeout = CSP.timeout(100);
        // Provides a value after 0-200 ms.
        var search = fakeRemoteSearch('javascript ' + n);
        // Choose whatever channel provides a value or closes first.
        var result = yield CSP.alts([search, timeout]);

        if (result.chan === search) {
          return result.value;
        } else {
          return 'timeout';
        }
      });
    }

    // On average, half the searches will complete and half will time out.
    CSP.go(function*() {
      for (var i = 0; i < 10; i++) {
        console.log(yield CSP.take(performSearch(i)));
      }
    });

## Usage

CSP.js requires ES6 generators, which are not supported in browsers or in Node 0.10.x or below. Firefox has built-in support only for an old version of generators which are not compatible with CSP.js.

If you want to use this library in the browser or any version of Node.js before 0.11.x, you'll have to compile your code with [Regenerator](https://github.com/facebook/regenerator) and include its runtime. For example, if you want to run the search example, you use it like this:

    regenerator examples/search.js > examples/build/search.js

You also have to include the Regenerator runtime on the page somewhere. The runtime file is bundled with this repository as `regenerator.runtime.js` and `regenerator.runtime.min.js`. These are merely copies of the runtime files in the Regenerator repository. CSP.js has been tested with Regenerator version 0.2.10. In the end, your script tags look something like this:

    <script src="regenerator.runtime.min.js"></script>
    <script src="csp.min.js"></script>
    <script src="examples/search.js"></script>

Of course, if you're using this library in production, you'll want to concatenate all those into a single file.

If you want to use this library in Node 0.11.x or above, you don't need any compilation or an extra runtime, but you do need to set a command-line option:

    node --harmony-generators examples/search.js

## API

CSP.js is a faithful port of core.async in both API and implementation.

Documentation is still in-progress. For more details, check the [unit tests](https://github.com/rads/csp.js/blob/master/test/index_test.js) and [core.async API docs](http://clojure.github.io/core.async/) for now.

### go(function*() { ... })

### yield take(channel)

### yield put(channel, value)

### takeAsync(channel, value, onComplete)

### putAsync(channel, value, onComplete)

### close(channel)

### timeout(duration)

### pipe(from, to [, shouldClose])

### mapPull(channel, fn)

### mapPush(channel, fn)

### map(channels, [bufOrN,] fn)

### reduce(channel, init, fn)

### merge(channel [, bufOrN])

### intoArray(channel)

### takeNum(channel, n [, bufOrN])

### unique(channel [, bufOrN])

### partition(channel, n [, bufOrN])

### partitionBy(channel, [bufOrN,] fn)

### filterPull(channel, [bufOrN,] fn)

### filterPush(channel, fn)

### removePull(channel, [bufOrN,] fn)

### removePush(channel, fn)

### mapcatPull(channel, [bufOrN,] fn)

### mapcatPush(channel, [bufOrN,] fn)

### split(channel, [passBufOrN, failBufOrN,] fn)

### ontoChan(channel, array [, shouldClose])

### toChan(array)

## TODO

- More documentation
- More functions
    - mult, tap, untap, untapAll
    - mix, admix, unmix, unmixAll, toggle, soloMode
    - pub, sub, unsub, unsubAll
- Optimize for speed and file size
- Test for compatibility in IE

## License

CSP.js is released under the [MIT License](http://www.opensource.org/licenses/MIT).
