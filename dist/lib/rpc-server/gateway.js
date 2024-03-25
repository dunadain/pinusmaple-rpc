"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGateway = exports.Gateway = void 0;
const acceptor_1 = require("./acceptor");
const events_1 = require("events");
const dispatcher_1 = require("./dispatcher");
const Loader = require("pinus-loader");
const fs = require("fs");
const pinus_loader_1 = require("pinus-loader");
class Gateway extends events_1.EventEmitter {
    constructor(opts) {
        super();
        this.started = false;
        this.stoped = false;
        this.opts = opts || {};
        this.port = opts.port || 3050;
        this.started = false;
        this.stoped = false;
        let acceptorFactory = opts.acceptorFactory || acceptor_1.createDefaultAcceptor;
        this.services = opts.services;
        const dispatcher = this.dispatcher = new dispatcher_1.Dispatcher(this.services);
        if (!!this.opts.reloadRemotes) {
            this.watchServices();
        }
        this.acceptor = acceptorFactory(opts, (tracer, msg, cb) => {
            dispatcher.route(tracer, msg, cb);
        });
    }
    stop(force) {
        if (!this.started || this.stoped) {
            return;
        }
        this.stoped = true;
        try {
            this.acceptor.close();
        }
        catch (err) {
        }
    }
    start() {
        if (this.started) {
            throw new Error('gateway already start.');
        }
        this.started = true;
        let self = this;
        this.acceptor.on('error', self.emit.bind(self, 'error'));
        this.acceptor.on('closed', self.emit.bind(self, 'closed'));
        this.acceptor.listen(this.port);
    }
    watchServices() {
        let paths = this.opts.paths;
        let app = this.opts.context;
        for (let i = 0; i < paths.length; i++) {
            ((index) => {
                fs.watch(paths[index].path, (event, name) => {
                    if (event === 'change') {
                        this.reloadRemoter(app, paths[index]);
                    }
                });
            })(i);
        }
    }
    manualReloadRemoters() {
        let paths = this.opts.paths;
        let app = this.opts.context;
        for (let i = 0; i < paths.length; i++) {
            this.reloadRemoter(app, paths[i]);
        }
    }
    reloadRemoter(app, item) {
        let res = {};
        let m = Loader.load(item.path, app, true, true, pinus_loader_1.LoaderPathType.PINUS_REMOTER);
        if (m) {
            createNamespace(item.namespace, res);
            for (let s in m) {
                res[item.namespace][s] = m[s];
            }
        }
        this.dispatcher.emit('reload', res);
    }
}
exports.Gateway = Gateway;
/**
 * create and init gateway
 *
 * @param opts {services: {rpcServices}, connector:conFactory(optional), router:routeFunction(optional)}
 */
function createGateway(opts) {
    if (!opts || !opts.services) {
        throw new Error('opts and opts.services should not be empty.');
    }
    return new Gateway(opts);
}
exports.createGateway = createGateway;
let createNamespace = function (namespace, proxies) {
    proxies[namespace] = proxies[namespace] || {};
};
//# sourceMappingURL=gateway.js.map