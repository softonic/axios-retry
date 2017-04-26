import isRetryAllowed from 'is-retry-allowed';

/**
 * Adds response interceptors to an axios instance to retry requests failed due to network issues
 *
 * @example
 *
 * import axios from 'axios';
 *
 * axiosRetry(axios, { retries: 3 });
 *
 * axios.get('http://example.com/test') // The first request fails and the second returns 'ok'
 *   .then(result => {
 *     result.data; // 'ok'
 *   });
 *
 * // Also works with custom axios instances
 * const client = axios.create({ baseURL: 'http://example.com' });
 * axiosRetry(client, { retries: 3 });
 *
 * client.get('/test') // The first request fails and the second returns 'ok'
 *   .then(result => {
 *     result.data; // 'ok'
 *   });
 *
 * @param {Axios} axios An axios instance (the axios object or one created from axios.create)
 * @param {Object} [options]
 * @param {number} [options.retries=3] Number of retries
 * @param {number} [options.useIsRetryAllowed=true] ask "is-retry-allowed" if the request error is eliglible to retry it
 * @param {number} [options.retryCondition=error => !error.response && error.code !== 'ECONNABORTED'] check to determine if we should retry the request
 */
export default function axiosRetry(axios, {
  retries = 3,
  useIsRetryAllowed = true,
  retryCondition = error => !error.response && error.code !== 'ECONNABORTED'
} = {}) {
  axios.interceptors.response.use(null, error => {
    const config = error.config;

    // If we have no information to retry the request
    if (!config) {
      return Promise.reject(error);
    }

    config.retryCount = config.retryCount || 0;

    const shouldRetry = retryCondition(error)
      && (useIsRetryAllowed ? isRetryAllowed(error) : true)
      && config.retryCount < retries;

    if (shouldRetry) {
      config.retryCount++;

      // Axios fails merging this configuration to the default configuration because it has an issue
      // with circular structures
      if (axios.defaults.agent === config.agent) {
        delete config.agent;
      }
      if (axios.defaults.httpAgent === config.httpAgent) {
        delete config.httpAgent;
      }
      if (axios.defaults.httpsAgent === config.httpsAgent) {
        delete config.httpsAgent;
      }

      return axios(config);
    }

    return Promise.reject(error);
  });
}
