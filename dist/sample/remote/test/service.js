"use strict";
// remote service
Object.defineProperty(exports, "__esModule", { value: true });
exports.Service = void 0;
function default_1(app) {
    return new Service(app);
}
exports.default = default_1;
class Service {
    constructor(app) {
        this.app = app;
    }
    async echo(msg, data) {
        // setTimeout(function() {
        // console.log(msg);
        // console.log(data);
        console.log('~~~ echo  ', msg, data);
        return [msg, data + Date.now()];
        // cb(null, msg, 'aaa' + Date.now());
        // }, 15000);
    }
}
exports.Service = Service;
//# sourceMappingURL=service.js.map