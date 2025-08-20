var async = require("async");
var DB_SERVICE = global.DB_SERVICE;
var securityService = global.COMMON_SECURITY_SERVICE;
const SHARED_SERVICE = global.SHARED_SERVICE;
const DOC_UPLOAD_SERVICE = global.DOC_UPLOAD_SERVICE;
const path = require("path");
const fs = require("fs");

let candidateService = {
  saveCandidateScoreCard: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    try {
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

    const detailList = params.scoreFieldDetailList;
    const paramList = params.scoreFieldParameterList;
    const parentRecord = params.parentScore;

    async.series(
      [
        // STEP 1: Upload files to recruitment/registration_no/
        function (cback) {
          if (!request.files || Object.keys(request.files).length === 0) {
            console.log("No files to upload.");
            return cback();
          }

          async.eachOf(
            request.files,
            function (file, controlName, uploadCb) {
              if (!file || !file.name) {
                console.warn(
                  `⚠️ Skipping file upload for '${controlName}' due to missing or invalid file object.`
                );
                return uploadCb();
              }

              const parts = controlName.split("_");
              if (parts.length < 4) {
                console.warn(
                  `⚠️ Skipping invalid file control name: ${controlName}`
                );
                return uploadCb();
              }

              const scoreFieldId = parseInt(parts[1]);
              const paramId = parseInt(parts[2]);
              const index = parts[3];

              const fileNameFromRequest = file.name;
              const ext = path
                .extname(fileNameFromRequest)
                .replace(/\.pdf\.pdf$/, ".pdf");
              const fileName = `${Date.now()}_scorecard_${scoreFieldId}_${paramId}_${index}${ext}`;

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
                  if (err) {
                    console.error(`❌ Upload error for ${controlName}:`, err);
                    return uploadCb(err);
                  }

                  if (res && res.file_path) {
                    const correctFilePath = res.file_path.replace(
                      /\.pdf\.pdf$/,
                      ".pdf"
                    );
                    try {
                      if (res.file_path !== correctFilePath) {
                        fs.renameSync(res.file_path, correctFilePath);
                        console.log(
                          `✅ Renamed file from ${res.file_path} to ${correctFilePath}`
                        );
                      }
                    } catch (renameErr) {
                      console.error(
                        `❌ Failed to rename file ${res.file_path}:`,
                        renameErr
                      );
                      return uploadCb(
                        `Failed to rename file: ${renameErr.message}`
                      );
                    }

                    const param = paramList.find(
                      (p) =>
                        p.m_rec_score_field_id === scoreFieldId &&
                        p.m_rec_score_field_parameter_id === paramId &&
                        p.unique_parameter_display_no === index
                    );

                    if (param) {
                      param.parameter_value = `recruitment/${params.registration_no}/${fileName}`;
                      console.log(
                        `✅ Uploaded and mapped file ${controlName} to ${correctFilePath}, parameter_value: ${param.parameter_value}`
                      );

                      const destPath = path.join(
                        __dirname,
                        "recruitment",
                        params.registration_no,
                        fileName
                      );
                      try {
                        fs.mkdirSync(path.dirname(destPath), {
                          recursive: true,
                        });
                        fs.copyFileSync(correctFilePath, destPath);
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
                    } else {
                      console.warn(
                        `⚠️ File ${controlName} has no matching parameter`
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

        // STEP 2: Create transaction
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

        // STEP 3: Handle Parent Record (check and then insert or update)
        function (cback) {
          if (!parentRecord) {
            console.log("No parent record to handle.");
            return cback();
          }

          const query = `
                SELECT a_rec_app_score_field_detail_id
                FROM a_rec_app_score_field_detail
                WHERE registration_no = ?
                    AND a_rec_app_main_id = ?
                    AND a_rec_adv_post_detail_id = ?
                    AND m_rec_score_field_id = ?
                    AND score_field_parent_id = 0
                    AND delete_flag = 'N'`;
          const queryParams = [
            parentRecord.registration_no,
            parentRecord.a_rec_app_main_id,
            parentRecord.a_rec_adv_post_detail_id,
            parentRecord.m_rec_score_field_id,
          ];

          DB_SERVICE.executeQueryWithParameters(
            dbkey,
            query,
            queryParams,
            function (err, result) {
              if (err) {
                console.error(
                  "❌ Error checking for existing parent record:",
                  err
                );
                return cback(err);
              }

              if (result && result.data && result.data.length > 0) {
                const existingParentId =
                  result.data[0].a_rec_app_score_field_detail_id;
                console.log(
                  `➡️ Updating existing parent record with ID: ${existingParentId}`
                );

                const updateObj = {
                  a_rec_app_score_field_detail_id: existingParentId,
                  score_field_value: parentRecord.score_field_value,
                  score_field_actual_value:
                    parentRecord.score_field_actual_value,
                  score_field_calculated_value:
                    parentRecord.score_field_calculated_value,
                  verify_remark: parentRecord.verify_remark,
                  updated_user_id: sessionDetails.emp_id,
                  updated_ip_address: sessionDetails.ip_address,
                  action_type: "U",
                  action_date: new Date().toISOString(),
                  delete_flag: "N",
                };

                SHARED_SERVICE.validateAndUpdateInTable(
                  dbkey,
                  request,
                  { table_name: "a_rec_app_score_field_detail", ...updateObj },
                  sessionDetails,
                  function (err, res) {
                    if (err) return cback(err);
                    parentRecord.a_rec_app_score_field_detail_id =
                      existingParentId;
                    console.log("✅ Parent record updated successfully.");
                    return cback(null);
                  }
                );
              } else {
                console.log("➡️ Inserting new parent record.");
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
                    if (res && res.insertId) {
                      parentRecord.a_rec_app_score_field_detail_id =
                        res.insertId;
                      detailList.forEach((item) => {
                        item.score_field_parent_id = res.insertId;
                      });
                    }
                    console.log("✅ Parent record inserted successfully.");
                    return cback(null);
                  }
                );
              }
            }
          );
        },

        // STEP 4: Insert into a_rec_app_score_field_detail (children)
        function (cback) {
          if (!detailList.length) return cback();
          console.log(
            `➡️ Inserting ${detailList.length} child detail records.`
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

        // STEP 5: Insert into a_rec_app_score_field_parameter_detail
        function (cback) {
          if (!paramList.length) return cback();
          console.log(
            `➡️ Inserting ${paramList.length} parameter detail records.`
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
              console.log("✅ Candidate scorecard saved successfully.");
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
  updateCandidateScoreCard: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    try {
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

    const detailList = params.scoreFieldDetailList;
    const paramList = params.scoreFieldParameterList;
    const parentRecord = params.parentScore;

    async.series(
      [
        // STEP 1: Upload files to recruitment/registration_no/
        function (cback) {
          if (!request.files || Object.keys(request.files).length === 0) {
            console.log("No files to upload");
            return cback();
          }

          async.eachOf(
            request.files,
            function (file, controlName, uploadCb) {
              if (!file || !file.name) {
                console.warn(
                  `⚠️ Skipping file upload for '${controlName}' due to missing or invalid file object.`
                );
                return uploadCb();
              }

              const parts = controlName.split("_");
              if (parts.length < 4) {
                console.warn(
                  `⚠️ Skipping invalid file control name: ${controlName}`
                );
                return uploadCb();
              }

              const scoreFieldId = parseInt(parts[1]);
              const paramId = parseInt(parts[2]);
              const index = parts[3];

              const fileNameFromRequest = file.name;
              const ext = path
                .extname(fileNameFromRequest)
                .replace(/\.pdf\.pdf$/, ".pdf");
              const fileName = `${Date.now()}_scorecard_${scoreFieldId}_${paramId}_${index}${ext}`;

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
                  if (err) {
                    console.error(`❌ Upload error for ${controlName}:`, err);
                    return uploadCb(err);
                  }

                  if (res && res.file_path) {
                    const correctFilePath = res.file_path.replace(
                      /\.pdf\.pdf$/,
                      ".pdf"
                    );
                    try {
                      if (res.file_path !== correctFilePath) {
                        fs.renameSync(res.file_path, correctFilePath);
                        console.log(
                          `✅ Renamed file from ${res.file_path} to ${correctFilePath}`
                        );
                      }
                    } catch (renameErr) {
                      console.error(
                        `❌ Failed to rename file ${res.file_path}:`,
                        renameErr
                      );
                      return uploadCb(
                        `Failed to rename file: ${renameErr.message}`
                      );
                    }

                    const param = paramList.find(
                      (p) =>
                        p.m_rec_score_field_id === scoreFieldId &&
                        p.m_rec_score_field_parameter_id === paramId &&
                        p.parameter_display_no === index
                    );

                    if (param) {
                      param.parameter_value = `recruitment/${params.registration_no}/${fileName}`;
                      console.log(
                        `✅ Uploaded and mapped file ${controlName} to ${correctFilePath}, parameter_value: ${param.parameter_value}`
                      );

                      const destPath = path.join(
                        __dirname,
                        "recruitment",
                        params.registration_no,
                        fileName
                      );
                      try {
                        fs.mkdirSync(path.dirname(destPath), {
                          recursive: true,
                        });
                        fs.copyFileSync(correctFilePath, destPath);
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
                    } else {
                      console.warn(
                        `⚠️ File ${controlName} has no matching parameter`
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

        // STEP 2: Create transaction
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

        // STEP 3: Update Parent Record
        function (cback) {
          if (!parentRecord) {
            console.log("No parent record to update.");
            return cback();
          }

          console.log("➡️ Updating existing parent record.");
          const updateObj = {
            a_rec_app_score_field_detail_id:
              parentRecord.a_rec_app_score_field_detail_id,
            score_field_value: parentRecord.score_field_value,
            score_field_actual_value: parentRecord.score_field_actual_value,
            score_field_calculated_value:
              parentRecord.score_field_calculated_value,
            verify_remark: parentRecord.verify_remark,
            updated_user_id: sessionDetails.emp_id,
            updated_ip_address: sessionDetails.ip_address,
            action_type: "U",
            action_date: new Date().toISOString(),
            delete_flag: "N",
          };

          SHARED_SERVICE.validateAndUpdateInTable(
            dbkey,
            request,
            { table_name: "a_rec_app_score_field_detail", ...updateObj },
            sessionDetails,
            function (err, res) {
              if (err) {
                console.error("❌ Error updating parent record:", err);
                return cback(err);
              }
              console.log("✅ Parent record updated successfully.");
              return cback(null);
            }
          );
        },

        // STEP 4: Update a_rec_app_score_field_detail records (children)
        function (cback) {
          if (!detailList.length) return cback();

          async.eachSeries(
            detailList,
            function (detail, detailCb) {
              if (!detail.a_rec_app_score_field_detail_id) {
                console.warn("⚠️ Skipping detail without primary key:", detail);
                return detailCb();
              }

              const updateObj = {
                score_field_value: detail.score_field_value,
                score_field_actual_value: detail.score_field_actual_value,
                score_field_calculated_value:
                  detail.score_field_calculated_value,
                updated_user_id: sessionDetails.emp_id,
                updated_ip_address: sessionDetails.ip_address,
              };

              const whereObj = {
                a_rec_app_score_field_detail_id:
                  detail.a_rec_app_score_field_detail_id,
              };

              SHARED_SERVICE.validateAndUpdateInTable(
                dbkey,
                request,
                {
                  table_name: "a_rec_app_score_field_detail",
                  ...updateObj,
                  ...whereObj,
                },
                sessionDetails,
                detailCb
              );
            },
            cback
          );
        },

        // STEP 5: Update a_rec_app_score_field_parameter_detail records
        function (cback) {
          if (!paramList.length) return cback();

          async.eachSeries(
            paramList,
            function (param, paramCb) {
              if (!param.a_rec_app_score_field_parameter_detail_id) {
                console.warn(
                  "⚠️ Skipping parameter without primary key:",
                  param
                );
                return paramCb();
              }

              const updateObj = {
                parameter_value: param.parameter_value,
                updated_user_id: sessionDetails.user_id,
                updated_ip_address: sessionDetails.ip_address,
              };

              const whereObj = {
                a_rec_app_score_field_parameter_detail_id:
                  param.a_rec_app_score_field_parameter_detail_id,
              };

              SHARED_SERVICE.validateAndUpdateInTable(
                dbkey,
                request,
                {
                  table_name: "a_rec_app_score_field_parameter_detail",
                  ...updateObj,
                  ...whereObj,
                },
                sessionDetails,
                paramCb
              );
            },
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
              console.error("❌ Error updating candidate scorecard:", err);
              return callback({
                status: "error",
                message: "Failed to update candidate scorecard",
                details: err,
              });
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              console.log("✅ Candidate scorecard updated successfully.");
              return callback(null, {
                status: "success",
                message: "Candidate scorecard updated successfully",
              });
            }
          );
        }
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

              const fileName = `${controlName}_${
                params.registration_no
              }_${Date.now()}${ext}`;
              const uploadOptions = {
                file_name: fileName,
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
                    const filePath = `recruitment/${params.registration_no}/${fileName}`;
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
                      fileName
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
