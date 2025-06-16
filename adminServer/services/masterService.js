var async = require('async');
const { mapMasterTablesObjectValidation, arrayOfObjectsValidation } = require('../validators/uservalidator')
let masterService = {
    // add service functions here
    insertMasterRecord: function (dbkey, request, params, sessionDetails, callback) {
        if (!(params.database_id)) {
            return callback({ message: `database_id is is required in params` });
        }
        let excuteQueryDbkey = global.COMMON_CONFS.map_dbkey_database[params.database_id];
        if (!excuteQueryDbkey) return callback({ message: `base database ${params.database_id} is not mapped with dbkey` });
        params.database_name = excuteQueryDbkey.database;
        SHARED_SERVICE.validateAndInsertInTable(excuteQueryDbkey, request, params, sessionDetails, function (err, res) {
            if (err) {
                return callback(err);
            } else if (res.data && res.data['affectedRows']) {
                return callback(null, { message: `Record inserted successfully`, data: params });
            } else {
                return callback({ message: `something went wrong` });
            }
        })
    },

    updateMasterRecords: function (dbkey, request, params, sessionDetails, callback) {
        if (!(params.database_id)) {
            return callback({ message: `database_id is is required in params` });
        }
        let excuteQueryDbkey = global.COMMON_CONFS.map_dbkey_database[params.database_id];
        if (!excuteQueryDbkey) return callback({ message: `base database ${params.database_id} is not mapped with dbkey` })
        params.database_name = excuteQueryDbkey.database;
        return SHARED_SERVICE.validateAndUpdateInTable(excuteQueryDbkey, request, params, sessionDetails, callback)
    },

    mapMasterTables: function (dbkey, request, params, sessionDetails, callback) {
        const { error } = mapMasterTablesObjectValidation(params);
        if (error) {
            return callback({ message: error.details[0].message });
        }
        let excuteQueryDbkey = global.COMMON_CONFS.map_dbkey_database[params.db_id];
        if (!excuteQueryDbkey) return callback({ message: `database ${params.db_id} is not mapped with dbkey` });
        params.database_name = excuteQueryDbkey.database;
        SHARED_SERVICE.generateJoiValidatorFromTable({ table_name: params.table_name, database_name: params.database_name }, function (err, validator) {
            if (err) return callback(err);
            let { error, value } = arrayOfObjectsValidation(validator['schema'], params.map_array);
            if (error) {
                return callback({ message: error.details[0].message });
            }
            let q = DB_SERVICE.getMultInsertTogetherWithParams(value, params.table_name);
            DB_SERVICE.executeQueryWithParameters(excuteQueryDbkey, q.query, q.params, function (err, res) {
                if (err) { return callback(err) }
                else if (res.data && res.data.affectedRows > 0) {
                    return callback(null, { message: `Record inserted successfully` });
                } else {
                    return callback({ message: `no record insert in table ${params.table_name} ` })
                }
            })
        })
    },
}
module.exports = masterService
