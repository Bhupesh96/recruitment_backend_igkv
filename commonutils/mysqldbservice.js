
var mysql = require('mysql');
var CONFIG_PARAMS = global.COMMON_CONFS;
var async = require('async');


var executeQueryWithParameters = function (dbkey, query, params, callback, dbconnection) {
    getConnection(dbkey, function (error, client, done) {
        if (error) {
            callback(error);
            return;
        }
        if (params && params.length > 0) {
            for (var i = params.length; i > 0; i--) {
                query = query.split("$" + i).join("?");
            }
        }
        var timehandle = gettimehandle(query, params);

        client.query(query, params, function (err, results, fields) {
            cleartimehandle(timehandle, query, params);
            done(client);
            if (err) {
                callback(err);
                try {
                    // console.log(query);
                    // console.log(JSON.stringify(params));
                } catch (e) { }

                console.error('error running query', err);
                return;
            }
            else {
                // // console.log(query, params);
                var r = {};
                r.data = results;
                callback(null, r);
            }
        });
    }, dbconnection);
};

var getConnection = function (dbkey, callback, dbconnection) {
    var connectionParams = dbkey;
    var connection;
    if (dbkey && dbkey.connectionobj) {
        connection = dbkey.connectionobj;
        callback(null, connection, function () { });
        return;
    }
    if (dbconnection) {
        connectionParams = dbconnection;
    }

    if (!connectionParams) {
        callback("NO VALID DBKEY PASSED");
        return;
    }
    if (connectionParams.dbname && !connectionParams.database) {
        connectionParams.database = connectionParams.dbname;
    }
    connectionParams.multipleStatements = true;


    var commonDbDetails = CONFIG_PARAMS.getCommonDBDetails();
    if (!connectionParams.user) {
        connectionParams.user = commonDbDetails.user;
    }
    if (!connectionParams.password) {
        connectionParams.password = commonDbDetails.password;
    }

    connection = mysql.createConnection(connectionParams);
    /*{
     host     : 'localhost',
     user     : 'me',
     password : 'secret',
     database : 'my_db'
     }*/
    connection.connect(function (err) {
        if (err) {
            //console.error('error connecting: ' + err.stack);
            callback(err, connection, function (connection) {

                try {
                    //// console.log("closing connection "+connection.threadId);

                    connection.end();

                } catch (e) {
                    // // console.log("unable to end connection");
                }
            });
            return;
        }
        callback(null, connection, function (connection) {

            try {
                // console.log("closing connection " + connection.threadId);

                connection.end();

            } catch (e) {
                //// console.log("unable to end connection");
            }
        });

        //// console.log('connected as id ' + connection.threadId);
    });
};


var createTransaction = function (dbkey, callback) {
    // console.log('createTransaction');
    getConnection(dbkey, function (error, connection, done) {
        if (error) {
            callback(error);
            return;
        }
        connection.beginTransaction(function (err) {
            if (err) { callback(err); return; }
            else {
                callback(null, connection, done);
            }
        });
    });
}


var commitTransaction = function (connection, pgClientDone, callback) {
    // console.log('commitTransaction');
    connection.commit(function (err) {
        if (err) {
            connection.rollback(function () {
                pgClientDone(connection);
                callback();
            });
        } else {
            pgClientDone(connection);
            callback();
        }
    });
};

var rollbackTransaction = function (connection, pgClientDone, callback) {
    // console.log('rollbackTransaction');
    if (connection) {
        connection.rollback(function () {
            pgClientDone(connection);
            callback();
        });
    } else {
        // console.log("NOTHING TO ROLLBACK");
        callback();
    }
}
// THIS FUNCTION WILL BE USED ONLY WHEN WE NEED TO RUN MULTIPLE WRITE QUERIES IN A SINGLE TRANSACTION
var executeQueriesWithParameters = function (dbkey, queryParamsObjectArr, callback, inSingleStatement) {
    // console.log('executeQueriesWithParameters');
    // // console.log('queryParamsObjectArr:', queryParamsObjectArr);
    var pgClient;
    var pgClientDone = function () { };
    async.series([function (cback) {
        //get postgres connection and create transaction

        createTransaction(dbkey, function (err, client, done) {
            if (err) {
                // console.log(err);
                cback(err);
            } else {
                pgClientDone = done;
                pgClient = client;
                cback(null);
            }
        });

    },
    function (cback) {
        executeQueriesByTransactionObj(queryParamsObjectArr, pgClient, function (error) {
            if (error) {
                cback(error);
                return;
            }
            cback();
        })
    }],
        function (err3) {
            if (err3) {
                // console.log(err3);
                rollbackTransaction(pgClient, pgClientDone, function (err4) {
                    callback(err3)
                })
            } else {
                commitTransaction(pgClient, pgClientDone, function (err5) {
                    callback(err5, "Success");
                });
            }
        }
    );
}

// THIS FUNCTION WILL BE USED ONLY WHEN WE NEED TO RUN MULTIPLE SELECT QUERIES IN ONE GO
var executeMultiSelQueriesWithParameters = function (dbkey, queryParamsObjectArr, callback, inSingleStatement) {
    // console.log('executeMultiSelQueriesWithParameters');
    var finalQuery = "";
    var finalParams = [];
    var finalQueries = [];

    queryParamsObjectArr.forEach(function (qAndPObj) {
        finalQueries.push(qAndPObj.query);
        finalParams = finalParams.concat(qAndPObj.params);
    })

    finalQuery = finalQueries.join(";");
    finalQuery += ";";

    executeQueryWithParameters(dbkey, finalQuery, finalParams, callback, null);

}

var executeQueriesByTransactionObj = function (queryParamsObjectArr, pgClient, cback) {
    // console.log('executeQueriesByTransactionObj');

    // // console.log('queryParamsObjectArr:', queryParamsObjectArr);
    var newQueryParamsObjectArr = [];
    var singleQuery = "";
    var singleParams = [];
    var MAX_QUERY_IN_ONE_GO = 500;
    if (queryParamsObjectArr && queryParamsObjectArr.length > 0) {
        var index = 0;
        queryParamsObjectArr.forEach(function (qp) {
            index++;

            var query = qp.query;
            var queryParam = qp.params;
            if (queryParam && queryParam.length > 0 && query.indexOf("$") >= 0) {
                for (var i = queryParam.length; i >= 1; i--) {
                    query = query.split("$" + i).join("?");
                }
            }

            singleQuery += query + "; ";
            if (queryParam && queryParam.length > 0) {
                singleParams = singleParams.concat(queryParam);
            }

            if (index >= MAX_QUERY_IN_ONE_GO) {
                index = 0;
                newQueryParamsObjectArr.push({ query: singleQuery, params: singleParams });
                singleQuery = "";
                singleParams = [];
            }

        });
    }
    if (singleQuery && singleQuery.length > 0) {
        newQueryParamsObjectArr.push({ query: singleQuery, params: singleParams });
        singleQuery = null;
        singleParams = null;
    }
    queryParamsObjectArr = newQueryParamsObjectArr;
    if (queryParamsObjectArr && queryParamsObjectArr.length > 0) {

        async.eachSeries(queryParamsObjectArr, function (qp, citemback) {
            var query = qp.query;
            var queryParam = qp.params;
            var timehandle = gettimehandle(query, queryParam);
            pgClient.query(query, queryParam, function (err1, res1, fields) {
                cleartimehandle(timehandle, query, queryParam);
                if (err1) {
                    try {
                        // console.log(query);
                        // console.log(JSON.stringify(queryParam));
                    } catch (e) { }
                    // console.log(err1);
                    citemback(err1);
                } else {
                    citemback(null);
                }
            });


        }, function (err2) {
            if (err2) {
                // console.log(err2);
                cback(err2);
            } else {

                cback(null);
            }
        });
    } else {
        cback(null);
    }
}

// This function will return the count as total_entries as a additional column to limited rows
// do not use parameter in order by and limit clause
var executeCountQueryWithParams = function (dbkey, queryObject, callback) {
    // console.log('executeCountQueryWithParams');

    var query = queryObject.qselect + queryObject.qfrom + (queryObject.groupby ? queryObject.groupby : '') + queryObject.qorder + queryObject.qlimit;
    var params = queryObject.params;

    var countQuery = "select count(1) as total_entries " + queryObject.qfrom;
    var countParams = (queryObject.countparams) ? queryObject.countparams : queryObject.params;
    if (queryObject.groupby) {
        countQuery = "select count(1) as total_entries " + " from (" + queryObject.qselect + queryObject.qfrom + queryObject.groupby + " ) as temp";
    }
    var finalResult = { data: [] };
    async.series([function (cback) {
        //execute select query with limit
        var timehandle = gettimehandle(query, params);
        executeQueryWithParameters(dbkey, query, params, function (err, res1) {
            cleartimehandle(timehandle, query, params);
            if (err) {
                try {
                    // console.log(query);
                    // console.log(JSON.stringify(params));
                } catch (e) { }

                cback(err);
            } else {
                if (res1 && res1.data && res1.data.length > 0) {
                    finalResult.data = res1.data;
                }
                cback(null);
            }
        });

    }, function (cback) {
        //execute count query
        executeQueryWithParameters(dbkey, countQuery, countParams, function (err, res2) {
            if (err) {
                try {
                    // console.log(countQuery);
                    // console.log(JSON.stringify(countParams));
                } catch (e) { }

                cback(err);
            } else {
                if (res2 && res2.data && res2.data.length > 0) {
                    var o = res2.data[0].total_entries;
                    if (finalResult && finalResult.data && finalResult.data.length > 0) {
                        finalResult.data.forEach(function (r) {
                            r.total_entries = o;
                        })
                    }
                }
                cback(null);
            }
        });

    }],

        function (err3) {
            callback(err3, finalResult);
        }
    );
}

var getInsertClauseWithParams = function (obj, tablename) {
    // console.log('getInsertClauseWithParams');
    var params = [];

    var columnlist = "";
    var parameterlist = "";
    var count = 1;
    for (var key in obj) {
        if (count != 1) {
            columnlist = columnlist + ", ";
            parameterlist = parameterlist + ", ";
        }
        columnlist = columnlist + key + " ";
        parameterlist = parameterlist + "$" + count + " ";

        params.push(obj[key]);
        count++;
    }

    var query = " insert into " + tablename + " (" + columnlist + ") values (" + parameterlist + ") ";

    return { query: query, params: params };
}

var getInsertClauseValuesOnlyWithParams = function (obj, tablename) {
    // console.log('getInsertClauseValuesOnlyWithParams');
    var params = [];

    //var columnlist="";
    var parameterlist = "";
    var count = 1;
    for (var key in obj) {
        if (count != 1) {
            //      columnlist = columnlist+", ";
            parameterlist = parameterlist + ", ";
        }
        //columnlist=columnlist+key+" ";
        parameterlist = parameterlist + "$" + count + " ";

        params.push(obj[key]);
        count++;
    }

    var query = " (" + parameterlist + ") ";

    return { query: query, params: params };
}

var getInsertClauseMultiStatementOnlyWithParams = function (obj, tablename) {

    // console.log('getInsertClauseMultiStatementOnlyWithParams');
    var columnlist = "";
    var count = 1;
    for (var key in obj) {
        if (count != 1) {
            columnlist = columnlist + ", ";
        }
        columnlist = columnlist + key + " ";
        count++;
    }

    var query = " insert into " + tablename + " (" + columnlist + ") values  ";

    return { query: query, params: [] };
}

var getMultInsertTogetherWithParams = function (objArr, tablename) {
    // console.log('getMultInsertTogetherWithParams');
    if (!objArr || objArr.length <= 0) {
        return;
    }

    var firstObj = objArr[0];
    var insertStatement = getInsertClauseMultiStatementOnlyWithParams(firstObj, tablename).query;

    var valuesArr = [];
    var finalParams = [];
    objArr.forEach(function (obj) {
        var qAndP = getInsertClauseValuesOnlyWithParams(obj, tablename);
        valuesArr.push(qAndP.query);
        finalParams = finalParams.concat(qAndP.params);
    });

    var finalValuesStatement = valuesArr.join(",");

    return { query: insertStatement + finalValuesStatement, params: finalParams };

}

var getUpdateQueryAndparams = function (obj, whereobj, tablename) {
    // console.log('getUpdateQueryAndparams');

    var query = " update " + tablename + " set ";
    var params = [];

    var count = 1;
    for (var key in obj) {
        if (count != 1) {
            query = query + ", ";
        }
        query = query + key + "=$" + count + " ";
        params.push(obj[key]);
        count++;
    }

    if (!whereobj) {
        return { query: query, params: params };
    }

    query = query + " where ";

    var count1 = 1;
    for (var key in whereobj) {
        if (count1 != 1) {
            query = query + " and ";
        }
        query = query + key + "=$" + count + " ";
        params.push(whereobj[key]);
        count++;
        count1++;
    }

    return { query: query, params: params };
}

var getDeleteQueryAndparams = function (whereobj, tablename) {
    // console.log('getDeleteQueryAndparams');
    var query = " delete from  " + tablename;
    var params = [];
    if (!whereobj) {
        return "ERROR";
    }
    query = query + " where ";
    var count1 = 1;
    for (var key in whereobj) {
        if (count1 != 1) {
            query = query + " and ";
        }
        query = query + key + "=? ";
        params.push(whereobj[key]);
        count1++;
    }

    return { query: query, params: params };
}
module.exports.getDeleteQueryAndparams = getDeleteQueryAndparams;
var executeQueryWithParametersandDbObj = function (dbobj, query, params, callback, dbconnection) {
    getConnectiontoDbObj(dbobj, function (error, client, done) {
        if (error) {
            callback(error);
            return;
        }
        if (params && params.length > 0) {
            for (var i = params.length; i > 0; i--) {
                query = query.split("$" + i).join("?");
            }
        }
        var timehandle = gettimehandle(query, params);
        client.query(query, params, function (err, results, fields) {
            cleartimehandle(timehandle, query, params);
            done(client);
            if (err) {
                callback(err);
                console.error('error running query', err);
                return;
            }
            else {
                var r = {};
                r.data = results;
                callback(null, r);
            }
        });
    }, dbconnection);
};
var getInsertWithUpdateClauseWithParams = function (obj, updateObj, tablename) {
    const params = [];
    const keys = Object.keys(obj);
    const values = Object.values(obj);

    const columnList = keys.join(', ');
    const parameterList = keys.map((_, idx) => `$${idx + 1}`).join(', ');

    // Build ON DUPLICATE KEY UPDATE part
    const updateList = Object.keys(updateObj)
        .map((key, idx) => `${key} = VALUES(${key})`)
        .join(', ');

    const query = `
        INSERT INTO ${tablename} (${columnList})
        VALUES (${parameterList})
       ON DUPLICATE KEY UPDATE ${updateList};
    `.trim();
    return { query, params: values };
};
module.exports.getInsertWithUpdateClauseWithParams = getInsertWithUpdateClauseWithParams;
var getConnectiontoDbObj = function (connectionParams, callback, dbconnection) {
    if (dbconnection) {
        connectionParams = dbconnection;
    }

    var connection = mysql.createConnection(connectionParams);
    /*{
     host     : 'localhost',
     user     : 'me',
     password : 'secret',
     database : 'my_db'
     }*/
    connection.connect(function (err) {
        if (err) {
            //console.error('error connecting: ' + err.stack);
            callback(err, connection, function (connection) {

                try {
                    //// console.log("closing connection "+connection.threadId);

                    connection.end();

                } catch (e) {
                    // // console.log("unable to end connection");
                }
            });
            return;
        }
        callback(null, connection, function (connection) {

            try {
                //// console.log("closing connection "+connection.threadId);

                connection.end();

            } catch (e) {
                //// console.log("unable to end connection");
            }
        });

        //// console.log('connected as id ' + connection.threadId);
    });
};

/**
 * Get Last updated Table Queries
 * @param tablenames:comma separated tablename
 * Return: Array of Queries
 */
var getLastUpdatedQueries = function (tablenames, rootuserid) {
    var tables = tablenames.split(",");
    var qandpobjArr = [];
    var dt = (new Date()).getTime();
    tables.forEach(function (table) {
        var query = "INSERT INTO lastupdatedat (rootuserid,objectcode,updatedat) VALUES(?, ?, ?) ON DUPLICATE KEY UPDATE updatedat=?";
        var params = [rootuserid, table, dt, dt];
        qandpobjArr.push({ query: query, params: params });
    })
    return qandpobjArr;
}

var executeQueriesWithoutCommitWithParameters = function (dbkey, queryParamsObjectArr, callback) {
    var pgClient;
    var pgClientDone = function () { };
    async.series([function (cback) {
        createTransaction(dbkey, function (err, client, done) {
            if (err) {
                // console.log(err);
                cback(err);
            } else {
                pgClientDone = done;
                pgClient = client;
                cback(null);
            }
        });

    }, function (cback) {
        //Execute queries
        if (queryParamsObjectArr && queryParamsObjectArr.length > 0) {

            async.eachSeries(queryParamsObjectArr, function (qp, citemback) {
                var query = qp.query;
                var queryParam = qp.params;
                if (queryParam && queryParam.length > 0) {
                    for (var i = queryParam.length; i >= 1; i--) {
                        query = query.split("$" + i).join("?");
                    }
                }
                pgClient.query(query, queryParam, function (err1, res1, fields) {
                    if (err1) {
                        try {
                            // console.log(query);
                            // console.log(JSON.stringify(queryParam));
                        } catch (e) { }
                        // console.log(err1);
                        citemback(err1);
                    } else {
                        citemback(null);
                    }
                });
            }, function (err2) {
                if (err2) {
                    // console.log(err2);
                    cback(err2);
                } else {
                    cback(null);
                }
            });
        } else {
            cback(null);
        }
    }],

        function (err3) {
            if (err3) {
                // console.log(err3);
                rollbackTransaction(pgClient, pgClientDone, function (err4) {
                    callback(err3)
                })
            } else {
                callback(null, pgClient, pgClientDone);

            }
        }
    );
};

var executeQueryWithInTransWithParameters = function (pgClient, query, params, callback) {
    pgClient.query(query, params, function (err, res, fields) {
        if (err) {
            callback(err);
            try {
                // console.log(query);
                // console.log(JSON.stringify(params));
            } catch (e) { }

            console.error('error running query', err);
            return;
        }
        else {
            var r = {};
            r.data = res;
            callback(null, r);
        }
    });
};
var commitPartialTransaction = function (pgClient, pgClientDone, callback) {
    commitTransaction(pgClient, pgClientDone, function (err5) {
        callback(err5, "Success");
    });
};
var rollbackPartialTransaction = function (pgClient, pgClientDone, callback) {
    rollbackTransaction(pgClient, pgClientDone, function (err5) {
        callback(err5, "Success");
    });
};
module.exports.executeQueriesWithoutCommitWithParameters = executeQueriesWithoutCommitWithParameters;
module.exports.executeQueryWithInTransWithParameters = executeQueryWithInTransWithParameters;
module.exports.commitPartialTransaction = commitPartialTransaction;
module.exports.rollbackPartialTransaction = rollbackPartialTransaction;
module.exports.getLastUpdatedQueries = getLastUpdatedQueries;
module.exports.executeQueryWithParametersandDbObj = executeQueryWithParametersandDbObj;
module.exports.executeQueryWithParameters = executeQueryWithParameters;
module.exports.executeQueriesWithParameters = executeQueriesWithParameters;
module.exports.executeCountQueryWithParams = executeCountQueryWithParams;
module.exports.getInsertClauseWithParams = getInsertClauseWithParams;
module.exports.getMultInsertTogetherWithParams = getMultInsertTogetherWithParams;
module.exports.getUpdateQueryAndparams = getUpdateQueryAndparams;
module.exports.createTransaction = createTransaction;
module.exports.executeQueriesByTransactionObj = executeQueriesByTransactionObj;
module.exports.executeMultiSelQueriesWithParameters = executeMultiSelQueriesWithParameters;


var gettimehandle = function (log1, log2) {
    var dt = (new Date()).getTime();
    /* var secondstowait=10;
     var timehandle = setTimeout(function(){
         // console.log("Query taking more than ..............." + secondstowait + " seconds");
         // console.log(log1);
         if(log2){
             // console.log(log2);
         }
     }, secondstowait*1000);
     return timehandle;*/
    return dt;

}

var cleartimehandle = function (starttime, log1, log2) {
    var dt = (new Date()).getTime();
    var secondstowait = 0;
    var difftime = parseInt((dt - starttime) / 1000);
    if (difftime > secondstowait) {
        getConnection(CONFIG_PARAMS.getCommonDBDetails(), function (error, client, done) {
            if (log2 && log2.length > 0) {
                for (var i = 0; i < log2.length; i++) {
                    log1 = log1.replace("?", log2[i]);
                }
            }
            // console.log(log1);
            let query = `insert into slow_queries(query,value,execution_time) values (? , ?, ?);`
            client.query(query, [log1, '', difftime], function (err, results, fields) {
                // console.log(err);
                done(client);
            });
        })
    }
}

module.exports.getQueryDataFromId = function (dbkey, request, params, sessionDetails, callback) {
    let queryObj = {}
    async.series([
        function (cback) {
            getQueryFromID(dbkey, params, sessionDetails, function (err, qAndP) {
                if (err) return cback(err);
                else if (qAndP) {
                    queryObj = qAndP;
                   // console.log(qAndP);
                    
                    return cback();
                } else {
                    return cback({ message: `no query object recived from getQueryFromID function.` })
                }
            });
        },
        function (cback1) {
            executeQueryWithParameters(queryObj.dbkey, queryObj.query, queryObj.params, function (e1, r1) {
                if (e1) {
                    return cback1(e1);
                }
                else if (r1 && r1.data) {
                    found_rows = r1.data;
                    return cback1(null);
                }
            })
        }
    ], function (err, res) {
        if (err) {
            return callback(err)
        } else {
            return callback(null, found_rows)
        }

    })
};

let getQueryFromID = function (dbkey, params, sessionDetails, callback) {
    dbkey = CONFIG_PARAMS.getCommonDBDetails();
    let validParam = true;
    let p = [], err_obj = {};
    if (!(sessionDetails.query_id && typeof sessionDetails.query_id == "number")) {
        return callback({ message: `query id is required and its type must be number.` });
    }
    const { access_type = "A" } = sessionDetails;
    let table_name = 'mas_custom_queries'
    let query = `SELECT * FROM ${table_name} mq WHERE mq.query_id = ${sessionDetails.query_id}`
    DB_SERVICE.executeQueryWithParameters(dbkey, query, [], (e1, r1) => {
        if (e1) {
            return callback(e1);
        } else if (r1.data && r1.data.length == 1) {
            // console.log(r1.data[0]['query_object']);
            let all_query_details = JSON.parse(r1.data[0]['query_object'])
            if (!(all_query_details["permission"][access_type] || access_type == 'A')) return callback({ message: `no  record found in mas_queries for access_type ${access_type} query_name ${all_query_details.query_name}}` });
            Object.keys(params).forEach((key) => {
                if (params[key] === null || params[key] == ""|| params[key] === 'null' || params[key] === undefined || params[key] == -1) {
                    delete params[key];
                }
            })
            
            
            let excuteQueryDbkey = global.COMMON_CONFS.map_dbkey_database[r1.data[0].base_database];
            if (excuteQueryDbkey == undefined) { return callback({ message: `no dbkey found for base_database ${r1.data[0].base_database}}` }); }
            params['other'] = Object.keys(params);
           // console.log( params['other'],params);
            //delete params['other']['dbkey']
            if (access_type === "C" && Array.isArray(sessionDetails.custom_value)) {
                for (const element of sessionDetails.custom_value) {
                    const keys = Object.keys(element).filter(key => typeof element[key] !== "object");
                    const customKeys = Object.keys(element).filter(key => typeof element[key] === "object");
                    if (customKeys.length !== 1) {
                        return callback({ message: "Object must have exactly one key of type 'object'" });
                    }

                    if (keys.every(key => params[key] == element[key])) {
                        Object.assign(params, element);
                        break;
                    } else {
                        params[customKeys[0]] = null;
                    }
                }
            }
            //console.log(params);
            let qAnpPObj = buildQuery(all_query_details, access_type, params['other']);
           // console.log(qAnpPObj,access_type);

            if ((qAnpPObj.params == [])) return callback(null, { query: qAnpPObj.query, params: [] });
            for (let i = 0; i < qAnpPObj.params.length; i++) {
                let key = qAnpPObj.params[i];
                if (key in params) {
                    p.push(params[key]);
                    validParam = true
                } else if (access_type == 'S' && key in sessionDetails) {
                    p.push(sessionDetails[key]);
                    validParam = true
                }
                else {
                    err_obj = { message: `key ${key} not exists in given data.` }
                    validParam = false;
                    break;
                }
            }
            console.log(qAnpPObj.query, p);

            if (validParam) {
                return callback(null, { query: qAnpPObj.query, params: p, dbkey: excuteQueryDbkey });
            }
            else {
                return callback(err_obj);
            }
        } else {
            return callback({ message: `no or multiple record found in mas_queries for query_name ${params.query_name}}` })
        }

    })
}
module.exports.getQueryFromID = getQueryFromID


function buildQuery(data, permission, params) {
    let query = data.base;

    // Use Set for join to ensure uniqueness
    let join_arr = new Set(),
        select_arr = [],
        group_by_arr = [],
        where_arr = [],
        params_arr = [...data.params];

    const mergeClauses = (obj) => {
        if (!obj) return;
        obj.join && obj.join.forEach(join_arr.add, join_arr);
        obj.select && select_arr.push(obj.select);
        obj.group && group_by_arr.push(obj.group);
        obj.where && where_arr.push(obj.where);
        obj.params && params_arr.push(...obj.params);
    };

    mergeClauses(data.permission[permission]);

    if (params?.length) {
        params.forEach(param => mergeClauses(data.other[param]));
    }


    // Construct query by replacing placeholders
    query = query
        .replace("$join", join_arr.size ? [...join_arr].join(" ") : "")
        .replace("$select", select_arr.length ? ", " + select_arr.join(", ") : "")
        .replace("$where", where_arr.length ? (query.includes("WHERE") || query.includes(" where")   ? " AND " : " WHERE ") + where_arr.join(" AND ") : "")
        .replace("$group", group_by_arr.length ? (query.includes("GROUP BY") ? group_by_arr.join(", ") : "GROUP BY " + group_by_arr.join(", ")) : "");

    return { query: query.trim(), params: params_arr };
}
module.exports.buildQuery = buildQuery