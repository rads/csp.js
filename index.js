require('setimmediate');

function chan(bufferOrN) {
  return {
    puts: [],
    takes: []
  };
}

function channelTakeSync(channel) {
  if (channel.puts.length) {
    var put = channel.puts.pop();
    put.onComplete();
    return put.value;
  } else {
    return null;
  }
}

function channelTakeAsync(channel, onComplete) {
  if (channel.puts.length) {
    setImmediate(function() {
      var put = channel.puts.pop();
      put.onComplete();
      onComplete(put.value);
    });
  } else {
    channel.takes.unshift(onComplete);
  }
}

function channelPutSync(channel, value) {
  if (channel.takes.length) {
    var take = channel.takes.pop();
    take.onComplete(value);
    return true;
  } else {
    return null;
  }
}

function channelPutAsync(channel, value, onComplete) {
  if (channel.puts.length) {
    setImmediate(function() {
      var take = channel.takes.pop();
      take.onComplete(value);
      onComplete();
    });
  } else {
    channel.puts.unshift({
      onComplete: onComplete,
      value: value
    });
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
    var result = processInstruction(machine, instruction);

    switch(result.state) {
      case 'park':
        return;

      case 'continue':
        currentStep = machine.next(result.value);
    }
  }
}

function processInstruction(machine, instruction) {
  var op = instruction.op;
  var channel = instruction.channel;
  var value = instruction.value;

  switch(op) {
    case 'take':
      var taken = channelTakeSync(channel);
      if (taken) {
        return {state: 'continue', value: taken};
      } else {
        channelTakeAsync(channel, function(val) {
          runMachine(machine, machine.next(val));
        });
        return {state: 'park', value: null};
      }

    case 'put':
      if (channelPutSync(channel)) {
        return {state: 'continue', value: null};
      } else {
        channelPutAsync(channel, value, function() {
          runMachine(machine, machine.next());
        });
        return {state: 'park', value: null};
      }
  }
}

function take(channel) {
  return {
    op: 'take',
    channel: channel
  };
}

function put(channel, value) {
  return {
    op: 'put',
    channel: channel,
    value: value
  };
}

module.exports = {
  chan: chan,
  putAsync: channelPutAsync,
  takeAsync: channelTakeAsync,
  go: go,
  put: put,
  take: take
};
