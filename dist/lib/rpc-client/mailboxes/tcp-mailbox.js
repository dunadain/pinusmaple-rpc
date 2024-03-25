"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.create = exports.TCPMailBox = void 0;
const pinus_logger_1 = require("pinus-logger");
let logger = (0, pinus_logger_1.getLogger)('pinus-rpc', 'mqtt2-mailbox');
const events_1 = require("events");
const tracer_1 = require("../../util/tracer");
const utils = require("../../util/utils");
const composer_1 = require("../../util/composer");
const net = require("net");
const DEFAULT_CALLBACK_TIMEOUT = 10 * 1000;
const DEFAULT_INTERVAL = 50;
const MSG_TYPE = 0;
const PING = 1;
const PONG = 2;
class TCPMailBox extends events_1.EventEmitter {
    constructor(serverInfo, opts) {
        super();
        this.curId = 0;
        this.requests = {};
        this.timeout = {};
        this.queue = [];
        this.connected = false;
        this.closed = false;
        this.socket = null;
        this.opts = opts || {};
        this.id = serverInfo.id;
        this.host = serverInfo.host;
        this.port = serverInfo.port;
        this.composer = new composer_1.Composer({
            maxLength: opts.pkgSize
        });
        this.bufferMsg = opts.bufferMsg;
        this.interval = opts.interval || DEFAULT_INTERVAL;
        this.timeoutValue = opts.timeout || DEFAULT_CALLBACK_TIMEOUT;
        // Heartbeat ping interval.
        this.ping = 'ping' in opts ? opts.ping : 25e3;
        // Heartbeat pong response timeout.
        this.pong = 'pong' in opts ? opts.pong : 10e3;
        this.timer = {};
        this.connected = false;
    }
    connect(tracer, cb) {
        tracer && tracer.info('client', __filename, 'connect', 'tcp-mailbox try to connect');
        if (this.connected) {
            utils.invokeCallback(cb, new Error('mailbox has already connected.'));
            return;
        }
        this.socket = net.connect(this.port, this.host, () => {
            // success to connect
            this.connected = true;
            this.closed = false;
            if (this.bufferMsg) {
                // start flush interval
                this._interval = setInterval(() => {
                    this.flush();
                }, this.interval);
            }
            this.heartbeat();
            utils.invokeCallback(cb, null);
        });
        this.composer.on('data', (data) => {
            if (data[0] === PONG) {
                // incoming::pong
                this.heartbeat();
                return;
            }
            try {
                const pkg = JSON.parse(data.toString('utf-8', 1));
                if (pkg instanceof Array) {
                    this.processMsgs(pkg);
                }
                else {
                    this.processMsg(pkg);
                }
            }
            catch (err) {
                if (err) {
                    logger.error('[pinus-rpc] tcp mailbox process data error: %j', err.stack);
                }
            }
        });
        this.socket.on('data', (data) => {
            this.composer.feed(data);
        });
        this.socket.on('error', (err) => {
            if (!this.connected) {
                utils.invokeCallback(cb, err);
                return;
            }
            //   this.emit('error', err, this);
            this.emit('close', this.id);
        });
        this.socket.on('end', () => {
            this.emit('close', this.id);
        });
        // TODO: reconnect and heartbeat
    }
    /**
     * close mailbox
     */
    close() {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.connected = false;
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
        if (Object.keys(this.timer).length) {
            if (this.timer['ping']) {
                clearTimeout(this.timer['ping']);
                delete this.timer['ping'];
            }
            if (this.timer['pong']) {
                clearTimeout(this.timer['pong']);
                delete this.timer['pong'];
            }
        }
        if (this.socket) {
            this.socket.removeAllListeners();
            this.composer.removeAllListeners();
            this.socket.destroy();
            this.socket = null;
        }
    }
    /**
     * send message to remote server
     *
     * @param msg {service:"", method:"", args:[]}
     * @param opts {} attach info to send method
     * @param cb declaration decided by remote interface
     */
    send(tracer, msg, opts, cb) {
        tracer && tracer.info('client', __filename, 'send', 'tcp-mailbox try to send');
        if (!this.connected) {
            utils.invokeCallback(cb, new Error('not init.'));
            return;
        }
        if (this.closed) {
            utils.invokeCallback(cb, new Error('mailbox alread closed.'));
            return;
        }
        let id = 0;
        if (cb) {
            id = this.curId++ & 0xffffffff;
            if (!id) {
                id = this.curId++ & 0xffffffff;
            }
            this.requests[id] = cb;
            this.setCbTimeout(id, tracer, cb);
        }
        let pkg;
        if (tracer && tracer.isEnabled) {
            pkg = {
                traceId: tracer.id,
                seqId: tracer.seq,
                source: tracer.source,
                remote: tracer.remote,
                id: id,
                msg: msg
            };
        }
        else {
            pkg = {
                id: id,
                msg: msg
            };
        }
        if (this.bufferMsg) {
            this.enqueue(pkg);
        }
        else {
            this.socket.write(this.composer.compose(MSG_TYPE, JSON.stringify(pkg), id));
        }
    }
    /*
     * Send a new heartbeat over the connection to ensure that we're still
     * connected and our internet connection didn't drop. We cannot use server side
     * heartbeats for this unfortunately.
     * @api private
     */
    heartbeat() {
        if (!this.ping)
            return;
        if (this.timer['pong']) {
            clearTimeout(this.timer['pong']);
            delete this.timer['pong'];
        }
        if (!this.timer['ping']) {
            this.timer['ping'] = setTimeout(ping, this.ping);
        }
        const self = this;
        /**
         * Exterminate the connection as we've timed out.
         *
         * @api private
         */
        function pong() {
            if (self.timer['pong']) {
                clearTimeout(self.timer['pong']);
                delete self.timer['pong'];
            }
            self.emit('close', self.id);
            logger.warn('pong timeout');
        }
        /**
         * We should send a ping message to the server.
         *
         * @api private
         */
        function ping() {
            if (self.timer['ping']) {
                clearTimeout(self.timer['ping']);
                delete self.timer['ping'];
            }
            self.socket.write(self.composer.compose(PING));
            self.timer['pong'] = setTimeout(pong, self.pong);
        }
    }
    enqueue(msg) {
        this.queue.push(msg);
    }
    flush() {
        if (this.closed || !this.queue.length) {
            return;
        }
        this.socket.write(this.composer.compose(MSG_TYPE, JSON.stringify(this.queue), this.queue[0].id));
        this.queue = [];
    }
    processMsgs(pkgs) {
        for (let i = 0, l = pkgs.length; i < l; i++) {
            this.processMsg(pkgs[i]);
        }
    }
    processMsg(pkg) {
        this.clearCbTimeout(pkg.id);
        let cb = this.requests[pkg.id];
        if (!cb) {
            return;
        }
        delete this.requests[pkg.id];
        let tracer = null;
        if (this.opts.rpcDebugLog) {
            tracer = new tracer_1.Tracer(this.opts.rpcLogger, this.opts.rpcDebugLog, this.opts.clientId, pkg.source, pkg.resp, pkg.id, pkg.seq);
        }
        cb(tracer, null, pkg.resp);
    }
    setCbTimeout(id, tracer, cb) {
        const timer = setTimeout(() => {
            this.clearCbTimeout(id);
            if (!!this.requests[id]) {
                delete this.requests[id];
            }
            logger.error('rpc callback timeout, remote server host: %s, port: %s', this.host, this.port);
            if (cb) {
                cb(tracer, new Error('rpc callback timeout'));
            }
        }, this.timeoutValue);
        this.timeout[id] = timer;
    }
    clearCbTimeout(id) {
        if (!this.timeout[id]) {
            logger.warn('timer not exists, id: %s', id);
            return;
        }
        clearTimeout(this.timeout[id]);
        delete this.timeout[id];
    }
}
exports.TCPMailBox = TCPMailBox;
/**
 * Factory method to create mailbox
 *
 * @param {Object} server remote server info {id:"", host:"", port:""}
 * @param {Object} opts construct parameters
 *                      opts.bufferMsg {Boolean} msg should be buffered or send immediately.
 *                      opts.interval {Boolean} msg queue flush interval if bufferMsg is true. default is 50 ms
 */
const create = function (server, opts) {
    return new TCPMailBox(server, opts || {});
};
exports.create = create;
//# sourceMappingURL=tcp-mailbox.js.map