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

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {

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
                await this.setStateAsync('oscaminfo.Uptime',  {val: result.oscam.$.uptime, ack: true} );

                this.karten=result.oscam.status[0].client;

                this.karten.forEach ((karte) => {
                    if (karte.$.type == 'r') {
                        this.log.debug (`${JSON.stringify(karte.$.type)}`);
                    }
                });

                //this.log.info(`${JSON.stringify(this.cards)}`);
            });
        }).catch( (error) => {
            this.log.error(error.statusCode);
            this.log.error(error.body);
        });


        // Alle eigenen States abonnieren
        await this.subscribeStatesAsync('*');
    }



    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);

            callback();
        } catch (e) {
            callback();
        }
    }

    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  * @param {string} id
    //  * @param {ioBroker.Object | null | undefined} obj
    //  */
    // onObjectChange(id, obj) {
    //     if (obj) {
    //         // The object was changed
    //         this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    //     } else {
    //         // The object was deleted
    //         this.log.info(`object ${id} deleted`);
    //     }
    // }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
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

}

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