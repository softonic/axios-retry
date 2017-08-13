import http from 'http';
import nock from 'nock';
import axios from 'axios';
import axiosRetry from '../es/index';

const NETWORK_ERROR = new Error('Some connection error');
NETWORK_ERROR.code = 'ECONNRESET';

function setupResponses(client, responses) {
  const configureResponse = () => {
    const response = responses.shift();
    if (response) {
      response();
    }
  };
  client.interceptors.response.use(result => {
    configureResponse();
    return result;
  }, error => {
    configureResponse();
    return Promise.reject(error);
  });
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
        () => nock('http://example.com').get('/test').reply(200, 'It worked!')
      ]);

      axiosRetry(client, { retries: 0 });

      client.get('http://example.com/test').then(result => {
        expect(result.status).toBe(200);
        done();
      }, done.fail);
    });
  });

  describe('when the response is an error', () => {
    it('should check if it satisfies the `retryCondition`', (done) => {
      const client = axios.create();
      setupResponses(client, [
        () => nock('http://example.com').get('/test').replyWithError(NETWORK_ERROR),
        () => nock('http://example.com').get('/test').reply(200, 'It worked!')
      ]);

      const retryCondition = (error) => {
        expect(error).toBe(NETWORK_ERROR);
        done();
        return false;
      };

      axiosRetry(client, { retries: 1, retryCondition });

      client.get('http://example.com/test').catch(() => {});
    });

    describe('when it satisfies the retry condition', () => {
      it('should resolve with a successful retry', (done) => {
        const client = axios.create();
        setupResponses(client, [
          () => nock('http://example.com').get('/test').replyWithError(NETWORK_ERROR),
          () => nock('http://example.com').get('/test').reply(200, 'It worked!')
        ]);

        axiosRetry(client, { retries: 1, retryCondition: () => true });

        client.get('http://example.com/test').then(result => {
          expect(result.status).toBe(200);
          done();
        }, done.fail);
      });

      it('should reject with a request error if retries <= 0', done => {
        const client = axios.create();

        setupResponses(client, [
          () => nock('http://example.com').get('/test').replyWithError(NETWORK_ERROR)
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
          () => nock('http://example.com').get('/test').replyWithError(new Error('foo error')),
          () => nock('http://example.com').get('/test').replyWithError(NETWORK_ERROR)
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
          () => nock('http://example.com').get('/test').delay(50).replyWithError(NETWORK_ERROR),
          () => nock('http://example.com').get('/test').delay(50).replyWithError(NETWORK_ERROR),
          () => nock('http://example.com').get('/test').delay(50).replyWithError(NETWORK_ERROR),
          () => nock('http://example.com').get('/test').reply(200)
        ]);

        axiosRetry(client, { retries: 3 });

        client.get('http://example.com/test', { timeout: 100 }).then(done.fail, error => {
          expect(error.code).toBe('ECONNABORTED');
          done();
        });
      });

      it('should reject with errors without a `config` property without retrying', done => {
        const client = axios.create();

        setupResponses(client, [
          () => nock('http://example.com').get('/test').replyWithError(NETWORK_ERROR),
          () => nock('http://example.com').get('/test').reply(200)
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
          () => nock('http://example.com').get('/test').replyWithError(NETWORK_ERROR),
          () => nock('http://example.com').get('/test').reply(200, 'It worked!')
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
          () => nock('http://example.com').get('/test').replyWithError(NETWORK_ERROR),
          () => nock('http://example.com').get('/test').reply(200, 'It worked!')
        ]);

        axiosRetry(client, { retries: 1, retryCondition: () => true });

        client.get('http://example.com/test').then(result => {
          expect(result.status).toBe(200);
          done();
        }, done.fail);
      });
    });

    describe('when it does NOT satisfy the retry condition', () => {
      it('should reject with the error', (done) => {
        const client = axios.create();
        setupResponses(client, [
          () => nock('http://example.com').get('/test').replyWithError(NETWORK_ERROR),
          () => nock('http://example.com').get('/test').reply(200, 'It worked!')
        ]);

        axiosRetry(client, { retries: 1, retryCondition: () => false });

        client.get('http://example.com/test').then(done.fail, (error) => {
          expect(error).toBe(NETWORK_ERROR);
          done();
        });
      });
    });
  });

  it('should use request-specific configuration', done => {
    const client = axios.create();

    setupResponses(client, [
      () => nock('http://example.com').get('/test').replyWithError(NETWORK_ERROR),
      () => nock('http://example.com').get('/test').replyWithError(NETWORK_ERROR),
      () => nock('http://example.com').get('/test').reply(200)
    ]);

    axiosRetry(client, { retries: 0 });

    client.get('http://example.com/test', {
      'axios-retry': {
        retries: 2
      }
    }).then(result => {
      expect(result.status).toBe(200);
      done();
    }, done.fail);
  });
});
