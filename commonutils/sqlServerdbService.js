var sql = require('mssql');
var CONFIG_PARAMS = global.COMMON_CONFS;
var async = require('async');

var executeQueryWithParameters = function (dbkey, query, params, callback, dbconnection) {
    getConnection(dbkey, function (error, client, done) {
        if (error) {
            callback(error);
            return;
        }
        if (params && params.length > 0) {
            // Here we use parameterized queries for SQL Server (using @param_name)
            params.forEach(function (param, index) {
                query = query.replace("$" + (index + 1), '@' + (index + 1)); // Replacing placeholders with SQL Server parameter names
            });
        }
        
        // Use the query with parameters
        client.request()
            .input('params', sql.TYPES.NVarChar, params) // Example: Input parameters if needed, adjust as per your query.
            .query(query, function (err, results) {
                done(client);
                if (err) {
                    callback(err);
                    console.error('Error running query', err);
                    return;
                }
                var r = {};
                r.data = results.recordset; // SQL Server results are accessed via recordset
                callback(null, r);
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

    connectionParams.pool = { min: 1, max: 10, idleTimeoutMillis: 30000 }; // Pooling config for SQL Server

    var commonDbDetails = CONFIG_PARAMS.getCommonDBDetails();
    if (!connectionParams.user) {
        connectionParams.user = commonDbDetails.user;
    }
    if (!connectionParams.password) {
        connectionParams.password = commonDbDetails.password;
    }

    // SQL Server requires a 'server' instead of 'host'
    if (!connectionParams.server) {
        connectionParams.server = commonDbDetails.server;
    }
    if (!connectionParams.database) {
        connectionParams.database = commonDbDetails.database;
    }

    sql.connect(connectionParams, function (err) {
        if (err) {
            callback(err, connection, function () { });
            return;
        }
        callback(null, sql, function (connection) {
            try {
                sql.close(); // Close the connection to SQL Server
            } catch (e) {
                console.log("Unable to close connection", e);
            }
        });
    });
};

module.exports.executeQueryWithParameters = executeQueryWithParameters;
