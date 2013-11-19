var go = CSP.go,
    timeout = CSP.timeout,
    take = CSP.take;

go(function*() {
  yield take(timeout(1000));
  console.log('Hello');
  yield take(timeout(1000));
  console.log('async');
  yield take(timeout(1000));
  console.log('world!');
});
