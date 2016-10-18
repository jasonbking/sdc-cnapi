/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2016, Joyent, Inc.
 */

/*
 * Main entry-point for the CNAPI.
 */

var App = require('../lib/app');
var bunyan = require('bunyan');
var common = require('../lib/common');
var path = require('path');
var tritonTracer = require('triton-tracer');

var configFilename = path.join(__dirname, '..', 'config', 'config.json');

common.loadConfig(configFilename, function (error, config) {
    tritonTracer.init({
        log: new bunyan({
            name: 'cnapi',
            level: 'debug'
        })
    }, function (/* session */) {
        var app = new App(config);
        app.start();
    });
});
