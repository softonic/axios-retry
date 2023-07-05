import axiosRetry, { exponentialDelay, AxiosRetryConfig } from 'axios-retry';
import axios, { AxiosInstance } from 'axios';

const instance: AxiosInstance = axios.create();

const config: AxiosRetryConfig = { retryDelay: axiosRetry.exponentialDelay };
const config2: axiosRetry.AxiosRetryConfig = { retryDelay: exponentialDelay };

axiosRetry(axios, config);
axiosRetry(instance, config2);
