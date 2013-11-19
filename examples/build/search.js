;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// This function simulates a search request to a remote source, such as an HTTP
// request to Google.
function fakeRemoteSearch(query) {
  var latency = (Math.random() * 200);
  return CSP.go(wrapGenerator.mark(function() {
    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        $ctx.next = 2;
        return CSP.take(CSP.timeout(latency));
      case 2:
        $ctx.rval = {query: query, latency: latency};
        delete $ctx.thrown;
        $ctx.next = 6;
        break;
      case 6:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));
}

function performSearch(n) {
  return CSP.go(wrapGenerator.mark(function() {
    var timeout, search, result;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        timeout = CSP.timeout(100);
        search = fakeRemoteSearch('javascript ' + n);
        $ctx.next = 4;
        return CSP.alts([search, timeout]);
      case 4:
        result = $ctx.sent;

        if (!(result.chan === search)) {
          $ctx.next = 12;
          break;
        }

        $ctx.rval = result.value;
        delete $ctx.thrown;
        $ctx.next = 16;
        break;
      case 12:
        $ctx.rval = 'timeout';
        delete $ctx.thrown;
        $ctx.next = 16;
        break;
      case 16:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));
}

// On average, half the searches will complete and half will time out.
CSP.go(wrapGenerator.mark(function() {
  var i;

  return wrapGenerator(function($ctx) {
    while (1) switch ($ctx.next) {
    case 0:
      i = 0;
    case 1:
      if (!(i < 10)) {
        $ctx.next = 9;
        break;
      }

      $ctx.next = 4;
      return CSP.take(performSearch(i));
    case 4:
      $ctx.t0 = $ctx.sent;
      console.log($ctx.t0);
    case 6:
      i++;
      $ctx.next = 1;
      break;
    case 9:
    case "end":
      return $ctx.stop();
    }
  }, this);
}));

},{}]},{},[1])
;