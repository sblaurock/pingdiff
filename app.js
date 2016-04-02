import jsdom from 'jsdom';
const argv = require('yargs').argv;
import { keys, invert, difference, values } from 'lodash';
import logger from './utils/logger';
import Promise from 'bluebird';

const IFTTTTimers = {};
const IFTTTParams = {};
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
if (!interval || !parseInt(interval, 10) > 0) {
  logger.error('--interval is required');
  process.exit(1);
}

// Ensure endpoints list is a file
stat(endpointsPath)
.catch((err) => {
  logger.error('--endpoints must be a valid file and is required', err);
  process.exit(1);
});

// Read endpoints file and create list of endpoints
const endpoints = readFile(endpointsPath, 'utf-8')
.then((endpointsList) => {
  if (!endpointsList.length) {
    logger.error('--endpoints file does not contain any endpoints');
    process.exit(4);
  }

  return endpointsList.split('\n').filter((endpoint) => endpoint && typeof endpoint === 'string');
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
      typeof params.key !== 'string' ||
      typeof params.eventName !== 'string' ||
      typeof params.bodyKey !== 'string'
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
  }));

  return Promise.resolve(responses);
};

// Send event to IFTTT
const postIFTTT = (data) => {
  const now = Math.round(new Date().getTime() / 1000);
  const timeout = (IFTTTParams.optionalTimeout && typeof IFTTTParams.optionalTimeout === 'number') ?
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
  logger.info(`${keys(responses).length} of ${endpoints.length} responses cached.`);

  const poll = () => makeRequests(endpoints).then((pollResponses) => {
    const diff = difference(values(pollResponses), values(cache));

    if (diff.length) {
      diff.forEach((change) => {
        const endpoint = invert(pollResponses)[change];
        cache[endpoint] = change;
        logger.info(`Difference identified within ${endpoint}`);

        postIFTTT(endpoint);
      });
    } else {
      logger.info(`No differences identified for ${keys(pollResponses).length} responses`);
    }
  });

  return setInterval(poll, interval * 1000);
};

// Start App
makeRequests(endpoints)
.then((responses) => diffCacheInterval(responses))
.catch((err) => {
  logger.error('Error connecting to endpoints', err);
  process.exit(1);
});
