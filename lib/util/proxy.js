let logger = require('@sex-pomelo/sex-pomelo-logger').getLogger('pomelo-rpc', 'rpc-proxy');
let exp = module.exports;

/**
 * Create proxy.
 *
 * @param  {Object} opts construct parameters
 *           opts.origin {Object} delegated object
 *           opts.proxyCB {Function} proxy invoke callback
 *           opts.service {String} deletgated service name
 *           opts.attach {Object} attach parameter pass to proxyCB
 * @return {Object}      proxy instance
 */
exp.create = function(opts) {
  if (!opts || !opts.origin) {
    logger.warn('opts and opts.origin should not be empty.');
    return null;
  }

  if (!opts.proxyCB || typeof opts.proxyCB !== 'function') {
    logger.warn('opts.proxyCB is not a function, return the origin module directly.');
    return opts.origin;
  }

  return genObjectProxy(opts.service, opts.origin, opts.attach, opts.proxyCB);
};

let genObjectProxy = function(serviceName, origin, attach, proxyCB) {
  //generate proxy for function field
  let res = {};
  for (let field in origin) {
    if (typeof origin[field] === 'function') {
      res[field] = genFunctionProxy(serviceName, field, origin, attach, proxyCB);
    }
  }

  // ES6 gen proxy function
  for (let field of Object.getOwnPropertyNames(Object.getPrototypeOf(origin))) {
    if (!(origin[field] instanceof Function) || field === 'constructor' ) continue;
    
    res[field] = genFunctionProxy(serviceName, field, origin, attach, proxyCB);
  }
  return res;
};

/**
 * Generate prxoy for function type field
 *
 * @param namespace {String} current namespace
 * @param serverType {String} server type string
 * @param serviceName {String} delegated service name
 * @param methodName {String} delegated method name
 * @param origin {Object} origin object
 * @param proxyCB {Functoin} proxy callback function
 * @returns function proxy
 */
let genFunctionProxy = function(serviceName, methodName, origin, attach, proxyCB) {
  return (function() {
    let proxy = function() {
      // let args = arguments;
      let len = arguments.length;
      let args = new Array(len);
      for (let i = 0; i < len; i++) {
        args[i] = arguments[i];
      }
      // let args = Array.prototype.slice.call(arguments, 0);
      proxyCB(serviceName, methodName, args, attach);
    };

    proxy.toServer = function() {
      // let args = arguments;
      let len = arguments.length;
      let args = new Array(len);
      for (let i = 0; i < len; i++) {
        args[i] = arguments[i];
      }
      proxyCB(serviceName, methodName, args, attach, true);
    };

    return proxy;
  })();
};