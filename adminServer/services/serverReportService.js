const async = require('async');
const pm2 = require('pm2');
const { exec } = require('child_process');

let serverReportService = {
    getServerStatus: (dbkey, request, params, sessionDetails, callback) => {
        pm2.connect(err => {
            if (err) return callback({ error: err });

            pm2.list((err, processList) => {
                pm2.disconnect();
                if (err) return callback({ error: err });

                const simplified = processList.map(proc => ({
                    name: proc.name,
                    pid: proc.pm_id,
                    status: proc.pm2_env.status,
                    uptime: formatUptime(proc.pm2_env.pm_uptime),
                    memory: proc.monit.memory,
                    cpu: proc.monit.cpu,
                    restarts: proc.pm2_env.restart_time,
                    watching: proc.pm2_env.watch,
                    port: proc.pm2_env.env?.PORT || null
                }));
                callback(null, simplified);
            });
        });
    },
    flushByPm2Id: (dbkey, request, params, sessionDetails, callback) => {
        if (!params.p_id) callback({ message: `p_id are required` });
        pm2.connect(err => {
            if (err) return callback({ error: err });
            pm2.flush(params.p_id, (err) => {
                pm2.disconnect();
                if (err) return callback({ error: err });
                callback(null, { success: true, message: `Logs flushed for PM2 ID ${params.p_id}` });
            });
        });
    },
    restartByPm2Id: (dbkey, request, params, sessionDetails, callback) => {
        if (!params.p_id) callback({ message: `p_id are required` });
        pm2.connect(err => {
            if (err) return callback({ error: err });
            pm2.restart(params.p_id, (err, proc) => {
                pm2.disconnect();
                if (err) return callback({ error: err });
                callback(null, { success: true, message: `PM2 process ID ${params.p_id} restarted.` });
            });
        });
    },
    updateSlowQuery: function (dbkey, request, params, sessionDetails, callback) {
        params.table_name = 'slow_queries'
        qAndParam = DB_SERVICE.getUpdateQueryAndparams({ status: params.status }, { sid: params.sid }, params.table_name);
        DB_SERVICE.executeQueryWithParameters(dbkey, qAndParam.query, qAndParam.params, function (e1, r1) {
            if (e1) {
                return callback(e1);
            }
            else if (1 == r1.data["affectedRows"]) {
                return callback(null, { status: true });
            }
            else {
                return callback({ "message": `in update, ${params.table_name}, updated data length ${r1.data["affectedRows"]} is not Matched` });
            }
        })
    },
    explainSlowQuery: function (dbkey, request, params, sessionDetails, callback) {
        let explain, query;
        async.series([
            function (cb) {
                sessionDetails.query_id = 57;
                DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, function (err, res) {
                    console.log(err, res)
                    if (err) return cb(err);
                    else {
                        query = res[0].query
                        return cb()
                    }
                })
            },
            function (cb) {
                DB_SERVICE.executeQueryWithParameters(dbkey, `explain ${query}`, [], (err, res) => {
                    if (err) return cb(err);
                    explain = res.data;
                    cb();
                });
            }
        ], (err) => callback(err, explain));
    },
createTestName: function (dbkey, request, params, sessionDetails, callback) {
      // Logic here
      return callback(null, { message: "createTestName called successfully" });
    },
    }
module.exports = serverReportService

function formatUptime(startTime) {
    const duration = Date.now() - startTime;
    const seconds = Math.floor((duration / 1000) % 60);
    const minutes = Math.floor((duration / (1000 * 60)) % 60);
    const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
    const days = Math.floor(duration / (1000 * 60 * 60 * 24));
    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0) result += `${minutes}m `;
    result += `${seconds}s`;
    return result.trim();
}

