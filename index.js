module.exports = init

const Emitter = require('events').EventEmitter
const ikea = require('node-tradfri-client')

function init(callback) {
  callback(null, 'ikeaHome', IkeaHome)
}

function IkeaHome(automait, logger, config) {
  Emitter.call(this)
  this.automait = automait
  this.logger = logger
  this.config = config
  this.client = new ikea.TradfriClient(this.config.gatewayIp)
  this.devices = {}
  this.batteryLevels = {}
  this.connect()
}

IkeaHome.prototype = Object.create(Emitter.prototype)

IkeaHome.prototype.connect = async function () {
  try {
    const { identity, psk } = await this.client.authenticate(this.config.securityKey)
    await this.client.connect(identity, psk)
    this.client.on('device updated', device => {
      this.devices[device.instanceId] = device
      this.logger.info('IkeaHome: device updated:', device)
    })
    this.client.on('error', e => {
      this.logger.error('IkeaHome: ERROR:', e, e.code)
    })
    .observeDevices()
    // Every 6 hours
    setInterval(() => {
      this.logger.info('IkeaHome: Checking battery level...')
      this.determineBatteryLevelChange()
    }, this.config.batteryCheckInterval || 21600000)
    setInterval(async () => {
      const success = await this.client.ping()
      if (!success) {
        this.logger.info('IkeaHome: Pinging gateway failed!')
      }
    }, this.config.pingInterval || 300000)
    setTimeout(() => {
      this.determineBatteryLevelChange()
    }, 1000)
  } catch (e) {
    this.logger.error('ERROR CONNECTING TO IKEA HOME:', e)
  }
}

IkeaHome.prototype.setBlindPosition = function (deviceName, position, cb) {
  try {
    const device = this.devices[this.config.devices[deviceName]]
    if (!device) {
      this.logger.error('IkeaHome: Device does not exist: ' + deviceName, position)
      return cb()
    }
    device.blindList[0].setPosition(100 - position)
  } catch (e) {
    this.logger.error('ERROR SETTING BLIND POSITION:', e)
  }
  cb()
}

IkeaHome.prototype.determineBatteryLevelChange = async function (deviceId) {
  Object.keys(this.config.devices).forEach(async deviceName => {
    const deviceId = this.config.devices[deviceName]
    const response = await this.client.request(`15001/${deviceId}`, 'get')
    const newBatteryLevel = response.payload['3']['9']
    const currentBatteryLevel = this.batteryLevels[deviceId]
    if (!currentBatteryLevel || (currentBatteryLevel !== newBatteryLevel)) {
      this.batteryLevels[deviceId] = newBatteryLevel
      this.emit('batteryChange:' + deviceName, newBatteryLevel)
    }
  })
}

IkeaHome.prototype.getBatteryLevel = async function (deviceName, cb) {
  const deviceId = this.config.devices[deviceName]
  if (!deviceId) {
    this.logger.error('IkeaHome: Device does not exist: ' + deviceName)
    return cb()
  }
  if (!deviceId) return cb()
  const response = await this.client.request(`15001/${deviceId}`, 'get')
  const newBatteryLevel = response.payload['3']['9']
  cb(null, newBatteryLevel)
}