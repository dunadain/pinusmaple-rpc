"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Composer = void 0;
const events_1 = require("events");
const buffer_1 = require("buffer");
const DEFAULT_MAX_LENGTH = -1; // default max package size: unlimited
const LEFT_SHIFT_BITS = 1 << 7;
const ST_LENGTH = 1; // state that we should read length
const ST_DATA = 2; // state that we should read data
const ST_ERROR = 3; // state that something wrong has happened
class Composer extends events_1.EventEmitter {
    constructor(opts) {
        super();
        this.opts = opts;
        opts = opts || {};
        this.maxLength = opts.maxLength || DEFAULT_MAX_LENGTH;
        this.offset = 0;
        this.left = 0;
        this.length = 0;
        this.buf = null;
        this.state = ST_LENGTH;
    }
    /**
     * Compose data into package.
     *
     * @param  {number}  type message type that would be composed.
     * @param  {String|Buffer}  data data that would be composed.
     * @param  {number}  id msg id that would be composed.
     * @return {Buffer}        compose result in Buffer.
     */
    compose(type, data, id) {
        if (data && typeof data === 'string') {
            data = buffer_1.Buffer.from(data, 'utf-8');
        }
        if (data && !(data instanceof buffer_1.Buffer)) {
            throw new Error('data should be an instance of String or Buffer');
        }
        if (type === 0 && (data === null || data === void 0 ? void 0 : data.length) === 0) {
            throw new Error('data should not be empty.');
        }
        if (this.maxLength > 0 && !!data && data.length > this.maxLength) {
            throw new Error('data length exceeds the limitation:' + this.maxLength);
        }
        let dataLength = 0;
        let buf;
        if (!!data) { // id temperary no need
            dataLength = data.length + 1; // 消息id 4bytes,type:1 byte
            let lsize = calLengthSize(dataLength);
            buf = buffer_1.Buffer.alloc(lsize + dataLength);
            fillLength(buf, dataLength, lsize);
            buf[lsize] = type;
            // buf.writeUInt32BE(id, lsize + 1);
            data.copy(buf, lsize + 1);
        }
        else { // no payload, ping pomg msg
            dataLength = 1;
            let lsize = calLengthSize(dataLength);
            buf = buffer_1.Buffer.alloc(lsize + dataLength);
            fillLength(buf, dataLength, lsize);
            buf[lsize] = type;
        }
        return buf;
    }
    /**
     * Feed data into composer. It would emit the package by an event when the package finished.
     *
     * @param  {Buffer} data   next chunk of data read from stream.
     * @param  {Number} offset (Optional) offset index of the data Buffer. 0 by default.
     * @param  {Number} end    (Optional) end index (not includ) of the data Buffer. data.lenght by default.
     * @return {void}
     */
    feed(data, offset, end) {
        if (!data) {
            return;
        }
        if (this.state === ST_ERROR) {
            throw new Error('compose in error state, reset it first');
        }
        offset = offset || 0;
        end = end || data.length;
        while (offset < end) {
            if (this.state === ST_LENGTH) {
                offset = this._readLength(data, offset, end);
            }
            if (this.state === ST_DATA) {
                offset = this._readData(data, offset, end);
            }
            if (this.state === ST_ERROR) {
                break;
            }
        }
    }
    /**
     * Reset composer to the init status.
     */
    reset() {
        this.state = ST_LENGTH;
        this.buf = null;
        this.length = 0;
        this.offset = 0;
        this.left = 0;
    }
    // read length part of package
    _readLength(data, offset, end) {
        let b, i, length = this.length, finish;
        for (i = 0; i < end - offset; i++) {
            b = data.readUInt8(i + offset);
            length *= LEFT_SHIFT_BITS; // left shift only within 32 bits
            length += (b & 0x7f);
            if (this.maxLength > 0 && length > this.maxLength) {
                this.state = ST_ERROR;
                this.emit('length_limit', this, data, offset);
                return -1;
            }
            if (!(b & 0x80)) {
                i++;
                finish = true;
                break;
            }
        }
        this.length = length;
        if (finish) {
            this.state = ST_DATA;
            this.offset = 0;
            this.left = this.length;
            this.buf = buffer_1.Buffer.alloc(this.length);
        }
        return i + offset;
    }
    // read data part of package
    _readData(data, offset, end) {
        let left = end - offset;
        let size = Math.min(left, this.left);
        if (this.buf) {
            data.copy(this.buf, this.offset, offset, offset + size);
            this.left -= size;
            this.offset += size;
        }
        if (this.left === 0) {
            let buf = this.buf;
            this.reset();
            this.emit('data', buf);
        }
        return offset + size;
    }
}
exports.Composer = Composer;
let calLengthSize = function (length) {
    let res = 0;
    while (length > 0) {
        length >>>= 7;
        res++;
    }
    return res;
};
let fillLength = function (buf, data, size) {
    let offset = size - 1, b;
    for (; offset >= 0; offset--) {
        b = data % LEFT_SHIFT_BITS;
        if (offset < size - 1) {
            b |= 0x80;
        }
        buf.writeUInt8(b, offset);
        data >>>= 7;
    }
};
//# sourceMappingURL=composer.js.map