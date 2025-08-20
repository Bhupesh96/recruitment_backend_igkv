var securityService = require('../services/securityservice');
var prefix = global.apiPrefix;
const fileUpload = require("express-fileupload");

var init = function (app) {

    app.get(prefix + '/master/get/:function_name', function (req, res, next) {

        securityService.commonFunctionToCall('master', req.params['function_name'], req, res, req.query, true)
    });
    app.post(prefix + '/master/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('master', req.params['function_name'], req, res, req.body, true);
    });
     app.post(prefix + '/master/postFile/:function_name', fileUpload({ createParentPath: true, limits: { fileSize: 500 * 1024 }, abortOnLimit: true }), function (req, res, next) {
        securityService.commonFunctionToCall('master', req.params['function_name'], req, res, req.body, true);
    });
    app.get(prefix + '/list/get/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('list', req.params['function_name'], req, res, req.query, true);
    });
    app.post(prefix + '/list/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('list', req.params['function_name'], req, res, req.body, true);
    });
    app.post(prefix + '/accessControl/post/saveComponentDetails', function (req, res, next) {
        securityService.commonFunctionToCall('accessControl', 'saveComponentDetails', req, res, req.body, false);
    });
    app.post(prefix + '/accessControl/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('accessControl', req.params['function_name'], req, res, req.body, true);
    });

    app.put(prefix + '/accessControl/update/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('accessControl', req.params['function_name'], req, res, req.body, true);
    });

    app.post(prefix + '/accessControl/postFile/:function_name', fileUpload({ createParentPath: true, limits: { fileSize: 500 * 1024 }, abortOnLimit: true }), function (req, res, next) {
        securityService.commonFunctionToCall('accessControl', req.params['function_name'], req, res, req.body, true);
    });
    app.delete(prefix + '/accessControl/delete/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('accessControl', req.params['function_name'], req, res, req.query, true);
    });

    app.get(prefix + '/web/get/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('web', req.params['function_name'], req, res, req.query, false);
    });
    app.post(prefix + '/web/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('web', req.params['function_name'], req, res, req.body, false);
    });
    app.post(prefix + '/serverCreation/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('serverCreation', req.params['function_name'], req, res, req.body, false);
    });
    app.get(prefix + '/custom/get/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('custom', req.params['function_name'], req, res, req.query, true, function (err, data) {
            if (err) {
                res.send(err);
            } else {
                res.send(data);
            }
        });
    });

    app.get(prefix + '/master/get/:function_name', function (req, res, next) {
        console.log('as')
        securityService.commonFunctionToCall('master', req.params['function_name'], req, res, req.query, true)
    });
    app.post(prefix + '/master/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('master', req.params['function_name'], req, res, req.body, true);
    });
    app.delete(prefix + '/master/delete/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('master', req.params['function_name'], req, res, req.query, true);
    });
    app.put(prefix + '/master/update/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('master', req.params['function_name'], req, res, req.body, true);
    });
    app.get(prefix + '/serverReport/get/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('serverReports', req.params['function_name'], req, res, req.query, true)
    });
    app.post(prefix + '/serverReport/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('serverReports', req.params['function_name'], req, res, req.body, true);
    });
    app.delete(prefix + '/serverReport/delete/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('serverReports', req.params['function_name'], req, res, req.query, true);
    });
    app.put(prefix + '/serverReport/update/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('serverReports', req.params['function_name'], req, res, req.body, true);
    });


}

module.exports.init = init;