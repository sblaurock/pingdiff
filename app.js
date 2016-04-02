import jsdom from 'jsdom';
import { argv } from 'yargs';
import _ from 'lodash';
import logger from './utils/logger';
import Promise from 'bluebird';

const IFTTTTimers = {};
const IFTTTParams = {};
let endpoints = {};
const endpointsPath = argv.endpoints;
const interval = argv.interval;
const iftttPath = argv.ifttt;
const options = {
  selector: 'body :not(script)',
  jQuerySrc: 'http://code.jquery.com/jquery.js',
  defaultTimeout: 10,
};

// Promisify imports
import {
  stat as _stat,
  readFile as _readFile,
} from 'fs';
const stat = Promise.promisify(_stat);
const readFile = Promise.promisify(_readFile);

import { post as _post } from 'request';
const post = Promise.promisify(_post);

// Ensure we have valid interval arg
if (!_.isInteger(interval) || interval < 0) {
  logger.error('--interval is required');
  process.exit(1);
}

// Ensure endpoints list is a file
stat(endpointsPath)
.then((endpointsFile) => {
  if (!endpointsFile.isFile()) {
    logger.error('--endpoints must be a file');
    process.exit(1);
  }
})
.catch((err) => {
  logger.error('--endpoints must be a valid file and is required', err);
  process.exit(1);
});

// Read endpoints file and create list of endpoints
const getEndpoints = (path) => readFile(path, 'utf-8')
.then((endpointsList) => {
  if (!endpointsList.length) {
    logger.error('--endpoints file does not contain any endpoints');
    process.exit(4);
  }

  endpoints = endpointsList.split('\n').filter((endpoint) => endpoint && typeof endpoint === 'string'); //eslint-disable-line
  return endpoints;
})
.catch((err) => {
  logger.error('--endpoints file could not be read', err);
  process.exit(3);
});

// Create IFTTT Parameters
readFile(iftttPath)
  .then((file) => JSON.parse(file))
  .then((params) => {
    // Validate IFTTT Parameters
    if (
      !_.isString(params.key) ||
      !_.isString(params.eventName) ||
      !_.isString(params.bodyKey)
    ) {
      logger.error('--ifttt file is missing required data');
      process.exit(6);
    } else {
      IFTTTParams.key = params.key;
      IFTTTParams.eventName = params.eventName;
      IFTTTParams.bodyKey = params.bodyKey;
      IFTTTParams.optionalTimeout = params.timeout;
    }
  })
  .catch((err) => logger.error('--ifttt should refer to a JSON file configuration', err));

// Make requests to endpoints
const makeRequests = (urls) => {
  const responses = {};

  Promise.map(urls, (url) => jsdom.env({
    url,
    scripts: [options.jQuerySrc],
    done: (err, window) => {
      if (!window || !window.$ || err) {
        logger.error(`Resource data located at ${url} failed to load`);
      } else {
        const $ = window.$;
        $(options.selector).each(() => {
          responses[url] = $(this).text().replace(/\W+/g, '');
        });
      }
    },
  })).then(() => Promise.resolve(responses));
};

// Send event to IFTTT
const postIFTTT = (data) => {
  const now = Math.round(new Date().getTime() / 1000);
  const timeout = (IFTTTParams.optionalTimeout && _.isInteger(IFTTTParams.optionalTimeout)) ?
    IFTTTParams.optionalTimeout :
    options.defaultTimeout;

  // Ensure enough time has passed since last time an event was dispatched
  if (!IFTTTTimers[data] || now - IFTTTTimers[data] > timeout) {
    IFTTTTimers[data] = now;
    const request = {
      url: `https://maker.ifttt.com/trigger/${IFTTTParams.eventName}/with/key/${IFTTTParams.key}`,
      form: { bodyKey: data },
    };

    post(request)
    .then((response) => logger.info('- IFTTT event dispatched', response))
    .catch((err) => logger.error('- IFTT event dispatch failed', err));
  } else {
    logger.info('- IFTTT event ignored due to timeout');
  }
};

// Cache passed responses and then setup diffing intervals
const diffCacheInterval = (responses) => {
  const cache = responses;
  logger.info(`${_.keys(responses).length} of ${endpoints.length} responses cached.`);

  const poll = () => makeRequests(endpoints).then((pollResponses) => {
    const diff = _.difference(_.values(pollResponses), _.values(cache));

    if (diff.length) {
      diff.forEach((change) => {
        const endpoint = _.invert(pollResponses)[change];
        cache[endpoint] = change;
        logger.info(`Difference identified within ${endpoint}`);

        postIFTTT(endpoint);
      });
    } else {
      logger.info(`No differences identified for ${_.keys(pollResponses).length} responses`);
    }
  });

  return setInterval(poll, interval * 1000);
};

// Start App
getEndpoints(endpointsPath)
.then((validEndpoints) => makeRequests(validEndpoints))
.then((responses) => diffCacheInterval(responses))
.catch((err) => {
  logger.error('Error connecting to endpoints', err);
  process.exit(1);
});
