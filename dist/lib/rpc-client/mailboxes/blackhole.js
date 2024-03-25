"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Blackhole = void 0;
const pinus_logger_1 = require("pinus-logger");
let logger = (0, pinus_logger_1.getLogger)('pinus-rpc', 'blackhole');
const events_1 = require("events");
class Blackhole extends events_1.EventEmitter {
    connect(tracer, cb) {
        tracer && tracer.info('client', __filename, 'connect', 'connect to blackhole');
        process.nextTick(function () {
            cb(new Error('fail to connect to remote server and switch to blackhole.'));
        });
    }
    close(cb) { }
    send(tracer, msg, opts, cb) {
        tracer && tracer.info('client', __filename, 'send', 'send rpc msg to blackhole');
        logger.info('message into blackhole: %j', msg);
        process.nextTick(function () {
            cb(tracer, new Error('message was forward to blackhole.'));
        });
    }
}
exports.Blackhole = Blackhole;
//# sourceMappingURL=blackhole.js.map