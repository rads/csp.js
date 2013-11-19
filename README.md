# CSP.js

This library provides CSP primitives for vanilla JavaScript. If you've used Clojure's [core.async](https://github.com/clojure/core.async) before, picking up CSP.js is easy.

## Usage

CSP.js requires ES6 generators. If you want to use this library in the browser, you'll have to compile your code with [Regenerator](https://github.com/facebook/regenerator).

## Example

This example can be found in [examples/search.js](https://github.com/rads/csp.js/blob/master/examples/search.js).

    var c = require('csp.js');

    // This function simulates a search request to a remote source, such as an HTTP
    // request to Google.
    function fakeRemoteSearch(query) {
      var latency = (Math.random() * 200);
      return c.go(function*() {
        yield c.take(c.timeout(latency));
        return {query: query, latency: latency};
      });
    }

    function performSearch(n) {
      return c.go(function*() {
        // Closes after 100 ms.
        var timeout = c.timeout(100);
        // Provides a value after 0-200 ms.
        var search = fakeRemoteSearch('javascript ' + n);

        // Choose whatever channel provides a value or closes first.
        var result = yield c.alts([search, timeout]);
        if (result.chan === search) {
          return result.value;
        } else {
          return 'timeout';
        }
      });
    }

    // On average, half the searches will complete and half will time out.
    c.go(function*() {
      for (var i = 0; i < 10; i++) {
        console.log(yield c.take(performSearch(i)));
      }
    });

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
  - Add mult, tap, untap, untapAll
  - Add mix, admix, unmix, unmixAll, toggle, soloMode
  - Add pub, sub, unsub, unsubAll
- Optimize for speed and file size
- Test for compatibility in IE

## License

CSP.js is released under the [MIT License](http://www.opensource.org/licenses/MIT).
