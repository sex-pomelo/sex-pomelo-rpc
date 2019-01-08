let EventEmitter = require('events').EventEmitter;
let Tracer = require('../../util/tracer');
let utils = require('../../util/utils');
let Composer = require('stream-pkg');
let util = require('util');
let net = require('net');

let Acceptor = function(opts, cb) {
  EventEmitter.call(this);
  opts = opts || {};
  this.bufferMsg = opts.bufferMsg;
  this.interval = opts.interval; // flush interval in ms
  this.pkgSize = opts.pkgSize;
  this._interval = null; // interval object
  this.server = null;
  this.sockets = {};
  this.msgQueues = {};
  this.cb = cb;
};

util.inherits(Acceptor, EventEmitter);

let pro = Acceptor.prototype;

pro.listen = function(port) {
  //check status
  if (!!this.inited) {
    utils.invokeCallback(this.cb, new Error('already inited.'));
    return;
  }
  this.inited = true;

  let self = this;

  this.server = net.createServer();
  this.server.listen(port);

  this.server.on('error', function(err) {
    self.emit('error', err, this);
  });

  this.server.on('connection', function(socket) {
    self.sockets[socket.id] = socket;
    socket.composer = new Composer({
      maxLength: self.pkgSize
    });

    socket.on('data', function(data) {
      socket.composer.feed(data);
    });

    socket.composer.on('data', function(data) {
      let pkg = JSON.parse(data.toString());
      if (pkg instanceof Array) {
        processMsgs(socket, self, pkg);
      } else {
        processMsg(socket, self, pkg);
      }
    });

    socket.on('close', function() {
      delete self.sockets[socket.id];
      delete self.msgQueues[socket.id];
    });
  });

  if (this.bufferMsg) {
    this._interval = setInterval(function() {
      flush(self);
    }, this.interval);
  }
};

pro.close = function() {
  if (!!this.closed) {
    return;
  }
  this.closed = true;
  if (this._interval) {
    clearInterval(this._interval);
    this._interval = null;
  }
  try {
    this.server.close();
  } catch (err) {
    console.error('rpc server close error: %j', err.stack);
  }
  this.emit('closed');
};

let cloneError = function(origin) {
  // copy the stack infos for Error instance json result is empty
  let res = {
    msg: origin.msg,
    stack: origin.stack
  };
  return res;
};

let processMsg = function(socket, acceptor, pkg) {
  let tracer = new Tracer(acceptor.rpcLogger, acceptor.rpcDebugLog, pkg.remote, pkg.source, pkg.msg, pkg.traceId, pkg.seqId);
  tracer.info('server', __filename, 'processMsg', 'tcp-acceptor receive message and try to process message');
  acceptor.cb(tracer, pkg.msg, function() {
    let args = Array.prototype.slice.call(arguments, 0);
    for (let i = 0, l = args.length; i < l; i++) {
      if (args[i] instanceof Error) {
        args[i] = cloneError(args[i]);
      }
    }
    let resp;
    if (tracer.isEnabled) {
      resp = {
        traceId: tracer.id,
        seqId: tracer.seq,
        source: tracer.source,
        id: pkg.id,
        resp: Array.prototype.slice.call(args, 0)
      };
    } else {
      resp = {
        id: pkg.id,
        resp: Array.prototype.slice.call(args, 0)
      };
    }
    if (acceptor.bufferMsg) {
      enqueue(socket, acceptor, resp);
    } else {
      socket.write(socket.composer.compose(JSON.stringify(resp)));
    }
  });
};

let processMsgs = function(socket, acceptor, pkgs) {
  for (let i = 0, l = pkgs.length; i < l; i++) {
    processMsg(socket, acceptor, pkgs[i]);
  }
};

let enqueue = function(socket, acceptor, msg) {
  let queue = acceptor.msgQueues[socket.id];
  if (!queue) {
    queue = acceptor.msgQueues[socket.id] = [];
  }
  queue.push(msg);
};

let flush = function(acceptor) {
  let sockets = acceptor.sockets,
    queues = acceptor.msgQueues,
    queue, socket;
  for (let socketId in queues) {
    socket = sockets[socketId];
    if (!socket) {
      // clear pending messages if the socket not exist any more
      delete queues[socketId];
      continue;
    }
    queue = queues[socketId];
    if (!queue.length) {
      continue;
    }
    socket.write(socket.composer.compose(JSON.stringify(queue)));
    queues[socketId] = [];
  }
};

/**
 * create acceptor
 *
 * @param opts init params
 * @param cb(tracer, msg, cb) callback function that would be invoked when new message arrives
 */
module.exports.create = function(opts, cb) {
  return new Acceptor(opts || {}, cb);
};

process.on('SIGINT', function() {
  process.exit();
});