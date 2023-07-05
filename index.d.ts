import * as axios from 'axios';

export = IAxiosRetry;
export as namespace axiosRetry;
declare const IAxiosRetry: IAxiosRetry.AxiosRetry;

declare namespace IAxiosRetry {
  interface AxiosRetry {
    (axios: axios.AxiosStatic | axios.AxiosInstance, axiosRetryConfig?: AxiosRetryConfig): void;

    isNetworkError(error: Error): boolean;
    isRetryableError(error: Error): boolean;
    isSafeRequestError(error: Error): boolean;
    isIdempotentRequestError(error: Error): boolean;
    isNetworkOrIdempotentRequestError(error: Error): boolean;
    exponentialDelay(retryNumber?: number, error?: Error, delayFactor?: number): number;
  }

  interface AxiosRetryConfig {
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

declare module 'axios' {
  interface AxiosRequestConfig {
    'axios-retry'?: IAxiosRetry.AxiosRetryConfig;
  }
}
