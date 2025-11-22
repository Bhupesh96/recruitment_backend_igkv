var async = require("async");
var securityService = global.COMMON_SECURITY_SERVICE;
const bcrypt = require("bcrypt");
const CryptoJS = require("crypto-js");
const config = require("config");
const encryption_key = config.get("encryption_key");
let publicApiService = {
  // add service functions here
  getLatestAdvertisementForLogin: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    sessionDetails.query_id = 108;
    return DB_SERVICE.getQueryDataFromId(
      dbkey,
      request,
      params,
      sessionDetails,
      callback
    );
  },
  getPostByAdvertimentForLogin: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    sessionDetails.query_id = 120;
    return DB_SERVICE.getQueryDataFromId(
      dbkey,
      request,
      params,
      sessionDetails,
      callback
    );
  },
  getAcademicSessionForLogin: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    sessionDetails.query_id = 80;
    return DB_SERVICE.getQueryDataFromId(
      dbkey,
      request,
      params,
      sessionDetails,
      callback
    );
  },
  getSubjectsByPostDetailIdForLogin: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    sessionDetails.query_id = 107;
    return DB_SERVICE.getQueryDataFromId(
      dbkey,
      request,
      params,
      sessionDetails,
      callback
    );
  },
  saveCandidateRegistrationDetail: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    async.series(
      [
        // Step 1: Create DB Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) return cback(err);
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback();
            }
          );
        },

        // Step 2: Decrypt CryptoJS password and re-encrypt with bcrypt
        function (cback) {
          try {
            const bytes = CryptoJS.AES.decrypt(params.password, encryption_key);
            const plainPassword = bytes.toString(CryptoJS.enc.Utf8);
            console.log("plainPassword", plainPassword);
            if (!plainPassword) {
              return cback({ message: "Password decryption failed" });
            }

            // 🔒 Hash with bcrypt
            const bcryptHash = bcrypt.hashSync(plainPassword, 10);
            params.password = bcryptHash;

            console.log("Password: " + bcryptHash);
            return cback();
          } catch (e) {
            return cback({ message: "Error decrypting password", error: e });
          }
        },
        // Step 3: Generate registration_no
        function (cback) {
          const sessionId = params.academic_session_id;

          const query = `
                    SELECT MAX(registration_no) AS maxRegNo
                    FROM a_rec_registration
                    WHERE academic_session_id = ?;
                `;

          tranObj.query(query, [sessionId], function (err, result) {
            if (err) return cback(err);

            let newRegNo;
            if (result && result[0] && result[0].maxRegNo) {
              console.log("maX:", result[0].maxRegNo);
              newRegNo = parseInt(result[0].maxRegNo, 10) + 1;
              console.log("nEW:", newRegNo);
            } else {
              newRegNo = parseInt(sessionId.toString() + "000001", 10);
            }

            params.registration_no = newRegNo;
            console.log("gENEATED ", newRegNo);
            console.log("pARAMA", params.registration_no);
            console.log("dATA ", JSON.stringify(params, null, 2));
            console.log("Generated registration_no:", newRegNo);
            return cback();
          });
        },
        // Step 4: Insert into a_rec_registration
        function (cback) {
          const registrationObj = {
            table_name: "a_rec_registration",

            registration_no: params.registration_no, // ✅ custom logic
            academic_session_id: params.academic_session_id,
            email_id: params.email_id,
            mobile_no: params.mobile_no,
            password: params.password, // bcrypt hash
            a_rec_adv_main_id: params.a_rec_adv_main_id,
            post_code: params.post_code || 0,
            subject_id: params.subject_id || null,
            category_id: params.category_id,
            // Audit fields
            action_type: params.actionType || "C",
            action_date: new Date(),
            action_ip_address: sessionDetails.ip_address,
            action_remark: "Registration Created",
            action_by: parseInt(params.actionBy) || 0,
            delete_flag: "N",
          };

          SHARED_SERVICE.validateAndInsertInTable(
            dbkey,
            request,
            registrationObj,
            sessionDetails,
            function (err, res) {
              if (err) return cback(err);
              return cback();
            }
          );
        },
      ],
      function (err) {
        if (err) {
          // Check if the error is a duplicate entry from the database
          if (err.code === "ER_DUP_ENTRY") {
            let userMessage = "This user already exists.";

            // Check which unique key caused the error
            if (err.sqlMessage.includes("for key 'mobile_no'")) {
              userMessage = "This mobile number is already registered.";
            } else if (err.sqlMessage.includes("for key 'email_id'")) {
              userMessage = "This email address is already registered.";
            }

            // Create a new, clean error object to send to the frontend
            const customError = { message: userMessage };

            // Rollback the transaction and send the user-friendly error
            DB_SERVICE.rollbackPartialTransaction(
              tranObj,
              tranCallback,
              function () {
                return callback(customError);
              }
            );
          } else {
            // For all other types of errors, send the original error
            DB_SERVICE.rollbackPartialTransaction(
              tranObj,
              tranCallback,
              function () {
                return callback(err);
              }
            );
          }
        } else {
          // Commit the transaction on success
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              return callback(null, {
                ...securityService.SECURITY_ERRORS.SUCCESS,
                message: "Registration saved successfully.",
                registration_no: params.registration_no,
              });
            }
          );
        }
      }
    );
  },
  getAdvCategoryList: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    sessionDetails.query_id = 176;
    return DB_SERVICE.getQueryDataFromId(
      dbkey,
      request,
      params,
      sessionDetails,
      callback
    );
  },
};
module.exports = publicApiService;
