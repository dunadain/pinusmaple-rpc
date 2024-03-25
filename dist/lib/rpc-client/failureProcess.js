"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.failureProcess = void 0;
const pinus_logger_1 = require("pinus-logger");
let logger = (0, pinus_logger_1.getLogger)('pinus-rpc', 'failprocess');
const constants_1 = require("../util/constants");
function failureProcess(code, tracer, serverId, msg, opts) {
    let cb = tracer && tracer.cb;
    let mode = opts.failMode;
    let FAIL_MODE = constants_1.constants.FAIL_MODE;
    let method = failfast;
    if (mode === FAIL_MODE.FAILOVER) {
        method = failover;
    }
    else if (mode === FAIL_MODE.FAILBACK) {
        method = failback;
    }
    else if (mode === FAIL_MODE.FAILFAST) {
    }
    // switch (mode) {
    //     case constants.FAIL_MODE.FAILOVER:
    //         method = failover;
    //         break;
    //     case constants.FAIL_MODE.FAILBACK:
    //         method = failback;
    //         break;
    //     case constants.FAIL_MODE.FAILFAST:
    //         method = failfast;
    //         break;
    //     case constants.FAIL_MODE.FAILSAFE:
    //     default:
    //         method = failfast;
    //         break;
    // }
    method.call(this, Number(code), tracer, serverId, msg, opts, cb);
}
exports.failureProcess = failureProcess;
/**
 * Failover rpc failure process. This will try other servers with option retries.
 *
 * @param code {Number} error code number.
 * @param tracer {Object} current rpc tracer.
 * @param serverId {String} rpc remote target server id.
 * @param msg {Object} rpc message.
 * @param opts {Object} rpc client options.
 * @param cb {Function} user rpc callback.
 *
 * @api private
 */
let failover = function (code, tracer, serverId, msg, opts, cb) {
    let servers;
    let self = this;
    let counter = 0;
    let success = true;
    let serverType = msg.serverType;
    if (!tracer || !tracer.servers) {
        servers = self.serversMap[serverType];
    }
    else {
        servers = tracer.servers;
    }
    let index = servers.indexOf(serverId);
    if (index >= 0) {
        servers.splice(index, 1);
    }
    tracer && (tracer.servers = servers);
    if (!servers.length) {
        logger.error('[pinus-rpc] rpc failed with all this type of servers, with serverType: %s', serverType);
        cb(new Error('rpc failed with all this type of servers, with serverType: ' + serverType));
        return;
    }
    self.dispatch.call(self, tracer, servers[0], msg, opts, cb);
};
/**
 * Failsafe rpc failure process.
 *
 * @param code {Number} error code number.
 * @param tracer {Object} current rpc tracer.
 * @param serverId {String} rpc remote target server id.
 * @param msg {Object} rpc message.
 * @param opts {Object} rpc client options.
 * @param cb {Function} user rpc callback.
 *
 * @api private
 */
let failsafe = function (code, tracer, serverId, msg, opts, cb) {
    let self = this;
    let retryTimes = opts.retryTimes || constants_1.constants.DEFAULT_PARAM.FAILSAFE_RETRIES;
    let retryConnectTime = opts.retryConnectTime || constants_1.constants.DEFAULT_PARAM.FAILSAFE_CONNECT_TIME;
    if (!tracer.retryTimes) {
        tracer.retryTimes = 1;
    }
    else {
        tracer.retryTimes += 1;
    }
    switch (code) {
        case constants_1.constants.RPC_ERROR.SERVER_NOT_STARTED:
        case constants_1.constants.RPC_ERROR.NO_TRAGET_SERVER:
            cb(new Error('rpc client is not started or cannot find remote server.'));
            break;
        case constants_1.constants.RPC_ERROR.FAIL_CONNECT_SERVER:
            if (tracer.retryTimes <= retryTimes) {
                setTimeout(function () {
                    self.connect(tracer, serverId, cb);
                }, retryConnectTime * tracer.retryTimes);
            }
            else {
                cb(new Error('rpc client failed to connect to remote server: ' + serverId));
            }
            break;
        case constants_1.constants.RPC_ERROR.FAIL_FIND_MAILBOX:
        case constants_1.constants.RPC_ERROR.FAIL_SEND_MESSAGE:
            if (tracer.retryTimes <= retryTimes) {
                setTimeout(function () {
                    self.dispatch.call(self, tracer, serverId, msg, opts, cb);
                }, retryConnectTime * tracer.retryTimes);
            }
            else {
                cb(new Error('rpc client failed to send message to remote server: ' + serverId));
            }
            break;
        case constants_1.constants.RPC_ERROR.FILTER_ERROR:
            cb(new Error('rpc client filter encounters error.'));
            break;
        default:
            cb(new Error('rpc client unknown error.'));
    }
};
/**
 * Failback rpc failure process. This will try the same server with sendInterval option and retries option.
 *
 * @param code {Number} error code number.
 * @param tracer {Object} current rpc tracer.
 * @param serverId {String} rpc remote target server id.
 * @param msg {Object} rpc message.
 * @param opts {Object} rpc client options.
 * @param cb {Function} user rpc callback.
 *
 * @api private
 */
let failback = function (code, tracer, serverId, msg, opts, cb) {
    // todo record message in background and send the message at timing
};
/**
 * Failfast rpc failure process. This will ignore error in rpc client.
 *
 * @param code {Number} error code number.
 * @param tracer {Object} current rpc tracer.
 * @param serverId {String} rpc remote target server id.
 * @param msg {Object} rpc message.
 * @param opts {Object} rpc client options.
 * @param cb {Function} user rpc callback.
 *
 * @api private
 */
let failfast = function (code, tracer, serverId, msg, opts, cb) {
    logger.error('rpc failed with error, remote server: %s, msg: %j, error code: %s', serverId, msg, code);
    cb && cb(new Error('rpc failed with error code: ' + code));
};
//# sourceMappingURL=failureProcess.js.map