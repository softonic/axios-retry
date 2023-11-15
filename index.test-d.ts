import { expectType } from 'tsd';
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import axiosRetry, {
  IAxiosRetryConfig,
  IAxiosRetryConfigExtended,
  IAxiosRetryReturn,
  exponentialDelay,
  isIdempotentRequestError,
  isNetworkError,
  isNetworkOrIdempotentRequestError,
  isRetryableError,
  isSafeRequestError
} from './index.js';

const axiosInstance = axios.create();

expectType<IAxiosRetryReturn>(axiosRetry(axios));
expectType<IAxiosRetryReturn>(axiosRetry(axiosInstance));

const axiosRetryConfig: IAxiosRetryConfig = {
  retries: 3,
  shouldResetTimeout: true,
  retryCondition: (error: AxiosError) => {
    return true;
  },
  retryDelay: (retryCount: number, error: AxiosError) => {
    return 100;
  },
  onRetry: (retryCount: number, error: AxiosError, requestConfig: AxiosRequestConfig) => {
    const axiosRetryConfig: IAxiosRetryConfigExtended | undefined = requestConfig['axios-retry'];
    console.log(retryCount, error, requestConfig, axiosRetryConfig);

    expectType<IAxiosRetryConfigExtended | undefined>(requestConfig['axios-retry']);
    expectType<number | undefined>(axiosRetryConfig?.retryCount);
    expectType<number | undefined>(axiosRetryConfig?.lastRequestTime);
  }
};
expectType<IAxiosRetryReturn>(axiosRetry(axios, axiosRetryConfig));

expectType<IAxiosRetryReturn>(axiosRetry(axios, { retryCondition: axiosRetry.isNetworkError }));
expectType<IAxiosRetryReturn>(axiosRetry(axios, { retryCondition: axiosRetry.isRetryableError }));
expectType<IAxiosRetryReturn>(axiosRetry(axios, { retryCondition: axiosRetry.isSafeRequestError }));
expectType<IAxiosRetryReturn>(
  axiosRetry(axios, { retryCondition: axiosRetry.isIdempotentRequestError })
);
expectType<IAxiosRetryReturn>(
  axiosRetry(axios, { retryCondition: axiosRetry.isNetworkOrIdempotentRequestError })
);
expectType<IAxiosRetryReturn>(axiosRetry(axios, { retryDelay: axiosRetry.exponentialDelay }));

expectType<IAxiosRetryReturn>(axiosRetry(axios, { retryCondition: isNetworkError }));
expectType<IAxiosRetryReturn>(axiosRetry(axios, { retryCondition: isRetryableError }));
expectType<IAxiosRetryReturn>(axiosRetry(axios, { retryCondition: isSafeRequestError }));
expectType<IAxiosRetryReturn>(axiosRetry(axios, { retryCondition: isIdempotentRequestError }));
expectType<IAxiosRetryReturn>(
  axiosRetry(axios, { retryCondition: isNetworkOrIdempotentRequestError })
);
expectType<IAxiosRetryReturn>(axiosRetry(axios, { retryDelay: exponentialDelay }));
