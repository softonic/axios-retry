import isRetryAllowed from 'is-retry-allowed';

const resolveOrReject = (error, response) => {
  if (!error) {
    return Promise.resolve(response);
  }

  return Promise.reject(error);
};

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
 */
const axiosRetry = (
  axios,
  {
    retries = 3,
    // eslint-disable-next-line no-unused-vars
    retryCondition = (error, response) => error && !error.response
  } = {}
) => {
  const retry = (error = {}, response = {}) => {
    const config = (error && error.config) || (response && response.config);

    // If we have no information to retry the request
    if (!config) {
      return resolveOrReject(error, response);
    }

    config.retryCount = config.retryCount || 0;

    const shouldRetry = retryCondition(error, response) &&
      (error && error.code) !== 'ECONNABORTED' &&
      config.retryCount < retries &&
      isRetryAllowed(error);

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

    return resolveOrReject(error, response);
  };

  axios.interceptors.response.use(
    (response) => retry(null, response),
    (error) => retry(error, null)
  );
};

export default axiosRetry;
