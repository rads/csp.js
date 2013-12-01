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

  go(function*() {
    while (true) {
      var val = yield take(from);
      if (val === null) {
        if (shouldClose) close(to);
        break;
      } else {
        yield put(to, val);
      }
    }
  });

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

  go(function*() {
    while (true) {
      doneCount = chanCount;
      for (var j = 0; j < chanCount; j++) {
        try {
          takeAsync(channels[j], done[j]);
        } catch (e) {
          doneCount--;
        }
      }

      var localRets = yield take(doneChan);
      var someNull = false;
      for (var k = 0, l = localRets.length; k < l; k++) {
        if (rets[k] === null) {
          someNull = true;
          break;
        }
      }

      if (someNull) {
        close(out);
        break;
      } else {
        yield put(out, fn.apply(null, localRets));
      }
    }
  });

  return out;
}

function reduce(channel, init, fn) {
  var ret = init;

  return go(function*() {
    while (true) {
      var val = yield take(channel);
      if (val === null) {
        return ret;
      } else {
        ret = fn(ret, val);
      }
    }
  });
}

function merge(channels, bufOrN) {
  if (typeof bufOrN === 'undefined') bufOrN = null;

  var out = chan(bufOrN);

  go(function*() {
    var currentChans = channels;
    var result, newChans, ch, i, j;

    while (true) {
      if (currentChans.length > 0) {
        result = yield alts(currentChans);

        if (result.value === null) {
          newChans = [];

          for (i = 0, j = currentChans.length; i < j; i++) {
            ch = currentChans[i];
            if (ch !== result.chan) newChans.push(ch);
          }

          currentChans = newChans;
        } else {
          yield put(out, result.value);
        }
      } else {
        close(out);
      }
    }
  });

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

  go(function*() {
    var x = 0;
    var val;

    while (true) {
      if (x < n) {
        val = yield take(channel);

        if (val === null) {
          break;
        } else {
          yield put(out, val);
          x++;
        }
      } else {
        break;
      }
    }

    close(out);
  });

  return out;
}

function unique(channel, bufOrN) {
  if (typeof bufOrN === 'undefined') bufOrN = null;

  var out = chan(bufOrN);

  go(function*() {
    var last = null;
    var val;

    while (true) {
      val = yield take(channel);
      if (val !== null) {
        if (val !== last) {
          yield put(out, val);
          last = val;
        }
      } else {
        break;
      }
    }

    close(out);
  });

  return out;
}

function partition(channel, n, bufOrN) {
  if (typeof bufOrN === 'undefined') bufOrN = null;

  var out = chan(bufOrN);

  go(function*() {
    var arr = new Array(n);
    var idx = 0;
    var val, newIdx;

    while (true) {
      val = yield take(channel);
      if (val !== null) {
        arr[idx] = val;
        newIdx = (idx + 1);

        if (newIdx < n) {
          idx = newIdx;
        } else {
          yield put(out, arr);
          arr = new Array(n);
          idx = 0;
        }
      } else {
        if (idx > 0) {
          while (idx < n) {
            arr[idx] = null;
            idx++;
          }
          yield put(out, arr);
        }

        close(out);
        break;
      }
    }
  });

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

  go(function*() {
    var arr = [];
    var last = NOTHING;
    var val, newItem;

    while (true) {
      val = yield take(channel);
      if (val !== null) {
        newItem = fn(val);

        if (newItem === last || last === NOTHING) {
          arr.push(val);
        } else {
          yield put(out, arr);
          arr = [val];
        }

        last = newItem;
      } else {
        if (arr.length > 0) yield put(out, arr);
        close(out);
        break;
      }
    }
  });

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

  go(function*() {
    var val;

    while (true) {
      val = yield take(channel);
      if (val !== null) {
        if (fn(val)) yield put(out, val);
      } else {
        close(out);
        break;
      }
    }
  });

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
  return go(function*() {
    var val, vals, i, j;

    while (true) {
      val = yield take(inChan);
      if (val !== null) {
        vals = fn(val);
        for (i = 0, j = vals.length; i < j; i++) {
          yield put(outChan, vals[i]);
        }
      } else {
        close(outChan);
        break;
      }
    }
  });
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

  go(function*() {
    var val, dest;

    while (true) {
      val = yield take(channel);
      if (val !== null) {
        dest = (fn(val) ? pass : fail);
        yield put(dest, val);
      } else {
        close(pass);
        close(fail);
        break;
      }
    }
  });

  return {pass: pass, fail: fail};
}

function ontoChan(channel, array, shouldClose) {
  if (typeof shouldClose === 'undefined') shouldClose = true;

  go(function*() {
    for (var i = 0, j = array.length; i < j; i++) {
      yield put(channel, array[i]);
    }

    if (shouldClose) close(channel);
  });
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

  go(function*() {
    var val;

    while (true) {
      val = yield take(channel);

      if (val !== null) {
        doneCount = util.keys(m.outChans).length;
        if (doneCount === 0) continue;

        util.each(m.outChans, function(out) {
          try {
            putAsync(out.chan, val, done);
          } catch (e) {
            doneCount--;
            untap(m, out.chan);
          }
        });

        yield take(doneChan);
      } else {
        util.each(m.outChans, function(out, k) {
          if (out.shouldClose) close(out.chan);
        });
        break;
      }
    }
  });

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

  go(function*() {
    var val, topic, m;

    while (true) {
      val = yield take(channel);

      if (val !== null) {
        topic = topicFn(val);
        m = p.mults[topic];

        if (!m) continue;

        try {
          yield put(m.muxChan, val);
        } catch (e) {
          delete p.mults[topic];
        }
      } else {
        util.each(p.mults, function(val, key) {
          close(val.muxChan);
        });
        break;
      }
    }
  });

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
