var LOGIN_SERVICE = require('../services/loginService')
var securityService = global.SECURITY_SERVICE;
var svgCaptcha = require('svg-captcha');
const CryptoJS = require("crypto-js");
var securityService = global.SECURITY_SERVICE;
var prefix = global.apiPrefix;
let service_file = 'login';

var init = function (app) {
    app.post(prefix + "/security/login", function (req, res, next) {
        LOGIN_SERVICE.login(req.query.dbkey, req, req.body, req.session, function (err, result) {
            if (err) {
                res.json({ error: err, data: result });
            } else {
                res.cookie('user', result[0]?.cookieString);
                res.json({ error: err, data: result });
            }
        })
    });
    app.post(prefix + "/security/login/changePassword", function (req, res, next) {
        securityService.commonFunctionToCall(service_file, 'changePassword', req, res, req.body, true)
    });
    app.post(prefix + "/security/login/changePasswordWithCheck", function (req, res, next) {
        securityService.commonFunctionToCall(service_file, 'changePasswordWithCheck', req, res, req.body, true)
    });
    app.post(prefix + "/security/login/resetPassword", function (req, res, next) {
        securityService.commonFunctionToCall(service_file, 'resetPassword', req, res, req.body, true)
    });

    app.post(prefix + "/security/resetPasswordByDept", function (req, res, next) {
        securityService.commonFunctionToCall(service_file, 'resetPasswordByDept', req, res, req.body, true)
    });
    app.get(prefix + "/security/logout", function (req, res, next) {
        securityService.commonFunctionToCall(service_file, 'logout', req, res, req.body, true)
        // securityService.logout(req.query.dbkey, req, req.body, req.session, function (err, result) {
        //     // console.log(err, result);
        //     res.json({ error: err, data: result });
        // })
    });
    app.get(prefix + "/security/refreshSession", function (req, res, next) {
        securityService.commonFunctionToCall(service_file, 'refreshSession', req, res, req.body, true, (err, result) => {
            res.cookie('user', result.cookieString);
            res.json({ error: err, data: result });
        })
    });

    app.get(prefix + "/logoutAllUserByUserId/:user_id", function (req, res, next) {
        //securityService.commonFunctionToCall(service_file, 'logoutAllUserByUserId', req, res, req.body, '12', true)
        LOGIN_SERVICE.logoutAllUserByUserId(req.query.dbkey, req, req.params['user_id'], function (err, result) {
            // console.log(err, result);
            res.json({ error: err, data: result });
        })
    });

    //#region captcha
    app.get(prefix + '/getCaptcha', function (req, res) {
        try {
            let captchaKey = '03f26e402586fkisanf2395fsg9632faa8da4c98a35f1b20d6b033c50';
            let captcha = svgCaptcha.create({
                size: 5,
                noise: 2,
                ignoreChars: '0Oo1IiLl'
            });
            let generatedCaptcha = CryptoJS.AES.encrypt(captcha.text, captchaKey).toString();
            if (generatedCaptcha && captcha)
                res.status(200).json({
                    error: false, message: 'SUCCESS', result: { 'captcha': generatedCaptcha, 'svg': captcha.data }
                });
            else
                res.status(400).json({ error: true, message: 'Failed!', result: null });
        } catch (e) {
            res.status(400).json({
                error: true,
                message: 'Something went wrong!',
                result: null
            });
        }
    })
    //#endregion captcha
}

module.exports.init = init;