"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require('source-map-support/register');
const preload_1 = require("./preload");
(0, preload_1.preload)();
const index_1 = require("../index");
const pinus_logger_1 = require("pinus-logger");
// configure('./config/log4js.json');
let logger = (0, pinus_logger_1.getLogger)('pinus-rpc', 'sample-server');
// remote service path info list
let paths = [
    {
        serverType: 'test',
        namespace: 'user', path: __dirname + '/remote/test'
    }
];
function runServer(port) {
    let server = (0, index_1.createServer)({ paths: paths, port: port, rpcDebugLog: true,
        rpcLogger: logger,
        acceptorFactory: index_1.createTcpAcceptor,
        bufferMsg: true,
        interval: 2000
    });
    server.start();
    console.log('rpc server started.' + port);
}
runServer(3333);
runServer(3334);
setTimeout(() => runServer(3335), 5000);
process.on('uncaughtException', function (err) {
    console.error(err);
});
//# sourceMappingURL=server.js.map