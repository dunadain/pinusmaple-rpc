"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.create = exports.WS2Acceptor = void 0;
const events_1 = require("events");
const ws = require("ws");
const pinus_logger_1 = require("pinus-logger");
let logger = (0, pinus_logger_1.getLogger)('pinus-rpc', __filename);
const tracer_1 = require("../../util/tracer");
let DEFAULT_ZIP_LENGTH = 1024 * 10;
let useZipCompress = false;
class WS2Acceptor extends events_1.EventEmitter {
    constructor(opts, cb) {
        super();
        this.inited = false;
        this.closed = false;
        this.gid = 0;
        this.cloneError = function (origin) {
            // copy the stack infos for Error instance json result is empty
            let res = Object.assign(Object.assign({}, origin), { stack: origin.stack });
            return res;
        };
        this.enqueue = function (socket, acceptor, msg) {
            let queue = acceptor.msgQueues[socket.id];
            if (!queue) {
                queue = acceptor.msgQueues[socket.id] = [];
            }
            queue.push(msg);
        };
        this.bufferMsg = opts.bufferMsg;
        this.interval = opts.interval; // flush interval in ms
        this.rpcDebugLog = opts.rpcDebugLog;
        this.rpcLogger = opts.rpcLogger;
        this.whitelist = opts.whitelist;
        this._interval = null; // interval object
        this.sockets = {};
        this.msgQueues = {};
        this.cb = cb;
        this.gid = 1;
        DEFAULT_ZIP_LENGTH = opts.doZipLength || DEFAULT_ZIP_LENGTH;
        useZipCompress = opts.useZipCompress || false;
    }
    listen(port) {
        // check status
        if (!!this.inited) {
            this.cb(new Error('already inited.'));
            return;
        }
        this.inited = true;
        let self = this;
        this.server = new ws.Server({
            port
        });
        this.server.on('error', function (err) {
            self.emit('error', err);
        });
        this.server.on('connection', function (socket) {
            let id = self.gid++;
            socket.id = id;
            self.sockets[id] = socket;
            self.emit('connection', {
                id: id,
                ip: socket._socket.remoteAddress
            });
            socket.on('message', function (data, flags) {
                try {
                    // console.log("ws rpc server received message = " + data);
                    let msg = data;
                    msg = JSON.parse(msg);
                    if (msg.body instanceof Array) {
                        self.processMsgs(socket, self, msg.body);
                    }
                    else {
                        self.processMsg(socket, self, msg.body);
                    }
                }
                catch (e) {
                    console.error('ws rpc server process message with error: %j', e.stack);
                }
            });
            socket.on('close', function (code, message) {
                delete self.sockets[id];
                delete self.msgQueues[id];
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
                        sock.close();
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
            this.server.close();
        }
        catch (err) {
            console.error('rpc server close error: %j', err.stack);
        }
        this.emit('closed');
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
                this.doSend(socket, resp);
            }
        });
    }
    processMsgs(socket, acceptor, pkgs) {
        for (let i = 0, l = pkgs.length; i < l; i++) {
            this.processMsg(socket, acceptor, pkgs[i]);
        }
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
            //    socket.send(JSON.stringify({body: queue}));
            queues[socketId] = [];
        }
    }
    doSend(socket, dataObj) {
        let str = JSON.stringify({
            body: dataObj
        });
        // console.log("ws rpc server send str = " + str);
        // console.log("ws rpc server send str len = " + str.length);
        // console.log("ws rpc server send message, len = " + str.length);
        socket.send(str);
    }
}
exports.WS2Acceptor = WS2Acceptor;
/**
 * create acceptor
 *
 * @param opts init params
 * @param cb(tracer, msg, cb) callback function that would be invoked when new message arrives
 */
function create(opts, cb) {
    return new WS2Acceptor(opts || {}, cb);
}
exports.create = create;
//# sourceMappingURL=ws2-acceptor.js.map