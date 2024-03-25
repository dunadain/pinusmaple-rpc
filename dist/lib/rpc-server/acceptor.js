"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTcpAcceptor = exports.createDefaultAcceptor = void 0;
const mqtt_acceptor_1 = require("./acceptors/mqtt-acceptor");
const tcp_acceptor_1 = require("./acceptors/tcp-acceptor");
function createDefaultAcceptor(opts, cb) {
    return new mqtt_acceptor_1.MQTTAcceptor(opts, cb);
}
exports.createDefaultAcceptor = createDefaultAcceptor;
function createTcpAcceptor(opts, cb) {
    return new tcp_acceptor_1.TCPAcceptor(opts, cb);
}
exports.createTcpAcceptor = createTcpAcceptor;
//# sourceMappingURL=acceptor.js.map