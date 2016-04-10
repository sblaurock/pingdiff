import jsdom from 'jsdom';
import yargs from 'yargs';
import fs from 'fs';
import _ from 'lodash';
import request from 'request';
import jsonfile from 'jsonfile';
import logger from './utils/logger';

let multiplier = 0;
let ifttt = {};
const args = yargs.argv;
const options = {
  selector: 'body',
  jQuerySrc: 'http://code.jquery.com/jquery.min.js',
  defaultTimeout: 10,
  defaultRandom: 20
};

// Ensure we have required arguments
if (!_.isString(args.endpoints) || !_.isInteger(args.interval) || args.interval < 0) {
  logger.error('--endpoints and --interval are required');
  process.exit(1);
}

// Ensure list of endpoints is a file
if (!fs.statSync(args.endpoints).isFile()) {
  logger.error('--endpoints should refer to a JSON file');
  process.exit(2);
}

// Ensure IFTTT configuration is valid
if (args.ifttt) {
  if (!fs.statSync(args.ifttt).isFile()) {
    logger.error('--ifttt should refer to a JSON file');
    process.exit(5);
  }

  const { key, eventName, bodyKey } = ifttt = jsonfile.readFileSync(args.ifttt);

  if (!_.isString(key) || !_.isString(eventName) || !_.isString(bodyKey)) {
    logger.error('--ifttt file is missing required data');
    process.exit(6);
  }
}

// Ensure random argument is valid
if (args.random) {
  if (_.isBoolean(args.random)) {
    multiplier = options.defaultRandom;
  } else if ((_.isInteger(args.random) && (args.random < 0 || args.random > 99) || !_.isInteger(args.random))) {
    logger.error('--random must be an integer from 0 to 99');
    process.exit(7);
  } else {
    multiplier = args.random;
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
      done(err, window) {
        if (!window || !window.$ || err) {
          logger.error(`Resource data located at ${url} failed to load`);
        } else {
          const $ = window.$;

          $(options.selector).each(function each() {
            responses[url] = $(this).text().replace(/\W+/g, '');
          });
        }

        complete++;

        if (complete === urls.length) {
          callback(responses);
        }
      }
    });
  });
};

// Send event to IFTTT
const postIFTTT = (data) => {
  const now = Math.round(new Date().getTime() / 1000);
  const timeout = (_.isInteger(ifttt.timeout) ? ifttt.timeout : options.defaultTimeout);

  ifttt.timers = ifttt.timers || {};

  // Ensure enough time has passed since last time an event was dispatched
  if (!ifttt.timers[data] || now - ifttt.timers[data] > timeout) {
    const postData = {};

    postData[ifttt.bodyKey] = data;
    ifttt.timers[data] = now;

    request.post({
      url: `https://maker.ifttt.com/trigger/${ifttt.eventName}/with/key/${ifttt.key}`,
      form: postData
    }, (err) => {
      if (err) {
        logger.info('- IFTTT event dispatch failed');
      } else {
        logger.info('- IFTTT event dispatched');
      }
    });
  } else {
    logger.info('- IFTTT event ignored due to timeout');
  }
};

// Read endpoints file and create list of endpoints
fs.readFile(args.endpoints, 'utf-8', (err, data) => {
  if (err) {
    logger.error('--endpoints file could not be read');
    process.exit(3);
  }

  let endpointsList = data.split('\n');

  endpointsList = _.filter(endpointsList, (item) => _.isString(item) && !_.isEmpty(item));

  if (!endpointsList.length) {
    logger.error('--endpoints file does not contain any endpoints');
    process.exit(4);
  }

  // Cache initial endpoint responses
  makeRequests(endpointsList, (initialResponses) => {
    const cache = initialResponses;

    logger.info(`${_.keys(cache).length} of ${endpointsList.length} responses cached`);

    (function loop() {
      // Apply randomness to timing
      const rand = (Math.random() * multiplier) / 100;
      const plusOrMinus = (Math.random() < 0.5 ? -1 : 1);
      const timer = Math.floor((args.interval + plusOrMinus * (rand * args.interval)) * 1000);

      setTimeout(() => {
        makeRequests(endpointsList, (responses) => {
          const differences = _.difference(_.values(responses), _.values(cache));

          if (differences.length) {
            differences.forEach((difference) => {
              const endpoint = _.invert(responses)[difference];

              cache[endpoint] = difference;

              logger.info(`Difference identified within ${endpoint}`);

              if (args.ifttt) {
                postIFTTT(endpoint);
              }
            });
          } else {
            logger.info(`No differences identified for ${_.keys(responses).length} responses`);
          }

          loop();
        });
      }, timer);
    }());
  });
});
