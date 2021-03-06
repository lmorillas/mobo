'use strict';

/**
 * This is the main module that makes use of the several submodules.
 *
 * It triggers the generation and upload of the model.
 */

//////////////////////////////////////////
// Requirements                         //
//////////////////////////////////////////

var fs                = require('fs-extra');
var path              = require('path');

var readProject       = require('./input/readProject.js');

var extendProject     = require('./processing/extendProject.js');
var generateWikiStructure  = require('./processing/generateWikiStructure.js');
var generateGraph     = require('./processing/generateGraph.js');

var writeExportFiles  = require('./output/writeExportFiles.js');
var uploadExportFiles = require('./output/uploadExportFiles.js');

var validate          = require('./util/validate.js');
var moboUtil          = require('./util/moboUtil.js');
var log               = moboUtil.log;

var packageJSON       = require('./../package');


//////////////////////////////////////////
// Variables                            //
//////////////////////////////////////////

/** Microtimestamp for benchmarking */
exports.start = (new Date()).getTime();

/**
 * Global Log Object. This is used to share logging entries between the different modules
 *
 * @type {Array}
 */
global.moboLogObject = [];

/** mobo registry, containing the model in it's various processing stages */
exports.registry = {};


//////////////////////////////////////////
// MOBO BOOTSTRAP FUNCTIONS             //
//////////////////////////////////////////

/**
 * Triggers the complete mobo generation process
 *
 * @param {{}}              settings        Settings Object
 * @param {function|false}  onGenerated     onGenerated callback function
 * @param {function}        callback        callback function when finally done
 */
exports.exec = function(settings, onGenerated, callback) {

    exports.start = (new Date()).getTime();
    moboUtil.clearLogHistory();

    // Put current settings into the log object, remove the password before
    var safeSettings = JSON.parse(JSON.stringify(settings)); // deep copy
    safeSettings.mw_password = '**********';
    log(safeSettings, true);

    // Log microtimestamp
    log(exports.start, true);

    log('');
    log('> mobo v' + packageJSON.version + ' (' + moboUtil.humanDate() + ')');
    log('==============================================================================');


    //////////////////////////////////////////
    // MOBO SEQUENCE                        //
    //////////////////////////////////////////

    // 1) READ PROJECT FILES FROM FILE SYSTEM
    var moboTaskQueue = readProject.exec(settings.importModelDir);

    // 2) VALIDATE PROJECT SCHEMA
    moboTaskQueue.then(function(registry) {
        exports.registry = registry;
        return validate.validateRegistry(exports.registry);
    });

    // 3) EXTEND PROJECT REGISTRY (applies inheritance)
    moboTaskQueue.then(function(registry){
        exports.registry = registry;
        return extendProject.exec(settings, registry);
    });

    // 4) VALIDATE EXTENDED REGISTRY
    moboTaskQueue.then(function(registry) {
        exports.registry = registry;
        return validate.validateExpandedRegistry(exports.registry);
    });

    // 5) OPTIONAL: BUILD GRAPH FROM MODEL
    if (settings.buildGraph) {
        moboTaskQueue.then(function(registry){
            return generateGraph.exec(settings, registry);
        });
    }

    // 6) GENERATE WIKI STRUCTURE
    moboTaskQueue.then(function(registry) {
        return generateWikiStructure.exec(settings, registry);
    });

    // 7) OPTIONAL: WRITE EXPORT FILES
    moboTaskQueue.then(function(registry) {

        var diff = (new Date()).getTime() - exports.start;
        log(' Generation completed in: ' + diff + 'ms.');
        log('==============================================================================');

        if (onGenerated) {
            onGenerated(); // If onGenerated callback is provided, execute it (refreshes WebGUI)
        }

        return writeExportFiles.exec(settings, registry);

    });

    moboTaskQueue.then(function(registry) {

        // TODO: This has to be a callback, because the nodemw library made problems with promises
        return uploadExportFiles.exec(settings, registry, function(err) {

            var diff = (new Date()).getTime() - exports.start;

            log('------------------------------------------------------------------------------');
            log(' Time total: ' + diff + 'ms.');
            log('==============================================================================');

            if (settings.writeLogFile) {
                moboUtil.writeLogHistory(settings.processedModelDir + '/logfiles/');
            }

            if (err) {
                log(' [E] Error while uploading to the wiki: ' + err.message);
                log(err);
            }

            // TODO: This calls the callback BEFORE the upload is completed. Better Make callbacks unecessary
            if (callback) {
                callback(false, registry.generated);
            }
        });

    });

    // X) HANDLE ERRORS (FINAL CATCH)
    moboTaskQueue.catch(function (e) {
        if (settings.debug) {log(' [D] [X] PROMISE CAUGHT');}
        log(' [E] Error while building the registry!');
        log(e);
    });

};


//////////////////////////////////////////
// CLI COMMANDS                         //
//////////////////////////////////////////

/**
 * Reads the /cli.md file and returns it as a string
 * @returns {string}
 */
exports.getHelp = function() {
    return fs.readFileSync(__dirname + '/cli.md').toString();
};

/**
 * Returns the current version of mobo.
 * The version is defined in the package.json file in the root directory
 *
 * @returns {exports.version|*}
 */
exports.getVersion = function() {
    return packageJSON.version;
};

/**
 * Creates a new model example in the current working directory
 *
 * @param {String}  name            Name of the example. Must match the folder name in /examples/
 * @param {String}  customDirectory Custom directory to install the sample project in
 *
 * @return {boolean} success
 */
exports.install = function(name, customDirectory) {

    var fs  = require('fs-extra');
    var cwd = customDirectory || process.cwd();

    var currentDir = fs.readdirSync(cwd);

    var installExample = function(name) {

        try {
            fs.copySync(__dirname + '/../examples/' + name, cwd);
            log(' [S] Created example "' + name + '" project structure!');
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }

    };

    try {
       fs.readdirSync(__dirname + '/../examples/' + name);
    } catch (e) {
        log(' [E] Example "' + name + '" does not exist.');
        var examples = fs.readdirSync(__dirname + '/../examples/');
        log(' [i] Available examples: ' + examples.join(', '));
        return false;
    }

    // Create a new init project structure if current directory is empty
    if (currentDir.length > 0) {
        if (currentDir.indexOf('settings.json') > -1) {
            log(' [i] Skipping init: Current directory has already a project structure!');

            // If an example is to be installed, copy those files on top on the init structure
            if (name !== 'init') {
                installExample(name);
            }

        } else {
            log(' [E] Aborting init process: Current directory is not empty!');
            return false;
        }

    } else {

        try {
            fs.copySync(__dirname + '/../examples/init/', cwd);

            log(' [S] Created initial project structure!');
            log(' [i] Please adjust your settings.json now. ');

            // If an example is to be installed, copy those files on top on the init structure
            if (name !== 'init') {
                installExample(name);
            }

            return true;

        } catch (err) {
            console.error(err);
            return false;
        }

    }

    return true; // Success

};

/**
 * This updates the templates of the current directory with the current default templates from mobo
 * Sometimes an update is necessary if new features are introduced.
 * Creates a backup of the current project templates first.
 */
exports.update = function(settings) {

    var cwd = settings.cwd;
    var templatesDir = settings.templateDir;

    var backupDir = path.join(cwd, '/mobo_template_backup/' + moboUtil.roboDate());
    var templatesSourceDir = path.join(__dirname,'/../examples/init/mobo_template/');

    log('');
    log(' [i] This command will update the project templates with the current mobo templates.');
    log(' [i] Your old templates will be backed up at /mobo_template_backup/*');
    log('');

    try {
        fs.mkdirsSync(cwd + '/mobo_template_backup/');
        fs.mkdirsSync(backupDir);

        fs.copySync(templatesDir, backupDir);
        fs.copySync(templatesSourceDir, templatesDir);

        log(' [S] Backup of project template files to \n  "' + backupDir + '"');

        return true;

    } catch (err) {
        console.error(err);
        throw err;
    }

};