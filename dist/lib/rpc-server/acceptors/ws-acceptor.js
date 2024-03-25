"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.create = exports.WSAcceptor = void 0;
const pinus_logger_1 = require("pinus-logger");
let logger = (0, pinus_logger_1.getLogger)('pinus-rpc', 'ws-acceptor');
const events_1 = require("events");
const tracer_1 = require("../../util/tracer");
const socket_io_1 = require("socket.io");
class WSAcceptor extends events_1.EventEmitter {
    constructor(opts, cb) {
        super();
        this.inited = false;
        this.closed = false;
        this.bufferMsg = opts.bufferMsg;
        this.interval = opts.interval; // flush interval in ms
        this.rpcDebugLog = opts.rpcDebugLog;
        this.rpcLogger = opts.rpcLogger;
        this.whitelist = opts.whitelist;
        this._interval = null; // interval object
        this.sockets = {};
        this.msgQueues = {};
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
        this.server = new socket_io_1.Server(port);
        this.server.set('log level', 0);
        this.server.server.on('error', function (err) {
            logger.error('rpc server is error: %j', err.stack);
            self.emit('error', err);
        });
        this.server.sockets.on('connection', function (socket) {
            self.sockets[socket.id] = socket;
            self.emit('connection', {
                id: socket.id,
                ip: socket.handshake.address.address
            });
            socket.on('message', function (pkg) {
                try {
                    if (pkg instanceof Array) {
                        self.processMsgs(socket, self, pkg);
                    }
                    else {
                        self.processMsg(socket, self, pkg);
                    }
                }
                catch (e) {
                    // socke.io would broken if uncaugth the exception
                    logger.error('rpc server process message error: %j', e.stack);
                }
            });
            socket.on('disconnect', function (reason) {
                delete self.sockets[socket.id];
                delete self.msgQueues[socket.id];
            });
        });
        this.on('connection', self.ipFilter.bind(this));
        if (this.bufferMsg) {
            this._interval = setInterval(function () {
                self.flush(self);
            }, this.interval);
        }
    }
    ipFilter(obj) {
        if (typeof this.whitelist === 'function') {
            let self = this;
            self.whitelist(function (err, tmpList) {
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
    }
    close() {
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
        }
        catch (err) {
            logger.error('rpc server close error: %j', err.stack);
        }
        this.emit('closed');
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
            tracer.info('server', __filename, 'processMsg', 'ws-acceptor receive message and try to process message');
        }
        acceptor.cb(tracer, pkg.msg, () => {
            // let args = arguments;
            let args = Array.prototype.slice.call(arguments, 0);
            let errorArg = args[0]; // first callback argument can be error object, the others are message
            if (errorArg instanceof Error) {
                args[0] = this.cloneError(errorArg);
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
            }
            else {
                resp = {
                    id: pkg.id,
                    resp: args
                };
                // resp = {id: pkg.id, resp: Array.prototype.slice.call(args, 0)};
            }
            if (acceptor.bufferMsg) {
                this.enqueue(socket, acceptor, resp);
            }
            else {
                socket.emit('message', resp);
            }
        });
    }
    processMsgs(socket, acceptor, pkgs) {
        for (let i = 0, l = pkgs.length; i < l; i++) {
            this.processMsg(socket, acceptor, pkgs[i]);
        }
    }
    enqueue(socket, acceptor, msg) {
        let queue = acceptor.msgQueues[socket.id];
        if (!queue) {
            queue = acceptor.msgQueues[socket.id] = [];
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
            socket.emit('message', queue);
            queues[socketId] = [];
        }
    }
}
exports.WSAcceptor = WSAcceptor;
/**
 * create acceptor
 *
 * @param opts init params
 * @param cb(tracer, msg, cb) callback function that would be invoked when new message arrives
 */
function create(opts, cb) {
    return new WSAcceptor(opts || {}, cb);
}
exports.create = create;
//# sourceMappingURL=ws-acceptor.js.map