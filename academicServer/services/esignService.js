var DB_SERVICE = global.DB_SERVICE;
var securityService = global.COMMON_SECURITY_SERVICE;
const DOC_UPLOAD_SERVICE = global.DOC_UPLOAD_SERVICE;
const SHARED_SERVICE = global.SHARED_SERVICE;
var async = require('async');


let esignService = {
    dsc_esign: function (dbkey, request, params, sessionDetails, callback) {
        // query_id = 297
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },
}

module.exports = esignService;