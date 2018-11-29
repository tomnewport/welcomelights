const findDevices = require('local-devices');
const fetch = require('node-fetch');
const pingCb = require('ping');

const onHoursList = process.env['ON_HOURS'];
const webhookKey = process.env["IFTTT_WEBHOOK"];

const macAddresses = {};

Object.keys(process.env).filter(envVar=>envVar.startsWith('MAC_ADDRESS_'))
    .forEach(key=>{
        const val = process.env[key];
        macAddresses[val.toLowerCase()] = key.split('MAC_ADDRESS_')[1];
    });

const onHours = onHoursList.split(',').map(d=>parseInt(d));

function ping(host) {
    return new Promise((resolve, reject) => {
        pingCb.sys.probe(host, (isAlive, err)=>{
            if (err === null) {
                resolve(isAlive);
            } else {
                reject(err);
            }
        })
    });
}

async function listUpHosts() {
  const devices = await findDevices();
  const matchedDevices = devices
      .filter(device=>device.mac.toLowerCase() in macAddresses);

  const matchedUpDevices = await Promise.all(
        matchedDevices.map(device=>{
          return ping(device.ip).then(isUp=>{device.isUp = isUp; return device})
        })
  )

  return matchedUpDevices.filter(d=>d.isUp);
}

a = listUpHosts();

function getWebHookURI(action) {
    return `https://maker.ifttt.com/trigger/${action}/with/key/${webhookKey}`
}

function isHourValid() {
    const currentHours = (new Date()).getHours();
    return onHours.indexOf(currentHours) > -1;
}

async function decideLights(currentValue, paramExecutionIdx) {
    const executionIdx = paramExecutionIdx || 0;
    const hourIsValid = isHourValid();
    const matchedDevices = await listUpHosts();
    const matchedDeviceNames = matchedDevices
        .map(device=>macAddresses[device.mac.toLowerCase()]);
    const shouldBeOn = (matchedDevices.length > 0 && hourIsValid);

    console.log(`${executionIdx} ${(new Date()).toISOString()} ${shouldBeOn ? '🌕' : '🌑'} ${hourIsValid ? '✅' : '❎'} (${matchedDeviceNames.join(', ')})`)

    if (shouldBeOn !== currentValue || (paramExecutionIdx % 60 == 0)) {
        let uri;
        if (shouldBeOn) {
            uri = getWebHookURI('tree_on');
        } else {
            uri = getWebHookURI('tree_off');
        }
        const result = await fetch(uri, {'method': 'POST'});
        const text = await result.text();
        console.log(`  - ${result.status} ${text}`);
    }
    setTimeout(()=>decideLights(shouldBeOn, executionIdx+1), 10);
}

decideLights();
