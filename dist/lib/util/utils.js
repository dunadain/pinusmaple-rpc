"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listEs6ClassMethods = exports.getBearcat = exports.typeMap = exports.typeArray = exports.getType = exports.isNotNull = exports.to_array = exports.checkNull = exports.checkBean = exports.checkBoolean = exports.checkString = exports.checkObject = exports.checkFunction = exports.checkNumber = exports.checkArray = exports.isType = exports.checkFloat = exports.getObjectClass = exports.applyCallback = exports.invokeCallback = void 0;
function invokeCallback(cb, err) {
    if (typeof cb === 'function') {
        cb.apply(null, Array.prototype.slice.call(arguments, 1));
    }
}
exports.invokeCallback = invokeCallback;
function applyCallback(cb, args) {
    if (typeof cb === 'function') {
        cb.apply(null, args);
    }
}
exports.applyCallback = applyCallback;
function getObjectClass(obj) {
    if (!obj) {
        return;
    }
    let constructor = obj.constructor;
    if (!constructor) {
        return;
    }
    if (constructor.name) {
        return constructor.name;
    }
    let str = constructor.toString();
    if (!str) {
        return;
    }
    let arr = null;
    if (str.charAt(0) === '[') {
        arr = str.match(/\[\w+\s*(\w+)\]/);
    }
    else {
        arr = str.match(/function\s*(\w+)/);
    }
    if (arr && arr.length === 2) {
        return arr[1];
    }
}
exports.getObjectClass = getObjectClass;
/**
 * Utils check float
 *
 * @param  {Float}   float
 * @return {Boolean} true|false
 * @api public
 */
function checkFloat(v) {
    return v === Number(v) && v % 1 !== 0;
    // return parseInt(v) !== v;
}
exports.checkFloat = checkFloat;
/**
 * Utils check type
 *
 * @param  {String}   type
 * @return {Function} high order function
 * @api public
 */
function isType(type) {
    return function (obj) {
        return {}.toString.call(obj) === '[object ' + type + ']';
    };
}
exports.isType = isType;
/**
 * Utils check array
 *
 * @param  {Array}   array
 * @return {Boolean} true|false
 * @api public
 */
exports.checkArray = Array.isArray || isType('Array');
/**
 * Utils check number
 *
 * @param  {Number}  number
 * @return {Boolean} true|false
 * @api public
 */
exports.checkNumber = isType('Number');
/**
 * Utils check function
 *
 * @param  {Function}   func function
 * @return {Boolean}    true|false
 * @api public
 */
exports.checkFunction = isType('Function');
/**
 * Utils check object
 *
 * @param  {Object}   obj object
 * @return {Boolean}  true|false
 * @api public
 */
exports.checkObject = isType('Object');
/**
 * Utils check string
 *
 * @param  {String}   string
 * @return {Boolean}  true|false
 * @api public
 */
exports.checkString = isType('String');
/**
 * Utils check boolean
 *
 * @param  {Object}   obj object
 * @return {Boolean}  true|false
 * @api public
 */
exports.checkBoolean = isType('Boolean');
/**
 * Utils check bean
 *
 * @param  {Object}   obj object
 * @return {Boolean}  true|false
 * @api public
 */
let checkBean = function (obj) {
    return obj && obj['$id'] &&
        (0, exports.checkFunction)(obj['writeFields']) &&
        (0, exports.checkFunction)(obj['readFields']);
};
exports.checkBean = checkBean;
let checkNull = function (obj) {
    return !(0, exports.isNotNull)(obj);
};
exports.checkNull = checkNull;
/**
 * Utils args to array
 *
 * @param  {Object}  args arguments
 * @return {Array}   array
 * @api public
 */
let to_array = function (args) {
    let len = args.length;
    let arr = new Array(len);
    for (let i = 0; i < len; i++) {
        arr[i] = args[i];
    }
    return arr;
};
exports.to_array = to_array;
/**
 * Utils check is not null
 *
 * @param  {Object}   value
 * @return {Boolean}  true|false
 * @api public
 */
let isNotNull = function (value) {
    if (value !== null && typeof value !== 'undefined')
        return true;
    return false;
};
exports.isNotNull = isNotNull;
let getType = function (object) {
    if (object == null || typeof object === 'undefined') {
        return exports.typeMap['null'];
    }
    if (Buffer.isBuffer(object)) {
        return exports.typeMap['buffer'];
    }
    if ((0, exports.checkArray)(object)) {
        return exports.typeMap['array'];
    }
    if ((0, exports.checkString)(object)) {
        return exports.typeMap['string'];
    }
    if ((0, exports.checkObject)(object)) {
        if ((0, exports.checkBean)(object)) {
            return exports.typeMap['bean'];
        }
        return exports.typeMap['object'];
    }
    if ((0, exports.checkBoolean)(object)) {
        return exports.typeMap['boolean'];
    }
    if ((0, exports.checkNumber)(object)) {
        if (checkFloat(object)) {
            return exports.typeMap['float'];
        }
        if (isNaN(object)) {
            return exports.typeMap['null'];
        }
        return exports.typeMap['number'];
    }
};
exports.getType = getType;
exports.typeArray = ['', 'null', 'buffer', 'array', 'string', 'object', 'bean', 'boolean', 'float', 'number'];
exports.typeMap = {};
for (let i = 1; i <= exports.typeArray.length; i++) {
    exports.typeMap[exports.typeArray[i]] = i;
}
let getBearcat = function () {
    return require('bearcat');
};
exports.getBearcat = getBearcat;
/**
 * 列出ES6的一个Class实例上的所有方法
 * @param objInstance
 * @param containParent ture 包含父类方法 默认不包含
 */
function listEs6ClassMethods(objInstance, containParent) {
    var _a;
    let names = [];
    if (objInstance.prototype && objInstance.prototype.constructor === objInstance) {
        let methodNames = Object.getOwnPropertyNames(objInstance.prototype);
        for (let name of methodNames) {
            let method = objInstance.prototype[name];
            // Supposedly you'd like to skip constructor
            if (!(method instanceof Function) || name === 'constructor')
                continue;
            names.push(name);
        }
    }
    // 包含父类方法
    else {
        let methodNames = Object.getOwnPropertyNames(objInstance);
        let instance = Object.getPrototypeOf(objInstance);
        while (instance) {
            methodNames.push(...Object.getOwnPropertyNames(instance));
            instance = Object.getPrototypeOf(instance);
            // 所有对象最底层都继承于Object，跳过Object对象的方法收集
            if (!containParent || ((_a = instance['constructor']) === null || _a === void 0 ? void 0 : _a.name) === Object.name) {
                break;
            }
        }
        for (let name of methodNames) {
            // Supposedly you'd like to skip constructor
            if (name !== 'constructor' && objInstance[name] instanceof Function) {
                names.push(name);
            }
        }
    }
    return names;
}
exports.listEs6ClassMethods = listEs6ClassMethods;
//# sourceMappingURL=utils.js.map