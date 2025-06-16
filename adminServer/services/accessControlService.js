var DB_SERVICE = global.DB_SERVICE;
var securityService = global.COMMON_SECURITY_SERVICE;
const DOC_UPLOAD_SERVICE = global.DOC_UPLOAD_SERVICE;
const SHARED_SERVICE = global.SHARED_SERVICE;
var async = require('async');
const { addFunction, addServer } = require('./serverCreationService')
const { permissionDetailsObjectValidation, apiDetailsObjectValidation, queryDetailsObjectValidation, moduleDetailsObjectValidation, queryOtherParameterObjectValiadation, saveComponentDetailsValidation } = require('../validators/uservalidator');
const { func } = require('joi');



let accessControl = {
    /////////////////module///////////////////
    saveModuleDetails: function (dbkey, request, params, sessionDetails, callback) {
        async.series([
            function (cback1) {
                if (!request.files) return cback1();
                params['file_name'] = params['module_name']
                DOC_UPLOAD_SERVICE.docUpload(dbkey, request, params, sessionDetails, function (err, res) {
                    if (err) {
                        return cback1(err);
                    } else if (res.file_path) {
                        params['manual'] = res.file_path;
                        return cback1()
                    }
                })
            },
            function (cback2) {
                params.table_name = 'master_module'
                return SHARED_SERVICE.validateAndInsertInTable(dbkey, request, params, sessionDetails, function (err, res) {
                    return cback2(err);
                })
            }
        ], function (err, res) {
            if (err) return callback(err);
            return callback(null, { message: 'insert successfully' })
        })
    },
    updateModuleDetails: function (dbkey, request, params, sessionDetails, callback) {
        const { error, value } = moduleDetailsObjectValidation(params, 2)
        if (error) return callback({ message: `${error.details[0].message}` });
        async.series([
            function (cback1) {
                if (!request.files) return cback1();
                params['file_name'] = params['module_name'] + '_updated_' + new Date().getTime()
                DOC_UPLOAD_SERVICE.docUpload(dbkey, request, params, sessionDetails, function (err, res) {
                    if (err) {
                        return cback1(err);
                    } else if (res.file_path) {
                        params['manual'] = res.file_path;
                        return cback1()
                    }
                })
            },
            function (cback2) {
                let whereObj = { "module_id": params.module_id };
                let updateObj = { "manual": params.manual, "module_name": params.module_name, "module_icon": params.module_icon, "short_name": params.short_name, "full_name": params.full_name, "order_no": params.order_no }
                let data = { log_table_name: 'app_log_master_module', update_table_name: "master_module", whereObj, updateObj }
                SHARED_SERVICE.insertAndUpdtOperationTranstion(dbkey, request, data, sessionDetails, function (err, res) {
                    if (err) return cback2(err);
                    return cback2();
                })
            }
        ], function (err, res) {
            if (err) return callback(err);
            return callback(null, { message: 'insert successfully' })
        })

    },
    ///////////////////////////page///////////////////////
    savePageDetails: function (dbkey, request, params, sessionDetails, callback) {

        let tranObj, tranCallback;
        async.series([
            //createTransaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                })
            },
            // insert in mas page
            function (cback1) {
                params.table_name = 'master_page'
                SHARED_SERVICE.validateAndInsertInTable(dbkey, request, params, sessionDetails, function (err, res) {
                    if (err) {
                        return cback1(err);
                    } else if (res.data && res.data['insertId']) {
                        params.page_id = res.data['insertId']
                        return cback1()
                    } else {
                        return cback1({ message: `something went wrong` });
                    }
                })
            },
            //insert into map_page_api
            function (cback2) {
                async.eachSeries(params.api_ids, function (api_id, cb) {
                    let insert_obj = { table_name: 'map_page_api', api_id, page_id: params.page_id, created_user_id: sessionDetails['user_id'], created_ip_address: sessionDetails['ip_address'] }
                    SHARED_SERVICE.validateAndInsertInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                        if (err) {
                            return cb(err);
                        } else if (res.data && res.data['affectedRows']) {
                            return cb()
                        } else {
                            return cb({ message: `something went wrong` });
                        }
                    })
                }, function (err, res) {
                    return cback2(err)
                })
            },
            //insert into map_module_page
            function (cback2) {
                async.eachSeries(params.modules, function (module_id, cb) {
                    let insert_obj = { table_name: 'map_module_page', module_id, page_id: params.page_id, created_user_id: sessionDetails['user_id'], created_ip_address: sessionDetails['ip_address'] }
                    SHARED_SERVICE.validateAndInsertInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                        if (err) {
                            return cb(err);
                        } else if (res.data && res.data['affectedRows']) {
                            return cb()
                        } else {
                            return cb({ message: `something went wrong` });
                        }
                    })
                }, function (err, res) {
                    return cback2(err)
                })
            },
            //insert into map_page_condition
            function (cback2) {
                async.eachSeries(params.conditions, function (condition_id, cb) {
                    let insert_obj = { table_name: 'map_page_condition', condition_id, page_id: params.page_id, created_user_id: sessionDetails['user_id'], created_ip_address: sessionDetails['ip_address'] }
                    SHARED_SERVICE.validateAndInsertInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                        if (err) {
                            return cb(err);
                        } else if (res.data && res.data['affectedRows']) {
                            return cb()
                        } else {
                            return cb({ message: `something went wrong` });
                        }
                    })
                }, function (err, res) {
                    return cback2(err)
                })
            }

        ], function (err, res) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function (err4) {
                    return callback(err);
                })
            }
            else {
                // console.log('test completed')
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function (err5) {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'insert sucsessfully' })
                });
            }
        })

    },
    updatePageDetails: function (dbkey, request, params, sessionDetails, callback) {
        let tranObj, tranCallback;
        async.series([
            //createTransaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                })
            },
            // update in mas api
            function (cback1) {
                params.table_name = 'master_page'
                return SHARED_SERVICE.validateAndUpdateInTable(dbkey, request, params, sessionDetails, function (err, res) {
                    if (err) { return cback1(err) }
                    else if (res && res.length > 0) {
                        return cback1()
                    }
                    else {
                        return cback1({ message: `no record updated in mas_api` })
                    }
                })
            },
            // delete from mapping page_api
            function (cback2) {
                SHARED_SERVICE.insrtAndDltOperation(dbkey, request, { delete_table_name: 'map_page_api', whereObj: { "page_id": params.page_id } }, sessionDetails, function (err, res) {
                    return cback2(err);
                })
            },
            //delete from module mapping
            function (cback2) {
                SHARED_SERVICE.insrtAndDltOperation(dbkey, request, { delete_table_name: 'map_module_page', whereObj: { "page_id": params.page_id } }, sessionDetails, function (err, res) {
                    return cback2(err);
                })
            },
            //delete from page condition mapping
            function (cback2) {
                SHARED_SERVICE.insrtAndDltOperation(dbkey, request, { delete_table_name: 'map_page_condition', whereObj: { "page_id": params.page_id } }, sessionDetails, function (err, res) {
                    return cback2(err);
                })
            },
            //insert into map_page_api
            function (cback2) {
                if (params.api_ids.length == 0) return cback2()
                let data_arr = params.api_ids.map(e => {
                    return { api_id: e, page_id: params.page_id }
                })
                let insert_obj = { table_name: 'map_page_api', data_arr }
                SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                    if (err) {
                        return cback2(err);
                    } else if (res.data && res.data['affectedRows']) {
                        return cback2()
                    } else {
                        return cback2({ message: `something went wrong` });
                    }
                })
            },
            //insert into map_module_page
            function (cback2) {
                if (params.modules.length == 0) return cback2()
                let data_arr = params.modules.map(e => {
                    return { module_id: e, page_id: params.page_id }
                })
                let insert_obj = { table_name: 'map_module_page', data_arr }
                SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                    if (err) {
                        return cback2(err);
                    } else if (res.data && res.data['affectedRows']) {
                        return cback2()
                    } else {
                        return cback2({ message: `something went wrong` });
                    }
                })
            },
            //insert into map_page_condition
            function (cback2) {
                if (params.conditions.length == 0) return cback2()
                let data_arr = params.conditions.map(e => {
                    return { condition_id: e, page_id: params.page_id }
                })
                let insert_obj = { table_name: 'map_page_condition', data_arr }
                SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                    if (err) {
                        return cback2(err);
                    } else if (res.data && res.data['affectedRows']) {
                        return cback2()
                    } else {
                        return cback2({ message: `something went wrong` });
                    }
                })
            }
        ], function (err, res) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function (err4) {
                    return callback(err);
                })
            }
            else {
                // console.log('test completed')
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function (err5) {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'update sucsessfully' })
                });
            }
        })
    },
    ////////////////////API///////////////////
    saveApiDetails: function (dbkey, request, params, sessionDetails, callback) {
        params.query_ids = params.query_ids ?? []
        const { error, value } = apiDetailsObjectValidation(params)
        if (error) return callback({ message: `${error.details[0].message}` });
        let tranObj, tranCallback, microServiceData = {};
        params.query_ids = params.query_ids ?? []
        async.series([
            function (cback) {
                let q = `select * from mas_microServices mm where mm.is_front = 0 and mm.prefix = '${params.prefix}'`
                DB_SERVICE.executeQueryWithParameters(dbkey, q, [], function (err, res) {
                    if (err) { return cback(err) }
                    else if (res.data && res.data.length == 1) {
                        microServiceData = res.data[0]
                        return cback();
                    } else {
                        return cback({ message: `no record found for prefix ${params.prefix} on backend ` })
                    }
                })
            },

            //createTransaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                })
            },
            // insert in mas api
            function (cback1) {
                let updatedPath = params.service_name.replace('Service', '');
                params.table_name = 'mas_api';
                params.api_path = `/${updatedPath}/${params.api_type.toLowerCase()}/${params.api_name}`
                params.parameters = params.parameters ? JSON.stringify(params.parameters) : '';
                SHARED_SERVICE.validateAndInsertInTable(dbkey, request, params, sessionDetails, function (err, res) {
                    if (err) {
                        return cback1(err);
                    } else if (res.data && res.data['insertId']) {
                        params.api_id = res.data['insertId']
                        return cback1()
                    } else {
                        return cback1({ message: `something went wrong` });
                    }
                })
            },
            //insert into map_api_query
            function (cback2) {
                if (params.query_ids.length == 0) return cback2()
                let data_arr = params.query_ids.map(e => {
                    return { query_id: e, api_id: params.api_id }
                })
                let insert_obj = { table_name: 'map_api_query', data_arr }
                SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                    if (err) {
                        return cback2(err);
                    } else if (res.data && res.data['affectedRows']) {
                        return cback2()
                    } else {
                        return cback2({ message: `something went wrong` });
                    }
                })

            },
            function (cback) {
                if (params.api_creation === 'A') { return cback() }
                addFunction(dbkey, request, params, sessionDetails, function (err, res) {
                    if (err) return cback(err);
                    return cback()
                })
            },
        ], function (err, res) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function (err4) {
                    return callback(err);
                })
            }
            else {
                // console.log('test completed')
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function (err5) {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'insert sucsessfully', "api_id": params.api_id, "api_path": `${microServiceData.port}/${microServiceData.prefix}` + params.api_path })
                });
            }
        })
    },

    updateApiDetails: function (dbkey, request, params, sessionDetails, callback) {
        let tranObj, tranCallback;
        if (!(params.service_name)) {
            return callback({ message: `service name is required in update` })
        }
        async.series([
            //createTransaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                })
            },
            // update in mas api
            function (cback1) {
                let updatedPath = params.service_name.replace('Service', '');
                params.api_path = `/${updatedPath}/${params.api_type.toLowerCase()}/${params.api_name}`;
                params["parameters"] = typeof params.parameters === "string" ? params.parameters : JSON.stringify(params.parameters)
                params.table_name = 'mas_api'
                return SHARED_SERVICE.validateAndUpdateInTable(dbkey, request, params, sessionDetails, function (err, res) {
                    console.log(res);
                    if (err) { return cback1(err) }
                    else if (res && res.length > 0) {
                        return cback1()
                    }
                    else {
                        return cback1({ message: `no record updated in mas_api` })
                    }
                })
            },
            // delete from mapping
            function (cback2) {
                SHARED_SERVICE.insrtAndDltOperation(dbkey, request, { delete_table_name: 'map_api_query', log_table_name: 'app_log_map_api_query', whereObj: { "api_id": params.api_id } }, sessionDetails, function (err, res) {
                    return cback2(err);
                })
            },
            //insert into map_api_query
            function (cback2) {
                if (params.query_ids.length == 0) return cback2()
                let data_arr = params.query_ids.map(e => {
                    return { query_id: e, api_id: params.api_id }
                })
                let insert_obj = { table_name: 'map_api_query', data_arr }
                SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                    if (err) {
                        return cback2(err);
                    } else if (res.data && res.data['affectedRows']) {
                        return cback2()
                    } else {
                        return cback2({ message: `something went wrong` });
                    }
                })

            },
        ], function (err, res) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function (err4) {
                    return callback(err);
                })
            }
            else {
                // console.log('test completed')
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function (err5) {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'update sucsessfully' })
                });
            }
        })
    },
    saveApiWithpermission: function (dbkey, request, params, sessionDetails, callback) {
        let tranObj, tranCallback;
        async.series([
            //createTransaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                })
            },
            // insert in mas_api
            function (cback1) {
                accessControl.saveApiDetails(dbkey, request, params, sessionDetails, function (err, res) {
                    if (err) return cback1(err);
                    if (!res.data['insertId']) return cback1({ message: `insert id not received from saveApiDetails function` });
                    params.api_id = res.data['insertId']
                    return cback1();
                })
            },
            //insert into map_designation_api
            function (cback2) {
                accessControl.mapDesignationApiDetails(dbkey, request, params, sessionDetails, function (err, res) {
                    if (err) return cback2(err);
                    return cback2();

                })
            }
        ], function (err, res) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function (err4) {
                    return callback(err);
                })
            }
            else {
                // console.log('test completed')
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function (err5) {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'insert sucsessfully' })
                });
            }
        })

    },


    //////////////////query//////////////////////
    saveQueryDetails: (dbkey, request, params, sessionDetails, callback) => {
        return processQueryDetails(dbkey, request, params, sessionDetails, callback, 1);
    },

    updateQueryDetails: (dbkey, request, params, sessionDetails, callback) => {
        return processQueryDetails(dbkey, request, params, sessionDetails, callback, 2);
    },
    ///////////////////////MENU/////////////////
    saveMenuDetails: function (dbkey, request, params, sessionDetails, callback) {
        params.table_name = 'mas_menu'
        return SHARED_SERVICE.validateAndInsertInTable(dbkey, request, params, sessionDetails, callback)
    },

    saveMenuGroup: function (dbkey, request, params, sessionDetails, callback) {

    },
    updateMenuDetails: function (dbkey, request, params, sessionDetails, callback) {
        params.table_name = 'mas_menu'
        return SHARED_SERVICE.validateAndUpdateInTable(dbkey, request, params, sessionDetails, callback)
    },
    saveMenuWithDesignationDetails: function (dbkey, request, params, sessionDetails, callback) {
        let tranObj, tranCallback;
        async.series([
            //createTransaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                })
            },
            // insert in mas menu
            function (cback1) {
                params.table_name = 'mas_menu'
                SHARED_SERVICE.validateAndInsertInTable(dbkey, request, params, sessionDetails, function (err, res) {
                    if (err) {
                        return cback1(err);
                    } else if (res.data && res.data['insertId']) {
                        params.menuCode = res.data['insertId']
                        return cback1()
                    } else {
                        return cback1({ message: `something went wrong` });
                    }
                })
            },
            //insert into map_designation_menu
            function (cback2) {
                async.eachSeries(params.designation_id, function (designation_id, cb) {
                    let insert_obj = { table_name: 'map_designation_menu', designation_id, menuCode: params.menuCode, is_active: 1, created_user_id: sessionDetails['user_id'], created_ip_address: sessionDetails['ip_address'] }
                    SHARED_SERVICE.validateAndInsertInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                        if (err) {
                            return cb(err);
                        } else if (res.data && res.data['affectedRows']) {
                            return cb()
                        } else {
                            return cb({ message: `something went wrong` });
                        }
                    })
                }, function (err, res) {
                    return cback2(err)
                })


            },
            //insert into extraa_map_emp_menu
            function (cback2) {
                async.eachSeries(params.employees, function (emp_id, cb) {
                    let insert_obj = { table_name: 'extraa_map_emp_menu', emp_id, page_id: params.page_id, is_active: 1, created_user_id: sessionDetails['user_id'], created_ip_address: sessionDetails['ip_address'] }
                    SHARED_SERVICE.validateAndInsertInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                        if (err) {
                            return cb(err);
                        } else if (res.data && res.data['affectedRows']) {
                            return cb()
                        } else {
                            return cb({ message: `something went wrong` });
                        }
                    })
                }, function (err, res) {
                    return cback2(err)
                })
            }
        ], function (err, res) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function (err4) {
                    return callback(err);
                })
            }
            else {
                // console.log('test completed')
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function (err5) {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'insert sucsessfully' })
                });
            }
        })

    },

    saveComponentDetails: function (dbkey, request, params, sessionDetails, callback) {
        const { error, value } = saveComponentDetailsValidation(params)
        if (error) return callback({ message: `${error.details[0].message}` });
        let microServiceData = {}, whereClaue = ``, component_details = [];
        if (params[0].port != "") {
            whereClaue = `and mm.port = ${params[0].port}`
        } else {
            whereClaue = `and mm.prefix = '${params[0].pathname}'`
        }
        let tranObj, tranCallback;
        async.series([
            //get pid from microService table
            function (cback1) {
                let q = `select * from mas_microServices mm where mm.is_front = 1 ${whereClaue}`
                DB_SERVICE.executeQueryWithParameters(dbkey, q, [], function (err, res) {
                    if (err) { return cback1 }
                    else if (res.data && res.data.length == 1) {
                        microServiceData = res.data[0]
                        component_details = params.map(e => {
                            return { pid: microServiceData['pid'], name: e.component, route: e.path }
                        })
                        return cback1();
                    } else {
                        return cback1({ message: `no record found for port ${params.port}` })
                    }
                })
            },
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                })
            },
            //delete previous entry
            function (cback2) {
                SHARED_SERVICE.insrtAndDltOperation(dbkey, request, { delete_table_name: 'mas_component_details', log_table_name: 'app_log_mas_component_details', whereObj: { "pid": microServiceData.pid } }, sessionDetails, function (err, res) {
                    return cback2(err);
                })
            },
            // insert 
            function (cback3) {
                let q = DB_SERVICE.getMultInsertTogetherWithParams(component_details, 'mas_component_details');
                DB_SERVICE.executeQueryWithParameters(dbkey, q.query, q.params, function (err, res) {
                    // console.log(res,q);

                    if (err) { return cback3(err) }
                    else if (res.data && res.data.affectedRows > 0) {
                        return cback3();
                    } else {
                        return cback3({ message: `no record insert in table mas_component_details ` })
                    }
                })

            }

        ], function (err, res) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function (err4) {
                    return callback(err);
                })
            }
            else {
                // console.log('test completed')
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function (err5) {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'insert sucsessfully' })
                });
            }
        })

    },
    ///////////////////////MAPPINGS/////////////////

    mapModulePageDetails: function (dbkey, request, params, sessionDetails, callback) {
        params.table_name = 'map_module_page'
        return SHARED_SERVICE.validateAndInsertInTable(dbkey, request, params, sessionDetails, callback)
    },
    mapMenuDesignationDetails: function (dbkey, request, params, sessionDetails, callback) {
        params.table_name = 'map_designation_menu'
        return SHARED_SERVICE.validateAndInsertInTable(dbkey, request, params, sessionDetails, callback)
    },
    mapDesignationApiDetails: function (dbkey, request, params, sessionDetails, callback) {
        params.table_name = 'map_designation_api'
        return SHARED_SERVICE.validateAndInsertInTable(dbkey, request, params, sessionDetails, callback)
    },
    mapModuleComponentDetails: function (dbkey, request, params, sessionDetails, callback) {
        params.table_name = 'map_module_component'
        return SHARED_SERVICE.validateAndInsertInTable(dbkey, request, params, sessionDetails, callback)
    },

    /////////////////////////////////micro services /////////////////////////
    saveMicroServiceDetails: function (dbkey, request, params, sessionDetails, callback) {
        async.series([
            function (cback1) {
                params.table_name = 'mas_microservices'
                return SHARED_SERVICE.validateAndInsertInTable(dbkey, request, params, sessionDetails, cback1)
            },
            function (cback2) {
                if (params.is_front == 1) { return cback2() }
                addServer(dbkey, request, params, sessionDetails, cback2)
            }
        ], function (err, res) {
            return callback(err, { message: 'server created' })
        }
        )

    },
    updateMicroServiceDetails: function (dbkey, request, params, sessionDetails, callback) {
        let whereObj = { "pid": params.pid };
        let updateObj = { "updated_ip_address": sessionDetails.ip_address, "updated_user_id": sessionDetails.user_id }
        updateObj = { ...updateObj, "name": params.name, "prefix": params.prefix, "port": params.port, "is_front": params.is_front }
        let data = { log_table_name: 'app_log_mas_microservices', update_table_name: "mas_microservices", whereObj, updateObj }
        return SHARED_SERVICE.insertAndUpdtOperationTranstion(dbkey, request, data, sessionDetails, callback)
    },

    deleteModuleDetails: function (dbkey, request, params, sessionDetails, callback) {
        SHARED_SERVICE.insrtAndDltOperationTranstion(dbkey, request, { delete_table_name: 'master_module', log_table_name: 'app_log_master_module', whereObj: { "module_id": params.module_id } }, sessionDetails, function (err, res) {
            if (err) {
                return callback(err);
            } else {
                return callback(null, { message: "deleted successfully." });
            }

        })

    },
    savePageGroup: function (dbkey, request, params, sessionDetails, callback) {
        params.table_name = 'master_page_group'
        return SHARED_SERVICE.validateAndInsertInTable(dbkey, request, params, sessionDetails, callback)
    },
    savePageCondition: (dbkey, request, params, sessionDetails, callback) => {
        params.table_name = 'mas_masters'
        return SHARED_SERVICE.validateAndInsertInTable(dbkey, request, params, sessionDetails, callback)
    },
    savePermission: function (dbkey, request, params, sessionDetails, callback) {
        // Logic here
        const { error, value } = permissionDetailsObjectValidation(params)
        if (error) return callback({ message: `${error.details[0].message}` });
        let tranObj, tranCallback, api_ids = [];
        const { mode, condition } = params

        function getApiQuery(page_id, master_ids) {
            return `SELECT distinct mpa.api_id FROM map_page_api mpa
INNER JOIN mas_api ma ON ma.api_id = mpa.api_id
WHERE mpa.page_id = ${page_id} AND (ma.operation IN (${master_ids.join(',')}) or ma.operation IS NULL)`
        }

        async.series([
            //get api id data from menu_code ,page_id and page_operation
            function (cback1) {
                const grouped = {};
                mode.forEach(item => {
                    if (!grouped[item.page_id]) grouped[item.page_id] = [];
                    grouped[item.page_id].push(item.master_id);
                });
                condition.forEach(item => {
                    if (!grouped[item.page_id]) grouped[item.page_id] = [];
                    grouped[item.page_id].push(item.master_id);
                });
                delete grouped['null']
                const getApiIdQueryParamArray = Object.entries(grouped).map(
                    ([page_id, master_ids]) => ({ query: getApiQuery(page_id, master_ids), param: null })
                );

                DB_SERVICE.executeMultiSelQueriesWithParameters(dbkey, getApiIdQueryParamArray, function (err, res) {
                    if (err) {
                        return cback1({ message: `in other:- ${err.sqlMessage}`, code: 'INVALID_QUERY', query: `${err.sql}` });
                    } else {
                        if (res.data && res.data.length > 0) {
                            api_ids = [...new Set(res.data.flat().map(obj => obj.api_id))];
                            // console.log(api_ids);
                            return cback1(null, api_ids)
                        } else {
                            return cback1({ message: `no record found for api id` })
                        }

                    }
                });
            },
            //createTransaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                })
            },
            // for menu mapping
            function (cback1) {
                async.eachSeries(params.mode, function (mode_data, cb) {
                    async.series([
                        //map designation menu
                        function (cback11) {
                            if (!params.designation_id.length) return cback11();
                            if (!mode_data.menuCode) return cback11();
                            let data_arr = params.designation_id.map(e => {
                                return { designation_id: e, menuCode: mode_data.menuCode, is_active: 1 }
                            })
                            let insert_obj = { table_name: 'map_designation_menu', data_arr }
                            SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                                if (err) {
                                    return cback11(err);
                                } else if (res.data && res.data['affectedRows']) {
                                    return cback11()
                                } else {
                                    return cback11({ message: `something went wrong` });
                                }
                            })

                        },
                        //map emp_menu
                        function (cback11) {
                            if (!params.employee_ids.length) return cback11();
                            if (!mode_data.menuCode) return cback11();
                            let data_arr = params.employee_ids.map(e => {
                                return { emp_id: e, menuCode: mode_data.menuCode, is_active: 1 }
                            })
                            let insert_obj = { table_name: 'extraa_map_emp_menu', data_arr }
                            SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                                if (err) {
                                    return cback11(err);
                                } else if (res.data && res.data['affectedRows']) {
                                    return cback11()
                                } else {
                                    return cback11({ message: `something went wrong` });
                                }
                            })

                        },
                    ], function (err, res) {
                        return cb(err)

                    }, function (err, res) {
                        return cb(err)

                    })
                }, function (err, res) {
                    return cback1(err)
                })
            },
            //map designation api with access control
            function (cback2) {
                if (!params.designation_id.length) return cback2();
                if (!api_ids.length) return cback2();
                const data_arr = params.designation_id.flatMap(designation_id =>
                    api_ids.map(api_id => ({ designation_id, api_id, access_type: params.parameter[0]['parameter'] }))
                );
                let insert_obj = { table_name: 'map_designation_api', data_arr }
                SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                    if (err) {
                        return cback2(err);
                    } else if (res.data && res.data['affectedRows']) {
                        return cback2()
                    } else {
                        return cback2({ message: `something went wrong` });
                    }
                })
            },
            //map emp api with access control
            function (cback12) {
                if (!params.employee_ids.length) return cback12();
                if (!api_ids.length) return cback12();
                const data_arr = params.employee_ids.flatMap(emp_id =>
                    api_ids.map(api_id => ({ emp_id, api_id, access_type: params.parameter[0]['parameter'] }))
                );
                let insert_obj = { table_name: 'extraa_map_emp_api', data_arr }
                SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                    if (err) {
                        return cback12(err);
                    } else if (res.data && res.data['affectedRows']) {
                        return cback12()
                    } else {
                        return cback12({ message: `something went wrong` });
                    }
                })
            },
            // map designation page with condition
            function (cback13) {
                if (!params.condition.length) return cback13()
                let data_arr = params.condition.map(e => {
                    return { page_id: e.page_id, conditon_id: e.condition }
                })
                let insert_obj = { table_name: 'map_page_condition', data_arr }
                SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                    if (err) {
                        return cback13(err);
                    } else if (res.data && res.data['affectedRows']) {
                        return cback13()
                    } else {
                        return cback13({ message: `something went wrong` });
                    }
                })
            }

        ], function (err, res) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function (err4) {
                    return callback(err);
                })
            }
            else {
                console.log('test completed')
                // DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function (err4) {
                //     return callback(err);
                // })

                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function (err5) {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'update sucsessfully' })
                });
            }
        })
    },
}
module.exports = accessControl

const processQueryDetails = (dbkey, request, params, sessionDetails, callback, operationType) => {
    const { error, value } = queryDetailsObjectValidation(params, operationType);
    if (error) return callback({ message: `${error.details[0].message}` });

    if (value.query_object.other && Object.keys(value.query_object.other).length > 0) {
        for (const [key, obj] of Object.entries(value.query_object.other)) {
            const { error } = queryOtherParameterObjectValiadation(obj);
            if (error) return callback({ message: `in query_object.other.${key} ${error.details[0].message}` });
        }
    }
    let excuteQueryDbkey = global.COMMON_CONFS.map_dbkey_database[value.base_database];
    if (!excuteQueryDbkey) return callback({ message: `base database ${value.base_database} is not mapped with dbkey` })
    async.series([
        //build and test the query
        function (cback1) {
            buildAndRunEachQueryOfQueryObject(excuteQueryDbkey, value.query_object, function (err, res) {
                return cback1(err)
            })
        },
        //insert or update query
        function (cback2) {
            value.query_object = JSON.stringify(value.query_object);
            if (operationType === 1) {
                // Insert operation
                return SHARED_SERVICE.validateAndInsertInTable(
                    dbkey, request, { table_name: 'mas_custom_queries', ...value }, sessionDetails, cback2
                );
            } else {
                // Update operation
                const whereObj = { query_id: value.query_id };
                const updateObj = { query_object: value.query_object, query_name: value.query_name, module_id: value.module_id, is_permission: value.is_permission };
                const data = {
                    log_table_name: 'app_log_mas_custom_queries',
                    update_table_name: "mas_custom_queries",
                    whereObj,
                    updateObj
                };
                return SHARED_SERVICE.insertAndUpdtOperationTranstion(dbkey, request, data, sessionDetails, cback2);
            }
        }
    ], function (err, res) {
        if (err) return callback(err);
        else return callback(null, res[1]);
    })


};

const buildAndRunEachQueryOfQueryObject = (dbkey, query_object, callback) => {
    let all_permission_queryObject = DB_SERVICE.buildQuery(query_object, "A");
    let sessional_permission_queryObject = DB_SERVICE.buildQuery(query_object, "S");
    let custom_queryObject = DB_SERVICE.buildQuery(query_object, "C");
    let other_queryParamArray = []
    for (const [key, obj] of Object.entries(query_object.other)) {
        other_queryParamArray.push(DB_SERVICE.buildQuery(query_object, "A", [key]));
    }
    async.parallel([
        function (cback1) {
            if (!isSelectQuery(all_permission_queryObject.query)) return cback1({ message: `update or delete query not allowed in all_permission_queryObject:- ${all_permission_queryObject.query}`, code: 'UPDATE_DELETE_QUERY' })
            DB_SERVICE.executeQueryWithParameters(dbkey, all_permission_queryObject.query, all_permission_queryObject.params, function (err, res) {
                if (err) return cback1({ message: `in all_permission_queryObject:- ${err.sqlMessage}`, code: 'INVALID_QUERY', query: `${err.sql}` });
                return cback1(null)
            })
        },
        function (cback1) {
            if (!isSelectQuery(sessional_permission_queryObject.query)) return cback1({ message: `update or delete query not allowed in sessional_permission_queryObject:- ${sessional_permission_queryObject.query}`, code: 'UPDATE_DELETE_QUERY' })
            DB_SERVICE.executeQueryWithParameters(dbkey, sessional_permission_queryObject.query, sessional_permission_queryObject.params, function (err, res) {
                if (err) return cback1({ message: `in sessional_permission_queryObject:- ${err.sqlMessage}`, code: 'INVALID_QUERY', query: `${err.sql}` });
                return cback1(null)
            })
        },
        function (cback1) {
            if (!isSelectQuery(custom_queryObject.query)) return cback1({ message: `update or delete query not allowed in custom_permission_queryObject:- ${custom_queryObject.query}`, code: 'UPDATE_DELETE_QUERY' })
            DB_SERVICE.executeQueryWithParameters(dbkey, custom_queryObject.query, custom_queryObject.params, function (err, res) {
                if (err) return cback1({ message: `in custom_permission_queryObject:- ${err.sqlMessage}`, code: 'INVALID_QUERY', query: `${err.sql}` });;
                return cback1(null)
            })
        },
        function (cback1) {
            if (other_queryParamArray.length == 0) return cback1(null);
            DB_SERVICE.executeMultiSelQueriesWithParameters(dbkey, other_queryParamArray, function (err, res) {
                if (err) {
                    return cback1({ message: `in other:- ${err.sqlMessage}`, code: 'INVALID_QUERY', query: `${err.sql}` });
                }
                return cback1(null);
            });
        }

    ], function (err, res) {
        return callback(err, res);
    })
}

function isSelectQuery(query) {
    if (!query || typeof query !== "string") return false;
    query = query.trim().toLowerCase(); // Normalize query
    // Check if it starts with 'select' or starts with 'with' followed by a 'select'
    return query.startsWith("select") || query.startsWith("with") && query.includes("select");
}




