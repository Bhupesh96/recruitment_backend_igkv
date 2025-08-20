var DB_SERVICE = global.DB_SERVICE;
const SECURITY_SERVICE = global.COMMON_SECURITY_SERVICE;
var CONFIG_PARAMS = global.COMMON_CONFS;
const config = require('config');
var joi = require('joi');
var async = require('async');


var shared = {
    //insert in app log then delete from table
    insrtAndDltOperation: function (dbkey, request, params, sessionDetails, callback) {
        if (!dbkey.connectionobj) { return callback({ message: `dbkey is required transcational on delete.` }) }
        const { value, error } = validators.deleteOprationObjectValidation(params);
        if (error) {
            return callback(`in delete opration object :- ${error.details[0].message}`);
        }
        if (params.delete_table_name == 'farmer_society') {
            return callback(`in delete opration object :- trying to delete record from farmer society.`);
        }
        let { delete_table_name, whereObj } = value
        let log_table_name = 'log_db_' + dbkey.dbkey.database + '.' + delete_table_name + '_log';  //for different database
        let found_rows = [], qAndParam = {};
        async.series([
            //get data
            function (cback1) {
                let query = `select * from ${delete_table_name}`, param = [];
                query = query + " where ";
                let count = 1;
                for (let key in whereObj) {
                    if (count != 1) {
                        query = query + " and ";
                    }
                    query = query + key + "=? ";
                    if (!whereObj[key]) {
                        return callback({ message: `in insrtAndDltOperation where obj key ${key} is undefined for update ${delete_table_name}.` });
                    }
                    param.push(whereObj[key]);
                    count++;
                }
                DB_SERVICE.executeQueryWithParameters(dbkey, query, param, function (e1, r1) {
                    if (e1) {
                        return cback1(e1);
                    }
                    else {
                        found_rows = r1.data;
                        return cback1(null);
                    }
                })
            },
            //insert into log table
            function (cback2) {
                async.eachSeries(found_rows, function (row, cb1) {
                    row["action_ip_address"] = sessionDetails["ip_address"];
                    row['action_user_id'] = sessionDetails["user_id"];
                    row['action'] = 'D';
                    row['log_type'] = 'A';

                    qAndParam = DB_SERVICE.getInsertClauseWithParams(row, log_table_name);
                    DB_SERVICE.executeQueryWithParameters(dbkey, qAndParam.query, qAndParam.params, function (err, res) {
                        if (err) {
                            return cb1(err);
                        }
                        else if (res.data["affectedRows"] == 1) {
                            return cb1()
                        }
                        else {
                            return cb1({ "message": `Insert into ${log_table_name} is failed.` })
                        }
                    })

                }, function (err, res) {
                    if (err) {
                        return cback2(err)
                    }
                    else {
                        return cback2()
                    }
                })
            },
            //delete from table   
            function (cback3) {
                qAndParam = DB_SERVICE.getDeleteQueryAndparams(whereObj, delete_table_name);
                DB_SERVICE.executeQueryWithParameters(dbkey, qAndParam.query, qAndParam.params, function (e1, r1) {
                    if (e1) {
                        return cback3(e1);
                    }
                    else if (found_rows.length == r1.data["affectedRows"]) {
                        return cback3();
                    }
                    else {
                        return cback3({ "message": `in delete, ${delete_table_name} found data length ${found_rows.length} and Deleted data length ${r1.data["affectedRows"]} is not Matched` });
                    }
                })
            },
        ], function (err, res) {
            if (err) {
                return callback(err);
            }
            else {
                return callback(null, res);
            }
        })
    },
    //insert in app log then update from table
    insrtAndUpdtOperation: function (dbkey, request, params, sessionDetails, callback) {
        if (!dbkey.connectionobj) { return callback({ message: `dbkey is required transcational on update.` }) }
        const { value, error } = validators.updateOprationObjectValidation(params);
        if (error) {
            return callback(`in update opration object :- ${error.details[0].message}`);
        }
        let { update_table_name, whereObj, updateObj } = value
        let log_table_name = 'log_db_' + dbkey.dbkey.database + '.' + update_table_name + '_log';
        let found_rows = [], qAndParam = {};
        async.series([
            //get data
            function (cback1) {
                let query = `select * from ${update_table_name}`, param = [];
                query = query + " where ";
                let count = 1;
                for (let key in whereObj) {
                    if (count != 1) {
                        query = query + " and ";
                    }
                    query = query + key + "=? ";
                    if (!whereObj[key]) {
                        return callback({ message: `in insrtAndUpdtOperation where obj key ${key} is undefined for update ${update_table_name}.` });
                    }
                    param.push(whereObj[key]);
                    count++;
                }
                DB_SERVICE.executeQueryWithParameters(dbkey, query, param, function (e1, r1) {
                    if (e1) {
                        return cback1(e1);
                    }
                    else if (r1 && r1.data) {
                        found_rows = r1.data;
                        return cback1(null);
                    }
                })
            },
            //insert into log table
            function (cback2) {
                async.eachSeries(found_rows, function (row, cb1) {
                    row["action_ip_address"] = sessionDetails["ip_address"];
                    row['action_user_id'] = sessionDetails["user_id"];
                    row['action'] = 'U';
                    row['log_type'] = 'A';
                    qAndParam = DB_SERVICE.getInsertClauseWithParams(row, log_table_name);
                    DB_SERVICE.executeQueryWithParameters(dbkey, qAndParam.query, qAndParam.params, function (err, res) {
                        if (err) {
                            return cb1(err);
                        }
                        else if (res.data["affectedRows"] == 1) {
                            return cb1()
                        }
                        else {
                            return cb1({ "message": `Insert into ${log_table_name} is failed.` })
                        }
                    })
                }, function (err, res) {
                    if (err) {
                        return cback2(err)
                    }
                    else {
                        return cback2()
                    }
                })
            },
            //update table   
            function (cback3) {
                qAndParam = DB_SERVICE.getUpdateQueryAndparams(updateObj, whereObj, update_table_name);
                DB_SERVICE.executeQueryWithParameters(dbkey, qAndParam.query, qAndParam.params, function (e1, r1) {
                    if (e1) {
                        return cback3(e1);
                    }
                    else if (found_rows.length == r1.data["affectedRows"]) {
                        return cback3();
                    }
                    else {
                        return cback3({ "message": `in update, ${update_table_name} found data length ${found_rows.length} and updated data length ${r1.data["affectedRows"]} is not Matched` });
                    }
                })
            },
        ], function (err, res) {
            if (err) {
                return callback(err);
            }
            else {
                return callback(null, found_rows);
            }
        })
    },

    insertAndUpdtOperationTranstion: function (dbkey, request, params, sessionDetails, callback) {
        if (dbkey.connectionobj) { return callback({ message: `dbkey is transcational no need to use transaction function. please use another method that accept transtional dbkey` }) }
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
            // insert in log table 
            function (cback1) {
                shared.insrtAndUpdtOperation(dbkey, request, params, sessionDetails, function (err, res) {
                    if (err) return cback1(err);
                    else if (res.length > 0) {
                        return cback1()
                    } else {
                        return cback1({ message: `no record updated in ${params.log_table_name}` })
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
                    return callback(null, { ...SECURITY_SERVICE.SECURITY_ERRORS.SUCCESS, message: 'update sucsessfully' })
                });
            }
        })
    },
    insrtAndDltOperationTranstion: function (dbkey, request, params, sessionDetails, callback) {
        if (dbkey.connectionobj) { return callback({ message: `dbkey is transcational no need to use transaction function. please use another method that accept transtional dbkey` }) }
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
            // insert in log table 
            function (cback1) {
                shared.insrtAndDltOperation(dbkey, request, params, sessionDetails, function (err, res) {
                    if (err) return cback1(err);
                    else if (res.length > 0) {
                        return cback1()
                    } else {
                        return cback1({ message: `no record updated in ${params.log_table_name}` })
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
                    return callback(null, { ...SECURITY_SERVICE.SECURITY_ERRORS.SUCCESS, message: 'update sucsessfully' })
                });
            }
        })
    },

    generateJoiValidatorFromTable: function (params, callback) {
        let { database_name = config.get('common_db.database'), type = 'insert', table_name } = params
        let query = `SELECT COLUMN_NAME,COLUMN_KEY, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, NUMERIC_PRECISION, NUMERIC_SCALE,EXTRA
                            FROM INFORMATION_SCHEMA.COLUMNS
                            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?;`
        DB_SERVICE.executeQueryWithParameters(CONFIG_PARAMS.getWorkingDBDetails(), query, [database_name, table_name], function (e1, r1) {
            if (e1) {
                return callback(e1);
            }
            else if (r1.data && r1.data.length > 0) {
                let meta_details = [...r1.data]
                // console.log(meta_details);
                let schema = type == 'update' ? generateJoiValidator_update(meta_details) : generateJoiValidator(meta_details);
                return callback(null, { schema, primary_key_arr: meta_details.filter(e => e.COLUMN_KEY == 'PRI').map(e => e.COLUMN_NAME) });
            } else {
                return callback({ measge: `no data found for database_name ${database_name} and  TABLE_NAME ${table_name}` })
            }
        })
    },
    validateAndInsertInTable: function (dbkey, request, params, sessionDetails, callback) {
        if (!(params.table_name)) {
            return callback({ ...SECURITY_SERVICE.SECURITY_ERRORS.MANDATORY_FIELDS_ARE_MISSING, message: `table_name is required in validateAndInsertInTable function.` });
        }
        const { table_name, database_name = dbkey.database ?? dbkey.dbkey.database } = params
        params.created_user_id = sessionDetails["emp_id"];
        params.created_ip_address = sessionDetails["ip_address"];
        shared.generateJoiValidatorFromTable({ table_name, database_name }, function (err, res) {
            if (err) return callback(err);
            const { value, error } = validators.validateSchema(res['schema'], params);
            if (error) return callback(error);
            let qAndP = DB_SERVICE.getInsertClauseWithParams(value, table_name);
            DB_SERVICE.executeQueryWithParameters(dbkey, qAndP.query, qAndP.params, function (e1, r1) {
                if (r1 && r1.data) {
                    return callback(null, { ...SECURITY_SERVICE.SECURITY_ERRORS.SUCCESS, message: 'insert sucsessfully', data: r1.data })
                } else {
                    return callback(e1);
                }
            })
        })
    },
    validateAndInsertArrInTable: function (dbkey, request, params, sessionDetails, callback) {
        if (!(params.table_name && params.data_arr)) {
            return callback({ ...SECURITY_SERVICE.SECURITY_ERRORS.MANDATORY_FIELDS_ARE_MISSING, message: `table_name is required in validateAndInsertArrInTable function.` });
        }
        const { table_name, database_name = dbkey.database ??dbkey.dbkey.database, data_arr } = params
        if (data_arr.length == 0) return callback({ ...SECURITY_SERVICE.SECURITY_ERRORS.MANDATORY_FIELDS_ARE_MISSING, message: `data_arr is empty in validateAndInsertArrInTable function.` });
        const insert_arr = data_arr.map(obj => ({
            ...obj,
            created_user_id: sessionDetails["emp_id"],
            created_ip_address: sessionDetails["ip_address"]
        }));
        shared.generateJoiValidatorFromTable({ table_name, database_name }, function (err, validator) {
            if (err) return callback(err);
            let { error, value } = shared.arrayOfObjectsValidation(validator['schema'], insert_arr);
            if (error) {
                return callback({ message: error.details[0].message });
            }
            let q = DB_SERVICE.getMultInsertTogetherWithParams(value, params.table_name);
            DB_SERVICE.executeQueryWithParameters(dbkey, q.query, q.params, function (err, res) {
                if (err) { return callback(err) }
                else if (res.data && res.data.affectedRows == data_arr.length) {
                    return callback(null, { ...SECURITY_SERVICE.SECURITY_ERRORS.SUCCESS, message: 'insert sucsessfully', data: res.data })
                } else {
                    return callback({ message: `no record insert in table ${params.table_name} ` })
                }
            })
        })
    },
    validateAndUpdateInTable: function (dbkey, request, params, sessionDetails, callback) {
        if (!(params.table_name)) {
            return callback({ ...SECURITY_SERVICE.SECURITY_ERRORS.MANDATORY_FIELDS_ARE_MISSING, message: `table_name is required in validateAndInsertInTable function.` });
        }
        const { table_name, database_name = dbkey.database ??dbkey.dbkey.database } = params
        params.updated_user_id = sessionDetails["emp_id"];
        params.updated_ip_address = sessionDetails["ip_address"];
        shared.generateJoiValidatorFromTable({ table_name, database_name, type: 'update' }, function (err, validator) {
            if (err) return callback(err);
            if (validator['primary_key_arr'] && validator['primary_key_arr'].length == 0) {
                return callback({ message: `no primary key found in table ${params.table_name} ` })
            }
            let { error, value } = validator['schema'].validate(params, { abortEarly: false });

            if (error) {
                return callback({ message: error.details[0].message });
            }
            let whereObj = {};
            let updateObj = {};
            for (let key in value) {
                if (validator.primary_key_arr.includes(key)) {
                    whereObj[key] = value[key];
                } else {
                    updateObj[key] = value[key];
                }
            }
            let data = { log_table_name: `app_log_${params.table_name}`, update_table_name: params.table_name, whereObj, updateObj }
            if (dbkey.connectionobj) {
                return SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, data, sessionDetails, callback);
            } else {
                return SHARED_SERVICE.insertAndUpdtOperationTranstion(dbkey, request, data, sessionDetails, callback);
            }

        })
    },
    generateAndValidateSchema: function (params, callback) {
        shared.generateJoiValidatorFromTable(params, function (err, res) {
            if (err) return callback(err);
            const { value, error } = validators.validateSchema(res['schema'], params);
            if (error) return callback(error);
            return callback(null, { value })
        })
    },
    arrayOfObjectsValidation: (Joi_schema, array) => {
        const schema = joi.array().items(Joi_schema).required().options({ stripUnknown: true });
        return schema.validate(array);
    },
}
module.exports = shared

let validators = {
    validateSchema: function (schema, reqBody) {
        return schema.validate(reqBody);
    },
    deleteOprationObjectValidation: function (reqBody) {
        let schema = joi.object({
            "delete_table_name": joi.string().required(),
            "whereObj": joi.object().min(1).required()
        }).unknown(true);
        return schema.validate(reqBody, { allowUnknown: true });
    },
    updateOprationObjectValidation: function (reqBody) {
        let schema = joi.object({
            "update_table_name": joi.string().required(),
            "whereObj": joi.object().min(1).required(),
            "updateObj": joi.object().min(1).required()
        }).unknown(true);
        return schema.validate(reqBody, { allowUnknown: true });
    },
    insertComponentObjectValidation: function (reqBody) {
        let schema = joi.object({
            "c_name": joi.string().required(),
            "c_description": joi.string().required(),
            "user_id": joi.number().required(),
            "ip_address": joi.string().required()
        }).options({ stripUnknown: true });
        return schema.validate(reqBody, { allowUnknown: true });
    },

}

function generateJoiValidator(queryResult) {
    const schema = {};

    queryResult.forEach(column => {
        const columnName = column.COLUMN_NAME;
        const columnKey = column.COLUMN_KEY;
        const extra = column.EXTRA;
        const dataType = column.DATA_TYPE.toLowerCase();
        const isNullable = column.IS_NULLABLE === 'YES';
        const columnDefault = column.COLUMN_DEFAULT === 'NULL' ? null : column.COLUMN_DEFAULT;
        const length = column.CHARACTER_MAXIMUM_LENGTH || column.NUMERIC_PRECISION || null; // Get length if applicable
        let joiValidator = null;

        // Handle data types and create corresponding Joi validators
        switch (dataType) {
            case 'varchar':
            case 'char':
            case 'text':
            case 'string':
                joiValidator = joi.string();
                break;
            case 'int':
            case 'tinyint':
            case 'smallint':
            case 'mediumint':
            case 'bigint':
                joiValidator = joi.number().integer();
                break;
            case 'decimal':
            case 'float':
            case 'double':
                joiValidator = joi.number();
                break;
            case 'date':
            case 'datetime':
            case 'timestamp':
                joiValidator = joi.date();
                if (columnDefault === 'current_timestamp()') {
                    joiValidator = joiValidator.default(() => new Date());
                }
                break;
            case 'boolean':
            case 'bool':
                joiValidator = joi.boolean();
                break;
            default:
                joiValidator = joi.any();  // Catch-all for any unhandled data types
        }
        // If there is a default value, add the `default()` option
        // if (columnDefault && columnDefault !== 'current_timestamp()') {
        //     joiValidator = joiValidator.default(columnDefault);
        // }
        // If the column is not nullable, make it required
        if (!isNullable) {
            if (!columnDefault) {// If no default value is provided, make it required
                //if column key is 'PRI' and exta is 'auto_increment' then make it optional
                if (columnKey == 'PRI' && extra == 'auto_increment') {
                    joiValidator = joiValidator.optional();
                } else {
                    joiValidator = joiValidator.required();
                }

                //  joiValidator = joiValidator.required();
            }
        } else {
            // If nullable, allow null
            joiValidator = joiValidator.allow(null);
        }
        // Add the column validator to the schema
        schema[columnName] = joiValidator;
    });

    // Return the schema object with stripunknow set to true
    return joi.object(schema).options({ stripUnknown: true });
}

function generateJoiValidator_update(queryResult) {
    const schema = {};

    queryResult.forEach(column => {
        const columnName = column.COLUMN_NAME;
        const columnKey = column.COLUMN_KEY;
        const extra = column.EXTRA;
        const dataType = column.DATA_TYPE.toLowerCase();
        const isNullable = column.IS_NULLABLE === 'YES';
        const columnDefault = column.COLUMN_DEFAULT === 'NULL' ? null : column.COLUMN_DEFAULT;
        const length = column.CHARACTER_MAXIMUM_LENGTH || column.NUMERIC_PRECISION || null; // Get length if applicable
        let joiValidator = null;

        // Handle data types and create corresponding Joi validators
        switch (dataType) {
            case 'varchar':
            case 'char':
            case 'text':
            case 'string':
                joiValidator = joi.string();
                break;
            case 'int':
            case 'tinyint':
            case 'smallint':
            case 'mediumint':
            case 'bigint':
                joiValidator = joi.number().integer();
                break;
            case 'decimal':
            case 'float':
            case 'double':
                joiValidator = joi.number();
                break;
            case 'date':
            case 'datetime':
            case 'timestamp':
                joiValidator = joi.date();
                break;
            case 'boolean':
            case 'bool':
                joiValidator = joi.boolean();
                break;
            default:
                joiValidator = joi.any();  // Catch-all for any unhandled data types
        }
        //if column key is 'PRI' 
        if (columnKey == 'PRI') {
            joiValidator = joiValidator.required();
        } else {
            joiValidator = joiValidator.optional();
        }
        if (isNullable) joiValidator = joiValidator.allow(null);

        // Add the column validator to the schema
        schema[columnName] = joiValidator;
    });
    // Return the schema object with stripunknow set to true
    return joi.object(schema).options({ stripUnknown: true });
}

