var DB_SERVICE = global.DB_SERVICE;
const SECURITY_SERVICE = global.COMMON_SECURITY_SERVICE;
var CONFIG_PARAMS = global.COMMON_CONFS;
const config = require('config');
const webPush = require('web-push');
const async = require('async')
subscription = []

var common = {
    subscribe: function (dbkey, request, params, sessionDetails, callback) {
        if (!sessionDetails.user_id) return callback({ message: 'Session Details are required...' })
        let is_exits = false;
        async.series([
            function (c_1) {
                let qAndp = `select * from webpush_subscribe s where s.session_id = ?`
                DB_SERVICE.executeQueryWithParameters(dbkey, qAndp, [request.session.id], function (e1, r1) {
                    if (e1) return c_1(e1);
                    else {
                        is_exits = r1.data.length > 0
                        return c_1(null)
                    };
                })
            },
            function (c_2) {
                if (!is_exits) {
                    let pushObj = {
                        user_id: sessionDetails.user_id,
                        session_id: request.session.id,
                        subscribe_id: JSON.stringify(params)
                    }
                    let qAndp = DB_SERVICE.getInsertClauseWithParams(pushObj, 'webpush_subscribe')
                    DB_SERVICE.executeQueryWithParameters(dbkey, qAndp.query, qAndp.params, function (e1, r1) {
                        if (e1) return c_2(e1);
                        else return c_2(null, r1.data);
                    })
                }
                else {
                    let qAndp = DB_SERVICE.getUpdateQueryAndparams({ subscribe_id: JSON.stringify(params) }, { session_id: request.session.id }, 'webpush_subscribe')
                    DB_SERVICE.executeQueryWithParameters(dbkey, qAndp.query, qAndp.params, function (e1, r1) {
                        if (e1) return c_2(e1);
                        else return c_2(null, r1.data);
                    })
                }
            }
        ], function (err, res) {
            if (err) return callback(err)
            return callback(null, { message: 'User Subcribed...' })
        })
    },
    sendNotification: function (dbkey, request, params, sessionDetails, callback) {
        const notificationPayload = {
            notification: {
                title: 'New Notification',
                body: 'This is the body of the notification',
                icon: 'assets/icons/icon-512x512.png',
                data: {
                    onActionClick: {
                        "default": { "operation": "openWindow", "url": "https://google.com" }
                    }
                }
            },
        }
        let query = `select s.* from webpush_subscribe s where s.subscribe_id is not null`
        let user = 0
        DB_SERVICE.executeQueryWithParameters(dbkey, query, [], function (e1, r1) {
            if (e1) return callback(e1);
            async.eachSeries(r1.data, function (item, cb) {
                if (item.subscribe_id) {
                    console.log("inside push notification");
                    pushNotification(dbkey, item, notificationPayload, (err, res) => {
                        if (!err) user = user + 1
                        cb()
                    })
                }
            }, function (err, res) {
                callback(null, { message: `Push Notification sent for user ${user}` })
            })

        })
    }
}
module.exports = common

let pushNotification = (dbkey, itemObj, payload, callback) => {
    webPush.sendNotification(
        JSON.parse(itemObj.subscribe_id),
        JSON.stringify(payload),
    ).then(() => {
        return callback(null, { message: 'Notification sent...' })
    }).catch((err) => {
        console.log(err);

        if (err.statusCode === 410) {
            let qAndP = DB_SERVICE.getDeleteQueryAndparams({ session_id: itemObj.session_id }, 'webpush_subscribe')
            DB_SERVICE.executeQueryWithParameters(dbkey, qAndP.query, qAndP.params, function (e1, r1) {
                if (e1) return callback(e1);
                else return callback(null, { message: 'Session id unsubscribed...' });
            })
        } else {
            return callback(err);
        }
    })
}




