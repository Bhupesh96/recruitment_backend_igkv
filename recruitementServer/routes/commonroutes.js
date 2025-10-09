var securityService = require("../services/securityservice");
var prefix = global.apiPrefix;
var scoreCardEntryService = require("../services/scoreCardEntryService");
// var securityService = global.SECURITY_SERVICE;
var svgCaptcha = require("svg-captcha");
const CryptoJS = require("crypto-js");

var prefix = global.apiPrefix;
let service_file = "login";

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

  app.post(prefix + "/scoreCardEntry/login", function (req, res, next) {
    scoreCardEntryService.candidateLogin(
      req.query.dbkey,
      req,
      req.body,
      req.session,
      function (err, result) {
        if (err) {
          res.json({ error: err, data: result });
        } else {
          res.cookie("user", result[0]?.cookieString);
          res.json({ error: err, data: result });
        }
      }
    );
  });

  app.get(prefix + "/scoreCardEntry/logout", function (req, res, next) {
    scoreCardEntryService.candidateLogout(
      req.query.dbkey,
      req,
      req.body,
      req.session,
      function (err, result) {
        res.json({ error: err, data: result });
      }
    );
  });
  
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
  app.get(prefix + "/publicApi/get/:function_name", function (req, res, next) {
    securityService.commonFunctionToCall(
      "publicApi",
      req.params["function_name"],
      req,
      res,
      req.query,
      false
    );
  });
  app.post(
    prefix + "/publicApi/post/:function_name",
    function (req, res, next) {
      securityService.commonFunctionToCall(
        "publicApi",
        req.params["function_name"],
        req,
        res,
        req.body,
        false
      );
    }
  );
  app.delete(
    prefix + "/publicApi/delete/:function_name",
    function (req, res, next) {
      securityService.commonFunctionToCall(
        "publicApi",
        req.params["function_name"],
        req,
        res,
        req.query,
        false
      );
    }
  );
  app.put(
    prefix + "/publicApi/update/:function_name",
    function (req, res, next) {
      securityService.commonFunctionToCall(
        "publicApi",
        req.params["function_name"],
        req,
        res,
        req.body,
        false
      );
    }
  );
};
module.exports.init = init;
