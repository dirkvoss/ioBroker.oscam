'use strict';

const utils = require('@iobroker/adapter-core');
const parseString = require('xml2js').parseString;

class Oscam extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'oscam',
        });

        this.oscamIpAdress = null;
        this.oscamPort = null;
        this.oscamUser = null;
        this.oscamPassword = null;
        this.oscamUrl = null;
        this.digestRequest = null;
        this.karten = [];

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));

    }

    async onReady() {

        this.setStateAsync('info.connection', false, true);

        this.log.debug(`instance config: ${JSON.stringify(this.config)}`);

        if (!this.config.serverIp || !this.config.password || !this.config.serverPort || !this.config.userName) {
            this.log.error (`Check your configuration. Configuation is not complete !`);
            return;
        }

        this.oscamIpAdress = 'http://' + this.config.serverIp ;
        this.oscamPort = this.config.serverPort;
        this.oscamUser = this.config.userName;
        this.oscamPassword = this.config.password;
        this.oscamUrl = '/oscamapi.html?part=status';
        this.refreshTime = this.config.refreshtime;

        this.updateInterval = setInterval(async () => {
            await this.getStatusAndWriteDataPoints();
        }, this.refreshTime * 1000);

        // Alle eigenen States abonnieren
        this.subscribeStatesAsync('*');

        this.setStateAsync('info.connection', true, true);
    }

    onUnload(callback) {
        try {
            clearInterval(this.updateInterval);
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            //this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            //this.log.info(`state ${id} deleted`);
        }
    }

    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  * @param {ioBroker.Message} obj
    //  */
    // onMessage(obj) {
    //     if (typeof obj === 'object' && obj.message) {
    //         if (obj.command === 'send') {
    //             // e.g. send email or pushover or whatever
    //             this.log.info('send command');

    //             // Send response in callback if required
    //             if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
    //         }
    //     }
    // }

    async getStatusAndWriteDataPoints () {

        const getAUStatus = (stat) => {
            const defaultKey = 'not defined';

            const statMap = {
                '-1' : 'On',
                '1'  : 'Auto',
            };
            return statMap[stat] ?? statMap[defaultKey];
        };

        this.digestRequest = require('request-digest')(this.oscamUser, this.oscamPassword);
        this.digestRequest.requestAsync({
            host: this.oscamIpAdress,
            port: this.oscamPort,
            path: this.oscamUrl,
            method: 'GET',
            excludePort: false,
            headers: {
                'Custom-Header': 'OneValue',
                'Other-Custom-Header': 'OtherValue'
            }
        }).then( (response) => {
            this.log.info (`Connection established to ${this.oscamIpAdress} Port ${this.oscamPort} and Url ${this.oscamUrl}`);
            parseString(response.body, async (err, result) => {
                // get Oscam Information
                this.log.debug (`Parsing XML Body Response to JSON`);
                this.log.debug (`${response.body}`);

                await this.setStateAsync('oscaminfo.Version',  {val: result.oscam.$.version, ack: true} );
                await this.setStateAsync('oscaminfo.Revision',  {val: result.oscam.$.revision, ack: true} );
                await this.setStateAsync('oscaminfo.Starttime',  {val: result.oscam.$.starttime, ack: true} );
                await this.setStateAsync('oscaminfo.Uptime',  {val: Number(result.oscam.$.uptime), ack: true} );

                this.karten=result.oscam.status[0].client;

                this.karten.forEach ((karte) => {

                    // only real cards with type "r" are relevant
                    if (karte.$.type == 'r') {

                        // Create channel for every reader
                        const channel4reader = 'cards.' +  karte.$.name;
                        this.setObjectNotExists(channel4reader, {
                            type: 'channel',
                            common: {
                                name: 'card',
                                role: 'text'
                            },
                            native: {}
                        });

                        //Create Status and set Status for every reader
                        this.setObjectNotExists(channel4reader  + '.Status', {
                            'type': 'state',
                            'common': {
                                'role': 'text',
                                'name': 'Status',
                                'type': 'string',
                                'read':  true,
                                'write': false
                            },
                            'native': {}
                        });
                        this.setStateAsync(channel4reader  + '.Status',  {val: karte.connection[0]._, ack: true} );

                        //Create Protocol and set Protocol for every reader
                        this.setObjectNotExists(channel4reader  + '.Protocol', {
                            'type': 'state',
                            'common': {
                                'role': 'text',
                                'name': 'Protocol',
                                'type': 'string',
                                'read':  true,
                                'write': false
                            },
                            'native': {}
                        });
                        this.setStateAsync(channel4reader  + '.Protocol',  {val: karte.$.protocol, ack: true} );

                        //Create AU Flag and set AU Flag for every reader
                        this.setObjectNotExists(channel4reader  + '.AU', {
                            'type': 'state',
                            'common': {
                                'role': 'text',
                                'name': 'Autoupdate',
                                'type': 'string',
                                'read':  true,
                                'write': false
                            },
                            'native': {}
                        });

                        this.setStateAsync(channel4reader  + '.AU',  {val: getAUStatus(karte.$.au), ack: true} );

                        //Create login time  and set login time for every reader
                        this.setObjectNotExists(channel4reader  + '.Login time', {
                            'type': 'state',
                            'common': {
                                'role': 'text',
                                'name': 'Login time',
                                'type': 'string',
                                'read':  true,
                                'write': false
                            },
                            'native': {}
                        });
                        this.setStateAsync(channel4reader  + '.Login time',  {val: karte.times[0].$.login, ack: true} );

                        //Create uptime time  and set uptime time for every reader
                        this.setObjectNotExists(channel4reader  + '.Uptime', {
                            'type': 'state',
                            'common': {
                                'role': 'text',
                                'name': 'Uptime in seconds',
                                'type': 'number',
                                'read':  true,
                                'write': false
                            },
                            'native': {}
                        });
                        this.setStateAsync(channel4reader  + '.Uptime',  {val: Number(karte.times[0].$.online), ack: true} );

                        //Create Description and set Description for every reader
                        this.setObjectNotExists(channel4reader  + '.Description', {
                            'type': 'state',
                            'common': {
                                'role': 'text',
                                'name': 'Description',
                                'type': 'string',
                                'read':  true,
                                'write': false
                            },
                            'native': {}
                        });
                        this.setStateAsync(channel4reader  + '.Description',  {val: karte.$.desc, ack: true} );

                        //Create caid and set caid for every reader
                        this.setObjectNotExists(channel4reader  + '.CAID', {
                            'type': 'state',
                            'common': {
                                'role': 'text',
                                'name': 'CAID',
                                'type': 'string',
                                'read':  true,
                                'write': false
                            },
                            'native': {}
                        });
                        this.setStateAsync(channel4reader  + '.CAID',  {val: karte.request[0].$.caid, ack: true} );

                        //Create provid and set provid for every reader
                        this.setObjectNotExists(channel4reader  + '.PROVID', {
                            'type': 'state',
                            'common': {
                                'role': 'text',
                                'name': 'PROVID',
                                'type': 'string',
                                'read':  true,
                                'write': false
                            },
                            'native': {}
                        });
                        this.setStateAsync(channel4reader  + '.PROVID',  {val: karte.request[0].$.provid, ack: true} );

                        //Create srvid and set srvid for every reader
                        this.setObjectNotExists(channel4reader  + '.SRVID', {
                            'type': 'state',
                            'common': {
                                'role': 'text',
                                'name': 'SRVID',
                                'type': 'string',
                                'read':  true,
                                'write': false
                            },
                            'native': {}
                        });

                        this.setStateAsync(channel4reader  + '.SRVID',  {val: karte.request[0].$.srvid, ack: true} );

                        //Create ecmtime for every reader
                        this.setObjectNotExists(channel4reader  + '.ecmtime', {
                            'type': 'state',
                            'common': {
                                'role': 'text',
                                'name': 'ecmtime',
                                'type': 'string',
                                'read':  true,
                                'write': false
                            },
                            'native': {}
                        });

                        this.setStateAsync(channel4reader  + '.ecmtime',  {val: karte.request[0].$.ecmtime, ack: true} );

                        //Create ecmtime for every reader
                        this.setObjectNotExists(channel4reader  + '.ecmhistory', {
                            'type': 'state',
                            'common': {
                                'role': 'text',
                                'name': 'ecmhistory',
                                'type': 'string',
                                'read':  true,
                                'write': false
                            },
                            'native': {}
                        });

                        this.setStateAsync(channel4reader  + '.ecmhistory',  {val: karte.request[0].$.ecmhistory, ack: true} );

                        //this.log.debug (`${JSON.stringify(karte.request[0].$.caid)}`);
                    } // if
                }); // foreach
            }); // parsestring
        });
    } //getStatusAndWriteDataPoints

} // class Oscam


if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Oscam(options);
} else {
    // otherwise start the instance directly
    new Oscam();
}