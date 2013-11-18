'use strict';

var slice = Array.prototype.slice;

function extend(obj /* , rest... */) {
  var rest = slice.call(arguments, 1);
  var source;

  for (var i = 0, j = rest.length; i < j; i++) {
    source = rest[i];
    if (source) {
      for (var prop in source) {
        obj[prop] = source[prop];
      }
    }
  }

  return obj;
}

module.exports = {
  extend: extend
};
