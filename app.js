const request = require('request');
const argv = require('yargs').argv;
const fs = require('fs');
const _ = require('lodash');

const { endpoints, interval } = argv;

// Ensure we have required arguments
if(!_.isString(endpoints) || !_.isInteger(interval)) {
  console.error('--endpoints and --interval are required');
  process.exit(1);
}

// Ensure list of endpoints is a file
if(!fs.statSync(endpoints).isFile()) {
  console.error('--endpoints should refer to a file (list of endpoints)');
  process.exit(2);
}

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

  console.log(endpointsList);
});
