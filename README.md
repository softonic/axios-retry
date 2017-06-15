# axios-retry

Axios plugin that intercepts failed requests and retries them whenever posible.

## Installation

```bash
npm install axios-retry
```

## Usage

```js
// CommonJS
// const axiosRetry = require('axios-retry');

// ES6
import axiosRetry from 'axios-retry';

axiosRetry(axios, { retries: 3 });

axios.get('http://example.com/test') // The first request fails and the second returns 'ok'
  .then(result => {
    result.data; // 'ok'
  });

// Works with custom axios instances
const client = axios.create({ baseURL: 'http://example.com' });
axiosRetry(client, { retries: 3 });

client.get('/test') // The first request fails and the second returns 'ok'
  .then(result => {
    result.data; // 'ok'
  });

// Allows request-specific configuration
client
  .get('/test', {
    'axios-retry': {
      retries: 0
    }
  })
  .catch(error => { // The first request fails
    error !== undefined
  });
```

## Options

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| retries | `Number` | 3 | The number of times to retry before failing |
| retryCondition | `Function` | `error => !error.response` | A callback to further control if a request should be retried.  By default, it retries if the result did not have a response. |

## Testing

Clone the repository and execute:

```bash
npm test
```

## Contribute

1. Fork it: `git clone https://github.com/softonic/axios-retry.git`
2. Create your feature branch: `git checkout -b feature/my-new-feature`
3. Commit your changes: `git commit -am 'Added some feature'`
4. Check the build: `npm run build`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request :D
