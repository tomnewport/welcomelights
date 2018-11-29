const findDevices = require('local-devices');
const fetch = require('node-fetch');
const pingCb = require('ping');

const onHoursList = process.env['ON_HOURS'];
const webhookKey = process.env["IFTTT_WEBHOOK"];

const macAddresses = {};

const waitFor = 1000 * 15;

Object.keys(process.env).filter(envVar=>envVar.startsWith('MAC_ADDRESS_'))
    .forEach(key=>{
        const val = process.env[key];
        macAddresses[val.toLowerCase()] = key.split('MAC_ADDRESS_')[1];
    });

const onHours = onHoursList.split(',').map(d=>parseInt(d));

function ping(host) {
    return new Promise((resolve, reject) => {
        pingCb.sys.probe(host, {
            timeout: 5,
        }, (isAlive, err)=>{
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
      .map(device=>{device.mac = device.mac.split(' ')[0]; return device;})
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

    const shouldBeOn = (matchedDevices.length > 0 && hourIsValid) || overrideHours;

    console.log(`${executionIdx} ${(new Date()).toISOString()} ${shouldBeOn ? '🌕' : '🌑'} ${overrideHours ? '❗ ' : ''}${hourIsValid ? '✅' : '❎'} (${matchedDeviceNames.join(', ')})`)

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
    setTimeout(()=>decideLights(shouldBeOn, executionIdx+1), waitFor);
}

decideLights();
