"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTcpMailBox = exports.createMqttMailBox = void 0;
/**
 * Default mailbox factory
 */
const Mailbox = require("./mailboxes/mqtt-mailbox");
// let Ws2Mailbox from ('./mailboxes/ws2-mailbox');
// let WsMailbox from ('./mailboxes/ws-mailbox');
const tcp_mailbox_1 = require("./mailboxes/tcp-mailbox");
/**
 * default mailbox factory
 *
 * @param {Object} serverInfo single server instance info, {id, host, port, ...}
 * @param {Object} opts construct parameters
 * @return {Object} mailbox instancef
 */
function createMqttMailBox(serverInfo, opts) {
    // let mailbox = opts.mailbox || 'mqtt';
    // let Mailbox = null;
    // if (mailbox == 'ws') {
    //     Mailbox = WsMailbox;
    // } else if (mailbox == 'ws2') {
    //     Mailbox = Ws2Mailbox;
    // } else if (mailbox == 'mqtt') {
    //     Mailbox = MqttMailbox;
    // }
    return Mailbox.create(serverInfo, opts);
}
exports.createMqttMailBox = createMqttMailBox;
exports.createTcpMailBox = tcp_mailbox_1.create;
//# sourceMappingURL=mailbox.js.map