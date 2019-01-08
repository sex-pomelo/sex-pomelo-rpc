let Loader = require('pomelo-loader');
let Gateway = require('./gateway');

let loadRemoteServices = function(paths, context) {
  let res = {},
    item, m;
  for (let i = 0, l = paths.length; i < l; i++) {
    item = paths[i];
    m = Loader.load(item.path, context);

    if (m) {
      createNamespace(item.namespace, res);
      for (let s in m) {
        res[item.namespace][s] = m[s];
      }
    }
  }

  return res;
};

let createNamespace = function(namespace, proxies) {
  proxies[namespace] = proxies[namespace] || {};
};

/**
 * Create rpc server.
 *
 * @param  {Object}      opts construct parameters
 *                       opts.port {Number|String} rpc server listen port
 *                       opts.paths {Array} remote service code paths, [{namespace, path}, ...]
 *                       opts.context {Object} context for remote service
 *                       opts.acceptorFactory {Object} (optionals)acceptorFactory.create(opts, cb)
 * @return {Object}      rpc server instance
 */
module.exports.create = function(opts) {
  if (!opts || !opts.port || opts.port < 0 || !opts.paths) {
    throw new Error('opts.port or opts.paths invalid.');
  }
  let services = loadRemoteServices(opts.paths, opts.context);
  opts.services = services;
  let gateway = Gateway.create(opts);
  return gateway;
};

// module.exports.WSAcceptor = require('./acceptors/ws-acceptor');
// module.exports.TcpAcceptor = require('./acceptors/tcp-acceptor');
module.exports.MqttAcceptor = require('./acceptors/mqtt-acceptor');