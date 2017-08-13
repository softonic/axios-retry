# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased]
### Changed
- Moved some hard-coded conditions to the default `retryCondition` function so users can define a
custom function that overwrites them. The conditions that verify that the error is not a timeout or an unsafe network error have been moved to `isNetworkError`.

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
