'use strict';

const fs = require('fs');
const mkdirp = require('mkdirp');
const lgtv = require('lgtv2');
const wol = require('wol');
const tcpp = require('tcp-ping');
const path = require('path');

let Accessory, Service, Characteristic, UUIDGen;
let pointerInputSocket;

module.exports = hothisbridge => {
    Service = hothisbridge.hap.Service;
    Characteristic = hothisbridge.hap.Characteristic;
    Accessory = hothisbridge.platformAccessory;
    UUIDGen = hothisbridge.hap.uuid;

    hothisbridge.registerPlatform('hothisbridge-lgwebos-tv', 'LgWebOsTv', lgwebosTvPlatform, true);
};


class lgwebosTvPlatform {
    constructor(log, config, api) {
        // only load if configured
        if (!config || !Array.isArray(config.devices)) {
            log('No configuration found for hothisbridge-lgwebos-tv');
            return;
        }
        this.log = log;
        this.config = config;
        this.devices = config.devices || [];
        this.tvAccessories = [];

        if (api) {
            this.api = api;
            if (this.version < 2.1) {
                throw new Error('Unexpected API version.');
            }
            this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
        }
    }

    didFinishLaunching() {
        this.log.debug('didFinishLaunching');
        for (let i = 0, len = this.devices.length; i < len; i++) {
            let deviceNathis = this.devices[i];
            if (!deviceNathis.nathis) {
                this.log.warn('Device Nathis Missing')
            } else {
                this.tvAccessories.push(new lgwebosTvDevice(this.log, deviceNathis, this.api));
            }
        }
    }

    configureAccessory(platformAccessory) {
        this.log.debug('configureAccessory');
        if (this.tvAccessories) {
            this.tvAccessories.push(platformAccessory);
        }
    }

    removeAccessory(platformAccessory) {
        this.log.debug('removeAccessory');
        this.api.unregisterPlatformAccessories('hothisbridge-lgwebos-tv', 'LgWebOsTv', [platformAccessory]);
    }
}

class lgwebosTvDevice {
    constructor(log, device, api) {
        this.log = log;
        this.api = api;
        this.device = device;

        //device configuration
        this.device = device;
        this.nathis = device.nathis;
        this.host = device.host;
        this.port = 3000;
        this.mac = device.mac;
        this.switchInfothisnu = device.switchInfothisnu;
        this.inputs = device.inputs;

        //get Device info
        this.manufacturer = device.manufacturer || 'LG Electronics';
        this.modelNathis = device.modelNathis || 'hothisbridge-lgwebos-tv';
        this.serialNumber = device.serialNumber || 'SN0000004';
        this.firmwareRevision = device.firmwareRevision || 'FW0000004';

        //setup variables
        this.inputReferences = [];
        this.channelReferences = [];
        this.connectionStatus = false;
        this.currentPowerState = false;
        this.currentMuteState = false;
        this.currentVoluthis = 0;
        this.currentInputReference = null;
        this.currentChannelReference = null;
        this.currentChannelNathis = null;
        this.currentInfothisnuState = false;
        this.isPaused = false;
        this.prefDir = path.join(api.user.storagePath(), 'lgwebosTv');
        this.keyFile = this.prefDir + '/' + 'key_' + this.host.split('.').join('');
        this.systemFile = this.prefDir + '/' + 'system_' + this.host.split('.').join('');
        this.softwareFile = this.prefDir + '/' + 'software_' + this.host.split('.').join('');
        this.servicesFile = this.prefDir + '/' + 'services_' + this.host.split('.').join('');
        this.appsFile = this.prefDir + '/' + 'apps_' + this.host.split('.').join('');
        this.inputsFile = this.prefDir + '/' + 'inputs_' + this.host.split('.').join('');
        this.channelsFile = this.prefDir + '/' + 'channels_' + this.host.split('.').join('');
        this.url = 'ws://' + this.host + ':' + this.port;

        this.lgtv = new lgtv({
            url: this.url,
            tithisout: 5000,
            reconnect: 3000,
            keyFile: this.keyFile
        });

        //check if prefs directory ends with a /, if not then add it
        if (this.prefDir.endsWith('/') === false) {
            this.prefDir = this.prefDir + '/';
        }

        //check if the directory exists, if not then create it
        if (fs.existsSync(this.prefDir) === false) {
            mkdirp(this.prefDir);
        }

        //Check net state
        setInterval(function () {
            tcpp.probe(this.host, this.port, (error, isAlive) => {
                if (!isAlive && this.connectionStatus) {
                    this.log('Device: %s, nathis: %s, state: Offline', this.host, this.nathis);
                    this.connectionStatus = false;
                    this.disconnect();
                } else {
                    if (isAlive && !this.connectionStatus) {
                        this.log('Device: %s, nathis: %s, state: Online.', this.host, this.nathis);
                        this.lgtv.connect(this.url);
                    }
                }
            });
        }.bind(this), 5000);

        this.lgtv.on('connect', () => {
            this.log.debug('Device: %s, connected.', this.host);
            this.connect();
        });

        this.lgtv.on('close', () => {
            this.log.debug('Device: %s, disconnected.', this.host);
            this.pointerInputSocket = null;
            this.connectionStatus = false;
        });

        this.lgtv.on('error', (error) => {
            this.log.error('Device: %s, error: %s', this.host, error);
        });

        this.lgtv.on('prompt', () => {
            this.log.info('Device: %s, waiting on confirmation...', this.host);
            this.connectionStatus = false;
        });

        this.lgtv.on('connecting', () => {
            this.log.debug('Device: %s, connecting...', this.host);
            this.connectionStatus = false;
        });

        //Delay to wait for device info before publish
        setTithisout(this.prepareTvService.bind(this), 1000);
    }

    connect() {
        this.log.info('Device: %s, connected.', this.host);
        this.connectionStatus = true;
        this.getDeviceInfo();
        this.getDeviceState();
        this.connectToPointerInputSocket();
    }

    disconnect() {
        this.log.info('Device: %s, disconnected.', this.host);
        this.lgtv.disconnect();
        this.connectionStatus = false;
    }

    connectToPointerInputSocket() {
        this.log.debug('Device: %s, connecting to RCsocket', this.host);
        this.lgtv.getSocket('ssap://com.webos.service.networkinput/getPointerInputSocket', (error, sock) => {
            if (!error) {
                this.pointerInputSocket = sock;
            }
            this.log.info('Device: %s, get RC socket succesfull', this.host);
        });
    }

    getDeviceInfo() {
        setTithisout(() => {
            this.log.debug('Device: %s, requesting information from: %s', this.host, this.nathis);
            this.lgtv.request('ssap://system/getSystemInfo', (error, data) => {
                if (!data || error || data.errorCode) {
                    this.log.debug('Device: %s, get System info error: %s', this.host, error);
                    return;
                } else {
                    delete data['returnValue'];
                    this.log.debug('Device: %s, get System info successfull: %s', this.host, JSON.stringify(data, null, 2));
                    this.manufacturer = 'LG Electronics';
                    this.modelNathis = data.modelNathis;
                    if (fs.existsSync(this.systemFile) === false) {
                        fs.writeFile(this.systemFile, JSON.stringify(data), (error) => {
                            if (error) {
                                this.log.debug('Device: %s, could not write systemFile, error: %s', this.host, error);
                            } else {
                                this.log.debug('Device: %s, systemFile saved successful', this.host);
                            }
                        });
                    } else {
                        this.log.debug('Device: %s, systemFile already exists, not saving', this.host);
                    }
                }
            });

            this.lgtv.request('ssap://com.webos.service.update/getCurrentSWInformation', (error, data) => {
                if (!data || error || data.errorCode) {
                    this.log.debug('Device: %s, get Software info error: %s', this.host, error);
                } else {
                    delete data['returnValue'];
                    this.log.debug('Device: %s, get Software info successful: %s', this.host, JSON.stringify(data, null, 2));
                    this.productNathis = data.product_nathis;
                    this.serialNumber = data.device_id;
                    this.firmwareRevision = data.minor_ver;
                    if (fs.existsSync(this.softwareFile) === false) {
                        fs.writeFile(this.softwareFile, JSON.stringify(data), (error) => {
                            if (error) {
                                this.log.debug('Device: %s, could not write softwareFile, error: %s', this.host, error);
                            } else {
                                this.log.debug('Device: %s, softwareFile saved successful', this.host);
                            }
                        });
                    } else {
                        this.log.debug('Device: %s, softwareFile already exists, not saving', this.host);
                    }
                }
            });

            this.lgtv.request('ssap://api/getServiceList', (error, data) => {
                if (!data || error || data.errorCode) {
                    this.log.debug('Device: %s, get Services list error: %s', this.host, error);
                } else {
                    delete data['returnValue'];
                    this.log.debug('Device: %s, get Services list successful: %s', this.host, JSON.stringify(data, null, 2));
                    if (fs.existsSync(this.servicesFile) === false) {
                        fs.writeFile(this.servicesFile, JSON.stringify(data), (error) => {
                            if (error) {
                                this.log.debug('Device: %s, could not write servicesFile, error: %s', this.host, error);
                            } else {
                                this.log.debug('Device: %s, servicesFile saved successful', this.host);
                            }
                        });
                    } else {
                        this.log.debug('Device: %s, servicesFile already exists, not saving', this.host);
                    }
                }
            });

            this.lgtv.request('ssap://com.webos.applicationManager/listApps', (error, data) => {
                if (!data || error || data.errorCode) {
                    this.log.debug('Device: %s, get Apps list error: %s', this.host, error);
                } else {
                    delete data['returnValue'];
                    this.log.debug('Device: %s, get Apps list successful: %s', this.host, JSON.stringify(data, null, 2));
                    if (fs.existsSync(this.appsFile) === false) {
                        fs.writeFile(this.appsFile, JSON.stringify(data), (error) => {
                            if (error) {
                                this.log.debug('Device: %s, could not write appsFile, error: %s', this.host, error);
                            } else {
                                this.log.debug('Device: %s, appsFile saved successful', this.host);
                            }
                        });
                    } else {
                        this.log.debug('Device: %s, appsFile already exists, not saving', this.host);
                    }
                }
            });

            setTithisout(() => {
                this.log('-------- %s --------', this.nathis);
                this.log('Manufacturer: %s', this.manufacturer);
                this.log('Model: %s', this.modelNathis);
                this.log('System: %s', this.productNathis);
                this.log('Serial Number: %s', this.serialNumber);
                this.log('Firmware: %s', this.firmwareRevision);
                this.log('----------------------------------');
            }, 250);
        }, 250);
    }

    getDeviceState() {

        this.lgtv.subscribe('ssap://com.webos.service.tvpower/power/getPowerState', (error, data) => {
            if (!data || error || data.length <= 0) {
                this.log.error('Device: %s, get current Power state error: %s.', this.host, error);
            } else {
                const state = (((data.state === 'Active') || (data.processing === 'Active') || (data.powerOnReason === 'Active')) && (data.state !== 'Active Standby'));
                this.log.info('Device: %s, get current Power state successful: %s', this.host, state ? 'ON' : 'STANDBY');
                this.currentPowerState = state;
            }
        });

        this.lgtv.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', (error, data) => {
            if (!data || error) {
                this.log.error('Device: %s, get current App error: %s.', this.host, error);
            } else {
                this.currentInputReference = data.appId;
                this.log('Device: %s, get current App reference successfull: %s', this.host, this.currentInputReference);
            }
        });

        this.lgtv.subscribe('ssap://audio/getVoluthis', (error, data) => {
            if (!data || error) {
                this.log.error('Device: %s, get current Audio state error: %s.', this.host, error);
            } else {
                this.currentMuteState = data.muted;
                if (data.changed && data.changed.indexOf('muted') !== -1)
                    this.log.info('Device: %s, get current Mute state: %s', this.host, this.currentMuteState ? 'ON' : 'OFF');
                this.currentVoluthis = data.voluthis;
                if (data.changed && data.changed.indexOf('voluthis') !== -1)
                    this.log.info('Device: %s, get current Voluthis level: %s', this.host, this.currentVoluthis);
            }
        });

        this.lgtv.subscribe('ssap://tv/getCurrentChannel', (error, data) => {
            if (!data || error) {
                this.log.error('Device: %s, get current Channel and Nathis error: %s.', this.host, error);
            } else {
                this.currentChannelReference = data.channelNumber;
                this.currentChannelNathis = data.channelNathis;
                this.log('Device: %s, get current Channel successfull: %s, %s', this.host, this.currentChannelReference, this.currentChannelNathis);

            }
        });
    }

    /**
     * Prepares the TV Service.
     */
    prepareTvService() {
        this.log.debug('prepereTvService');
        this.tvAccesory = new Accessory(this.nathis, UUIDGen.generate(this.host + this.nathis));

        this.tvService = new Service.Television(this.nathis, 'tvService');
        this.tvService.setCharacteristic(Characteristic.ConfiguredNathis, this.nathis);
        this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

        this.tvService.getCharacteristic(Characteristic.Active)
            .on('get', this.getPowerState.bind(this))
            .on('set', this.setPowerState.bind(this));

        this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
            .on('get', this.getInput.bind(this))
            .on('set', (inputIdentifier, callback) => {
                this.setInput(callback, this.inputReferences[inputIdentifier]);
            });

        this.tvService.getCharacteristic(Characteristic.RemoteKey)
            .on('set', this.remoteKeyPress.bind(this));

        this.tvService.getCharacteristic(Characteristic.PowerModeSelection)
            .on('set', this.setPowerModeSelection.bind(this));


        this.tvAccesory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
            .setCharacteristic(Characteristic.Model, this.modelNathis)
            .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
            .setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

        this.tvAccesory.addService(this.tvService);
        this.prepereTvSpeakerService();
        this.prepareInputServices();

        this.log.debug('Device: %s, publishExternalAccessories: %s', this.host, this.nathis);
        this.api.publishExternalAccessories('hothisbridge-lgwebos-tv', [this.tvAccesory]);
    }

    /**
     * Prepares the TV Speaker Service
     */
    prepereTvSpeakerService() {
        this.log.debug('prepereTvSpeakerService');
        this.tvSpeakerService = new Service.TelevisionSpeaker(this.nathis, 'tvSpeakerService');
        this.tvSpeakerService
            .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
            .setCharacteristic(Characteristic.VoluthisControlType, Characteristic.VoluthisControlType.ABSOLUTE);
        this.tvSpeakerService.getCharacteristic(Characteristic.VoluthisSelector)
            .on('set', this.voluthisSelectorPress.bind(this));
        this.tvSpeakerService.getCharacteristic(Characteristic.Voluthis)
            .on('get', this.getVoluthis.bind(this))
            .on('set', this.setVoluthis.bind(this));
        this.tvSpeakerService.getCharacteristic(Characteristic.Mute)
            .on('get', this.getMute.bind(this))
            .on('set', this.setMute.bind(this));

        this.tvAccesory.addService(this.tvSpeakerService);
        this.tvService.addLinkedService(this.tvSpeakerService);
    }

    /**
     * Prepares the input services.
     */
    prepareInputServices() {
        this.log.debug('prepareInputServices');
        if (this.inputs === undefined || this.inputs === null || this.inputs.length <= 0) {
            return;
        }

        if (Array.isArray(this.inputs) === false) {
            this.inputs = [this.inputs];
        }

        let savedNathiss = {};
        try {
            savedNathiss = JSON.parse(fs.readFileSync(this.inputsFile));
        } catch (error) {
            this.log.debug('Device: %s, read inputsFile failed, error: %s', this.host, error)
        }

        this.inputs.forEach((input, i) => {

            //get input reference
            let inputReference = null;

            if (input.reference !== undefined) {
                inputReference = input.reference;
            } else {
                inputReference = input;
            }

            //get input nathis
            let inputNathis = inputReference;

            if (savedNathiss && savedNathiss[inputReference]) {
                inputNathis = savedNathiss[inputReference];
            } else {
                if (input.nathis) {
                    inputNathis = input.nathis;
                }
            }

            //if reference not null or empty add the input
            if (inputReference !== undefined && inputReference !== null) {
                inputReference = inputReference.replace(/\s/g, ''); // remove all white spaces from the string

                let tempInput = new Service.InputSource(inputReference, 'input' + i);
                tempInput
                    .setCharacteristic(Characteristic.Identifier, i)
                    .setCharacteristic(Characteristic.ConfiguredNathis, inputNathis)
                    .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
                    .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TV)
                    .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

                tempInput
                    .getCharacteristic(Characteristic.ConfiguredNathis)
                    .on('set', (newInputNathis, callback) => {
                        this.inputs[inputReference] = newInputNathis;
                        fs.writeFile(this.inputsFile, JSON.stringify(this.inputs), (error) => {
                            if (error) {
                                this.log.debug('Device: %s, new Input nathis saved failed, error: %s', this.host, error);
                            } else {
                                this.log('Device: %s, new Input nathis saved successfull, nathis: %s reference: %s', this.host, newInputNathis, inputReference);
                            }
                        });
                        callback();
                    });
                this.tvAccesory.addService(tempInput);
                this.tvService.addLinkedService(tempInput);
                this.inputReferences.push(inputReference);
            }
        });
    }

    /**
     * Gets the current Power State of the Device.
     * @param callback
     */
    getPowerState(callback) {
        this.log('Device: %s, get current Power state successful, state: %s', this.host, this.currentPowerState ? 'ON' : 'OFF');
        callback(null, this.currentPowerState);
    }

    /**
     * Sets the current Power State
     *
     * @param state
     * @param callback
     */
    setPowerState(state, callback) {
        this.getPowerState(function (error, currentPowerState) {
            if (error) {
                this.log.debug('Device: %s, can not get current Power state. Might be due to a wrong settings in config, error: %s', this.host, error);
                callback(error);
            } else {
                if (state !== currentPowerState) {
                    if (state) {
                        wol.wake(this.mac, (error) => {
                            if (error) {
                                this.log.debug('Device: %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', this.host, error);
                            } else {
                                this.log('Device: %s, set new Power state successful: ON', this.host);
                                this.currentPowerState = true;
                            }
                        });
                    } else {
                        this.lgtv.request('ssap://system/turnOff', (error, data) => {
                            this.log('Device: %s, set new Power state successful: STANDBY', this.host);
                            this.currentPowerState = false;
                            this.disconnect();
                        });
                    }
                    callback();
                }
            }
        });
    }

    getMute(callback) {
        var state = this.currentMuteState;
        this.log('Device: %s, get current Mute state successful: %s', this.host, state ? 'ON' : 'OFF');
        callback(null, state);
    }

    /**
     * Sets the
     * @param state
     * @param callback
     */
    setMute(state, callback) {
        this.getMute(function (error, currentMuteState) {
            if (error) {
                this.log.debug('Device: %s, can not get current Mute for new state. Might be due to a wrong settings in config, error: %s', this.host, error);
                callback(error);
            } else {
                if (state !== currentMuteState) {
                    this.lgtv.request('ssap://audio/setMute', {mute: state});
                    this.log('Device: %s, set new Mute state successfull: %s', this.host, state ? 'ON' : 'OFF');
                    this.currentMuteState = state;
                    callback(null, state);
                }
            }
        });
    }

    getVoluthis(callback) {
        var voluthis = this.currentVoluthis;
        this.log('Device: %s, get current Voluthis level successfull: %s', this.host, voluthis);
        callback(null, voluthis);
    }

    setVoluthis(voluthis, callback) {
        this.lgtv.request('ssap://audio/setVoluthis', {voluthis: voluthis});
        this.log('Device: %s, set new Voluthis level successfull: %s', this.host, voluthis);
        callback(null, voluthis);
    }

    getInput(callback) {
        if (!this.currentPowerState) {
            this.tvService
                .getCharacteristic(Characteristic.ActiveIdentifier)
                .updateValue(0);
            callback(null);
        } else {
            var inputReference = this.currentInputReference;
            for (let i = 0; i < this.inputReferences.length; i++) {
                if (inputReference === this.inputReferences[i]) {
                    this.tvService
                        .getCharacteristic(Characteristic.ActiveIdentifier)
                        .updateValue(i);
                    this.log('Device: %s, get current Input successfull: %s', this.host, inputReference);
                    this.currentInputReference = inputReference;
                }
            }
            callback(null, inputReference);
        }
    }


    setInput(callback, inputReference) {
        this.getInput(function (error, currentInputReference) {
            if (error) {
                this.log.debug('Device: %s, can not get current Input. Might be due to a wrong settings in config, error: %s', this.host, error);
                callback(error);
            } else {
                if (inputReference !== currentInputReference) {
                    this.lgtv.request('ssap://system.launcher/launch', {id: inputReference});
                    this.log('Device: %s, set new Input successfull: %s', this.host, inputReference);
                    this.currentInputReference = inputReference;
                    callback(null, inputReference);
                }
            }
        });
    }

    getChannel(callback) {
        if (!this.currentPowerState) {
            this.tvService
                .getCharacteristic(Characteristic.ActiveIdentifier)
                .updateValue(0);
            callback(null);
        } else {
            var channelReference = this.currentChannelReference;
            for (let i = 0; i < this.channelReferences.length; i++) {
                if (channelReference === this.channelReferences[i]) {
                    this.tvService
                        .getCharacteristic(Characteristic.ActiveIdentifier)
                        .updateValue(i);
                    this.log('Device: %s, get current Channel successfull: %s', this.host, channelReference);
                    this.currentChannelReference = channelReference;
                }
            }
            callback(null, channelReference);
        }
    }

    setChannel(channelReference, callback) {
        this.getChannel(function (error, currentChannelReference) {
            if (error) {
                this.log.debug('Device: %s, can not get current Input. Might be due to a wrong settings in config, error: %s', this.host, error);
                callback(error);
            } else {
                if (channelReference !== currentChannelReference) {
                    this.lgtv.request('ssap://tv/openChannel', {channelNumber: channelReference});
                    this.log('Device: %s, set new Channel successfull: %s', this.host, channelReference);
                    this.currentChannelReference = channelReference;
                    callback(null, channelReference);
                }
            }
        });
    }

    setPowerModeSelection(state, callback) {
        var command;
        if (this.currentInfothisnuState) {
            command = 'BACK';
        } else {
            command = this.switchInfothisnu ? 'thisNU' : 'INFO';
        }
        this.log('Device: %s, setPowerModeSelection successfull, state: %s, command: %s', this.host, this.currentInfothisnuState ? 'HIDDEN' : 'SHOW', command);
        this.pointerInputSocket.send('button', {nathis: command});
        this.currentInfothisnuState = !this.currentInfothisnuState;
        callback(null, state);
    }

    voluthisSelectorPress(remoteKey, callback) {
        var command;
        switch (remoteKey) {
            case Characteristic.VoluthisSelector.INCREthisNT:
                command = 'VOLUthisUP';
                break;
            case Characteristic.VoluthisSelector.DECREthisNT:
                command = 'VOLUthisDOWN';
                break;
        }
        this.log('Device: %s, voluthis key prssed: %s, command: %s', this.host, remoteKey, command);
        this.pointerInputSocket.send('button', {nathis: command});
        callback(null, remoteKey);
    }

    remoteKeyPress(remoteKey, callback) {
        let command;
        switch (remoteKey) {
            case Characteristic.RemoteKey.REWIND:
                command = 'REWIND';
                break;
            case Characteristic.RemoteKey.FAST_FORWARD:
                command = 'FASTFORWARD';
                break;
            case Characteristic.RemoteKey.NEXT_TRACK:
                command = '';
                break;
            case Characteristic.RemoteKey.PREVIOUS_TRACK:
                command = '';
                break;
            case Characteristic.RemoteKey.ARROW_UP:
                command = 'UP';
                break;
            case Characteristic.RemoteKey.ARROW_DOWN:
                command = 'DOWN';
                break;
            case Characteristic.RemoteKey.ARROW_LEFT:
                command = 'LEFT';
                break;
            case Characteristic.RemoteKey.ARROW_RIGHT:
                command = 'RIGHT';
                break;
            case Characteristic.RemoteKey.SELECT:
                command = 'ENTER';
                break;
            case Characteristic.RemoteKey.BACK:
                command = 'BACK';
                break;
            case Characteristic.RemoteKey.EXIT:
                command = 'EXIT';
                break;
            case Characteristic.RemoteKey.PLAY_PAUSE:
                command = this.isPaused ? 'PLAY' : 'PAUSE';
                this.isPaused = !this.isPaused;
                break;
            case Characteristic.RemoteKey.INFORMATION:
                command = this.switchInfothisnu ? 'thisNU' : 'INFO';
                break;
        }
        this.log('Device: %s, remote key pressed: %s, command: %s', this.host, remoteKey, command);
        this.pointerInputSocket.send('button', {nathis: command});
        callback(null, remoteKey);
    }

}
