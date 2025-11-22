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
    app.delete(prefix + '/master/delete/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('master', req.params['function_name'], req, res, req.query, true);
    });
    app.put(prefix + '/master/update/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('master', req.params['function_name'], req, res, req.body, true);
    });
     
    app.get(prefix + '/cet/get/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('cet', req.params['function_name'], req, res, req.query, true)
    });
    app.post(prefix + '/cet/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('cet', req.params['function_name'], req, res, req.body, true);
    });
    app.delete(prefix + '/cet/delete/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('cet', req.params['function_name'], req, res, req.query, true);
    });
    app.put(prefix + '/cet/update/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('cet', req.params['function_name'], req, res, req.body, true);
    });


    app.post(prefix + '/cet/postFile/:function_name', fileUpload({ createParentPath: true, limits: { fileSize: 5000 * 1024 }, abortOnLimit: true }), function (req, res, next) {
        securityService.commonFunctionToCall('cet', req.params['function_name'], req, res, req.body, true);
    });



    app.get(prefix + '/counseling/get/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('counseling', req.params['function_name'], req, res, req.query, true)
    });
    app.post(prefix + '/counseling/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('counseling', req.params['function_name'], req, res, req.body, true);
    });
    app.delete(prefix + '/counseling/delete/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('counseling', req.params['function_name'], req, res, req.query, true);
    });
    app.put(prefix + '/counseling/update/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('counseling', req.params['function_name'], req, res, req.body, true);
    });
}
module.exports.init = init;