var securityService = require('../services/securityservice');
var prefix = global.apiPrefix;

var init = function (app) {
    
    app.get(prefix + '/demo/get/:function_name', function (req, res, next) {
        
        securityService.commonFunctionToCall('demo', req.params['function_name'], req, res, req.query, true)
    });
    app.post(prefix + '/demo/post/:function_name', function (req, res, next) {
        
        securityService.commonFunctionToCall('demo', req.params['function_name'], req, res, req.body, true);
    });
}

module.exports.init = init;