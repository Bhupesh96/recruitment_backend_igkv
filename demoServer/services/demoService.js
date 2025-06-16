var async = require('async');

let demo = {
    getDistrictDetails: function (dbkey, request, params, sessionDetails, callback) {
        sessionDetails.query_id = 44
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    getTehsilDetails: function (dbkey, request, params, sessionDetails, callback) {
        sessionDetails.query_id = 46
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },
    getVillageDetails: function (dbkey, request, params, sessionDetails, callback) {
        sessionDetails.query_id = 47
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },
}




module.exports = demo
