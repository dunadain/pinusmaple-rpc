"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.create = exports.MQTTAcceptor = void 0;
const pinus_logger_1 = require("pinus-logger");
let logger = (0, pinus_logger_1.getLogger)('pinus-rpc', 'mqtt-acceptor');
const events_1 = require("events");
const tracer_1 = require("../../util/tracer");
let MqttCon = require('mqtt-connection');
const net = require("net");
let curId = 1;
class MQTTAcceptor extends events_1.EventEmitter {
    constructor(opts, cb) {
        var _a;
        super();
        this.inited = false;
        this.closed = false;
        this.interval = (_a = opts.interval) !== null && _a !== void 0 ? _a : 0; // flush interval in ms
        this.bufferMsg = opts.bufferMsg;
        this.rpcLogger = opts.rpcLogger;
        this.rpcDebugLog = opts.rpcDebugLog;
        this._interval = null; // interval object
        this.sockets = {};
        this.msgQueues = {};
        this.cb = cb;
    }
    listen(port) {
        // check status
        if (this.inited) {
            //    this.cb(new Error('already inited.'));
            //   return;
            throw new Error('already inited.');
        }
        this.inited = true;
        let self = this;
        this.server = new net.Server();
        this.server.listen(port);
        this.server.on('error', (err) => {
            logger.error('rpc server is error: %j', err.stack);
            self.emit('error', err, this);
        });
        this.server.on('connection', function (stream) {
            stream.setNoDelay(true);
            let socket = MqttCon(stream);
            socket['id'] = curId++;
            socket.on('connect', function (pkg) {
                console.log('connected');
            });
            socket.on('publish', function (pkg) {
                pkg = pkg.payload.toString();
                let isArray = false;
                try {
                    pkg = JSON.parse(pkg);
                    if (pkg instanceof Array) {
                        self.processMsgs(socket, pkg);
                        isArray = true;
                    }
                    else {
                        self.processMsg(socket, pkg);
                    }
                }
                catch (err) {
                    if (!isArray) {
                        self.doSend(socket, {
                            id: pkg.id,
                            resp: [self.cloneError(err)]
                        });
                    }
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
                self.flush();
            }, this.interval);
        }
    }
    close() {
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
    processMsg(socket, pkg) {
        let tracer = null;
        if (this.rpcDebugLog) {
            tracer = new tracer_1.Tracer(this.rpcLogger, this.rpcDebugLog, pkg.remote, pkg.source, pkg.msg, pkg.id, pkg.seq);
            tracer.info('server', __filename, 'processMsg', 'mqtt-acceptor receive message and try to process message');
        }
        if (tracer) {
            this.cb(tracer, pkg.msg, (...args) => {
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
                    resp = {
                        id: pkg.id,
                        resp: args
                    };
                }
                if (this.bufferMsg) {
                    this.enqueue(socket, resp);
                }
                else {
                    this.doSend(socket, resp);
                }
            });
        }
    }
    processMsgs(socket, pkgs) {
        for (let i = 0, l = pkgs.length; i < l; i++) {
            this.processMsg(socket, pkgs[i]);
        }
    }
    enqueue(socket, msg) {
        let id = socket.id;
        let queue = this.msgQueues[id];
        if (!queue) {
            queue = this.msgQueues[id] = [];
        }
        queue.push(msg);
    }
    flush() {
        let sockets = this.sockets, queues = this.msgQueues, queue, socket;
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
            topic: 'rpc',
            payload: JSON.stringify(msg)
        });
    }
}
exports.MQTTAcceptor = MQTTAcceptor;
/**
 * create acceptor
 *
 * @param opts init params
 * @param cb(tracer, msg, cb) callback function that would be invoked when new message arrives
 */
function create(opts, cb) {
    return new MQTTAcceptor(opts || {}, cb);
}
exports.create = create;
//# sourceMappingURL=mqtt-acceptor.js.map