import * as axios from 'axios';

interface IAxiosRetry {
  (
    axios: axios.AxiosStatic | axios.AxiosInstance,
    axiosRetryConfig?: IAxiosRetry.IAxiosRetryConfig
  ): void;

  isNetworkError(error: Error): boolean;
  isRetryableError(error: Error): boolean;
  isSafeRequestError(error: Error): boolean;
  isIdempotentRequestError(error: Error): boolean;
  isNetworkOrIdempotentRequestError(error: Error): boolean;
  exponentialDelay(retryNumber?: number, error?: Error, delayFactor?: number): number;
}

export function isNetworkError(error: Error): boolean;
export function isRetryableError(error: Error): boolean;
export function isSafeRequestError(error: Error): boolean;
export function isIdempotentRequestError(error: Error): boolean;
export function isNetworkOrIdempotentRequestError(error: Error): boolean;
export function exponentialDelay(retryNumber?: number, error?: Error, delayFactor?: number): number;

declare namespace IAxiosRetry {
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
    retryCondition?: (error: axios.AxiosError) => boolean | Promise<boolean>;
    /**
     * A callback to further control the delay between retry requests. By default there is no delay.
     */
    retryDelay?: (retryCount: number, error: axios.AxiosError) => number;
    /**
     * A callback to get notified when a retry occurs, the number of times it has occurre, and the error
     */
    onRetry?: (
      retryCount: number,
      error: axios.AxiosError,
      requestConfig: axios.AxiosRequestConfig
    ) => void;
  }
}

declare const axiosRetry: IAxiosRetry;

export type IAxiosRetryConfig = IAxiosRetry.IAxiosRetryConfig;

export default axiosRetry;

declare module 'axios' {
  export interface AxiosRequestConfig {
    'axios-retry'?: IAxiosRetryConfig;
  }
}
