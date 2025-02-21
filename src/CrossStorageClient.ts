import * as uuid from "uuid";

export class CrossStorageClient {

  private _id:string;
  private _frameId:string;
  private _hub:Window | null;
  private _origin:string;
  private _connected:boolean;
  private _closed:boolean;
  private _count:number;
  private _timeout:number;
  private _requests:Map<string, any>;
  private _connections:Array<any>;
  private _listener:(this: Window, ev: MessageEvent<any>) => any;
  private _promise:Promise<void>;

  constructor(url:string, opts) {
    opts = opts || {};
  
    this._id        = uuid.v4();
    this._promise   = opts.promise || new Promise<void>((resolve, reject) => {});
    this._frameId   = opts.frameId || 'CrossStorageClient-' + this._id;
    this._origin    = this._getOrigin(url);
    this._requests  = new Map<string, any>();
    this._connections  = new Array<any>();
    this._connected = false;
    this._closed    = false;
    this._count     = 0;
    this._timeout   = opts.timeout || 5000;

    this._installListener();
  
    var frame :HTMLIFrameElement | null = null;
    if (opts.frameId) {
      frame = document.getElementById(opts.frameId) as HTMLIFrameElement;
    }
  
    // If using a passed iframe, poll the hub for a ready message
    if (frame !== null) {
      this._poll();
    }
  
    // Create the frame if not found or specified
    frame = frame || this._createFrame(url);
    this._hub = frame.contentWindow;
  }
  
  /**
   * The styles to be applied to the generated iFrame. Defines a set of properties
   * that hide the element by positioning it outside of the visible area, and
   * by modifying its display.
   *
   * @member {Object}
   */
  private frameStyle:any = {
    display:  'none',
    position: 'absolute',
    top:      '-999px',
    left:     '-999px'
  };
  
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
  private _getOrigin(url:string): string {
    var uri, protocol, origin;
  
    uri = document.createElement('a');
    uri.href = url;
  
    if (!uri.host) {
      uri = window.location;
    }
  
    if (!uri.protocol || uri.protocol === ':') {
      protocol = window.location.protocol;
    } else {
      protocol = uri.protocol;
    }
  
    origin = protocol + '//' + uri.host;
    origin = origin.replace(/:80$|:443$/, '');
  
    return origin;
  };
  
  /**
   * Returns a promise that is fulfilled when a connection has been established
   * with the cross storage hub. Its use is required to avoid sending any
   * requests prior to initialization being complete.
   *
   * @returns {Promise} A promise that is resolved on connect
   */
  public onConnect(): Promise<void> {
    if (this._connected) {
      return this._promise;
    } else if (this._closed) {
      throw new Error('CrossStorageClient has closed');
    }
  
    // Queue connect requests for client re-use
    if (!this._connections) {
      this._connections = [];
    }
  
    return new Promise<void>((resolve, reject) => {
      var client:CrossStorageClient = this;

      var timeout = setTimeout(function() {
        reject(new Error('CrossStorageClient could not connect'));
      }, client._timeout);
  
      this._connections.push(function(err) {
        clearTimeout(timeout);
        if (err) return reject(err);
        resolve();
      });
    });
  };
  
  /**
   * Sets a key to the specified value. Returns a promise that is fulfilled on
   * success, or rejected if any errors setting the key occurred, or the request
   * timed out.
   *
   * @param   {string}  key   The key to set
   * @param   {*}       value The value to assign
   * @returns {Promise} A promise that is settled on hub response or timeout
   */
  private set(key, value) : Promise<any> {
    return this._request('set', {
      key:   key,
      value: value
    });
  };
  
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
  private async get(key: string) : Promise<any> {
    var args = Array.prototype.slice.call(arguments);
    var result = await this._request('get', { keys: args });
    return result;
  };
  
  /**
   * Accepts one or more keys for deletion. Returns a promise that is settled on
   * hub response or timeout.
   *
   * @param   {...string} key The key to delete
   * @returns {Promise}   A promise that is settled on hub response or timeout
   */
  private del() : Promise<void> {
    var args = Array.prototype.slice.call(arguments);
    return this._request('del', {keys: args});
  };
  
  /**
   * Returns a promise that, when resolved, indicates that all localStorage
   * data has been cleared.
   *
   * @returns {Promise} A promise that is settled on hub response or timeout
   */
  public async clear() : Promise<void>  {
    return await this._request('clear');
  };
  
  /**
   * Returns a promise that, when resolved, passes an array of all keys
   * currently in storage.
   *
   * @returns {Promise} A promise that is settled on hub response or timeout
   */
  public getKeys() : Promise<Array<string>> {
    return this._request('getKeys');
  };
  
  /**
   * Deletes the iframe and sets the connected state to false. The client can
   * no longer be used after being invoked.
   */
  public close() {
    var frame = document.getElementById(this._frameId);
    if (frame !== null && frame.parentNode !== null) {
      frame.parentNode.removeChild(frame);
    }
  
    window.removeEventListener('message', this._listener, false);
  
    this._connected = false;
    this._closed = true;
  };
  
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
  private _installListener() {
    this._listener = (message:any) => {
      var client:CrossStorageClient = this;
      var error:Error;
      var i:number;
      var origin:string;
      var response:any;
  
      // Ignore invalid messages or those after the client has closed
      if (client._closed || !message.data || typeof message.data !== 'string') {
        return;
      }
  
      // postMessage returns the string "null" as the origin for "file://"
      origin = (message.origin === 'null') ? 'file://' : message.origin;
  
      // Ignore messages not from the correct origin
      if (origin !== client._origin) return;
  
      // LocalStorage isn't available in the hub
      if (message.data === 'cross-storage:unavailable') {
        if (!client._closed) 
          client.close();

        if (!client._connections) 
          return;
  
        error = new Error('Closing this. Could not access localStorage in hub.');
        for (i = 0; i < client._connections.length; i++) {
          client._connections[i](error);
        }
  
        return;
      }
  
      // Handle initial connection
      if (message.data.indexOf('cross-storage:') !== -1 && !this._connected) {
        client._connected = true;
        if (!client._connections) 
          return;
  
        for (i = 0; i < this._connections.length; i++) {
          client._connections[i](null);
        }
        
        client._connections = new Array<any>();
      }
  
      if (message.data === 'cross-storage:ready')
        return;
  
      // All other messages
      try {
        response = JSON.parse(message.data);
      } catch(e) {
        return;
      }
  
      if (!response.id) return;
  
      if (client._requests[response.id]) {
        client._requests[response.id](response.error, response.result);
      }
    };
  
    window.addEventListener('message', this._listener, false);
  }
  
  /**
   * Invoked when a frame id was passed to the client, rather than allowing
   * the client to create its own iframe. Polls the hub for a ready event to
   * establish a connected state.
   */
  private _poll() {
    var interval:number;
    var targetOrigin:string;
  
    // postMessage requires that the target origin be set to "*" for "file://"
    targetOrigin = (this._origin === 'file://') ? '*' : this._origin;
  
    interval = window.setInterval(function() {
      if (this._connected) return clearInterval(interval);
      if (!this._hub) return;
  
      this._hub.postMessage('cross-storage:poll', targetOrigin);
    }, 1000);
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
  private _createFrame(url):HTMLIFrameElement {
    var frame:HTMLIFrameElement;
    var key:string;
  
    frame = window.document.createElement('iframe');
    frame.id = this._frameId;
  
    // Style the iframe
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
  private _request(method: string, params: any = {}) : Promise<any>
  {
    if (this._closed) {
      throw new Error('CrossStorageClient has closed');
    }

    if (this._hub == null) {
      throw new Error('CrossStorageClient is in disconnected state');
    }

    this._count++;

    var req:any = {
      id:     this._id + ':' + this._count,
      method: 'cross-storage:' + method,
      params: params
    };

    var promise = new Promise<any>((resolve, reject) => {
      var timeout:number;
      var targetOrigin:string;
      var client:CrossStorageClient = this;

      // Timeout if a response isn't received after 4s
      timeout = setTimeout(function() {
        if (!client._requests[req.id]) return;

        client._requests.delete(req.id);
        reject(new Error('Timeout: could not perform ' + req.method));
      }, client._timeout);

      // Add request callback
      client._requests[req.id] = function(err, result) {
        clearTimeout(timeout);
        client._requests.delete(req.id);
        if (err) return reject(new Error(err));
        resolve(result);
      };

      // postMessage requires that the target origin be set to "*" for "file://"
      targetOrigin = (client._origin === 'file://') ? '*' : this._origin;

      // Send serialized message
      client._hub?.postMessage(JSON.stringify(req), targetOrigin);
    });

    return promise;
  }
}
