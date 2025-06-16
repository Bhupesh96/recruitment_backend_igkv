var DB_SERVICE = global.DB_SERVICE;
var CONFIG_PARAMS = global.COMMON_CONFS;
let prefix = global.apiPrefix;

let saveErrToDB = function (dbkey, errObj, apiName, sessionDetails, callback) {
    try {
        if (errObj) {
            if (errObj['errno'] != 1051) {
                let insertObj = {};
                dbkey = CONFIG_PARAMS.getCommonDBDetails();
                insertObj["err"] = JSON.stringify(errObj);
                insertObj["api_name"] = apiName;
                insertObj['user_id'] = sessionDetails['user_id'];
                insertObj["code"] = errObj["errno"] ?? errObj['code'] ?? null;
                insertObj['server_name'] = prefix;
                let qAndParam = DB_SERVICE.getInsertClauseWithParams(insertObj, 'error_table');
                DB_SERVICE.executeQueryWithParameters(dbkey, qAndParam.query, qAndParam.params, function (err, res) {
                    if (err) {
                        return callback(err);
                    }
                    else {
                        return callback(null, res);
                    }
                })
            } else {
                return callback(null)
            }
        }
        else {
            return callback(null)
        }
    } catch (e) {
        return callback(e);
    }

}
exports.saveErrToDB = saveErrToDB;