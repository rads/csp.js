var chan = CSP.chan,
    go = CSP.go,
    take = CSP.take,
    put = CSP.put,
    alts = CSP.alts,
    timeout = CSP.timeout;

function randInt(size) {
  return Math.floor(Math.random() * size);
}

function fakeSearch(kind) {
  return function(c, query) {
    go(function*() {
      yield take(timeout(randInt(100)));
      yield put(c, [kind, query]);
    });
  };
}

var web1 = fakeSearch('web1');
var web2 = fakeSearch('web2');
var image1 = fakeSearch('image1');
var image2 = fakeSearch('image2');
var video1 = fakeSearch('video1');
var video2 = fakeSearch('video2');

function fastest(query /* , replicas... */) {
  var replicas = Array.prototype.slice.call(arguments, 1);
  var c = chan();

  replicas.forEach(function(replica) {
    replica(c, query);
  });

  return c;
}

function google(query) {
  var c = chan();
  var t = timeout(80);

  go(function*() { yield put(c, yield take(fastest(query, web1, web2))); });
  go(function*() { yield put(c, yield take(fastest(query, image1, image2))); });
  go(function*() { yield put(c, yield take(fastest(query, video1, video2))); });
  return go(function*() {
    var ret = [];

    for (var i = 0; i < 3; i++) {
      var result = yield alts([c, t]);
      ret.push(result.value);
    }

    return ret;
  });
}

go(function*() {
  for (var i = 0; i < 10; i++) {
    var result = yield take(google('javascript'));
    console.log.apply(console, result);
  }
});
