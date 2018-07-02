import * as axios from 'axios'

export interface IAxiosRetryConfig {
  /**
   * The number of times to retry before failing
   * default: 3
   *
   * @type {number}
   */
  retries?: number,
  /**
   * Defines if the timeout should be reset between retries
   * default: false
   *
   * @type {boolean}
   */
  shouldResetTimeout?: boolean,
  /**
   * A callback to further control if a request should be retried. By default, it retries if the result did not have a response.
   * default: error => !error.response
   *
   * @type {Function}
   */
  retryCondition?: (error: axios.AxiosError) => boolean,
  /**
   * A callback to further control the delay between retry requests. By default there is no delay.
   *
   * @type {Function}
   */
  retryDelay?: (retryCount: number, error: axios.AxiosError) => number
}

export interface IAxiosRetry {
  (
    axios: axios.AxiosStatic | axios.AxiosInstance,
    axiosRetryConfig?: IAxiosRetryConfig
  ): void
}

declare const axiosRetry: IAxiosRetry

export default axiosRetry

export function isNetworkError(error: Error): boolean;
export function isRetryableError(error: Error): boolean;
export function isSafeRequestError(error: Error): boolean;
export function isIdempotentRequestError(error: Error): boolean;
export function isNetworkOrIdempotentRequestError(error: Error): boolean;
export function exponentialDelay(retryNumber: number): number;
