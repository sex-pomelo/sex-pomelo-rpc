let logger = require('@sex-pomelo/sex-pomelo-logger').getLogger('pomelo-rpc', 'mqtt2-acceptor');
let EventEmitter = require('events').EventEmitter;
let Constant = require('../../util/constants');
let Tracer = require('../../util/tracer');
let utils = require('../../util/utils');
let Coder = require('../../util/coder');
let MqttCon = require('mqtt-connection');
let util = require('util');
let net = require('net');

let curId = 1;

let Acceptor = function(opts, cb) {
  EventEmitter.call(this);
  this.interval = opts.interval; // flush interval in ms
  this.bufferMsg = opts.bufferMsg;
  this.rpcLogger = opts.rpcLogger;
  this.rpcDebugLog = opts.rpcDebugLog;
  this.services = opts.services;
  this._interval = null; // interval object
  this.sockets = {};
  this.msgQueues = {};
  this.servicesMap = {};
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

  this.server = new net.Server();
  this.server.listen(port);

  this.server.on('error', function(err) {
    logger.error('rpc server is error: %j', err.stack);
    self.emit('error', err);
  });

  this.server.on('connection', function(stream) {
    let socket = MqttCon(stream);
    socket['id'] = curId++;

    socket.on('connect', function(pkg) {
      console.log('connected');
      sendHandshake(socket, self);
    });

    socket.on('publish', function(pkg) {
      pkg = Coder.decodeServer(pkg.payload, self.servicesMap);
      try {
        processMsg(socket, self, pkg);
      } catch (err) {
        let resp = Coder.encodeServer(pkg.id, [cloneError(err)]);
        // doSend(socket, resp);
        logger.error('process rpc message error %s', err.stack);
      }
    });

    socket.on('pingreq', function() {
      socket.pingresp();
    });

    socket.on('error', function() {
      self.onSocketClose(socket);
    });

    socket.on('close', function() {
      self.onSocketClose(socket);
    });

    self.sockets[socket.id] = socket;

    socket.on('disconnect', function(reason) {
      self.onSocketClose(socket);
    });
  });

  if (this.bufferMsg) {
    this._interval = setInterval(function() {
      flush(self);
    }, this.interval);
  }
};

pro.close = function() {
  if (this.closed) {
    return;
  }
  this.closed = true;
  if (this._interval) {
    clearInterval(this._interval);
    this._interval = null;
  }
  this.server.close();
  this.emit('closed');
};

pro.onSocketClose = function(socket) {
  if (!socket['closed']) {
    let id = socket.id;
    socket['closed'] = true;
    delete this.sockets[id];
    delete this.msgQueues[id];
  }
}

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
    tracer.info('server', __filename, 'processMsg', 'mqtt-acceptor receive message and try to process message');
  }
  acceptor.cb(tracer, pkg.msg, function() {
    // let args = Array.prototype.slice.call(arguments, 0);
    let len = arguments.length;
    let args = new Array(len);
    for (let i = 0; i < len; i++) {
      args[i] = arguments[i];
    }

    let errorArg = args[0]; // first callback argument can be error object, the others are message
    if (errorArg && errorArg instanceof Error) {
      args[0] = cloneError(errorArg);
    }

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
      resp = Coder.encodeServer(pkg.id, args);
      // resp = {
      //   id: pkg.id,
      //   resp: args
      // };
    }
    if (acceptor.bufferMsg) {
      enqueue(socket, acceptor, resp);
    } else {
      doSend(socket, resp);
    }
  });
};

let processMsgs = function(socket, acceptor, pkgs) {
  for (let i = 0, l = pkgs.length; i < l; i++) {
    processMsg(socket, acceptor, pkgs[i]);
  }
};

let enqueue = function(socket, acceptor, msg) {
  let id = socket.id;
  let queue = acceptor.msgQueues[id];
  if (!queue) {
    queue = acceptor.msgQueues[id] = [];
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
    doSend(socket, queue);
    queues[socketId] = [];
  }
};

let doSend = function(socket, msg) {
  socket.publish({
    topic: Constant['TOPIC_RPC'],
    payload: msg
      // payload: JSON.stringify(msg)
  });
}

let doSendHandshake = function(socket, msg) {
  socket.publish({
    topic: Constant['TOPIC_HANDSHAKE'],
    payload: msg
      // payload: JSON.stringify(msg)
  });
}

let sendHandshake = function(socket, acceptor) {
  let servicesMap = utils.genServicesMap(acceptor.services);
  acceptor.servicesMap = servicesMap;
  doSendHandshake(socket, JSON.stringify(servicesMap));
}

/**
 * create acceptor
 *
 * @param opts init params
 * @param cb(tracer, msg, cb) callback function that would be invoked when new message arrives
 */
module.exports.create = function(opts, cb) {
  return new Acceptor(opts || {}, cb);
};