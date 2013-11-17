require('setimmediate');

function fixedBuffer(size) {
  return {
    contents: [],
    size: size
  };
}

function chan(bufferOrN) {
  var buffer;
  if (bufferOrN) {
    buffer = fixedBuffer(bufferOrN);
  } else {
    buffer = null;
  }

  return {
    buffer: buffer,
    puts: [],
    takes: []
  };
}

function altFlag() {
  return {isActive: false};
}

function AltHandler(flag, callback) {
  this._flag = flag;
  this._callback = callback;
}

AltHandler.prototype.isActive = function() {
  return this._flag.isActive;
};

AltHandler.prototype.commit = function() {
  this._flag.isActive = false;
  return this._callback;
}

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
  var buffer = channel.buffer;
  var puts = channel.puts;
  var takes = channel.takes;

  if (buffer && buffer.contents.length) {
    handler.commit();
    return {immediate: true, value: buffer.contents.pop()};
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

    if (puts.length) {
      var put = puts.pop();
    } else {
      takes.unshift(handler);
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

  if (buffer && (buffer.contents.length < buffer.size)) {
    handler.commit();
    buffer.contents.unshift(value);
    return {immediate: true};
  } else {
    puts.unshift({
      handler: handler,
      value: value
    });
    return {immediate: false};
  }
}

function putAsync(channel, value, onComplete, onCaller) {
  if (typeof onCaller === 'undefined') onCaller = true;

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
  var machine = block();
  runMachine(machine, machine.next());
}

function runMachine(machine, startStep) {
  var currentStep = startStep;

  while (!currentStep.done) {
    var instruction = currentStep.value;
    var result = operations[instruction.op](machine, instruction);

    switch(result.state) {
      case 'park':
        return;

      case 'continue':
        if (typeof result.value === 'undefined') {
          currentStep = machine.next();
        } else {
          currentStep = machine.next(result.value);
        }
    }
  }
}

var operations = {
  take: function(machine, instruction) {
    var channel = instruction.channel;
    var handler = new FnHandler(function(val) {
      runMachine(machine, machine.next(val));
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
      runMachine(machine, machine.next());
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
    var taken;

    for (var i = 0; i < len; i++) {
      if (taken) break;

      var channel = channels[order[i]];
      var handler = new FnHandler(function(val) {
        if (taken) return;

        taken = {
          chan: channel,
          value: result.value
        };

        runMachine(machine, machine.next(taken));
      });
      var result = channelTake(channel, handler);

      if (result.immediate) {
        taken = {
          chan: channel,
          value: result.value
        };
        break;
      }
    }

    if (taken) {
      return {state: 'continue', value: taken};
    } else {
      return {state: 'park', value: null};
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
  return {
    op: 'take',
    channel: channel
  };
}

function put(channel, value) {
  if (typeof value === 'undefined') {
    throw new Error("Value was not provided to put on channel");
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

  return {
    op: 'alts',
    channels: channels,
    priority: options.priority
  };
}

function timeout(duration) {
  var c = chan(1);

  setTimeout(function() {
    go(function*() {
      while (true) {
        yield put(c, true);
      }
    });
  }, duration);

  return c;
}

module.exports = {
  chan: chan,
  putAsync: putAsync,
  takeAsync: takeAsync,
  go: go,
  put: put,
  take: take,
  alts: alts,
  timeout: timeout,
  _shuffle: shuffle
};
