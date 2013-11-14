var chai = require('chai'),
    expect = chai.expect,
    sinonChai = require('sinon-chai'),
    sinon = require('sinon'),
    csp = require('../');

require('setimmediate');
chai.use(sinonChai);

describe('csp', function() {
  it('puts and takes on a channel asynchronously', function(done) {
    var putCallback = sinon.spy();
    var takeCallback = sinon.spy();

    var c = csp.chan(1);
    csp.putAsync(c, 42, putCallback);
    csp.takeAsync(c, takeCallback);

    expect(putCallback).to.not.have.been.called;
    expect(takeCallback).to.not.have.been.called;

    setImmediate(function() {
      expect(putCallback).to.have.been.calledOnce;
      expect(putCallback).to.have.been.calledWithExactly();

      expect(takeCallback).to.have.been.calledOnce;
      expect(takeCallback).to.have.been.calledWithExactly(42);

      done();
    });
  });

  it('puts and takes on a channel with a go block', function(done) {
    var c = csp.chan(1);
    csp.go(function*() {
      yield csp.put(c, 42);
      var val = yield csp.take(c);
      expect(val).to.equal(42);
      done();
    });
  });
});
