var async = require('async');
let masterService = { 

  
     
// add service functions here
 getDegreeProgramType: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback);
    },

     getCETExamCenter: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback);
    },

    
}
 
module.exports = masterService
