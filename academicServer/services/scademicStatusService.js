DB_SERVICE = global.DB_SERVICE;
var securityService = global.COMMON_SECURITY_SERVICE;
const DOC_UPLOAD_SERVICE = global.DOC_UPLOAD_SERVICE;
const SHARED_SERVICE = global.SHARED_SERVICE;
var async = require('async');
let format = require('date-format');
const { log } = require('handlebars');
const path = require("path");
const fs = require("fs");


let acStatus = {
        getStudentListforPromoteEvenSem: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },
}  

module.exports = acStatus