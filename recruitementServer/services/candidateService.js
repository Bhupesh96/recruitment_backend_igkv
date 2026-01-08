var async = require("async");
var DB_SERVICE = global.DB_SERVICE;
var securityService = global.COMMON_SECURITY_SERVICE;
const SHARED_SERVICE = global.SHARED_SERVICE;
const DOC_UPLOAD_SERVICE = global.DOC_UPLOAD_SERVICE;
const path = require("path");
const fs = require("fs");

let candidateService = {
  //candidate
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
          DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, () =>
            callback(err)
          );
        } else {
          DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
            callback(null, {
              ...securityService.SECURITY_ERRORS.SUCCESS,
              message: "Candidate Data saved successfully",
            });
          });
        }
      }
    );
  },

  saveOrUpdateQuantityBasedCandidateDetails: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    // STEP 0: Parse request body
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

      // Parse the array of parameter IDs to be deleted.
      params.parameterIdsToDelete = JSON.parse(
        request.body.parameterIdsToDelete || "[]"
      );
    } catch (e) {
      return callback({
        status: "error",
        message: "Invalid JSON in request body",
        details: e.message,
      });
    }

    // Use 'let' to allow re-assignment after filtering
    let detailList = params.scoreFieldDetailList;
    let paramList = params.scoreFieldParameterList;
    const parentRecord = params.parentScore;
    const parameterIdsToDelete = params.parameterIdsToDelete;

    async.series(
      [
        // STEP 1: Upload files
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

        // STEP 3: Handle Parent Record
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

        // STEP 4: Handle Deletion of SUMMARY detail records via flag
        function (cback) {
          const detailsToDelete = detailList.filter(
            (d) => d.delete_flag === "Y" && d.a_rec_app_score_field_detail_id
          );
          if (detailsToDelete.length === 0) {
            return cback();
          }
          console.log(
            `➡️ Deleting ${detailsToDelete.length} summary detail records and their parameters.`
          );
          async.eachSeries(
            detailsToDelete,
            (detailToDelete, eachCb) => {
              const detailId = detailToDelete.a_rec_app_score_field_detail_id;
              async.series(
                [
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
              );
            },
            (err) => {
              if (err) return cback(err);
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

        // ⭐ STEP 5: HANDLE DELETION OF SPECIFIC PARAMETER RECORDS (NEW LOGIC) ⭐
        function (cback) {
          if (!parameterIdsToDelete || parameterIdsToDelete.length === 0) {
            console.log("➡️ No specific parameter records to delete.");
            return cback(); // Nothing to delete, move to the next step.
          }

          console.log(
            `➡️ Deleting ${parameterIdsToDelete.length} specified parameter records.`
          );

          // Loop through each ID provided by the frontend and delete it.
          async.eachSeries(
            parameterIdsToDelete,
            (parameterId, eachCb) => {
              const deletePayload = {
                delete_table_name: "a_rec_app_score_field_parameter_detail",
                whereObj: {
                  a_rec_app_score_field_parameter_detail_id: parameterId,
                },
              };
              SHARED_SERVICE.insrtAndDltOperation(
                dbkey,
                request,
                deletePayload,
                sessionDetails,
                eachCb
              );
            },
            cback // Final callback for the eachSeries loop
          );
        },

        // STEP 6: Handle Child Detail Records Upserts
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
                          if (
                            param.score_field_parent_id ===
                              detail.score_field_parent_id &&
                            param.m_rec_score_field_id ===
                              detail.m_rec_score_field_id
                          ) {
                            param.a_rec_app_score_field_detail_id = newDetailId;
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

        // STEP 7: Handle Parameter Records Upserts
        function (cback) {
          if (!paramList || paramList.length === 0) return cback();

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
      // Final callback
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
          DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
            callback(null, {
              ...securityService.SECURITY_ERRORS.SUCCESS,
              message: "Candidate Data saved successfully",
            });
          });
        }
      }
    );
  },

  saveOrUpdateFullCandidateProfile: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    console.log("🟢 saveOrUpdateFullCandidateProfile called");

    // STEP 1: Parse all incoming payloads from FormData
    try {
      params.mainPayload = JSON.parse(request.body.mainPayload || "{}");
      params.languages = JSON.parse(request.body.languages || "[]");
      params.additionalInfo = JSON.parse(request.body.additionalInfo || "[]");
      params.additionalInfoQuestions = JSON.parse(
        request.body.additionalInfoQuestions || "[]"
      );
      params.additionalInfoIdsToDelete = JSON.parse(
        request.body.additionalInfoIdsToDelete || "[]"
      );

      console.log("📦 Received mainPayload:", params.mainPayload);
      console.log("📦 Received languages:", params.languages);
      console.log("📦 Received additionalInfo:", params.additionalInfo);
      console.log(
        "🗑️ Received additionalInfoIdsToDelete:",
        params.additionalInfoIdsToDelete
      );
    } catch (e) {
      return callback({
        status: "error",
        message: "Invalid JSON in request body",
        details: e.message,
      });
    }

    const registrationNo = params.mainPayload.registration_no;
    const incomingInfoList = params.additionalInfo;

    async.series(
      [
        // STEP 2: Handle ALL file uploads
        function (cback) {
          if (!request.files || Object.keys(request.files).length === 0) {
            console.log(
              "📝 No new files were uploaded. Skipping file processing step."
            );
            return cback();
          }

          console.log(
            `🚀 Processing ${
              Object.keys(request.files).length
            } uploaded files...`
          );
          async.eachOf(
            request.files,
            (file, controlName, uploadCb) => {
              if (!file || !file.name) return uploadCb();

              let uploadOptions = {};
              const folderPath = `recruitment/${registrationNo}`;
              let baseFileName = "";

              if (controlName === "photo" || controlName === "signature") {
                baseFileName = `${controlName}_${registrationNo}_${Date.now()}`;
              } else if (controlName.startsWith("additional_")) {
                const parts = controlName.split("_");
                if (parts.length < 4) return uploadCb();
                const questionId = parseInt(parts[1]);
                const conditionId = parseInt(parts[3]);
                const sanitizedName = path
                  .parse(file.name)
                  .name.replace(/[^a-zA-Z0-9._-]/g, "_");
                baseFileName = `${registrationNo}_${questionId}_${conditionId}_${sanitizedName}`;
              } else {
                return uploadCb();
              }

              uploadOptions = {
                file_name: baseFileName,
                folder_name: folderPath,
                control_name: controlName,
              };

              DOC_UPLOAD_SERVICE.docUploadWithFolder(
                dbkey,
                request,
                uploadOptions,
                sessionDetails,
                (err, res) => {
                  if (err) return uploadCb(err);
                  if (!res || !res.file_path)
                    return uploadCb(`Upload failed for ${controlName}`);

                  const finalFilePath = path.basename(res.file_path);
                  const dbPath = `${folderPath}/${finalFilePath}`;

                  if (controlName === "photo") {
                    params.mainPayload.candidate_photo = dbPath;
                  } else if (controlName === "signature") {
                    params.mainPayload.candidate_signature = dbPath;
                  } else if (controlName.startsWith("additional_")) {
                    const parts = controlName.split("_");
                    const questionId = parseInt(parts[1]);
                    const optionId = parseInt(parts[2]);
                    const conditionId = parseInt(parts[3]);
                    const recordIndex = incomingInfoList.findIndex(
                      (info) =>
                        info.question_id === questionId &&
                        info.option_id === optionId &&
                        info.condition_id === conditionId
                    );
                    if (recordIndex !== -1) {
                      incomingInfoList[recordIndex].input_field = dbPath;
                    }
                  }
                  return uploadCb();
                }
              );
            },
            cback
          );
        },

        // STEP 3: Start Transaction
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

        // STEP 4: Update Main Candidate Details
        function (cback) {
          // Sanitize empty strings to null, which is good for the database
          Object.keys(params.mainPayload).forEach((key) => {
            if (params.mainPayload[key] === "") {
              params.mainPayload[key] = null;
            }
          });

          const payload = {
            ...params.mainPayload,
            table_name: "a_rec_app_main",
            database_name: "igkv_Recruitment",
          };

          // Check if we are updating an existing record or inserting a new one
          if (payload.a_rec_app_main_id) {
            // --- UPDATE PATH ---
            // The record already exists, so we update it.
            console.log(
              `🔄 Updating existing record in a_rec_app_main with ID: ${payload.a_rec_app_main_id}`
            );
            SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              payload,
              sessionDetails,
              cback
            );
          } else {
            // --- INSERT PATH ---
            // The record is new, so we insert it.
            console.log(
              `➕ Inserting new record into a_rec_app_main for registration_no: ${payload.registration_no}`
            );
            // It's good practice to remove the null primary key before inserting.
            delete payload.a_rec_app_main_id;
            SHARED_SERVICE.validateAndInsertInTable(
              dbkey,
              request,
              payload,
              sessionDetails,
              (err, res) => {
                if (err) return cback(err);

                console.log("INSERT RESPONSE:", res);

                // Extract insertId from ANY structure
                const insertId = res?.data?.insertId;

                if (!insertId) {
                  console.warn("⚠️ No insertId returned from insert service");
                }

                params.savedAppId = insertId;
                cback();
              }
            );
          }
        },

        // STEP 5: Update Language Details
        function (cback) {
          if (!params.languages || params.languages.length === 0) {
            return cback();
          }
          const deletePayload = {
            delete_table_name: "a_rec_app_language_detail",
            whereObj: {
              registration_no: Number(registrationNo),
              a_rec_adv_main_id: Number(params.mainPayload.a_rec_adv_main_id),
            },
          };

          SHARED_SERVICE.insrtAndDltOperation(
            dbkey,
            request,
            deletePayload,
            sessionDetails,
            (deleteErr) => {
              if (deleteErr) return cback(deleteErr);
              async.eachSeries(
                params.languages,
                (lang, insertCb) => {
                  const insertPayload = {
                    ...lang,
                    table_name: "a_rec_app_language_detail",
                    database_name: "igkv_Recruitment",
                  };
                  SHARED_SERVICE.validateAndInsertInTable(
                    dbkey,
                    request,
                    insertPayload,
                    sessionDetails,
                    insertCb
                  );
                },
                cback
              );
            }
          );
        },

        // STEP 6: ⭐ CORRECTED LOGIC - Delete orphaned Additional Information records
        function (cback) {
          const idsToDelete = params.additionalInfoIdsToDelete;
          if (!idsToDelete || idsToDelete.length === 0) {
            console.log("📝 No additional info records marked for deletion.");
            return cback();
          }

          console.log(
            `🗑️ Deleting ${idsToDelete.length} specified additional info records one by one.`
          );

          // Iterate over each ID and delete it individually using the correct 'whereObj' key
          async.eachSeries(
            idsToDelete,
            (recordIdToDelete, eachCb) => {
              const deletePayload = {
                delete_table_name: "a_rec_app_main_addtional_info",
                // The service expects 'whereObj'
                whereObj: {
                  a_rec_app_main_addtional_info_id: recordIdToDelete,
                },
              };
              SHARED_SERVICE.insrtAndDltOperation(
                dbkey,
                request,
                deletePayload,
                sessionDetails,
                eachCb // Callback for the next item in the loop
              );
            },
            cback // Final callback for when the entire loop is finished
          );
        },

        // STEP 7: Upsert the remaining Additional Information records
        function (cback) {
          if (!incomingInfoList || incomingInfoList.length === 0) {
            console.log("📝 No additional info records to upsert.");
            return cback();
          }

          incomingInfoList.forEach((record) => {
            if (record.condition_id === null) {
              const question = params.additionalInfoQuestions.find(
                (q) => q.question_id === record.question_id
              );
              if (question && question.options) {
                const selectedOption = question.options.find(
                  (o) => o.option_id === record.option_id
                );
                if (selectedOption) {
                  record.input_field = selectedOption.option_value;
                }
              }
            }
          });

          console.log(
            `🔄 Processing ${incomingInfoList.length} additional info records for insert/update.`
          );

          async.eachSeries(
            incomingInfoList,
            (incomingRecord, eachCb) => {
              if (incomingRecord.a_rec_app_main_addtional_info_id) {
                // UPDATE existing record
                const updatePayload = {
                  table_name: "a_rec_app_main_addtional_info",
                  ...incomingRecord,
                };
                SHARED_SERVICE.validateAndUpdateInTable(
                  dbkey,
                  request,
                  updatePayload,
                  sessionDetails,
                  eachCb
                );
              } else {
                // INSERT new record
                const insertPayload = {
                  table_name: "a_rec_app_main_addtional_info",
                  registration_no: registrationNo,
                  ...incomingRecord,
                };
                delete insertPayload.a_rec_app_main_addtional_info_id;
                SHARED_SERVICE.validateAndInsertInTable(
                  dbkey,
                  request,
                  insertPayload,
                  sessionDetails,
                  eachCb
                );
              }
            },
            cback
          );
        },
      ],
      // Final Callback (Commit/Rollback)
      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, () =>
            callback(err)
          );
        } else {
          DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
            callback(null, {
              ...securityService.SECURITY_ERRORS.SUCCESS,
              message: "Candidate Data saved successfully",
              data: {
                a_rec_app_main_id: params.savedAppId,

                // ✅ Only First Name (English)
                first_name_E: params.mainPayload.Applicant_First_Name_E || null,

                // ✅ Only First Name (Hindi)
                first_name_H: params.mainPayload.Applicant_First_Name_H || null,

                // ✅ Candidate Photo Path
                candidate_photo: params.mainPayload.candidate_photo || null,
              },
            });
          });
        }
      }
    );
  },
  updateFinalDeclaration: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let registration_no, a_rec_app_main_id; // Declare both variables

    try {
      // ✅ Read both required fields from the request body
      registration_no = request.body.registration_no;
      a_rec_app_main_id = request.body.a_rec_app_main_id;

      // ✅ Validate that both fields exist
      if (!registration_no || !a_rec_app_main_id) {
        throw new Error("Registration number and Application ID are required.");
      }
    } catch (e) {
      return callback({
        status: "error",
        message: "Invalid request body",
        details: e.message,
      });
    }

    console.log(
      `📝 Marking final declaration for registration_no: ${registration_no}, a_rec_app_main_id: ${a_rec_app_main_id}`
    );

    // This is the data for the update operation
    const updatePayload = {
      table_name: "a_rec_app_main",
      // --- Fields for the WHERE clause ---
      registration_no: registration_no,
      a_rec_app_main_id: a_rec_app_main_id, // ✅ Pass the ID for precise targeting
      // --- Field to be SET ---
      Is_Final_Decl_YN: "Y", // Set the declaration flag to 'Yes'
    };

    // Use the existing SHARED_SERVICE service to perform the update securely
    SHARED_SERVICE.validateAndUpdateInTable(
      dbkey,
      request,
      updatePayload,
      sessionDetails,
      (err, result) => {
        if (err) {
          console.error("❌ Error updating final declaration:", err);
          return callback(err);
        }
        console.log(
          `✅ Successfully updated final declaration for ${registration_no}`
        );
        return callback(null, {
          ...securityService.SECURITY_ERRORS.SUCCESS,
          message: "Application successfully submitted.",
        });
      }
    );
  },

  //screening
  saveOrUpdateCandidateScoreCardForScreening: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    // STEP 0: Parse request body from FormData
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
        message: "Invalid JSON in request body",
        details: e.message,
      });
    }

    const detailList = params.scoreFieldDetailList;
    let paramList = params.scoreFieldParameterList;
    const parentRecord = params.parentScore;

    async.series(
      [
        // STEP 1: Handle File Uploads (No changes needed here)
        function (cback) {
          if (!request.files || Object.keys(request.files).length === 0) {
            console.log("📝 No new files to upload for screening.");
            return cback();
          }
          console.log(
            `🚀 Processing ${
              Object.keys(request.files).length
            } files for screening...`
          );

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
                      console.log(
                        `    ✔️ Updated path for param ${paramId} to: ${paramList[paramIndex].parameter_value}`
                      );
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

        // STEP 2: Create a database transaction
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

        // STEP 3: Handle the Parent Score Record
        function (cback) {
          if (!parentRecord) return cback();
          if (parentRecord.a_rec_app_score_field_detail_id) {
            SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              { table_name: "a_rec_app_score_field_detail", ...parentRecord },
              sessionDetails,
              cback
            );
          } else {
            SHARED_SERVICE.validateAndInsertInTable(
              dbkey,
              request,
              { table_name: "a_rec_app_score_field_detail", ...parentRecord },
              sessionDetails,
              (err, res) => {
                if (err) return cback(err);
                if (res && res.data.insertId) {
                  parentRecord.a_rec_app_score_field_detail_id =
                    res.data.insertId;
                }
                return cback();
              }
            );
          }
        },

        // STEP 4: Process the Child Detail Records
        function (cback) {
          if (!detailList || detailList.length === 0) return cback();

          // ✅ REVISED LOGIC: Use 'action_type' to reliably determine insert vs. update.
          // This makes the backend independent of any flags and respects the frontend's intent.
          const detailsToUpdate = detailList.filter(
            (d) => d.action_type === "U"
          );
          const detailsToInsert = detailList.filter(
            (d) => d.action_type === "C"
          );

          async.series(
            [
              // Process all updates and deletions first
              (updateCb) => {
                if (detailsToUpdate.length === 0) return updateCb();
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
                  updateCb
                );
              },
              // Process all new insertions
              (insertCb) => {
                if (detailsToInsert.length === 0) return insertCb();
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
                        const newId = res.data.insertId;
                        // Assign the newly created detail_id to its corresponding parameters
                        paramList.forEach((p) => {
                          if (
                            p.score_field_parent_id ===
                              detail.score_field_parent_id &&
                            p.m_rec_score_field_id ===
                              detail.m_rec_score_field_id &&
                            p.parameter_row_index ===
                              detail.score_field_row_index
                          ) {
                            p.a_rec_app_score_field_detail_id = newId;
                          }
                        });
                        eachCb();
                      }
                    );
                  },
                  insertCb
                );
              },
            ],
            cback
          );
        },

        // STEP 5: Process the Parameter Records
        function (cback) {
          if (!paramList || paramList.length === 0) return cback();

          // ✅ REVISED LOGIC: Split parameters based on the presence of a primary key ID.
          // This is the most reliable method for child records.
          const paramsToUpdate = paramList.filter(
            (p) => p.a_rec_app_score_field_parameter_detail_id
          );
          const paramsToInsert = paramList.filter(
            (p) => !p.a_rec_app_score_field_parameter_detail_id
          );

          async.series(
            [
              // Process updates for existing parameters
              (updateCb) => {
                if (paramsToUpdate.length === 0) return updateCb();
                async.eachSeries(
                  paramsToUpdate,
                  (param, eachCb) => {
                    SHARED_SERVICE.validateAndUpdateInTable(
                      dbkey,
                      request,
                      {
                        table_name: "a_rec_app_score_field_parameter_detail",
                        ...param,
                      },
                      sessionDetails,
                      eachCb
                    );
                  },
                  updateCb
                );
              },
              // Process inserts for new parameters
              (insertCb) => {
                if (paramsToInsert.length === 0) return insertCb();
                async.eachSeries(
                  paramsToInsert,
                  (param, eachCb) => {
                    // Ensure the parameter has a detail_id before inserting
                    if (!param.a_rec_app_score_field_detail_id) {
                      console.warn(
                        "Skipping parameter insert due to missing detail_id:",
                        param
                      );
                      return eachCb();
                    }
                    SHARED_SERVICE.validateAndInsertInTable(
                      dbkey,
                      request,
                      {
                        table_name: "a_rec_app_score_field_parameter_detail",
                        ...param,
                      },
                      sessionDetails,
                      eachCb
                    );
                  },
                  insertCb
                );
              },
            ],
            cback
          );
        },
      ],
      // Final Callback
      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, () =>
            callback(err)
          );
        } else {
          DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
            callback(null, {
              ...securityService.SECURITY_ERRORS.SUCCESS,
              message: "Candidate screening data saved successfully.",
            });
          });
        }
      }
    );
  },
  saveOrUpdateExperienceDetailsForScreening: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    const rowIndexToDetailIdMap = new Map(); // ✅ Map to store the correct FK for each row index.

    // STEP 0: Parse request body (no changes)
    try {
      params.scoreFieldDetailList = JSON.parse(
        request.body.scoreFieldDetailList || "[]"
      );
      params.scoreFieldParameterList = JSON.parse(
        request.body.scoreFieldParameterList || "[]"
      );
      params.parentScore = JSON.parse(request.body.parentScore || "null");
    } catch (e) {
      return callback({
        status: "error",
        message: "Invalid JSON in request body",
        details: e.message,
      });
    }

    const detailList = params.scoreFieldDetailList;
    const paramList = params.scoreFieldParameterList;
    const parentRecord = params.parentScore;

    async.series(
      [
        // STEP 1 & 2: Create transaction and handle parent score (no changes)
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
        function (cback) {
          if (!parentRecord) return cback();
          if (parentRecord.a_rec_app_score_field_detail_id) {
            SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              { table_name: "a_rec_app_score_field_detail", ...parentRecord },
              sessionDetails,
              cback
            );
          } else {
            SHARED_SERVICE.validateAndInsertInTable(
              dbkey,
              request,
              { table_name: "a_rec_app_score_field_detail", ...parentRecord },
              sessionDetails,
              cback
            );
          }
        },

        // ✅ REVISED STEP 3: Process details and build the FK map
        function (cback) {
          if (!detailList || detailList.length === 0) return cback();

          async.eachSeries(
            detailList,
            (detail, detailCb) => {
              // If it's a new record, insert it and add the new ID to our map.
              if (detail.action_type === "C") {
                SHARED_SERVICE.validateAndInsertInTable(
                  dbkey,
                  request,
                  { table_name: "a_rec_app_score_field_detail", ...detail },
                  sessionDetails,
                  (err, res) => {
                    if (err) return detailCb(err);
                    const newDetailId = res.data.insertId;
                    rowIndexToDetailIdMap.set(
                      detail.score_field_row_index,
                      newDetailId
                    );
                    return detailCb();
                  }
                );
              }
              // If it's an existing record, update it and add its existing ID to our map.
              else if (detail.action_type === "U") {
                rowIndexToDetailIdMap.set(
                  detail.score_field_row_index,
                  detail.a_rec_app_score_field_detail_id
                );
                SHARED_SERVICE.validateAndUpdateInTable(
                  dbkey,
                  request,
                  { table_name: "a_rec_app_score_field_detail", ...detail },
                  sessionDetails,
                  detailCb
                );
              } else {
                return detailCb(); // Skip if no action type
              }
            },
            cback
          );
        },

        // ✅ REVISED STEP 4: Process all parameters using the map to guarantee the correct FK
        function (cback) {
          if (!paramList || paramList.length === 0) return cback();

          async.eachSeries(
            paramList,
            (param, paramCb) => {
              // Get the correct foreign key from the map we built in the previous step.
              const correctDetailId = rowIndexToDetailIdMap.get(
                param.parameter_row_index
              );

              if (!correctDetailId) {
                console.warn(
                  `Skipping parameter because its row index (${param.parameter_row_index}) did not match any detail record.`
                );
                return paramCb();
              }

              // **This is the key fix**: Enforce the correct FK, overwriting anything from the frontend.
              param.a_rec_app_score_field_detail_id = correctDetailId;

              // Now, proceed with the original upsert logic for the parameter itself.
              if (param.action_type === "C") {
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
              } else if (param.action_type === "U") {
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
                return paramCb();
              }
            },
            cback
          );
        },
      ],
      // Final callback (Commit/Rollback)
      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, () =>
            callback(err)
          );
        } else {
          DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
            callback(null, {
              ...securityService.SECURITY_ERRORS.SUCCESS,
              message: "Experience data saved successfully.",
            });
          });
        }
      }
    );
  },
  saveOrUpdateQuantityBasedCandidateDetailsForScreening: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback; // STEP 0: Parse request body

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
        : null; // ⭐ MODIFICATION: Intentionally ignore any deletion payloads from the frontend. // params.parameterIdsToDelete is no longer parsed.
    } catch (e) {
      return callback({
        status: "error",
        message: "Invalid JSON in request body",
        details: e.message,
      });
    } // ⭐ MODIFICATION: Filter out any potential delete_flag requests.

    const detailList = params.scoreFieldDetailList.filter(
      (d) => d.delete_flag !== "Y"
    );
    const paramList = params.scoreFieldParameterList;
    const parentRecord = params.parentScore; // Ensure all records are flagged for screening ('E')

    if (parentRecord) {
      parentRecord.Application_Step_Flag_CES = "E";
    }
    detailList.forEach((d) => (d.Application_Step_Flag_CES = "E"));
    paramList.forEach((p) => (p.Application_Step_Flag_CES = "E"));

    async.series(
      [
        // ⭐ MODIFICATION: File upload step has been completely removed.

        // STEP 1: Create transaction
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
        }, // STEP 2: Handle Parent Record

        function (cback) {
          if (!parentRecord) return cback();
          if (parentRecord.a_rec_app_score_field_detail_id) {
            SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              { table_name: "a_rec_app_score_field_detail", ...parentRecord },
              sessionDetails,
              cback
            );
          } else {
            SHARED_SERVICE.validateAndInsertInTable(
              dbkey,
              request,
              { table_name: "a_rec_app_score_field_detail", ...parentRecord },
              sessionDetails,
              (err, res) => {
                if (err) return cback(err);
                if (res && res.data.insertId) {
                  parentRecord.a_rec_app_score_field_detail_id =
                    res.data.insertId;
                }
                return cback();
              }
            );
          }
        }, // ⭐ MODIFICATION: Explicit deletion steps for parameterIdsToDelete are removed. // STEP 3: Handle Child Detail Records Upserts (uses filtered list)

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
              (updateCb) => {
                if (detailsToUpdate.length === 0) return updateCb();
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
                  updateCb
                );
              },
              (insertCb) => {
                if (detailsToInsert.length === 0) return insertCb();
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
                        if (!newDetailId)
                          return eachCb(
                            new Error("Insert did not return a new ID.")
                          );

                        paramList.forEach((param) => {
                          if (
                            param.score_field_parent_id ===
                              detail.score_field_parent_id &&
                            param.m_rec_score_field_id ===
                              detail.m_rec_score_field_id
                          ) {
                            param.a_rec_app_score_field_detail_id = newDetailId;
                          }
                        });
                        eachCb();
                      }
                    );
                  },
                  insertCb
                );
              },
            ],
            cback
          );
        }, // STEP 4: Handle Parameter Records Upserts (uses filtered list)

        function (cback) {
          if (!paramList || paramList.length === 0) return cback();

          const paramsToUpdate = paramList.filter(
            (p) => p.a_rec_app_score_field_parameter_detail_id
          );
          const paramsToInsert = paramList.filter(
            (p) => !p.a_rec_app_score_field_parameter_detail_id
          );

          async.series(
            [
              (updateCb) => {
                if (paramsToUpdate.length === 0) return updateCb();
                async.eachSeries(
                  paramsToUpdate,
                  (param, eachCb) => {
                    SHARED_SERVICE.validateAndUpdateInTable(
                      dbkey,
                      request,
                      {
                        table_name: "a_rec_app_score_field_parameter_detail",
                        ...param,
                      },
                      sessionDetails,
                      eachCb
                    );
                  },
                  updateCb
                );
              },
              (insertCb) => {
                if (paramsToInsert.length === 0) return insertCb();
                async.eachSeries(
                  paramsToInsert,
                  (param, eachCb) => {
                    if (!param.a_rec_app_score_field_detail_id) {
                      return eachCb();
                    }
                    SHARED_SERVICE.validateAndInsertInTable(
                      dbkey,
                      request,
                      {
                        table_name: "a_rec_app_score_field_parameter_detail",
                        ...param,
                      },
                      sessionDetails,
                      eachCb
                    );
                  },
                  insertCb
                );
              },
            ],
            cback
          );
        },
      ], // Final callback
      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, () =>
            callback(err)
          );
        } else {
          DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
            callback(null, {
              ...securityService.SECURITY_ERRORS.SUCCESS,
              message: "Candidate Data saved successfully",
            });
          });
        }
      }
    );
  },
  saveOrUpdateFullCandidateProfileForScreening: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    console.log(
      "--- [BACKEND LOG] Raw request.body.mainPayload ---:",
      JSON.stringify(request.body.mainPayload, null, 2)
    );
    let tranObj, tranCallback;

    // STEP 1: Parse Payloads
    try {
      params.mainPayload = JSON.parse(request.body.mainPayload || "{}");
      params.languages = JSON.parse(request.body.languages || "[]");
      params.additionalInfo = JSON.parse(request.body.additionalInfo || "[]");
    } catch (e) {
      return callback({
        status: "error",
        message: "Invalid JSON",
        details: e.message,
      });
    }

    const registrationNo = params.mainPayload.registration_no;
    const incomingInfoList = params.additionalInfo;

    async.series(
      [
        // STEP 2: Handle File Uploads
        function (cback) {
          if (!request.files || Object.keys(request.files).length === 0)
            return cback();
          async.eachOf(
            request.files,
            (file, controlName, uploadCb) => {
              if (!file || !file.name) return uploadCb();
              const folderPath = `recruitment/${registrationNo}`;
              let baseFileName = "";

              if (controlName === "photo" || controlName === "signature") {
                baseFileName = `${controlName}_${registrationNo}_${Date.now()}`;
              } else if (controlName.startsWith("additional_")) {
                const parts = controlName.split("_");
                if (parts.length < 4) return uploadCb();
                baseFileName = `${registrationNo}_${parts[1]}_${parts[3]}_${path
                  .parse(file.name)
                  .name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
              } else {
                return uploadCb();
              }

              DOC_UPLOAD_SERVICE.docUploadWithFolder(
                dbkey,
                request,
                {
                  file_name: baseFileName,
                  folder_name: folderPath,
                  control_name: controlName,
                },
                sessionDetails,
                (err, res) => {
                  if (err || !res?.file_path)
                    return uploadCb(err || `Upload failed for ${controlName}`);
                  const dbPath = `${folderPath}/${path.basename(
                    res.file_path
                  )}`;

                  if (controlName === "photo")
                    params.mainPayload.candidate_photo = dbPath;
                  else if (controlName === "signature")
                    params.mainPayload.candidate_signature = dbPath;
                  else if (controlName.startsWith("additional_")) {
                    const parts = controlName.split("_");
                    const recordIndex = incomingInfoList.findIndex(
                      (info) =>
                        info.question_id == parts[1] &&
                        info.option_id == parts[2] &&
                        info.condition_id == parts[3]
                    );
                    if (recordIndex !== -1)
                      incomingInfoList[recordIndex].input_field = dbPath;
                  }
                  uploadCb();
                }
              );
            },
            cback
          );
        },

        // STEP 3: Start Transaction
        function (cback) {
          DB_SERVICE.createTransaction(dbkey, (err, tranobj, trancallback) => {
            if (err) return cback(err);
            tranObj = tranobj;
            tranCallback = trancallback;
            dbkey = { dbkey: dbkey, connectionobj: tranObj };
            cback();
          });
        },

        // ✅ STEP 4: REVISED - Simple Upsert Logic for Main Profile
        function (cback) {
          const payload = {
            ...params.mainPayload,
            table_name: "a_rec_app_main",
            Application_Step_Flag_CES: "E", // Always set screening flag
          };

          // Simple logic: if ID is provided, UPDATE; otherwise, INSERT
          if (payload.a_rec_app_main_id) {
            console.log(
              ` -> Updating existing screening record with ID: ${payload.a_rec_app_main_id}`
            );
            SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              payload,
              sessionDetails,
              cback
            );
          } else {
            console.log(
              " -> Inserting new screening record with Application_Step_Flag_CES = 'E'"
            );

            // Ensure no ID is present for new insert
            delete payload.a_rec_app_main_id;

            SHARED_SERVICE.validateAndInsertInTable(
              dbkey,
              request,
              payload,
              sessionDetails,
              (insertErr, insertRes) => {
                if (insertErr) {
                  console.error(
                    " -> Error inserting new screening record:",
                    insertErr
                  );
                  return cback(insertErr);
                }

                if (insertRes && insertRes.data && insertRes.data.insertId) {
                  console.log(
                    ` -> New screening record created with ID: ${insertRes.data.insertId}`
                  );
                }
                cback();
              }
            );
          }
        },

        // STEP 5: Languages - Delete and Re-insert
        function (cback) {
          if (!params.languages || params.languages.length === 0)
            return cback();
          const deletePayload = {
            delete_table_name: "a_rec_app_language_detail",
            whereObj: {
              registration_no: registrationNo,
              a_rec_adv_main_id: params.mainPayload.a_rec_adv_main_id,
            },
          };
          SHARED_SERVICE.insrtAndDltOperation(
            dbkey,
            request,
            deletePayload,
            sessionDetails,
            (err) => {
              if (err) return cback(err);
              async.eachSeries(
                params.languages,
                (lang, insertCb) => {
                  SHARED_SERVICE.validateAndInsertInTable(
                    dbkey,
                    request,
                    { ...lang, table_name: "a_rec_app_language_detail" },
                    sessionDetails,
                    insertCb
                  );
                },
                cback
              );
            }
          );
        },

        // STEP 6: Additional Info - Delete all previous 'E' records
        function (cback) {
          const deletePayload = {
            delete_table_name: "a_rec_app_main_addtional_info",
            whereObj: {
              registration_no: registrationNo,
              Application_Step_Flag_CES: "E",
            },
          };
          SHARED_SERVICE.insrtAndDltOperation(
            dbkey,
            request,
            deletePayload,
            sessionDetails,
            cback
          );
        },

        // STEP 7: Additional Info - Insert all current records as 'E'
        function (cback) {
          if (!incomingInfoList || incomingInfoList.length === 0)
            return cback();
          async.eachSeries(
            incomingInfoList,
            (record, eachCb) => {
              const insertPayload = {
                table_name: "a_rec_app_main_addtional_info",
                registration_no: registrationNo,
                ...record,
                Application_Step_Flag_CES: "E",
              };
              delete insertPayload.a_rec_app_main_addtional_info_id;
              SHARED_SERVICE.validateAndInsertInTable(
                dbkey,
                request,
                insertPayload,
                sessionDetails,
                eachCb
              );
            },
            cback
          );
        },
      ],
      // Final Callback
      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, () =>
            callback(err)
          );
        } else {
          DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
            callback(null, {
              ...securityService.SECURITY_ERRORS.SUCCESS,
              message: "Candidate screening data saved successfully",
            });
          });
        }
      }
    );
  },

  saveOrUpdateAdditionalInformationForScreening: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    console.log(
      "🟢 saveOrUpdateAdditionalInformationForScreening called (Robust Upsert Logic)"
    );

    // STEP 1: Parse Payloads
    try {
      params.registration_no = request.body.registration_no;
      params.additionalInfo = JSON.parse(request.body.additionalInfo || "[]");
    } catch (e) {
      return callback({
        status: "error",
        message: "Invalid JSON in request body",
        details: e.message,
      });
    }

    const registrationNo = params.registration_no;
    const incomingInfoList = params.additionalInfo;

    async.series(
      [
        // STEP 2: Start Transaction
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

        // STEP 3: Process each record with an "INSERT-first, then UPDATE-on-fail" strategy
        function (cback) {
          if (!incomingInfoList || incomingInfoList.length === 0) {
            return cback();
          }

          async.eachSeries(
            incomingInfoList,
            (record, eachCb) => {
              // Always ensure the screening flag is set for this context
              record.Application_Step_Flag_CES = "E";

              const insertPayload = {
                table_name: "a_rec_app_main_addtional_info",
                registration_no: registrationNo,
                ...record,
              };
              // Ensure no primary key is present on an insert attempt
              delete insertPayload.a_rec_app_main_addtional_info_id;

              // Attempt to INSERT the record
              SHARED_SERVICE.validateAndInsertInTable(
                dbkey,
                request,
                insertPayload,
                sessionDetails,
                (err, res) => {
                  // Case 1: Insert was successful, move to the next record
                  if (!err) {
                    return eachCb();
                  }

                  // Case 2: Insert failed specifically because of a duplicate key error
                  if (err && err.code === "ER_DUP_ENTRY") {
                    console.log(
                      `  -> Record exists, switching to UPDATE for question_id: ${record.question_id}, condition_id: ${record.condition_id}`
                    );

                    // Construct a payload for the UPDATE operation.
                    // This payload must include the unique key fields for the WHERE clause.
                    const updatePayload = {
                      table_name: "a_rec_app_main_addtional_info",

                      // Values to SET
                      input_field: record.input_field,
                      Application_Step_Flag_CES: "E",
                      Document_Status_Flag_Id: record.Document_Status_Flag_Id,
                      Document_Status_Remark_Id:
                        record.Document_Status_Remark_Id,

                      // Unique key fields for the WHERE clause
                      registration_no: registrationNo,
                      question_id: record.question_id,
                      option_id: record.option_id,
                      condition_id: record.condition_id,
                    };

                    // Attempt the UPDATE
                    SHARED_SERVICE.validateAndUpdateInTable(
                      dbkey,
                      request,
                      updatePayload,
                      sessionDetails,
                      (updateErr) => {
                        // If the update itself fails, it's a critical error
                        if (updateErr) {
                          return eachCb(updateErr);
                        }
                        // Update succeeded, so we are done with this record
                        return eachCb();
                      }
                    );
                  }
                  // Case 3: A different, unexpected error occurred during insert
                  else {
                    return eachCb(err);
                  }
                }
              );
            },
            cback // Final callback for the main loop
          );
        },
      ],
      // Final Callback (Commit/Rollback)
      function (err) {
        if (err) {
          console.error("❌ Error during screening info save:", err);
          DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, () =>
            callback(err)
          );
        } else {
          DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
            callback(null, {
              ...securityService.SECURITY_ERRORS.SUCCESS,
              message:
                "Screening data for additional information saved successfully.",
            });
          });
        }
      }
    );
  },
  logScreeningData: function (dbkey, registration_no, mainCallback) {
    const tranObj = dbkey.connectionobj;
    if (!tranObj) {
      return mainCallback(
        new Error("Transaction object not found for logging.")
      );
    }

    console.log(
      `---  archiving screening data for reg_no: ${registration_no} (using simple INSERT) ---`
    );

    async.series(
      [
        // 1. Log a_rec_app_main to a_rec_app_main_log
        function (cback) {
          const mainCols = [
            "`a_rec_app_main_id`",
            "`registration_no`",
            "`a_rec_adv_main_id`",
            "`session_id`",
            "`post_code`",
            "`subject_id`",
            "`Salutation_E`",
            "`Applicant_First_Name_E`",
            "`Applicant_Middle_Name_E`",
            "`Applicant_Last_Name_E`",
            "`Applicant_First_Name_H`",
            "`Applicant_Middle_Name_H`",
            "`Applicant_Last_Name_H`",
            "`Applicant_Father_Name_E`",
            "`Applicant_Mother_Name_E`",
            "`Applicant_Husband_Name_E`",
            "`candidate_category_id`",
            "`gender_id`",
            "`DOB`",
            "`DOB_Doc_Status_Flag_Id`",
            "`DOB_Status_Remark`",
            "`Mobile_No`",
            "`Alternate_mobile_No`",
            "`Email_Id`",
            "`Birth_Place`",
            "`Birth_District_Id`",
            "`Birth_State_Id`",
            "`Birth_Country_Id`",
            "`Identification_Mark1`",
            "`Identification_Mark2`",
            "`religion_code`",
            "`Is_CG_Domocile`",
            "`Is_Local_Lang_Knowledge`",
            "`Is_EWS_Section`",
            "`Is_Married_YN`",
            "`No_Of_Child`",
            "`Is_Surviving_child_YN`",
            "`Marriage_Date`",
            "`Is_Mrg_Decl_YN`",
            "`Is_Married_at_Prescribed_Age_YN`",
            "`Is_Disability`",
            "`Recruitment_Disability_Type_Id`",
            "`Disability_Percentage`",
            "`In_Service_YN`",
            "`InService_OrganizationName`",
            "`InService_PostName`",
            "`InService_Fromdate`",
            "`InService_Todate`",
            "`Inservice_NOC_Doc`",
            "`Permanent_Address1`",
            "`Permanent_City`",
            "`Permanent_District_Id`",
            "`Permanent_State_Id`",
            "`Permanent_Country_Id`",
            "`Permanent_Pin_Code`",
            "`Current_Address1`",
            "`Current_City`",
            "`Current_District_Id`",
            "`Current_State_Id`",
            "`Current_Country_Id`",
            "`Current_Pin_Code`",
            "`Is_Final_Decl_YN`",
            "`is_Chk_AdvanceCopy_YN`",
            "`Allow_Reopen_YN`",
            "`File_Verified_By_CandidateYN`",
            "`File_Verified_By_Candidate_dateTime`",
            "`File_Verified_By_CandidatePublicIP`",
            "`File_Verified_By_CandidatePrivateIP`",
            "`candidate_photo`",
            "`candidate_signature`",
            "`Application_Step_Flag_CES`",
            "`Verified_by`",
            "`Verified_date`",
            "`Verified_Remark`",
            "`Round_No`",
            "`Document_Status_Flag_Id`",
            "`Document_Status_Remark_Id`",
            "`Verification_Finalize_YN`",
            "`active_status`",
            "`action_type`",
            "`action_date`",
            "`action_ip_address`",
            "`action_remark`",
            "`action_order_copy`",
            "`action_by`",
            "`delete_flag`",
          ];
          const colNames = mainCols.join(", ");

          // ✅ We removed ON DUPLICATE KEY UPDATE
          const sql = `
            INSERT INTO a_rec_app_main_log (${colNames})
            SELECT ${colNames} FROM a_rec_app_main
            WHERE registration_no = ? AND Application_Step_Flag_CES = 'E'
          `;

          tranObj.query(sql, [registration_no], (err, result) => {
            if (err) return cback(err);
            console.log(
              ` -> Logged ${result.affectedRows} new row(s) to a_rec_app_main_log`
            );
            cback();
          });
        },

        // 2. Log a_rec_app_main_addtional_info to a_rec_app_main_addtional_info_log
        function (cback) {
          const addtlCols = [
            "`a_rec_app_main_addtional_info_id`",
            "`registration_no`",
            "`question_id`",
            "`option_id`",
            "`condition_id`",
            "`input_field`",
            "`Application_Step_Flag_CES`",
            "`Verified_by`",
            "`Verified_date`",
            "`Verified_Remark`",
            "`Round_No`",
            "`Document_Status_Flag_Id`",
            "`Document_Status_Remark_Id`",
            "`Verification_Finalize_YN`",
            "`active_status`",
            "`action_type`",
            "`action_date`",
            "`action_ip_address`",
            "`action_remark`",
            "`action_order_copy`",
            "`action_by`",
          ];
          const colNames = addtlCols.join(", ");

          const sql = `
            INSERT INTO a_rec_app_main_addtional_info_log (${colNames})
            SELECT ${colNames} FROM a_rec_app_main_addtional_info
            WHERE registration_no = ? AND Application_Step_Flag_CES = 'E'
          `;

          tranObj.query(sql, [registration_no], (err, result) => {
            if (err) return cback(err);
            console.log(
              ` -> Logged ${result.affectedRows} new row(s) to a_rec_app_main_addtional_info_log`
            );
            cback();
          });
        },

        // 3. Log a_rec_app_score_field_detail to a_rec_app_score_field_detail_log
        function (cback) {
          const detailCols = [
            "`a_rec_app_score_field_detail_id`",
            "`registration_no`",
            "`a_rec_app_main_id`",
            "`a_rec_adv_post_detail_id`",
            "`score_field_parent_id`",
            "`m_rec_score_field_id`",
            "`score_field_value`",
            "`score_field_actual_value`",
            "`score_field_calculated_value`",
            "`m_rec_score_field_method_id`",
            "`field_marks`",
            "`field_weightage`",
            "`remark`",
            "`unique_parameter_display_no`",
            "`verified_by`",
            "`verified_date`",
            "`Application_Step_Flag_CES`",
            "`Verified_Remark`",
            "`Round_No`",
            "`Document_Status_Flag_Id`",
            "`Document_Status_Remark_Id`",
            "`Verification_Finalize_YN`",
            "`active_status`",
            "`action_type`",
            "`action_date`",
            "`action_ip_address`",
            "`action_remark`",
            "`action_order_copy`",
            "`action_by`",
            "`delete_flag`",
          ];
          const colNames = detailCols.join(", ");

          // ✅ We removed ON DUPLICATE KEY UPDATE
          const sql = `
            INSERT INTO a_rec_app_score_field_detail_log (${colNames})
            SELECT ${colNames} FROM a_rec_app_score_field_detail
            WHERE registration_no = ? AND Application_Step_Flag_CES = 'E'
          `;

          tranObj.query(sql, [registration_no], (err, result) => {
            if (err) {
              console.error(
                " -> ERROR logging to 'a_rec_app_score_field_detail_log'.",
                err.message
              );
              return cback(err);
            }
            console.log(
              ` -> Logged ${result.affectedRows} new row(s) to a_rec_app_score_field_detail_log`
            );
            cback();
          });
        },

        // 4. Log a_rec_app_score_field_parameter_detail to a_rec_app_score_field_parameter_detail_log
        function (cback) {
          const paramCols = [
            "`a_rec_app_score_field_parameter_detail_id`",
            "`a_rec_app_score_field_detail_id`",
            "`registration_no`",
            "`score_field_parent_id`",
            "`m_rec_score_field_id`",
            "`m_rec_score_field_parameter_new_id`",
            "`parameter_row_index`",
            "`parameter_value`",
            "`verified_by`",
            "`verified_date`",
            "`Application_Step_Flag_CES`",
            "`Verified_Remark`",
            "`Round_No`",
            "`Document_Status_Flag_Id`",
            "`Document_Status_Remark_Id`",
            "`Verification_Finalize_YN`",
            "`is_active`",
            "`parameter_display_no`",
            "`obt_marks`",
            "`unique_parameter_display_no`",
            "`active_status`",
            "`action_type`",
            "`action_date`",
            "`action_ip_address`",
            "`action_remark`",
            "`action_order_copy`",
            "`action_by`",
            "`delete_flag`",
          ];
          const colNames = paramCols.join(", ");

          // ✅ We removed ON DUPLICATE KEY UPDATE
          const sql = `
            INSERT INTO a_rec_app_score_field_parameter_detail_log (${colNames})
            SELECT ${colNames} FROM a_rec_app_score_field_parameter_detail
            WHERE registration_no = ? AND Application_Step_Flag_CES = 'E'
          `;

          tranObj.query(sql, [registration_no], (err, result) => {
            if (err) return cback(err);
            console.log(
              ` -> Logged ${result.affectedRows} new row(s) to a_rec_app_score_field_parameter_detail_log`
            );
            cback();
          });
        },
      ],
      (err) => {
        if (err) {
          console.error("--- Error during screening data logging ---", err);
        } else {
          console.log(
            `--- Successfully archived screening data for reg_no: ${registration_no} ---`
          );
        }
        mainCallback(err);
      }
    );
  },

  // ---------------------------------------------------------------------------------
  // --- FINAL DECISION FUNCTION (This must replace your existing one) ---
  // ---------------------------------------------------------------------------------

  updateScreeningFinalDecision: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let a_rec_app_main_id,
      verification_Finalize_YN,
      verified_Remark,
      registration_no;

    let tranObj, tranCallback;
    let newRoundNo = 1; // Default to 1

    // STEP 1: Parse and validate
    try {
      a_rec_app_main_id = request.body.a_rec_app_main_id;
      verification_Finalize_YN = request.body.Verification_Finalize_YN;
      verified_Remark = request.body.Verified_Remark || null;
      registration_no = request.body.registration_no;

      if (!a_rec_app_main_id) throw new Error("Application ID is required.");
      if (!registration_no) throw new Error("Registration number is required.");
      if (!verification_Finalize_YN)
        throw new Error("Final decision is required.");
      if (verification_Finalize_YN === "N" && !verified_Remark) {
        throw new Error("Remarks are required when rejecting.");
      }
    } catch (e) {
      return callback({
        status: "error",
        message: "Invalid request body",
        details: e.message,
      });
    }

    console.log(`📝 Starting final decision for Reg: ${registration_no}`);

    // STEP 2: Prepare base payload
    const updatePayload = {
      table_name: "a_rec_app_main",
      a_rec_app_main_id: a_rec_app_main_id,
      registration_no: registration_no,
      Application_Step_Flag_CES: "E",
      Verification_Finalize_YN: verification_Finalize_YN,
      Verified_Remark: verified_Remark,
      Verified_by: String(sessionDetails.user_id),
      action_ip_address: sessionDetails.ip_address,
      Verified_date: new Date(),
    };

    // STEP 3: Transaction Execution
    async.series(
      [
        // 3a. Start Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) return cback(err);
              tranObj = tranobj;
              tranCallback = trancallback;
              // Attach transaction to dbkey so all subsequent Shared Services use it
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback();
            }
          );
        },

        // 3b. Fetch current Round_No (FIXED: Using tranObj.query)
        function (cback) {
          const sql = `SELECT Round_No FROM a_rec_app_main WHERE a_rec_app_main_id = ?`;

          tranObj.query(sql, [a_rec_app_main_id], function (err, rows) {
            if (err) return cback(err);

            if (rows && rows.length > 0) {
              const currentRound = rows[0].Round_No;

              // Logic: If null => 1, else => increment by 1
              if (currentRound === null || currentRound === undefined) {
                newRoundNo = 1;
              } else {
                newRoundNo = parseInt(currentRound) + 1;
              }

              // Add Round_No to the payload for Step 3c
              updatePayload.Round_No = newRoundNo;
              console.log(
                `🔄 Round Number logic: Prev=${currentRound}, New=${newRoundNo}`
              );
            }
            return cback();
          });
        },

        // 3c. Update Main Table (Shared Service)
        function (cback) {
          console.log(
            ` -> Updating a_rec_app_main with Round_No: ${newRoundNo}...`
          );
          SHARED_SERVICE.validateAndUpdateInTable(
            dbkey,
            request,
            updatePayload,
            sessionDetails,
            cback
          );
        },

        // 3d. Update Dependent Tables (FIXED: Using tranObj.query)
        function (cback) {
          console.log(` -> Updating Round_No in dependent tables...`);

          const userId = sessionDetails.user_id;
          const queryParams = [newRoundNo, userId, registration_no, "E"];

          const sqlAdditionalInfo = `
            UPDATE a_rec_app_main_addtional_info 
            SET Round_No = ?, Verified_by = ?, Verified_date = NOW() 
            WHERE registration_no = ? AND Application_Step_Flag_CES = ?`;

          const sqlScoreDetail = `
            UPDATE a_rec_app_score_field_detail 
            SET Round_No = ?, verified_by = ?, verified_date = NOW() 
            WHERE registration_no = ? AND Application_Step_Flag_CES = ?`;

          const sqlParamDetail = `
            UPDATE a_rec_app_score_field_parameter_detail 
            SET Round_No = ?, verified_by = ?, verified_date = NOW() 
            WHERE registration_no = ? AND Application_Step_Flag_CES = ?`;

          // Execute parallel updates using the transaction object directly
          async.parallel(
            [
              (pCback) => tranObj.query(sqlAdditionalInfo, queryParams, pCback),
              (pCback) => tranObj.query(sqlScoreDetail, queryParams, pCback),
              (pCback) => tranObj.query(sqlParamDetail, queryParams, pCback),
            ],
            function (err, results) {
              if (err) {
                console.error("Error updating dependent tables Round_No", err);
              }
              return cback(err);
            }
          );
        },

        // 3e. Logging
        function (cback) {
          if (
            verification_Finalize_YN === "Y" ||
            verification_Finalize_YN === "N"
          ) {
            candidateService.logScreeningData(dbkey, registration_no, cback);
          } else {
            return cback();
          }
        },
      ],
      // STEP 4: Commit/Rollback
      function (err) {
        if (err) {
          console.error("❌ Error updating final decision:", err);
          DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, () =>
            callback(err)
          );
        } else {
          DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
            console.log(`✅ Success. Round No updated to ${newRoundNo}`);
            callback(null, {
              status: "success",
              message: "Final decision saved successfully.",
            });
          });
        }
      }
    );
  },
  syncScreeningAndScoringData: function (
    dbkey,
    request,
    params, // this will be {} from the frontend
    sessionDetails,
    callback
  ) {
    console.log("--- 🔄 Starting Sync: Copying 'C' data to 'E' ---");
    console.log(
      "Params received in sync screening: ",
      JSON.stringify(params, null, 2)
    );
    let query308Data, query305Data;
    let tranObj, tranCallback;

    // This map is essential for linking the new parameters to their new parent details
    // Key: old_C_detail_id, Value: new_E_detail_id
    const detailIdMap = new Map();

    async.series(
      [
        // 1. --- Execute Query 308 (Parameters) ---
        function (cback) {
          console.log(" -> Executing Query 308 (Get 'C' Parameters)...");
          const queryParams_308 = {
            registration_no: params.registration_no,
            app_main_id: params.app_main_id,
            post_detail_id: params.post_detail_id,
            not_exists: "E",
            Application_Step_Flag_CES: "C",
          };
          const modifiedSessionDetails_308 = {
            ...sessionDetails,
            query_id: 308,
          };
          DB_SERVICE.getQueryDataFromId(
            dbkey,
            request,
            queryParams_308,
            modifiedSessionDetails_308,
            (err, data) => {
              if (err) {
                console.error("❌ ERROR executing query 308:", err);
                return cback(err);
              }
              query308Data = data; // This is the full response object
              cback();
            }
          );
        },

        // 2. --- Execute Query 305 (Details) ---
        function (cback) {
          console.log(" -> Executing Query 305 (Get 'C' Details)...");
          const queryParams_305 = {
            registration_no: params.registration_no,
            app_main_id: params.app_main_id,
            post_detail_id: params.post_detail_id,
            not_exists: "E",
            Application_Step_Flag_CES: "C",
          };
          const modifiedSessionDetails_305 = {
            ...sessionDetails,
            query_id: 305,
          };
          DB_SERVICE.getQueryDataFromId(
            dbkey,
            request,
            queryParams_305,
            modifiedSessionDetails_305,
            (err, data) => {
              if (err) {
                console.error("❌ ERROR executing query 305:", err);
                return cback(err);
              }
              query305Data = data; // This is the full response object
              cback();
            }
          );
        },

        // 3. --- Start Transaction ---
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) return cback(err);
              tranObj = tranobj;
              tranCallback = trancallback;
              // Re-assign dbkey to be the transaction-aware object
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              console.log(" -> 🔑 Transaction started.");
              return cback();
            }
          );
        },

        // 4. --- Process and Insert Detail Records (from 305) ---
        function (cback) {
          // ✅ FIX: Check the array directly, not .data
          if (!query305Data || query305Data.length === 0) {
            console.log(" -> No detail records ('C') to sync.");
            return cback();
          }

          // ✅ FIX: Use the array directly, not .data
          const detailsToInsert = query305Data;
          console.log(
            ` -> Processing ${detailsToInsert.length} 'C' detail records for sync...`
          );

          async.eachSeries(
            detailsToInsert,
            (detailRecord, eachCb) => {
              const oldDetailId = detailRecord.a_rec_app_score_field_detail_id;

              // Prepare the new 'E' record
              const newRecordPayload = {
                ...detailRecord,
                table_name: "a_rec_app_score_field_detail",
                Application_Step_Flag_CES: "E", // Set the new flag
              };

              // "delete the ids" - Remove the old PK so a new one is generated
              delete newRecordPayload.a_rec_app_score_field_detail_id;

              SHARED_SERVICE.validateAndInsertInTable(
                dbkey,
                request,
                newRecordPayload,
                sessionDetails,
                (err, res) => {
                  if (err) return eachCb(err);

                  const newDetailId = res.data.insertId;
                  if (!newDetailId) {
                    return eachCb(
                      new Error(
                        "Insert did not return a new ID for detail record."
                      )
                    );
                  }

                  // Store the mapping from the old C primary key to the new E primary key
                  detailIdMap.set(oldDetailId, newDetailId);
                  console.log(
                    `    -> Mapped old_C_id ${oldDetailId} to new_E_id ${newDetailId}`
                  );
                  eachCb();
                }
              );
            },
            cback // Callback for when all details are inserted
          );
        },

        // 5. --- Process and Insert Parameter Records (from 308) ---
        function (cback) {
          // ✅ FIX: Check the array directly, not .data
          if (!query308Data || query308Data.length === 0) {
            console.log(" -> No parameter records ('C') to sync.");
            return cback();
          }

          // ✅ FIX: Use the array directly, not .data
          const paramsToInsert = query308Data;
          console.log(
            ` -> Processing ${paramsToInsert.length} 'C' parameter records for sync...`
          );

          async.eachSeries(
            paramsToInsert,
            (paramRecord, eachCb) => {
              const oldParentDetailId =
                paramRecord.a_rec_app_score_field_detail_id;
              const newParentDetailId = detailIdMap.get(oldParentDetailId);

              // This logic is still needed for the "mismatched data" problem
              if (!newParentDetailId) {
                console.warn(
                  `    -> ⚠️ WARNING: Skipping parameter. Could not find new parent E_id for old C_id ${oldParentDetailId}.`
                );
                // This parameter's parent (e.g., 527, 528) already has an 'E' record,
                // but this function isn't designed to look it up.
                // We will skip this orphan parameter to prevent a crash.
                return eachCb();
              }

              // Prepare the new 'E' record
              const newParamPayload = {
                ...paramRecord,
                table_name: "a_rec_app_score_field_parameter_detail",
                Application_Step_Flag_CES: "E", // Set the new flag
                a_rec_app_score_field_detail_id: newParentDetailId, // Set the *new* foreign key
              };

              // "delete the ids" - Remove the old PK so a new one is generated
              delete newParamPayload.a_rec_app_score_field_parameter_detail_id;

              SHARED_SERVICE.validateAndInsertInTable(
                dbkey,
                request,
                newParamPayload,
                sessionDetails,
                eachCb // Callback for when this parameter is inserted
              );
            },
            cback // Callback for when all parameters are inserted
          );
        },
      ],
      // 6. --- Final Callback (Commit/Rollback) ---
      function (err) {
        if (err) {
          console.error("❌ ERROR during C-to-E sync, rolling back:", err);
          DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, () =>
            callback(err)
          );
          return;
        }

        console.log(
          "✅ SUCCESS: C-to-E sync complete. Committing transaction."
        );
        DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
          callback(null, {
            ...securityService.SECURITY_ERRORS.SUCCESS,
            message: "Data synced successfully from Candidate to Screening.",
            data: {
              details_copied: query305Data ? query305Data.length : 0,
              parameters_copied: query308Data ? query308Data.length : 0,
            },
          });
        });
      }
    );
  },

  saveCandidateDawapatti: function (
    dbkey,
    request,
    params, // params will be {}
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    let uploadedFilePath = null; // To store the path of the uploaded file

    // Step 0: Parse data from FormData body
    try {
      params.registration_no = request.body.registration_no;
      params.a_rec_app_main_id = request.body.a_rec_app_main_id;
      params.score_field_parent_id = request.body.score_field_parent_id;
      params.m_rec_score_field_id = request.body.m_rec_score_field_id;
      // REMOVED: a_rec_app_score_field_parameter_detail_id
      params.remark = request.body.remark;
      params.parameter_row_index = request.body.parameter_row_index;

      if (
        !params.registration_no ||
        !params.a_rec_app_main_id ||
        !params.m_rec_score_field_id ||
        // REMOVED: !params.a_rec_app_score_field_parameter_detail_id ||
        !params.remark ||
        !params.parameter_row_index ||
        !params.score_field_parent_id
      ) {
        throw new Error("Missing required fields from the frontend.");
      }

      if (!request.files || !request.files.file) {
        throw new Error("Missing required file attachment.");
      }
    } catch (e) {
      return callback({
        status: "error",
        message: "Invalid request body or missing file",
        details: e.message,
      });
    }

    async.series(
      [
        // Step 1: Handle File Upload
        function (cback) {
          const file = request.files.file;
          if (!file || !file.name) {
            return cback(new Error("File object is invalid."));
          }

          const baseName = path.parse(file.name).name;
          const sanitizedName = baseName
            .replace(/[^a-zA-Z0-9._-]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_+|_+$/g, "");

          // UPDATED file name standard for dawapatti
          const fileName = `dawapatti_${params.registration_no}_${params.score_field_parent_id}_${params.m_rec_score_field_id}_${params.parameter_row_index}_${sanitizedName}`;

          // New folder path
          const folderPath = `recruitment/${params.registration_no}/dawapatti`;

          const uploadOptions = {
            file_name: fileName,
            file_buffer: file.data,
            control_name: "file",
            folder_name: folderPath,
          };

          DOC_UPLOAD_SERVICE.docUploadWithFolder(
            dbkey,
            request,
            uploadOptions,
            sessionDetails,
            function (err, res) {
              if (err) return cback(err);
              if (res && res.file_path) {
                const finalFileName = path.basename(res.file_path);
                // Store the full path to be saved in the DB
                uploadedFilePath = `${folderPath}/${finalFileName}`;
                console.log(
                  ` -> 📂 Dawapatti file uploaded to: ${uploadedFilePath}`
                );
                return cback();
              } else {
                return cback(new Error("File upload failed to return a path."));
              }
            }
          );
        },

        // Step 2: Create Transaction
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

        // Step 3: Insert into m_rec_app_dawapatti
        function (cback) {
          const insertPayload = {
            table_name: "m_rec_app_dawapatti",
            registration_no: params.registration_no,
            a_rec_app_main_id: params.a_rec_app_main_id,
            score_field_parent_id: params.score_field_parent_id,
            m_rec_score_field_id: params.m_rec_score_field_id,
            // REMOVED: a_rec_app_score_field_parameter_detail_id
            parameter_row_index: params.parameter_row_index,
            candidate_remark: params.remark,
            candidate_document: uploadedFilePath, // Use the path from Step 1
            dawapatti_applied_after_ES: params.dawapatti_applied_after_ES,
            action_ip_address: sessionDetails.ip_address,
            action_by: sessionDetails.user_id,
            // Other fields (active_status, action_type, action_date) have defaults
          };

          SHARED_SERVICE.validateAndInsertInTable(
            dbkey,
            request,
            insertPayload,
            sessionDetails,
            cback // Pass the callback directly
          );
        },
      ],
      // Final Callback (Commit/Rollback)
      function (err) {
        if (err) {
          console.error("❌ Error saving candidate dawapatti:", err);
          DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, () =>
            callback(err)
          );
        } else {
          DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
            console.log("✅ Dawapatti claim saved successfully.");
            callback(null, {
              ...securityService.SECURITY_ERRORS.SUCCESS,
              message: "Your claim has been submitted successfully.",
            });
          });
        }
      }
    );
  },
  saveOrUpdateCandidateScoreCardForScoring: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    // STEP 0: Parse request body from FormData
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
        message: "Invalid JSON in request body",
        details: e.message,
      });
    }

    const detailList = params.scoreFieldDetailList;
    let paramList = params.scoreFieldParameterList;
    const parentRecord = params.parentScore;

    async.series(
      [
        // STEP 1: Handle File Uploads (No changes needed here)
        function (cback) {
          if (!request.files || Object.keys(request.files).length === 0) {
            console.log("📝 No new files to upload for screening.");
            return cback();
          }
          console.log(
            `🚀 Processing ${
              Object.keys(request.files).length
            } files for screening...`
          );

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
                      console.log(
                        `    ✔️ Updated path for param ${paramId} to: ${paramList[paramIndex].parameter_value}`
                      );
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

        // STEP 2: Create a database transaction
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

        // STEP 3: Handle the Parent Score Record
        function (cback) {
          if (!parentRecord) return cback();
          if (parentRecord.a_rec_app_score_field_detail_id) {
            SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              { table_name: "a_rec_app_score_field_detail", ...parentRecord },
              sessionDetails,
              cback
            );
          } else {
            SHARED_SERVICE.validateAndInsertInTable(
              dbkey,
              request,
              { table_name: "a_rec_app_score_field_detail", ...parentRecord },
              sessionDetails,
              (err, res) => {
                if (err) return cback(err);
                if (res && res.data.insertId) {
                  parentRecord.a_rec_app_score_field_detail_id =
                    res.data.insertId;
                }
                return cback();
              }
            );
          }
        },

        // STEP 4: Process the Child Detail Records
        function (cback) {
          if (!detailList || detailList.length === 0) return cback();

          // ✅ REVISED LOGIC: Use 'action_type' to reliably determine insert vs. update.
          // This makes the backend independent of any flags and respects the frontend's intent.
          const detailsToUpdate = detailList.filter(
            (d) => d.action_type === "U"
          );
          const detailsToInsert = detailList.filter(
            (d) => d.action_type === "C"
          );

          async.series(
            [
              // Process all updates and deletions first
              (updateCb) => {
                if (detailsToUpdate.length === 0) return updateCb();
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
                  updateCb
                );
              },
              // Process all new insertions
              (insertCb) => {
                if (detailsToInsert.length === 0) return insertCb();
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
                        const newId = res.data.insertId;
                        // Assign the newly created detail_id to its corresponding parameters
                        paramList.forEach((p) => {
                          if (
                            p.score_field_parent_id ===
                              detail.score_field_parent_id &&
                            p.m_rec_score_field_id ===
                              detail.m_rec_score_field_id &&
                            p.parameter_row_index ===
                              detail.score_field_row_index
                          ) {
                            p.a_rec_app_score_field_detail_id = newId;
                          }
                        });
                        eachCb();
                      }
                    );
                  },
                  insertCb
                );
              },
            ],
            cback
          );
        },

        // STEP 5: Process the Parameter Records
        function (cback) {
          if (!paramList || paramList.length === 0) return cback();

          // ✅ REVISED LOGIC: Split parameters based on the presence of a primary key ID.
          // This is the most reliable method for child records.
          const paramsToUpdate = paramList.filter(
            (p) => p.a_rec_app_score_field_parameter_detail_id
          );
          const paramsToInsert = paramList.filter(
            (p) => !p.a_rec_app_score_field_parameter_detail_id
          );

          async.series(
            [
              // Process updates for existing parameters
              (updateCb) => {
                if (paramsToUpdate.length === 0) return updateCb();
                async.eachSeries(
                  paramsToUpdate,
                  (param, eachCb) => {
                    SHARED_SERVICE.validateAndUpdateInTable(
                      dbkey,
                      request,
                      {
                        table_name: "a_rec_app_score_field_parameter_detail",
                        ...param,
                      },
                      sessionDetails,
                      eachCb
                    );
                  },
                  updateCb
                );
              },
              // Process inserts for new parameters
              (insertCb) => {
                if (paramsToInsert.length === 0) return insertCb();
                async.eachSeries(
                  paramsToInsert,
                  (param, eachCb) => {
                    // Ensure the parameter has a detail_id before inserting
                    if (!param.a_rec_app_score_field_detail_id) {
                      console.warn(
                        "Skipping parameter insert due to missing detail_id:",
                        param
                      );
                      return eachCb();
                    }
                    SHARED_SERVICE.validateAndInsertInTable(
                      dbkey,
                      request,
                      {
                        table_name: "a_rec_app_score_field_parameter_detail",
                        ...param,
                      },
                      sessionDetails,
                      eachCb
                    );
                  },
                  insertCb
                );
              },
            ],
            cback
          );
        },
      ],
      // Final Callback
      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, () =>
            callback(err)
          );
        } else {
          DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
            callback(null, {
              ...securityService.SECURITY_ERRORS.SUCCESS,
              message: "Candidate screening data saved successfully.",
            });
          });
        }
      }
    );
  },
  saveOrUpdateExperienceDetailsForScoring: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    const rowIndexToDetailIdMap = new Map(); // ✅ Map to store the correct FK for each row index.

    // STEP 0: Parse request body (no changes)
    try {
      params.scoreFieldDetailList = JSON.parse(
        request.body.scoreFieldDetailList || "[]"
      );
      params.scoreFieldParameterList = JSON.parse(
        request.body.scoreFieldParameterList || "[]"
      );
      params.parentScore = JSON.parse(request.body.parentScore || "null");
    } catch (e) {
      return callback({
        status: "error",
        message: "Invalid JSON in request body",
        details: e.message,
      });
    }

    const detailList = params.scoreFieldDetailList;
    const paramList = params.scoreFieldParameterList;
    const parentRecord = params.parentScore;

    async.series(
      [
        // STEP 1 & 2: Create transaction and handle parent score (no changes)
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
        function (cback) {
          if (!parentRecord) return cback();
          if (parentRecord.a_rec_app_score_field_detail_id) {
            SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              { table_name: "a_rec_app_score_field_detail", ...parentRecord },
              sessionDetails,
              cback
            );
          } else {
            SHARED_SERVICE.validateAndInsertInTable(
              dbkey,
              request,
              { table_name: "a_rec_app_score_field_detail", ...parentRecord },
              sessionDetails,
              cback
            );
          }
        },

        // ✅ REVISED STEP 3: Process details and build the FK map
        function (cback) {
          if (!detailList || detailList.length === 0) return cback();

          async.eachSeries(
            detailList,
            (detail, detailCb) => {
              // If it's a new record, insert it and add the new ID to our map.
              if (detail.action_type === "C") {
                SHARED_SERVICE.validateAndInsertInTable(
                  dbkey,
                  request,
                  { table_name: "a_rec_app_score_field_detail", ...detail },
                  sessionDetails,
                  (err, res) => {
                    if (err) return detailCb(err);
                    const newDetailId = res.data.insertId;
                    rowIndexToDetailIdMap.set(
                      detail.score_field_row_index,
                      newDetailId
                    );
                    return detailCb();
                  }
                );
              }
              // If it's an existing record, update it and add its existing ID to our map.
              else if (detail.action_type === "U") {
                rowIndexToDetailIdMap.set(
                  detail.score_field_row_index,
                  detail.a_rec_app_score_field_detail_id
                );
                SHARED_SERVICE.validateAndUpdateInTable(
                  dbkey,
                  request,
                  { table_name: "a_rec_app_score_field_detail", ...detail },
                  sessionDetails,
                  detailCb
                );
              } else {
                return detailCb(); // Skip if no action type
              }
            },
            cback
          );
        },

        // ✅ REVISED STEP 4: Process all parameters using the map to guarantee the correct FK
        function (cback) {
          if (!paramList || paramList.length === 0) return cback();

          async.eachSeries(
            paramList,
            (param, paramCb) => {
              // Get the correct foreign key from the map we built in the previous step.
              const correctDetailId = rowIndexToDetailIdMap.get(
                param.parameter_row_index
              );

              if (!correctDetailId) {
                console.warn(
                  `Skipping parameter because its row index (${param.parameter_row_index}) did not match any detail record.`
                );
                return paramCb();
              }

              // **This is the key fix**: Enforce the correct FK, overwriting anything from the frontend.
              param.a_rec_app_score_field_detail_id = correctDetailId;

              // Now, proceed with the original upsert logic for the parameter itself.
              if (param.action_type === "C") {
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
              } else if (param.action_type === "U") {
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
                return paramCb();
              }
            },
            cback
          );
        },
      ],
      // Final callback (Commit/Rollback)
      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, () =>
            callback(err)
          );
        } else {
          DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
            callback(null, {
              ...securityService.SECURITY_ERRORS.SUCCESS,
              message: "Experience data saved successfully.",
            });
          });
        }
      }
    );
  },
  saveOrUpdateQuantityBasedCandidateDetailsForScoring: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback; // STEP 0: Parse request body

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
        : null; // ⭐ MODIFICATION: Intentionally ignore any deletion payloads from the frontend. // params.parameterIdsToDelete is no longer parsed.
    } catch (e) {
      return callback({
        status: "error",
        message: "Invalid JSON in request body",
        details: e.message,
      });
    } // ⭐ MODIFICATION: Filter out any potential delete_flag requests.

    const detailList = params.scoreFieldDetailList.filter(
      (d) => d.delete_flag !== "Y"
    );
    const paramList = params.scoreFieldParameterList;
    const parentRecord = params.parentScore; // Ensure all records are flagged for screening ('S')

    if (parentRecord) {
      parentRecord.Application_Step_Flag_CES = "S";
    }
    detailList.forEach((d) => (d.Application_Step_Flag_CES = "S"));
    paramList.forEach((p) => (p.Application_Step_Flag_CES = "S"));

    async.series(
      [
        // ⭐ MODIFICATION: File upload step has been completely removed.

        // STEP 1: Create transaction
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
        }, // STEP 2: Handle Parent Record

        function (cback) {
          if (!parentRecord) return cback();
          if (parentRecord.a_rec_app_score_field_detail_id) {
            SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              { table_name: "a_rec_app_score_field_detail", ...parentRecord },
              sessionDetails,
              cback
            );
          } else {
            SHARED_SERVICE.validateAndInsertInTable(
              dbkey,
              request,
              { table_name: "a_rec_app_score_field_detail", ...parentRecord },
              sessionDetails,
              (err, res) => {
                if (err) return cback(err);
                if (res && res.data.insertId) {
                  parentRecord.a_rec_app_score_field_detail_id =
                    res.data.insertId;
                }
                return cback();
              }
            );
          }
        }, // ⭐ MODIFICATION: Explicit deletion steps for parameterIdsToDelete are removed. // STEP 3: Handle Child Detail Records Upserts (uses filtered list)

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
              (updateCb) => {
                if (detailsToUpdate.length === 0) return updateCb();
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
                  updateCb
                );
              },
              (insertCb) => {
                if (detailsToInsert.length === 0) return insertCb();
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
                        if (!newDetailId)
                          return eachCb(
                            new Error("Insert did not return a new ID.")
                          );

                        paramList.forEach((param) => {
                          if (
                            param.score_field_parent_id ===
                              detail.score_field_parent_id &&
                            param.m_rec_score_field_id ===
                              detail.m_rec_score_field_id
                          ) {
                            param.a_rec_app_score_field_detail_id = newDetailId;
                          }
                        });
                        eachCb();
                      }
                    );
                  },
                  insertCb
                );
              },
            ],
            cback
          );
        }, // STEP 4: Handle Parameter Records Upserts (uses filtered list)

        function (cback) {
          if (!paramList || paramList.length === 0) return cback();

          const paramsToUpdate = paramList.filter(
            (p) => p.a_rec_app_score_field_parameter_detail_id
          );
          const paramsToInsert = paramList.filter(
            (p) => !p.a_rec_app_score_field_parameter_detail_id
          );

          async.series(
            [
              (updateCb) => {
                if (paramsToUpdate.length === 0) return updateCb();
                async.eachSeries(
                  paramsToUpdate,
                  (param, eachCb) => {
                    SHARED_SERVICE.validateAndUpdateInTable(
                      dbkey,
                      request,
                      {
                        table_name: "a_rec_app_score_field_parameter_detail",
                        ...param,
                      },
                      sessionDetails,
                      eachCb
                    );
                  },
                  updateCb
                );
              },
              (insertCb) => {
                if (paramsToInsert.length === 0) return insertCb();
                async.eachSeries(
                  paramsToInsert,
                  (param, eachCb) => {
                    if (!param.a_rec_app_score_field_detail_id) {
                      return eachCb();
                    }
                    SHARED_SERVICE.validateAndInsertInTable(
                      dbkey,
                      request,
                      {
                        table_name: "a_rec_app_score_field_parameter_detail",
                        ...param,
                      },
                      sessionDetails,
                      eachCb
                    );
                  },
                  insertCb
                );
              },
            ],
            cback
          );
        },
      ], // Final callback
      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, () =>
            callback(err)
          );
        } else {
          DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
            callback(null, {
              ...securityService.SECURITY_ERRORS.SUCCESS,
              message: "Candidate Data saved successfully",
            });
          });
        }
      }
    );
  },
  saveOrUpdateFullCandidateProfileForScoring: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    console.log(
      "--- [BACKEND LOG] Raw request.body.mainPayload ---:",
      JSON.stringify(request.body.mainPayload, null, 2)
    );
    let tranObj, tranCallback;

    // STEP 1: Parse Payloads
    try {
      params.mainPayload = JSON.parse(request.body.mainPayload || "{}");
      params.languages = JSON.parse(request.body.languages || "[]");
      params.additionalInfo = JSON.parse(request.body.additionalInfo || "[]");
    } catch (e) {
      return callback({
        status: "error",
        message: "Invalid JSON",
        details: e.message,
      });
    }

    const registrationNo = params.mainPayload.registration_no;
    const incomingInfoList = params.additionalInfo;

    async.series(
      [
        // STEP 2: Handle File Uploads
        function (cback) {
          if (!request.files || Object.keys(request.files).length === 0)
            return cback();
          async.eachOf(
            request.files,
            (file, controlName, uploadCb) => {
              if (!file || !file.name) return uploadCb();
              const folderPath = `recruitment/${registrationNo}`;
              let baseFileName = "";

              if (controlName === "photo" || controlName === "signature") {
                baseFileName = `${controlName}_${registrationNo}_${Date.now()}`;
              } else if (controlName.startsWith("additional_")) {
                const parts = controlName.split("_");
                if (parts.length < 4) return uploadCb();
                baseFileName = `${registrationNo}_${parts[1]}_${parts[3]}_${path
                  .parse(file.name)
                  .name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
              } else {
                return uploadCb();
              }

              DOC_UPLOAD_SERVICE.docUploadWithFolder(
                dbkey,
                request,
                {
                  file_name: baseFileName,
                  folder_name: folderPath,
                  control_name: controlName,
                },
                sessionDetails,
                (err, res) => {
                  if (err || !res?.file_path)
                    return uploadCb(err || `Upload failed for ${controlName}`);
                  const dbPath = `${folderPath}/${path.basename(
                    res.file_path
                  )}`;

                  if (controlName === "photo")
                    params.mainPayload.candidate_photo = dbPath;
                  else if (controlName === "signature")
                    params.mainPayload.candidate_signature = dbPath;
                  else if (controlName.startsWith("additional_")) {
                    const parts = controlName.split("_");
                    const recordIndex = incomingInfoList.findIndex(
                      (info) =>
                        info.question_id == parts[1] &&
                        info.option_id == parts[2] &&
                        info.condition_id == parts[3]
                    );
                    if (recordIndex !== -1)
                      incomingInfoList[recordIndex].input_field = dbPath;
                  }
                  uploadCb();
                }
              );
            },
            cback
          );
        },

        // STEP 3: Start Transaction
        function (cback) {
          DB_SERVICE.createTransaction(dbkey, (err, tranobj, trancallback) => {
            if (err) return cback(err);
            tranObj = tranobj;
            tranCallback = trancallback;
            dbkey = { dbkey: dbkey, connectionobj: tranObj };
            cback();
          });
        },

        // ✅ STEP 4: REVISED - Simple Upsert Logic for Main Profile
        function (cback) {
          const payload = {
            ...params.mainPayload,
            table_name: "a_rec_app_main",
            Application_Step_Flag_CES: "S", // Always set screening flag
          };

          // Simple logic: if ID is provided, UPDATE; otherwise, INSERT
          if (payload.a_rec_app_main_id) {
            console.log(
              ` -> Updating existing screening record with ID: ${payload.a_rec_app_main_id}`
            );
            SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              payload,
              sessionDetails,
              cback
            );
          } else {
            console.log(
              " -> Inserting new screening record with Application_Step_Flag_CES = 'S'"
            );

            // Ensure no ID is present for new insert
            delete payload.a_rec_app_main_id;

            SHARED_SERVICE.validateAndInsertInTable(
              dbkey,
              request,
              payload,
              sessionDetails,
              (insertErr, insertRes) => {
                if (insertErr) {
                  console.error(
                    " -> Error inserting new screening record:",
                    insertErr
                  );
                  return cback(insertErr);
                }

                if (insertRes && insertRes.data && insertRes.data.insertId) {
                  console.log(
                    ` -> New screening record created with ID: ${insertRes.data.insertId}`
                  );
                }
                cback();
              }
            );
          }
        },

        // STEP 5: Languages - Delete and Re-insert
        function (cback) {
          if (!params.languages || params.languages.length === 0)
            return cback();
          const deletePayload = {
            delete_table_name: "a_rec_app_language_detail",
            whereObj: {
              registration_no: registrationNo,
              a_rec_adv_main_id: params.mainPayload.a_rec_adv_main_id,
            },
          };
          SHARED_SERVICE.insrtAndDltOperation(
            dbkey,
            request,
            deletePayload,
            sessionDetails,
            (err) => {
              if (err) return cback(err);
              async.eachSeries(
                params.languages,
                (lang, insertCb) => {
                  SHARED_SERVICE.validateAndInsertInTable(
                    dbkey,
                    request,
                    { ...lang, table_name: "a_rec_app_language_detail" },
                    sessionDetails,
                    insertCb
                  );
                },
                cback
              );
            }
          );
        },

        // STEP 6: Additional Info - Delete all previous 'S' records
        function (cback) {
          const deletePayload = {
            delete_table_name: "a_rec_app_main_addtional_info",
            whereObj: {
              registration_no: registrationNo,
              Application_Step_Flag_CES: "S",
            },
          };
          SHARED_SERVICE.insrtAndDltOperation(
            dbkey,
            request,
            deletePayload,
            sessionDetails,
            cback
          );
        },

        // STEP 7: Additional Info - Insert all current records as 'S'
        function (cback) {
          if (!incomingInfoList || incomingInfoList.length === 0)
            return cback();
          async.eachSeries(
            incomingInfoList,
            (record, eachCb) => {
              const insertPayload = {
                table_name: "a_rec_app_main_addtional_info",
                registration_no: registrationNo,
                ...record,
                Application_Step_Flag_CES: "S",
              };
              delete insertPayload.a_rec_app_main_addtional_info_id;
              SHARED_SERVICE.validateAndInsertInTable(
                dbkey,
                request,
                insertPayload,
                sessionDetails,
                eachCb
              );
            },
            cback
          );
        },
      ],
      // Final Callback
      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, () =>
            callback(err)
          );
        } else {
          DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
            callback(null, {
              ...securityService.SECURITY_ERRORS.SUCCESS,
              message: "Candidate screening data saved successfully",
            });
          });
        }
      }
    );
  },

  saveOrUpdateAdditionalInformationForScoring: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    console.log(
      "🟢 saveOrUpdateAdditionalInformationForScoring called (Robust Upsert Logic)"
    );

    // STEP 1: Parse Payloads
    try {
      params.registration_no = request.body.registration_no;
      params.additionalInfo = JSON.parse(request.body.additionalInfo || "[]");
    } catch (e) {
      return callback({
        status: "error",
        message: "Invalid JSON in request body",
        details: e.message,
      });
    }

    const registrationNo = params.registration_no;
    const incomingInfoList = params.additionalInfo;

    async.series(
      [
        // STEP 2: Start Transaction
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

        // STEP 3: Process each record with an "INSERT-first, then UPDATE-on-fail" strategy
        function (cback) {
          if (!incomingInfoList || incomingInfoList.length === 0) {
            return cback();
          }

          async.eachSeries(
            incomingInfoList,
            (record, eachCb) => {
              // Always ensure the screening flag is set for this context
              record.Application_Step_Flag_CES = "S";

              const insertPayload = {
                table_name: "a_rec_app_main_addtional_info",
                registration_no: registrationNo,
                ...record,
              };
              // Ensure no primary key is present on an insert attempt
              delete insertPayload.a_rec_app_main_addtional_info_id;

              // Attempt to INSERT the record
              SHARED_SERVICE.validateAndInsertInTable(
                dbkey,
                request,
                insertPayload,
                sessionDetails,
                (err, res) => {
                  // Case 1: Insert was successful, move to the next record
                  if (!err) {
                    return eachCb();
                  }

                  // Case 2: Insert failed specifically because of a duplicate key error
                  if (err && err.code === "ER_DUP_ENTRY") {
                    console.log(
                      `  -> Record exists, switching to UPDATE for question_id: ${record.question_id}, condition_id: ${record.condition_id}`
                    );

                    // Construct a payload for the UPDATE operation.
                    // This payload must include the unique key fields for the WHERE clause.
                    const updatePayload = {
                      table_name: "a_rec_app_main_addtional_info",

                      // Values to SET
                      input_field: record.input_field,
                      Application_Step_Flag_CES: "S",
                      Document_Status_Flag_Id: record.Document_Status_Flag_Id,
                      Document_Status_Remark_Id:
                        record.Document_Status_Remark_Id,

                      // Unique key fields for the WHERE clause
                      registration_no: registrationNo,
                      question_id: record.question_id,
                      option_id: record.option_id,
                      condition_id: record.condition_id,
                    };

                    // Attempt the UPDATE
                    SHARED_SERVICE.validateAndUpdateInTable(
                      dbkey,
                      request,
                      updatePayload,
                      sessionDetails,
                      (updateErr) => {
                        // If the update itself fails, it's a critical error
                        if (updateErr) {
                          return eachCb(updateErr);
                        }
                        // Update succeeded, so we are done with this record
                        return eachCb();
                      }
                    );
                  }
                  // Case 3: A different, unexpected error occurred during insert
                  else {
                    return eachCb(err);
                  }
                }
              );
            },
            cback // Final callback for the main loop
          );
        },
      ],
      // Final Callback (Commit/Rollback)
      function (err) {
        if (err) {
          console.error("❌ Error during screening info save:", err);
          DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, () =>
            callback(err)
          );
        } else {
          DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
            callback(null, {
              ...securityService.SECURITY_ERRORS.SUCCESS,
              message:
                "Scoring data for additional information saved successfully.",
            });
          });
        }
      }
    );
  },
  logScoringData: function (dbkey, registration_no, mainCallback) {
    const tranObj = dbkey.connectionobj;
    if (!tranObj) {
      return mainCallback(
        new Error("Transaction object not found for logging.")
      );
    }

    console.log(
      `---  archiving screening data for reg_no: ${registration_no} (using simple INSERT) ---`
    );

    async.series(
      [
        // 1. Log a_rec_app_main to a_rec_app_main_log
        function (cback) {
          const mainCols = [
            "`a_rec_app_main_id`",
            "`registration_no`",
            "`a_rec_adv_main_id`",
            "`session_id`",
            "`post_code`",
            "`subject_id`",
            "`Salutation_E`",
            "`Applicant_First_Name_E`",
            "`Applicant_Middle_Name_E`",
            "`Applicant_Last_Name_E`",
            "`Applicant_First_Name_H`",
            "`Applicant_Middle_Name_H`",
            "`Applicant_Last_Name_H`",
            "`Applicant_Father_Name_E`",
            "`Applicant_Mother_Name_E`",
            "`Applicant_Husband_Name_E`",
            "`candidate_category_id`",
            "`gender_id`",
            "`DOB`",
            "`DOB_Doc_Status_Flag_Id`",
            "`DOB_Status_Remark`",
            "`Mobile_No`",
            "`Alternate_mobile_No`",
            "`Email_Id`",
            "`Birth_Place`",
            "`Birth_District_Id`",
            "`Birth_State_Id`",
            "`Birth_Country_Id`",
            "`Identification_Mark1`",
            "`Identification_Mark2`",
            "`religion_code`",
            "`Is_CG_Domocile`",
            "`Is_Local_Lang_Knowledge`",
            "`Is_EWS_Section`",
            "`Is_Married_YN`",
            "`No_Of_Child`",
            "`Is_Surviving_child_YN`",
            "`Marriage_Date`",
            "`Is_Mrg_Decl_YN`",
            "`Is_Married_at_Prescribed_Age_YN`",
            "`Is_Disability`",
            "`Recruitment_Disability_Type_Id`",
            "`Disability_Percentage`",
            "`In_Service_YN`",
            "`InService_OrganizationName`",
            "`InService_PostName`",
            "`InService_Fromdate`",
            "`InService_Todate`",
            "`Inservice_NOC_Doc`",
            "`Permanent_Address1`",
            "`Permanent_City`",
            "`Permanent_District_Id`",
            "`Permanent_State_Id`",
            "`Permanent_Country_Id`",
            "`Permanent_Pin_Code`",
            "`Current_Address1`",
            "`Current_City`",
            "`Current_District_Id`",
            "`Current_State_Id`",
            "`Current_Country_Id`",
            "`Current_Pin_Code`",
            "`Is_Final_Decl_YN`",
            "`is_Chk_AdvanceCopy_YN`",
            "`Allow_Reopen_YN`",
            "`File_Verified_By_CandidateYN`",
            "`File_Verified_By_Candidate_dateTime`",
            "`File_Verified_By_CandidatePublicIP`",
            "`File_Verified_By_CandidatePrivateIP`",
            "`candidate_photo`",
            "`candidate_signature`",
            "`Application_Step_Flag_CES`",
            "`Verified_by`",
            "`Verified_date`",
            "`Verified_Remark`",
            "`Round_No`",
            "`Document_Status_Flag_Id`",
            "`Document_Status_Remark_Id`",
            "`Verification_Finalize_YN`",
            "`active_status`",
            "`action_type`",
            "`action_date`",
            "`action_ip_address`",
            "`action_remark`",
            "`action_order_copy`",
            "`action_by`",
            "`delete_flag`",
          ];
          const colNames = mainCols.join(", ");

          // ✅ We removed ON DUPLICATE KEY UPDATE
          const sql = `
            INSERT INTO a_rec_app_main_log (${colNames})
            SELECT ${colNames} FROM a_rec_app_main
            WHERE registration_no = ? AND Application_Step_Flag_CES = 'S'
          `;

          tranObj.query(sql, [registration_no], (err, result) => {
            if (err) return cback(err);
            console.log(
              ` -> Logged ${result.affectedRows} new row(s) to a_rec_app_main_log`
            );
            cback();
          });
        },

        // 2. Log a_rec_app_main_addtional_info to a_rec_app_main_addtional_info_log
        function (cback) {
          const addtlCols = [
            "`a_rec_app_main_addtional_info_id`",
            "`registration_no`",
            "`question_id`",
            "`option_id`",
            "`condition_id`",
            "`input_field`",
            "`Application_Step_Flag_CES`",
            "`Verified_by`",
            "`Verified_date`",
            "`Verified_Remark`",
            "`Round_No`",
            "`Document_Status_Flag_Id`",
            "`Document_Status_Remark_Id`",
            "`Verification_Finalize_YN`",
            "`active_status`",
            "`action_type`",
            "`action_date`",
            "`action_ip_address`",
            "`action_remark`",
            "`action_order_copy`",
            "`action_by`",
          ];
          const colNames = addtlCols.join(", ");

          const sql = `
            INSERT INTO a_rec_app_main_addtional_info_log (${colNames})
            SELECT ${colNames} FROM a_rec_app_main_addtional_info
            WHERE registration_no = ? AND Application_Step_Flag_CES = 'S'
          `;

          tranObj.query(sql, [registration_no], (err, result) => {
            if (err) return cback(err);
            console.log(
              ` -> Logged ${result.affectedRows} new row(s) to a_rec_app_main_addtional_info_log`
            );
            cback();
          });
        },

        // 3. Log a_rec_app_score_field_detail to a_rec_app_score_field_detail_log
        function (cback) {
          const detailCols = [
            "`a_rec_app_score_field_detail_id`",
            "`registration_no`",
            "`a_rec_app_main_id`",
            "`a_rec_adv_post_detail_id`",
            "`score_field_parent_id`",
            "`m_rec_score_field_id`",
            "`score_field_value`",
            "`score_field_actual_value`",
            "`score_field_calculated_value`",
            "`m_rec_score_field_method_id`",
            "`field_marks`",
            "`field_weightage`",
            "`remark`",
            "`unique_parameter_display_no`",
            "`verified_by`",
            "`verified_date`",
            "`Application_Step_Flag_CES`",
            "`Verified_Remark`",
            "`Round_No`",
            "`Document_Status_Flag_Id`",
            "`Document_Status_Remark_Id`",
            "`Verification_Finalize_YN`",
            "`active_status`",
            "`action_type`",
            "`action_date`",
            "`action_ip_address`",
            "`action_remark`",
            "`action_order_copy`",
            "`action_by`",
            "`delete_flag`",
          ];
          const colNames = detailCols.join(", ");

          // ✅ We removed ON DUPLICATE KEY UPDATE
          const sql = `
            INSERT INTO a_rec_app_score_field_detail_log (${colNames})
            SELECT ${colNames} FROM a_rec_app_score_field_detail
            WHERE registration_no = ? AND Application_Step_Flag_CES = 'S'
          `;

          tranObj.query(sql, [registration_no], (err, result) => {
            if (err) {
              console.error(
                " -> ERROR logging to 'a_rec_app_score_field_detail_log'.",
                err.message
              );
              return cback(err);
            }
            console.log(
              ` -> Logged ${result.affectedRows} new row(s) to a_rec_app_score_field_detail_log`
            );
            cback();
          });
        },

        // 4. Log a_rec_app_score_field_parameter_detail to a_rec_app_score_field_parameter_detail_log
        function (cback) {
          const paramCols = [
            "`a_rec_app_score_field_parameter_detail_id`",
            "`a_rec_app_score_field_detail_id`",
            "`registration_no`",
            "`score_field_parent_id`",
            "`m_rec_score_field_id`",
            "`m_rec_score_field_parameter_new_id`",
            "`parameter_row_index`",
            "`parameter_value`",
            "`verified_by`",
            "`verified_date`",
            "`Application_Step_Flag_CES`",
            "`Verified_Remark`",
            "`Round_No`",
            "`Document_Status_Flag_Id`",
            "`Document_Status_Remark_Id`",
            "`Verification_Finalize_YN`",
            "`is_active`",
            "`parameter_display_no`",
            "`obt_marks`",
            "`unique_parameter_display_no`",
            "`active_status`",
            "`action_type`",
            "`action_date`",
            "`action_ip_address`",
            "`action_remark`",
            "`action_order_copy`",
            "`action_by`",
            "`delete_flag`",
          ];
          const colNames = paramCols.join(", ");

          // ✅ We removed ON DUPLICATE KEY UPDATE
          const sql = `
            INSERT INTO a_rec_app_score_field_parameter_detail_log (${colNames})
            SELECT ${colNames} FROM a_rec_app_score_field_parameter_detail
            WHERE registration_no = ? AND Application_Step_Flag_CES = 'S'
          `;

          tranObj.query(sql, [registration_no], (err, result) => {
            if (err) return cback(err);
            console.log(
              ` -> Logged ${result.affectedRows} new row(s) to a_rec_app_score_field_parameter_detail_log`
            );
            cback();
          });
        },
      ],
      (err) => {
        if (err) {
          console.error("--- Error during screening data logging ---", err);
        } else {
          console.log(
            `--- Successfully archived screening data for reg_no: ${registration_no} ---`
          );
        }
        mainCallback(err);
      }
    );
  },

  // ---------------------------------------------------------------------------------
  // --- FINAL DECISION FUNCTION (This must replace your existing one) ---
  // ---------------------------------------------------------------------------------

  updateScoringFinalDecision: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let a_rec_app_main_id,
      verification_Finalize_YN,
      verified_Remark,
      registration_no;

    let tranObj, tranCallback;
    let newRoundNo = 1; // Default to 1

    // STEP 1: Parse and validate
    try {
      a_rec_app_main_id = request.body.a_rec_app_main_id;
      verification_Finalize_YN = request.body.Verification_Finalize_YN;
      verified_Remark = request.body.Verified_Remark || null;
      registration_no = request.body.registration_no;

      if (!a_rec_app_main_id) throw new Error("Application ID is required.");
      if (!registration_no) throw new Error("Registration number is required.");
      if (!verification_Finalize_YN)
        throw new Error("Final decision is required.");
      if (verification_Finalize_YN === "N" && !verified_Remark) {
        throw new Error("Remarks are required when rejecting.");
      }
    } catch (e) {
      return callback({
        status: "error",
        message: "Invalid request body",
        details: e.message,
      });
    }

    console.log(
      `📝 Starting final SCORING decision for Reg: ${registration_no}`
    );

    // STEP 2: Prepare base payload
    const updatePayload = {
      table_name: "a_rec_app_main",
      a_rec_app_main_id: a_rec_app_main_id,
      registration_no: registration_no,
      Application_Step_Flag_CES: "S", // ✅ Flag is 'S' for Scoring
      Verification_Finalize_YN: verification_Finalize_YN,
      Verified_Remark: verified_Remark,
      Verified_by: String(sessionDetails.user_id),
      action_ip_address: sessionDetails.ip_address,
      Verified_date: new Date(),
    };

    // STEP 3: Transaction Execution
    async.series(
      [
        // 3a. Start Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) return cback(err);
              tranObj = tranobj;
              tranCallback = trancallback;
              // Attach transaction to dbkey so all subsequent services use it
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback();
            }
          );
        },

        // 3b. Fetch current Round_No (Using tranObj.query)
        function (cback) {
          const sql = `SELECT Round_No FROM a_rec_app_main WHERE a_rec_app_main_id = ?`;

          tranObj.query(sql, [a_rec_app_main_id], function (err, rows) {
            if (err) return cback(err);

            if (rows && rows.length > 0) {
              const currentRound = rows[0].Round_No;

              // Logic: If null => 1, else => increment by 1
              if (currentRound === null || currentRound === undefined) {
                newRoundNo = 1;
              } else {
                newRoundNo = parseInt(currentRound) + 1;
              }

              // Add Round_No to the payload for Step 3c
              updatePayload.Round_No = newRoundNo;
              console.log(
                `🔄 Round Number logic: Prev=${currentRound}, New=${newRoundNo}`
              );
            }
            return cback();
          });
        },

        // 3c. Update Main Table (Shared Service)
        function (cback) {
          console.log(
            ` -> Updating a_rec_app_main (Scoring) with Round_No: ${newRoundNo}...`
          );
          SHARED_SERVICE.validateAndUpdateInTable(
            dbkey,
            request,
            updatePayload,
            sessionDetails,
            cback
          );
        },

        // 3d. Update Dependent Tables (Using tranObj.query)
        function (cback) {
          console.log(
            ` -> Updating Round_No in dependent tables (Flag 'S')...`
          );

          const userId = sessionDetails.user_id;
          // ✅ Ensure we filter by 'S' so we don't mess up Screening ('E') or Candidate ('C') data
          const queryParams = [newRoundNo, userId, registration_no, "S"];

          const sqlAdditionalInfo = `
            UPDATE a_rec_app_main_addtional_info 
            SET Round_No = ?, Verified_by = ?, Verified_date = NOW() 
            WHERE registration_no = ? AND Application_Step_Flag_CES = ?`;

          const sqlScoreDetail = `
            UPDATE a_rec_app_score_field_detail 
            SET Round_No = ?, verified_by = ?, verified_date = NOW() 
            WHERE registration_no = ? AND Application_Step_Flag_CES = ?`;

          const sqlParamDetail = `
            UPDATE a_rec_app_score_field_parameter_detail 
            SET Round_No = ?, verified_by = ?, verified_date = NOW() 
            WHERE registration_no = ? AND Application_Step_Flag_CES = ?`;

          // Execute parallel updates
          async.parallel(
            [
              (pCback) => tranObj.query(sqlAdditionalInfo, queryParams, pCback),
              (pCback) => tranObj.query(sqlScoreDetail, queryParams, pCback),
              (pCback) => tranObj.query(sqlParamDetail, queryParams, pCback),
            ],
            function (err, results) {
              if (err) {
                console.error("Error updating dependent tables Round_No", err);
              }
              return cback(err);
            }
          );
        },

        // ============================================================
        // ✅ NEW STEP: Update Dawapatti Status to 'Y'
        // ============================================================
        function (cback) {
          console.log(
            ` -> Updating Dawapatti Status to 'Y' for Reg: ${registration_no}...`
          );

          const userId = sessionDetails.user_id;

          // We update dawapatti_status to 'Y' (Resolved/Finalized)
          // We strictly check for 'S' (Scoring) to avoid touching Screening dawapatti
          const sqlDawapatti = `
            UPDATE m_rec_app_dawapatti 
            SET dawapatti_status = 'Y', 
                action_by = ?, 
                action_date = NOW()
            WHERE registration_no = ? 
              AND dawapatti_applied_after_ES = 'S'
              AND active_status = 'Y'`;

          tranObj.query(
            sqlDawapatti,
            [userId, registration_no],
            function (err, result) {
              if (err) {
                console.error("❌ Error updating Dawapatti Status:", err);
                return cback(err);
              }
              console.log(
                `✅ Dawapatti records updated: ${result.affectedRows}`
              );
              return cback();
            }
          );
        },

        // 3e. Logging (Calls logScoringData)
        function (cback) {
          if (
            verification_Finalize_YN === "Y" ||
            verification_Finalize_YN === "N"
          ) {
            // ✅ Using logScoringData specific to scoring
            candidateService.logScoringData(dbkey, registration_no, cback);
          } else {
            return cback();
          }
        },
      ],
      // STEP 4: Commit/Rollback
      function (err) {
        if (err) {
          console.error("❌ Error updating final Scoring decision:", err);
          DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, () =>
            callback(err)
          );
        } else {
          DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
            console.log(`✅ Success. Round No updated to ${newRoundNo}`);
            callback(null, {
              status: "success",
              message: "Final decision saved successfully.",
            });
          });
        }
      }
    );
  },
  syncScoringData: function (
    dbkey,
    request,
    params, // this will be {} from the frontend
    sessionDetails,
    callback
  ) {
    console.log("--- 🔄 Starting Sync: Copying 'C' data to 'S' ---");
    console.log(
      "Params received in sync screening: ",
      JSON.stringify(params, null, 2)
    );
    let query308Data, query305Data;
    let tranObj, tranCallback;

    // This map is essential for linking the new parameters to their new parent details
    // Key: old_C_detail_id, Value: new_E_detail_id
    const detailIdMap = new Map();

    async.series(
      [
        // 1. --- Execute Query 308 (Parameters) ---
        function (cback) {
          console.log(" -> Executing Query 308 (Get 'C' Parameters)...");
          const queryParams_308 = {
            registration_no: params.registration_no,
            app_main_id: params.app_main_id,
            post_detail_id: params.post_detail_id,
            not_exists: "S",
            Application_Step_Flag_CES: "C",
          };
          const modifiedSessionDetails_308 = {
            ...sessionDetails,
            query_id: 308,
          };
          DB_SERVICE.getQueryDataFromId(
            dbkey,
            request,
            queryParams_308,
            modifiedSessionDetails_308,
            (err, data) => {
              if (err) {
                console.error("❌ ERROR executing query 308:", err);
                return cback(err);
              }
              query308Data = data; // This is the full response object
              cback();
            }
          );
        },

        // 2. --- Execute Query 305 (Details) ---
        function (cback) {
          console.log(" -> Executing Query 305 (Get 'C' Details)...");
          const queryParams_305 = {
            registration_no: params.registration_no,
            app_main_id: params.app_main_id,
            post_detail_id: params.post_detail_id,
            not_exists: "S",
            Application_Step_Flag_CES: "C",
          };
          const modifiedSessionDetails_305 = {
            ...sessionDetails,
            query_id: 305,
          };
          DB_SERVICE.getQueryDataFromId(
            dbkey,
            request,
            queryParams_305,
            modifiedSessionDetails_305,
            (err, data) => {
              if (err) {
                console.error("❌ ERROR executing query 305:", err);
                return cback(err);
              }
              query305Data = data; // This is the full response object
              cback();
            }
          );
        },

        // 3. --- Start Transaction ---
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) return cback(err);
              tranObj = tranobj;
              tranCallback = trancallback;
              // Re-assign dbkey to be the transaction-aware object
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              console.log(" -> 🔑 Transaction started.");
              return cback();
            }
          );
        },

        // 4. --- Process and Insert Detail Records (from 305) ---
        function (cback) {
          // ✅ FIX: Check the array directly, not .data
          if (!query305Data || query305Data.length === 0) {
            console.log(" -> No detail records ('C') to sync.");
            return cback();
          }

          // ✅ FIX: Use the array directly, not .data
          const detailsToInsert = query305Data;
          console.log(
            ` -> Processing ${detailsToInsert.length} 'C' detail records for sync...`
          );

          async.eachSeries(
            detailsToInsert,
            (detailRecord, eachCb) => {
              const oldDetailId = detailRecord.a_rec_app_score_field_detail_id;

              // Prepare the new 'S' record
              const newRecordPayload = {
                ...detailRecord,
                table_name: "a_rec_app_score_field_detail",
                Application_Step_Flag_CES: "S", // Set the new flag
              };

              // "delete the ids" - Remove the old PK so a new one is generated
              delete newRecordPayload.a_rec_app_score_field_detail_id;

              SHARED_SERVICE.validateAndInsertInTable(
                dbkey,
                request,
                newRecordPayload,
                sessionDetails,
                (err, res) => {
                  if (err) return eachCb(err);

                  const newDetailId = res.data.insertId;
                  if (!newDetailId) {
                    return eachCb(
                      new Error(
                        "Insert did not return a new ID for detail record."
                      )
                    );
                  }

                  // Store the mapping from the old C primary key to the new E primary key
                  detailIdMap.set(oldDetailId, newDetailId);
                  console.log(
                    `    -> Mapped old_C_id ${oldDetailId} to new_E_id ${newDetailId}`
                  );
                  eachCb();
                }
              );
            },
            cback // Callback for when all details are inserted
          );
        },

        // 5. --- Process and Insert Parameter Records (from 308) ---
        function (cback) {
          // ✅ FIX: Check the array directly, not .data
          if (!query308Data || query308Data.length === 0) {
            console.log(" -> No parameter records ('C') to sync.");
            return cback();
          }

          // ✅ FIX: Use the array directly, not .data
          const paramsToInsert = query308Data;
          console.log(
            ` -> Processing ${paramsToInsert.length} 'C' parameter records for sync...`
          );

          async.eachSeries(
            paramsToInsert,
            (paramRecord, eachCb) => {
              const oldParentDetailId =
                paramRecord.a_rec_app_score_field_detail_id;
              const newParentDetailId = detailIdMap.get(oldParentDetailId);

              // This logic is still needed for the "mismatched data" problem
              if (!newParentDetailId) {
                console.warn(
                  `    -> ⚠️ WARNING: Skipping parameter. Could not find new parent E_id for old C_id ${oldParentDetailId}.`
                );
                // This parameter's parent (e.g., 527, 528) already has an 'S' record,
                // but this function isn't designed to look it up.
                // We will skip this orphan parameter to prevent a crash.
                return eachCb();
              }

              // Prepare the new 'S' record
              const newParamPayload = {
                ...paramRecord,
                table_name: "a_rec_app_score_field_parameter_detail",
                Application_Step_Flag_CES: "S", // Set the new flag
                a_rec_app_score_field_detail_id: newParentDetailId, // Set the *new* foreign key
              };

              // "delete the ids" - Remove the old PK so a new one is generated
              delete newParamPayload.a_rec_app_score_field_parameter_detail_id;

              SHARED_SERVICE.validateAndInsertInTable(
                dbkey,
                request,
                newParamPayload,
                sessionDetails,
                eachCb // Callback for when this parameter is inserted
              );
            },
            cback // Callback for when all parameters are inserted
          );
        },
      ],
      // 6. --- Final Callback (Commit/Rollback) ---
      function (err) {
        if (err) {
          console.error("❌ ERROR during C-to-E sync, rolling back:", err);
          DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, () =>
            callback(err)
          );
          return;
        }

        console.log(
          "✅ SUCCESS: C-to-E sync complete. Committing transaction."
        );
        DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
          callback(null, {
            ...securityService.SECURITY_ERRORS.SUCCESS,
            message: "Data synced successfully from Candidate to Scoring.",
            data: {
              details_copied: query305Data ? query305Data.length : 0,
              parameters_copied: query308Data ? query308Data.length : 0,
            },
          });
        });
      }
    );
  },
};

module.exports = candidateService;
