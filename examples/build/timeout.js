;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var go = CSP.go,
    timeout = CSP.timeout,
    take = CSP.take;

go(wrapGenerator.mark(function() {
  return wrapGenerator(function($ctx) {
    while (1) switch ($ctx.next) {
    case 0:
      $ctx.next = 2;
      return take(timeout(1000));
    case 2:
      console.log('Hello');
      $ctx.next = 5;
      return take(timeout(1000));
    case 5:
      console.log('async');
      $ctx.next = 8;
      return take(timeout(1000));
    case 8:
      console.log('world!');
    case 9:
    case "end":
      return $ctx.stop();
    }
  }, this);
}));

},{}]},{},[1])
;