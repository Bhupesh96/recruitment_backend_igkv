let ERROR_SERVICE = global.ERROR_SERVICE;
let COMMON_SECURITY_SERVICE = global.COMMON_SECURITY_SERVICE;

const candidateService = require("./candidateService.js");
let masterService = require("./masterService.js");

let scoreCardEntryService = require("./scoreCardEntryService.js");

var security = {
  commonFunctionToCall: function (
    service_name,
    funcName,
    req,
    res,
    params,
    ispermreq,
    resSendCallback
  ) {
    if (noApiPermissionRequiredServices[service_name]?.includes(funcName)) {
      req.noApiPermissionRequired = true;
    }
    COMMON_SECURITY_SERVICE.isAuthorized(
      req.query.dbkey,
      req,
      params,
      (err, ispermit, sessionDetails) => {
        if (!ispermreq || ispermit) {
          try {
            if (
              sessionDetails.api_creation === "A" &&
              sessionDetails.query_id
            ) {
              return COMMON_SECURITY_SERVICE.autoApiCall(
                req.query.dbkey,
                req,
                params,
                sessionDetails,
                (err, result) => {
                  COMMON_SECURITY_SERVICE.handleServiceResponse(
                    req,
                    err,
                    result,
                    funcName,
                    sessionDetails,
                    res,
                    resSendCallback
                  );
                }
              );
            }

            if (!service_files[service_name]) {
              return COMMON_SECURITY_SERVICE.sendErrorResponse(
                COMMON_SECURITY_SERVICE.SECURITY_ERRORS.SERVICE_FILE_NOT_FOUND,
                res,
                resSendCallback,
                503
              );
            }
            if (!service_files[service_name][funcName]) {
              return COMMON_SECURITY_SERVICE.sendErrorResponse(
                COMMON_SECURITY_SERVICE.SECURITY_ERRORS.FUNCTION_NAME_NOT_FOUND,
                res,
                resSendCallback,
                404
              );
            }

            service_files[service_name][funcName](
              req.query.dbkey,
              req,
              params,
              sessionDetails,
              (err, result) => {
                COMMON_SECURITY_SERVICE.handleServiceResponse(
                  req,
                  err,
                  result,
                  funcName,
                  sessionDetails,
                  res,
                  resSendCallback
                );
              }
            );
          } catch (error) {
            console.error(error);
            COMMON_SECURITY_SERVICE.sendErrorResponse(
              COMMON_SECURITY_SERVICE.SECURITY_ERRORS.UNKNOWN_ERROR,
              res,
              resSendCallback,
              500
            );
          }
        } else {
          return COMMON_SECURITY_SERVICE.handleAuthorizationError(
            err,
            ispermit,
            sessionDetails,
            res
          );
        }
      }
    );
  },
};

let service_files = {
  master: masterService,

  scoreCardEntry: scoreCardEntryService,

  candidate: candidateService,
};

// no need to check designation_id in header
// add file and function name here
let noApiPermissionRequiredServices = {
  candidate: [
    "saveCandidateDetail",
    "updateCandidateDetail",
    "saveOrUpdateCandidateScoreCard",
    "getAddtionalInforList"
  ],
};

module.exports = security;
