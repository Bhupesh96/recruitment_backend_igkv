var async = require("async");
var DB_SERVICE = global.DB_SERVICE;
var securityService = global.COMMON_SECURITY_SERVICE;
const SHARED_SERVICE = global.SHARED_SERVICE;
const DOC_UPLOAD_SERVICE = global.DOC_UPLOAD_SERVICE;
const path = require("path");
const fs = require("fs");

let candidateService = {
  saveOrUpdateCandidateScoreCard: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    // STEP 0: Parse request body (no changes here)
    try {
      if (request.files) {
        console.log(
          "📂 Incoming Files:",
          JSON.stringify(
            Object.keys(request.files).map((k) => ({
              key: k,
              file_keys: Object.keys(request.files[k] || {}),
              has_data: !!(request.files[k] && request.files[k].data),
              data_length: request.files[k]?.data?.length || 0,
              originalFilename: request.files[k]?.originalFilename,
            })),
            null,
            2
          )
        );
      } else {
        console.log("📂 No files found in request.");
      }
      params.registration_no = request.body.registration_no;
      params.scoreFieldDetailList = JSON.parse(
        request.body.scoreFieldDetailList || "[]"
      );
      params.scoreFieldParameterList = JSON.parse(
        request.body.scoreFieldParameterList || "[]"
      );
      params.parentScore = request.body.parentScore
        ? JSON.parse(request.body.parentScore)
        : null;
    } catch (e) {
      return callback({
        status: "error",
        message:
          "Invalid JSON in scoreFieldDetailList, scoreFieldParameterList, or parentScore",
        details: e.message,
      });
    }

    // Use 'let' to allow re-assignment after filtering
    let detailList = params.scoreFieldDetailList;
    let paramList = params.scoreFieldParameterList;
    const parentRecord = params.parentScore;

    async.series(
      [
        // STEP 1: Upload files (no changes here)
        function (cback) {
          if (!request.files || Object.keys(request.files).length === 0) {
            return cback();
          }
          async.eachOf(
            request.files,
            function (file, controlName, uploadCb) {
              if (!file || !file.name) {
                return uploadCb();
              }
              const parts = controlName.split("_");
              if (parts.length < 6) {
                return uploadCb();
              }
              const subHeadingId = parseInt(parts[1]);
              const scoreFieldId = parseInt(parts[2]);
              const paramId = parseInt(parts[3]);
              const rowIndex = parseInt(parts[5]);
              const baseName = path.parse(file.name).name;
              const sanitizedName = baseName
                .replace(/[^a-zA-Z0-9._-]/g, "_")
                .replace(/_+/g, "_")
                .replace(/^_+|_+$/g, "");
              const fileName = `${params.registration_no}_${subHeadingId}_${scoreFieldId}_${paramId}_${rowIndex}_${sanitizedName}`;
              const uploadOptions = {
                file_name: fileName,
                file_buffer: file.data,
                control_name: controlName,
                folder_name: `recruitment/${params.registration_no}`,
              };
              DOC_UPLOAD_SERVICE.docUploadWithFolder(
                dbkey,
                request,
                uploadOptions,
                sessionDetails,
                function (err, res) {
                  if (err) return uploadCb(err);
                  if (res && res.file_path) {
                    const paramIndex = paramList.findIndex(
                      (p) =>
                        p.score_field_parent_id === subHeadingId &&
                        p.m_rec_score_field_id === scoreFieldId &&
                        p.m_rec_score_field_parameter_new_id === paramId &&
                        p.parameter_row_index === rowIndex
                    );
                    if (paramIndex !== -1) {
                      const finalFileName = path.basename(res.file_path);
                      paramList[
                        paramIndex
                      ].parameter_value = `recruitment/${params.registration_no}/${finalFileName}`;
                    }
                    return uploadCb();
                  } else {
                    return uploadCb(`File upload failed for ${controlName}`);
                  }
                }
              );
            },
            cback
          );
        },

        // STEP 2: Create transaction (no changes here)
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

        // STEP 3: Handle Parent Record (Upsert Logic - no changes here)
        function (cback) {
          if (!parentRecord) return cback();
          if (parentRecord.a_rec_app_score_field_detail_id) {
            const updateObj = {
              table_name: "a_rec_app_score_field_detail",
              ...parentRecord,
              action_ip_address: sessionDetails.ip_address,
            };
            SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              updateObj,
              sessionDetails,
              cback
            );
          } else {
            SHARED_SERVICE.validateAndInsertInTable(
              dbkey,
              request,
              {
                table_name: "a_rec_app_score_field_detail",
                ...parentRecord,
              },
              sessionDetails,
              function (err, res) {
                if (err) return cback(err);
                if (res && res.data.insertId) {
                  parentRecord.a_rec_app_score_field_detail_id =
                    res.data.insertId;
                }
                return cback(null);
              }
            );
          }
        },

        // ✅ NEW STEP 3.5: Handle Deletions
        function (cback) {
          // Find records that are marked for deletion AND already exist in the DB
          const detailsToDelete = detailList.filter(
            (d) => d.delete_flag === "Y" && d.a_rec_app_score_field_detail_id
          );

          if (detailsToDelete.length === 0) {
            return cback();
          }

          console.log(
            `➡️ Deleting ${detailsToDelete.length} child detail records.`
          );

          // Process each deletion one by one
          async.eachSeries(
            detailsToDelete,
            (detailToDelete, eachCb) => {
              const detailId = detailToDelete.a_rec_app_score_field_detail_id;

              // Delete child parameters first, then the parent detail record
              async.series(
                [
                  // A. Delete Parameters associated with this detail record
                  function (deleteParamsCb) {
                    const deleteParamsPayload = {
                      delete_table_name:
                        "a_rec_app_score_field_parameter_detail",
                      whereObj: { a_rec_app_score_field_detail_id: detailId },
                    };
                    SHARED_SERVICE.insrtAndDltOperation(
                      dbkey,
                      request,
                      deleteParamsPayload,
                      sessionDetails,
                      deleteParamsCb
                    );
                  },
                  // B. Delete the main detail record itself
                  function (deleteDetailCb) {
                    const deleteDetailPayload = {
                      delete_table_name: "a_rec_app_score_field_detail",
                      whereObj: { a_rec_app_score_field_detail_id: detailId },
                    };
                    SHARED_SERVICE.insrtAndDltOperation(
                      dbkey,
                      request,
                      deleteDetailPayload,
                      sessionDetails,
                      deleteDetailCb
                    );
                  },
                ],
                eachCb
              ); // End of inner async.series
            },
            (err) => {
              // Final callback for async.eachSeries
              if (err) return cback(err);

              // IMPORTANT: Filter the main lists to remove the deleted items
              // so they aren't processed in the next steps.
              const deletedDetailIds = detailsToDelete.map(
                (d) => d.a_rec_app_score_field_detail_id
              );
              detailList = detailList.filter(
                (d) =>
                  !deletedDetailIds.includes(d.a_rec_app_score_field_detail_id)
              );
              paramList = paramList.filter(
                (p) =>
                  !deletedDetailIds.includes(p.a_rec_app_score_field_detail_id)
              );

              return cback();
            }
          );
        },

        // ✅ MODIFIED STEP 4: Handle Child Detail Records (Updates & Inserts)
        function (cback) {
          if (!detailList || detailList.length === 0) return cback();

          const detailsToUpdate = detailList.filter(
            (d) => d.a_rec_app_score_field_detail_id
          );
          const detailsToInsert = detailList.filter(
            (d) => !d.a_rec_app_score_field_detail_id
          );

          async.series(
            [
              function (updateCallback) {
                if (detailsToUpdate.length === 0) return updateCallback();
                console.log(
                  `➡️ Updating ${detailsToUpdate.length} existing child detail records.`
                );
                async.eachSeries(
                  detailsToUpdate,
                  (detail, eachCb) => {
                    SHARED_SERVICE.validateAndUpdateInTable(
                      dbkey,
                      request,
                      { table_name: "a_rec_app_score_field_detail", ...detail },
                      sessionDetails,
                      eachCb
                    );
                  },
                  updateCallback
                );
              },
              function (insertCallback) {
                if (detailsToInsert.length === 0) return insertCallback();
                console.log(
                  `➡️ Inserting ${detailsToInsert.length} new child detail records individually.`
                );
                async.eachSeries(
                  detailsToInsert,
                  (detail, eachCb) => {
                    SHARED_SERVICE.validateAndInsertInTable(
                      dbkey,
                      request,
                      { table_name: "a_rec_app_score_field_detail", ...detail },
                      sessionDetails,
                      (err, res) => {
                        if (err) return eachCb(err);
                        const newDetailId = res.data.insertId;
                        if (!newDetailId) {
                          return eachCb(
                            new Error(
                              "Insert operation did not return a new ID."
                            )
                          );
                        }

                        paramList.forEach((param) => {
                          let isMatch = false;

                          // Strategy for Academic Excellence (Method ID 3)
                          if (detail.m_rec_score_field_method_id === 3) {
                            if (
                              param.score_field_parent_id ===
                                detail.score_field_parent_id &&
                              param.m_rec_score_field_id ===
                                detail.m_rec_score_field_id
                            ) {
                              isMatch = true;
                            }
                          }
                          // Strategy for Experience Page (Method ID 2 or other)
                          else {
                            if (
                              param.score_field_parent_id ===
                                detail.score_field_parent_id &&
                              param.m_rec_score_field_id ===
                                detail.m_rec_score_field_id &&
                              param.parameter_row_index ===
                                detail.score_field_row_index
                            ) {
                              isMatch = true;
                            }
                          }

                          if (isMatch) {
                            param.a_rec_app_score_field_detail_id = newDetailId;
                            console.log(
                              `✅ Linked new detail ID ${newDetailId} to param for item ${param.m_rec_score_field_id}`
                            );
                          }
                        });

                        eachCb();
                      }
                    );
                  },
                  insertCallback
                );
              },
            ],
            cback
          );
        },

        // ✅ MODIFIED STEP 5: Handle Parameter Records
        function (cback) {
          // The main 'paramList' has already been filtered
          if (!paramList.length) return cback();

          console.log(
            `➡️ Processing ${paramList.length} parameter records for insert/update.`
          );
          async.eachSeries(
            paramList,
            function (param, paramCb) {
              param.action_ip_address = sessionDetails.ip_address;
              if (param.a_rec_app_score_field_parameter_detail_id) {
                SHARED_SERVICE.validateAndUpdateInTable(
                  dbkey,
                  request,
                  {
                    table_name: "a_rec_app_score_field_parameter_detail",
                    ...param,
                  },
                  sessionDetails,
                  paramCb
                );
              } else {
                SHARED_SERVICE.validateAndInsertInTable(
                  dbkey,
                  request,
                  {
                    table_name: "a_rec_app_score_field_parameter_detail",
                    ...param,
                  },
                  sessionDetails,
                  paramCb
                );
              }
            },
            cback
          );
        },
      ],
      // Final callback (no changes here)
      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              console.error("❌ Error processing candidate scorecard:", err);
              return callback({
                status: "error",
                message: "Failed to process candidate scorecard",
                details: err.message || err,
              });
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              console.log(
                "✅ Candidate scorecard processed successfully (C/U/D)."
              );
              return callback(null, {
                status: "success",
                message: "Candidate scorecard processed successfully",
              });
            }
          );
        }
      }
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

    // Parse mainPayload and languages from FormData
    try {
      params.mainPayload = JSON.parse(params.mainPayload || "{}");
      params.languages = JSON.parse(params.languages || "[]");
    } catch (e) {
      return callback({
        status: "ERROR",
        message: "Invalid JSON in mainPayload or languages",
        details: e.message,
      });
    }

    async.series(
      [
        // 1. Upload files to recruitment/registration_no/
        function (cback) {
          if (!request.files || Object.keys(request.files).length === 0) {
            console.log("⚠️ No files to upload");
            return cback();
          }

          async.eachOf(
            request.files,
            function (file, controlName, uploadCb) {
              const allowedImageTypes = [".jpg", ".jpeg", ".png"];
              const ext = path.extname(file.name).toLowerCase();
              if (!allowedImageTypes.includes(ext)) {
                console.error(
                  `❌ Invalid file type for ${controlName}: ${ext}`
                );
                return uploadCb({
                  message: `Invalid file type for ${controlName}. Only JPG and PNG are allowed`,
                  code: "INVALID_FILE_TYPE",
                });
              }

              const fileNameWithoutExt = `${controlName}_${
                params.registration_no
              }_${Date.now()}`;
              const uploadOptions = {
                file_name: fileNameWithoutExt,
                control_name: controlName,
                folder_name: `recruitment/${params.registration_no}`,
              };

              DOC_UPLOAD_SERVICE.docUploadWithFolder(
                dbkey,
                request,
                uploadOptions,
                sessionDetails,
                function (err, res) {
                  if (err) {
                    console.error(`❌ Upload error for ${controlName}:`, err);
                    return uploadCb(err);
                  }

                  if (res && res.file_path) {
                    const fullFileName = `${fileNameWithoutExt}${ext}`;
                    const filePath = `recruitment/${params.registration_no}/${fullFileName}`;
                    console.log(
                      `✅ Uploaded file ${controlName} to ${filePath}`
                    );

                    // Store file path in mainPayload
                    if (controlName === "photo") {
                      params.mainPayload.candidate_photo = filePath;
                    } else if (controlName === "signature") {
                      params.mainPayload.candidate_signature = filePath;
                    }

                    // Copy file to project_root/recruitment/registration_no/
                    const destPath = path.join(
                      __dirname,
                      "recruitment",
                      params.registration_no,
                      fileNameWithoutExt
                    );
                    try {
                      fs.mkdirSync(path.dirname(destPath), { recursive: true });
                      fs.copyFileSync(res.file_path, destPath);
                      console.log(`✅ Copied file to ${destPath}`);
                    } catch (copyErr) {
                      console.error(
                        `❌ Failed to copy file to ${destPath}:`,
                        copyErr
                      );
                      return uploadCb(
                        `Failed to copy file: ${copyErr.message}`
                      );
                    }

                    return uploadCb();
                  } else {
                    console.error(
                      `❌ Upload failed for ${controlName}: No file_path returned`
                    );
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

        // 2. Start transaction
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
              // Set transaction isolation level to READ COMMITTED
              DB_SERVICE.executeQueryWithParameters(
                dbkey,
                "SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED",
                [],
                function (err) {
                  if (err) {
                    console.error(
                      "❌ Failed to set transaction isolation level:",
                      err
                    );
                    return cback(err);
                  }
                  return cback();
                }
              );
            }
          );
        },

        // 3. Check if record exists using primary key(s)
        function (cback1) {
          SHARED_SERVICE.generateJoiValidatorFromTable(
            {
              table_name: params.table_name,
              database_name: params.database_name,
            },
            function (err, result) {
              if (err) {
                console.error("❌ Error generating Joi validator:", err);
                return cback1(err);
              }
              const { primary_key_arr } = result;
              if (!primary_key_arr || primary_key_arr.length === 0) {
                return cback1({
                  message: `Primary key not found for table ${params.table_name}`,
                });
              }

              let whereObj = {};
              for (let key of primary_key_arr) {
                if (!params.mainPayload[key]) {
                  return cback1({
                    message: `Missing primary key value for ${key}`,
                  });
                }
                whereObj[key] = params.mainPayload[key];
              }

              let query =
                `SELECT * FROM ${params.table_name} WHERE ` +
                Object.keys(whereObj)
                  .map((k) => `${k} = ?`)
                  .join(" AND ") +
                ` LIMIT 1`;
              let values = Object.values(whereObj);

              DB_SERVICE.executeQueryWithParameters(
                dbkey,
                query,
                values,
                function (err, res) {
                  if (err) {
                    console.error("❌ Error checking record existence:", err);
                    return cback1(err);
                  }
                  params._existingCandidate = res.data && res.data.length > 0;
                  return cback1();
                }
              );
            }
          );
        },

        // 4. Perform insert or update based on existence
        function (cback2) {
          if (params._existingCandidate) {
            console.log("🟢 Candidate exists, performing update...");
            SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              {
                ...params.mainPayload,
                table_name: "a_rec_app_main",
                database_name: params.database_name,
              },
              sessionDetails,
              function (err, res) {
                if (err) {
                  console.error("❌ Error updating candidate:", err);
                  return cback2(err);
                }
                console.log("✅ Candidate updated successfully");
                return cback2(null, res);
              }
            );
          } else {
            console.log("🟡 Candidate does not exist, performing insert...");
            SHARED_SERVICE.validateAndInsertInTable(
              dbkey,
              request,
              {
                ...params.mainPayload,
                table_name: "a_rec_app_main",
                database_name: params.database_name,
              },
              sessionDetails,
              function (err, res) {
                if (err) {
                  console.error("❌ Error inserting candidate:", err);
                  return cback2(err);
                }
                console.log("✅ Candidate inserted successfully");
                return cback2(null, res);
              }
            );
          }
        },

        // 5. Update a_rec_registration table
        function (cback3) {
          const registrationUpdateParams = {
            table_name: "a_rec_registration",
            database_name: params.database_name,
            registration_no: Number(params.mainPayload.registration_no),
            post_code: Number(params.mainPayload.post_code),
            subject_id: Number(params.mainPayload.subject_id),
            a_rec_adv_main_id: Number(params.mainPayload.a_rec_adv_main_id),
          };

          SHARED_SERVICE.validateAndUpdateInTable(
            dbkey,
            request,
            registrationUpdateParams,
            sessionDetails,
            function (err, res) {
              if (err) {
                console.error("❌ Error updating a_rec_registration:", err);
                return cback3(err);
              }
              console.log("✅ Successfully updated a_rec_registration");
              return cback3(null, res);
            }
          );
        },

        // 6. Update language details
        function (cback4) {
          console.log("🔍 Checking language details to update...");

          if (
            !params.languages ||
            !Array.isArray(params.languages) ||
            params.languages.length === 0
          ) {
            console.warn(
              "⚠️ No language data provided or array is empty. Skipping update."
            );
            return cback4();
          }

          console.log(
            "📦 Incoming language array:",
            JSON.stringify(params.languages, null, 2)
          );
          console.log("🧹 Attempting to delete existing language records for:");
          console.log(
            "   - registration_no:",
            params.mainPayload.registration_no
          );
          console.log(
            "   - a_rec_adv_main_id:",
            params.mainPayload.a_rec_adv_main_id
          );

          // Delete existing records using insrtAndDltOperation
          let deleteParams = {
            delete_table_name: "a_rec_app_language_detail",
            whereObj: {
              registration_no: Number(params.mainPayload.registration_no),
              a_rec_adv_main_id: Number(params.mainPayload.a_rec_adv_main_id),
            },
          };

          SHARED_SERVICE.insrtAndDltOperation(
            dbkey,
            request,
            deleteParams,
            sessionDetails,
            function (deleteErr, deleteRes) {
              if (deleteErr) {
                console.error(
                  "❌ Failed to delete old language data:",
                  deleteErr
                );
                return cback4(deleteErr);
              }

              console.log(
                `✅ Deleted ${deleteRes.length || 0} old language records`
              );

              // Insert new language records
              async.eachSeries(
                params.languages,
                function (lang, cb) {
                  let langInsertObj = {
                    database_name: lang.database_name || params.database_name,
                    table_name: "a_rec_app_language_detail",
                    registration_no: Number(
                      lang.registration_no || params.mainPayload.registration_no
                    ),
                    a_rec_adv_main_id: Number(
                      lang.a_rec_adv_main_id ||
                        params.mainPayload.a_rec_adv_main_id
                    ),
                    m_rec_language_type_id: Number(lang.m_rec_language_type_id),
                    m_rec_language_id: Number(lang.m_rec_language_id),
                    m_rec_language_skill_id: Number(
                      lang.m_rec_language_skill_id
                    ),
                    created_user_id: sessionDetails.emp_id,
                    created_ip_address: sessionDetails.ip_address,
                  };

                  console.log(
                    "🔹 Inserting language record:",
                    JSON.stringify(langInsertObj, null, 2)
                  );

                  SHARED_SERVICE.validateAndInsertInTable(
                    dbkey,
                    request,
                    langInsertObj,
                    sessionDetails,
                    function (err, res) {
                      if (err) {
                        console.error("❌ Language insert failed:", err);
                        return cb(err);
                      }
                      console.log(
                        "✅ Language inserted successfully:",
                        JSON.stringify(res, null, 2)
                      );
                      return cb();
                    }
                  );
                },
                function (err) {
                  if (err) {
                    console.error(
                      "❌ Error occurred while inserting language details:",
                      err
                    );
                    return cback4(err);
                  }
                  console.log("✅ All language records inserted successfully");
                  return cback4(null);
                }
              );
            }
          );
        },
      ],
      function (err) {
        if (err) {
          console.error("❌ Rolling back transaction due to error:", err);
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              return callback({
                status: "ERROR",
                message:
                  "Failed to update candidate details: " +
                  (err.message || JSON.stringify(err)),
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
                data: {
                  photo_path: params.mainPayload.candidate_photo,
                  signature_path: params.mainPayload.candidate_signature,
                },
              });
            }
          );
        }
      }
    );
  },
};

module.exports = candidateService;
