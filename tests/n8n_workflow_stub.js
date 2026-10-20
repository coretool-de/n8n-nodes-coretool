'use strict';
// Minimal stand-in for the few n8n-workflow exports the node uses at runtime.
// Only used by tests/run_api_tests.js when the real package is not fully installed.
const Module = require('node:module');
class NodeOperationError extends Error {
	constructor(_node, message, options = {}) { super(message); this.name = 'NodeOperationError'; this.description = options.description; this.itemIndex = options.itemIndex; }
}
class NodeApiError extends Error {
	constructor(_node, body, options = {}) { super(options.message || 'API error'); this.name = 'NodeApiError'; this.description = options.description; this.httpCode = options.httpCode; this.cause = body; }
}
const stub = { NodeConnectionTypes: { Main: 'main' }, NodeOperationError, NodeApiError };
const origLoad = Module._load;
Module._load = function (request, ...rest) { return request === 'n8n-workflow' ? stub : origLoad.call(this, request, ...rest); };
