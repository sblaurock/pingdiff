# pingdiff
Detect differences across a supplied list of websites.

### Setup
    npm install

### Usage
    node index.js --interval="60" --endpoints="/path/to/endpoints" --ifttt="/path/to/ifttt.json"

### Flags
| Flag | Required | Description |
| --- | --- | --- |
| interval | ✓ | Interval (in seconds) of how often to ping endpoints. |
| endpoints | ✓ | Path to line separated list of URL endpoints to ping. |
| ifttt | ✗ | Path to IFTTT JSON configuration _(see below)_. |

### IFTTT Parameters
| Flag | Required | Description |
| --- | --- | --- |
| key | ✓ | Maker channel secret key. |
| eventName | ✓ | Maker event name. |
| bodyKey | ✓ | Form data JSON body key _(value1, value2, value3)_. |
| timeout | ✗ | Minimum amount of time to wait (in seconds) between posted events. |
