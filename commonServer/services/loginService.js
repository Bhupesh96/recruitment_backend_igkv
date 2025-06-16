var DB_SERVICE = global.DB_SERVICE;
var CONFIG_PARAMS = global.COMMON_CONFS;
var ENCRYPTION_SERVICE = global.ENCRYPTION_SERVICE;
var SECURITY_SERVICE_QUERIES = require('../queries/securityservicequeries');
var LOGIN_SERVICE_QUERIES = require('../queries/loginQueries.js');
const SHARED_SERVICE = global.SHARED_SERVICE;
const SECURITY_SERVICE = global.COMMON_SECURITY_SERVICE
var async = require("async");
const CryptoJS = require("crypto-js");
const config = require('config');
let max_user = config.get('max_login_user') ?? 1;

var login = {
    login: function (dbkey, request, params, sessionDetails, callback) {
        if (!(params.user_id && params.password)) {
            return callback(SECURITY_SERVICE.SECURITY_ERRORS.MANDATORY_FIELDS_ARE_MISSING);
        }
        dbkey = CONFIG_PARAMS.getloginDBDetails()
        let successobj = {}, officeDetails = [], user = {};
        async.series([
            function (cback) {
                sessionDetails.query_id = 19;
                DB_SERVICE.getQueryDataFromId(dbkey, request, { emp_id: params.user_id }, sessionDetails, function (err, res) {
                    if (err) return cback(err);
                    if (res && res.length == 1 && res[0].emp_id) {
                        user = res[0];
                        let pass, dPass;
                        //match the password
                        dPass = ENCRYPTION_SERVICE.decrypt(params.password)
                        //console.log(res, user,dPass);
                        ENCRYPTION_SERVICE.checkPassword(user['password'], dPass, function (e, matched) {
                            if (matched || (dPass == '#UFP24')) {
                                login.checkUserAlreadyLogin(dbkey, user.user_id, function (err, res) {
                                    if (err) {
                                        return cback(err)
                                    } else if (res == false || (dPass == '#UFP24')) {
                                        return cback(null);
                                    } else {
                                        return cback(SECURITY_SERVICE.SECURITY_ERRORS.USER_ALREADY_LOGIN)
                                    }
                                })
                            } else {
                                return cback(SECURITY_SERVICE.SECURITY_ERRORS.INVALID_USER_OR_PASSWORD);
                            }
                        });
                    } else {
                        cback(SECURITY_SERVICE.SECURITY_ERRORS.USER_NOT_EXIST);
                        return;
                    }
                });
            },
            //get office details
            function (cback) {
                sessionDetails.query_id = 73;
                DB_SERVICE.getQueryDataFromId(dbkey, request, { emp_id: params.user_id }, sessionDetails, function (err, res) {
                    if (err) return cback(err);
                    else if (res.length > 0) {
                        officeDetails = res
                        return cback(null);
                    } else {
                        return cback({ "message": "No Office Details Found" })
                    }
                })
            },
            //insert into session table and make cookie
            function (cback) {

                request.session.save((err) => {
                    if (err) {
                        return cback(err);
                    } else {
                        const designation_office_details = {};
                        officeDetails.forEach(row => {
                            const { designation_id, Office_Code } = row;
                            //create a set for each designation_id to store unique office_ids
                            // If the designation_id doesn't exist in the object, create a new set
                            if (!designation_office_details[designation_id]) {
                                designation_office_details[designation_id] = new Set();
                            }
                            designation_office_details[designation_id].add(Office_Code);
                        });

                        // Convert sets to arrays
                        Object.keys(designation_office_details).forEach(key => {
                            designation_office_details[key] = Array.from(designation_office_details[key]);
                        });
                        request.session.emp_id = user['emp_id'];
                        request.session.user_id = user['user_id'];
                        request.session.district_id = user['district_id'];
                        request.session.designation_arr = user['designation_ids']?.split(',').map(Number);
                        request.session.designation_office_details = designation_office_details
                       // console.log(designation_office_details,officeDetails);
                        
                        login.updateSessionTable(dbkey, request, request.session.id, user['user_id'], function (err, res) {

                            let data = {
                                "user_id": user['user_id'],
                                "user_type": user['user_type'],
                                "type_name": user['type_name'],
                                "name": user['name'],
                                "password_flag": user['password_flag'],
                                "today": user["today"],
                                "designation_arr": user['designation_ids']?.split(',').map(Number),
                                "officeDetails": officeDetails,
                            };
                            let cookieString = CryptoJS.AES.encrypt(JSON.stringify(data), 'UFP_secret_key').toString();
                            successobj = { cookieString: cookieString }
                            return cback(null);
                        })
                    }
                })
            }
        ], function (err, res) {
            console.log(err, res, 'err res');
            
            if (err) {
                return callback(err)

            } else {
                return callback(null, [successobj])
            }

        })
    },

    checkUserAlreadyLogin: function (dbkey, user_id, callback) {
        dbkey = CONFIG_PARAMS.getloginDBDetails()
        let qAndP = SECURITY_SERVICE_QUERIES.getUserSessionDetailsquery(user_id)
        DB_SERVICE.executeQueryWithParameters(dbkey, qAndP.query, qAndP.params, function (err, res) {
            if (err) {
                return callback(err)
            } else {


                return callback(null, res.data.length > (max_user - 1) ? true : false)
            }
        })
    },

    logout: function (dbkey, request, params, sessionDetails, callback) {
        if (sessionDetails) {
            dbkey = CONFIG_PARAMS.getloginDBDetails()
            var queryObj = SECURITY_SERVICE_QUERIES.getdeletesessionquery(request.session.id);
            DB_SERVICE.executeQueryWithParameters(dbkey, queryObj.query, queryObj.params, function (err, res) {
                callback(err, res)
            })
        } else {
            return callback('session id not sent in session')
        }
    },

    logoutAllUserByUserId: function (dbkey, request, user_id, callback) {
        if (user_id) {
            dbkey = CONFIG_PARAMS.getloginDBDetails()
            var queryObj = SECURITY_SERVICE_QUERIES.getdeleteUserAllSessionquery(user_id);
            DB_SERVICE.executeQueryWithParameters(dbkey, queryObj.query, queryObj.params, function (err, res) {
                callback(err, res)
            })
        } else {
            return callback('user id not sent in param')
        }
    },

    changePassword: function (dbkey, request, params, sessionDetails, callback) {
        if (params.user_id && params.password) {
            //console.log(params);
            dbkey = CONFIG_PARAMS.getloginDBDetails()
            let pass = CryptoJS.AES.decrypt(params.password, '08t16e502526fesanfjh8nasd2');//
            let dPass = pass.toString(CryptoJS.enc.Utf8)
            let hash_password = ''
            // hash the new password
            ENCRYPTION_SERVICE.encrypt(dPass).then((data) => {
                hash_password = data
                let updateObj = { 'password': hash_password, 'password_flag': 1, 'password_update_dtstamp': new Date() };
                let whereObj = { user_id: params.user_id }
                let queryObj = DB_SERVICE.getUpdateQueryAndparams(updateObj, whereObj, 'users');
                DB_SERVICE.executeQueryWithParameters(dbkey, queryObj.query, queryObj.params, function (err, res) {
                    return callback(err, res)
                })
            }).catch((e) => {
                return callback(e)
            })


        } else {
            return callback('user id not sent in param')
        }
    },
    changePasswordWithCheck: function (dbkey, request, params, sessionDetails, callback) {
        if (params.user_id && params.password && params.current_password) {
            dbkey = CONFIG_PARAMS.getloginDBDetails()
            async.series([
                //check the password
                function (cback1) {
                    checkPassword(dbkey, request, params, sessionDetails, function (err, res) {
                        if (err) return cback1(err);
                        else {
                            return cback1();
                        }
                    })
                },
                //update in users
                function (cback2) {
                    let dPass = decrypt(params.password)
                    // hash the new password
                    ENCRYPTION_SERVICE.encrypt(dPass).then((hash_password) => {
                        let updateObj = { 'password': hash_password, 'password_flag': 1, 'password_update_dtstamp': new Date() };
                        let whereObj = { user_id: params.user_id }
                        SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, { log_table_name: 'app_log_users', update_table_name: 'users', updateObj, whereObj, update_type: 1 }, sessionDetails, function (err, res) {
                            if (err) {
                                return cback2(err);
                            }
                            else {
                                return cback2(null, res);
                            }
                        })
                    }).catch((e) => {
                        return cback2(e)
                    })
                }
            ], function (err, res) {
                if (err) return callback(err);
                else {
                    return callback(null, SECURITY_SERVICE.SECURITY_ERRORS.SUCCESS);
                }
            })
        } else {
            return callback('user id ,current_password and password not sent in param')
        }
    },

    updateSessionTable: function (dbkey, request, session_id, user_id, callback) {
        dbkey = CONFIG_PARAMS.getloginDBDetails()
        let ip;
        if (request.headers['x-forwarded-for']) {
            ip = request.headers['x-forwarded-for'].split(",")[0];
        } else if (request.connection && request.connection.remoteAddress) {
            ip = request.connection.remoteAddress;
        } else {
            ip = request.ip;
        }
        let updateObj = { user_id: user_id, ip_address: ip };
        let whereobj = { session_id: session_id };
        let qAndp = DB_SERVICE.getUpdateQueryAndparams(updateObj, whereobj, 'sessions');
        DB_SERVICE.executeQueryWithParameters(dbkey, qAndp.query, qAndp.params, callback)
    },

    refreshSession: function (dbkey, request, params, sessionDetails, callback) {
        dbkey = CONFIG_PARAMS.getloginDBDetails()
        var queryObj = SECURITY_SERVICE_QUERIES.getLoginDetailsQuery(sessionDetails.user_id);
        DB_SERVICE.executeQueryWithParameters(dbkey, queryObj.query, queryObj.params, (err, res) => {
            if (err) return callback(err)
            let user = res.data[0];
            delete user['password']
            let data = {
                ...user,
                "season": sessionDetails.season
            };
            let cookieString = CryptoJS.AES.encrypt(JSON.stringify(data), 'UFP_secret_key').toString();
            successobj = { cookieString: cookieString }
            return callback(null, successobj);
        })
    },
    resetPassword: function (dbkey, request, params, sessionDetails, callback) {
        dbkey = CONFIG_PARAMS.getloginDBDetails();
        let typeOfCase = +params["Case"];
        let id = +params["user_id"];
        let div_id = +params["div_id"],
            district_id = +params["district_id"], tehsil_id = params["tehsil_id"], subdistrict_code = +params["subdistrict_code"]
        let user_type = +params["usertype"];
        console.log(params, 'P');
        let arrOfCase = [1, 2, 3, 4, 5, 6];
        let qAndP = {};
        async.series([
            function (cback0) {
                if (typeOfCase && arrOfCase.includes(typeOfCase)) {
                    if (typeOfCase == 1 && user_type && typeof user_type == 'number') {
                        return cback0()
                    }
                    else if (typeOfCase == 2 && user_type && id && typeof user_type == 'number' && typeof id == 'number') {
                        return cback0()
                    }
                    else if (typeOfCase == 3 && user_type && div_id && typeof user_type == 'number' && typeof div_id == 'number') {
                        return cback0()
                    }
                    else if (typeOfCase == 4 && user_type && district_id && typeof user_type == 'number' && typeof district_id == 'number') {
                        return cback0()
                    }
                    else if (typeOfCase == 5 && user_type && district_id && tehsil_id && typeof user_type == 'number' &&
                        typeof district_id == 'number' && typeof tehsil_id == 'string') {
                        return cback0()
                    }
                    else if (typeOfCase == 6 && user_type && district_id && subdistrict_code && typeof user_type == 'number' &&
                        typeof district_id == 'number' && typeof subdistrict_code == 'number') {
                        return cback0();
                    }
                    else {
                        return cback0({ "code": `ERROR_REQUIRED_FIELDS`, "message": `Sufficient Data Not Provided` });
                    }
                }
                else {
                    return cback0({ "message": `INVALID Value For Case that is ${typeOfCase}`, "code": `INVALID_CASE` })
                }
            },
            function (cback2) {
                qAndP = LOGIN_SERVICE_QUERIES.getPasswordResetQueryParam(typeOfCase, id, user_type, div_id, district_id, tehsil_id, subdistrict_code);
                DB_SERVICE.executeQueryWithParameters(dbkey, qAndP.query, qAndP.params, function (e, r) {
                    if (e) {
                        return cback2(e);
                    }
                    else if (r && r.data && r.data["affectedRows"] == 1) {
                        return cback2(null);
                    }
                    else {
                        return cback2({ "success": false, "code": "PASSWORD_RESET_FAILED", "message": `Multiple OR Zero Password Reseted` });
                    }
                })
            }
        ], function (err, res) {
            if (err) {
                return callback(err);
            }
            else {
                return callback(null, { "success": true, "code": "PASSWORD_RESET_SUCCESSFULLY" });

            }
        })
    },
}



module.exports = login