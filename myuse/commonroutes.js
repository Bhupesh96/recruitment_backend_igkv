var securityService = require('../services/securityservice');
var prefix = global.apiPrefix;
const CONFIG_PARAMS = global.COMMON_CONFS;

var init = function (app) {
    app.get(prefix + '/master/get/:function_name', function (req, res, next) {
        req.query.dbkey = CONFIG_PARAMS.getProcurmentDBDetails(); // Set the dbkey for master service
        securityService.commonFunctionToCall('master', req.params['function_name'], req, res, req.query, true)
    });

    app.post(prefix + '/master/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('master', req.params['function_name'], req, res, req.body, true);
    });

    app.post(prefix + '/file/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('file', req.params['function_name'], req, res, req.body, false, (err, buffer) => {
            if (err) return res.status(204).send({ 'error': err })
            res.setHeader('X-Filename', 'report.pdf');
            return res.status(200).end(buffer);
        });
    });
}

module.exports.init = init;