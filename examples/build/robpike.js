;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
    go(wrapGenerator.mark(function() {
      return wrapGenerator(function($ctx) {
        while (1) switch ($ctx.next) {
        case 0:
          $ctx.next = 2;
          return take(timeout(randInt(100)));
        case 2:
          $ctx.next = 4;
          return put(c, [kind, query]);
        case 4:
        case "end":
          return $ctx.stop();
        }
      }, this);
    }));
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

  go(wrapGenerator.mark(function() {
    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        $ctx.next = 2;
        return take(fastest(query, web1, web2));
      case 2:
        $ctx.t0 = $ctx.sent;
        $ctx.next = 5;
        return put(c, $ctx.t0);
      case 5:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));
  go(wrapGenerator.mark(function() {
    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        $ctx.next = 2;
        return take(fastest(query, image1, image2));
      case 2:
        $ctx.t1 = $ctx.sent;
        $ctx.next = 5;
        return put(c, $ctx.t1);
      case 5:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));
  go(wrapGenerator.mark(function() {
    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        $ctx.next = 2;
        return take(fastest(query, video1, video2));
      case 2:
        $ctx.t2 = $ctx.sent;
        $ctx.next = 5;
        return put(c, $ctx.t2);
      case 5:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));
  return go(wrapGenerator.mark(function() {
    var ret, i, result;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        ret = [];
        i = 0;
      case 2:
        if (!(i < 3)) {
          $ctx.next = 10;
          break;
        }

        $ctx.next = 5;
        return alts([c, t]);
      case 5:
        result = $ctx.sent;
        ret.push(result.value);
      case 7:
        i++;
        $ctx.next = 2;
        break;
      case 10:
        $ctx.rval = ret;
        delete $ctx.thrown;
        $ctx.next = 14;
        break;
      case 14:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));
}

go(wrapGenerator.mark(function() {
  var i, result;

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
      return take(google('javascript'));
    case 4:
      result = $ctx.sent;
      console.log.apply(console, result);
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