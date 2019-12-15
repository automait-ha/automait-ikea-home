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
    })
    .observeDevices()
    // Every 6 hours
    setInterval(() => {
      this.determineBatteryLevelChange()
    }, 21600000)
    setTimeout(() => {
      this.determineBatteryLevelChange()
    }, 1000)
  } catch (e) {
    this.logger.error('ERROR CONNECTING TO IKEA HOME:', e)
  }
}

IkeaHome.prototype.setBlindPosition = function (deviceName, position, callback) {
  try {
    const device = this.devices[this.config.devices[deviceName]]
    if (!device) return
    device.blindList[0].setPosition(100 - position)
  } catch (e) {
    this.logger.error('ERROR SETTING BLIND POSITION:', e)
  }
  callback()
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
  if (!deviceId) return cb()
  const response = await this.client.request(`15001/${deviceId}`, 'get')
  const newBatteryLevel = response.payload['3']['9']
  cb(null, newBatteryLevel)
}