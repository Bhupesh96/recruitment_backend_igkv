var securityService = require('../services/securityservice');
var prefix = global.apiPrefix;

var init = function (app) {
    app.get(prefix + '/master/get/:function_name', function (req, res, next) {
        
        securityService.commonFunctionToCall('master', req.params['function_name'], req, res, req.query, true)
    });

    app.post(prefix + '/master/post/:function_name', function (req, res, next) {
        
        securityService.commonFunctionToCall('master', req.params['function_name'], req, res, req.body, true);
    });
    app.put(prefix + '/master/update/:function_name', function (req, res, next) {
        
        securityService.commonFunctionToCall('master', req.params['function_name'], req, res, req.body, true);
    });
}

module.exports.init = init;