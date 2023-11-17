import * as axios from 'axios';
import isRetryAllowed from 'is-retry-allowed';

export namespace IAxiosRetry {
  export interface IAxiosRetryConfig {
    /**
     * The number of times to retry before failing
     * default: 3
     *
     * @type {number}
     */
    retries?: number;
    /**
     * Defines if the timeout should be reset between retries
     * default: false
     *
     * @type {boolean}
     */
    shouldResetTimeout?: boolean;
    /**
     * A callback to further control if a request should be retried.
     * default: it retries if it is a network error or a 5xx error on an idempotent request (GET, HEAD, OPTIONS, PUT or DELETE).
     *
     * @type {Function}
     */
    retryCondition?: (error: axios.AxiosError) => boolean | Promise<boolean>;
    /**
     * A callback to further control the delay between retry requests. By default there is no delay.
     *
     * @type {Function}
     */
    retryDelay?: (retryCount: number, error: axios.AxiosError) => number;
    /**
     * A callback to get notified when a retry occurs, the number of times it has occurred, and the error
     *
     * @type {Function}
     */
    onRetry?: (
      retryCount: number,
      error: axios.AxiosError,
      requestConfig: axios.AxiosRequestConfig
    ) => void;
  }

  export interface IAxiosRetryConfigExtended extends IAxiosRetryConfig {
    /**
     * The number of times the request was retried
     *
     * @type {number}
     */
    retryCount?: number;
    /**
     * The last time the request was retried (timestamp in milliseconds)
     *
     * @type {number}
     */
    lastRequestTime?: number;
  }

  export interface IAxiosRetryReturn {
    /**
     * The interceptorId for the request interceptor
     *
     * @type {number}
     */
    requestInterceptorId: number;
    /**
     * The interceptorId for the response interceptor
     *
     * @type {number}
     */
    responseInterceptorId: number;
  }

  export interface AxiosRetry {
    (
      axiosInstance: axios.AxiosStatic | axios.AxiosInstance,
      axiosRetryConfig?: IAxiosRetryConfig
    ): IAxiosRetryReturn;

    isNetworkError(error: Error): boolean;
    isRetryableError(error: Error): boolean;
    isSafeRequestError(error: Error): boolean;
    isIdempotentRequestError(error: Error): boolean;
    isNetworkOrIdempotentRequestError(error: Error): boolean;
    exponentialDelay(retryNumber?: number, error?: Error, delayFactor?: number): number;
  }
}

declare module 'axios' {
  export interface AxiosRequestConfig {
    'axios-retry'?: IAxiosRetry.IAxiosRetryConfigExtended;
  }
}

export const namespace = 'axios-retry';

/**
 * @param  {Error}  error
 * @return {boolean}
 */
export function isNetworkError(error) {
  const CODE_EXCLUDE_LIST = ['ERR_CANCELED', 'ECONNABORTED'];

  return (
    !error.response &&
    Boolean(error.code) && // Prevents retrying cancelled requests
    !CODE_EXCLUDE_LIST.includes(error.code) && // Prevents retrying timed out & cancelled requests
    isRetryAllowed(error) // Prevents retrying unsafe errors
  );
}

const SAFE_HTTP_METHODS = ['get', 'head', 'options'];
const IDEMPOTENT_HTTP_METHODS = SAFE_HTTP_METHODS.concat(['put', 'delete']);

/**
 * @param  {Error}  error
 * @return {boolean}
 */
export function isRetryableError(error) {
  return (
    error.code !== 'ECONNABORTED' &&
    (!error.response || (error.response.status >= 500 && error.response.status <= 599))
  );
}

/**
 * @param  {Error}  error
 * @return {boolean}
 */
export function isSafeRequestError(error) {
  if (!error.config) {
    // Cannot determine if the request can be retried
    return false;
  }

  return isRetryableError(error) && SAFE_HTTP_METHODS.indexOf(error.config.method) !== -1;
}

/**
 * @param  {Error}  error
 * @return {boolean}
 */
export function isIdempotentRequestError(error) {
  if (!error.config) {
    // Cannot determine if the request can be retried
    return false;
  }

  return isRetryableError(error) && IDEMPOTENT_HTTP_METHODS.indexOf(error.config.method) !== -1;
}

/**
 * @param  {Error}  error
 * @return {boolean}
 */
export function isNetworkOrIdempotentRequestError(error) {
  return isNetworkError(error) || isIdempotentRequestError(error);
}

/**
 * @return {number} - delay in milliseconds, always 0
 */
function noDelay() {
  return 0;
}

/**
 * Set delayFactor 1000 for an exponential delay to occur on the order
 * of seconds
 * @param  {number} [retryNumber=0]
 * @param  {Error}  _error - unused; for existing API of retryDelay callback
 * @param  {number} [delayFactor=100] milliseconds
 * @return {number} - delay in milliseconds
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function exponentialDelay(retryNumber = 0, _error = undefined, delayFactor = 100) {
  const delay = 2 ** retryNumber * delayFactor;
  const randomSum = delay * 0.2 * Math.random(); // 0-20% of the delay
  return delay + randomSum;
}

/** @type {IAxiosRetryConfig} */
export const DEFAULT_OPTIONS = {
  retries: 3,
  retryCondition: isNetworkOrIdempotentRequestError,
  retryDelay: noDelay,
  shouldResetTimeout: false,
  onRetry: () => {}
};

/**
 * Returns the axios-retry options for the current request
 * @param  {AxiosRequestConfig} config
 * @param  {IAxiosRetryConfig} defaultOptions
 * @return {IAxiosRetryConfigExtended}
 */
function getRequestOptions(config, defaultOptions) {
  return { ...DEFAULT_OPTIONS, ...defaultOptions, ...config[namespace] };
}

/**
 * Initializes and returns the retry state for the given request/config
 * @param  {AxiosRequestConfig} config
 * @param  {IAxiosRetryConfig} defaultOptions
 * @return {IAxiosRetryConfigExtended}
 */
function getCurrentState(config, defaultOptions) {
  const currentState = getRequestOptions(config, defaultOptions);
  currentState.retryCount = currentState.retryCount || 0;
  config[namespace] = currentState;
  return currentState;
}

/**
 * @param  {Axios} axiosInstance
 * @param  {AxiosRequestConfig} config
 */
function fixConfig(axiosInstance, config) {
  if (axiosInstance.defaults.agent === config.agent) {
    delete config.agent;
  }
  if (axiosInstance.defaults.httpAgent === config.httpAgent) {
    delete config.httpAgent;
  }
  if (axiosInstance.defaults.httpsAgent === config.httpsAgent) {
    delete config.httpsAgent;
  }
}

/**
 * Checks retryCondition if request can be retried. Handles it's returning value or Promise.
 * @param  {IAxiosRetryConfigExtended} currentState
 * @param  {Error} error
 * @return {Promise<boolean>}
 */
async function shouldRetry(currentState, error) {
  const { retries, retryCondition } = currentState;
  const shouldRetryOrPromise = currentState.retryCount < retries && retryCondition(error);

  // This could be a promise
  if (typeof shouldRetryOrPromise === 'object') {
    try {
      const shouldRetryPromiseResult = await shouldRetryOrPromise;
      // keep return true unless shouldRetryPromiseResult return false for compatibility
      return shouldRetryPromiseResult !== false;
    } catch (_err) {
      return false;
    }
  }
  return shouldRetryOrPromise;
}

/**
 * Adds response interceptors to an axios instance to retry requests failed due to network issues
 *
 * @example
 *
 * import axios from 'axios';
 *
 * axiosRetry(axios, { retries: 3 });
 *
 * axios.get('http://example.com/test') // The first request fails and the second returns 'ok'
 *   .then(result => {
 *     result.data; // 'ok'
 *   });
 *
 * // Exponential back-off retry delay between requests
 * axiosRetry(axios, { retryDelay : axiosRetry.exponentialDelay});
 *
 * // Custom retry delay
 * axiosRetry(axios, { retryDelay : (retryCount) => {
 *   return retryCount * 1000;
 * }});
 *
 * // Also works with custom axios instances
 * const client = axios.create({ baseURL: 'http://example.com' });
 * axiosRetry(client, { retries: 3 });
 *
 * client.get('/test') // The first request fails and the second returns 'ok'
 *   .then(result => {
 *     result.data; // 'ok'
 *   });
 *
 * // Allows request-specific configuration
 * client
 *   .get('/test', {
 *     'axios-retry': {
 *       retries: 0
 *     }
 *   })
 *   .catch(error => { // The first request fails
 *     error !== undefined
 *   });
 *
 * @param {Axios} axiosInstance An axios instance (the axios object or one created from axios.create)
 * @param {Object} [defaultOptions]
 * @param {number} [defaultOptions.retries=3] Number of retries
 * @param {boolean} [defaultOptions.shouldResetTimeout=false]
 *        Defines if the timeout should be reset between retries
 * @param {Function} [defaultOptions.retryCondition=isNetworkOrIdempotentRequestError]
 *        A function to determine if the error can be retried
 * @param {Function} [defaultOptions.retryDelay=noDelay]
 *        A function to determine the delay between retry requests
 * @param {Function} [defaultOptions.onRetry=()=>{}]
 *        A function to get notified when a retry occurs
 * @return {{ requestInterceptorId: number, responseInterceptorId: number }}
 *        The ids of the interceptors added to the request and to the response (so they can be ejected at a later time)
 */
const axiosRetry: IAxiosRetry.AxiosRetry = (axiosInstance, defaultOptions) => {
  const requestInterceptorId = axiosInstance.interceptors.request.use((config) => {
    const currentState = getCurrentState(config, defaultOptions);
    currentState.lastRequestTime = Date.now();
    return config;
  });

  const responseInterceptorId = axiosInstance.interceptors.response.use(null, async (error) => {
    const { config } = error;

    // If we have no information to retry the request
    if (!config) {
      return Promise.reject(error);
    }

    const currentState = getCurrentState(config, defaultOptions);

    if (await shouldRetry(currentState, error)) {
      currentState.retryCount += 1;
      const { retryDelay, shouldResetTimeout, onRetry } = currentState;
      const delay = retryDelay(currentState.retryCount, error);

      // Axios fails merging this configuration to the default configuration because it has an issue
      // with circular structures: https://github.com/mzabriskie/axios/issues/370
      fixConfig(axiosInstance, config);

      if (!shouldResetTimeout && config.timeout && currentState.lastRequestTime) {
        const lastRequestDuration = Date.now() - currentState.lastRequestTime;
        const timeout = config.timeout - lastRequestDuration - delay;
        if (timeout <= 0) {
          return Promise.reject(error);
        }
        config.timeout = timeout;
      }

      config.transformRequest = [(data) => data];

      await onRetry(currentState.retryCount, error, config);

      return new Promise((resolve) => {
        setTimeout(() => resolve(axiosInstance(config)), delay);
      });
    }

    return Promise.reject(error);
  });

  return { requestInterceptorId, responseInterceptorId };
};

// Compatibility with CommonJS
axiosRetry.isNetworkError = isNetworkError;
axiosRetry.isSafeRequestError = isSafeRequestError;
axiosRetry.isIdempotentRequestError = isIdempotentRequestError;
axiosRetry.isNetworkOrIdempotentRequestError = isNetworkOrIdempotentRequestError;
axiosRetry.exponentialDelay = exponentialDelay;
axiosRetry.isRetryableError = isRetryableError;
export default axiosRetry;
