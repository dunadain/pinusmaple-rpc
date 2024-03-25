"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeClient = exports.decodeServer = exports.encodeServer = exports.encodeClient = void 0;
const pinus_logger_1 = require("pinus-logger");
let logger = (0, pinus_logger_1.getLogger)('pinus-rpc', 'Coder');
const OutBuffer = require("./buffer/outputBuffer");
const InBuffer = require("./buffer/inputBuffer");
function encodeClient(id, msg, servicesMap) {
    // logger.debug('[encodeClient] id %s msg %j', id, msg);
    let outBuf = new OutBuffer.OutputBuffer();
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
exports.encodeClient = encodeClient;
function encodeServer(id, args) {
    // logger.debug('[encodeServer] id %s args %j', id, args);
    let outBuf = new OutBuffer.OutputBuffer();
    outBuf.writeUInt(id);
    outBuf.writeObject(args);
    return outBuf.getBuffer();
}
exports.encodeServer = encodeServer;
function decodeServer(buf, servicesMap) {
    let inBuf = new InBuffer.InputBuffer(buf);
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
    };
}
exports.decodeServer = decodeServer;
function decodeClient(buf) {
    let inBuf = new InBuffer.InputBuffer(buf);
    let id = inBuf.readUInt();
    let resp = inBuf.readObject();
    // logger.debug('[decodeClient] id %s resp %j', id, resp);
    return {
        id: id,
        resp: resp
    };
}
exports.decodeClient = decodeClient;
//# sourceMappingURL=coder.js.map