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
