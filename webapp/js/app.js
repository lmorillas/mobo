/* global $, document, window, JSONEditor, WebSocket */

/** global namespace */
var mobo = {};


//////////////////////////////////////////
// Options / Config                     //
//////////////////////////////////////////

mobo.displayForm = true;

require.config({
    baseUrl: ".."
});


//////////////////////////////////////////
// ON DOCUMENT READY                    //
//////////////////////////////////////////

$(document).ready(function() {



    // Get project settings (for URL to external wiki)
    $.getJSON("settings.json", function(settings) {

        mobo.settings = settings;
        mobo.remoteWiki = settings.mw_server_url + '/' + settings.mw_server_path + '/index.php';

        $(window).on('hashchange', function() {
            mobo.route();
        });

        mobo.loadData();

        // Connect to WebSocket Server, if available
        // This allows automatically triggering of GUI Refreshes from the server
        var webSockets = settings.autoRefreshWebGui || true;

        if (webSockets) {
            var host = window.document.location.host.replace(/:.*/, '');
            var port = settings.autoRefreshPort || 8081;

            var ws = new WebSocket('ws://' + host + ':' + port);
            ws.onmessage = function() {
                mobo.loadData();
                console.log('Refreshing data...');
                $('#refresh').show().delay(800).fadeOut(400);
            };
        }

    });



});

mobo.loadData = function() {

    // Get registry.json first
    $.getJSON( "_processed/_registry.json", function(registry) {

        mobo.registry = registry;

        mobo.wikitext = registry.generated || {};


        //////////////////////////////////////////
        // BOOTSTRAP WEBAPP                     //
        //////////////////////////////////////////

        if (Object.keys(mobo.wikitext).length > 0) {

            mobo.route();

            $('#select-schema').select2().on("change", function(e) {
                var selection = e.val.split('/');
                window.location.hash = '#' + selection[0] + '/' + selection[1];
            });

            $('#select-wikitext').select2().on("change", function(e) {
                window.location.hash = '#' + e.val;
            });

            mobo.populateSelect('selection');

        } else {
            $('#default-view').html('<div class="description">The model is empty, please create one first.</div>');
        }

    });
};


//////////////////////////////////////////
// Main Functions                       //
//////////////////////////////////////////

/**
 * Displays a specific part of the model depending on the current URL Hash
 */
mobo.route = function() {

    var hash = window.location.hash;

    // If no hash, use the first model as default entry point
    if (!hash) {

        for (var title in mobo.registry.model) {
            if (title) {
                hash = '#model/' + title;
                window.location.hash = hash;
                break;
            }
        }
    }

    hash = hash.replace('#', '');
    var hashArray = hash.split('/');

    if (hash.indexOf(":") > -1) {

        hashArray = hash.split(':');
        mobo.showDetail(hashArray[0], hashArray[1]);

    } else {

        $('#default-view').show();
        $('#detail-view').hide();

        require(["lib/docson/docson"], function(docson) {

            mobo.docson = docson;

            if (hashArray.length === 2) {
                mobo.loadSchema(hashArray[0], hashArray[1]);
            } else {
//                mobo.loadSchema('model', 'Abteilung');
                console.log('Invalid url-hash');
            }
        });
    }
};

/**
 * Displays a specific part of the model
 *
 * Uses Docson for documentation
 * Uses JSONEditor for forms
 * Uses jQuery for raw text
 *
 * @param type
 * @param name
 */
mobo.loadSchema = function(type, name) {

    var schema;

    $('#form').html('');
    $('#doc').html('');
    $('#refs').html('');
    $('#refs-ul').html('');

    if (type === 'model') {
        schema = mobo.registry.expandedModel[name];
    } else if (type === 'form') {
        schema = mobo.registry.expandedForm[name];
    } else if (type === 'field') {
        schema = mobo.registry.expandedField[name];
    }

    mobo.schemaOrig = schema;

    $('#schema-orig').text(JSON.stringify(schema, false, 4));

    mobo.docson.templateBaseUrl = "../lib/docson/templates";

    mobo.docson.doc("doc", schema);
    mobo.schemaFull = schema;
    $('#schema').text(JSON.stringify(schema, false, 4));

    if (mobo.displayForm) {

        var element = document.getElementById('form');
        mobo.editor = new JSONEditor(element, {
            schema: schema,
            theme: 'bootstrap3',
            iconlib: "fontawesome4",
            disable_edit_json: true,
            disable_collapse: true,
            no_additional_properties: true,
            ajax: true
        });

        mobo.editor.on('ready', function() {

        });

        mobo.editor.on('change', function() {
            mobo.getResult();
        });
    }

};

/**
 * Populates the (Select2) Selection box with available options
 */
mobo.populateSelect = function() {

    var html = '<option></option>';
    var name;

    // Forms
    html += ('<optgroup label="Form">');
    for (name in mobo.registry.form) {
        html += '<option value="form/' + name + '">' + name + '</option>';
    }
    html += '</optgroup>';

    // Models
    html += ('<optgroup label="Model">');
    for (name in mobo.registry.expandedModel) {
        html += '<option value="model/' + name + '">' + name + '</option>';
    }
    html += '</optgroup>';

    // Fields
    html += ('<optgroup label="Field">');
    for (name in mobo.registry.field) {
        html += '<option value="field/' + name + '">' + name + '</option>';
    }
    html += '</optgroup>';

    $('#select-schema').html(html);


    html = '<option></option>';
    for (var siteName in mobo.wikitext) {
        html += '<option value="' + siteName + '">' + siteName + '</option>';
    }
    $('#select-wikitext').html(html);

};

/**
 * Validates the example forms. Displays the success / error messages
 */
mobo.getResult = function() {

    var errors = mobo.editor.validate();

    if (errors.length) {
        $('#result').text(JSON.stringify(errors, false, 4));
        $('#result').parent().removeClass('valid');
        $('#result').parent().addClass('invalid');
    } else {
        var value = mobo.editor.getValue();
        $('#result').text(JSON.stringify(value, false, 4));
        $('#result').parent().removeClass('invalid');
        $('#result').parent().addClass('valid');
    }
};

/**
 * Handles the JSON Schema text rendering
 *
 * @param type
 * @param name
 */
mobo.showDetail = function(type, name) {

    var schema;
    var siteName = type + ':' + name;

    if (type === 'model') {
        schema = mobo.registry.expandedModel[name];
    } else if (type === 'form') {
        schema = mobo.registry.expandedForm[name];
    } else if (type === 'field') {
        schema = mobo.registry.field[name];
    }

    $('#default-view').hide();
    $('#detail-title').text(siteName);
    $('#detail-links').html('<a href="' + mobo.remoteWiki + '/' +  siteName + '" target="_blank">[remote-view]</a>');
    $('#detail-links').append(' <a href="' + mobo.remoteWiki + '?title=' +  siteName + '&action=edit" target="_blank">[remote-edit]</a>');
    $('#detail-markup').text(mobo.wikitext[type + ':' + name]);
    $('#detail-view').show();
};


//////////////////////////////////////////
// Helper Functions
//////////////////////////////////////////

/**
 * Sorts objects alphabetically by key
 *
 * @param obj
 * @returns {{}}
 */
mobo.sortObjectByKey = function(obj){
    var keys = [];
    var sorted_obj = {};

    for(var key in obj){
        if(obj.hasOwnProperty(key)){
            keys.push(key);
        }
    }

    // sort keys
    keys.sort();

    // create new array based on Sorted Keys
    $.each(keys, function(i, key){
        sorted_obj[key] = obj[key];
    });

    return sorted_obj;
};

/**
 * Escapes special HTML characters
 *
 * @returns {string}
 */
mobo.escapeWikitext = function(wikitext) {

    if (wikitext) {

        if (!wikitext.replace) {
            console.dir(wikitext);
        }


        var tagsToReplace = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;'
        };
        return wikitext.replace(/[&<>]/g, function(tag) {
            return tagsToReplace[tag] || tag;
        });
    } else {
        return '';
    }

};
