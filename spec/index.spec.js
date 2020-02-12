import http from 'http';
import nock from 'nock';
import axios from 'axios';
import axiosRetry, {
  isNetworkError,
  isSafeRequestError,
  isIdempotentRequestError,
  exponentialDelay,
  isRetryableError
} from '../es/index';

const NETWORK_ERROR = new Error('Some connection error');
NETWORK_ERROR.code = 'ECONNRESET';

function setupResponses(client, responses) {
  const configureResponse = () => {
    const response = responses.shift();
    if (response) {
      response();
    }
  };
  client.interceptors.response.use(
    result => {
      configureResponse();
      return result;
    },
    error => {
      configureResponse();
      return Promise.reject(error);
    }
  );
  configureResponse();
}

describe('axiosRetry(axios, { retries, retryCondition })', () => {
  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  describe('when the response is successful', () => {
    it('should resolve with it', done => {
      const client = axios.create();
      setupResponses(client, [
        () =>
          nock('http://example.com')
            .get('/test')
            .reply(200, 'It worked!')
      ]);

      axiosRetry(client, { retries: 0 });

      client.get('http://example.com/test').then(result => {
        expect(result.status).toBe(200);
        done();
      }, done.fail);
    });
  });

  describe('when the response is an error', () => {
    it('should check if it satisfies the `retryCondition`', done => {
      const client = axios.create();
      setupResponses(client, [
        () =>
          nock('http://example.com')
            .get('/test')
            .replyWithError(NETWORK_ERROR),
        () =>
          nock('http://example.com')
            .get('/test')
            .reply(200, 'It worked!')
      ]);

      const retryCondition = error => {
        expect(error).toBe(NETWORK_ERROR);
        done();
        return false;
      };

      axiosRetry(client, { retries: 1, retryCondition });

      client.get('http://example.com/test').catch(() => {});
    });

    describe('when it satisfies the retry condition', () => {
      it('should resolve with a successful retry', done => {
        const client = axios.create();
        setupResponses(client, [
          () =>
            nock('http://example.com')
              .get('/test')
              .replyWithError(NETWORK_ERROR),
          () =>
            nock('http://example.com')
              .get('/test')
              .reply(200, 'It worked!')
        ]);

        axiosRetry(client, { retries: 1, retryCondition: () => true });

        client.get('http://example.com/test').then(result => {
          expect(result.status).toBe(200);
          done();
        }, done.fail);
      });

      it('should not run transformRequest twice', done => {
        const client = axios.create({
          transformRequest: [JSON.stringify]
        });
        setupResponses(client, [
          () =>
            nock('http://example.com')
              .post('/test', body => {
                expect(body.a).toBe('b');
                return true;
              })
              .replyWithError(NETWORK_ERROR),
          () =>
            nock('http://example.com')
              .post('/test', body => {
                expect(body.a).toBe('b');
                return true;
              })
              .reply(200, 'It worked!')
        ]);

        axiosRetry(client, { retries: 1, retryCondition: () => true });

        client.post('http://example.com/test', { a: 'b' }).then(result => {
          expect(result.status).toBe(200);
          done();
        }, done.fail);
      });

      it('should reject with a request error if retries <= 0', done => {
        const client = axios.create();

        setupResponses(client, [
          () =>
            nock('http://example.com')
              .get('/test')
              .replyWithError(NETWORK_ERROR)
        ]);

        axiosRetry(client, { retries: 0, retryCondition: () => {} });

        client.get('http://example.com/test').then(done.fail, error => {
          expect(error).toBe(NETWORK_ERROR);
          done();
        });
      });

      it('should reject with a request error if there are more errors than retries', done => {
        const client = axios.create();

        setupResponses(client, [
          () =>
            nock('http://example.com')
              .get('/test')
              .replyWithError(new Error('foo error')),
          () =>
            nock('http://example.com')
              .get('/test')
              .replyWithError(NETWORK_ERROR)
        ]);

        axiosRetry(client, { retries: 1, retryCondition: () => true });

        client.get('http://example.com/test').then(done.fail, error => {
          expect(error).toBe(NETWORK_ERROR);
          done();
        });
      });

      it('should honor the original `timeout` across retries', done => {
        const client = axios.create();

        setupResponses(client, [
          () =>
            nock('http://example.com')
              .get('/test')
              .delay(75)
              .replyWithError(NETWORK_ERROR),
          () =>
            nock('http://example.com')
              .get('/test')
              .delay(75)
              .replyWithError(NETWORK_ERROR),
          () =>
            nock('http://example.com')
              .get('/test')
              .reply(200)
        ]);

        axiosRetry(client, { retries: 3 });

        client.get('http://example.com/test', { timeout: 100 }).then(done.fail, error => {
          expect(error.code).toBe('ECONNABORTED');
          done();
        });
      });

      it('should reset the original `timeout` between requests', done => {
        const client = axios.create();

        setupResponses(client, [
          () =>
            nock('http://example.com')
              .get('/test')
              .delay(75)
              .replyWithError(NETWORK_ERROR),
          () =>
            nock('http://example.com')
              .get('/test')
              .delay(75)
              .replyWithError(NETWORK_ERROR),
          () =>
            nock('http://example.com')
              .get('/test')
              .reply(200)
        ]);

        axiosRetry(client, { retries: 3, shouldResetTimeout: true });

        client.get('http://example.com/test', { timeout: 100 }).then(result => {
          expect(result.status).toBe(200);
          done();
        });
      });

      it('should reject with errors without a `config` property without retrying', done => {
        const client = axios.create();

        setupResponses(client, [
          () =>
            nock('http://example.com')
              .get('/test')
              .replyWithError(NETWORK_ERROR),
          () =>
            nock('http://example.com')
              .get('/test')
              .reply(200)
        ]);

        // Force returning a plain error without extended information from Axios
        const generatedError = new Error();
        client.interceptors.response.use(null, () => Promise.reject(generatedError));

        axiosRetry(client, { retries: 1, retryCondition: () => true });

        client.get('http://example.com/test').then(done.fail, error => {
          expect(error).toBe(generatedError);
          done();
        });
      });

      it('should work with a custom `agent` configuration', done => {
        const httpAgent = new http.Agent();

        // Simulate circular structure
        const fakeSocket = { foo: 'foo' };
        httpAgent.sockets['multisearch.api.softonic.com:80:'] = [fakeSocket];
        fakeSocket.socket = fakeSocket;

        const client = axios.create({ agent: httpAgent });
        setupResponses(client, [
          () =>
            nock('http://example.com')
              .get('/test')
              .replyWithError(NETWORK_ERROR),
          () =>
            nock('http://example.com')
              .get('/test')
              .reply(200, 'It worked!')
        ]);

        axiosRetry(client, { retries: 1, retryCondition: () => true });

        client.get('http://example.com/test').then(result => {
          expect(result.status).toBe(200);
          done();
        }, done.fail);
      });

      it('should work with a custom `httpAgent` configuration', done => {
        const httpAgent = new http.Agent();

        // Simulate circular structure
        const fakeSocket = { foo: 'foo' };
        httpAgent.sockets['multisearch.api.softonic.com:80:'] = [fakeSocket];
        fakeSocket.socket = fakeSocket;

        const client = axios.create({ httpAgent });
        setupResponses(client, [
          () =>
            nock('http://example.com')
              .get('/test')
              .replyWithError(NETWORK_ERROR),
          () =>
            nock('http://example.com')
              .get('/test')
              .reply(200, 'It worked!')
        ]);

        axiosRetry(client, { retries: 1, retryCondition: () => true });

        client.get('http://example.com/test').then(result => {
          expect(result.status).toBe(200);
          done();
        }, done.fail);
      });
    });

    describe('when it does NOT satisfy the retry condition', () => {
      it('should reject with the error', done => {
        const client = axios.create();
        setupResponses(client, [
          () =>
            nock('http://example.com')
              .get('/test')
              .replyWithError(NETWORK_ERROR),
          () =>
            nock('http://example.com')
              .get('/test')
              .reply(200, 'It worked!')
        ]);

        axiosRetry(client, { retries: 1, retryCondition: () => false });

        client.get('http://example.com/test').then(done.fail, error => {
          expect(error).toBe(NETWORK_ERROR);
          done();
        });
      });
    });
  });

  it('should use request-specific configuration', done => {
    const client = axios.create();

    setupResponses(client, [
      () =>
        nock('http://example.com')
          .get('/test')
          .replyWithError(NETWORK_ERROR),
      () =>
        nock('http://example.com')
          .get('/test')
          .replyWithError(NETWORK_ERROR),
      () =>
        nock('http://example.com')
          .get('/test')
          .reply(200)
    ]);

    axiosRetry(client, { retries: 0 });

    client
      .get('http://example.com/test', {
        'axios-retry': {
          retries: 2
        }
      })
      .then(result => {
        expect(result.status).toBe(200);
        done();
      }, done.fail);
  });
});

describe('axiosRetry(axios, { retries, retryDelay })', () => {
  describe('when custom retryDelay function is supplied', () => {
    it('should execute for each retry', done => {
      const client = axios.create();

      setupResponses(client, [
        () =>
          nock('http://example.com')
            .get('/test')
            .replyWithError(NETWORK_ERROR),
        () =>
          nock('http://example.com')
            .get('/test')
            .replyWithError(NETWORK_ERROR),
        () =>
          nock('http://example.com')
            .get('/test')
            .replyWithError(NETWORK_ERROR),
        () =>
          nock('http://example.com')
            .get('/test')
            .reply(200, 'It worked!')
      ]);

      let retryCount = 0;

      axiosRetry(client, {
        retries: 4,
        retryCondition: response => response.code === NETWORK_ERROR.code,
        retryDelay: () => {
          retryCount += 1;
          return 0;
        }
      });

      client.get('http://example.com/test').then(() => {
        expect(retryCount).toBe(3);
        done();
      }, done.fail);
    });
  });
});

describe('isNetworkError(error)', () => {
  it('should be true for network errors like connection refused', () => {
    const connectionRefusedError = new Error();
    connectionRefusedError.code = 'ECONNREFUSED';
    expect(isNetworkError(connectionRefusedError)).toBe(true);
  });

  it('should be false for timeout errors', () => {
    const timeoutError = new Error();
    timeoutError.code = 'ECONNABORTED';
    expect(isNetworkError(timeoutError)).toBe(false);
  });

  it('should be false for errors with a response', () => {
    const responseError = new Error('Response error');
    responseError.response = { status: 500 };
    expect(isNetworkError(responseError)).toBe(false);
  });

  it('should be false for other errors', () => {
    expect(isNetworkError(new Error())).toBe(false);
  });
});

describe('isSafeRequestError(error)', () => {
  ['get', 'head', 'options'].forEach(method => {
    it(`should be true for "${method}" requests with a 5xx response`, () => {
      const errorResponse = new Error('Error response');
      errorResponse.config = { method };
      errorResponse.response = { status: 500 };
      expect(isSafeRequestError(errorResponse)).toBe(true);
    });

    it(`should be true for "${method}" requests without a response`, () => {
      const errorResponse = new Error('Error response');
      errorResponse.config = { method };
      expect(isSafeRequestError(errorResponse)).toBe(true);
    });
  });

  ['post', 'put', 'patch', 'delete'].forEach(method => {
    it(`should be false for "${method}" requests with a 5xx response`, () => {
      const errorResponse = new Error('Error response');
      errorResponse.config = { method };
      errorResponse.response = { status: 500 };
      expect(isSafeRequestError(errorResponse)).toBe(false);
    });

    it(`should be false for "${method}" requests without a response`, () => {
      const errorResponse = new Error('Error response');
      errorResponse.config = { method };
      expect(isSafeRequestError(errorResponse)).toBe(false);
    });
  });

  it('should be false for errors without a `config`', () => {
    const errorResponse = new Error('Error response');
    errorResponse.response = { status: 500 };
    expect(isSafeRequestError(errorResponse)).toBe(false);
  });

  it('should be false for non-5xx responses', () => {
    const errorResponse = new Error('Error response');
    errorResponse.config = { method: 'get' };
    errorResponse.response = { status: 404 };
    expect(isSafeRequestError(errorResponse)).toBe(false);
  });

  it('should be false for aborted requests', () => {
    const errorResponse = new Error('Error response');
    errorResponse.code = 'ECONNABORTED';
    errorResponse.config = { method: 'get' };
    expect(isSafeRequestError(errorResponse)).toBe(false);
  });
});

describe('isIdempotentRequestError(error)', () => {
  ['get', 'head', 'options', 'put', 'delete'].forEach(method => {
    it(`should be true for "${method}" requests with a 5xx response`, () => {
      const errorResponse = new Error('Error response');
      errorResponse.config = { method };
      errorResponse.response = { status: 500 };
      expect(isIdempotentRequestError(errorResponse)).toBe(true);
    });

    it(`should be true for "${method}" requests without a response`, () => {
      const errorResponse = new Error('Error response');
      errorResponse.config = { method };
      expect(isIdempotentRequestError(errorResponse)).toBe(true);
    });
  });

  ['post', 'patch'].forEach(method => {
    it(`should be false for "${method}" requests with a 5xx response`, () => {
      const errorResponse = new Error('Error response');
      errorResponse.config = { method };
      errorResponse.response = { status: 500 };
      expect(isIdempotentRequestError(errorResponse)).toBe(false);
    });

    it(`should be false for "${method}" requests without a response`, () => {
      const errorResponse = new Error('Error response');
      errorResponse.config = { method };
      errorResponse.response = { status: 500 };
      expect(isIdempotentRequestError(errorResponse)).toBe(false);
    });
  });

  // eslint-disable-next-line jasmine/no-spec-dupes
  it('should be false for errors without a `config`', () => {
    const errorResponse = new Error('Error response');
    errorResponse.response = { status: 500 };
    expect(isIdempotentRequestError(errorResponse)).toBe(false);
  });

  // eslint-disable-next-line jasmine/no-spec-dupes
  it('should be false for non-5xx responses', () => {
    const errorResponse = new Error('Error response');
    errorResponse.config = { method: 'get' };
    errorResponse.response = { status: 404 };
    expect(isIdempotentRequestError(errorResponse)).toBe(false);
  });

  // eslint-disable-next-line jasmine/no-spec-dupes
  it('should be false for aborted requests', () => {
    const errorResponse = new Error('Error response');
    errorResponse.code = 'ECONNABORTED';
    errorResponse.config = { method: 'get' };
    expect(isIdempotentRequestError(errorResponse)).toBe(false);
  });
});

describe('exponentialDelay', () => {
  it('should return exponential retry delay', () => {
    function assertTime(retryNumber) {
      const min = Math.pow(2, retryNumber) * 100;
      const max = Math.pow(2, retryNumber * 100) * 0.2;

      const time = exponentialDelay(retryNumber);

      expect(time >= min && time <= max).toBe(true);
    }

    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].forEach(assertTime);
  });
});

describe('isRetryableError(error)', () => {
  it('should be false for aborted requests', () => {
    const errorResponse = new Error('Error response');
    errorResponse.code = 'ECONNABORTED';
    expect(isRetryableError(errorResponse)).toBe(false);
  });

  it('should be true for timeouts', () => {
    const errorResponse = new Error('Error response');
    errorResponse.code = 'ECONNRESET';
    expect(isRetryableError(errorResponse)).toBe(true);
  });

  it('should be true for a 5xx response', () => {
    const errorResponse = new Error('Error response');
    errorResponse.code = 'ECONNRESET';
    errorResponse.response = { status: 500 };
    expect(isRetryableError(errorResponse)).toBe(true);
  });

  it('should be false for a response !== 5xx', () => {
    const errorResponse = new Error('Error response');
    errorResponse.code = 'ECONNRESET';
    errorResponse.response = { status: 400 };
    expect(isRetryableError(errorResponse)).toBe(false);
  });
});
