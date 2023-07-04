// tslint:disable-next-line: no-relative-import-in-test
import axiosRetry, { isNetworkError, exponentialDelay } from '.';
import axios from 'axios';

const instance = axios.create();

axiosRetry(); // $ExpectError

axiosRetry(axios); // $ExpectType void
axiosRetry(instance); // $ExpectType void

axiosRetry(axios, { retries: 3, shouldResetTimeout: false }); // $ExpectType void

axiosRetry(axios, { retryCondition: (e) => e.name === 'error' }); // $ExpectType void
axiosRetry(axios, { retryCondition: isNetworkError }); // $ExpectType void
axiosRetry(axios, { retryCondition: axiosRetry.isNetworkError }); // $ExpectType void
axiosRetry(axios, { retryCondition: exponentialDelay }); // $ExpectError

axiosRetry(axios, { retryDelay: (count, error) => 1 }); // $ExpectType void
axiosRetry(axios, { retryDelay: exponentialDelay }); // $ExpectType void
axiosRetry(axios, { retryDelay: axiosRetry.exponentialDelay }); // $ExpectType void
axiosRetry(axios, { retryDelay: isNetworkError }); // $ExpectError

// $ExpectType void
axiosRetry(axios, {
  onRetry: (count, error, config) => {
    console.log(error);
  }
});
