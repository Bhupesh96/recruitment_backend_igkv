var securityService = require("../services/securityservice");
var prefix = global.apiPrefix;
var scoreCardEntryService = require("../services/scoreCardEntryService");
// var securityService = global.SECURITY_SERVICE;
var svgCaptcha = require("svg-captcha");
const CryptoJS = require("crypto-js");

var prefix = global.apiPrefix;
/**
 * @openapi
 * tags:
 *   - name: Master
 *     description: Master module APIs
 *   - name: ScoreCardEntry
 *     description: Score Card Entry module APIs
 *   - name: Candidate
 *     description: Candidate module APIs
 *   - name: PublicApi
 *     description: Public APIs (No login required)
 */

/* =====================================================================
   MASTER MODULE
   ===================================================================== */

/**
 * @openapi
 * /recruitementApi/master/get/{function_name}:
 *   get:
 *     summary: Dynamic GET for Master Module
 *     tags: [Master]
 *     security:
 *       - sessionAuth: []
 *       - userAuth: []
 *     parameters:
 *       - in: path
 *         name: function_name
 *         required: true
 *         schema: { type: string }
 *         description: Name of master function
 *
 *       - in: query
 *         name: dynamic
 *         required: false
 *         schema:
 *           type: object
 *           additionalProperties: true
 *         style: form
 *         explode: true
 *         description: Add ANY dynamic query parameters.
 *
 *     responses:
 *       200: { description: Success }
 */

/**
 * @openapi
 * /recruitementApi/master/post/{function_name}:
 *   post:
 *     summary: Dynamic POST for Master Module
 *     tags: [Master]
 *     security:
 *       - sessionAuth: []
 *       - userAuth: []
 *     parameters:
 *       - in: path
 *         name: function_name
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *     responses:
 *       200:
 *         description: Success
 */

/* =====================================================================
   SCORE CARD ENTRY MODULE
   ===================================================================== */

/**
 * @openapi
 * /recruitementApi/scoreCardEntry/get/{function_name}:
 *   get:
 *     summary: Dynamic GET for ScoreCardEntry
 *     tags: [ScoreCardEntry]
 *     security:
 *       - sessionAuth: []
 *       - userAuth: []
 *     parameters:
 *       - in: path
 *         name: function_name
 *         required: true
 *         schema: { type: string }
 *
 *       - in: query
 *         name: dynamic
 *         required: false
 *         schema:
 *           type: object
 *           additionalProperties: true
 *         style: form
 *         explode: true
 *         description: Add ANY dynamic query parameters.
 *
 *     responses:
 *       200: { description: Success }
 */

/**
 * @openapi
 * /recruitementApi/scoreCardEntry/post/{function_name}:
 *   post:
 *     summary: Dynamic POST for ScoreCardEntry
 *     tags: [ScoreCardEntry]
 *     security:
 *       - sessionAuth: []
 *       - userAuth: []
 *     parameters:
 *       - in: path
 *         name: function_name
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *     responses:
 *       200:
 *         description: Success
 */

/**
 * @openapi
 * /recruitementApi/scoreCardEntry/login:
 *   post:
 *     summary: Candidate Login (generates cookies)
 *     tags: [ScoreCardEntry]
 *     requestBody:
 *       required: true
 *     responses:
 *       200:
 *         description: Login successful
 */

/**
 * @openapi
 * /recruitementApi/scoreCardEntry/logout:
 *   get:
 *     summary: Candidate Logout
 *     tags: [ScoreCardEntry]
 *     security:
 *       - sessionAuth: []
 *       - userAuth: []
 *     responses:
 *       200:
 *         description: Logout success
 */

/* =====================================================================
   CANDIDATE MODULE
   ===================================================================== */

/**
 * @openapi
 * /recruitementApi/candidate/get/{function_name}:
 *   get:
 *     summary: Dynamic GET for Candidate Module
 *     tags: [Candidate]
 *     security:
 *       - sessionAuth: []
 *       - userAuth: []
 *     parameters:
 *       - in: path
 *         name: function_name
 *         required: true
 *         schema: { type: string }
 *
 *       - in: query
 *         name: dynamic
 *         required: false
 *         schema:
 *           type: object
 *           additionalProperties: true
 *         style: form
 *         explode: true
 *         description: Add ANY dynamic query parameters.
 *
 *     responses:
 *       200: { description: Success }
 */

/**
 * @openapi
 * /recruitementApi/candidate/post/{function_name}:
 *   post:
 *     summary: Dynamic POST for Candidate Module
 *     tags: [Candidate]
 *     security:
 *       - sessionAuth: []
 *       - userAuth: []
 *     parameters:
 *       - in: path
 *         name: function_name
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *     responses:
 *       200:
 *         description: Success
 */

/* =====================================================================
   PUBLIC API (NO AUTH REQUIRED)
   ===================================================================== */

/**
 * @openapi
 * /recruitementApi/publicApi/get/{function_name}:
 *   get:
 *     summary: Public GET (No Authentication)
 *     tags: [PublicApi]
 *     parameters:
 *       - in: path
 *         name: function_name
 *         required: true
 *         schema: { type: string }
 *
 *       - in: query
 *         name: dynamic
 *         required: false
 *         schema:
 *           type: object
 *           additionalProperties: true
 *         style: form
 *         explode: true
 *         description: Add ANY dynamic query parameters.
 *
 *     responses:
 *       200: { description: Success }
 */

/**
 * @openapi
 * /recruitementApi/publicApi/post/{function_name}:
 *   post:
 *     summary: Public POST (No Authentication)
 *     tags: [PublicApi]
 *     parameters:
 *       - in: path
 *         name: function_name
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *     responses:
 *       200:
 *         description: Success
 */

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
