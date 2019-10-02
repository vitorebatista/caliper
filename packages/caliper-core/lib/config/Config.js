/*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
* http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

'use strict';

const fs = require('fs');
const path = require('path');
const nconf = require('nconf');

nconf.formats.yaml = require('nconf-yaml');

const keys = {
    Bind: {
        Sut: 'caliper-bind-sut',
        Sdk: 'caliper-bind-sdk',
        Args: 'caliper-bind-args',
        Cwd: 'caliper-bind-cwd'
    },
    Report: {
        Path: 'caliper-report-path',
        Options: 'caliper-report-options'
    },
    Workspace: 'caliper-workspace',
    ProjectConfig: 'caliper-projectconfig',
    UserConfig: 'caliper-userconfig',
    MachineConfig: 'caliper-machineconfig',
    BenchConfig: 'caliper-benchconfig',
    NetworkConfig: 'caliper-networkconfig',
    ZooAddress: 'caliper-zooaddress',
    ZooConfig: 'caliper-zooconfig',
    TxUpdateTime: 'caliper-txupdatetime',
    Logging: 'caliper-logging',
    Flow: {
        Skip: {
            Start : 'caliper-flow-skip-start',
            Init: 'caliper-flow-skip-init',
            Install: 'caliper-flow-skip-install',
            Test: 'caliper-flow-skip-test',
            End: 'caliper-flow-skip-end'
        },
        Only: {
            Start: 'caliper-flow-only-start',
            Init: 'caliper-flow-only-init',
            Install: 'caliper-flow-only-install',
            Test: 'caliper-flow-only-test',
            End: 'caliper-flow-only-end'
        }
    },
    Fabric: {
        SleepAfter: {
            CreateChannel: 'caliper-fabric-sleepafter-createchannel',
            JoinChannel: 'caliper-fabric-sleepafter-joinchannel',
            InstantiateChaincode: 'caliper-fabric-sleepafter-instantiatechaincode',
        },
        Verify: {
            ProposalResponse: 'caliper-fabric-verify-proposalresponse',
            ReadWriteSets: 'caliper-fabric-verify-readwritesets',
        },
        Timeout: {
            ChaincodeInstantiate: 'caliper-fabric-timeout-chaincodeinstantiate',
            ChaincodeInstantiateEvent: 'caliper-fabric-timeout-chaincodeinstantiateevent',
            InvokeOrQuery: 'caliper-fabric-timeout-invokeorquery',
        },
        LoadBalancing: 'caliper-fabric-loadbalancing',
        OverwriteGopath: 'caliper-fabric-overwritegopath',
        LatencyThreshold: 'caliper-fabric-latencythreshold',
        CountQueryAsLoad: 'caliper-fabric-countqueryasload',
        SkipCreateChannelPrefix: 'caliper-fabric-skipcreatechannel-',
        Gateway: 'caliper-fabric-usegateway',
        GatewayLocalHost: 'caliper-fabric-gatewaylocalhost',
        Discovery: 'caliper-fabric-discovery'
    }
};

/**
 * Normalizes the key of the given setting.
 * @param {{key: string, value: any}} kvPair The setting as a key-value pair.
 * @return {{key: string, value: any}} The setting with the modified key.
 */
function normalizeSettingKey(kvPair) {
    let newKey = kvPair.key.toLowerCase().replace(/[_]/g, '-');
    // only change the command line argument or environment variable name for Caliper settings
    if (newKey.startsWith('caliper-')) {
        kvPair.key = newKey;
    }

    return kvPair;
}

/**
 * Returns the settings for parsing a configuration file.
 * @param {string} filename The path of the configuration file.
 * @return {{file: string, logicalSeparator: string, format: object}} The parsing options.
 */
function getFileParsingOptions(filename) {
    return { file: filename, logicalSeparator: '-', format: nconf.formats.yaml };
}

/**
 * Creates an absolute path from the provided relative path if necessary.
 * @param {String} relOrAbsPath The relative or absolute path to convert to an absolute path.
 *                              Relative paths are considered relative to the Caliper root folder.
 * @param {String} root_path root path to use
 * @return {String} The resolved absolute path.
 */
function resolvePath(relOrAbsPath, root_path) {
    if (!relOrAbsPath) {
        throw new Error('Config.resolvePath: Parameter is undefined');
    }

    if (path.isAbsolute(relOrAbsPath)) {
        return relOrAbsPath;
    }

    return path.join(root_path, relOrAbsPath);
}

/**
 * The class encapsulating the hierarchy of runtime configurations.
 * @type {Config}
 */
class Config {
    /**
     * Constructor
     */
    constructor() {
        // create own instance in case other dependencies also use nconf
        this._config = new nconf.Provider();

        ///////////////////////////////////////////////////////////////////////////////
        // the priority is the following:                                            //
        // memory > commandline args > environment variables > project config file > //
        // > user config file > machine config file > default config file            //
        ///////////////////////////////////////////////////////////////////////////////

        this._config.use('memory');

        // normalize the argument names to be more robust
        this._config.argv({ parseValues: true, transform: normalizeSettingKey });

        // normalize the argument names to be more robust
        this._config.env({ parseValues: true, transform: normalizeSettingKey });

        // if "caliper-projectconfig" is set at this point, include that file
        let projectConf = this.get(keys.ProjectConfig, undefined);
        if (projectConf && (typeof projectConf === 'string')) {
            let projectConfFile = resolvePath(projectConf, this.get(keys.Workspace, '.'));
            this._config.file('project', getFileParsingOptions(projectConfFile));
        } else {
            // check whether caliper.yaml is present in the workspace directory for convenience
            let projectConfFile = resolvePath('caliper.yaml', this.get(keys.Workspace, '.'));
            if (fs.existsSync(projectConfFile)) {
                this._config.file('project', getFileParsingOptions(projectConfFile));
            }
        }

        // if "caliper-userconfig" is set at this point, include that file
        let userConfig = this.get(keys.UserConfig, undefined);
        if (userConfig && (typeof userConfig === 'string')) {
            let userConfFile = resolvePath(userConfig, this.get(keys.Workspace, '.'));
            this._config.file('user', getFileParsingOptions(userConfFile));
        }

        // if "caliper-machineconfig" is set at this point, include that file
        let machineConfig = this.get(keys.MachineConfig, undefined);
        if (machineConfig && (typeof machineConfig === 'string')) {
            let machineConfFile = resolvePath(machineConfig, this.get(keys.Workspace, '.'));
            this._config.file('machine', getFileParsingOptions(machineConfFile));
        }

        // as fallback, always include the default config packaged with Caliper
        const defaultConfig = path.join(__dirname, 'default.yaml');
        this._config.file('default', getFileParsingOptions(defaultConfig));
    }

    /**
     * Get the config setting with name.
     * If the setting is not found, returns the provided default value.
     * @param {string} name Key/name of the setting.
     * @param {any} defaultValue The default value to return if the setting is not found.
     * @return {any} Value of the setting
     */
    get(name, defaultValue) {
        let value = null;

        try {
            value = this._config.get(name);
        }
        catch(err) {
            value = defaultValue;
        }

        // NOTE: can't use !value, since a falsey value could be a valid setting
        if(value === null || value === undefined) {
            value = defaultValue;
        }

        return value;
    }

    /**
     * Set a value into the 'memory' store of config settings.
     * This will override all other settings.
     * @param {string} name name of the setting
     * @param {any} value value of the setting
     */
    set(name, value) {
        this._config.set(name,value);
    }
}

module.exports = Config;
module.exports.keys = keys;

