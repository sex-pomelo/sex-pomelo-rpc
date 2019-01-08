let logger = require('@sex-pomelo/sex-pomelo-logger').getLogger('pomelo-rpc', 'Coder');
// let OutBuffer = require('./buffer/outputBuffer');
// let InBuffer = require('./buffer/inputBuffer');
let bBuffer = require('bearcat-buffer');
let OutBuffer = bBuffer.outBuffer;
let InBuffer = bBuffer.inBuffer;

let Coder = {};

Coder.encodeClient = function(id, msg, servicesMap) {
	// logger.debug('[encodeClient] id %s msg %j', id, msg);
	let outBuf = new OutBuffer();
	outBuf.writeUInt(id);
	let namespace = msg['namespace'];
	let serverType = msg['serverType'];
	let service = msg['service'];
	let method = msg['method'];
	let args = msg['args'] || [];
	outBuf.writeShort(servicesMap[0][namespace]);
	outBuf.writeShort(servicesMap[1][service]);
	outBuf.writeShort(servicesMap[2][method]);
	// outBuf.writeString(namespace);
	// outBuf.writeString(service);
	// outBuf.writeString(method);

	outBuf.writeObject(args);

	return outBuf.getBuffer();
}

Coder.encodeServer = function(id, args) {
	// logger.debug('[encodeServer] id %s args %j', id, args);
	let outBuf = new OutBuffer();
	outBuf.writeUInt(id);
	outBuf.writeObject(args);
	return outBuf.getBuffer();	
}

Coder.decodeServer = function(buf, servicesMap) {
	let inBuf = new InBuffer(buf);
	let id = inBuf.readUInt();
	let namespace = servicesMap[3][inBuf.readShort()];
	let service = servicesMap[4][inBuf.readShort()];
	let method = servicesMap[5][inBuf.readShort()];
	// let namespace = inBuf.readString();
	// let service = inBuf.readString();
	// let method = inBuf.readString();

	let args = inBuf.readObject();
	// logger.debug('[decodeServer] namespace %s service %s method %s args %j', namespace, service, method, args)

	return {
		id: id,
		msg: {
			namespace: namespace,
			// serverType: serverType,
			service: service,
			method: method,
			args: args
		}
	}
}

Coder.decodeClient = function(buf) {
	let inBuf = new InBuffer(buf);
	let id = inBuf.readUInt();
	let resp = inBuf.readObject();
	// logger.debug('[decodeClient] id %s resp %j', id, resp);
	return {
		id: id,
		resp: resp
	}
}

module.exports = Coder;