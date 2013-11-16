var csp = require('../'),
    go = csp.go,
    timeout = csp.timeout,
    take = csp.take;

go(function*() {
  yield take(timeout(1000));
  console.log('Hello');
  yield take(timeout(1000));
  console.log('async');
  yield take(timeout(1000));
  console.log('world!');
});
