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

  it('should resolve with a succesful response', done => {
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

  it('should resolve with a succesful response after an error', done => {
    const client = axios.create();
    setupResponses(client, [
      () => nock('http://example.com').get('/test').replyWithError(NETWORK_ERROR),
      () => nock('http://example.com').get('/test').reply(200, 'It worked!')
    ]);

    axiosRetry(client, { retries: 1 });

    client.get('http://example.com/test').then(result => {
      expect(result.status).toBe(200);
      done();
    }, done.fail);
  });

  it('should resolve with a succesful response after an error (with agent)', done => {
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

    axiosRetry(client, { retries: 1 });

    client.get('http://example.com/test').then(result => {
      expect(result.status).toBe(200);
      done();
    }, done.fail);
  });

  it('should resolve with a succesful response after an error (with httpAgent)', done => {
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

    axiosRetry(client, { retries: 1 });

    client.get('http://example.com/test').then(result => {
      expect(result.status).toBe(200);
      done();
    }, done.fail);
  });

  it('should reject with a request error if retries <= 0', done => {
    const client = axios.create();

    const generatedError = new Error();
    setupResponses(client, [
      () => nock('http://example.com').get('/test').replyWithError(generatedError)
    ]);

    axiosRetry(client, { retries: 0 });

    client.get('http://example.com/test').then(done.fail, error => {
      expect(error).toBe(generatedError);
      done();
    });
  });

  it('should reject with a request error if there are more errors than retries', done => {
    const client = axios.create();

    const generatedError = new Error();
    setupResponses(client, [
      () => nock('http://example.com').get('/test').replyWithError(new Error('foo error')),
      () => nock('http://example.com').get('/test').replyWithError(generatedError)
    ]);

    axiosRetry(client, { retries: 1 });

    client.get('http://example.com/test').then(done.fail, error => {
      expect(error).toBe(generatedError);
      done();
    });
  });

  it('should reject with error responses (404, 500, etc.) without retrying', done => {
    const client = axios.create();

    setupResponses(client, [
      () => nock('http://example.com').get('/test').reply(404, 'Not found'),
      () => nock('http://example.com').get('/test').reply(200)
    ]);

    axiosRetry(client, { retries: 1 });

    client.get('http://example.com/test').then(done.fail, error => {
      expect(error.response.status).toBe(404);
      done();
    });
  });

  it('should reject with blacklisted errors without retrying', done => {
    const client = axios.create();

    const notFoundError = new Error('Not Found');
    notFoundError.code = 'ENOTFOUND';

    setupResponses(client, [
      () => nock('http://example.com').get('/test').replyWithError(notFoundError),
      () => nock('http://example.com').get('/test').reply(200)
    ]);

    axiosRetry(client, { retries: 1 });

    client.get('http://example.com/test').then(done.fail, error => {
      expect(error).toBe(notFoundError);
      done();
    });
  });

  it('should reject with timed out requests without retrying', done => {
    const client = axios.create();

    const timeoutError = new Error('Timeout');
    timeoutError.code = 'ECONNABORTED';

    setupResponses(client, [
      () => nock('http://example.com').get('/test').replyWithError(timeoutError),
      () => nock('http://example.com').get('/test').reply(200)
    ]);

    axiosRetry(client, { retries: 1 });

    client.get('http://example.com/test').then(done.fail, error => {
      expect(error).toBe(timeoutError);
      done();
    });
  });

  it('should reject with errors without a config property without retrying', done => {
    const client = axios.create();

    setupResponses(client, [
      () => nock('http://example.com').get('/test').replyWithError(new Error()),
      () => nock('http://example.com').get('/test').reply(200)
    ]);

    const generatedError = new Error();
    client.interceptors.response.use(null, () => Promise.reject(generatedError));

    axiosRetry(client, { retries: 1 });

    client.get('http://example.com/test').then(done.fail, error => {
      expect(error).toBe(generatedError);
      done();
    });
  });

  it('allows a custom retryCondition function to determine if it should retry or not', done => {
    const client = axios.create();

    const firstRequest = nock('http://example.com').get('/test').reply(500, 'Server Error');
    const secondRequest = nock('http://example.com').get('/test').reply(500, 'Server Error');

    setupResponses(client, [
      () => firstRequest,
      () => secondRequest
    ]);

    axiosRetry(client, { retries: 1, retryCondition: error => error.response.status === 500 });

    client.get('http://example.com/test').then(done.fail, () => {
      firstRequest.done();
      secondRequest.done();
      done();
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
