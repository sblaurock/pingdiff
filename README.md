# pingdiff
Detect changes across a supplied list of websites.

### Setup
    npm install

### Usage
    node index.js --interval=60 --endpoints="/path/to/endpoints.json" --ifttt="/path/to/ifttt.json" --random

### Endpoint file structure
```
{
    URL: CSS selector,
    "http://web.site": "body"
}
```

### Flags
| Flag | Required | Type | Description |
| --- | --- | --- | --- |
| interval | ✓ | Integer | Interval (in seconds) of how often to make requests. |
| endpoints | ✓ | String | Path to JSON file of endpoints to monitor. |
| ifttt | ✗ | String | Path to IFTTT JSON file configuration _(see below)_. |
| random | ✗ | Integer | Percentage of randomness to apply to interval timing _(default of 20%)_. |

### IFTTT parameters
| Flag | Required | Type | Description |
| --- | --- | --- | --- |
| key | ✓ | String | Maker channel secret key. |
| eventName | ✓ | String | Maker event name. |
| bodyKey | ✓ | String | Form data JSON body key _(value1, value2, value3)_. |
| timeout | ✗ | Integer | Minimum amount of time to wait (in seconds) between posted events. |
