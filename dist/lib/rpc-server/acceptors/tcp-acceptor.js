"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.create = exports.TCPAcceptor = void 0;
const events_1 = require("events");
const tracer_1 = require("../../util/tracer");
const composer_1 = require("../../util/composer");
const net = require("net");
const pinus_logger_1 = require("pinus-logger");
let logger = (0, pinus_logger_1.getLogger)('pinus-rpc', 'tcp-acceptor');
const MSG_TYPE = 0;
const PING = 1;
const PONG = 2;
const RES_TYPE = 3;
const DEFAULT_INTERVAL = 50;
class TCPAcceptor extends events_1.EventEmitter {
    constructor(opts, cb) {
        super();
        this.sockets = {};
        this.msgQueues = {};
        this.inited = false;
        this.closed = false;
        this.bufferMsg = opts.bufferMsg;
        this.interval = opts.interval || DEFAULT_INTERVAL; // flush interval in ms
        this.pkgSize = opts.pkgSize;
        this.rpcLogger = opts.rpcLogger;
        this.rpcDebugLog = opts.rpcDebugLog;
        this._interval = null; // interval object
        // Heartbeat ping interval.
        this.ping = 'ping' in opts ? opts.ping : 25e3;
        // ping timer for each client connection
        this.timer = {};
        this.server = null;
        this.sockets = {};
        this.msgQueues = {};
        this.cb = cb;
        this.socketId = 0;
    }
    listen(port) {
        // check status
        if (this.inited) {
            throw new Error('already inited.');
        }
        this.inited = true;
        this.server = net.createServer();
        this.server.listen(port);
        this.server.on('error', (err) => {
            logger.error('rpc tcp server is error: %j', err.stack);
            this.emit('error', err, this);
        });
        this.server.on('connection', (socket) => {
            socket.id = this.socketId++;
            this.sockets[socket.id] = socket;
            socket.composer = new composer_1.Composer({
                maxLength: this.pkgSize
            });
            delete this.timer[socket.id];
            this.heartbeat(socket.id);
            socket.on('data', (data) => {
                socket.composer.feed(data);
            });
            socket.composer.on('data', (data) => {
                this.heartbeat(socket.id);
                if (data[0] === PING) {
                    // incoming::ping
                    socket.write(socket.composer.compose(PONG));
                    return;
                }
                try {
                    const pkg = JSON.parse(data.toString('utf-8', 1));
                    // let id  = null;
                    //
                    if (pkg instanceof Array) {
                        this.processMsgs(socket, pkg);
                    }
                    else {
                        this.processMsg(socket, pkg);
                    }
                }
                catch (err) { // json parse exception
                    if (err) {
                        socket.composer.reset();
                        logger.error('tcp-acceptor socket.on(data) error', socket.remoteAddress, data.length, data, err);
                    }
                }
            });
            socket.on('error', (err) => {
                logger.error('tcp socket error: %j address:%s', err, socket.remoteAddress);
            });
            socket.on('close', () => {
                logger.error('tcp socket close: %s', socket.id);
                delete this.sockets[socket.id];
                delete this.msgQueues[socket.id];
                if (this.timer[socket.id]) {
                    clearTimeout(this.timer[socket.id]);
                }
                delete this.timer[socket.id];
            });
        });
        if (this.bufferMsg) {
            this._interval = setInterval(() => {
                this.flush();
            }, this.interval);
        }
    }
    /**
     * Send a new heartbeat over the connection to ensure that we're still
     * connected and our internet connection didn't drop. We cannot use server side
     * heartbeats for this unfortunately.
     *
     * @api private
     */
    heartbeat(socketId) {
        if (!this.ping)
            return;
        if (this.timer[socketId]) {
            this.sockets[socketId].heartbeat = true;
            return;
        }
        /**
         * Exterminate the connection as we've timed out.
         */
        function ping(self, socketId) {
            // if pkg come, modify heartbeat flag, return;
            if (self.sockets[socketId].heartbeat) {
                self.sockets[socketId].heartbeat = false;
                return;
            }
            // if no pkg come
            // remove listener on socket,close socket
            if (self.timer[socketId]) {
                clearInterval(self.timer[socketId]);
                delete self.timer[socketId];
            }
            let remoteAddress = self.sockets[socketId].remoteAddress;
            self.sockets[socketId].composer.removeAllListeners();
            self.sockets[socketId].removeAllListeners();
            self.sockets[socketId].destroy();
            delete self.sockets[socketId];
            delete self.msgQueues[socketId];
            logger.warn('ping timeout with socket id: %s  address:%s', socketId, remoteAddress);
        }
        this.timer[socketId] = setInterval(ping.bind(null, this, socketId), this.ping + 5e3);
        logger.info('wait ping with socket id: %s', socketId);
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
            logger.error('rpc server close error: %j', err.stack);
        }
        this.emit('closed');
    }
    cloneError(origin) {
        // copy the stack infos for Error instance json result is empty
        let res = Object.assign(Object.assign({}, origin), { stack: origin.stack });
        return res;
    }
    respCallback(socket, pkg, tracer, ...args) {
        for (let i = 0, l = args.length; i < l; i++) {
            if (args[i] instanceof Error) {
                args[i] = this.cloneError(args[i]);
            }
        }
        let resp;
        if (tracer && tracer.isEnabled) {
            resp = { traceId: tracer.id, seqId: tracer.seq, source: tracer.source, id: pkg.id, resp: args };
        }
        else {
            resp = { id: pkg.id, resp: args };
        }
        if (this.bufferMsg) {
            this.enqueue(socket, resp);
        }
        else {
            socket.write(socket.composer.compose(RES_TYPE, JSON.stringify(resp), null));
        }
    }
    processMsg(socket, pkg) {
        let tracer = null;
        if (this.rpcDebugLog) {
            tracer = new tracer_1.Tracer(this.rpcLogger, this.rpcDebugLog, pkg.remote, pkg.source, pkg.msg, pkg.id, pkg.seq);
            tracer.info('server', __filename, 'processMsg', 'tcp-acceptor receive message and try to process message');
        }
        if (tracer)
            this.cb(tracer, pkg.msg, pkg.id ? this.respCallback.bind(this, socket, pkg, tracer) : undefined);
    }
    processMsgs(socket, pkgs) {
        for (let i = 0, l = pkgs.length; i < l; i++) {
            this.processMsg(socket, pkgs[i]);
        }
    }
    enqueue(socket, msg) {
        let queue = this.msgQueues[socket.id];
        if (!queue) {
            queue = this.msgQueues[socket.id] = [];
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
            socket.write(socket.composer.compose(RES_TYPE, JSON.stringify(queue)));
            queues[socketId] = [];
        }
    }
}
exports.TCPAcceptor = TCPAcceptor;
/**
 * create acceptor
 *
 * @param opts init params
 * @param cb(tracer, msg, cb) callback function that would be invoked when new message arrives
 */
function create(opts, cb) {
    return new TCPAcceptor(opts || {}, cb);
}
exports.create = create;
process.on('SIGINT', function () {
    process.exit();
});
//# sourceMappingURL=tcp-acceptor.js.map