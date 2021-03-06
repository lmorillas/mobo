//////////////////////////////////////////
// Requirements                         //
//////////////////////////////////////////

var tv4          = require('tv4');
var Promise      = require('bluebird');

var moboSchema   = require('./../moboSchema');
var moboUtil     = require('./moboUtil');
var log          = moboUtil.log;


//////////////////////////////////////////
// CORE FUNCTIONS                       //
//////////////////////////////////////////

/**
 * Validates the mobo registry against the mobo JSON Schema
 *
 * @param {object}  registry mobo registry
 *
 * @returns {{}}
 */
exports.validateRegistry = function(registry) {
    'use strict';

    return new Promise(function(resolve) {

        var registryTypes = ['field', 'model', 'form'];

        // Iterate registry types
        for (var i = 0; i < registryTypes.length; i++) {
            var type = registryTypes[i];
            var elements = registry[type];

            // Iterate each element of a type and validate it
            for (var elName in elements) {
                exports.validate(elements[elName], moboSchema[type + 'Schema'], type + '/' + elName);
            }
        }

        resolve(registry);
    });

};


/**
 * Validates the expanded mobo registry
 * Checks hard requirements and interdependencies
 *
 * @param {object}  registry mobo registry
 *
 * @returns {{}}
 */
exports.validateExpandedRegistry = function (registry) {
    'use strict';

    return new Promise(function(resolve) {

        var registryTypes = ['expandedField', 'expandedModel', 'expandedForm'];

        // Iterate registry types
        for (var i = 0; i < registryTypes.length; i++) {
            var type = registryTypes[i];
            var elements = registry[type];

            // Iterate each element of a type and validate it
            for (var elName in elements) {
                var obj = elements[elName];
                var id = obj.$filepath || obj.id || elName || '(unknown)';

                // Must have a title attribute
                if (!obj.title) {
                    log(' [E] [JSON Structure] ' + type + ' "' + id + '" has no title attribute!');
                }

                // Must have a type attribute
                if (!obj.type) {
                    log(' [E] [JSON Structure] ' + type + ' "' + id + '" has no type attribute!');
                }

                // If an requirement array is provided, check that all required properties do actually exist
                if (obj.required) {
                    for (var j = 0; j < obj.required.length; j++) {
                        var requirement = obj.required[j];
                        if (!obj.properties[requirement] && requirement !== '*') {
                            log(' [W] ' + id + ' requires non-existent property "' + obj.required[j] + '"!');
                        }
                    }
                }

                // If an recommended array is provided, check that all required properties do actually exist
                if (obj.recommended) {
                    for (var k = 0; k < obj.recommended.length; k++) {
                        var recommended = obj.recommended[k];
                        if (!obj.properties[recommended]) {
                            log(' [W] ' + id + ' recommends non-existent property "' + obj.recommended[k] + '"!');
                        }
                    }
                }

                // Checks if the object is actually used. Skip forms, since they are the entry points
                if (type !== 'expandedForm' && !obj.$referenceCounter) {
                    log(' [W] ' + id + ' is never used.');
                }
            }
        }

        resolve(registry);
    });


};


/**
 * Validates a settings object against mobos settings schema
 *
 * @param {object} settings
 *
 * @returns {Object} validation result
 */
exports.validateSettings = function (settings) {
    return exports.validate(settings, moboSchema.settingsSchema, 'settings.json');
};

/**
 * Wrapper around a JSON Schema Validator, uses tv4
 * Uses promise pattern and mobo style error / warning messages
 *
 * @see https://www.npmjs.com/package/tv4)
 *
 * @param {object}  json
 * @param {object}  schema
 * @param {string}  name    only for error debugging
 *
 * @returns {object} result object
 */
exports.validate = function (json, schema, name) {

    var id = json.$filepath || json.id || name || '(unknown)';

    // Validate with the tv4 JSON Schema Validator Library
    // Use multiple option to catch and report multiple errors in one json object
    var result = tv4.validateMultiple(json, schema);

    if (!result.valid || result.errors.length > 0) {
        for (var i = 0; i < result.errors.length; i++) {

            var error = result.errors[i];

            if (error.schemaPath === '/additionalProperties') {
                // Unsupported additional Properties throw only a warning
                log(' [W] [JSON Structure] ' + id + ' > Unsupported property ' + error.dataPath);
            } else {
                log(' [E] [JSON Structure] ' + id + ' > ' + error.message);
                delete error.stack; // Delete the error stack since it's not very helpful and cluttering the console
                log(error);
            }
        }
    }

    return result;
};