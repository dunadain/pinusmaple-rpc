"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WSMailBox = void 0;
const pinus_logger_1 = require("pinus-logger");
let logger = (0, pinus_logger_1.getLogger)('pinus-rpc', 'ws-mailbox');
const events_1 = require("events");
const constants_1 = require("../../util/constants");
const tracer_1 = require("../../util/tracer");
const socket_io_client_1 = require("socket.io-client");
class WSMailBox extends events_1.EventEmitter {
    constructor(server, opts) {
        super();
        this.curId = 0;
        this.requests = {};
        this.timeout = {};
        this.queue = [];
        this.connected = false;
        this.closed = false;
        this.id = server.id;
        this.host = server.host;
        this.port = server.port;
        this.bufferMsg = opts.bufferMsg;
        this.interval = opts.interval || constants_1.constants.DEFAULT_PARAM.INTERVAL;
        this.timeoutValue = opts.timeout || constants_1.constants.DEFAULT_PARAM.CALLBACK_TIMEOUT;
        this.opts = opts;
    }
    connect(tracer, cb) {
        tracer && tracer.info('client', __filename, 'connect', 'ws-mailbox try to connect');
        if (this.connected) {
            tracer && tracer.error('client', __filename, 'connect', 'mailbox has already connected');
            cb(new Error('mailbox has already connected.'));
            return;
        }
        let self = this;
        this.socket = (0, socket_io_client_1.io)(this.host + ':' + this.port, {
            'force new connection': true,
            'reconnect': false
        });
        this.socket.on('message', function (pkg) {
            try {
                if (pkg instanceof Array) {
                    self.processMsgs(self, pkg);
                }
                else {
                    self.processMsg(self, pkg);
                }
            }
            catch (err) {
                logger.error('rpc client process message with error: %s', err.stack);
            }
        });
        this.socket.on('connect', function () {
            if (self.connected) {
                return;
            }
            self.connected = true;
            if (self.bufferMsg) {
                self._interval = setInterval(function () {
                    self.flush(self);
                }, self.interval);
            }
            cb();
        });
        this.socket.on('error', function (err) {
            logger.error('rpc socket is error, remote server host: %s, port: %s', self.host, self.port);
            self.emit('close', self.id);
            cb(err);
        });
        this.socket.on('disconnect', function (reason) {
            logger.error('rpc socket is disconnect, reason: %s', reason);
            let reqs = self.requests, cb;
            for (let id in reqs) {
                cb = reqs[id];
                cb(tracer, new Error('disconnect with remote server.'));
            }
            self.emit('close', self.id);
        });
    }
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
        this.socket.disconnect();
    }
    /**
   * send message to remote server
   *
   * @param msg {service:"", method:"", args:[]}
   * @param opts {} attach info to send method
   * @param cb declaration decided by remote interface
   */
    send(tracer, msg, opts, cb) {
        tracer && tracer.info('client', __filename, 'send', 'ws-mailbox try to send');
        if (!this.connected) {
            tracer && tracer.error('client', __filename, 'send', 'ws-mailbox not init');
            cb(tracer, new Error('ws-mailbox is not init'));
            return;
        }
        if (this.closed) {
            tracer && tracer.error('client', __filename, 'send', 'mailbox has already closed');
            cb(tracer, new Error('ws-mailbox has already closed'));
            return;
        }
        let id = this.curId++;
        this.requests[id] = cb;
        this.setCbTimeout(this, id, tracer, cb);
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
            this.enqueue(this, pkg);
        }
        else {
            this.socket.emit('message', pkg);
        }
    }
    enqueue(mailbox, msg) {
        mailbox.queue.push(msg);
    }
    flush(mailbox) {
        if (mailbox.closed || !mailbox.queue.length) {
            return;
        }
        mailbox.socket.emit('message', mailbox.queue);
        mailbox.queue = [];
    }
    processMsgs(mailbox, pkgs) {
        for (let i = 0, l = pkgs.length; i < l; i++) {
            this.processMsg(mailbox, pkgs[i]);
        }
    }
    processMsg(mailbox, pkg) {
        this.clearCbTimeout(mailbox, pkg.id);
        let cb = mailbox.requests[pkg.id];
        if (!cb) {
            return;
        }
        delete mailbox.requests[pkg.id];
        let rpcDebugLog = mailbox.opts.rpcDebugLog;
        let tracer = null;
        let sendErr = null;
        if (rpcDebugLog) {
            tracer = new tracer_1.Tracer(mailbox.opts.rpcLogger, mailbox.opts.rpcDebugLog, mailbox.opts.clientId, pkg.source, pkg.resp, pkg.id, pkg.seq);
        }
        let pkgResp = pkg.resp;
        // let args = [tracer, null];
        // pkg.resp.forEach(function(arg){
        //   args.push(arg);
        // });
        cb(tracer, sendErr, pkgResp);
    }
    setCbTimeout(mailbox, id, tracer, cb) {
        let timer = setTimeout(() => {
            logger.warn('rpc request is timeout, id: %s, host: %s, port: %s', id, mailbox.host, mailbox.port);
            this.clearCbTimeout(mailbox, id);
            if (!!mailbox.requests[id]) {
                delete mailbox.requests[id];
            }
            logger.error('rpc callback timeout, remote server host: %s, port: %s', mailbox.host, mailbox.port);
            cb(tracer, new Error('rpc callback timeout'));
        }, mailbox.timeoutValue);
        mailbox.timeout[id] = timer;
    }
    clearCbTimeout(mailbox, id) {
        if (!mailbox.timeout[id]) {
            logger.warn('timer is not exsits, id: %s, host: %s, port: %s', id, mailbox.host, mailbox.port);
            return;
        }
        clearTimeout(mailbox.timeout[id]);
        delete mailbox.timeout[id];
    }
}
exports.WSMailBox = WSMailBox;
/**
 * Factory method to create mailbox
 *
 * @param {Object} server remote server info {id:"", host:"", port:""}
 * @param {Object} opts construct parameters
 *                      opts.bufferMsg {Boolean} msg should be buffered or send immediately.
 *                      opts.interval {Boolean} msg queue flush interval if bufferMsg is true. default is 50 ms
 */
module.exports.create = function (server, opts) {
    return new WSMailBox(server, opts || {});
};
//# sourceMappingURL=ws-mailbox.js.map