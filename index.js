require('setimmediate');

function chan() {
  return [];
}

function putAsync(port, val, onComplete) {
  port.push(val);
  setImmediate(onComplete);
}

function takeAsync(port, onComplete) {
  var val = port.shift();
  setImmediate(function() { onComplete(val); })
}

function go(machine) {
  var gen = machine();
  go_(gen, gen.next());
}

function go_(machine, step) {
  while (!step.done) {
    var arr = step.value();
    var state = arr[0];
    var value = arr[1];

    switch (state) {
      case 'park':
        setImmediate(function() { go_(machine, step); });
        return;
      case 'continue':
        step = machine.next(value);
        break;
    }
  }
}

function put(port, val) {
  return function() {
    if (port.length == 0) {
      port.unshift(val);
      return ['continue', null];
    } else {
      return ['park', null];
    }
  };
}

function take(port) {
  return function() {
    if (port.length == 0) {
      return ['park', null];
    } else {
      var val = port.pop();
      return ['continue', val];
    }
  };
}

module.exports = {
  chan: chan,
  putAsync: putAsync,
  takeAsync: takeAsync,
  go: go,
  put: put,
  take: take
};
