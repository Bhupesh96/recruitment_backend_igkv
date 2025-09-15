var async = require("async");
const axios = require("axios");
const securityService = require("../services/securityservice");

let masterService = {
  // add service functions here

  getPostList: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(
      dbkey,
      request,
      params,
      sessionDetails,
      callback
    );
  },
  getPostType: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(
      dbkey,
      request,
      params,
      sessionDetails,
      callback
    );
  },
  getSubjectsByPost: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    console.log(params.post_code);
    return DB_SERVICE.getQueryDataFromId(
      dbkey,
      request,
      params,
      sessionDetails,
      callback
    );
  },
  getPayCommission: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    return DB_SERVICE.getQueryDataFromId(
      dbkey,
      request,
      params,
      sessionDetails,
      callback
    );
  },
  getPayBandCommission: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    return DB_SERVICE.getQueryDataFromId(
      dbkey,
      request,
      params,
      sessionDetails,
      callback
    );
  },
  getGradePayByBandPay: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    return DB_SERVICE.getQueryDataFromId(
      dbkey,
      request,
      params,
      sessionDetails,
      callback
    );
  },
  getPayLevelByGradePay: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    return DB_SERVICE.getQueryDataFromId(
      dbkey,
      request,
      params,
      sessionDetails,
      callback
    );
  },
 
  getScoreFieldList: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    return DB_SERVICE.getQueryDataFromId(
      dbkey,
      request,
      params,
      sessionDetails,
      callback
    );
  },
  getApplicant: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(
      dbkey,
      request,
      params,
      sessionDetails,
      callback
    );
  },
  getAddtionalInforList: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let response = {};

    async.series(
      [
        // 1. Get all questions
        function (c1) {
          sessionDetails.query_id = 182; // 👉 query for questions
          DB_SERVICE.getQueryDataFromId(
            dbkey,
            request,
            params,
            sessionDetails,
            (err, res) => {
              if (err) return c1(err);
              response.questions = res || [];
              return c1();
            }
          );
        },

        // 2. For each question, get options and conditions
        function (c2) {
          async.eachSeries(
            response.questions,
            function (q, cb1) {
              // 👉 Fetch options for this question
              sessionDetails.query_id = 182; // 👉 query for options
              const optParams = { additional_options_option: q.question_id };

              DB_SERVICE.getQueryDataFromId(
                dbkey,
                request,
                optParams,
                sessionDetails,
                (err, options) => {
                  if (err) return cb1(err);
                  q.options = options || [];

                  // 👉 For each option, only fetch conditions if has_condition = 'Y'
                  async.eachSeries(
                    q.options,
                    function (o, cb2) {
                      if (o.has_condition === "Y") {
                        sessionDetails.query_id = 182; // 👉 query for conditions
                        const condParams = {
                          m_datatype_master_name: o.question_id,
                        };

                        DB_SERVICE.getQueryDataFromId(
                          dbkey,
                          request,
                          condParams,
                          sessionDetails,
                          (err, conditions) => {
                            if (err) return cb2(err);
                            o.conditions = conditions || [];
                            return cb2();
                          }
                        );
                        // return cb2();
                      } else {
                        // ❌ No conditions for this option
                        o.conditions = [];
                        return cb2();
                      }
                    },
                    cb1
                  );
                }
              );
            },
            c2
          );
        },
      ],
      function (err) {
        if (err) return callback(err, null);

        // ✅ Final JSON response
        return callback(null, {
          questions: response.questions,
        });
      }
    );
  },

  //
  getFullAdvertisementDetails: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let response = {};
    async.series(
      [
        function (c_1) {
          // getAdvertismentByAdvNo  105
          sessionDetails.query_id = 105;
          DB_SERVICE.getQueryDataFromId(
            dbkey,
            request,
            params,
            sessionDetails,
            (err, res) => {
              if (err) return callback(err);
              response.advertisement = res[0];
              return c_1();
            }
          );
        },
        function (c_2) {
          // getPostDetails  106
          sessionDetails.query_id = 106;
          DB_SERVICE.getQueryDataFromId(
            dbkey,
            request,
            params,
            sessionDetails,
            (err, res) => {
              if (err) return callback(err);
              response.postDetails = res;
              return c_2();
            }
          );
        },
        function (c_3) {
          async.eachSeries(
            response.postDetails,
            function (obj, cb) {
              sessionDetails.query_id = 107;
              let p = { postDetailId: obj.a_rec_adv_post_detail_id };
              DB_SERVICE.getQueryDataFromId(
                dbkey,
                request,
                p,
                sessionDetails,
                (err, res) => {
                  if (err) return cb(err);
                  obj.subjects = res;
                  return cb();
                }
              );
            },
            function (err, res) {
              return c_3(err);
            }
          );
        },
      ],
      function (err, res) {
        if (err) return callback(err, null);
        return callback(null, response);
      }
    );
  },

  getTransliterationHindi: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    const text = params.text;
    if (!text || typeof text !== "string" || !text.trim()) {
      return callback(null, { success: false, message: "Invalid text input" });
    }

    const apiUrl = `https://inputtools.google.com/request?text=${encodeURIComponent(
      text
    )}&itc=hi-t-i0-und&num=1`;

    axios
      .get(apiUrl)
      .then((response) => {
        if (response.data[0] === "SUCCESS") {
          const hindiWord = response.data[1][0][1][0];
          return callback(null, { success: true, transliteration: hindiWord });
        } else {
          return callback(null, {
            success: false,
            message: "Google API returned failure",
          });
        }
      })
      .catch((error) => {
        console.error(
          "Error calling Google Transliteration API:",
          error.message
        );
        return callback(error);
      });
  },
  
 

  // getPostType: function (dbkey, request, params, sessionDetails, callback) {
  //     return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  // },
  // getPayBandCommission: function (dbkey, request, params, sessionDetails, callback) {
  //     return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  // },
};
module.exports = masterService;
