'use strict';

var buffers = require('./lib/buffers');
require('setimmediate');

var MAX_DIRTY = 64;
var MAX_QUEUE_SIZE = 1024;

function buffer(size) {
  return buffers.fixedBuffer(size);
}

function chan(bufferOrN) {
  var buf;
  if (!bufferOrN) {
    buf = null;
  } else if (typeof bufferOrN === 'number') {
    buf = buffer(bufferOrN);
  } else {
    buf = bufferOrN;
  }

  return {
    buffer: buf,
    puts: buffers.ringBuffer(32),
    dirtyPuts: 0,
    takes: buffers.ringBuffer(32),
    dirtyTakes: 0,
    isClosed: false
  };
}

function AltFlag() {
  this._isActive = true;
}

AltFlag.prototype.commit = function() {
  this._isActive = false;
  return true;
};

AltFlag.prototype.isActive = function() {
  return this._isActive;
};

function AltHandler(flag, callback) {
  this._flag = flag;
  this._callback = callback;
}

AltHandler.prototype.isActive = function() {
  return this._flag.isActive();
};

AltHandler.prototype.commit = function() {
  this._flag.commit();
  return this._callback;
};

function FnHandler(callback) {
  this._callback = callback;
}

FnHandler.prototype.isActive = function() {
  return true;
};

FnHandler.prototype.commit = function() {
  return this._callback;
};

function channelTake(channel, handler) {
  if (!handler.isActive()) return {immediate: false};

  var buffer = channel.buffer;
  var puts = channel.puts;
  var takes = channel.takes;

  if (buffer && buffer.count() > 0) {
    handler.commit();
    return {immediate: true, value: buffer.remove()};
  } else {
    var putter = puts.pop();
    while (putter) {
      if (putter.handler.isActive()) {
        var callback = putter.handler.commit();
        handler.commit();
        setImmediate(callback);
        return {immediate: true, value: putter.value};
      } else {
        putter = puts.pop();
      }
    }

    if (channel.isClosed) {
      handler.commit();
      return {immediate: true, value: null};
    } else {
      if (channel.dirtyTakes > MAX_DIRTY) {
        channel.dirtyTakes = 0;
        takes.cleanup(function(handler) { return handler.isActive(); });
      } else {
        channel.dirtyTakes++;
      }

      if (takes.length >= MAX_QUEUE_SIZE) {
        throw new Error('No more than ' + MAX_QUEUE_SIZE + ' pending takes ' +
                        'are allowed on a single channel.');
      }

      takes.unboundedUnshift(handler);
      return {immediate: false};
    }
  }
}

function takeAsync(channel, onComplete, onCaller) {
  if (typeof onCaller === 'undefined') onCaller = true;

  var result = channelTake(channel, new FnHandler(onComplete));
  if (result.immediate) {
    if (onCaller) {
      onComplete(result.value);
    } else {
      setImmediate(function() { onComplete(result.value); });
    }
  }
}

function channelPut(channel, value, handler) {
  if (channel.isClosed || !handler.isActive()) {
    return {immediate: true};
  }

  var buffer = channel.buffer;
  var takes = channel.takes;
  var puts = channel.puts;

  var taker = takes.pop();
  while (taker) {
    if (taker.isActive()) {
      var callback = taker.commit();
      handler.commit();
      setImmediate(function() { callback(value); });
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
    if (channel.dirtyPuts > MAX_DIRTY) {
      channel.dirtyPuts = 0;
      puts.cleanup(function(putter) {
        return putter.handler.isActive();
      });
    } else {
      channel.dirtyPuts++;
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
}

function noOp() {}

function putAsync(channel, value, onComplete, onCaller) {
  if (typeof onCaller === 'undefined') onCaller = true;
  if (!onComplete) onComplete = noOp;

  var result = channelPut(channel, value, new FnHandler(onComplete));
  if (result.immediate) {
    if (onCaller) {
      onComplete();
    } else {
      setImmediate(onComplete);
    }
  }
}

function go(block) {
  var machine = {gen: block(), ret: chan()};
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
    putAsync(machine.ret, retValue, function() {
      close(machine.ret);
    });
  }
}

var operations = {
  take: function(machine, instruction) {
    var channel = instruction.channel;
    var handler = new FnHandler(function(val) {
      runMachine(machine, val);
    });
    var result = channelTake(channel, handler);

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
    var result = channelPut(channel, value, handler);

    if (result.immediate) {
      return {state: 'continue'};
    } else {
      return {state: 'park'};
    }
  },

  alts: function(machine, instruction) {
    var channels = instruction.channels;
    var len = channels.length;
    var shuffle = module.exports._shuffle;
    var order = (instruction.priority ? range(len) : shuffle(range(len)));
    var flag = new AltFlag;
    var handler;
    var result;

    for (var i = 0; i < len; i++) {
      var channel = channels[order[i]];

      if (Array.isArray(channel)) {
        var putChan = channel[0];
        var putValue = channel[1];
        handler = new AltHandler(flag, function() {
          var put = {chan: putChan, value: null};
          runMachine(machine, put);
        });
        result = channelPut(putChan, putValue, handler);

        if (result.immediate) {
          var put = {chan: putChan, value: null};
          return {state: 'continue', value: put};
        }
      } else {
        handler = new AltHandler(flag, function(val) {
          var taken = {chan: channel, value: val};
          runMachine(machine, taken);
        });
        result = channelTake(channel, handler);

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

function range(size) {
  var ints = [];

  for (var i = 0; i < size; i++) {
    ints[i] = i;
  }

  return ints;
}

function shuffle(array) {
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

function timeout(duration) {
  var c = chan();
  setTimeout(function() { close(c); }, duration);
  return c;
}

function close(channel) {
  channel.isClosed = true;

  var takes = channel.takes;
  var taker = takes.pop();

  while (taker) {
    if (taker.isActive()) {
      var callback = taker.commit();
      setImmediate(function() { callback(null); });
      break;
    }

    taker = takes.pop();
  }
}

module.exports = {
  chan: chan,
  buffer: buffer,
  slidingBuffer: buffers.slidingBuffer,
  droppingBuffer: buffers.droppingBuffer,
  putAsync: putAsync,
  takeAsync: takeAsync,
  go: go,
  put: put,
  take: take,
  alts: alts,
  timeout: timeout,
  close: close,
  _shuffle: shuffle
};
