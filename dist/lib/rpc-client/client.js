"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClient = exports.RpcClient = void 0;
const pinus_logger_1 = require("pinus-logger");
const failureProcess_1 = require("./failureProcess");
const constants_1 = require("../util/constants");
const Station = require("./mailstation");
const tracer_1 = require("../util/tracer");
const Loader = require("pinus-loader");
const pinus_loader_1 = require("pinus-loader");
const utils_1 = require("../util/utils");
const router = require("./router");
const async = require("async");
let logger = (0, pinus_logger_1.getLogger)('pinus-rpc', 'rpc-client');
/**
 * Client states
 */
let STATE_INITED = 1; // client has inited
let STATE_STARTED = 2; // client has started
let STATE_CLOSED = 3; // client has closed
/**
 * RPC Client Class
 */
class RpcClient {
    constructor(opts) {
        opts = opts || {};
        this._context = opts.context;
        this._routeContext = opts.routeContext;
        this.router = (opts.router || router.df);
        this.routerType = opts.routerType;
        this.rpcDebugLog = !!opts.rpcDebugLog;
        if (this._context) {
            opts.clientId = this._context.serverId;
        }
        this.opts = opts;
        this.proxies = {};
        this.targetRouterFunction = this.getRouteFunction();
        this._station = createStation(opts);
        this.state = STATE_INITED;
    }
    /**
     * Start the rpc client which would try to connect the remote servers and
     * report the result by cb.
     *
     * @param cb {Function} cb(err)
     */
    start(cb) {
        if (this.state > STATE_INITED) {
            cb(new Error('rpc client has started.'));
            return;
        }
        let self = this;
        this._station.start(function (err) {
            if (err) {
                logger.error('[pinus-rpc] client start fail for ' + err.stack);
                return cb(err);
            }
            self._station.on('error', failureProcess_1.failureProcess.bind(self._station));
            self.state = STATE_STARTED;
            cb();
        });
    }
    /**
     * Stop the rpc client.
     *
     * @param  {Boolean} force
     * @return {Void}
     */
    stop(force) {
        if (this.state !== STATE_STARTED) {
            logger.warn('[pinus-rpc] client is not running now.');
            return;
        }
        this.state = STATE_CLOSED;
        this._station.stop(force);
    }
    /**
     * Add a new proxy to the rpc client which would overrid the proxy under the
     * same key.
     *
     * @param {Object} record proxy description record, format:
     *                        {namespace, serverType, path}
     */
    addProxy(record) {
        if (!record) {
            return;
        }
        let proxy = this.generateProxy(record, this._context);
        if (!proxy) {
            return;
        }
        insertProxy(this.proxies, record.namespace, record.serverType, proxy);
    }
    /**
     * Batch version for addProxy.
     *
     * @param {Array} records list of proxy description record
     */
    addProxies(records) {
        if (!records || !records.length) {
            return;
        }
        for (let i = 0, l = records.length; i < l; i++) {
            this.addProxy(records[i]);
        }
    }
    /**
     * Add new remote server to the rpc client.
     *
     * @param {Object} server new server information
     */
    addServer(server) {
        this._station.addServer(server);
    }
    /**
     * Batch version for add new remote server.
     *
     * @param {Array} servers server info list
     */
    addServers(servers) {
        this._station.addServers(servers);
    }
    /**
     * Remove remote server from the rpc client.
     *
     * @param  {String|Number} id server id
     */
    removeServer(id) {
        this._station.removeServer(id);
    }
    /**
     * Batch version for remove remote server.
     *
     * @param  {Array} ids remote server id list
     */
    removeServers(ids) {
        this._station.removeServers(ids);
    }
    /**
     * Replace remote servers.
     *
     * @param {Array} servers server info list
     */
    replaceServers(servers) {
        this._station.replaceServers(servers);
    }
    /**
     * Do the rpc invoke directly.
     *
     * @param serverId {String} remote server id
     * @param msg {Object} rpc message. Message format:
     *    {serverType: serverType, service: serviceName, method: methodName, args: arguments}
     * @param cb {Function} cb(err, ...)
     */
    rpcInvoke(serverId, msg, cb) {
        let rpcDebugLog = this.rpcDebugLog;
        let tracer;
        if (rpcDebugLog) {
            tracer = new tracer_1.Tracer(this.opts.rpcLogger, !!this.opts.rpcDebugLog, this.opts.clientId, serverId, msg);
            tracer.info('client', __filename, 'rpcInvoke', 'the entrance of rpc invoke');
        }
        if (this.state !== STATE_STARTED) {
            tracer && tracer.error('client', __filename, 'rpcInvoke', 'fail to do rpc invoke for client is not running');
            logger.error('[pinus-rpc] fail to do rpc invoke for client is not running');
            cb ? cb(new Error('[pinus-rpc] fail to do rpc invoke for client is not running')) : null;
            return;
        }
        if (tracer)
            this._station.dispatch(tracer, serverId, msg, this.opts, cb);
    }
    /**
     * Add rpc before filter.
     *
     * @param filter {Function} rpc before filter function.
     *
     * @api public
     */
    before(filter) {
        this._station.before(filter);
    }
    /**
     * Add rpc after filter.
     *
     * @param filter {Function} rpc after filter function.
     *
     * @api public
     */
    after(filter) {
        this._station.after(filter);
    }
    /**
     * Add rpc filter.
     *
     * @param filter {Function} rpc filter function.
     *
     * @api public
     */
    filter(filter) {
        this._station.filter(filter);
    }
    /**
     * Set rpc filter error handler.
     *
     * @param handler {Function} rpc filter error handler function.
     *
     * @api public
     */
    setErrorHandler(handler) {
        this._station.handleError = handler;
    }
    /**
     * Generate prxoy for function type field
     *
     * @param client {Object} current client instance.
     * @param serviceName {String} delegated service name.
     * @param methodName {String} delegated method name.
     * @param args {Object} rpc invoke arguments.
     * @param attach {Object} attach parameter pass to proxyCB.
     * @param isToSpecifiedServer {boolean} true means rpc route to specified remote server.
     *
     * @api private
     */
    rpcToRoute(routeParam, serviceName, methodName, args, attach, notify = false) {
        if (this.state !== STATE_STARTED) {
            return Promise.reject(new Error('[pinus-rpc] fail to invoke rpc proxy for client is not running'));
        }
        let serverType = attach.serverType;
        let msg = {
            namespace: attach.namespace,
            serverType: serverType,
            service: serviceName,
            method: methodName,
            args: args
        };
        return new Promise((resolve, reject) => {
            if (this.targetRouterFunction) {
                this.targetRouterFunction(serverType, msg, routeParam, (err, serverId) => {
                    if (err) {
                        return reject(err);
                    }
                    let cb = notify ? undefined : (err, resp) => err ? reject(err) : resolve(resp);
                    this.rpcInvoke(serverId, msg, cb);
                    if (notify) {
                        resolve(null);
                    }
                });
            }
        });
    }
    /**
     * Rpc to specified server id or servers.
     *
     * @param client     {Object} current client instance.
     * @param msg        {Object} rpc message.
     * @param serverType {String} remote server type.
     * @param serverId   {Object} mailbox init context parameter.
     * @param cb        {Function} AsyncResultArrayCallback<{}, {}>
     *
     * @api private
     */
    rpcToSpecifiedServer(serverId, serviceName, methodName, args, attach, notify = false) {
        if (this.state !== STATE_STARTED) {
            return Promise.reject(new Error('[pinus-rpc] fail to invoke rpc proxy for client is not running'));
        }
        let serverType = attach.serverType;
        let msg = {
            namespace: attach.namespace,
            serverType: serverType,
            service: serviceName,
            method: methodName,
            args: args
        };
        return new Promise((resolve, reject) => {
            if (typeof serverId !== 'string') {
                logger.error('[pinus-rpc] serverId is not a string : %s', serverId);
                return;
            }
            let cb = notify ? undefined : ((err, resp) => err ? reject(err) : resolve(resp));
            if (serverId === '*') {
                // (client._routeContext as RouteContextClass).getServersByType(serverType);
                let servers;
                if (this._routeContext && this._routeContext.getServersByType) {
                    const serverinfos = this._routeContext.getServersByType(serverType);
                    if (serverinfos) {
                        servers = serverinfos.map(v => v.id);
                    }
                }
                else {
                    servers = this._station.serversMap[serverType];
                }
                //   console.log('servers  ', servers);
                if (!servers) {
                    logger.error('[pinus-rpc] serverType %s servers not exist', serverType);
                    return;
                }
                async.map(servers, (serverId, next) => {
                    this.rpcInvoke(serverId, msg, cb ? next : undefined);
                    if (!cb) {
                        next();
                    }
                }, cb);
            }
            else {
                this.rpcInvoke(serverId, msg, cb);
            }
            if (notify) {
                return resolve(null);
            }
        });
    }
    /**
     * Generate proxies for remote servers.
     *
     * @param client {Object} current client instance.
     * @param record {Object} proxy reocrd info. {namespace, serverType, path}
     * @param context {Object} mailbox init context parameter
     *
     * @api private
     */
    generateProxy(record, context) {
        if (!record) {
            return;
        }
        if (this.opts.dynamicUserProxy && record.namespace === 'user') {
            const self = this;
            let res = {};
            res = new Proxy(res, {
                get(target, remoterName) {
                    if (target[remoterName]) {
                        return target[remoterName];
                    }
                    target[remoterName] = {};
                    target[remoterName] = new Proxy(target[remoterName], {
                        get(target, attr) {
                            if (target[attr]) {
                                return target[attr];
                            }
                            // get attr
                            target[attr] = self.genFunctionProxy(remoterName, attr, null, record);
                            return target[attr];
                        }
                    });
                    return target[remoterName];
                }
            });
            return res;
        }
        let res, name;
        let modules = Loader.load(record.path, context, false, false, pinus_loader_1.LoaderPathType.PINUS_REMOTER);
        if (modules) {
            res = {};
            for (name in modules) {
                res[name] = this.genObjectProxy(name, modules[name], record);
            }
        }
        return res;
    }
    /**
     * Create proxy.
     * @param  serviceName {String} deletgated service name
     * @param  origin {Object} delegated object
     * @param  attach {Object} attach parameter pass to proxyCB
     * @return {Object}      proxy instance
     */
    genObjectProxy(serviceName, origin, attach) {
        // generate proxy for function field
        let res = {};
        let proto = (0, utils_1.listEs6ClassMethods)(origin, this.opts.containParentMethod);
        for (let field of proto) {
            res[field] = this.genFunctionProxy(serviceName, field, origin, attach);
        }
        return res;
    }
    /**
     * Generate prxoy for function type field
     *
     * @param namespace {String} current namespace
     * @param serverType {String} server type string
     * @param serviceName {String} delegated service name
     * @param methodName {String} delegated method name
     * @param origin {Object} origin object
     * @param proxyCB {Functoin} proxy callback function
     * @returns function proxy
     */
    genFunctionProxy(serviceName, methodName, origin, attach) {
        let self = this;
        return (function () {
            // 兼容旧的api
            let proxy = function () {
                let len = arguments.length;
                if (len < 1) {
                    logger.error('[pinus-rpc] invalid rpc invoke, arguments length less than 1, namespace: %j, serverType, %j, serviceName: %j, methodName: %j', attach.namespace, attach.serverType, serviceName, methodName);
                    return Promise.reject(new Error('[pinus-rpc] invalid rpc invoke, arguments length less than 1'));
                }
                let routeParam = arguments[0];
                let args = new Array(len - 1);
                for (let i = 1; i < len; i++) {
                    args[i - 1] = arguments[i];
                }
                return self.rpcToRoute(routeParam, serviceName, methodName, args, attach);
            };
            // 新的api，通过路由参数决定发往哪个服务器
            proxy.route = (routeParam, notify) => {
                return function (...args) {
                    return self.rpcToRoute(routeParam, serviceName, methodName, args, attach, notify);
                };
            };
            // 新的api，发往指定的服务器id
            proxy.to = (serverId, notify) => {
                return function (...args) {
                    return self.rpcToSpecifiedServer(serverId, serviceName, methodName, args, attach, notify);
                };
            };
            // 新的api，广播出去
            proxy.broadcast = function (...args) {
                return self.rpcToSpecifiedServer('*', serviceName, methodName, args, attach);
            };
            // 新的api，使用默认路由调用
            proxy.defaultRoute = function (...args) {
                return self.rpcToRoute(null, serviceName, methodName, args, attach);
            };
            // 兼容旧的api
            proxy.toServer = function () {
                let len = arguments.length;
                if (len < 1) {
                    logger.error('[pinus-rpc] invalid rpc invoke, arguments length less than 1, namespace: %j, serverType, %j, serviceName: %j, methodName: %j', attach.namespace, attach.serverType, serviceName, methodName);
                    return Promise.reject(new Error('[pinus-rpc] invalid rpc invoke, arguments length less than 1'));
                }
                let routeParam = arguments[0];
                let args = new Array(len - 1);
                for (let i = 1; i < len; i++) {
                    args[i - 1] = arguments[i];
                }
                return self.rpcToSpecifiedServer(routeParam, serviceName, methodName, args, attach);
            };
            return proxy;
        })();
    }
    /**
     * Calculate remote target server id for rpc client.
     *
     * @param client {Object} current client instance.
     * @param serverType {String} remote server type.
     * @param msg  {Object} RpcMsg
     * @param routeParam {Object} mailbox init context parameter.
     * @param cb {Function} return rpc remote target server id.
     *
     * @api private
     */
    getRouteFunction() {
        if (!!this.routerType) {
            let method;
            switch (this.routerType) {
                case constants_1.constants.SCHEDULE.ROUNDROBIN:
                    method = router.rr;
                    break;
                case constants_1.constants.SCHEDULE.WEIGHT_ROUNDROBIN:
                    method = router.wrr;
                    break;
                case constants_1.constants.SCHEDULE.LEAST_ACTIVE:
                    method = router.la;
                    break;
                case constants_1.constants.SCHEDULE.CONSISTENT_HASH:
                    method = router.ch;
                    break;
                default:
                    method = router.rd;
                    break;
            }
            return (serverType, msg, routeParam, cb) => {
                method.call(null, this, serverType, msg, function (err, serverId) {
                    cb(err, serverId);
                });
            };
        }
        else {
            let route, target;
            if (typeof this.router === 'function') {
                route = this.router;
                target = null;
            }
            else if (typeof this.router.route === 'function') {
                route = this.router.route;
                target = this.router;
            }
            else {
                logger.error('[pinus-rpc] invalid route function.');
                return null;
            }
            return (serverType, msg, routeParam, cb) => {
                route.call(target, routeParam, msg, this._routeContext, function (err, serverId) {
                    cb(err, serverId);
                });
            };
        }
    }
}
exports.RpcClient = RpcClient;
/**
 * Create mail station.
 *
 * @param opts {Object} construct parameters.
 *
 * @api private
 */
function createStation(opts) {
    return Station.createMailStation(opts);
}
/**
 * Add proxy into array.
 *
 * @param proxies {Object} rpc proxies
 * @param namespace {String} rpc namespace sys/user
 * @param serverType {String} rpc remote server type
 * @param proxy {Object} rpc proxy
 *
 * @api private
 */
function insertProxy(proxies, namespace, serverType, proxy) {
    proxies[namespace] = proxies[namespace] || {};
    if (proxies[namespace][serverType]) {
        for (let attr in proxy) {
            proxies[namespace][serverType][attr] = proxy[attr];
        }
    }
    else {
        proxies[namespace][serverType] = proxy;
    }
}
/**
 * RPC client factory method.
 *
 * @param  {Object}      opts client init parameter.
 *                       opts.context: mail box init parameter,
 *                       opts.router: (optional) rpc message route function, route(routeParam, msg, cb),
 *                       opts.mailBoxFactory: (optional) mail box factory instance.
 * @return {Object}      client instance.
 */
function createClient(opts) {
    return new RpcClient(opts);
}
exports.createClient = createClient;
// module.exports.WSMailbox from ('./mailboxes/ws-mailbox'); // socket.io
// module.exports.WS2Mailbox from ('./mailboxes/ws2-mailbox'); // ws
// export { create as MQTTMailbox } from './mailboxes/mqtt-mailbox'; // mqtt
//# sourceMappingURL=client.js.map