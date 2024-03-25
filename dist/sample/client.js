"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require('source-map-support/register');
const preload_1 = require("./preload");
(0, preload_1.preload)();
const pinusrpc = require("..");
const pinus_logger_1 = require("pinus-logger");
const __1 = require("../");
// configure('./config/log4js.json');
let logger = (0, pinus_logger_1.getLogger)('pinus-rpc', 'sample-client');
// remote service interface path info list
const records = [
    { namespace: 'user', serverType: 'test', path: __dirname + '/remote/test' }
];
const context = {
    serverId: 'test-server-1'
};
// server info list
const servers = [
    { id: 'test-server-1', serverType: 'test', host: '127.0.0.1', port: 3333 },
    { id: 'test-server-2', serverType: 'test', host: '127.0.0.1', port: 3334 },
    { id: 'test-server-3', serverType: 'test', host: '127.0.0.1', port: 3335 },
    { id: 'unuse-server-1', serverType: 'unuse', host: '127.0.0.1', port: 3336 }
];
// route parameter passed to route function
let routeParam = null;
// route context passed to route function
const routeContext = servers;
// route function to caculate the remote server id
const routeFunc = function (routeParam, msg, routeContext, cb) {
    cb(null, routeContext[0].id);
};
const client = pinusrpc.createClient({ routeContext: routeContext,
    router: routeFunc, context: context,
    mailboxFactory: __1.createTcpMailBox,
    bufferMsg: true,
    interval: 2000,
    timeout: 20000 });
client.start(err => {
    if (err) {
        console.error('start client err', err);
        return;
    }
    client.addProxies(records);
    client.addServers(servers);
    // test().then(ret =>
    //     console.log('test end ret', ret))
    //     .catch(err => {
    //         console.error(' test end with err', err);
    //     });
    client.proxies.user.test.service.echo.toServer('test-server-3', 111, 'DDD', 'unused')
        .then(ret => {
        console.log(' rpc end ret1', ret);
    })
        .catch(err => {
        console.error(' rpc end err', err);
    });
    client.proxies.user.test.service.echo.toServer('test-server-1', 666, 'AAA1111').then(ret => {
        console.log('@@111', ret);
    });
    client.proxies.user.test.service.echo.toServer('test-server-1', 666, 'AAA@@').then(ret => {
        console.log('@@222', ret);
    });
    client.proxies.user.test.service.echo.to('test-server-1', true)(666, 'AAA###').then(ret => {
        console.log('@@@333', ret);
    });
    setTimeout(() => {
        client.proxies.user.test.service.echo.toServer('test-server-3', 222, 'DDD2', 'unused')
            .then(ret => {
            console.log(' rpc end ret2', ret);
        })
            .catch(err => {
            console.error(' rpc end err', err);
        });
    }, 5000);
    test().then(ret => console.log('test ret', ret)).catch(err => console.log('test err', err));
});
async function test() {
    console.log('rpc client start ok.');
    let m = Buffer.from('hello');
    // n = 'bbb';
    let fs = require('fs');
    // m = fs.readFileSync('./skill.js').toString();
    m = ['onReloadSkill',
        // [ m ],
        ['210108'],
        { type: 'push', userOptions: {}, isPush: true }];
    // m = ['route', [m], {}, {}];
    // m = require('./test');
    // m = 3.14;
    // m = 'aaa';
    // m = 100325;
    // m = {a: '111', b: 'bbb', c: 'ccc'};
    // m = [1, '2', {a: 'bbb'}, 3.12, m, false];
    // m = false;
    // m = '0';
    //   function(err, resp, data) {
    //       // client.proxies.user.test.service.echo(routeParam, m, 'aaa', function(err, resp, data) {
    //       if(err) {
    //           console.error(err.stack);
    //       }
    //
    //       // setTimeout(function() {
    //       console.log(resp);
    //       console.log(data);
    //       // console.log(typeof resp)
    //       // console.log(resp.toString())
    //       // }, 1000);
    //   }
    // const rets = await client.proxies.user.test.service.echo(null, m, 'aaa');
    // console.log('rets', rets);
    // const toServerRet = await client.proxies.user.test.service.echo.toServer('test-server-1', m, 'aaa');
    // console.log('toServerRet', toServerRet);
    try {
    }
    catch (err) {
        console.log('~~ toServer(*) err', err);
    }
    const toServersRet = await client.proxies.user.test.service.echo.toServer('test-server-3', m, 'zzDDD', 'unused');
    console.log('toServersRet', JSON.stringify(toServersRet, null, 4));
    console.log('!!!!@@');
    await new Promise(done => setTimeout(done, 5000, null));
    console.log('~~ latency end');
    const latencyRet = await client.proxies.user.test.service.echo.toServer('test-server-3', 'latency!!', 'aaa');
    console.log('~~~ latency', latencyRet);
    return 'test success';
}
process.on('rejectionHandled', p => {
    console.error('rejectionHandled !!~~', p);
});
//# sourceMappingURL=client.js.map