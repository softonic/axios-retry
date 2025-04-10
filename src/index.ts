import type {
  AxiosError,
  AxiosRequestConfig,
  AxiosInstance,
  AxiosStatic,
  AxiosResponse
} from 'axios';
import isRetryAllowed from 'is-retry-allowed';

export interface IAxiosRetryConfig {
  /**
   * The number of times to retry before failing
   * default: 3
   */
  retries?: number;
  /**
   * Defines if the timeout should be reset between retries
   * default: false
   */
  shouldResetTimeout?: boolean;
  /**
   * A callback to further control if a request should be retried.
   * default: it retries if it is a network error or a 5xx error on an idempotent request (GET, HEAD, OPTIONS, PUT or DELETE).
   */
  retryCondition?: (error: AxiosError) => boolean | Promise<boolean>;
  /**
   * A callback to further control the delay between retry requests. By default there is no delay.
   */
  retryDelay?: (retryCount: number, error: AxiosError) => number;
  /**
   * A callback to get notified when a retry occurs, the number of times it has occurred, and the error
   */
  onRetry?: (
    retryCount: number,
    error: AxiosError,
    requestConfig: AxiosRequestConfig
  ) => Promise<void> | void;
  /**
   * After all the retries are failed, this callback will be called with the last error
   * before throwing the error.
   */
  onMaxRetryTimesExceeded?: (error: AxiosError, retryCount: number) => Promise<void> | void;
  /**
   * A callback to define whether a response should be resolved or rejected. If null is passed, it will fallback to
   * the axios default (only 2xx status codes are resolved).
   */
  validateResponse?: ((response: AxiosResponse) => boolean) | null;
}

export interface IAxiosRetryConfigExtended extends IAxiosRetryConfig {
  /**
   * The number of times the request was retried
   */
  retryCount?: number;
  /**
   * The last time the request was retried (timestamp in milliseconds)
   */
  lastRequestTime?: number;
}

export interface IAxiosRetryReturn {
  /**
   * The interceptorId for the request interceptor
   */
  requestInterceptorId: number;
  /**
   * The interceptorId for the response interceptor
   */
  responseInterceptorId: number;
}

export interface AxiosRetry {
  (
    axiosInstance: AxiosStatic | AxiosInstance,
    axiosRetryConfig?: IAxiosRetryConfig
  ): IAxiosRetryReturn;

  isNetworkError(error: AxiosError): boolean;
  isRetryableError(error: AxiosError): boolean;
  isSafeRequestError(error: AxiosError): boolean;
  isIdempotentRequestError(error: AxiosError): boolean;
  isNetworkOrIdempotentRequestError(error: AxiosError): boolean;
  exponentialDelay(retryCount?: number, error?: AxiosError, delayFactor?: number): number;
  linearDelay(delayFactor?: number): (retryCount: number, error: AxiosError | undefined) => number;
}

declare module 'axios' {
  export interface AxiosRequestConfig {
    'axios-retry'?: IAxiosRetryConfigExtended;
  }
}

export const namespace = 'axios-retry';

export function isNetworkError(error) {
  const CODE_EXCLUDE_LIST = ['ERR_CANCELED', 'ECONNABORTED'];
  if (error.response) {
    return false;
  }
  if (!error.code) {
    return false;
  }
  // Prevents retrying timed out & cancelled requests
  if (CODE_EXCLUDE_LIST.includes(error.code)) {
    return false;
  }
  // Prevents retrying unsafe errors
  return isRetryAllowed(error);
}

const SAFE_HTTP_METHODS = ['get', 'head', 'options'];
const IDEMPOTENT_HTTP_METHODS = SAFE_HTTP_METHODS.concat(['put', 'delete']);

export function isRetryableError(error: AxiosError): boolean {
  return (
    error.code !== 'ECONNABORTED' &&
    (!error.response ||
      error.response.status === 429 ||
      (error.response.status >= 500 && error.response.status <= 599))
  );
}

export function isSafeRequestError(error: AxiosError): boolean {
  if (!error.config?.method) {
    // Cannot determine if the request can be retried
    return false;
  }

  return isRetryableError(error) && SAFE_HTTP_METHODS.indexOf(error.config.method) !== -1;
}

export function isIdempotentRequestError(error: AxiosError): boolean {
  if (!error.config?.method) {
    // Cannot determine if the request can be retried
    return false;
  }
  return isRetryableError(error) && IDEMPOTENT_HTTP_METHODS.indexOf(error.config.method) !== -1;
}

export function isNetworkOrIdempotentRequestError(error: AxiosError): boolean {
  return isNetworkError(error) || isIdempotentRequestError(error);
}

export function retryAfter(error: AxiosError | undefined = undefined): number {
  // some mocking libraries dont have headers on error response - gracefully handle this
  const retryAfterHeader = (error?.response?.headers || {})['retry-after'];
  if (!retryAfterHeader) {
    return 0;
  }
  // if the retry after header is a number, convert it to milliseconds
  let retryAfterMs = (Number(retryAfterHeader) || 0) * 1000;
  // If the retry after header is a date, get the number of milliseconds until that date
  if (retryAfterMs === 0) {
    // safe because (InvalidDate).valueOf() returns NaN (Nan || 0) -> 0
    retryAfterMs = (new Date(retryAfterHeader as any).valueOf() || 0) - Date.now();
  }
  return Math.max(0, retryAfterMs);
}

function noDelay(_retryCount = 0, error: AxiosError | undefined = undefined) {
  return Math.max(0, retryAfter(error));
}

export function exponentialDelay(
  retryCount = 0,
  error: AxiosError | undefined = undefined,
  delayFactor = 100
): number {
  const calculatedDelay = 2 ** retryCount * delayFactor;
  const delay = Math.max(calculatedDelay, retryAfter(error));
  const randomSum = delay * 0.2 * Math.random(); // 0-20% of the delay
  return delay + randomSum;
}

/**
 * Linear delay
 * @param {number | undefined} delayFactor - delay factor in milliseconds (default: 100)
 * @returns {function} (retryCount: number, error: AxiosError | undefined) => number
 */
export function linearDelay(
  delayFactor: number | undefined = 100
): (retryCount: number, error: AxiosError | undefined) => number {
  return (retryCount = 0, error = undefined) => {
    const delay = retryCount * delayFactor;
    return Math.max(delay, retryAfter(error));
  };
}

export const DEFAULT_OPTIONS: Required<IAxiosRetryConfig> = {
  retries: 3,
  retryCondition: isNetworkOrIdempotentRequestError,
  retryDelay: noDelay,
  shouldResetTimeout: false,
  onRetry: () => {},
  onMaxRetryTimesExceeded: () => {},
  validateResponse: null
};

function getRequestOptions(
  config: AxiosRequestConfig,
  defaultOptions: IAxiosRetryConfig
): Required<IAxiosRetryConfig> & IAxiosRetryConfigExtended {
  return { ...DEFAULT_OPTIONS, ...defaultOptions, ...config[namespace] };
}

function setCurrentState(
  config: AxiosRequestConfig,
  defaultOptions: IAxiosRetryConfig | undefined,
  resetLastRequestTime = false
) {
  const currentState = getRequestOptions(config, defaultOptions || {});
  currentState.retryCount = currentState.retryCount || 0;
  if (!currentState.lastRequestTime || resetLastRequestTime) {
    currentState.lastRequestTime = Date.now();
  }
  config[namespace] = currentState;
  return currentState as Required<IAxiosRetryConfigExtended>;
}

function fixConfig(axiosInstance: AxiosInstance | AxiosStatic, config: AxiosRequestConfig) {
  // @ts-ignore
  if (axiosInstance.defaults.agent === config.agent) {
    // @ts-ignore
    delete config.agent;
  }
  if (axiosInstance.defaults.httpAgent === config.httpAgent) {
    delete config.httpAgent;
  }
  if (axiosInstance.defaults.httpsAgent === config.httpsAgent) {
    delete config.httpsAgent;
  }
}

async function shouldRetry(
  currentState: Required<IAxiosRetryConfig> & IAxiosRetryConfigExtended,
  error: AxiosError
) {
  const { retries, retryCondition } = currentState;
  const shouldRetryOrPromise = (currentState.retryCount || 0) < retries && retryCondition(error);

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
async function handleRetry(
  axiosInstance: AxiosInstance,
  currentState: Required<IAxiosRetryConfigExtended>,
  error: AxiosError,
  config: AxiosRequestConfig
) {
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
  if (config.signal?.aborted) {
    return Promise.resolve(axiosInstance(config));
  }
  return new Promise((resolve) => {
    const abortListener = () => {
      clearTimeout(timeout);
      resolve(axiosInstance(config));
    };
    const timeout = setTimeout(() => {
      resolve(axiosInstance(config));
      if (config.signal?.removeEventListener) {
        config.signal.removeEventListener('abort', abortListener);
      }
    }, delay);
    if (config.signal?.addEventListener) {
      config.signal.addEventListener('abort', abortListener, { once: true });
    }
  });
}

async function handleMaxRetryTimesExceeded(
  currentState: Required<IAxiosRetryConfigExtended>,
  error: AxiosError
) {
  if (currentState.retryCount >= currentState.retries)
    await currentState.onMaxRetryTimesExceeded(error, currentState.retryCount);
}

const axiosRetry: AxiosRetry = (axiosInstance, defaultOptions) => {
  const requestInterceptorId = axiosInstance.interceptors.request.use((config) => {
    setCurrentState(config, defaultOptions, true);
    if (config[namespace]?.validateResponse) {
      // by setting this, all HTTP responses will be go through the error interceptor first
      config.validateStatus = () => false;
    }
    return config;
  });

  const responseInterceptorId = axiosInstance.interceptors.response.use(null, async (error) => {
    const { config } = error;
    // If we have no information to retry the request
    if (!config) {
      return Promise.reject(error);
    }
    const currentState = setCurrentState(config, defaultOptions);
    if (error.response && currentState.validateResponse?.(error.response)) {
      // no issue with response
      return error.response;
    }
    if (await shouldRetry(currentState, error)) {
      return handleRetry(axiosInstance, currentState, error, config);
    }

    await handleMaxRetryTimesExceeded(currentState, error);

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
axiosRetry.linearDelay = linearDelay;
axiosRetry.isRetryableError = isRetryableError;
export default axiosRetry;
