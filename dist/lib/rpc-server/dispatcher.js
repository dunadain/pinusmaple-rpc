"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Dispatcher = void 0;
const events_1 = require("events");
class Dispatcher extends events_1.EventEmitter {
    constructor(services) {
        super();
        let self = this;
        this.on('reload', function (services) {
            for (let namespace in services) {
                for (let service in services[namespace]) {
                    self.services[namespace][service] = services[namespace][service];
                }
            }
        });
        this.services = services;
    }
    /**
     * route the msg to appropriate service object
     *
     * @param msg msg package {service:serviceString, method:methodString, args:[]}
     * @param services services object collection, such as {service1: serviceObj1, service2: serviceObj2}
     * @param cb(...) callback function that should be invoked as soon as the rpc finished
     */
    route(tracer, msg, cb) {
        tracer && tracer.info('server', __filename, 'route', 'route messsage to appropriate service object');
        let namespace = this.services[msg.namespace];
        if (!namespace) {
            tracer && tracer.error('server', __filename, 'route', 'no such namespace:' + msg.namespace);
            cb ? cb(new Error('no such namespace:' + msg.namespace)) : null;
            return;
        }
        let service = namespace[msg.service];
        if (!service) {
            tracer && tracer.error('server', __filename, 'route', 'no such service:' + msg.service);
            cb ? cb(new Error('no such service:' + msg.service)) : null;
            return;
        }
        let method = service[msg.method];
        if (!method) {
            tracer && tracer.error('server', __filename, 'route', 'no such method:' + msg.method);
            cb ? cb(new Error('no such method:' + msg.method)) : null;
            return;
        }
        let args = msg.args;
        let promise = method.apply(service, args);
        if (!cb) {
            return;
        }
        if (!promise || !promise.then) {
            // tracer && tracer.error('server', __filename, 'route', 'not async method:' + msg.method);
            // cb ? cb(new Error('not async method:' + msg.method)) : null;
            cb(null, promise);
            return;
        }
        promise.then(function (value) {
            cb(null, value);
        }, function (reason) {
            cb(reason);
        });
    }
}
exports.Dispatcher = Dispatcher;
//# sourceMappingURL=dispatcher.js.map