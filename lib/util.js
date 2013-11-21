'use strict';

// Helper functions copied from Underscore.js 1.5.2

var slice = Array.prototype.slice;
var nativeForEach = Array.prototype.forEach;
var nativeKeys = Object.keys;
var breaker = {};

var keys = nativeKeys || function(obj) {
  if (obj !== Object(obj)) throw new TypeError('Invalid object');
  var keys = [];
  for (var key in obj) if (_.has(obj, key)) keys.push(key);
  return keys;
};

function each(obj, iterator, context) {
  if (obj == null) return;
  if (nativeForEach && obj.forEach === nativeForEach) {
    obj.forEach(iterator, context);
  } else if (obj.length === +obj.length) {
    for (var i = 0, length = obj.length; i < length; i++) {
      if (iterator.call(context, obj[i], i, obj) === breaker) return;
    }
  } else {
    var ks = keys(obj);
    for (var i = 0, length = ks.length; i < length; i++) {
      if (iterator.call(context, obj[ks[i]], ks[i], obj) === breaker) return;
    }
  }
};

function extend(obj) {
  each(slice.call(arguments, 1), function(source) {
    if (source) {
      for (var prop in source) {
        obj[prop] = source[prop];
      }
    }
  });
  return obj;
}

// http://stackoverflow.com/a/8809472/821706
function uuid() {
  var d = new Date().getTime();
  var tpl = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  var uuid = tpl.replace(/[xy]/g, function(c) {
    var r = (d + Math.random()*16)%16 | 0;
    d = Math.floor(d/16);
    return (c=='x' ? r : (r&0x7|0x8)).toString(16);
  });
  return uuid;
}

module.exports = {
  extend: extend,
  each: each,
  keys: keys,
  uuid: uuid
};
