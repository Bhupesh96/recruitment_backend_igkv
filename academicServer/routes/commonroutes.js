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

    // & /////////////Course Allotment////////////////
    app.get(prefix + '/course/get/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('course', req.params['function_name'], req, res, req.query, true)
    });
    app.post(prefix + '/course/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('course', req.params['function_name'], req, res, req.body, true);
    });
    app.put(prefix + '/course/update/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('course', req.params['function_name'], req, res, req.body, true);
    });
    app.delete(prefix + '/course/delete/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('course', req.params['function_name'], req, res, req.query, true);
    });
    app.post(prefix + '/course/postFile/:function_name', fileUpload({ createParentPath: true, limits: { fileSize: 10 * 1024 * 1024 }, abortOnLimit: true }), function (req, res, next) {
        securityService.commonFunctionToCall('course', req.params['function_name'], req, res, req.body, false);
    });


    // * ///////////// attendance ////////////////
    app.get(prefix + '/attendance/get/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('attendance', req.params['function_name'], req, res, req.query, true)
    });
    app.post(prefix + '/attendance/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('attendance', req.params['function_name'], req, res, req.body, true);
    });
    app.delete(prefix + '/attendance/delete/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('attendance', req.params['function_name'], req, res, req.query, true);
    });
    app.put(prefix + '/attendance/update/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('attendance', req.params['function_name'], req, res, req.body, true);
    });

    app.post(prefix + '/attendance/postFile/:function_name', fileUpload({ createParentPath: true, limits: { fileSize: 10000 * 1024 }, abortOnLimit: true }), function (req, res, next) {
        securityService.commonFunctionToCall('attendance', req.params['function_name'], req, res, req.body, false);
    });

    // ~ ///////////// time table ////////////////
    app.get(prefix + '/timeTable/get/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('timeTable', req.params['function_name'], req, res, req.query, true)
    });
    app.post(prefix + '/timeTable/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('timeTable', req.params['function_name'], req, res, req.body, true);
    });
    app.delete(prefix + '/timeTable/delete/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('timeTable', req.params['function_name'], req, res, req.query, true);
    });
    app.put(prefix + '/timeTable/update/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('timeTable', req.params['function_name'], req, res, req.body, true);
    });


    // ? ///////////// mark entry ////////////////
    app.get(prefix + '/markEntry/get/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('markEntry', req.params['function_name'], req, res, req.query, true)
    });
    app.post(prefix + '/markEntry/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('markEntry', req.params['function_name'], req, res, req.body, true);
    });
    app.delete(prefix + '/markEntry/delete/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('markEntry', req.params['function_name'], req, res, req.query, true);
    });
    app.put(prefix + '/markEntry/update/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('markEntry', req.params['function_name'], req, res, req.body, true);
    });

    // ! ////////////// file Service ///////////////////
    app.post(prefix + '/file/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('file', req.params['function_name'], req, res, req.body, false, (err, buffer) => {
            if (err) return res.status(204).send({ 'error': err })
            // res.setHeader('X-Filename', 'report.pdf');
            // return res.status(200).end(buffer);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="Report.pdf"');
            res.status(200).send(buffer); // NOT .end()
        });
    });

    // ~ ///////////// SRC ////////////////
    app.get(prefix + '/src/get/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('src', req.params['function_name'], req, res, req.query, true)
    });
    app.post(prefix + '/src/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('src', req.params['function_name'], req, res, req.body, true);
    });
    app.delete(prefix + '/src/delete/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('src', req.params['function_name'], req, res, req.query, true);
    });
    app.put(prefix + '/src/update/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('src', req.params['function_name'], req, res, req.body, true);
    });

    // ~ ///////////// student profile ////////////////
    app.get(prefix + '/studentProfile/get/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('studentProfile', req.params['function_name'], req, res, req.query, true)
    });
    app.post(prefix + '/studentProfile/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('studentProfile', req.params['function_name'], req, res, req.body, true);
    });
    app.delete(prefix + '/studentProfile/delete/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('studentProfile', req.params['function_name'], req, res, req.query, true);
    });
    app.put(prefix + '/studentProfile/update/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('studentProfile', req.params['function_name'], req, res, req.body, true);
    });
    app.post(prefix + '/studentProfile/postFile/:function_name',
        fileUpload({ createParentPath: true, limits: { fileSize: 5000 * 1024 }, abortOnLimit: true }),
        function (req, res, next) {
            securityService.commonFunctionToCall('studentProfile', req.params['function_name'], req, res, req.body, true);
        });


    // ^ ////////////// esign service ///////////////////
    app.get(prefix + '/esign/get/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('esign', req.params['function_name'], req, res, req.query, true)
    });

           // ~ ///////////// Academic Status Service ////////////////
    app.get(prefix + '/academicStatus/get/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('academicStatus', req.params['function_name'], req, res, req.query, true)
    });
    app.post(prefix + '/academicStatus/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('academicStatus', req.params['function_name'], req, res, req.body, true);
    });
    app.delete(prefix + '/academicStatus/delete/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('academicStatus', req.params['function_name'], req, res, req.query, true);
    });
    app.put(prefix + '/academicStatus/update/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('academicStatus', req.params['function_name'], req, res, req.body, true);
    });


}
module.exports.init = init;