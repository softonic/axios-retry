import axiosRetry, { exponentialDelay, AxiosRetryConfig } from 'axios-retry';
import axios from 'axios';

const instance = axios.create();
const config: AxiosRetryConfig = { retryDelay: axiosRetry.exponentialDelay };

axiosRetry(axios, config);
axiosRetry(instance, { retryDelay: exponentialDelay });
