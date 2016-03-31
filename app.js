const jsdom = require('jsdom');
const argv = require('yargs').argv;
const fs = require('fs');
const _ = require('lodash');
const logger = require("./utils/logger");

const { endpoints, interval } = argv;
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
            console.log(`Difference identified within ${_.invert(responses)[difference]}`);
          });
        } else {
          console.log(`No differences identified for ${_.keys(responses).length} responses`)
        }
      });
    }, interval * 1000);
  });
});
