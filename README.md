# pingdiff
Detect changes across a supplied list of websites.

### Setup
    npm install

### Usage
    node index.js --interval=60 --endpoints="/path/to/endpoints" --ifttt="/path/to/ifttt.json" --random

### Flags
| Flag | Required | Type | Description |
| --- | --- | --- | --- |
| interval | ✓ | Integer | Interval (in seconds) of how often to ping endpoints. |
| endpoints | ✓ | String | Path to line separated list of URL endpoints to ping. |
| ifttt | ✗ | String | Path to IFTTT JSON configuration _(see below)_. |
| random | ✗ | Integer | Percentage of randomness to apply to interval timing _(default of 20%)_. |

### IFTTT Parameters
| Flag | Required | Type | Description |
| --- | --- | --- | --- |
| key | ✓ | String | Maker channel secret key. |
| eventName | ✓ | String | Maker event name. |
| bodyKey | ✓ | String | Form data JSON body key _(value1, value2, value3)_. |
| timeout | ✗ | Integer | Minimum amount of time to wait (in seconds) between posted events. |
