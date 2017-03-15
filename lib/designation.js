/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

/*
 * Initialize DAPI (the VM allocator), so that its services are available
 * to various endpoints. It is used both for selecting the server new VMs
 * should be placed on, and calculating spare capacity on each server.
 */

var dapiAlloc = require('dapi/lib/allocator');
var dapiValid = require('dapi/lib/validations');

var ModelVm = require('./models/vm');

var DEFAULT_WEIGHT_CURRENT_PLATFORM = 1;
var DEFAULT_WEIGHT_NEXT_REBOOT      = 0.5;
var DEFAULT_WEIGHT_NUM_OWNER_ZONES  = 0;
var DEFAULT_WEIGHT_UNIFORM_RANDOM   = 0.5;
var DEFAULT_WEIGHT_UNRESERVED_DISK  = 1;
var DEFAULT_WEIGHT_UNRESERVED_RAM   = 2;

var DEFAULT_FILTER_HEADNODE      = true;
var DEFAULT_FILTER_MIN_RESOURCES = true;
var DEFAULT_FILTER_LARGE_SERVERS = true;
var DEFAULT_DISABLE_OVERRIDE_OVERPROV = false;


function Designation() {}


Designation.init = function init(app) {
    var config = app.config.dapi;
    Designation.defaults = getDefaults(config.changeDefaults);

    var err = dapiValid.validateDefaults(Designation.defaults);
    if (err) {
        throw new Error(err);
    }

    var opts = {
        log: app.log
    };

    if (config.useVmapi) {
        opts.getVm = function getVm(vmUuid, cb) {
            ModelVm.getVmViaVmapi({ uuid: vmUuid }, cb);
        };

        opts.getServerVms = function getServerVms(serverUuid, cb) {
            var vmOpts = {
                server_uuid: serverUuid,
                predicate: {
                    and: [
                        { ne: ['state', 'destroyed'] },
                        { ne: ['state', 'failed'] },
                        // We include this one since vmapi sometimes provides
                        // nulls in some of the attributes here, which dapi
                        // is not expecting. Waitlist tickets still cover
                        // the existence of these VMs, without this problem.
                        { ne: ['state', 'provisioning'] }
                    ]
                }
            };

            ModelVm.listVmsViaVmapi(vmOpts, cb);
        };
    }

    Designation.allocator = new dapiAlloc(opts, config.allocationDescription,
                                          Designation.defaults);

    // XXX dapi currently doesn't support disabling getServerVms() per request,
    // but cnapi provides its own filled `vms` attribute when adding
    // unreserved_* attributes. When dapi does support disabling the above per
    // request, this second instance should be removed
    Designation.allocCapacity = new dapiAlloc({
        log: app.log
    }, config.allocationDescription, Designation.defaults);

    Designation.filterHeadnode = Designation.defaults.filter_headnode;
    Designation.useVmapi = config.useVmapi;
};


Designation.validations = dapiValid;


/*
 * Given a list of server and a series of constraints, return a server
 * that fulfills all requirements (if possible).
 */
Designation.allocate =
function allocate(servers, vm, img, pkg, tickets, cb) {
    Designation.allocator.allocate(servers, vm, img, pkg, tickets, cb);
};


/*
 * Adds the unreserved_ram/disk/cpu attributes to a server object, each
 * attribute indicating how much spare capacity dapi calculates a server has.
 */
Designation.addUnreservedAttr =
function addUnreservedAttr(server, cb) {
    Designation.allocator.allocCapacity.serverCapacity(server, cb);
};


/*
 * Given a server, returns how much spare capacity dapi calculates the server
 * has. This differs from addUnreservedAttr() in that it returns a separate
 * description of the spare capacity to the callback.
 */
Designation.serverCapacity =
function serverCapacity(server, cb) {
    Designation.allocator.serverCapacity(server, cb);
};


function getDefaults(changeDefaults) {
    var defaults = {};

    function setDefault(attr, deflt) {
        var opt = changeDefaults[attr];

        if (opt === '' || !opt) {
            defaults[attr] = deflt;
        } else if (opt === 'true') {
            defaults[attr] = true;
        } else if (opt === 'false') {
            defaults[attr] = false;
        } else {
            defaults[attr] = opt;
        }
    }

    setDefault('disable_override_overprovisioning',
               DEFAULT_DISABLE_OVERRIDE_OVERPROV);
    setDefault('filter_headnode',      DEFAULT_FILTER_HEADNODE);
    setDefault('filter_min_resources', DEFAULT_FILTER_MIN_RESOURCES);
    setDefault('filter_large_servers', DEFAULT_FILTER_LARGE_SERVERS);

    setDefault('weight_current_platform', DEFAULT_WEIGHT_CURRENT_PLATFORM);
    setDefault('weight_next_reboot',      DEFAULT_WEIGHT_NEXT_REBOOT);
    setDefault('weight_num_owner_zones',  DEFAULT_WEIGHT_NUM_OWNER_ZONES);
    setDefault('weight_uniform_random',   DEFAULT_WEIGHT_UNIFORM_RANDOM);
    setDefault('weight_unreserved_disk',  DEFAULT_WEIGHT_UNRESERVED_DISK);
    setDefault('weight_unreserved_ram',   DEFAULT_WEIGHT_UNRESERVED_RAM);

    setDefault('server_spread');
    setDefault('filter_vm_limit');
    setDefault('filter_docker_min_platform');
    setDefault('filter_owner_server');
    setDefault('overprovision_ratio_cpu');
    setDefault('overprovision_ratio_ram');
    setDefault('overprovision_ratio_disk');

    return defaults;
}

module.exports = Designation;