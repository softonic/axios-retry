# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [3.0.3] - 2018-04-26
### Fixed
- Export isRetryableError for CommonJS

### Added
- Added additional param shouldResetTimeout

## [3.0.2] - 2018-02-09

### Added
- Now isRetryableError method is accessible.
- Added delayStrategy option to be able to have exponential backoff for successive retries.

## [3.0.1] - 2017-08-16

### Fixed
- Fixed first request time not being taken into account in timeout across retries.
- Fixed negative timeouts being passed to XHR (browsers), causing that no timeout was applied.
- Fixed safe methods and idempotent errors not being retried on unknown network errors.

## [3.0.0] - 2017-08-13

### Changed
- Retried errors on idempotent requests (5xx with get, head, options, put and delete) by default,
along with safe network errors.
- Moved some hard-coded conditions to the default `retryCondition` function so users can define a
custom function that overwrites them. The conditions that verify that the error is not a timeout or
an unsafe network error have been moved to `isNetworkError`.

### Added
- Added additional pre-defined retry conditions: `isSafeRequestError`, `isIdempotentRequestError`.

## [2.0.1] - 2017-06-19

### Fixed
- Removed dependency from the `package.json` file.

## [2.0.0] - 2017-06-15

### Changed
- Now the configured timeout in Axios is not for each retry request but for the whole request lifecycle.

## [1.3.1] - 2017-06-19

### Fixed
- Removed dependency from the `package.json` file.

## [1.3.0] - 2017-06-15

### Added
- Allowed per-request configuration using the `axios-retry` namespace.
