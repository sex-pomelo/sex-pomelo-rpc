let logger = require('@sex-pomelo/sex-pomelo-logger').getLogger('pomelo-rpc', 'ws-acceptor');
let EventEmitter = require('events').EventEmitter;
let Tracer = require('../../util/tracer');
let utils = require('../../util/utils');
let sio = require('socket.io');
let util = require('util');

let Acceptor = function(opts, cb) {
  EventEmitter.call(this);
  this.bufferMsg = opts.bufferMsg;
  this.interval = opts.interval; // flush interval in ms
  this.rpcDebugLog = opts.rpcDebugLog;
  this.rpcLogger = opts.rpcLogger;
  this.whitelist = opts.whitelist;
  this._interval = null; // interval object
  this.sockets = {};
  this.msgQueues = {};
  this.cb = cb;
};

util.inherits(Acceptor, EventEmitter);

let pro = Acceptor.prototype;

pro.listen = function(port) {
  //check status
  if (!!this.inited) {
    this.cb(new Error('already inited.'));
    return;
  }
  this.inited = true;

  let self = this;

  this.server = sio.listen(port);

  this.server.set('log level', 0);

  this.server.server.on('error', function(err) {
    logger.error('rpc server is error: %j', err.stack);
    self.emit('error', err);
  });

  this.server.sockets.on('connection', function(socket) {
    self.sockets[socket.id] = socket;

    self.emit('connection', {
      id: socket.id,
      ip: socket.handshake.address.address
    });

    socket.on('message', function(pkg) {
      try {
        if (pkg instanceof Array) {
          processMsgs(socket, self, pkg);
        } else {
          processMsg(socket, self, pkg);
        }
      } catch (e) {
        // socke.io would broken if uncaugth the exception
        logger.error('rpc server process message error: %j', e.stack);
      }
    });

    socket.on('disconnect', function(reason) {
      delete self.sockets[socket.id];
      delete self.msgQueues[socket.id];
    });
  });

  this.on('connection', ipFilter.bind(this));

  if (this.bufferMsg) {
    this._interval = setInterval(function() {
      flush(self);
    }, this.interval);
  }
};

let ipFilter = function(obj) {
  if (typeof this.whitelist === 'function') {
    let self = this;
    self.whitelist(function(err, tmpList) {
      if (err) {
        logger.error('%j.(RPC whitelist).', err);
        return;
      }
      if (!Array.isArray(tmpList)) {
        logger.error('%j is not an array.(RPC whitelist).', tmpList);
        return;
      }
      if (!!obj && !!obj.ip && !!obj.id) {
        for (let i in tmpList) {
          let exp = new RegExp(tmpList[i]);
          if (exp.test(obj.ip)) {
            return;
          }
        }
        let sock = self.sockets[obj.id];
        if (sock) {
          sock.disconnect('unauthorized');
          logger.warn('%s is rejected(RPC whitelist).', obj.ip);
        }
      }
    });
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
    this.server.server.close();
  } catch (err) {
    logger.error('rpc server close error: %j', err.stack);
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
  let tracer = null;
  if (this.rpcDebugLog) {
    tracer = new Tracer(acceptor.rpcLogger, acceptor.rpcDebugLog, pkg.remote, pkg.source, pkg.msg, pkg.traceId, pkg.seqId);
    tracer.info('server', __filename, 'processMsg', 'ws-acceptor receive message and try to process message');
  }
  acceptor.cb(tracer, pkg.msg, function() {
    // let args = arguments;
    let args = Array.prototype.slice.call(arguments, 0);
    let errorArg = args[0]; // first callback argument can be error object, the others are message
    if (errorArg instanceof Error) {
      args[0] = cloneError(errorArg);
    }
    // for(let i=0, l=args.length; i<l; i++) {
    //   if(args[i] instanceof Error) {
    //     args[i] = cloneError(args[i]);
    //   }
    // }
    let resp;
    if (tracer && tracer.isEnabled) {
      resp = {
        traceId: tracer.id,
        seqId: tracer.seq,
        source: tracer.source,
        id: pkg.id,
        resp: args
      };
    } else {
      resp = {
        id: pkg.id,
        resp: args
      };
      // resp = {id: pkg.id, resp: Array.prototype.slice.call(args, 0)};
    }
    if (acceptor.bufferMsg) {
      enqueue(socket, acceptor, resp);
    } else {
      socket.emit('message', resp);
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
    socket.emit('message', queue);
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