"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MqttAcceptor = exports.createServer = void 0;
const Loader = require("pinus-loader");
const Gateway = require("./gateway");
const pinus_loader_1 = require("pinus-loader");
let loadRemoteServices = function (paths, context, res) {
    res = res || {};
    let item, m;
    for (let i = 0, l = paths.length; i < l; i++) {
        item = paths[i];
        m = Loader.load(item.path, context, false, true, pinus_loader_1.LoaderPathType.PINUS_REMOTER);
        if (m) {
            createNamespace(item.namespace, res);
            for (let s in m) {
                res[item.namespace][s] = m[s];
            }
        }
    }
    return res;
};
let createNamespace = function (namespace, proxies) {
    proxies[namespace] = proxies[namespace] || {};
};
/**
 * Create rpc server.
 *
 * @param  {Object}      opts construct parameters
 *                       opts.port {Number|String} rpc server listen port
 *                       opts.paths {Array} remote service code paths, [{namespace, path}, ...]
 *                       opts.context {Object} context for remote service
 *                       opts.acceptorFactory {Object} (optionals)acceptorFactory(opts, cb)
 * @return {Object}      rpc server instance
 */
function createServer(opts) {
    if (!opts || !opts.port || +opts.port < 0 || !opts.paths) {
        throw new Error('opts.port or opts.paths invalid.');
    }
    opts.services = loadRemoteServices(opts.paths, opts.context, opts.services);
    return Gateway.createGateway(opts);
}
exports.createServer = createServer;
// module.exports.WSAcceptor from ('./acceptors/ws-acceptor');
// module.exports.TcpAcceptor from ('./acceptors/tcp-acceptor');
var mqtt_acceptor_1 = require("./acceptors/mqtt-acceptor");
Object.defineProperty(exports, "MqttAcceptor", { enumerable: true, get: function () { return mqtt_acceptor_1.create; } });
//# sourceMappingURL=server.js.map