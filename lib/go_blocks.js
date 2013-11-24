'use strict';

var chans = require('./channels'),
    FnHandler = chans.FnHandler,
    util = require('./util');

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
  take: take,
  put: put,
  alts: alts,
  _stubShuffle: _stubShuffle
};
