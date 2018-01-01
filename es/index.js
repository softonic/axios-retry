import isRetryAllowed from 'is-retry-allowed';

let shouldRetryAborted;
const namespace = 'axios-retry';

/**
 * @param  {Error}  error
 * @return {boolean}
 */
export function isTimeoutError(error) {
  return error.code !== 'ECONNABORTED';
}

/**
 * @param  {Error}  error
 * @return {boolean}
 */
export function isNetworkError(error) {
  return !error.response
    && Boolean(error.code) // Prevents retrying cancelled requests
    && (shouldRetryAborted || isTimeoutError(error)) // Prevents retrying timed out requests
    && isRetryAllowed(error); // Prevents retrying unsafe errors
}

const SAFE_HTTP_METHODS = ['get', 'head', 'options'];
const IDEMPOTENT_HTTP_METHODS = SAFE_HTTP_METHODS.concat(['put', 'delete']);

/**
 * @param  {Error}  error
 * @return {boolean}
 */
function isRetryableError(error) {
  return (shouldRetryAborted || isTimeoutError(error))
    && (!error.response || (error.response.status >= 500 && error.response.status <= 599));
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
  return isTimeoutError(error) || isNetworkError(error) || isIdempotentRequestError(error);
}

/**
 * Initializes and returns the retry state for the given request/config
 * @param  {AxiosRequestConfig} config
 * @return {Object}
 */
function getCurrentState(config) {
  const currentState = config[namespace] || {};
  currentState.retryCount = currentState.retryCount || 0;
  config[namespace] = currentState;
  return currentState;
}

/**
 * Returns the axios-retry options for the current request
 * @param  {AxiosRequestConfig} config
 * @param  {AxiosRetryConfig} defaultOptions
 * @return {AxiosRetryConfig}
 */
function getRequestOptions(config, defaultOptions) {
  return Object.assign({}, defaultOptions, config[namespace]);
}

/**
 * @param  {Axios} axios
 * @param  {AxiosRequestConfig} config
 */
function fixConfig(axios, config) {
  if (axios.defaults.agent === config.agent) {
    delete config.agent;
  }
  if (axios.defaults.httpAgent === config.httpAgent) {
    delete config.httpAgent;
  }
  if (axios.defaults.httpsAgent === config.httpsAgent) {
    delete config.httpsAgent;
  }
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
 * @param {Axios} axios An axios instance (the axios object or one created from axios.create)
 * @param {Object} [defaultOptions]
 * @param {number} [defaultOptions.retries=3] Number of retries
 * @param {boolean} [defaultOptions.retryAborted=false] whether to retry failed requests with code `ECONNABORTED` 
 * @param {number} [defaultOptions.retryCondition=isNetworkOrIdempotentRequestError]
 *        A function to determine if the error can be retried
 */
export default function axiosRetry(axios, defaultOptions) {
  axios.interceptors.request.use((config) => {
    const currentState = getCurrentState(config);
    currentState.lastRequestTime = Date.now();
    return config;
  });

  axios.interceptors.response.use(null, error => {
    const config = error.config;

    // If we have no information to retry the request
    if (!config) {
      return Promise.reject(error);
    }

    const {
      retries = 3,
      retryAborted = false,
      retryCondition = isNetworkOrIdempotentRequestError
    } = getRequestOptions(config, defaultOptions);

    shouldRetryAborted = retryAborted;
    const currentState = getCurrentState(config);

    const shouldRetry = retryCondition(error)
      && currentState.retryCount < retries;

    if (shouldRetry) {
      currentState.retryCount++;

      // Axios fails merging this configuration to the default configuration because it has an issue
      // with circular structures: https://github.com/mzabriskie/axios/issues/370
      fixConfig(axios, config);

      if (config.timeout && currentState.lastRequestTime) {
        const lastRequestDuration = Date.now() - currentState.lastRequestTime;
        // Minimum 1ms timeout (passing 0 or less to XHR means no timeout)
        config.timeout = Math.max(config.timeout - lastRequestDuration, 1);
      }

      return axios(config);
    }

    return Promise.reject(error);
  });
}

// Compatibility with CommonJS
axiosRetry.isNetworkError = isNetworkError;
axiosRetry.isSafeRequestError = isSafeRequestError;
axiosRetry.isIdempotentRequestError = isIdempotentRequestError;
axiosRetry.isNetworkOrIdempotentRequestError = isNetworkOrIdempotentRequestError;
