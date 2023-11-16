import * as axios from 'axios';

export = IAxiosRetry;
export as namespace axiosRetry;
declare const IAxiosRetry: IAxiosRetry.AxiosRetry;

declare namespace IAxiosRetry {
  export interface AxiosRetry {
    (
      axios: axios.AxiosStatic | axios.AxiosInstance,
      axiosRetryConfig?: IAxiosRetryConfig
    ): IAxiosRetryReturn;

    isNetworkError(error: Error): boolean;
    isRetryableError(error: Error): boolean;
    isSafeRequestError(error: Error): boolean;
    isIdempotentRequestError(error: Error): boolean;
    isNetworkOrIdempotentRequestError(error: Error): boolean;
    exponentialDelay(retryNumber?: number, error?: Error, delayFactor?: number): number;
  }

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
     * A callback to get notified when a retry occurs, the number of times it has occurre, and the error
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
}

declare module 'axios' {
  export interface AxiosRequestConfig {
    'axios-retry'?: IAxiosRetry.IAxiosRetryConfigExtended;
  }
}
