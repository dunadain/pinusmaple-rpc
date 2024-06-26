"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMailStation = exports.MailStation = void 0;
const pinus_logger_1 = require("pinus-logger");
let logger = (0, pinus_logger_1.getLogger)('pinus-rpc', 'MailStation');
const events_1 = require("events");
// import * as blackhole from './mailboxes/blackhole';
const mailbox_1 = require("./mailbox");
const constants_1 = require("../util/constants");
const utils = require("../util/utils");
let STATE_INITED = 1; // station has inited
let STATE_STARTED = 2; // station has started
let STATE_CLOSED = 3; // station has closed
/**
 * Mail station constructor.
 *
 * @param {Object} opts construct parameters
 */
class MailStation extends events_1.EventEmitter {
    constructor(opts) {
        var _a, _b;
        super();
        this.servers = {}; // remote server info map, key: server id, value: info
        this.serversMap = {}; // remote server info map, key: serverType, value: servers array
        this.onlines = {}; // remote server online map, key: server id, value: 0/offline 1/online
        // filters
        this.befores = [];
        this.afters = [];
        // pending request queues
        this.pendings = {};
        // connecting remote server mailbox map
        this.connecting = {};
        // working mailbox map
        this.mailboxes = {};
        this.state = STATE_INITED;
        this.opts = opts;
        this.mailboxFactory = (_a = opts === null || opts === void 0 ? void 0 : opts.mailboxFactory) !== null && _a !== void 0 ? _a : mailbox_1.createMqttMailBox;
        this.pendingSize = (_b = opts === null || opts === void 0 ? void 0 : opts.pendingSize) !== null && _b !== void 0 ? _b : constants_1.constants.DEFAULT_PARAM.DEFAULT_PENDING_SIZE;
    }
    /**
     * Init and start station. Connect all mailbox to remote servers.
     *
     * @param  {Function} cb(err) callback function
     * @return {Void}
     */
    start(cb) {
        if (this.state > STATE_INITED) {
            cb(new Error('station has started.'));
            return;
        }
        let self = this;
        process.nextTick(function () {
            self.state = STATE_STARTED;
            cb();
        });
    }
    /**
     * Stop station and all its mailboxes
     *
     * @param  {Boolean} force whether stop station forcely
     * @return {Void}
     */
    stop(force) {
        if (this.state !== STATE_STARTED) {
            logger.warn('[pinus-rpc] client is not running now.');
            return;
        }
        this.state = STATE_CLOSED;
        let self = this;
        function closeAll() {
            for (let id in self.mailboxes) {
                self.mailboxes[id].close();
            }
        }
        if (force) {
            closeAll();
        }
        else {
            setTimeout(closeAll, constants_1.constants.DEFAULT_PARAM.GRACE_TIMEOUT);
        }
    }
    /**
     * Add a new server info into the mail station and clear
     * the blackhole associated with the server id if any before.
     *
     * @param {Object} serverInfo server info such as {id, host, port}
     */
    addServer(serverInfo) {
        if (!serverInfo || !serverInfo.id) {
            return;
        }
        let id = serverInfo.id;
        let type = serverInfo.serverType;
        this.servers[id] = serverInfo;
        this.onlines[id] = 1;
        if (!this.serversMap[type]) {
            this.serversMap[type] = [];
        }
        if (this.serversMap[type].indexOf(id) < 0) {
            this.serversMap[type].push(id);
        }
        this.emit('addServer', id);
    }
    /**
     * Batch version for add new server info.
     *
     * @param {Array} serverInfos server info list
     */
    addServers(serverInfos) {
        if (!serverInfos || !serverInfos.length) {
            return;
        }
        for (let i = 0, l = serverInfos.length; i < l; i++) {
            this.addServer(serverInfos[i]);
        }
    }
    /**
     * Remove a server info from the mail station and remove
     * the mailbox instance associated with the server id.
     *
     * @param  {String|Number} id server id
     */
    removeServer(id) {
        this.onlines[id] = 0;
        let mailbox = this.mailboxes[id];
        if (mailbox) {
            mailbox.close();
            delete this.mailboxes[id];
        }
        this.emit('removeServer', id);
    }
    /**
     * Batch version for remove remote servers.
     *
     * @param  {Array} ids server id list
     */
    removeServers(ids) {
        if (!ids || !ids.length) {
            return;
        }
        for (let i = 0, l = ids.length; i < l; i++) {
            this.removeServer(ids[i]);
        }
    }
    /**
     * Clear station infomation.
     *
     */
    clearStation() {
        this.onlines = {};
        this.serversMap = {};
    }
    /**
     * Replace remote servers info.
     *
     * @param {Array} serverInfos server info list
     */
    replaceServers(serverInfos) {
        this.clearStation();
        if (!serverInfos || !serverInfos.length) {
            return;
        }
        for (let i = 0, l = serverInfos.length; i < l; i++) {
            let id = serverInfos[i].id;
            let type = serverInfos[i].serverType;
            this.onlines[id] = 1;
            if (!this.serversMap[type]) {
                this.serversMap[type] = [];
            }
            this.servers[id] = serverInfos[i];
            if (this.serversMap[type].indexOf(id) < 0) {
                this.serversMap[type].push(id);
            }
        }
    }
    /**
     * Dispatch rpc message to the mailbox
     *
     * @param  {Object}   tracer   rpc debug tracer
     * @param  {String}   serverId remote server id
     * @param  {Object}   msg      rpc invoke message
     * @param  {Object}   opts     rpc invoke option args
     * @param  {Function} cb       callback function
     * @return {Void}
     */
    dispatch(tracer, serverId, msg, opts, cb) {
        tracer && tracer.info('client', __filename, 'dispatch', 'dispatch rpc message to the mailbox');
        // tracer && (tracer.cb = cb);
        if (this.state !== STATE_STARTED) {
            tracer && tracer.error('client', __filename, 'dispatch', 'client is not running now');
            logger.error('[pinus-rpc] client is not running now.');
            this.emit('error', constants_1.constants.RPC_ERROR.SERVER_NOT_STARTED, tracer, serverId, msg, opts);
            return;
        }
        let self = this;
        let mailbox = this.mailboxes[serverId];
        if (!mailbox) {
            tracer && tracer.debug('client', __filename, 'dispatch', 'mailbox is not exist');
            // try to connect remote server if mailbox instance not exist yet
            if (!lazyConnect(tracer, this, serverId, this.mailboxFactory, cb)) {
                tracer && tracer.error('client', __filename, 'dispatch', 'fail to find remote server:' + serverId);
                logger.error('[pinus-rpc] fail to find remote server:' + serverId);
                self.emit('error', constants_1.constants.RPC_ERROR.NO_TRAGET_SERVER, tracer, serverId, msg, opts);
            }
            // push request to the pending queue
            addToPending(tracer, this, serverId, arguments);
            return;
        }
        if (this.connecting[serverId]) {
            tracer && tracer.debug('client', __filename, 'dispatch', 'request add to connecting');
            // if the mailbox is connecting to remote server
            addToPending(tracer, this, serverId, arguments);
            return;
        }
        let send = function (tracer, err, serverId, msg, opts) {
            tracer && tracer.info('client', __filename, 'send', 'get corresponding mailbox and try to send message');
            let mailbox = self.mailboxes[serverId];
            if (err) {
                return errorHandler(tracer, self, err, serverId, msg, opts, true, cb);
            }
            if (!mailbox) {
                tracer && tracer.error('client', __filename, 'send', 'can not find mailbox with id:' + serverId);
                logger.error('[pinus-rpc] could not find mailbox with id:' + serverId);
                self.emit('error', constants_1.constants.RPC_ERROR.FAIL_FIND_MAILBOX, tracer, serverId, msg, opts);
                return;
            }
            mailbox.send(tracer, msg, opts, cb ? function (tracer_send, send_err, args) {
                // let tracer_send = arguments[0];
                // let send_err = arguments[1];
                if (send_err) {
                    logger.error('[pinus-rpc] fail to send message %s', send_err.stack || send_err.message);
                    self.emit('error', constants_1.constants.RPC_ERROR.FAIL_SEND_MESSAGE, tracer, serverId, msg, opts);
                    cb && cb(send_err);
                    // utils.applyCallback(cb, send_err);
                    return;
                }
                // let args = arguments[2];
                doFilter(tracer_send, null, serverId, msg, opts, self.afters, 0, 'after', function (tracer, err, serverId, msg, opts) {
                    if (err) {
                        errorHandler(tracer, self, err, serverId, msg, opts, false, cb);
                    }
                    utils.applyCallback(cb, args);
                });
            } : null);
        };
        doFilter(tracer, null, serverId, msg, opts, this.befores, 0, 'before', send);
    }
    /**
     * Add a before filter
     *
     * @param  {[type]} filter [description]
     * @return {[type]}        [description]
     */
    before(filter) {
        if (Array.isArray(filter)) {
            this.befores = this.befores.concat(filter);
            return;
        }
        this.befores.push(filter);
    }
    /**
     * Add after filter
     *
     * @param  {[type]} filter [description]
     * @return {[type]}        [description]
     */
    after(filter) {
        if (Array.isArray(filter)) {
            this.afters = this.afters.concat(filter);
            return;
        }
        this.afters.push(filter);
    }
    /**
     * Add before and after filter
     *
     * @param  {[type]} filter [description]
     * @return {[type]}        [description]
     */
    filter(filter) {
        this.befores.push(filter);
        this.afters.push(filter);
    }
    /**
     * Try to connect to remote server
     *
     * @param  {Object}   tracer   rpc debug tracer
     * @return {String}   serverId remote server id
     * @param  {Function}   cb     callback function
     */
    connect(tracer, serverId, cb) {
        let self = this;
        let mailbox = self.mailboxes[serverId];
        mailbox.connect(tracer, function (err) {
            if (!!err) {
                tracer && tracer.error('client', __filename, 'lazyConnect', 'fail to connect to remote server: ' + serverId);
                logger.error('[pinus-rpc] mailbox fail to connect to remote server: ' + serverId);
                if (!!self.mailboxes[serverId]) {
                    delete self.mailboxes[serverId];
                }
                self.emit('error', constants_1.constants.RPC_ERROR.FAIL_CONNECT_SERVER, tracer, serverId, null, self.opts);
                return;
            }
            mailbox.on('close', function (id) {
                let mbox = self.mailboxes[id];
                if (!!mbox) {
                    mbox.close();
                    delete self.mailboxes[id];
                }
                self.emit('close', id);
            });
            delete self.connecting[serverId];
            flushPending(tracer, self, serverId);
        });
    }
}
exports.MailStation = MailStation;
/**
 * Do before or after filter
 */
let doFilter = function (tracer, err, serverId, msg, opts, filters, index, operate, cb) {
    if (index < filters.length) {
        tracer && tracer.info('client', __filename, 'doFilter', 'do ' + operate + ' filter ' + filters[index].name);
    }
    if (index >= filters.length || !!err) {
        cb(tracer, err, serverId, msg, opts);
        return;
    }
    let filter = filters[index];
    if (typeof filter === 'function') {
        filter(serverId, msg, opts, function (target, message, options) {
            index++;
            // compatible for pinus filter next(err) method
            if (utils.getObjectClass(target) === 'Error') {
                doFilter(tracer, target, serverId, msg, opts, filters, index, operate, cb);
            }
            else {
                doFilter(tracer, null, target || serverId, message || msg, options || opts, filters, index, operate, cb);
            }
        });
        return;
    }
    if (typeof filter[operate] === 'function') {
        filter[operate](serverId, msg, opts, function (target, message, options) {
            index++;
            if (utils.getObjectClass(target) === 'Error') {
                doFilter(tracer, target, serverId, msg, opts, filters, index, operate, cb);
            }
            else {
                doFilter(tracer, null, target ? target.toString() : serverId, message || msg, options || opts, filters, index, operate, cb);
            }
        });
        return;
    }
    index++;
    doFilter(tracer, err, serverId, msg, opts, filters, index, operate, cb);
};
let lazyConnect = function (tracer, station, serverId, factory, cb) {
    tracer && tracer.info('client', __filename, 'lazyConnect', 'create mailbox and try to connect to remote server');
    let server = station.servers[serverId];
    let online = station.onlines[serverId];
    if (!server) {
        logger.error('[pinus-rpc] unknown server: %s', serverId);
        return false;
    }
    if (!online || online !== 1) {
        logger.error('[pinus-rpc] server is not online: %s', serverId);
        return false;
    }
    let mailbox = factory(server, station.opts);
    station.connecting[serverId] = true;
    station.mailboxes[serverId] = mailbox;
    station.connect(tracer, serverId, cb);
    return true;
};
let addToPending = function (tracer, station, serverId, args) {
    tracer && tracer.info('client', __filename, 'addToPending', 'add pending requests to pending queue');
    let pending = station.pendings[serverId];
    if (!pending) {
        pending = station.pendings[serverId] = [];
    }
    if (pending.length > station.pendingSize) {
        tracer && tracer.debug('client', __filename, 'addToPending', 'station pending too much for: ' + serverId);
        logger.warn('[pinus-rpc] station pending too much for: %s', serverId);
        return;
    }
    pending.push(args);
};
let flushPending = function (tracer, station, serverId, cb) {
    tracer && tracer.info('client', __filename, 'flushPending', 'flush pending requests to dispatch method');
    let pending = station.pendings[serverId];
    let mailbox = station.mailboxes[serverId];
    if (!pending || !pending.length) {
        return;
    }
    if (!mailbox) {
        tracer && tracer.error('client', __filename, 'flushPending', 'fail to flush pending messages for empty mailbox: ' + serverId);
        logger.error('[pinus-rpc] fail to flush pending messages for empty mailbox: ' + serverId);
    }
    for (let i = 0, l = pending.length; i < l; i++) {
        station.dispatch.apply(station, pending[i]);
    }
    delete station.pendings[serverId];
};
let errorHandler = function (tracer, station, err, serverId, msg, opts, flag, cb) {
    if (!!station.handleError) {
        station.handleError(err, serverId, msg, opts);
    }
    else {
        logger.error('[pinus-rpc] rpc filter error with serverId: %s, err: %j', serverId, err.stack);
        station.emit('error', constants_1.constants.RPC_ERROR.FILTER_ERROR, tracer, serverId, msg, opts);
    }
};
/**
 * Mail station factory function.
 *
 * @param  {Object} opts? construct paramters
 *           opts.servers {Object} global server info map. {serverType: [{id, host, port, ...}, ...]}
 *           opts.mailboxFactory {Function} mailbox factory function
 * @return {Object}      mail station instance
 */
function createMailStation(opts) {
    return new MailStation(opts || {});
}
exports.createMailStation = createMailStation;
//# sourceMappingURL=mailstation.js.map