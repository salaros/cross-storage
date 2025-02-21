export declare class CrossStorageClient {
    private _id;
    private _frameId;
    private _hub;
    private _origin;
    private _connected;
    private _closed;
    private _count;
    private _timeout;
    private _requests;
    private _connections;
    private _listener;
    private _promise;
    constructor(url: string, opts: any);
    /**
     * The styles to be applied to the generated iFrame. Defines a set of properties
     * that hide the element by positioning it outside of the visible area, and
     * by modifying its display.
     *
     * @member {Object}
     */
    private frameStyle;
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
    private _getOrigin;
    /**
     * Returns a promise that is fulfilled when a connection has been established
     * with the cross storage hub. Its use is required to avoid sending any
     * requests prior to initialization being complete.
     *
     * @returns {Promise} A promise that is resolved on connect
     */
    onConnect(): Promise<void>;
    /**
     * Sets a key to the specified value. Returns a promise that is fulfilled on
     * success, or rejected if any errors setting the key occurred, or the request
     * timed out.
     *
     * @param   {string}  key   The key to set
     * @param   {*}       value The value to assign
     * @returns {Promise} A promise that is settled on hub response or timeout
     */
    private set;
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
    private get;
    /**
     * Accepts one or more keys for deletion. Returns a promise that is settled on
     * hub response or timeout.
     *
     * @param   {...string} key The key to delete
     * @returns {Promise}   A promise that is settled on hub response or timeout
     */
    private del;
    /**
     * Returns a promise that, when resolved, indicates that all localStorage
     * data has been cleared.
     *
     * @returns {Promise} A promise that is settled on hub response or timeout
     */
    clear(): Promise<void>;
    /**
     * Returns a promise that, when resolved, passes an array of all keys
     * currently in storage.
     *
     * @returns {Promise} A promise that is settled on hub response or timeout
     */
    getKeys(): Promise<Array<string>>;
    /**
     * Deletes the iframe and sets the connected state to false. The client can
     * no longer be used after being invoked.
     */
    close(): void;
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
    private _installListener;
    /**
     * Invoked when a frame id was passed to the client, rather than allowing
     * the client to create its own iframe. Polls the hub for a ready event to
     * establish a connected state.
     */
    private _poll;
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
    private _createFrame;
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
    private _request;
}
