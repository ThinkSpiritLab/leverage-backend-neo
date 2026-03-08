"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isExpressAdapter = exports.isFastifyAdapter = void 0;
const isFastifyAdapter = (adapter) => {
    return 'registerPlugin' in adapter;
};
exports.isFastifyAdapter = isFastifyAdapter;
const isExpressAdapter = (adapter) => {
    return 'getRouter' in adapter;
};
exports.isExpressAdapter = isExpressAdapter;
