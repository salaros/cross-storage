// node_modules/uuid/dist/esm-browser/stringify.js
var byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}

// node_modules/uuid/dist/esm-browser/rng.js
var getRandomValues;
var rnds8 = new Uint8Array(16);
function rng() {
  if (!getRandomValues) {
    if (typeof crypto === "undefined" || !crypto.getRandomValues) {
      throw new Error("crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported");
    }
    getRandomValues = crypto.getRandomValues.bind(crypto);
  }
  return getRandomValues(rnds8);
}

// node_modules/uuid/dist/esm-browser/native.js
var randomUUID = typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID.bind(crypto);
var native_default = { randomUUID };

// node_modules/uuid/dist/esm-browser/v4.js
function v4(options, buf, offset) {
  if (native_default.randomUUID && !buf && !options) {
    return native_default.randomUUID();
  }
  options = options || {};
  const rnds = options.random ?? options.rng?.() ?? rng();
  if (rnds.length < 16) {
    throw new Error("Random bytes length must be >= 16");
  }
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    if (offset < 0 || offset + 16 > buf.length) {
      throw new RangeError(`UUID byte range ${offset}:${offset + 15} is out of buffer bounds`);
    }
    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }
    return buf;
  }
  return unsafeStringify(rnds);
}
var v4_default = v4;

// src/CrossStorageClient.ts
var CrossStorageClient = class {
  constructor(url, opts) {
    /**
     * The styles to be applied to the generated iFrame. Defines a set of properties
     * that hide the element by positioning it outside of the visible area, and
     * by modifying its display.
     *
     * @member {Object}
     */
    this.frameStyle = {
      display: "none",
      position: "absolute",
      top: "-999px",
      left: "-999px"
    };
    opts = opts || {};
    this._id = v4_default();
    this._promise = opts.promise || new Promise((resolve, reject) => {
    });
    this._frameId = opts.frameId || "CrossStorageClient-" + this._id;
    this._origin = this._getOrigin(url);
    this._requests = /* @__PURE__ */ new Map();
    this._connections = new Array();
    this._connected = false;
    this._closed = false;
    this._count = 0;
    this._timeout = opts.timeout || 5e3;
    this._installListener();
    var frame = null;
    if (opts.frameId) {
      frame = document.getElementById(opts.frameId);
    }
    if (frame !== null) {
      this._poll();
    }
    frame = frame || this._createFrame(url);
    this._hub = frame.contentWindow;
  }
  /**
   * Returns the origin of an url, with cross browser support. Accommodates
   * the lack of location.origin in IE, as well as the discrepancies in the
   * inclusion of the port when using the default port for a protocol, e.g.
   * 443 over https. Defaults to the origin of window.location if passed a
   * relative path.
   *
   * @param   {string} url The url to a cross storage hub
   * @returns {string} The origin of the url
   */
  _getOrigin(url) {
    var uri, protocol, origin;
    uri = document.createElement("a");
    uri.href = url;
    if (!uri.host) {
      uri = window.location;
    }
    if (!uri.protocol || uri.protocol === ":") {
      protocol = window.location.protocol;
    } else {
      protocol = uri.protocol;
    }
    origin = protocol + "//" + uri.host;
    origin = origin.replace(/:80$|:443$/, "");
    return origin;
  }
  /**
   * Returns a promise that is fulfilled when a connection has been established
   * with the cross storage hub. Its use is required to avoid sending any
   * requests prior to initialization being complete.
   *
   * @returns {Promise} A promise that is resolved on connect
   */
  onConnect() {
    if (this._connected) {
      return this._promise;
    } else if (this._closed) {
      throw new Error("CrossStorageClient has closed");
    }
    if (!this._connections) {
      this._connections = [];
    }
    return new Promise((resolve, reject) => {
      var client = this;
      var timeout = setTimeout(function() {
        reject(new Error("CrossStorageClient could not connect"));
      }, client._timeout);
      this._connections.push(function(err) {
        clearTimeout(timeout);
        if (err) return reject(err);
        resolve();
      });
    });
  }
  /**
   * Sets a key to the specified value. Returns a promise that is fulfilled on
   * success, or rejected if any errors setting the key occurred, or the request
   * timed out.
   *
   * @param   {string}  key   The key to set
   * @param   {*}       value The value to assign
   * @returns {Promise} A promise that is settled on hub response or timeout
   */
  set(key, value) {
    return this._request("set", {
      key,
      value
    });
  }
  /**
   * Accepts one or more keys for which to retrieve their values. Returns a
   * promise that is settled on hub response or timeout. On success, it is
   * fulfilled with the value of the key if only passed a single argument.
   * Otherwise it's resolved with an array of values. On failure, it is rejected
   * with the corresponding error message.
   *
   * @param   {...string} key The key to retrieve
   * @returns {Promise}   A promise that is settled on hub response or timeout
   */
  async get(key) {
    var args = Array.prototype.slice.call(arguments);
    var result = await this._request("get", { keys: args });
    return result;
  }
  /**
   * Accepts one or more keys for deletion. Returns a promise that is settled on
   * hub response or timeout.
   *
   * @param   {...string} key The key to delete
   * @returns {Promise}   A promise that is settled on hub response or timeout
   */
  del() {
    var args = Array.prototype.slice.call(arguments);
    return this._request("del", { keys: args });
  }
  /**
   * Returns a promise that, when resolved, indicates that all localStorage
   * data has been cleared.
   *
   * @returns {Promise} A promise that is settled on hub response or timeout
   */
  async clear() {
    return await this._request("clear");
  }
  /**
   * Returns a promise that, when resolved, passes an array of all keys
   * currently in storage.
   *
   * @returns {Promise} A promise that is settled on hub response or timeout
   */
  getKeys() {
    return this._request("getKeys");
  }
  /**
   * Deletes the iframe and sets the connected state to false. The client can
   * no longer be used after being invoked.
   */
  close() {
    var frame = document.getElementById(this._frameId);
    if (frame !== null && frame.parentNode !== null) {
      frame.parentNode.removeChild(frame);
    }
    window.removeEventListener("message", this._listener, false);
    this._connected = false;
    this._closed = true;
  }
  /**
   * Installs the necessary listener for the window message event. When a message
   * is received, the client's _connected status is changed to true, and the
   * onConnect promise is fulfilled. Given a response message, the callback
   * corresponding to its request is invoked. If response.error holds a truthy
   * value, the promise associated with the original request is rejected with
   * the error. Otherwise the promise is fulfilled and passed response.result.
   *
   * @private
   */
  _installListener() {
    this._listener = (message) => {
      var client = this;
      var error;
      var i;
      var origin;
      var response;
      if (client._closed || !message.data || typeof message.data !== "string") {
        return;
      }
      origin = message.origin === "null" ? "file://" : message.origin;
      if (origin !== client._origin) return;
      if (message.data === "cross-storage:unavailable") {
        if (!client._closed)
          client.close();
        if (!client._connections)
          return;
        error = new Error("Closing this. Could not access localStorage in hub.");
        for (i = 0; i < client._connections.length; i++) {
          client._connections[i](error);
        }
        return;
      }
      if (message.data.indexOf("cross-storage:") !== -1 && !this._connected) {
        client._connected = true;
        if (!client._connections)
          return;
        for (i = 0; i < this._connections.length; i++) {
          client._connections[i](null);
        }
        client._connections = new Array();
      }
      if (message.data === "cross-storage:ready")
        return;
      try {
        response = JSON.parse(message.data);
      } catch (e) {
        return;
      }
      if (!response.id) return;
      if (client._requests[response.id]) {
        client._requests[response.id](response.error, response.result);
      }
    };
    window.addEventListener("message", this._listener, false);
  }
  /**
   * Invoked when a frame id was passed to the client, rather than allowing
   * the client to create its own iframe. Polls the hub for a ready event to
   * establish a connected state.
   */
  _poll() {
    var interval;
    var targetOrigin;
    targetOrigin = this._origin === "file://" ? "*" : this._origin;
    interval = window.setInterval(function() {
      if (this._connected) return clearInterval(interval);
      if (!this._hub) return;
      this._hub.postMessage("cross-storage:poll", targetOrigin);
    }, 1e3);
  }
  /**
   * Creates a new iFrame containing the hub. Applies the necessary styles to
   * hide the element from view, prior to adding it to the document body.
   * Returns the created element.
   *
   * @private
   *
   * @param  {string}            url The url to the hub
   * returns {HTMLIFrameElement} The iFrame element itself
   */
  _createFrame(url) {
    var frame;
    var key;
    frame = window.document.createElement("iframe");
    frame.id = this._frameId;
    for (key in this.frameStyle) {
      if (this.frameStyle.hasOwnProperty(key)) {
        frame.style[key] = this.frameStyle[key];
      }
    }
    window.document.body.appendChild(frame);
    frame.src = url;
    return frame;
  }
  /**
   * Sends a message containing the given method and params to the hub. Stores
   * a callback in the this._requests object for later invocation on message, or
   * deletion on timeout. Returns a promise that is settled in either instance.
   *
   * @private
   *
   * @param   {string}  method The method to invoke
   * @param   {*}       params The arguments to pass
   * @returns {Promise} A promise that is settled on hub response or timeout
   */
  _request(method, params = {}) {
    if (this._closed) {
      throw new Error("CrossStorageClient has closed");
    }
    if (this._hub == null) {
      throw new Error("CrossStorageClient is in disconnected state");
    }
    this._count++;
    var req = {
      id: this._id + ":" + this._count,
      method: "cross-storage:" + method,
      params
    };
    var promise = new Promise((resolve, reject) => {
      var timeout;
      var targetOrigin;
      var client = this;
      timeout = setTimeout(function() {
        if (!client._requests[req.id]) return;
        client._requests.delete(req.id);
        reject(new Error("Timeout: could not perform " + req.method));
      }, client._timeout);
      client._requests[req.id] = function(err, result) {
        clearTimeout(timeout);
        client._requests.delete(req.id);
        if (err) return reject(new Error(err));
        resolve(result);
      };
      targetOrigin = client._origin === "file://" ? "*" : this._origin;
      client._hub?.postMessage(JSON.stringify(req), targetOrigin);
    });
    return promise;
  }
};
export {
  CrossStorageClient
};
//# sourceMappingURL=CrossStorageClient.js.map
