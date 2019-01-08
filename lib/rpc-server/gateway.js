let defaultAcceptorFactory = require('./acceptor');
let EventEmitter = require('events').EventEmitter;
let Dispatcher = require('./dispatcher');
let Loader = require('pomelo-loader');
let utils = require('../util/utils');
let util = require('util');
let fs = require('fs');

let Gateway = function(opts) {
  EventEmitter.call(this);
  this.opts = opts || {};
  this.port = opts.port || 3050;
  this.started = false;
  this.stoped = false;
  this.acceptorFactory = opts.acceptorFactory || defaultAcceptorFactory;
  this.services = opts.services;
  let dispatcher = new Dispatcher(this.services);
  if (!!this.opts.reloadRemotes) {
    watchServices(this, dispatcher);
  }
  this.acceptor = this.acceptorFactory.create(opts, function(tracer, msg, cb) {
    dispatcher.route(tracer, msg, cb);
  });
};

util.inherits(Gateway, EventEmitter);

let pro = Gateway.prototype;

pro.stop = function() {
  if (!this.started || this.stoped) {
    return;
  }
  this.stoped = true;
  try {
    this.acceptor.close();
  } catch (err) {}
};

pro.start = function() {
  if (this.started) {
    throw new Error('gateway already start.');
  }
  this.started = true;

  let self = this;
  this.acceptor.on('error', self.emit.bind(self, 'error'));
  this.acceptor.on('closed', self.emit.bind(self, 'closed'));
  this.acceptor.listen(this.port);
};

/**
 * create and init gateway
 *
 * @param opts {services: {rpcServices}, connector:conFactory(optional), router:routeFunction(optional)}
 */
module.exports.create = function(opts) {
  if (!opts || !opts.services) {
    throw new Error('opts and opts.services should not be empty.');
  }

  return new Gateway(opts);
};

let watchServices = function(gateway, dispatcher) {
  let paths = gateway.opts.paths;
  let app = gateway.opts.context;
  for (let i = 0; i < paths.length; i++) {
    (function(index) {
      fs.watch(paths[index].path, function(event, name) {
        if (event === 'change') {
          let res = {};
          let item = paths[index];
          let m = Loader.load(item.path, app);
          if (m) {
            createNamespace(item.namespace, res);
            for (let s in m) {
              res[item.namespace][s] = m[s];
            }
          }
          dispatcher.emit('reload', res);
        }
      });
    })(i);
  }
};

let createNamespace = function(namespace, proxies) {
  proxies[namespace] = proxies[namespace] || {};
};