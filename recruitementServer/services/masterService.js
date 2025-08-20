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
  getCandidateLoginDetails: function (
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
  saveCandidateDetail: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    console.log("🧩 Using dbkey:", dbkey);
    console.log(
      "🟢 saveCandidateDetail called with payload:",
      JSON.stringify(params, null, 2)
    );

    if (!params.database_name) {
      return callback({ message: "Missing required database_name in request" });
    }

    async.series(
      [
        // STEP 0: Handle file uploads (photo, sign, etc.)
        function (cback) {
          if (!request.files || Object.keys(request.files).length === 0) {
            console.log("No files uploaded");
            return cback();
          }

          async.eachOf(
            request.files,
            function (file, controlName, uploadCb) {
              const ext = path
                .extname(file.name)
                .replace(/\.pdf\.pdf$/, ".pdf");
              const fileName = `${Date.now()}_${controlName}${ext}`;
              const folderPath = `recruitment/${params.registration_no}`;

              const uploadOptions = {
                file_name: fileName,
                control_name: controlName,
                folder_name: folderPath,
              };

              DOC_UPLOAD_SERVICE.docUploadWithFolder(
                dbkey,
                request,
                uploadOptions,
                sessionDetails,
                function (err, res) {
                  if (err) {
                    console.error(`❌ Upload failed for ${controlName}:`, err);
                    return uploadCb(err);
                  }

                  const finalPath = res.file_path.replace(
                    /\.pdf\.pdf$/,
                    ".pdf"
                  );
                  const destPath = path.join(
                    __dirname,
                    "recruitment",
                    params.registration_no,
                    fileName
                  );

                  try {
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    fs.copyFileSync(finalPath, destPath);
                    console.log(`✅ Copied ${controlName} to ${destPath}`);
                  } catch (copyErr) {
                    console.error(
                      `❌ Failed to copy ${controlName}:`,
                      copyErr.message
                    );
                    return uploadCb(copyErr);
                  }

                  // Save file path into params for DB insert/update
                  params[controlName] = `${folderPath}/${fileName}`;
                  console.log(
                    `✅ Mapped ${controlName} to ${params[controlName]}`
                  );
                  return uploadCb();
                }
              );
            },
            function (err) {
              return cback(err);
            }
          );
        },

        // STEP 1: Start Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) {
                console.error("❌ Error creating transaction:", err);
                return cback(err);
              }
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              console.log("✅ Transaction started");
              return cback();
            }
          );
        },

        // STEP 2: Insert/Update a_rec_app_main
        function (cback1) {
          const query = `SELECT a_rec_app_main_id FROM a_rec_app_main WHERE registration_no = ? LIMIT 1`;
          DB_SERVICE.executeQueryWithParameters(
            dbkey,
            query,
            [params.registration_no],
            function (err, result) {
              if (err) return cback1(err);

              params.table_name = "a_rec_app_main";

              if (result.data && result.data.length > 0) {
                console.log("🔁 Registration exists. Performing update.");
                params.a_rec_app_main_id = result.data[0].a_rec_app_main_id;
                return SHARED_SERVICE.validateAndUpdateInTable(
                  dbkey,
                  request,
                  params,
                  sessionDetails,
                  cback1
                );
              } else {
                console.log("🆕 New registration. Performing insert.");
                return SHARED_SERVICE.validateAndInsertInTable(
                  dbkey,
                  request,
                  params,
                  sessionDetails,
                  function (err, res) {
                    if (err) return cback1(err);
                    if (res.data && res.data.insertId) {
                      params.a_rec_app_main_id = res.data.insertId;
                      console.log("✅ Inserted with ID:", res.data.insertId);
                      return cback1();
                    } else {
                      return cback1({
                        message: "Insert failed: no insertId returned",
                      });
                    }
                  }
                );
              }
            }
          );
        },

        // STEP 3: Delete and insert language details
        function (cback2) {
          if (!params.languages || !Array.isArray(params.languages)) {
            console.warn("⚠️ No language data to insert.");
            return cback2();
          }

          console.log("🧹 Deleting existing language details...");
          const deleteQuery = `
          DELETE FROM a_rec_app_language_detail
          WHERE registration_no = ? AND a_rec_adv_main_id = ?
        `;

          DB_SERVICE.executeQueryWithParameters(
            dbkey,
            deleteQuery,
            [params.registration_no, params.a_rec_adv_main_id],
            function (err) {
              if (err) return cback2(err);

              console.log("🗣️ Inserting updated language details...");
              async.eachSeries(
                params.languages,
                function (lang, cb) {
                  const langInsertObj = {
                    database_name: lang.database_name || params.database_name,
                    table_name: "a_rec_app_language_detail",
                    registration_no: lang.registration_no,
                    a_rec_adv_main_id: lang.a_rec_adv_main_id,
                    m_rec_language_type_id: lang.m_rec_language_type_id,
                    m_rec_language_id: lang.m_rec_language_id,
                    m_rec_language_skill_id: lang.m_rec_language_skill_id,
                  };

                  SHARED_SERVICE.validateAndInsertInTable(
                    dbkey,
                    request,
                    langInsertObj,
                    sessionDetails,
                    cb
                  );
                },
                cback2
              );
            }
          );
        },
      ],

      // Final transaction commit/rollback
      function (err) {
        if (err) {
          console.error("❌ Rolling back transaction:", err);
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              return callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              console.log("✅ Candidate details saved successfully.");
              return callback(null, {
                status: "SUCCESS",
                message: "Candidate details saved successfully",
              });
            }
          );
        }
      }
    );
  },
  updateCandidateDetail: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    console.log("🧩 Using dbkey:", dbkey);
    console.log(
      "🟠 updateCandidateDetail called with payload:",
      JSON.stringify(params, null, 2)
    );

    if (!params.database_name) {
      return callback({ message: "Missing required database_name in request" });
    }

    async.series(
      [
        // STEP 0: Upload files if provided
        function (cback) {
          if (!request.files || Object.keys(request.files).length === 0) {
            console.log("📁 No files uploaded");
            return cback();
          }

          async.eachOf(
            request.files,
            function (file, controlName, uploadCb) {
              const ext = path
                .extname(file.name)
                .replace(/\.pdf\.pdf$/, ".pdf");
              const fileName = `${Date.now()}_${controlName}${ext}`;
              const folderPath = `recruitment/${params.registration_no}`;

              const uploadOptions = {
                file_name: fileName,
                control_name: controlName,
                folder_name: folderPath,
              };

              DOC_UPLOAD_SERVICE.docUploadWithFolder(
                dbkey,
                request,
                uploadOptions,
                sessionDetails,
                function (err, res) {
                  if (err) {
                    console.error(`❌ Upload failed for ${controlName}:`, err);
                    return uploadCb(err);
                  }

                  const correctPath = res.file_path.replace(
                    /\.pdf\.pdf$/,
                    ".pdf"
                  );
                  const destPath = path.join(
                    __dirname,
                    "recruitment",
                    params.registration_no,
                    fileName
                  );

                  try {
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    fs.copyFileSync(correctPath, destPath);
                    console.log(`✅ Copied ${controlName} to ${destPath}`);
                  } catch (copyErr) {
                    console.error(
                      `❌ Copy failed for ${controlName}:`,
                      copyErr
                    );
                    return uploadCb(copyErr);
                  }

                  // Map to params for DB update
                  params[controlName] = `${folderPath}/${fileName}`;
                  console.log(
                    `📥 Set params[${controlName}] = ${params[controlName]}`
                  );
                  return uploadCb();
                }
              );
            },
            function (err) {
              return cback(err);
            }
          );
        },

        // STEP 1: Start transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) {
                console.error("❌ Error creating transaction:", err);
                return cback(err);
              }
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              console.log("✅ Transaction started");

              DB_SERVICE.executeQueryWithParameters(
                dbkey,
                "SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED",
                [],
                function (err) {
                  if (err) {
                    console.error("❌ Failed to set isolation level:", err);
                    return cback(err);
                  }
                  return cback();
                }
              );
            }
          );
        },

        // STEP 2: Check if candidate exists
        function (cback1) {
          SHARED_SERVICE.generateJoiValidatorFromTable(
            {
              table_name: params.table_name,
              database_name: params.database_name,
            },
            function (err, result) {
              if (err) return cback1(err);
              const { primary_key_arr } = result;
              if (!primary_key_arr?.length) {
                return cback1({
                  message: `Missing primary key for ${params.table_name}`,
                });
              }

              const whereObj = {};
              for (let key of primary_key_arr) {
                if (!params[key])
                  return cback1({ message: `Missing key: ${key}` });
                whereObj[key] = params[key];
              }

              const query =
                `SELECT * FROM ${params.table_name} WHERE ` +
                Object.keys(whereObj)
                  .map((k) => `${k} = ?`)
                  .join(" AND ") +
                ` LIMIT 1`;

              DB_SERVICE.executeQueryWithParameters(
                dbkey,
                query,
                Object.values(whereObj),
                (err, res) => {
                  if (err) return cback1(err);
                  params._existingCandidate = res.data?.length > 0;
                  return cback1();
                }
              );
            }
          );
        },

        // STEP 3: Insert or Update main table
        function (cback2) {
          const method = params._existingCandidate
            ? SHARED_SERVICE.validateAndUpdateInTable
            : SHARED_SERVICE.validateAndInsertInTable;

          console.log(
            `🔁 ${
              params._existingCandidate ? "Updating" : "Inserting"
            } candidate...`
          );
          method(dbkey, request, params, sessionDetails, function (err, res) {
            if (err) return cback2(err);
            console.log(
              `✅ Candidate ${
                params._existingCandidate ? "updated" : "inserted"
              } successfully`
            );
            return cback2(null, res);
          });
        },

        // STEP 4: Update a_rec_registration
        function (cback3) {
          const regParams = {
            table_name: "a_rec_registration",
            database_name: params.database_name,
            registration_no: Number(params.registration_no),
            post_code: Number(params.post_code),
            subject_id: Number(params.subject_id),
            a_rec_adv_main_id: Number(params.a_rec_adv_main_id),
          };

          SHARED_SERVICE.validateAndUpdateInTable(
            dbkey,
            request,
            regParams,
            sessionDetails,
            (err, res) => {
              if (err) return cback3(err);
              console.log("✅ a_rec_registration updated");
              return cback3(null, res);
            }
          );
        },

        // STEP 5: Update language details
        function (cback4) {
          if (!Array.isArray(params.languages) || !params.languages.length) {
            console.log("⚠️ No language data. Skipping.");
            return cback4();
          }

          const deleteParams = {
            delete_table_name: "a_rec_app_language_detail",
            whereObj: {
              registration_no: Number(params.registration_no),
              a_rec_adv_main_id: Number(params.a_rec_adv_main_id),
            },
          };

          SHARED_SERVICE.insrtAndDltOperation(
            dbkey,
            request,
            deleteParams,
            sessionDetails,
            function (deleteErr) {
              if (deleteErr) return cback4(deleteErr);

              async.eachSeries(
                params.languages,
                function (lang, cb) {
                  const insertObj = {
                    table_name: "a_rec_app_language_detail",
                    database_name: lang.database_name || params.database_name,
                    registration_no: Number(
                      lang.registration_no || params.registration_no
                    ),
                    a_rec_adv_main_id: Number(
                      lang.a_rec_adv_main_id || params.a_rec_adv_main_id
                    ),
                    m_rec_language_type_id: Number(lang.m_rec_language_type_id),
                    m_rec_language_id: Number(lang.m_rec_language_id),
                    m_rec_language_skill_id: Number(
                      lang.m_rec_language_skill_id
                    ),
                    created_user_id: sessionDetails.emp_id,
                    created_ip_address: sessionDetails.ip_address,
                  };

                  SHARED_SERVICE.validateAndInsertInTable(
                    dbkey,
                    request,
                    insertObj,
                    sessionDetails,
                    cb
                  );
                },
                function (err) {
                  if (err) return cback4(err);
                  console.log("✅ Language details inserted");
                  return cback4();
                }
              );
            }
          );
        },
      ],
      function (err) {
        if (err) {
          console.error("❌ Rolling back transaction:", err);
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              return callback({
                status: "ERROR",
                message:
                  "Update failed: " + (err.message || JSON.stringify(err)),
              });
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              console.log("✅ Transaction committed successfully");
              return callback(null, {
                status: "SUCCESS",
                message: params._existingCandidate
                  ? "Candidate details updated successfully"
                  : "Candidate details inserted successfully",
                languagesUpdated: !!params.languages?.length,
              });
            }
          );
        }
      }
    );
  },
  saveCandidateScoreCardDetails: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    // ✅ Parse FormData fields safely
    try {
      params.registration_no = request.body.registration_no;
      params.scoreFieldDetailList = JSON.parse(
        request.body.scoreFieldDetailList || "[]"
      );
      params.scoreFieldParameterList = JSON.parse(
        request.body.scoreFieldParameterList || "[]"
      );
    } catch (e) {
      return callback({
        status: "error",
        message:
          "Invalid JSON in scoreFieldDetailList or scoreFieldParameterList",
        details: e.message,
      });
    }

    console.log("✅ Parsed registration_no:", params.registration_no);
    console.log("✅ Detail List Count:", params.scoreFieldDetailList.length);
    console.log("✅ Param List Count:", params.scoreFieldParameterList.length);

    const detailList = params.scoreFieldDetailList;
    const paramList = params.scoreFieldParameterList;

    async.series(
      [
        // ✅ STEP 1: Upload files
        function (cback) {
          if (!request.files || Object.keys(request.files).length === 0) {
            console.log("No files to upload");
            return cback();
          }

          async.eachOf(
            request.files,
            function (file, controlName, uploadCb) {
              // controlName: file_8_66_0
              const parts = controlName.split("_");
              if (parts.length < 4)
                return uploadCb(`Invalid control name: ${controlName}`);

              const scoreFieldId = parseInt(parts[1]);
              const paramId = parseInt(parts[2]);
              const index = parts[3];

              const uploadOptions = {
                file_name: `${Date.now()}_scorecard_${scoreFieldId}_${paramId}_${index}${path.extname(
                  file.name
                )}`,
                control_name: controlName,
                folder_name: `scorecard_${params.registration_no}`,
              };

              DOC_UPLOAD_SERVICE.docUploadWithFolder(
                dbkey,
                request,
                uploadOptions,
                sessionDetails,
                function (err, res) {
                  if (err) return uploadCb(err);

                  if (res && res.file_path) {
                    // Inject file path into correct parameter entry
                    const param = paramList.find(
                      (p) =>
                        p.m_rec_score_field_id === scoreFieldId &&
                        p.m_rec_score_field_parameter_id === paramId &&
                        p.unique_parameter_display_no === index
                    );

                    if (param) {
                      param.parameter_value = res.file_path;
                      console.log(
                        `✅ Uploaded and mapped file ${controlName} to parameter_value`
                      );
                    } else {
                      console.warn(
                        `⚠️ File ${controlName} has no matching parameter`
                      );
                    }

                    return uploadCb();
                  } else {
                    return uploadCb(`File upload failed for ${controlName}`);
                  }
                }
              );
            },
            function (err) {
              return cback(err);
            }
          );
        },

        // ✅ STEP 2: Create transaction
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

        // ✅ STEP 3: Insert into a_rec_app_score_field_detail
        function (cback) {
          if (!detailList.length) return cback();
          console.log(
            `➡️ Inserting ${detailList.length} score field detail records`
          );
          SHARED_SERVICE.validateAndInsertArrInTable(
            dbkey,
            request,
            {
              table_name: "a_rec_app_score_field_detail",
              data_arr: detailList,
            },
            sessionDetails,
            cback
          );
        },

        // ✅ STEP 4: Insert into a_rec_app_score_field_parameter_detail
        function (cback) {
          if (!paramList.length) return cback();
          console.log(
            `➡️ Inserting ${paramList.length} parameter detail records`
          );
          SHARED_SERVICE.validateAndInsertArrInTable(
            dbkey,
            request,
            {
              table_name: "a_rec_app_score_field_parameter_detail",
              data_arr: paramList,
            },
            sessionDetails,
            cback
          );
        },
      ],
      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              console.error("❌ Error saving candidate scorecard:", err);
              return callback({
                status: "error",
                message: "Failed to save candidate scorecard",
                details: err,
              });
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              console.log("✅ Candidate scorecard saved successfully");
              return callback(null, {
                status: "success",
                message: "Candidate scorecard saved successfully",
              });
            }
          );
        }
      }
    );
  },
  loginCandidate: function (dbkey, request, params, sessionDetails, callback) {
    console.log(
      "🔐 [loginCandidate] Called with params:",
      JSON.stringify(params)
    );

    if (!params.registration_no || !params.password) {
      return callback({
        status: "error",
        message: "Missing registration_no or password",
      });
    }

    // Call your internal function that uses query_id (e.g., 301)
    masterService.getCandidateLoginDetails(
      dbkey,
      request,
      { registration_no: params.registration_no }, // only reg_no needed for lookup
      sessionDetails,
      function (err, result) {
        if (err) {
          console.error("❌ Error fetching candidate login details:", err);
          return callback({
            status: "error",
            message: "Login failed due to query error",
            details: err,
          });
        }

        const candidate = result && result[0];
        if (!candidate) {
          return callback({
            status: "error",
            message: "Invalid registration number",
          });
        }

        if (candidate.password !== params.password) {
          return callback({
            status: "error",
            message: "Invalid password",
          });
        }

        // Login successful
        console.log("✅ Candidate authenticated:", candidate.registration_no);
        return callback(null, {
          status: "success",
          message: "Login successful",
          data: {
            registration_no: candidate.registration_no,
            name: candidate.name || null,
            email: candidate.email || null,
            // add any other fields if required
          },
        });
      }
    );
  },

  // getPostType: function (dbkey, request, params, sessionDetails, callback) {
  //     return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  // },
  // getPayBandCommission: function (dbkey, request, params, sessionDetails, callback) {
  //     return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  // },
};
module.exports = masterService;
