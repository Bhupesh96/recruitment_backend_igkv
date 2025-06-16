const DB_SERVICE = global.DB_SERVICE;
const CONFIG_PARAMS = global.COMMON_CONFS;
const ENCRYPTION_SERVICE = global.ENCRYPTION_SERVICE;
const ERROR_SERVICE = global.ERROR_SERVICE;
const async = require('async')

const security = {
    DATABASE_ERRORS: {
        "ER_NO_SUCH_TABLE": {code: 1146, message: 'NO_SUCH_TABLE'},
        "ER_DUP_ENTRY": {code: 1062, message: 'DUPLICATE_ENTRY'},
    },
    SECURITY_ERRORS: {
        UNKNOWN_ERROR: {code: "sc000", message: "Some error occurred"},
        USER_NOT_EXIST: {code: "sc001", message: "Invalid User ID"},
        INVALID_USER_OR_PASSWORD: {code: "sc002", message: "Invalid Username Or Password"},
        INVALID_SESSION: {code: "sc003", message: "Invalid Session"},
        SESSION_EXPIRES: {code: "sc005", message: "Session Expires"},
        INVALID_USER_DETAILS: {code: "sc004", message: "Invalid User Details"},
        INVALID_LOGIN_DETAILS: {code: "sc0", message: "Invalid Login Id"},
        MANDATORY_FIELDS_ARE_MISSING: {code: "sc005", message: "Mandatory Fields Are Missing"},
        USER_ALREADY_EXISTS: {code: "sc006", message: "User Already Registered"},
        SUCCESS: {code: "000", message: "Successfull"},
        UNABLE_TO_CREATE_USER: {code: "sc007", message: "Unable To Create User"},
        PERMISSIONS_CANNOT_BE_SET: {code: "sc008", message: "Permissions Cannot Be Set"},
        PERMISSION_DENIED: {code: "sc009", message: "Permission Denied"},
        USER_ID_BLOCKED: {code: "sc010", message: "User is blocked"},
        USERFULLNAME_ALREADY_EXISTS: {code: "sc0011", message: "Duplicate Display Name"},
        USER_ALREADY_LOGIN: {code: 'sc012', message: "user already login"},
        SERVICE_FILE_NOT_FOUND: {code: 'sc013', message: 'service file name not found'},
        FUNCTION_NAME_NOT_FOUND: {code: 'sc014', message: 'incorrect route name'},
        SAME_PASSWORD: {code: 'sc015', message: 'new password is same as old password.'},
        WRONG_PASSWORD: {code: 'sc015', message: 'password is incorrect.'},

    },
    getSessionDetails: function (dbkey, session_id, callback) {
        dbkey = CONFIG_PARAMS.getCommonDBDetails()
        let sessionDetailQueryAndParam = {query: "select * from sessions where session_id=? ", params: [session_id]};
        DB_SERVICE.executeQueryWithParameters(dbkey, sessionDetailQueryAndParam.query, sessionDetailQueryAndParam.params, function (err, res) {
            if (err) {
                return callback(err);
            } else if (res && res.data && res.data.length === 1) {
                return callback(null, res.data[0])
            } else {
                return callback(security.SECURITY_ERRORS.INVALID_SESSION);
            }

        })
    },
    isAuthorized: function (dbkey, request, params, callback) {
        dbkey = CONFIG_PARAMS.getCommonDBDetails();
        let user = {}, ip;
        if (request.headers['x-forwarded-for']) {
            ip = request.headers['x-forwarded-for'].split(",")[0];
        } else if (request.connection && request.connection.remoteAddress) {
            ip = request.connection.remoteAddress;
        } else {
            ip = request.ip;
        }
        user["ip_address"] = ip;
        security.getSessionDetails(dbkey, request.session.id, function (err, data) {
            if (err) {
                return callback(err, false, user)
            } else {
                user = {...user, ...request.session}
                if (request.noApiPermissionRequired) return callback(null, true, user);
                security.isApiPermissioned(dbkey, request, params, user, function (err, res) {
                    //console.log('isApiPermissioned_',err,res);
                    if (err) {
                        return callback(err, false, user)
                    } else {
                        user = {...user, ...res}
                        return callback(null, true, user);
                    }
                })
            }
        })

    },
    isApiPermissioned: function (dbkey, request, params, sessionDetails, callback) {
        let apiDetails = {};
        let path = request._parsedUrl.pathname.replace(/\/$/, ''); // Remove trailing slash
        let parts = path.split('/');
        // Extract the first part (after the initial empty string from the leading '/')
        const firstPart = parts[1];  // adminApi or commonApi


        // Get the rest of the path starting from the second part
        const rest = '/' + parts.slice(2).join('/');
        let isDataFound = false;
        //  console.log('request.method',request.method);
        async.waterfall([
            // Step 1: Get API details from mas_api
            function (cb) {
                let query = `SELECT ma.api_id,ma.api_creation, ma.api_name,maq.query_id, ma.api_path, ma.api_desc, ma.api_type, "A" as access_type, ma.is_control_access 
                             FROM mas_api ma
                             LEFT JOIN map_api_query maq ON maq.api_id = ma.api_id
                             WHERE ma.api_path = '${rest}' and ma.prefix = '${firstPart}'`;
                DB_SERVICE.executeQueryWithParameters(dbkey, query, [], (err, res) => {
                    if (err) return cb(err);
                    if (res?.data?.length) {
                        apiDetails = res.data[0];
                        //console.log(apiDetails);
                        apiDetails.api_type = apiDetails.api_type == 'UPDATE' ? 'PUT' :apiDetails.api_type
                        if (apiDetails.api_type !== request.method) {
                            return cb({
                                ...security.SECURITY_ERRORS.PERMISSION_DENIED,
                                message: `invalid request method.`
                            });
                        }
                        return cb(null);
                    } else {
                        return cb({
                            ...security.SECURITY_ERRORS.PERMISSION_DENIED,
                            message: `${path} not found in mas_api`
                        });
                    }
                });
            },
            // Step 2: If API access control is enabled, check permissions
            function (cb) {
                //console.log(sessionDetails.designation_arr.includes(327));
                let designationId = request.headers['x-designation-id']
                    ? ENCRYPTION_SERVICE.decrypt(request.headers['x-designation-id'])
                    : null;
                sessionDetails['designation_id'] = +designationId;
                sessionDetails['Office_Code'] = sessionDetails.designation_office_details ? sessionDetails.designation_office_details[designationId] :null;
                if (apiDetails.is_control_access === 0 || sessionDetails['designation_id'] == 327) return cb(null); // Skip permission checks
                async.series([
                    function (cb1) {
                        if (!request.headers['x-designation-id']) return cb1(null);
                        checkApiPermissioned(dbkey, request, {rest, firstPart}, sessionDetails, (err, res) => {
                            if (err) return cb1(err);
                            else {
                                isDataFound = true;
                                Object.assign(apiDetails, res);
                                cb1(null);
                            }

                        });
                    },
                    // Continue execution regardless of above check
                    function (cb2) {
                        checkApiPermissionedExtra(dbkey, request, {rest, firstPart}, sessionDetails, (err, res) => {
                            if (err) return cb2(err);
                            else {
                                isDataFound = true;
                                Object.assign(apiDetails, res);
                                cb2(null);
                            }
                        });
                    }
                ], (err) => {
                    isDataFound ? cb(null) : cb(err)
                });
            }
        ], (err) => {
            return callback(err, apiDetails)
        });
    },
    autoApiCall: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },
    // Helper function to handle errors
    handleAuthorizationError: function (err, ispermit, sessionDetails, res) {
        if (err.code === "sc009") {
            return res.status(403).json({error: err, data: {permission: ispermit}});
        }
        return res.status(401).json({
            invalidsession: !sessionDetails?.rootuserid,
            error: err,
            data: {permission: ispermit}
        });
    },

    // Helper function to handle service response
    handleServiceResponse: function (req, err, result, funcName, sessionDetails, res, resSendCallback) {
        if (err) {
            ERROR_SERVICE.saveErrToDB(req.query.dbkey, err, funcName, sessionDetails, () => {
                err = COMMON_SECURITY_SERVICE.DATABASE_ERRORS[err.code] || err;
                security.sendErrorResponse(err, res, resSendCallback, 200);
            });
        } else {
            security.sendSuccessResponse(result, res, resSendCallback);
        }
    },

    // Helper function to send error responses
    sendErrorResponse: function (error, res, resSendCallback, status = 500) {
        if (resSendCallback) return resSendCallback(error);
        res.status(status).json({error});
    },

    // Helper function to send success responses
    sendSuccessResponse: function (data, res, resSendCallback) {
        if (resSendCallback) return resSendCallback(null, data);
        res.json({error: null, data});
    }
};

module.exports = security

// Check permissions based on designation ID
const checkApiPermissioned = function (dbkey, request, path_obj, sessionDetails, callback) {
    let designationId = request.headers['x-designation-id']
        ? ENCRYPTION_SERVICE.decrypt(request.headers['x-designation-id'])
        : null;
   // console.log(designationId,request.headers['x-designation-id']);

    if (!designationId) {
        return callback({ message: `path && x-designation-id is required in checkApiPermissioned` });
    }
    if (!(sessionDetails['designation_arr'] && (sessionDetails['designation_arr'].includes(+designationId) || sessionDetails['designation_arr'].includes(327)))) {
        return callback({ ...security.SECURITY_ERRORS.PERMISSION_DENIED, message: `${designationId} not includes in ${sessionDetails['designation_arr']} for emplyee ${sessionDetails.emp_id}` });
    }
    let { rest, firstPart } = path_obj
    let query = `SELECT m.designation_id, m.access_type,m.custom_value FROM map_designation_api m
                 INNER JOIN mas_api ma ON ma.api_id = m.api_id
                 WHERE ma.api_path = '${rest}' and ma.prefix = '${firstPart}' AND m.designation_id = ?`;

    return executePermissionCheck(dbkey, query, [designationId], callback, `${rest} not allowed for designation_id ${designationId}`);
};

// Check permissions based on employee ID
const checkApiPermissionedExtra = function (dbkey, request, path_obj, sessionDetails, callback) {
    if (!sessionDetails.emp_id) {
        return callback({ message: `path && emp_id is required in checkApiPermissionedExtra` });
    }
    let { rest, firstPart } = path_obj
    let query = `SELECT em.page_id, em.access_type, em.custom_value, ma.api_id
                 FROM extraa_map_emp_api em
                 INNER JOIN mas_api ma ON ma.api_id = em.api_id
                 WHERE ma.api_path = '${rest}' and ma.prefix = '${firstPart}' AND em.emp_id = ?`;

    return executePermissionCheck(dbkey, query, [sessionDetails.emp_id], callback, `${rest} not allowed for emp_id ${sessionDetails.emp_id}`);
};

// Helper function to execute queries and return permissions
const executePermissionCheck = function (dbkey, query, params, callback, errorMessage) {
    DB_SERVICE.executeQueryWithParameters(dbkey, query, params, (err, res) => {
        if (err) return callback(err);
        if (res?.data?.length) {
            let apiDetails = res.data[0];
            if (apiDetails.access_type === 'C' && apiDetails.custom_value) {
                apiDetails.custom_value = JSON.parse(apiDetails.custom_value);
            }
            return callback(null, apiDetails);
        }
        return callback({ ...security.SECURITY_ERRORS.PERMISSION_DENIED, message: errorMessage });
    });
};


