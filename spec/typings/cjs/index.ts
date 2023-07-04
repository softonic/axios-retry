import axiosRetry, { exponentialDelay } from 'axios-retry';
import axios from 'axios';

const instance = axios.create();

axiosRetry(axios, { retryDelay: axiosRetry.exponentialDelay });
axiosRetry(instance, { retryDelay: exponentialDelay });
