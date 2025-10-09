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
              cback
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
  saveOrUpdateQuantityBasedCandidateDetailsForScreening: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    // STEP 0: Parse request body
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
      // Removed parsing for parameterIdsToDelete
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
        },

        // STEP 2: Handle Parent Record
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

        // Deletion steps have been removed.

        // STEP 3: Handle Child Detail Records (Upsert based on Application_Step_Flag_CES)
        function (cback) {
          if (!detailList || detailList.length === 0) return cback();

          const detailsToUpdate = detailList.filter(
            (d) => d.Application_Step_Flag_CES === "E"
          );
          const detailsToInsert = detailList.filter(
            (d) => d.Application_Step_Flag_CES !== "E"
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
                        const newId = res.data.insertId;
                        paramList.forEach((p) => {
                          if (
                            p.score_field_parent_id ===
                              detail.score_field_parent_id &&
                            p.m_rec_score_field_id ===
                              detail.m_rec_score_field_id
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

        // STEP 4: Handle Parameter Records (Upsert based on Application_Step_Flag_CES)
        function (cback) {
          if (!paramList || paramList.length === 0) return cback();

          const paramsToUpdate = paramList.filter(
            (p) => p.Application_Step_Flag_CES === "E"
          );
          const paramsToInsert = paramList.filter(
            (p) => p.Application_Step_Flag_CES !== "E"
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
      // Final callback
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
};

module.exports = candidateService;
