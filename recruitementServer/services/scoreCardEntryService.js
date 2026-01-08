var DB_SERVICE = global.DB_SERVICE;
var CONFIG_PARAMS = global.COMMON_CONFS;
var ENCRYPTION_SERVICE = global.ENCRYPTION_SERVICE;
// var SECURITY_SERVICE_QUERIES = require("../queries/securityservicequeries");
// var LOGIN_SERVICE_QUERIES = require("../queries/loginQueries.js");
const SHARED_SERVICE = global.SHARED_SERVICE;
const SECURITY_SERVICE = global.COMMON_SECURITY_SERVICE;
var async = require("async");
const CryptoJS = require("crypto-js");
const config = require("config");
let max_user = config.get("max_login_user") ?? 1;
var SECURITY_SERVICE_QUERIES = require("../../commonServer/queries/securityservicequeries");
let scoreCardEntryService = {
  // add service functions here
  candidateLogin: function (dbkey, request, params, sessionDetails, callback) {
    console.log("👉 candidateLogin called with params:", params);

    // 1. Initial Validation: Ensure user_id (registration_no) and password are provided
    if (!(params.user_id && params.password)) {
      console.error("❌ Missing mandatory fields:", params);
      return callback(
        SECURITY_SERVICE.SECURITY_ERRORS.MANDATORY_FIELDS_ARE_MISSING
      );
    }

    dbkey = "igkv_Recruitment"; // Define the database for this module
    let user = {};

    async.series(
      [
        // STEP 1: Fetch user from the database and verify the password
        function (cback) {
          sessionDetails.query_id = 230; // Your query to get a user by registration_no
          const queryParams = { registration_no: params.user_id };

          console.log(
            "🔎 Fetching user with query_id:",
            sessionDetails.query_id
          );
          console.log("📌 Query params:", queryParams);

          DB_SERVICE.getQueryDataFromId(
            dbkey,
            request,
            queryParams,
            sessionDetails,
            function (err, res) {
              if (err) {
                console.error("❌ DB error while fetching user:", err);
                return cback(err);
              }

              console.log("✅ DB response:", res);

              // Check if a single, unique user was found
              if (res && res.length === 1 && res[0].registration_no) {
                user = res[0];
                console.log("👤 User found:", user.registration_no);

                let decryptedPassword;
                try {
                  // Decrypt the password from the frontend
                  decryptedPassword = ENCRYPTION_SERVICE.decrypt(
                    params.password
                  ).trim();
                  console.log("🔑 Decrypted password from frontend.");
                } catch (e) {
                  console.error("❌ Password decryption failed:", e);
                  return cback(
                    SECURITY_SERVICE.SECURITY_ERRORS.INVALID_USER_OR_PASSWORD
                  );
                }

                // Compare password securely
                ENCRYPTION_SERVICE.checkPassword(
                  user.password.trim(),
                  decryptedPassword,
                  function (e, isMatch) {
                    if (e) {
                      console.error(
                        "❌ Error during password verification:",
                        e
                      );
                      return cback({
                        message: "Error during password verification.",
                      });
                    }

                    console.log("🔍 Password match result:", isMatch);

                    if (isMatch) {
                      console.log(
                        "✅ Password matched. Checking concurrent login..."
                      );
                      scoreCardEntryService.checkUserAlreadyLogin(
                        dbkey,
                        user.registration_no,
                        function (err, res) {
                          if (err) {
                            console.error(
                              "❌ Error checking concurrent login:",
                              err
                            );
                            return cback(err);
                          } else if (res === false) {
                            console.log("✅ User is not already logged in.");
                            return cback(null);
                          } else {
                            console.warn(
                              "⚠️ User already logged in:",
                              user.registration_no
                            );
                            return cback(
                              SECURITY_SERVICE.SECURITY_ERRORS
                                .USER_ALREADY_LOGIN
                            );
                          }
                        }
                      );
                    } else {
                      console.warn(
                        "❌ Invalid password for user:",
                        params.user_id
                      );
                      return cback(
                        SECURITY_SERVICE.SECURITY_ERRORS
                          .INVALID_USER_OR_PASSWORD
                      );
                    }
                  }
                );
              } else {
                console.warn(
                  "❌ No user found with registration_no:",
                  params.user_id
                );
                return cback(SECURITY_SERVICE.SECURITY_ERRORS.USER_NOT_EXIST);
              }
            }
          );
        },

        // STEP 2: Create the user session and the encrypted cookie
        function (cback) {
          console.log("🛠 Saving session for user:", user.registration_no);

          request.session.save((err) => {
            if (err) {
              console.error("❌ Error saving session:", err);
              return cback(err);
            }

            // Populate the server-side session
            request.session.registration_no = user["registration_no"];
            request.session.user_id = user["registration_no"];
            request.session.email_id = user["email_id"];
            console.log("✅ Session populated:", {
              session_id: request.session.id,
              registration_no: user["registration_no"],
            });

            // Update sessions table
            scoreCardEntryService.updateSessionTable(
              dbkey,
              request,
              request.session.id,
              user["registration_no"],
              function (err, res) {
                if (err) {
                  console.error("❌ Error updating session table:", err);
                  return cback(err);
                }

                console.log(
                  "✅ Session table updated for user:",
                  user.registration_no
                );

                // Create cookie payload
                const payloadForCookie = {
                  user_id: user["registration_no"],
                  registration_no: user["registration_no"],
                  email_id: user["email_id"],
                  mobile_no: user["mobile_no"],
                  post_code: user["post_code"],
                  subject_id: user["subject_id"],
                  academic_session_id: user["academic_session_id"],
                  a_rec_adv_main_id: user["a_rec_adv_main_id"],
                  a_rec_app_main_id: user["a_rec_app_main_id"],
                  Applicant_First_Name_E: user["Applicant_First_Name_E"],
                  Applicant_First_Name_H: user["Applicant_First_Name_H"],
                  candidate_photo: user["candidate_photo"],
                };

                console.log("🍪 Payload for cookie:", payloadForCookie);

                const cookieString = CryptoJS.AES.encrypt(
                  JSON.stringify(payloadForCookie),
                  "UFP_secret_key"
                ).toString();

              

                const successobj = { cookieString: cookieString };
                return cback(null, successobj);
              }
            );
          });
        },
      ],
      function (err, results) {
        console.log("🔚 Final callback triggered.");
        if (err) {
          console.error("❌ candidateLogin failed:", err);
          return callback(err);
        } else {
          console.log("🎉 candidateLogin successful:", results[1]);
          return callback(null, [results[1]]);
        }
      }
    );
  },
  candidateLogout: function (dbkey, request, params, sessionDetails, callback) {
    if (sessionDetails) {
      dbkey = CONFIG_PARAMS.getloginDBDetails();
      var queryObj = SECURITY_SERVICE_QUERIES.getdeletesessionquery(
        request.session.id
      );
      DB_SERVICE.executeQueryWithParameters(
        dbkey,
        queryObj.query,
        queryObj.params,
        function (err, res) {
          callback(err, res);
        }
      );
    } else {
      return callback("session id not sent in session");
    }
  },
  checkUserAlreadyLogin: function (dbkey, user_id, callback) {
    dbkey = CONFIG_PARAMS.getloginDBDetails();
    let qAndP = SECURITY_SERVICE_QUERIES.getUserSessionDetailsquery(user_id);
    DB_SERVICE.executeQueryWithParameters(
      dbkey,
      qAndP.query,
      qAndP.params,
      function (err, res) {
        if (err) {
          return callback(err);
        } else {
          return callback(null, res.data.length > max_user - 1 ? true : false);
        }
      }
    );
  },

  updateSessionTable: function (dbkey, request, session_id, user_id, callback) {
    dbkey = CONFIG_PARAMS.getloginDBDetails();
    let ip;
    if (request.headers["x-forwarded-for"]) {
      ip = request.headers["x-forwarded-for"].split(",")[0];
    } else if (request.connection && request.connection.remoteAddress) {
      ip = request.connection.remoteAddress;
    } else {
      ip = request.ip;
    }
    let updateObj = { user_id: user_id, ip_address: ip };
    let whereobj = { session_id: session_id };
    let qAndp = DB_SERVICE.getUpdateQueryAndparams(
      updateObj,
      whereobj,
      "sessions"
    );
    DB_SERVICE.executeQueryWithParameters(
      dbkey,
      qAndp.query,
      qAndp.params,
      callback
    );
  },
};
module.exports = scoreCardEntryService;
