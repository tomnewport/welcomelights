console.log('Started welcomelights service')

const findDevices = require('local-devices');
const fetch = require('node-fetch');
const pingCb = require('ping');

const onHoursList = process.env['ON_HOURS'];
const webhookKey = process.env["IFTTT_WEBHOOK"];

const macAddresses = {};

const waitFor = 1000 * 30;

Object.keys(process.env).filter(envVar=>envVar.startsWith('MAC_ADDRESS_'))
    .forEach(key=>{
        const val = process.env[key];
        macAddresses[val.toLowerCase()] = key.split('MAC_ADDRESS_')[1];
    });

const onHours = onHoursList.split(',').map(d=>parseInt(d));

function ping(host) {
    return new Promise((resolve, reject) => {
        pingCb.sys.probe(host,
          (isAlive, err)=>{
            if (err === null) {
                resolve(isAlive);
            } else {
                reject(err);
            }
        },
        {
            timeout: 20,
        })
    });
}

async function listUpHosts() {
  const devices = await findDevices();
  const matchedDevices = devices
      .map(device=>{device.mac = device.mac.split(' ')[0]; return device;})
      .filter(device=>device.mac.toLowerCase() in macAddresses);

  const matchedUpDevices = await Promise.all(
        matchedDevices.map(async function(device) {
          const isUp = await ping(device.ip);
          device.isUp = isUp;
          return device;
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

async function decideLights(currentValue, paramExecutionIdx, paramNOffs) {
    const executionIdx = paramExecutionIdx || 0;
    const nOffs = paramNOffs || 0;
    const hourIsValid = isHourValid();
    const matchedDevices = await listUpHosts();
    let overrideHours = false;
    const matchedDeviceNames = matchedDevices
        .map(device=>macAddresses[device.mac.toLowerCase()])
        .map(deviceName=>{
            if (deviceName.startsWith('AllHours_')) {
                overrideHours = true;
                return `❗${deviceName.split('AllHours_')[1]}`;
            } else {
                return deviceName;
            }
        });

    let shouldBeOn = (matchedDevices.length > 0 && hourIsValid) || overrideHours;

    if (shouldBeOn) {
        nOffs = 0;
    } else {
        nOffs += 1;
    }

    console.log(JSON.stringify({
        timestamp: (new Date()).toISOString(),
        executionIdx,
        shouldBeOn,
        nOffs,
        currentValue,
        overrideHours,
        hourIsValid,
        matchedDeviceNames,
    }));

    if (nOffs < 12) {
        shouldBeOn = true;
    }

    if (shouldBeOn !== currentValue) {
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
    setTimeout(()=>decideLights(shouldBeOn, executionIdx+1, nOffs), waitFor);
}

decideLights();
