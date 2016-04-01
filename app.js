const jsdom = require('jsdom');
const argv = require('yargs').argv;
const fs = require('fs');
const _ = require('lodash');
const request = require('request');
const jsonfile = require('jsonfile');
const logger = require("./utils/logger");

let IFTTTParams = {};
let IFTTTTimers = {};
const { endpoints, interval, ifttt } = argv;
const options = {
  selector: 'body',
  jQuerySrc: 'http://code.jquery.com/jquery.js'
};

// Ensure we have required arguments
if(!_.isString(endpoints) || !_.isInteger(interval) || interval === 0) {
  console.error('--endpoints and --interval are required');
  process.exit(1);
}

// Ensure list of endpoints is a file
if(!fs.statSync(endpoints).isFile()) {
  console.error('--endpoints should refer to a file (list of endpoints)');
  process.exit(2);
}

// Ensure IFTTT configuration is valid
if(ifttt) {
  if(!fs.statSync(ifttt).isFile()) {
    console.error('--ifttt should refer to a JSON file configuration');
    process.exit(5);
  }

  const { key, eventName, bodyKey, timeout } = IFTTTParams = jsonfile.readFileSync(ifttt);

  if(!key || !eventName || !bodyKey) {
    console.error('--ifttt file is missing required data');
    process.exit(6);
  }
}

// Make requests to endpoints
const makeRequests = (urls, callback) => {
  let responses = {};
  let complete = 0;

  urls.forEach((url) => {
    jsdom.env({
      url: url,
      scripts: [options.jQuerySrc],
      done: (err, window) => {
        if(!window || !window.$ || err) {
          console.error(`Resource data located at ${url} failed to load`);
        } else {
          const $ = window.$;

          $(options.selector).each(function() {
            const responseText = $(this).text().replace(/\W+/g, '');

            responses[url] = responseText;
          });
        }

        complete++;

        if(complete === urls.length) {
          callback(responses);
        }
      }
    });
  });
};

// Send event to IFTTT
const postIFTTT = (data) => {
  const now = Math.round(new Date().getTime() / 1000);
  const timeout = IFTTTParams.timeout || 10;

  // Ensure enough time has passed since last time an event was dispatched
  if(!IFTTTTimers[data] || now - IFTTTTimers[data] > timeout) {
    let postData = {};

    postData[IFTTTParams.bodyKey] = data;
    IFTTTTimers[data] = now;

    request.post(`https://maker.ifttt.com/trigger/${IFTTTParams.eventName}/with/key/${IFTTTParams.key}`).form(postData);
    console.log('- IFTTT event dispatched');
  } else {
    console.log('- IFTTT event ignored due to timeout');
  }
};

// Read endpoints file and create list of endpoints
fs.readFile(endpoints, 'utf-8', (err, data) => {
  if(err) {
    console.error('--endpoints file could not be read');
    process.exit(3);
  }

  const endpointsList = _.remove(data.split('\n'), (item) => {
    return _.isString(item) && !_.isEmpty(item);
  });

  if(!endpointsList.length) {
    console.error('--endpoints file does not contain any endpoints');
    process.exit(4);
  }

  // Cache initial endpoint responses
  makeRequests(endpointsList, (responses) => {
    const cache = responses;

    console.log(`${_.keys(responses).length} of ${endpointsList.length} responses cached`);

    setInterval(() => {
      makeRequests(endpointsList, (responses) => {
        const differences = _.difference(_.values(responses), _.values(cache));

        if(differences.length) {
          differences.forEach((difference) => {
            const endpoint = _.invert(responses)[difference];

            cache[endpoint] = difference;

            console.log(`Difference identified within ${endpoint}`);

            if(ifttt) {
              postIFTTT(endpoint);
            }
          });
        } else {
          console.log(`No differences identified for ${_.keys(responses).length} responses`)
        }
      });
    }, interval * 1000);
  });
});
