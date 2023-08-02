// tslint:disable-next-line: no-relative-import-in-test
import axiosRetry, { isNetworkError, exponentialDelay } from '.';
import axios from 'axios';

const instance = axios.create();

axiosRetry(); // $ExpectError

axiosRetry(axios); // $ExpectType AxiosRetryReturn
axiosRetry(instance); // $ExpectType AxiosRetryReturn

axiosRetry(axios, { retries: 3, shouldResetTimeout: false }); // $ExpectType AxiosRetryReturn

axiosRetry(axios, { retryCondition: (e) => e.name === 'error' }); // $ExpectType AxiosRetryReturn
axiosRetry(axios, { retryCondition: isNetworkError }); // $ExpectType AxiosRetryReturn
axiosRetry(axios, { retryCondition: axiosRetry.isNetworkError }); // $ExpectType AxiosRetryReturn
axiosRetry(axios, { retryCondition: exponentialDelay }); // $ExpectError

axiosRetry(axios, { retryDelay: (count, error) => 1 }); // $ExpectType AxiosRetryReturn
axiosRetry(axios, { retryDelay: exponentialDelay }); // $ExpectType AxiosRetryReturn
axiosRetry(axios, { retryDelay: axiosRetry.exponentialDelay }); // $ExpectType AxiosRetryReturn
axiosRetry(axios, { retryDelay: isNetworkError }); // $ExpectError

// $ExpectType AxiosRetryReturn
axiosRetry(axios, {
  onRetry: (count, error, config) => {
    console.log(error);
  }
});
