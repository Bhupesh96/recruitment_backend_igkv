var securityService = require("../services/securityservice");
var prefix = global.apiPrefix;
const fileUpload = require("express-fileupload");
var init = function (app) {
  app.get(prefix + "/master/get/:function_name", function (req, res, next) {
    securityService.commonFunctionToCall(
      "master",
      req.params["function_name"],
      req,
      res,
      req.query,
      true
    );
  });
  app.post(prefix + "/master/post/:function_name", function (req, res, next) {
    securityService.commonFunctionToCall(
      "master",
      req.params["function_name"],
      req,
      res,
      req.body,
      true
    );
  });
  app.post(
    prefix + "/master/postFile/:function_name",
    fileUpload({
      createParentPath: true,
      limits: { fileSize: 5000 * 1024 },
      abortOnLimit: true,
    }),
    function (req, res, next) {
      securityService.commonFunctionToCall(
        "master",
        req.params["function_name"],
        req,
        res,
        req.body,
        true
      );
    }
  );
  app.delete(
    prefix + "/master/delete/:function_name",
    function (req, res, next) {
      securityService.commonFunctionToCall(
        "master",
        req.params["function_name"],
        req,
        res,
        req.query,
        true
      );
    }
  );
  app.put(prefix + "/master/update/:function_name", function (req, res, next) {
    securityService.commonFunctionToCall(
      "master",
      req.params["function_name"],
      req,
      res,
      req.body,
      true
    );
  });

  app.get(
    prefix + "/scoreCardEntry/get/:function_name",
    function (req, res, next) {
      securityService.commonFunctionToCall(
        "scoreCardEntry",
        req.params["function_name"],
        req,
        res,
        req.query,
        true
      );
    }
  );
  app.post(
    prefix + "/scoreCardEntry/post/:function_name",
    function (req, res, next) {
      securityService.commonFunctionToCall(
        "scoreCardEntry",
        req.params["function_name"],
        req,
        res,
        req.body,
        true
      );
    }
  );
  app.delete(
    prefix + "/scoreCardEntry/delete/:function_name",
    function (req, res, next) {
      securityService.commonFunctionToCall(
        "scoreCardEntry",
        req.params["function_name"],
        req,
        res,
        req.query,
        true
      );
    }
  );
  app.put(
    prefix + "/scoreCardEntry/update/:function_name",
    function (req, res, next) {
      securityService.commonFunctionToCall(
        "scoreCardEntry",
        req.params["function_name"],
        req,
        res,
        req.body,
        true
      );
    }
  );
  app.post(
    prefix + "/scoreCardEntry/postFile/:function_name",
    fileUpload({
      createParentPath: true,
      limits: { fileSize: 5000 * 1024 },
      abortOnLimit: true,
    }),
    function (req, res, next) {
      securityService.commonFunctionToCall(
        "scoreCardEntry",
        req.params["function_name"],
        req,
        res,
        req.body,
        true
      );
    }
  );

  app.get(prefix + "/candidate/get/:function_name", function (req, res, next) {
    securityService.commonFunctionToCall(
      "candidate",
      req.params["function_name"],
      req,
      res,
      req.query,
      true
    );
  });
  app.post(
    prefix + "/candidate/post/:function_name",
    function (req, res, next) {
      securityService.commonFunctionToCall(
        "candidate",
        req.params["function_name"],
        req,
        res,
        req.body,
        true
      );
    }
  );
  app.delete(
    prefix + "/candidate/delete/:function_name",
    function (req, res, next) {
      securityService.commonFunctionToCall(
        "candidate",
        req.params["function_name"],
        req,
        res,
        req.query,
        true
      );
    }
  );
  app.put(
    prefix + "/candidate/update/:function_name",
    function (req, res, next) {
      securityService.commonFunctionToCall(
        "candidate",
        req.params["function_name"],
        req,
        res,
        req.body,
        true
      );
    }
  );
  app.post(
    prefix + "/candidate/postFile/:function_name",
    fileUpload({
      createParentPath: true,
      limits: { fileSize: 5000 * 1024 },
      abortOnLimit: true,
    }),
    function (req, res, next) {
      securityService.commonFunctionToCall(
        "candidate",
        req.params["function_name"],
        req,
        res,
        req.body,
        true
      );
    }
  );
};
module.exports.init = init;
