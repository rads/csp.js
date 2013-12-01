/*
 * CSP.js v0.3.0-dev
 * Copyright (c) 2013, Radford Smith
 * This code is released under the MIT license.
 */
!function(e){"object"==typeof exports?module.exports=e():"function"==typeof define&&define.amd?define(e):"undefined"!=typeof window?window.CSP=e():"undefined"!=typeof global?global.CSP=e():"undefined"!=typeof self&&(self.CSP=e())}(function(){var define,module,exports;
return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

var buffers = require('./lib/buffers'),
    chans = require('./lib/channels'),
    goBlocks = require('./lib/go_blocks'),
    util = require('./lib/util');

var chan = chans.chan,
    buffer = chans.defaultBuffer,
    slidingBuffer = buffers.slidingBuffer,
    droppingBuffer = buffers.droppingBuffer,
    putAsync = chans.putAsync,
    takeAsync = chans.takeAsync,
    go = goBlocks.go,
    goLoop = goBlocks.goLoop,
    take = goBlocks.take,
    put = goBlocks.put,
    alts = goBlocks.alts;

function close(channel) {
  return channel.close();
}

function timeout(duration) {
  var c = chan();
  setTimeout(function() { close(c); }, duration);
  return c;
}

function pipe(from, to, shouldClose) {
  if (typeof shouldClose === 'undefined') shouldClose = true;

  go(wrapGenerator.mark(function() {
    var val;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        if (!true) {
          $ctx.next = 15;
          break;
        }

        $ctx.next = 3;
        return take(from);
      case 3:
        val = $ctx.sent;

        if (!(val === null)) {
          $ctx.next = 11;
          break;
        }

        if (shouldClose) close(to);
        delete $ctx.thrown;
        $ctx.next = 15;
        break;
      case 11:
        $ctx.next = 13;
        return put(to, val);
      case 13:
        $ctx.next = 0;
        break;
      case 15:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));

  return to;
}

function mapPull(channel, fn) {
  return new MapPullChannel(channel, fn);
}

function MapPullChannel(channel, fn) {
  this._channel = channel;
  this._fn = fn;
}

util.extend(MapPullChannel.prototype, {
  take: function(handler) {
    var ret = this._channel.take(new MapPullHandler(handler, this._fn));

    if (ret.immediate) {
      return {immediate: true, value: this._fn(ret.value)};
    } else {
      return ret;
    }
  },

  put: function(value, handler) {
    return this._channel.put(value, handler);
  },

  close: function() {
    this._channel.close(this._channel);
  }
});

function MapPullHandler(handler, fn) {
  this._handler = handler;
  this._fn = fn;
}

util.extend(MapPullHandler.prototype, {
  isActive: function() {
    return this._handler.isActive();
  },

  commit: function() {
    var self = this;
    var callback = this._handler.commit();

    return function(val) {
      callback(val === null ? null : self._fn(val));
    };
  }
});

function mapPush(channel, fn) {
  return new MapPushChannel(channel, fn);
}

function MapPushChannel(channel, fn) {
  this._channel = channel;
  this._fn = fn;
}

util.extend(MapPushChannel.prototype, {
  take: function(handler) {
    return this._channel.take(handler);
  },

  put: function(value, handler) {
    return this._channel.put(this._fn(value), handler);
  },

  close: function() {
    return this._channel.close();
  }
});

function map(channels /* , [bufOrN,] fn */) {
  var bufOrN, fn;
  if (arguments.length === 2) {
    fn = arguments[1];
  } else if (arguments.length === 3) {
    bufOrN = arguments[1];
    fn = arguments[2];
  } else {
    throw new Error('Invalid number of arguments provided (' +
                    arguments.length +'). Expected 2 or 3');
  }

  var chanCount = channels.length;
  var rets = new Array(chanCount);
  var doneCount;
  var doneChan = chan(1);
  var out = chan(bufOrN);
  var done = [];

  function doneFn(i) {
    return function(val) {
      rets[i] = val;
      doneCount--;

      if (doneCount === 0) {
        putAsync(doneChan, rets.slice(0));
      }
    };
  }

  for (var i = 0; i < chanCount; i++) {
    done[i] = doneFn(i);
  }

  go(wrapGenerator.mark(function() {
    var j, localRets, someNull, k, l;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        if (!true) {
          $ctx.next = 28;
          break;
        }

        doneCount = chanCount;

        for (j = 0; j < chanCount; j++) {
          try {
            takeAsync(channels[j], done[j]);
          } catch (e) {
            doneCount--;
          }
        }

        $ctx.next = 5;
        return take(doneChan);
      case 5:
        localRets = $ctx.sent;
        someNull = false;
        k = 0, l = localRets.length;
      case 8:
        if (!(k < l)) {
          $ctx.next = 17;
          break;
        }

        if (!(rets[k] === null)) {
          $ctx.next = 14;
          break;
        }

        someNull = true;
        delete $ctx.thrown;
        $ctx.next = 17;
        break;
      case 14:
        k++;
        $ctx.next = 8;
        break;
      case 17:
        if (!someNull) {
          $ctx.next = 24;
          break;
        }

        close(out);
        delete $ctx.thrown;
        $ctx.next = 28;
        break;
      case 24:
        $ctx.next = 26;
        return put(out, fn.apply(null, localRets));
      case 26:
        $ctx.next = 0;
        break;
      case 28:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));

  return out;
}

function reduce(channel, init, fn) {
  var ret = init;

  return go(wrapGenerator.mark(function() {
    var val;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        if (!true) {
          $ctx.next = 14;
          break;
        }

        $ctx.next = 3;
        return take(channel);
      case 3:
        val = $ctx.sent;

        if (!(val === null)) {
          $ctx.next = 11;
          break;
        }

        $ctx.rval = ret;
        delete $ctx.thrown;
        $ctx.next = 14;
        break;
      case 11:
        ret = fn(ret, val);
      case 12:
        $ctx.next = 0;
        break;
      case 14:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));
}

function merge(channels, bufOrN) {
  if (typeof bufOrN === 'undefined') bufOrN = null;

  var out = chan(bufOrN);

  go(wrapGenerator.mark(function() {
    var currentChans, result, newChans, ch, i, j;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        currentChans = channels;
      case 1:
        if (!true) {
          $ctx.next = 19;
          break;
        }

        if (!(currentChans.length > 0)) {
          $ctx.next = 16;
          break;
        }

        $ctx.next = 5;
        return alts(currentChans);
      case 5:
        result = $ctx.sent;

        if (!(result.value === null)) {
          $ctx.next = 12;
          break;
        }

        newChans = [];

        for (i = 0, j = currentChans.length; i < j; i++) {
          ch = currentChans[i];
          if (ch !== result.chan) newChans.push(ch);
        }

        currentChans = newChans;
        $ctx.next = 14;
        break;
      case 12:
        $ctx.next = 14;
        return put(out, result.value);
      case 14:
        $ctx.next = 17;
        break;
      case 16:
        close(out);
      case 17:
        $ctx.next = 1;
        break;
      case 19:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));

  return out;
}

function intoArray(channel) {
  return reduce(channel, [], function(arr, val) {
    arr.push(val);
    return arr;
  });
}

function takeNum(channel, n, bufOrN) {
  if (typeof bufOrN === 'undefined') bufOrN = null;

  var out = chan(bufOrN);

  go(wrapGenerator.mark(function() {
    var x, val;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        x = 0;
      case 1:
        if (!true) {
          $ctx.next = 22;
          break;
        }

        if (!(x < n)) {
          $ctx.next = 17;
          break;
        }

        $ctx.next = 5;
        return take(channel);
      case 5:
        val = $ctx.sent;

        if (!(val === null)) {
          $ctx.next = 12;
          break;
        }

        delete $ctx.thrown;
        $ctx.next = 22;
        break;
      case 12:
        $ctx.next = 14;
        return put(out, val);
      case 14:
        x++;
      case 15:
        $ctx.next = 20;
        break;
      case 17:
        delete $ctx.thrown;
        $ctx.next = 22;
        break;
      case 20:
        $ctx.next = 1;
        break;
      case 22:
        close(out);
      case 23:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));

  return out;
}

function unique(channel, bufOrN) {
  if (typeof bufOrN === 'undefined') bufOrN = null;

  var out = chan(bufOrN);

  go(wrapGenerator.mark(function() {
    var last, val;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        last = null;
      case 1:
        if (!true) {
          $ctx.next = 17;
          break;
        }

        $ctx.next = 4;
        return take(channel);
      case 4:
        val = $ctx.sent;

        if (!(val !== null)) {
          $ctx.next = 12;
          break;
        }

        if (!(val !== last)) {
          $ctx.next = 10;
          break;
        }

        $ctx.next = 9;
        return put(out, val);
      case 9:
        last = val;
      case 10:
        $ctx.next = 15;
        break;
      case 12:
        delete $ctx.thrown;
        $ctx.next = 17;
        break;
      case 15:
        $ctx.next = 1;
        break;
      case 17:
        close(out);
      case 18:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));

  return out;
}

function partition(channel, n, bufOrN) {
  if (typeof bufOrN === 'undefined') bufOrN = null;

  var out = chan(bufOrN);

  go(wrapGenerator.mark(function() {
    var arr, idx, val, newIdx;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        arr = new Array(n);
        idx = 0;
      case 2:
        if (!true) {
          $ctx.next = 29;
          break;
        }

        $ctx.next = 5;
        return take(channel);
      case 5:
        val = $ctx.sent;

        if (!(val !== null)) {
          $ctx.next = 19;
          break;
        }

        arr[idx] = val;
        newIdx = (idx + 1);

        if (!(newIdx < n)) {
          $ctx.next = 13;
          break;
        }

        idx = newIdx;
        $ctx.next = 17;
        break;
      case 13:
        $ctx.next = 15;
        return put(out, arr);
      case 15:
        arr = new Array(n);
        idx = 0;
      case 17:
        $ctx.next = 27;
        break;
      case 19:
        if (!(idx > 0)) {
          $ctx.next = 23;
          break;
        }

        while (idx < n) {
          arr[idx] = null;
          idx++;
        }

        $ctx.next = 23;
        return put(out, arr);
      case 23:
        close(out);
        delete $ctx.thrown;
        $ctx.next = 29;
        break;
      case 27:
        $ctx.next = 2;
        break;
      case 29:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));

  return out;
}

var NOTHING = {};

function partitionBy(channel /* , [bufOrN,] fn */) {
  var bufOrN, fn;
  if (arguments.length === 2) {
    fn = arguments[1];
  } else if (arguments.length === 3) {
    bufOrN = arguments[1];
    fn = arguments[2];
  } else {
    throw new Error('Invalid number of arguments provided (' +
                    arguments.length +'). Expected 2 or 3');
  }

  var out = chan(bufOrN);

  go(wrapGenerator.mark(function() {
    var arr, last, val, newItem;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        arr = [];
        last = NOTHING;
      case 2:
        if (!true) {
          $ctx.next = 27;
          break;
        }

        $ctx.next = 5;
        return take(channel);
      case 5:
        val = $ctx.sent;

        if (!(val !== null)) {
          $ctx.next = 18;
          break;
        }

        newItem = fn(val);

        if (!(newItem === last || last === NOTHING)) {
          $ctx.next = 12;
          break;
        }

        arr.push(val);
        $ctx.next = 15;
        break;
      case 12:
        $ctx.next = 14;
        return put(out, arr);
      case 14:
        arr = [val];
      case 15:
        last = newItem;
        $ctx.next = 25;
        break;
      case 18:
        if (!(arr.length > 0)) {
          $ctx.next = 21;
          break;
        }

        $ctx.next = 21;
        return put(out, arr);
      case 21:
        close(out);
        delete $ctx.thrown;
        $ctx.next = 27;
        break;
      case 25:
        $ctx.next = 2;
        break;
      case 27:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));

  return out;
}

function filterPull(channel /* , [bufOrN,] fn */) {
  var bufOrN, fn;
  if (arguments.length === 2) {
    fn = arguments[1];
  } else if (arguments.length === 3) {
    bufOrN = arguments[1];
    fn = arguments[2];
  } else {
    throw new Error('Invalid number of arguments provided (' +
                    arguments.length +'). Expected 2 or 3');
  }

  var out = chan(bufOrN);

  go(wrapGenerator.mark(function() {
    var val;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        if (!true) {
          $ctx.next = 16;
          break;
        }

        $ctx.next = 3;
        return take(channel);
      case 3:
        val = $ctx.sent;

        if (!(val !== null)) {
          $ctx.next = 10;
          break;
        }

        if (!fn(val)) {
          $ctx.next = 8;
          break;
        }

        $ctx.next = 8;
        return put(out, val);
      case 8:
        $ctx.next = 14;
        break;
      case 10:
        close(out);
        delete $ctx.thrown;
        $ctx.next = 16;
        break;
      case 14:
        $ctx.next = 0;
        break;
      case 16:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));

  return out;
}

function filterPush(channel, fn) {
  return new FilterPush(channel, fn);
}

function FilterPush(channel, fn) {
  this._channel = channel;
  this._fn = fn;
}

util.extend(FilterPush.prototype, {
  take: function(handler) {
    return this._channel.take(handler);
  },

  put: function(value, handler) {
    if (this._fn(value)) {
      return this._channel.put(value, handler);
    } else {
      return {immediate: true};
    }
  },

  close: function() {
    this._channel.close();
  }
});

function complement(fn) {
  return function() {
    return !fn.apply(null, arguments);
  };
}

function removePull(channel /* , [bufOrN,] fn */) {
  var bufOrN, fn;
  if (arguments.length === 2) {
    fn = arguments[1];
  } else if (arguments.length === 3) {
    bufOrN = arguments[1];
    fn = arguments[2];
  } else {
    throw new Error('Invalid number of arguments provided (' +
                    arguments.length +'). Expected 2 or 3');
  }


  if (bufOrN) {
    return filterPull(channel, bufOrN, complement(fn));
  } else {
    return filterPull(channel, complement(fn));
  }
}

function removePush(channel, fn) {
  return filterPush(channel, complement(fn));
}

function mapcat_(inChan, outChan, fn) {
  return go(wrapGenerator.mark(function() {
    var val, vals, i, j;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        if (!true) {
          $ctx.next = 21;
          break;
        }

        $ctx.next = 3;
        return take(inChan);
      case 3:
        val = $ctx.sent;

        if (!(val !== null)) {
          $ctx.next = 15;
          break;
        }

        vals = fn(val);
        i = 0, j = vals.length;
      case 7:
        if (!(i < j)) {
          $ctx.next = 13;
          break;
        }

        $ctx.next = 10;
        return put(outChan, vals[i]);
      case 10:
        i++;
        $ctx.next = 7;
        break;
      case 13:
        $ctx.next = 19;
        break;
      case 15:
        close(outChan);
        delete $ctx.thrown;
        $ctx.next = 21;
        break;
      case 19:
        $ctx.next = 0;
        break;
      case 21:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));
}

function mapcatPull(inChan /* , [bufOrN,] fn */) {
  var bufOrN, fn;
  if (arguments.length === 2) {
    fn = arguments[1];
  } else if (arguments.length === 3) {
    bufOrN = arguments[1];
    fn = arguments[2];
  } else {
    throw new Error('Invalid number of arguments provided (' +
                    arguments.length +'). Expected 2 or 3');
  }

  var outChan = chan(bufOrN);
  mapcat_(inChan, outChan, fn);
  return outChan;
}

function mapcatPush(outChan /* , [bufOrN,] fn */) {
  var bufOrN, fn;
  if (arguments.length === 2) {
    fn = arguments[1];
  } else if (arguments.length === 3) {
    bufOrN = arguments[1];
    fn = arguments[2];
  } else {
    throw new Error('Invalid number of arguments provided (' +
                    arguments.length +'). Expected 2 or 3');
  }

  var inChan = chan(bufOrN);
  mapcat_(inChan, outChan, fn);
  return inChan;
}

function split(channel /* , [passBufOrN, failBufOrN,] fn */) {
  var passBufOrN, failBufOrN, fn;
  if (arguments.length === 2) {
    fn = arguments[1];
  } else if (arguments.length === 4) {
    passBufOrN = arguments[1];
    failBufOrN = arguments[2];
    fn = arguments[3];
  } else {
    throw new Error('Invalid number of arguments provided (' +
                    arguments.length +'). Expected 2 or 4');
  }

  var pass = chan(passBufOrN);
  var fail = chan(failBufOrN);

  go(wrapGenerator.mark(function() {
    var val, dest;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        if (!true) {
          $ctx.next = 17;
          break;
        }

        $ctx.next = 3;
        return take(channel);
      case 3:
        val = $ctx.sent;

        if (!(val !== null)) {
          $ctx.next = 10;
          break;
        }

        dest = (fn(val) ? pass : fail);
        $ctx.next = 8;
        return put(dest, val);
      case 8:
        $ctx.next = 15;
        break;
      case 10:
        close(pass);
        close(fail);
        delete $ctx.thrown;
        $ctx.next = 17;
        break;
      case 15:
        $ctx.next = 0;
        break;
      case 17:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));

  return {pass: pass, fail: fail};
}

function ontoChan(channel, array, shouldClose) {
  if (typeof shouldClose === 'undefined') shouldClose = true;

  go(wrapGenerator.mark(function() {
    var i, j;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        i = 0, j = array.length;
      case 1:
        if (!(i < j)) {
          $ctx.next = 7;
          break;
        }

        $ctx.next = 4;
        return put(channel, array[i]);
      case 4:
        i++;
        $ctx.next = 1;
        break;
      case 7:
        if (shouldClose) close(channel);
      case 8:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));
}

function toChan(array) {
  var len = array.length;
  var channel = chan((len > 100) ? 100 : len);

  ontoChan(channel, array);

  return channel;
}

function mult(channel) {
  var m = {outChans: {}, muxChan: channel};
  var doneChan = chan(1);
  var doneCount;

  function done() {
    doneCount--;
    if (doneCount === 0) putAsync(doneChan, true);
  }

  go(wrapGenerator.mark(function() {
    var val;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        if (!true) {
          $ctx.next = 21;
          break;
        }

        $ctx.next = 3;
        return take(channel);
      case 3:
        val = $ctx.sent;

        if (!(val !== null)) {
          $ctx.next = 15;
          break;
        }

        doneCount = util.keys(m.outChans).length;

        if (!(doneCount === 0)) {
          $ctx.next = 10;
          break;
        }

        delete $ctx.thrown;
        $ctx.next = 0;
        break;
      case 10:
        util.each(m.outChans, function(out) {
          try {
            putAsync(out.chan, val, done);
          } catch (e) {
            doneCount--;
            untap(m, out.chan);
          }
        });

        $ctx.next = 13;
        return take(doneChan);
      case 13:
        $ctx.next = 19;
        break;
      case 15:
        util.each(m.outChans, function(out, k) {
          if (out.shouldClose) close(out.chan);
        });

        delete $ctx.thrown;
        $ctx.next = 21;
        break;
      case 19:
        $ctx.next = 0;
        break;
      case 21:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));

  return m;
}

function tap(mult, channel, shouldClose) {
  if (typeof shouldClose === 'undefined') shouldClose = true;

  mult.outChans[channel._id] = {chan: channel, shouldClose: shouldClose};
}

function untap(mult, channel) {
  delete mult.outChans[channel._id];
}

function untapAll(mult, channel) {
  mult.outChans = {};
}

function constantlyNull() {
  return null;
}

function pub(channel, topicFn, bufFn) {
  if (typeof bufFn === 'undefined') bufFn = constantlyNull;

  var p = {mults: {}, bufFn: bufFn};

  go(wrapGenerator.mark(function() {
    var val, topic, m;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        if (!true) {
          $ctx.next = 29;
          break;
        }

        $ctx.next = 3;
        return take(channel);
      case 3:
        val = $ctx.sent;

        if (!(val !== null)) {
          $ctx.next = 23;
          break;
        }

        topic = topicFn(val);
        m = p.mults[topic];

        if (!!m) {
          $ctx.next = 11;
          break;
        }

        delete $ctx.thrown;
        $ctx.next = 0;
        break;
      case 11:
        $ctx.pushTry(17, null, null);
        $ctx.next = 14;
        return put(m.muxChan, val);
      case 14:
        $ctx.popCatch(17);
        $ctx.next = 21;
        break;
      case 17:
        $ctx.popCatch(17);
        $ctx.t0 = $ctx.thrown;
        delete $ctx.thrown;
        delete p.mults[topic];
      case 21:
        $ctx.next = 27;
        break;
      case 23:
        util.each(p.mults, function(val, key) {
          close(val.muxChan);
        });

        delete $ctx.thrown;
        $ctx.next = 29;
        break;
      case 27:
        $ctx.next = 0;
        break;
      case 29:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));

  return p;
}

function sub(pub, topic, channel, shouldClose) {
  if (typeof shouldClose === 'undefined') shouldClose = true;

  if (!pub.mults[topic]) {
    pub.mults[topic] = mult(chan(pub.bufFn(topic)));
  }

  tap(pub.mults[topic], channel, shouldClose);
}

function unsub(pub, topic, channel) {
  var mult = pub.mults[topic];
  if (mult) untap(mult, channel);
}

function unsubAll(pub, topic) {
  if (topic) {
    delete pub.mults[topic];
  } else {
    pub.mults = {};
  }
}

module.exports = {
  chan: chan,
  buffer: buffer,
  slidingBuffer: slidingBuffer,
  droppingBuffer: droppingBuffer,
  putAsync: putAsync,
  takeAsync: takeAsync,
  close: close,
  go: go,
  goLoop: goLoop,
  put: put,
  take: take,
  alts: alts,
  timeout: timeout,
  pipe: pipe,
  mapPull: mapPull,
  mapPush: mapPush,
  map: map,
  reduce: reduce,
  merge: merge,
  intoArray: intoArray,
  takeNum: takeNum,
  unique: unique,
  partition: partition,
  partitionBy: partitionBy,
  filterPull: filterPull,
  filterPush: filterPush,
  removePull: removePull,
  removePush: removePush,
  mapcatPull: mapcatPull,
  mapcatPush: mapcatPush,
  split: split,
  ontoChan: ontoChan,
  toChan: toChan,
  mult: mult,
  tap: tap,
  untap: untap,
  untapAll: untapAll,
  pub: pub,
  sub: sub,
  unsub: unsub,
  unsubAll: unsubAll,

  // Used for testing only
  _stubShuffle: goBlocks._stubShuffle
};

},{"./lib/buffers":2,"./lib/channels":3,"./lib/go_blocks":4,"./lib/util":5}],2:[function(require,module,exports){
'use strict';

var util = require('./util');

function arrayCopy(src, srcStart, dest, destStart, len) {
  for (var i = 0; i < len; i++) {
    dest[destStart + i] = src[srcStart + i];
  }
}

function ringBuffer(size) {
  return new RingBuffer(size);
}

function RingBuffer(size) {
  this._head = 0;
  this._tail = 0;
  this.length = 0;
  this._arr = new Array(size);
}

util.extend(RingBuffer.prototype, {
  pop: function() {
    if (this.length === 0) return null;

    var x = this._arr[this._tail];
    this._arr[this._tail] = null;
    this._tail = ((this._tail + 1) % this._arr.length);
    this.length--;

    return x;
  },

  unshift: function(val) {
    this._arr[this._head] = val;
    this._head = ((this._head + 1) % this._arr.length);
    this.length++;
  },

  unboundedUnshift: function(val) {
    if ((this.length+1) === this._arr.length) {
      this.resize();
    }
    this.unshift(val);
  },

  // Doubles the size of the buffer while retaining all the existing values
  resize: function() {
    var newArr = new Array(this._arr.length * 2);

    if (this._tail < this._head) {
      arrayCopy(this._arr, this._tail, newArr, 0, this.length);
      this._tail = 0;
      this._head = this.length;
      this._arr = newArr;
    } else if (this._tail > this._head) {
      var len = (this._arr.length - this._tail);
      arrayCopy(this._arr, this._tail, newArr, 0, len);
      this._tail = 0;
      this._head = this.length;
      this._arr = newArr;
    } else if (this._tail === this._head) {
      this._tail = 0;
      this._head = 0;
      this._arr = newArr;
    }
  },

  cleanup: function(keepFn) {
    for (var i = 0, j = this.length; i < j; i++) {
      var val = this.pop();
      if (keepFn(val)) this.unshift(val);
    }
  }
});

function fixedBuffer(size) {
  return new FixedBuffer(size);
}

function FixedBuffer(size) {
  this._size = size;
  this._buffer = new RingBuffer(size);
}

util.extend(FixedBuffer.prototype, {
  add: function(val) {
    if (this.isFull()) throw new Error("Can't add to a full buffer");
    this._buffer.unshift(val);
  },

  remove: function() {
    return this._buffer.pop();
  },

  isFull: function() {
    return (this._buffer.length === this._size);
  },

  count: function() {
    return this._buffer.length;
  }
});

function droppingBuffer(size) {
  return new DroppingBuffer(size);
}

function DroppingBuffer(size) {
  this._size = size;
  this._buffer = new RingBuffer(size);
}

util.extend(DroppingBuffer.prototype, {
  isFull: function() {
    return false;
  },

  remove: function() {
    return this._buffer.pop();
  },

  add: function(val) {
    if (this._buffer.length === this._size) return;
    this._buffer.unshift(val);
  },

  count: function() {
    return this._buffer.length;
  }
});

function slidingBuffer(size) {
  return new SlidingBuffer(size);
}

function SlidingBuffer(size) {
  this._size = size;
  this._buffer = new RingBuffer(size);
}

util.extend(SlidingBuffer.prototype, {
  isFull: function() {
    return false;
  },

  remove: function() {
    return this._buffer.pop();
  },

  add: function(val) {
    if (this._buffer.length === this._size) {
      this.remove();
    }
    this._buffer.unshift(val);
  },

  count: function() {
    return this._buffer.length;
  }
});

module.exports = {
  ringBuffer: ringBuffer,
  fixedBuffer: fixedBuffer,
  droppingBuffer: droppingBuffer,
  slidingBuffer: slidingBuffer
};

},{"./util":5}],3:[function(require,module,exports){
var process=require("__browserify_process");'use strict';

var buffers = require('./buffers'),
    util = require('./util');

var MAX_DIRTY = 64;
var MAX_QUEUE_SIZE = 1024;

var dispatch = process.nextTick;

function defaultBuffer(size) {
  return buffers.fixedBuffer(size);
}

function FnHandler(callback) {
  this._callback = callback;
}

util.extend(FnHandler.prototype, {
  isActive: function() {
    return true;
  },

  commit: function() {
    return this._callback;
  }
});

function chan(bufferOrN) {
  return new Channel(bufferOrN);
}

function Channel(bufferOrN) {
  var buf;
  if (!bufferOrN) {
    buf = null;
  } else if (typeof bufferOrN === 'number') {
    buf = defaultBuffer(bufferOrN);
  } else {
    buf = bufferOrN;
  }

  this._id = util.uuid();
  this._buffer = buf;
  this._puts = buffers.ringBuffer(32);
  this._dirtyPuts = 0;
  this._takes = buffers.ringBuffer(32);
  this._dirtyTakes = 0;
  this._isClosed = false;
}

Channel.prototype.take = function(handler) {
  if (!handler.isActive()) return {immediate: false};

  var buffer = this._buffer;
  var puts = this._puts;
  var takes = this._takes;

  if (buffer && buffer.count() > 0) {
    handler.commit();
    return {immediate: true, value: buffer.remove()};
  } else {
    var putter = puts.pop();
    while (putter) {
      if (putter.handler.isActive()) {
        var callback = putter.handler.commit();
        handler.commit();
        dispatch(callback);
        return {immediate: true, value: putter.value};
      } else {
        putter = puts.pop();
      }
    }

    if (this._isClosed) {
      handler.commit();
      return {immediate: true, value: null};
    } else {
      if (this._dirtyTakes > MAX_DIRTY) {
        this._dirtyTakes = 0;
        takes.cleanup(function(handler) { return handler.isActive(); });
      } else {
        this._dirtyTakes++;
      }

      if (takes.length >= MAX_QUEUE_SIZE) {
        throw new Error('No more than ' + MAX_QUEUE_SIZE + ' pending takes ' +
                        'are allowed on a single channel.');
      }

      takes.unboundedUnshift(handler);
      return {immediate: false};
    }
  }
};

Channel.prototype.put = function(value, handler) {
  if (this._isClosed || !handler.isActive()) {
    return {immediate: true};
  }

  var buffer = this._buffer;
  var takes = this._takes;
  var puts = this._puts;

  var taker = takes.pop();
  while (taker) {
    if (taker.isActive()) {
      var callback = taker.commit();
      handler.commit();
      dispatch(function() { callback(value); });
      return {immediate: true};
    } else {
      taker = takes.pop();
    }
  }

  if (buffer && !buffer.isFull()) {
    handler.commit();
    buffer.add(value);
    return {immediate: true};
  } else {
    if (this._dirtyPuts > MAX_DIRTY) {
      this._dirtyPuts = 0;
      puts.cleanup(function(putter) {
        return putter.handler.isActive();
      });
    } else {
      this._dirtyPuts++;
    }

    if (puts.length >= MAX_QUEUE_SIZE) {
      throw new Error('No more than ' + MAX_QUEUE_SIZE + 'pending puts are ' +
                      'allowed on a single channel. Consider using a ' +
                      'windowed buffer.');
    }

    puts.unboundedUnshift({
      handler: handler,
      value: value
    });
    return {immediate: false};
  }
};

Channel.prototype.close = function() {
  this._isClosed = true;

  var takes = this._takes;
  var taker = takes.pop();
  var callback;

  while (taker) {
    if (taker.isActive()) {
      callback = taker.commit();
      // Wrap callback in an immediately executed function to prevent
      // unintended capture of var when looping.
      (function(cb) {
        dispatch(function() { cb(null); });
      })(callback);
      break;
    }

    taker = takes.pop();
  }
};

function noOp() {}

function takeAsync(channel, onComplete, onCaller) {
  if (typeof onCaller === 'undefined') onCaller = true;
  if (!onComplete) onComplete = noOp;

  var result = channel.take(new FnHandler(onComplete));
  if (result.immediate) {
    if (onCaller) {
      onComplete(result.value);
    } else {
      dispatch(function() { onComplete(result.value); });
    }
  }
}

function putAsync(channel, value, onComplete, onCaller) {
  if (typeof onCaller === 'undefined') onCaller = true;
  if (!onComplete) onComplete = noOp;

  var result = channel.put(value, new FnHandler(onComplete));
  if (result.immediate) {
    if (onCaller) {
      onComplete();
    } else {
      dispatch(onComplete);
    }
  }
}

module.exports = {
  chan: chan,
  takeAsync: takeAsync,
  putAsync: putAsync,
  defaultBuffer: defaultBuffer,
  FnHandler: FnHandler
};

},{"./buffers":2,"./util":5,"__browserify_process":6}],4:[function(require,module,exports){
'use strict';

var chans = require('./channels'),
    FnHandler = chans.FnHandler,
    util = require('./util');

function goLoop(block) {
  return go(wrapGenerator.mark(function() {
    var val;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        if (!true) {
          $ctx.next = 11;
          break;
        }

        $ctx.next = 3;
        return take(go(block));
      case 3:
        val = $ctx.sent;

        if (!(val !== null)) {
          $ctx.next = 9;
          break;
        }

        $ctx.rval = val;
        delete $ctx.thrown;
        $ctx.next = 11;
        break;
      case 9:
        $ctx.next = 0;
        break;
      case 11:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));
}

function go(block) {
  var machine = {gen: block(), ret: chans.chan()};
  runMachine(machine);
  return machine.ret;
}

function runMachine(machine, yieldVal) {
  var currentStep;
  if (typeof yieldVal !== 'undefined') {
    currentStep = machine.gen.next(yieldVal);
  } else {
    currentStep = machine.gen.next();
  }

  while (!currentStep.done) {
    var instruction = currentStep.value;
    var result = operations[instruction.op](machine, instruction);

    switch(result.state) {
      case 'park':
        return;

      case 'continue':
        if (typeof result.value === 'undefined') {
          currentStep = machine.gen.next();
        } else {
          currentStep = machine.gen.next(result.value);
        }
    }
  }

  if (currentStep.value && typeof currentStep.value.op === 'undefined') {
    var retValue = currentStep.value;
    chans.putAsync(machine.ret, retValue, function() {
      machine.ret.close();
    });
  } else {
    machine.ret.close();
  }
}

function AltFlag() {
  this._isActive = true;
}

util.extend(AltFlag.prototype, {
  isActive: function() {
    return this._isActive;
  },

  commit: function() {
    this._isActive = false;
    return true;
  }
});

function AltHandler(flag, callback) {
  this._flag = flag;
  this._callback = callback;
}

util.extend(AltHandler.prototype, {
  isActive: function() {
    return this._flag.isActive();
  },

  commit: function() {
    this._flag.commit();
    return this._callback;
  }
});


var operations = {
  take: function(machine, instruction) {
    var channel = instruction.channel;
    var handler = new FnHandler(function(val) {
      runMachine(machine, val);
    });
    var result = channel.take(handler);

    if (result.immediate) {
      return {state: 'continue', value: result.value};
    } else {
      return {state: 'park'};
    }
  },

  put: function(machine, instruction) {
    var channel = instruction.channel;
    var value = instruction.value;
    var handler = new FnHandler(function() {
      runMachine(machine);
    });
    var result = channel.put(value, handler);

    if (result.immediate) {
      return {state: 'continue'};
    } else {
      return {state: 'park'};
    }
  },

  alts: function(machine, instruction) {
    var channels = instruction.channels;
    var len = channels.length;
    var order = (instruction.priority ? range(len) : shuffle(range(len)));
    var flag = new AltFlag;
    var handler, result, channel, putChan, putValue;

    for (var i = 0; i < len; i++) {
      channel = channels[order[i]];

      if (Array.isArray(channel)) {
        putChan = channel[0];
        putValue = channel[1];
        handler = altsPutHandler(machine, putChan, flag);
        result = putChan.put(putValue, handler);

        if (result.immediate) {
          var put = {chan: putChan, value: null};
          return {state: 'continue', value: put};
        }
      } else {
        handler = altsTakeHandler(machine, channel, flag);
        result = channel.take(handler);

        if (result.immediate) {
          var taken = {chan: channel, value: result.value};
          return {state: 'continue', value: taken};
        }
      }
    }

    var hasDefault = (typeof instruction['default'] !== 'undefined');
    if (hasDefault && flag.isActive() && flag.commit()) {
      var value = {chan: 'default', value: instruction['default']};
      return {state: 'continue', value: value};
    } else {
      return {state: 'park'};
    }
  }
};

// These handlers are created in separate functions to prevent the callbacks
// from capturing variables outside of them. When the callbacks were previously
// inlined, they captured the channel variable and later executed with the
// incorrect channel.

function altsTakeHandler(machine, channel, flag) {
  return new AltHandler(flag, function(val) {
    runMachine(machine, {chan: channel, value: val});
  });
}

function altsPutHandler(machine, channel, flag) {
  return new AltHandler(flag, function() {
    runMachine(machine, {chan: channel, value: null});
  });
}

function range(size) {
  var ints = [];

  for (var i = 0; i < size; i++) {
    ints[i] = i;
  }

  return ints;
}

var shuffle = function(array) {
  var counter = array.length;
  var temp;
  var index;

  while (counter--) {
    index = (Math.random() * counter) | 0;

    temp = array[counter];
    array[counter] = array[index];
    array[index] = temp;
  }

  return array;
};

function _stubShuffle(fn) {
  var old = shuffle;
  shuffle = fn;
  return old;
}

function take(channel) {
  if (!channel) throw new Error('Called take with invalid channel');

  return {
    op: 'take',
    channel: channel
  };
}

function put(channel, value) {
  if (!channel) throw new Error('Called put with invalid channel');

  if (typeof value === 'undefined') {
    throw new Error("Called put with undefined value");
  }

  if (value === null) {
    throw new Error("Can't put null on a channel");
  }

  return {
    op: 'put',
    channel: channel,
    value: value
  };
}

function alts(channels, options) {
  if (!options) options = {};

  var instruction = {
    op: 'alts',
    channels: channels,
    priority: options.priority
  };

  if (typeof options['default'] !== 'undefined') {
    instruction['default'] = options['default'];
  }

  return instruction;
}

module.exports = {
  go: go,
  goLoop: goLoop,
  take: take,
  put: put,
  alts: alts,
  _stubShuffle: _stubShuffle
};

},{"./channels":3,"./util":5}],5:[function(require,module,exports){
'use strict';

// Helper functions copied from Underscore.js 1.5.2

var slice = Array.prototype.slice;
var nativeForEach = Array.prototype.forEach;
var nativeKeys = Object.keys;
var breaker = {};

var keys = nativeKeys || function(obj) {
  if (obj !== Object(obj)) throw new TypeError('Invalid object');
  var keys = [];
  for (var key in obj) if (obj.hasOwnProperty(key)) keys.push(key);
  return keys;
};

function each(obj, iterator, context) {
  var i, length;
  if (!obj) return;
  if (nativeForEach && obj.forEach === nativeForEach) {
    obj.forEach(iterator, context);
  } else if (obj.length === +obj.length) {
    for (i = 0, length = obj.length; i < length; i++) {
      if (iterator.call(context, obj[i], i, obj) === breaker) return;
    }
  } else {
    var ks = keys(obj);
    for (i = 0, length = ks.length; i < length; i++) {
      if (iterator.call(context, obj[ks[i]], ks[i], obj) === breaker) return;
    }
  }
}

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
  return tpl.replace(/[xy]/g, function(c) {
    var r = (d + Math.random()*16)%16 | 0;
    d = Math.floor(d/16);
    return (c=='x' ? r : (r&0x7|0x8)).toString(16);
  });
}

module.exports = {
  extend: extend,
  each: each,
  keys: keys,
  uuid: uuid
};

},{}],6:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}]},{},[1])
(1)
});
;