import jsdom from 'jsdom';
import { argv } from 'yargs';
import fs from 'fs';
import _ from 'lodash';
import request from 'request';
import jsonfile from 'jsonfile';
import logger from './utils/logger';

let IFTTTParams = {};
const IFTTTTimers = {};
const { endpoints, interval, ifttt } = argv;
const options = {
  selector: 'body :not(script)',
  jQuerySrc: 'http://code.jquery.com/jquery.js',
  defaultTimeout: 10,
};

// Ensure we have required arguments
if (!_.isString(endpoints) || !_.isInteger(interval) || interval === 0) {
  logger('--endpoints and --interval are required');
  process.exit(1);
}

// Ensure list of endpoints is a file
if (!fs.statSync(endpoints).isFile()) {
  logger('--endpoints should refer to a file (list of endpoints)');
  process.exit(2);
}

// Ensure IFTTT configuration is valid
if (ifttt) {
  if (!fs.statSync(ifttt).isFile()) {
    logger('--ifttt should refer to a JSON file configuration');
    process.exit(5);
  }

  const { key, eventName, bodyKey } = IFTTTParams = jsonfile.readFileSync(ifttt);

  if (!key || !eventName || !bodyKey || !_.isString(key) || !_.isString(eventName) || !_.isString(bodyKey)) { // eslint-disable-line max-len
    logger('--ifttt file is missing required data');
    process.exit(6);
  }
}

// Make requests to endpoints
const makeRequests = (urls, callback) => {
  const responses = {};
  let complete = 0;

  urls.forEach((url) => {
    jsdom.env({
      url,
      scripts: [options.jQuerySrc],
      done: (err, window) => {
        if (!window || !window.$ || err) {
          logger(`Resource data located at ${url} failed to load`);
        } else {
          const $ = window.$;

          $(options.selector).each(() => {
            const responseText = $(this).text().replace(/\W+/g, '');

            responses[url] = responseText;
          });
        }

        complete++;

        if (complete === urls.length) {
          callback(responses);
        }
      },
    });
  });
};

// Send event to IFTTT
const postIFTTT = (data) => {
  const now = Math.round(new Date().getTime() / 1000);
  const timeout = (_.isInteger(IFTTTParams.timeout) ? IFTTTParams.timeout : options.defaultTimeout);

  // Ensure enough time has passed since last time an event was dispatched
  if (!IFTTTTimers[data] || now - IFTTTTimers[data] > timeout) {
    const postData = {};

    postData[IFTTTParams.bodyKey] = data;
    IFTTTTimers[data] = now;

    request.post({
      url: `https://maker.ifttt.com/trigger/${IFTTTParams.eventName}/with/key/${IFTTTParams.key}`,
      form: postData,
    }, (err, response) => {
      if (err) {
        logger('- IFTTT event dispatch failed');
      } else {
        logger('- IFTTT event dispatched', response);
      }
    });
  } else {
    logger('- IFTTT event ignored due to timeout');
  }
};

// Read endpoints file and create list of endpoints
fs.readFile(endpoints, 'utf-8', (err, data) => {
  if (err) {
    logger('--endpoints file could not be read');
    process.exit(3);
  }

  const endpointsList = _.remove(data.split('\n'), (item) => _.isString(item) && !_.isEmpty(item));

  if (!endpointsList.length) {
    logger('--endpoints file does not contain any endpoints');
    process.exit(4);
  }

  // Cache initial endpoint responses
  makeRequests(endpointsList, (responses) => {
    const cache = responses;

    logger(`${_.keys(responses).length} of ${endpointsList.length} responses cached`);

    setInterval(() => {
      makeRequests(endpointsList, (requestResponses) => {
        const differences = _.difference(_.values(requestResponses), _.values(cache));

        if (differences.length) {
          differences.forEach((difference) => {
            const endpoint = _.invert(requestResponses)[difference];

            cache[endpoint] = difference;

            logger(`Difference identified within ${endpoint}`);

            if (ifttt) {
              postIFTTT(endpoint);
            }
          });
        } else {
          logger(`No differences identified for ${_.keys(requestResponses).length} responses`);
        }
      });
    }, interval * 1000);
  });
});
