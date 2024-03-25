"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.create = exports.MQTT2Acceptor = void 0;
const pinus_logger_1 = require("pinus-logger");
let logger = (0, pinus_logger_1.getLogger)('pinus-rpc', 'mqtt2-acceptor');
const events_1 = require("events");
const constants_1 = require("../../util/constants");
const tracer_1 = require("../../util/tracer");
const Coder = require("../../util/coder");
let MqttCon = require('mqtt-connection');
const net = require("net");
let curId = 1;
class MQTT2Acceptor extends events_1.EventEmitter {
    constructor(opts, cb) {
        super();
        this.inited = false;
        this.closed = false;
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
    }
    listen(port) {
        // check status
        if (!!this.inited) {
            this.cb(new Error('already inited.'));
            return;
        }
        this.inited = true;
        let self = this;
        this.server = new net.Server();
        this.server.listen(port);
        this.server.on('error', function (err) {
            logger.error('rpc server is error: %j', err.stack);
            self.emit('error', err);
        });
        this.server.on('connection', function (stream) {
            stream.setNoDelay(true);
            let socket = MqttCon(stream);
            socket['id'] = curId++;
            socket.on('connect', function (pkg) {
                console.log('connected');
                self.sendHandshake(socket, self);
            });
            socket.on('publish', function (pkg) {
                let newPkg = Coder.decodeServer(pkg.payload, self.servicesMap);
                try {
                    self.processMsg(socket, self, newPkg);
                }
                catch (err) {
                    let resp = Coder.encodeServer(newPkg.id, [self.cloneError(err)]);
                    // doSend(socket, resp);
                    logger.error('process rpc message error %s', err.stack);
                }
            });
            socket.on('pingreq', function () {
                socket.pingresp();
            });
            socket.on('error', function () {
                self.onSocketClose(socket);
            });
            socket.on('close', function () {
                self.onSocketClose(socket);
            });
            self.sockets[socket.id] = socket;
            socket.on('disconnect', function (reason) {
                self.onSocketClose(socket);
            });
        });
        if (this.bufferMsg) {
            this._interval = setInterval(function () {
                self.flush(self);
            }, this.interval);
        }
    }
    close() {
        var _a;
        if (this.closed) {
            return;
        }
        this.closed = true;
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
        (_a = this.server) === null || _a === void 0 ? void 0 : _a.close();
        this.emit('closed');
    }
    onSocketClose(socket) {
        if (!socket['closed']) {
            let id = socket.id;
            socket['closed'] = true;
            delete this.sockets[id];
            delete this.msgQueues[id];
        }
    }
    cloneError(origin) {
        // copy the stack infos for Error instance json result is empty
        let res = Object.assign(Object.assign({}, origin), { stack: origin.stack });
        return res;
    }
    processMsg(socket, acceptor, pkg) {
        let tracer = null;
        if (this.rpcDebugLog) {
            tracer = new tracer_1.Tracer(acceptor.rpcLogger, acceptor.rpcDebugLog, pkg.remote, pkg.source, pkg.msg, pkg.id, pkg.seq);
            tracer.info('server', __filename, 'processMsg', 'mqtt-acceptor receive message and try to process message');
        }
        acceptor.cb(tracer, pkg.msg, (...args) => {
            // let args = Array.prototype.slice.call(arguments, 0);
            let len = arguments.length;
            for (let i = 0; i < len; i++) {
                args[i] = arguments[i];
            }
            let errorArg = args[0]; // first callback argument can be error object, the others are message
            if (errorArg && errorArg instanceof Error) {
                args[0] = this.cloneError(errorArg);
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
            }
            else {
                resp = Coder.encodeServer(pkg.id, args);
                // resp = {
                //   id: pkg.id,
                //   resp: args
                // };
            }
            if (acceptor.bufferMsg) {
                this.enqueue(socket, acceptor, resp);
            }
            else {
                this.doSend(socket, resp);
            }
        });
    }
    processMsgs(socket, acceptor, pkgs) {
        for (let i = 0, l = pkgs.length; i < l; i++) {
            this.processMsg(socket, acceptor, pkgs[i]);
        }
    }
    enqueue(socket, acceptor, msg) {
        let id = socket.id;
        let queue = acceptor.msgQueues[id];
        if (!queue) {
            queue = acceptor.msgQueues[id] = [];
        }
        queue.push(msg);
    }
    flush(acceptor) {
        let sockets = acceptor.sockets, queues = acceptor.msgQueues, queue, socket;
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
            this.doSend(socket, queue);
            queues[socketId] = [];
        }
    }
    doSend(socket, msg) {
        socket.publish({
            topic: constants_1.constants['TOPIC_RPC'],
            payload: msg
            // payload: JSON.stringify(msg)
        });
    }
    doSendHandshake(socket, msg) {
        socket.publish({
            topic: constants_1.constants['TOPIC_HANDSHAKE'],
            payload: msg
            // payload: JSON.stringify(msg)
        });
    }
    sendHandshake(socket, acceptor) {
        // let servicesMap = utils.genServicesMap(acceptor.services);
        // acceptor.servicesMap = servicesMap;
        // this.doSendHandshake(socket, JSON.stringify(servicesMap));
        let servicesMap = JSON.parse(acceptor.services);
        acceptor.servicesMap = servicesMap;
        this.doSendHandshake(socket, JSON.stringify(servicesMap));
    }
}
exports.MQTT2Acceptor = MQTT2Acceptor;
/**
 * create acceptor
 *
 * @param opts init params
 * @param cb(tracer, msg, cb) callback function that would be invoked when new message arrives
 */
function create(opts, cb) {
    return new MQTT2Acceptor(opts || {}, cb);
}
exports.create = create;
//# sourceMappingURL=mqtt2-acceptor.js.map