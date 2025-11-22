var async = require("async");
var DB_SERVICE = global.DB_SERVICE;
var securityService = global.COMMON_SECURITY_SERVICE;
const DOC_UPLOAD_SERVICE = global.DOC_UPLOAD_SERVICE;
const SHARED_SERVICE = global.SHARED_SERVICE;
var async = require("async");
let cetService = {
 

  postCounSignUp: function (dbkey, request, params, sessionDetails, callback) {
    let tranObj, tranCallback;

    console.log("Raw Request Body:", request.body);

    try {
      params = request.body; // single object, not array
    } catch (e) {
      return callback({ message: 'Invalid JSON format in "data" field.' });
    }

    console.log("Parsed Params:", params);

    async.series(
      [
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) return cback(err);
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey.connectionobj = tranObj;
              return cback();
            }
          );
        },

        function (cback) {
          const scoreRecord = {
            table_name: "a_entrance_app_main",
            applicant_first_name: params.applicant_first_name,
            applicant_middle_name: params.applicant_middle_name?.trim() || null,
            applicant_last_name: params.applicant_last_name?.trim() || null,
            mobile_no: params.mobile_no,
            e_mail: params.e_mail,
            security_question: params.security_question,
            security_answer: params.security_answer,
            login_password: params.login_password,
            salutation_id: params.salutation_id,
            academic_session_id: params.academic_session_id,
            entrance_exam_type_code: params.entrance_exam_type_code,
            degree_id: params.degree_id,
            action_type: "C",
            action_date: new Date(),
            action_ip_address: sessionDetails.ip_address,
            action_remark: "Counseling SignUp Created",
            action_by: parseInt(params.actionBy) || 0,
            delete_flag: "N",
            active_status: "Y",
          };

          SHARED_SERVICE.validateAndInsertInTable(
            dbkey,
            request,
            scoreRecord,
            sessionDetails,
            function (err, res) {
              console.log("Insert Result:", err, res);

              if (err) return cback(err);
              else if (res.data && res.data.insertId) {
                // ✅ Capture primary key
                params.reg_no = res.data.insertId;

                // Save full record in params
                params._insertedRecord = {
                  ...scoreRecord,
                  insertId: res.data.insertId,
                };

                return cback();
              } else {
                return cback({
                  message:
                    "Something went wrong inserting into a_entrance_app_main  ",
                });
              }
            }
          );
        },
      ],
      function (err) {
        if (err) {
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
              return callback(null, {
                ...securityService.SECURITY_ERRORS.SUCCESS,
                message: `SignUp saved successfully. Your Registration ID is ${params.reg_no}`,
                registration_id: params.reg_no, //  send separately too
                inserted: params._insertedRecord || {},
              });
            }
          );
        }
      }
    );
  },

  postCETApplicationForm: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    // Get flat body/params
    const payload = request.body || params || {};
    async.series(
      [
        // 1. Start transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) return cback(err);
              tranObj = tranobj;
              tranCallback = trancallback;
              return cback();
            }
          );
        },

        // Step 1: DYNAMIC FILE UPLOAD (like saveAdvertisementDetail)
        function (cback) {
          if (!request.files || Object.keys(request.files).length === 0) {
            console.log("No files found to upload, skipping file upload step.");
            return cback();
          }

          const registrationNo = payload.reg_no;
          const folderPath = `${registrationNo}`; // ✅ structured folder

          async.eachOf(
            request.files,
            function (file, controlName, uploadCb) {
              if (!file || !file.name) return uploadCb();

              const uploadOptions = {
                file_name: `${Date.now()}_${controlName}`,
                control_name: controlName,
                folder_name: registrationNo,
              };

              DOC_UPLOAD_SERVICE.docUploadWithFolder(
                dbkey,
                request,
                uploadOptions,
                sessionDetails,
                function (err, uploadRes) {
                  if (err) return uploadCb(err);

                  if (uploadRes && uploadRes.file_path) {
                    // assign dynamically to payload
                    payload[controlName] = uploadRes.file_path;

                    console.log(
                      payload.candidate_photo,
                      payload.candidate_signature
                    );
                    console.log("Uploaded:", controlName, uploadRes.file_path);
                  }
                  return uploadCb();
                }
              );
            },
            function (err) {
              return cback(err);
            }
          );
        },

        // 2. Check payload type and update accordingly
        function (cback) {
          console.log(payload.candidate_photo, payload.candidate_signature);

          if (payload.applicant_first_name || payload.degree_type_id) {
            //  Convert various formats to Y/N
            const convertToYN = (value) => {
              if (value === 'Yes' || value === 'Y' || value === true) return 'Y';
              if (value === 'No' || value === 'N' || value === false) return 'N';
              return value; // Return as-is for other values
            };
            // ---------- BASIC DETAILS ----------
            const updateObj = {
              table_name: "a_entrance_app_main",
              reg_no: payload.reg_no,
              degree_id: payload.degree_type_id || null,
              salutation_id: payload.salutation_id || null,
              applicant_first_name: payload.applicant_first_name || "",
              applicant_middle_name: payload.applicant_middle_name || null,
              applicant_last_name: payload.applicant_last_name || "",
              applicant_father_name: payload.applicant_father_name || "",
              applicant_mother_name: payload.applicant_mother_name || "",
              dob: payload.dob || null,
              gender_id: payload.gender_id || "",
              category_id: payload.category_id || null,
              nationality: payload.nationality || "",
              applicant_guardian_name: payload.applicant_guardian_name || null,
              photo_path: payload.candidate_photo,
              signature_path: payload.candidate_signature,
              is_debarred_yn: convertToYN(payload.is_debarred_yn),
              is_appeared: convertToYN(payload.is_appeared) || null,
              cg_domicile_yn: convertToYN(payload.cg_domicile_yn),
              active_status: "Y",
              action_ip_address: sessionDetails.ip_address,
              action_remark: "Basic details saved",
              action_by: sessionDetails.user_id,
              delete_flag: "N",
            };

            return SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              updateObj,
              sessionDetails,
              cback
            );
          } else if (payload.mobile_no || payload.e_mail) {
            // ---------- CONTACT DETAILS ----------
            const updateObj = {
              table_name: "a_entrance_app_main",
              reg_no: payload.reg_no, //as a FK
              mobile_no: payload.mobile_no || "",
              mobile_no2: payload.mobile_no2 || "",
              e_mail: payload.e_mail || "",
              current_address: payload.current_address || "",
              //current_address_line2: payload.current_address_line2 || "",
              current_block_id: payload.current_block_id || null,
              current_district_id: payload.current_district_id || null,
              current_state_id: payload.current_state_id || null,
              pin_code: payload.pin_code || "",
              permanent_address: payload.permanent_address || null,
              //permanent_address_line2: payload.permanent_address_line2 || "",
              permanent_block_id: payload.permanent_block_id || null,
              permanent_district_id: payload.permanent_district_id || null,
              permanent_state_id: payload.permanent_state_id || null,
              permanent_pin_code: payload.permanent_pin_code || "",
              is_sameas_current_address: payload.is_sameas_current_address
                ? "Y"
                : "N",
              active_status: "Y",
              action_ip_address: sessionDetails.ip_address,
              action_remark: "Contact details saved",
              action_by: sessionDetails.user_id,
              delete_flag: "N",
            };

            return SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              updateObj,
              sessionDetails,
              cback
            );
          }
          // Add this as a new condition in your existing postCETApplicationForm function
          else if (
            payload.counseling_board_univ_id ||
            payload.hssc_board ||
            payload.bachelor_board
          ) {
            // ---------- ACADEMIC DETAILS ----------

            const academicRows = [];

            // 10th Details
            if (payload.counseling_board_univ_id && payload.passing_year) {
              academicRows.push({
                couns_acad_exam_name_id: 1,
                counseling_board_univ_id: payload.counseling_board_univ_id,
                board_university_name: payload.board_university_name || '',
                passing_year: payload.passing_year,
                roll_no: payload.roll_no || "",
                obtained_marks: payload.obtained_marks || 0,
                total_marks: payload.total_marks || 0,
                ogpa_percent:
                  payload.total_marks > 0
                    ? (
                      (payload.obtained_marks / payload.total_marks) *
                      100
                    ).toFixed(2)
                    : 0,
                subject_id: null,
                degree_id: null,
                remarks: "10th Details",
              });
            }

            // 12th Details
            if (payload.hssc_board && payload.hssc_year) {
              academicRows.push({
                couns_acad_exam_name_id: 2,
                counseling_board_univ_id: payload.hssc_board,
                board_university_name: payload.board_university_name || '',
                passing_year: payload.hssc_year,
                roll_no: payload.hssc_roll_no || "",
                obtained_marks: payload.hssc_obtained || 0,
                total_marks: payload.hssc_maximum || 0,
                ogpa_percent:
                  payload.hssc_maximum > 0
                    ? (
                      (payload.hssc_obtained / payload.hssc_maximum) *
                      100
                    ).toFixed(2)
                    : 0,
                subject_id: payload.subject_id || null,
                degree_id: null,
                remarks: "12th Details",
              });
            }

            // Bachelor's Details
            if (payload.bachelor_board && payload.bachelor_year) {
              academicRows.push({
                couns_acad_exam_name_id: 3,
                counseling_board_univ_id: payload.bachelor_board,
                board_university_name: payload.board_university_name || '',
                passing_year: payload.bachelor_year,
                roll_no: payload.bachelor_roll_no || "",
                obtained_marks: payload.bachelor_obtained || 0,
                total_marks: payload.bachelor_maximum || 0,
                ogpa_percent:
                  payload.bachelor_maximum > 0
                    ? (
                      (payload.bachelor_obtained / payload.bachelor_maximum) *
                      100
                    ).toFixed(2)
                    : 0,
                subject_id: null,
                degree_id: payload.degree_id || null,
                remarks: "Bachelor's Details",
              });
            }

            // Master's Details (Optional)
            if (payload.pg_board && payload.pg_year) {
              academicRows.push({
                couns_acad_exam_name_id: 4,
                counseling_board_univ_id: payload.pg_board || null,
                board_university_name: payload.board_university_name || '',
                passing_year: payload.pg_year || null,
                roll_no: payload.pg_roll_no || "",
                obtained_marks: payload.pg_obtained || 0,
                total_marks: payload.pg_maximum || 0,
                ogpa_percent:
                  payload.pg_maximum > 0
                    ? (
                      (payload.pg_obtained / payload.pg_maximum) *
                      100
                    ).toFixed(2)
                    : 0,
                subject_id: null,
                degree_id: payload.pg_degree || null,
                remarks: "Master's Details",
              });
            }

            async.eachSeries(
              academicRows,
              function (academicRow, cb) {
                let insert_obj = {
                  table_name: "a_entrance_app_acad_detail",
                  reg_no: payload.reg_no,
                  couns_acad_exam_name_id: academicRow.couns_acad_exam_name_id,
                  counseling_board_univ_id:
                    academicRow.counseling_board_univ_id,
                  passing_year: academicRow.passing_year,
                  roll_no: academicRow.roll_no,
                  obtained_marks: academicRow.obtained_marks,
                  total_marks: academicRow.total_marks,
                  ogpa_percent: academicRow.ogpa_percent,
                  subject_id: academicRow.subject_id,
                  degree_id: academicRow.degree_id,
                  remarks: academicRow.remarks,
                  active_status: "Y",
                  action_type: "I",
                  action_date: new Date(),
                  action_ip_address: sessionDetails.ip_address,
                  action_remark: "Academic details saved",
                  action_by: sessionDetails.user_id,
                  delete_flag: "N",
                };

                SHARED_SERVICE.validateAndInsertInTable(
                  dbkey,
                  request,
                  insert_obj,
                  sessionDetails,
                  function (err, res) {
                    if (err) return cb(err);
                    return cb();
                  }
                );
              },
              function (err) {
                return cback(err);
              }
            );
          } else if (
            payload.is_employed !== undefined ||
            payload.company_name
          ) {
            // ---------- EMPLOYMENT DETAILS ----------
            const insertObj = {
              table_name: "a_entrance_app_emp_details",
              reg_no: payload.reg_no, //as a FK
              is_employed: payload.is_employed ? "Y" : "N",
              dept_name: payload.company_name || "",
              post_name: payload.designation || "",
              date_of_joining: payload.dateOfJoining || null,
              date_of_leaving: payload.dateOfLeaving || null,
              reason_of_leaving: payload.reasonOfLeaving || "",
              active_status: "Y",
              action_type: "I",
              action_date: new Date(),
              action_ip_address: sessionDetails.ip_address,
              action_remark: "Employment details saved",
              action_by: sessionDetails.user_id,
              delete_flag: "N",
            };

            return SHARED_SERVICE.validateAndInsertInTable(
              dbkey,
              request,
              insertObj,
              sessionDetails,
              cback
            );
          } else if (
            payload.preferences &&
            Array.isArray(payload.preferences)
          ) {
            async.eachSeries(
              payload.preferences,
              function (preference, cb) {
                let insertObj = {
                  table_name: "a_entrance_app_exam_center", // Your preferences table
                  reg_no: payload.reg_no,
                  cet_exam_center_id: preference.cet_exam_center_id,
                  preference_no: preference.preference_no,
                  active_status: "Y",
                  action_type: "I",
                  action_date: new Date(),
                  action_ip_address: sessionDetails.ip_address,
                  action_remark: "Preference saved",
                  action_by: sessionDetails.user_id,
                  delete_flag: "N",
                };

                SHARED_SERVICE.validateAndInsertInTable(
                  dbkey,
                  request,
                  insertObj,
                  sessionDetails,
                  function (err, res) {
                    if (err) return cb(err);
                    return cb();
                  }
                );
              },
              function (err) {
                return cback(err);
              }
            );
          } else {
            return cback(new Error("Unknown payload structure"));
          }
        },
      ],
      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              return callback(err);
            }
          );
        } else {
          let successMessage = "Form data saved successfully";
          if (payload.form_type === "basic_details") {
            successMessage = "Basic details saved successfully";
          } else if (payload.form_type === "contact_details") {
            successMessage = "Contact details saved successfully";
          } else if (payload.form_type === "academic_details") {
            successMessage = "Academic details saved successfully";
          } else if (payload.form_type === "employment_details") {
            successMessage = "Employment details saved successfully";
          } else if (payload.form_type === "preferences") {
            successMessage = "Preferences saved successfully";
          }

          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              return callback(null, {
                ...securityService.SECURITY_ERRORS.SUCCESS,
                message: successMessage,
              });
            }
          );


        }
      }
    );
  },

  updateCETAppForm: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    // Get flat body/params
    const payload = request.body || params || {};
    async.series(
      [
        // 1. Start transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) return cback(err);
              tranObj = tranobj;
              tranCallback = trancallback;
              return cback();
            }
          );
        },

        // Step 1: DYNAMIC FILE UPLOAD (like saveAdvertisementDetail)
        function (cback) {
          if (!request.files || Object.keys(request.files).length === 0) {
            console.log("No files found to upload, skipping file upload step.");
            return cback();
          }

          const registrationNo = payload.reg_no;
          const folderPath = `${registrationNo}`; // ✅ structured folder

          async.eachOf(
            request.files,
            function (file, controlName, uploadCb) {
              if (!file || !file.name) return uploadCb();

              const uploadOptions = {
                file_name: `${Date.now()}_${controlName}`,
                control_name: controlName,
                folder_name: registrationNo,
              };

              DOC_UPLOAD_SERVICE.docUploadWithFolder(
                dbkey,
                request,
                uploadOptions,
                sessionDetails,
                function (err, uploadRes) {
                  if (err) return uploadCb(err);

                  if (uploadRes && uploadRes.file_path) {
                    // assign dynamically to payload
                    payload[controlName] = uploadRes.file_path;

                    console.log(
                      payload.candidate_photo,
                      payload.candidate_signature
                    );
                    console.log("Uploaded:", controlName, uploadRes.file_path);
                  }
                  return uploadCb();
                }
              );
            },
            function (err) {
              return cback(err);
            }
          );
        },

        // 2. Check payload type and update accordingly
        function (cback) {
          console.log(payload.candidate_photo, payload.candidate_signature);

          if (payload.applicant_first_name || payload.degree_type_id) {
            // ---------- BASIC DETAILS ----------
            const updateObj = {
              table_name: "a_entrance_app_main",
              reg_no: payload.reg_no,
              degree_id: payload.degree_type_id || null,
              salutation_id: payload.salutation_id || null,
              applicant_first_name: payload.applicant_first_name || "",
              applicant_middle_name: payload.applicant_middle_name || null,
              applicant_last_name: payload.applicant_last_name || "",
              applicant_father_name: payload.applicant_father_name || "",
              applicant_mother_name: payload.applicant_mother_name || "",
              dob: payload.dob || null,
              gender_id: payload.gender_id || "",
              category_id: payload.category_id || null,
              nationality: payload.nationality || "",
              applicant_guardian_name: payload.applicant_guardian_name || null,
              photo_path: payload.candidate_photo,
              signature_path: payload.candidate_signature,
              active_status: "Y",
              action_ip_address: sessionDetails.ip_address,
              action_remark: "Basic details saved",
              action_by: sessionDetails.user_id,
              delete_flag: "N",
            };

            return SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              updateObj,
              sessionDetails,
              cback
            );
          } else if (payload.mobile_no || payload.e_mail) {
            // ---------- CONTACT DETAILS ----------
            const updateObj = {
              table_name: "a_entrance_app_main",
              reg_no: payload.reg_no, //as a FK
              mobile_no: payload.mobile_no || "",
              mobile_no2: payload.mobile_no2 || "",
              e_mail: payload.e_mail || "",
              current_address: payload.current_address || "",
              //current_address_line2: payload.current_address_line2 || "",
              current_block_id: payload.current_block_id || null,
              current_district_id: payload.current_district_id || null,
              current_state_id: payload.current_state_id || null,
              pin_code: payload.pin_code || "",
              permanent_address: payload.permanent_address || null,
              //permanent_address_line2: payload.permanent_address_line2 || "",
              permanent_block_id: payload.permanent_block_id || null,
              permanent_district_id: payload.permanent_district_id || null,
              permanent_state_id: payload.permanent_state_id || null,
              permanent_pin_code: payload.permanent_pin_code || "",
              is_sameas_current_address: payload.is_sameas_current_address
                ? "Y"
                : "N",
              active_status: "Y",
              action_ip_address: sessionDetails.ip_address,
              action_remark: "Contact details saved",
              action_by: sessionDetails.user_id,
              delete_flag: "N",
            };

            return SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              updateObj,
              sessionDetails,
              cback
            );
          }
          // Add this as a new condition in your existing postCETApplicationForm function
          else if (
            payload.counseling_board_univ_id ||
            payload.hssc_board ||
            payload.bachelor_board
          ) {
            // ---------- ACADEMIC DETAILS ----------

            const academicRows = [];

            // 10th Details
            if (payload.counseling_board_univ_id && payload.passing_year) {
              academicRows.push({
                couns_acad_exam_name_id: 1,
                counseling_board_univ_id: payload.counseling_board_univ_id,
                passing_year: payload.passing_year,
                roll_no: payload.roll_no || "",
                obtained_marks: payload.obtained_marks || 0,
                total_marks: payload.total_marks || 0,
                ogpa_percent:
                  payload.total_marks > 0
                    ? (
                      (payload.obtained_marks / payload.total_marks) *
                      100
                    ).toFixed(2)
                    : 0,
                subject_id: null,
                degree_id: null,
                remarks: "10th Details",
              });
            }

            // 12th Details
            if (payload.hssc_board && payload.hssc_year) {
              academicRows.push({
                couns_acad_exam_name_id: 2,
                counseling_board_univ_id: payload.hssc_board,
                passing_year: payload.hssc_year,
                roll_no: payload.hssc_roll_no || "",
                obtained_marks: payload.hssc_obtained || 0,
                total_marks: payload.hssc_maximum || 0,
                ogpa_percent:
                  payload.hssc_maximum > 0
                    ? (
                      (payload.hssc_obtained / payload.hssc_maximum) *
                      100
                    ).toFixed(2)
                    : 0,
                subject_id: payload.subject_id || null,
                degree_id: null,
                remarks: "12th Details",
              });
            }

            // Bachelor's Details
            if (payload.bachelor_board && payload.bachelor_year) {
              academicRows.push({
                couns_acad_exam_name_id: 3,
                counseling_board_univ_id: payload.bachelor_board,
                passing_year: payload.bachelor_year,
                roll_no: payload.bachelor_roll_no || "",
                obtained_marks: payload.bachelor_obtained || 0,
                total_marks: payload.bachelor_maximum || 0,
                ogpa_percent:
                  payload.bachelor_maximum > 0
                    ? (
                      (payload.bachelor_obtained / payload.bachelor_maximum) *
                      100
                    ).toFixed(2)
                    : 0,
                subject_id: null,
                degree_id: payload.degree_id || null,
                remarks: "Bachelor's Details",
              });
            }

            // Master's Details (Optional)
            if (payload.pg_board && payload.pg_year) {
              academicRows.push({
                couns_acad_exam_name_id: 4,
                counseling_board_univ_id: payload.pg_board || null,
                passing_year: payload.pg_year || null,
                roll_no: payload.pg_roll_no || "",
                obtained_marks: payload.pg_obtained || 0,
                total_marks: payload.pg_maximum || 0,
                ogpa_percent:
                  payload.pg_maximum > 0
                    ? (
                      (payload.pg_obtained / payload.pg_maximum) *
                      100
                    ).toFixed(2)
                    : 0,
                subject_id: null,
                degree_id: payload.pg_degree || null,
                remarks: "Master's Details",
              });
            }

            async.eachSeries(
              academicRows,
              function (academicRow, cb) {
                let insert_obj = {
                  table_name: "a_entrance_app_acad_detail",
                  reg_no: payload.reg_no,
                  couns_acad_exam_name_id: academicRow.couns_acad_exam_name_id,
                  counseling_board_univ_id:
                    academicRow.counseling_board_univ_id,
                  passing_year: academicRow.passing_year,
                  roll_no: academicRow.roll_no,
                  obtained_marks: academicRow.obtained_marks,
                  total_marks: academicRow.total_marks,
                  ogpa_percent: academicRow.ogpa_percent,
                  subject_id: academicRow.subject_id,
                  degree_id: academicRow.degree_id,
                  remarks: academicRow.remarks,
                  active_status: "Y",
                  action_type: "I",
                  action_date: new Date(),
                  action_ip_address: sessionDetails.ip_address,
                  action_remark: "Academic details saved",
                  action_by: sessionDetails.user_id,
                  delete_flag: "N",
                };

                SHARED_SERVICE.validateAndUpdateInTable(
                  dbkey,
                  request,
                  insert_obj,
                  sessionDetails,
                  function (err, res) {
                    if (err) return cb(err);
                    return cb();
                  }
                );
              },
              function (err) {
                return cback(err);
              }
            );
          } else if (
            payload.is_employed !== undefined ||
            payload.company_name
          ) {
            // ---------- EMPLOYMENT DETAILS ----------
            const insertObj = {
              table_name: "a_entrance_app_emp_details",
              reg_no: payload.reg_no, //as a FK
              is_employed: payload.is_employed ? "Y" : "N",
              dept_name: payload.company_name || "",
              post_name: payload.designation || "",
              date_of_joining: payload.dateOfJoining || null,
              date_of_leaving: payload.dateOfLeaving || null,
              reason_of_leaving: payload.reasonOfLeaving || "",
              active_status: "Y",
              action_type: "I",
              action_date: new Date(),
              action_ip_address: sessionDetails.ip_address,
              action_remark: "Employment details saved",
              action_by: sessionDetails.user_id,
              delete_flag: "N",
            };

            return SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              insertObj,
              sessionDetails,
              cback
            );
          }
          // ACADEMIC DETAILS UPDATE (NEW)
          else if (payload.academic_details && Array.isArray(payload.academic_details)) {
            async.eachSeries(
              payload.academic_details,
              function (academicDetail, cb) {
                let updateObj = {
                  table_name: "a_entrance_app_acad_detail",
                  a_entrance_app_acad_detail_id: academicDetail.a_entrance_app_acad_detail_id || null,
                  reg_no: payload.reg_no,
                  couns_acad_exam_name_id: academicDetail.couns_acad_exam_name_id,
                  counseling_board_univ_id: academicDetail.counseling_board_univ_id,
                  passing_year: academicDetail.passing_year,
                  roll_no: academicDetail.roll_no,
                  obtained_marks: academicDetail.obtained_marks,
                  total_marks: academicDetail.total_marks,
                  ogpa_percent: academicDetail.ogpa_percent,
                  subject_id: academicDetail.subject_id,
                  degree_id: academicDetail.degree_id,
                  remarks: academicDetail.remarks,
                  active_status: "Y",
                  action_type: academicDetail.a_entrance_app_acad_detail_id ? "U" : "I",
                  action_date: new Date(),
                  action_ip_address: sessionDetails.ip_address,
                  action_remark: "Academic details updated",
                  action_by: sessionDetails.user_id,
                  delete_flag: "N",
                };

                SHARED_SERVICE.validateAndUpdateInTable(
                  dbkey,
                  request,
                  updateObj,
                  sessionDetails,
                  function (err, res) {
                    if (err) return cb(err);
                    return cb();
                  }
                );
              },
              function (err) {
                return cback(err);
              }
            );
          }
          // EMPLOYMENT DETAILS UPDATE (NEW)
          else if (payload.employment_details && Array.isArray(payload.employment_details)) {
            async.eachSeries(
              payload.employment_details,
              function (empDetail, cb) {
                let updateObj = {
                  table_name: "a_entrance_app_emp_details",
                  cons_appli_emp_details_id: empDetail.cons_appli_emp_details_id || null,
                  reg_no: payload.reg_no,
                  dept_name: empDetail.dept_name,
                  post_name: empDetail.post_name,
                  date_of_joining: empDetail.date_of_joining,
                  date_of_leaving: empDetail.date_of_leaving,
                  reason_of_leaving: empDetail.reason_of_leaving,
                  active_status: "Y",
                  action_type: empDetail.cons_appli_emp_details_id ? "U" : "I",
                  action_date: new Date(),
                  action_ip_address: sessionDetails.ip_address,
                  action_remark: "Employment details updated",
                  action_by: sessionDetails.user_id,
                  delete_flag: "N",
                };

                SHARED_SERVICE.validateAndUpdateInTable(
                  dbkey,
                  request,
                  updateObj,
                  sessionDetails,
                  function (err, res) {
                    if (err) return cb(err);
                    return cb();
                  }
                );
              },
              function (err) {
                return cback(err);
              }
            );
          }
          else if
            (payload.preferences && Array.isArray(payload.preferences)) {
            async.eachSeries(
              payload.preferences,
              function (preference, cb) {
                let insertObj = {
                  table_name: "a_entrance_app_exam_center",
                  a_entrance_app_exam_center_id: preference.a_entrance_app_exam_center_id || null,
                  reg_no: payload.reg_no,
                  cet_exam_center_id: preference.cet_exam_center_id,
                  preference_no: preference.preference_no,
                  active_status: "Y",
                  action_type: preference.a_entrance_app_exam_center_id ? "U" : "I",
                  action_date: new Date(), // ✅ ADD THIS - was missing
                  action_ip_address: sessionDetails.ip_address,
                  action_remark: "Preference saved",
                  action_by: sessionDetails.user_id,
                  delete_flag: "N",
                };

                SHARED_SERVICE.validateAndUpdateInTable(
                  dbkey,
                  request,
                  insertObj,
                  sessionDetails,
                  function (err, res) {
                    if (err) return cb(err);
                    return cb();
                  }
                );
              },
              function (err) {
                return cback(err);
              }
            );
          } else {
            return cback(new Error("Unknown payload structure"));
          }
        },
      ],
      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              return callback(err);
            }
          );
        } else {
          let successMessage = "Form data saved successfully";
          if (payload.form_type === "basic_details") {
            successMessage = "Basic details updated successfully";
          } else if (payload.form_type === "contact_details") {
            successMessage = "Contact details updated successfully";
          } else if (payload.form_type === "academic_details") {
            successMessage = "Academic details updated successfully";
          } else if (payload.form_type === "employment_details") {
            successMessage = "Employment details updated successfully";
          } else if (payload.form_type === "preferences") {
            successMessage = "Preferences updated successfully";
          }

          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              return callback(null, {
                ...securityService.SECURITY_ERRORS.SUCCESS,
                message: successMessage,
              });
            }
          );
        }
      }
    );
  },

  getEntranceExamCenter: function (
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

  getmapcollegedegree: function (
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

  getcollegecenter: function (
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

  getcetExamformEmpDetails: function (
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

  getEntranceAppAcadDetail: function (
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

  getVyapamData: function (
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

  //for seat distribution
  getSeatDistributionsaved: function (
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

  getentranceappdetail: function (
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

  // GET VALIDATION RULES
  getCounsValidationRules: function (dbkey, request, params, sessionDetails, callback) {
    const {
      academic_session_code,
      degree_program_type_no,
      category_code,
      entrance_exam_type_code
    } = params;

    let query = `
      SELECT 
        validation_id,
        academic_session_code,
        degree_program_type_no,
        category_code,
        entrance_exam_type_code,
        dob,
        dob_valid_from,
        age_limit,
        min_percent_10th,
        min_percent_12th,
        min_percent_ug,
        min_percent_pg
      FROM counseling_validation_master
      WHERE delete_flag = '0'
        AND academic_session_code = ?
        AND degree_program_type_no = ?
        AND category_code = ?
    `;

    const queryParams = [
      academic_session_code,
      degree_program_type_no,
      category_code
    ];

    // Optional entrance exam filter
    if (entrance_exam_type_code) {
      query += ` AND entrance_exam_type_code = ?`;
      queryParams.push(entrance_exam_type_code);
    }

    query += ` LIMIT 1`;

    DB_SERVICE.executeQueryWithParameters(
      dbkey,
      query,
      queryParams,
      function (err, results) {
        if (err) {
          return callback(err);
        }

        if (!results || results.length === 0) {
          return callback(null, {
            ...securityService.SECURITY_ERRORS.NO_DATA_FOUND,
            message: "No validation rules found for this combination"
          });
        }

        return callback(null, {
          ...securityService.SECURITY_ERRORS.SUCCESS,
          data: results[0]
        });
      }
    );
  },

  //for seat distribution
  postseatdistribution: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    const payload = request.body || params || {};
    let arr = []; // To store PK and category data

    async.series(
      [
        // 1. Start transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) return cback(err);
              tranObj = tranobj;
              tranCallback = trancallback;
              return cback();
            }
          );
        },

        // 2. Insert into main table (one per college+program)
        function (cback) {
          if (
            !payload.seat_distribution_data ||
            !Array.isArray(payload.seat_distribution_data)
          ) {
            return cback(new Error("Invalid seat_distribution_data"));
          }

          async.eachSeries(
            payload.seat_distribution_data,
            function (temp, cb) {
              let insert_obj = {
                table_name: "m_couns_seat_distribution_main",
                academic_session_id: payload.academic_session_id,
                entrance_exam_type_code: payload.entrance_exam_type_code,
                college_id: temp.college_id,
                degree_programme_id: temp.degree_programme_id,
                active_status: "Y",
                action_type: "I",
                action_date: new Date(),
                action_ip_address: sessionDetails.ip_address,
                action_remark: "Seat distribution detail saved",
                action_by: sessionDetails.user_id,
                delete_flag: "N",
              };

              SHARED_SERVICE.validateAndInsertInTable(
                dbkey,
                request,
                insert_obj,
                sessionDetails,
                function (err, res) {
                  if (err) return cb(err);
                  else if (res.data && res.data["insertId"]) {
                    console.log('inserted', res.data["insertId"]);

                    arr.push({
                      Couns_Seat_Distr_No: res.data["insertId"],

                      categories: temp.categories,
                    });
                    return cb();
                  } else {
                    return cb({
                      message:
                        "Failed to insert into m_couns_seat_distribution_main",
                    });
                  }
                }
              );
            },
            function (err) {
              return cback(err);
            }
          );
        },

        // 3. Insert into detail table (categories and subcategories)
        function (cback) {
          async.eachSeries(
            arr,
            function (obj_arr, cb_outer) {
              async.eachSeries(
                obj_arr.categories,
                function (category, cb_middle) {
                  async.eachSeries(
                    category.sub_categories,
                    function (subCat, cb_inner) {
                      let insert_obj = {
                        table_name: "m_couns_seat_distribution_detail",
                        Couns_Seat_Distr_No: obj_arr.Couns_Seat_Distr_No,
                        cast_category_no: category.category_id,
                        cast_class_no: subCat.class_id,
                        no_of_seats: subCat.seat_count,
                        active_status: "Y",
                        action_type: "I",
                        action_date: new Date(),
                        action_ip_address: sessionDetails.ip_address,
                        action_remark: "Seat distribution detail saved",
                        action_by: sessionDetails.user_id,
                        delete_flag: "N",
                      };

                      SHARED_SERVICE.validateAndInsertInTable(
                        dbkey,
                        request,
                        insert_obj,
                        sessionDetails,
                        function (err, res) {
                          if (err) return cb_inner(err);
                          else if (res.data && res.data["insertId"]) {
                            return cb_inner();
                          } else {
                            return cb_inner({
                              message:
                                "Failed to insert into m_couns_seat_distribution_detail",
                            });
                          }
                        }
                      );
                    },
                    function (err) {
                      return cb_middle(err);
                    }
                  );
                },
                function (err) {
                  return cb_outer(err);
                }
              );
            },
            function (err) {
              return cback(err);
            }
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
              return callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              return callback(null, {
                ...securityService.SECURITY_ERRORS.SUCCESS,
                message: "Seat distribution saved successfully",
              });
            }
          );
        }
      }
    );
  },

  //for seat distribution
  updateSeatDistributionold: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    const payload = request.body || params || {};

    if (!payload.Couns_Seat_Distr_No) {
      console.error('Couns_Seat_Distr_No is missing!');
      return callback({
        error: {
          message: "Couns_Seat_Distr_No is required"
        }
      });
    }

    console.log('Starting update for Couns_Seat_Distr_No:', payload.Couns_Seat_Distr_No);
    console.log('Total detail records to update:', payload.seat_distribution_details?.length || 0);

    async.series(
      [
        // 1. Start transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) {
                console.error('Transaction creation failed:', err);
                return cback(err);
              }
              tranObj = tranobj;
              tranCallback = trancallback;
              console.log('Transaction started');
              return cback();
            }
          );
        },

        // 2. Update detail records using Couns_Seat_Distr_Detail_No as primary key
        function (cback) {
          if (!payload.seat_distribution_details || payload.seat_distribution_details.length === 0) {
            console.log('No detail records to update');
            return cback();
          }

          console.log('Processing', payload.seat_distribution_details.length, 'detail updates');

          let updateCount = 0;
          let errorCount = 0;

          async.eachSeries(
            payload.seat_distribution_details,
            function (detail, cb_inner) {
              console.log('Updating Detail_No:', detail.couns_seat_distr_detail_no,
                'Category:', detail.cast_category_no,
                'Class:', detail.cast_class_no,
                'Seats:', detail.no_of_seats);

              if (!detail.couns_seat_distr_detail_no) {
                console.error('Missing couns_seat_distr_detail_no for detail');
                errorCount++;
                return cb_inner(new Error('Missing couns_seat_distr_detail_no'));
              }

              // Put ALL fields in the main object (not in updateObj)
              let update_obj = {
                table_name: "m_couns_seat_distribution_detail",
                // Primary key
                couns_seat_distr_detail_no: detail.couns_seat_distr_detail_no,
                // Fields to update - put them directly in main object
                no_of_seats: detail.No_Of_Seats,
                action_type: "U",
                action_date: new Date(),
                action_ip_address: sessionDetails.ip_address,
                action_by: sessionDetails.user_id,
                tranObj: tranObj
              };

              console.log('UPDATE OBJECT:', {
                table_name: update_obj.table_name,
                couns_seat_distr_detail_no: update_obj.couns_seat_distr_detail_no,
                no_of_seats: update_obj.no_of_seats,
                action_type: update_obj.action_type,
                hasTranObj: !!update_obj.tranObj
              });

              SHARED_SERVICE.validateAndUpdateInTable(
                dbkey,
                request,
                update_obj,
                sessionDetails,
                function (err, res) {
                  if (err) {
                    console.error('Error updating detail record', detail.Couns_Seat_Distr_Detail_No, ':', err.message);
                    errorCount++;
                    return cb_inner(err);
                  } else {
                    updateCount++;
                    console.log('Updated detail record #' + updateCount, '- ID:', detail.Couns_Seat_Distr_Detail_No);
                    return cb_inner();
                  }
                }
              );
            },
            function (err) {
              if (err) {
                console.error('Error processing details. Updated:', updateCount, 'Errors:', errorCount);
              } else {
                console.log('Successfully updated', updateCount, 'detail records');
                if (errorCount > 0) {
                  console.log('Had', errorCount, 'errors during update');
                }
              }
              return cback(err);
            }
          );
        },
      ],
      function (err) {
        if (err) {
          console.error('Rolling back transaction:', err);
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              return callback({
                error: {
                  message: err.message || "Update failed"
                }
              });
            }
          );
        } else {
          console.log('Committing transaction');
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function (commitErr) {
              if (commitErr) {
                console.error('Commit failed:', commitErr);
                return callback({
                  error: {
                    message: commitErr.message || "Commit failed"
                  }
                });
              }
              console.log('Update completed and committed successfully!');
              return callback(null, {
                error: null,
                data: {
                  message: "Seat distribution details updated successfully",
                  records_updated: payload.seat_distribution_details?.length || 0
                }
              });
            }
          );
        }
      }
    );
  },

  //for seat distribution
  updateSeatDistribution: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    const payload = request.body || params || {};

    if (!payload.Couns_Seat_Distr_No) {
      console.error('Couns_Seat_Distr_No is missing!');
      return callback({
        error: {
          message: "Couns_Seat_Distr_No is required"
        }
      });
    }

    console.log('Starting update for Couns_Seat_Distr_No:', payload.Couns_Seat_Distr_No);
    console.log('Total detail records to update:', payload.seat_distribution_details?.length || 0);

    async.series(
      [
        // 1. Start transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) {
                console.error('Transaction creation failed:', err);
                return cback(err);
              }
              tranObj = tranobj;
              tranCallback = trancallback;
              console.log('Transaction started');
              return cback();
            }
          );
        },

        // 2. Update detail records using couns_seat_distr_detail_no as primary key
        function (cback) {
          if (!payload.seat_distribution_details || payload.seat_distribution_details.length === 0) {
            console.log('No detail records to update');
            return cback();
          }

          console.log('Processing', payload.seat_distribution_details.length, 'detail updates');

          let updateCount = 0;
          let errorCount = 0;

          async.eachSeries(
            payload.seat_distribution_details,
            function (detail, cb_inner) {
              console.log('Updating Detail_No:', detail.couns_seat_distr_detail_no,
                'Category:', detail.cast_category_no,
                'Class:', detail.cast_class_no,
                'Seats:', detail.no_of_seats);

              if (!detail.couns_seat_distr_detail_no) {
                console.error('Missing couns_seat_distr_detail_no for detail');
                errorCount++;
                return cb_inner(new Error('Missing couns_seat_distr_detail_no'));
              }

              // ✅ FIXED: Use the correct field names from the payload
              let update_obj = {
                table_name: "m_couns_seat_distribution_detail",
                // Primary key
                couns_seat_distr_detail_no: detail.couns_seat_distr_detail_no,
                // ✅ FIXED: Use the exact field names from your payload
                no_of_seats: detail.no_of_seats, // This matches your payload
                action_type: "U",
                action_date: new Date(),
                action_ip_address: sessionDetails.ip_address,
                action_by: sessionDetails.user_id,
                tranObj: tranObj
              };

              console.log('UPDATE OBJECT:', JSON.stringify({
                table_name: update_obj.table_name,
                couns_seat_distr_detail_no: update_obj.couns_seat_distr_detail_no,
                no_of_seats: update_obj.no_of_seats,
                action_type: update_obj.action_type,
                hasTranObj: !!update_obj.tranObj
              }, null, 2));

              SHARED_SERVICE.validateAndUpdateInTable(
                dbkey,
                request,
                update_obj,
                sessionDetails,
                function (err, res) {
                  if (err) {
                    console.error('Error updating detail record', detail.couns_seat_distr_detail_no, ':', err.message);
                    errorCount++;
                    return cb_inner(err);
                  } else {
                    updateCount++;
                    console.log('✅ Successfully updated detail record #' + updateCount, '- ID:', detail.couns_seat_distr_detail_no);
                    return cb_inner();
                  }
                }
              );
            },
            function (err) {
              if (err) {
                console.error('❌ Error processing details. Updated:', updateCount, 'Errors:', errorCount);
              } else {
                console.log('✅ Successfully updated', updateCount, 'detail records');
                if (errorCount > 0) {
                  console.log('Had', errorCount, 'errors during update');
                }
              }
              return cback(err);
            }
          );
        },
      ],
      function (err) {
        if (err) {
          console.error('❌ Rolling back transaction:', err);
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              return callback({
                error: {
                  message: err.message || "Update failed"
                }
              });
            }
          );
        } else {
          console.log('✅ Committing transaction');
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function (commitErr) {
              if (commitErr) {
                console.error('❌ Commit failed:', commitErr);
                return callback({
                  error: {
                    message: commitErr.message || "Commit failed"
                  }
                });
              }
              console.log('✅ Update completed and committed successfully!');
              return callback(null, {
                error: null,
                data: {
                  message: "Seat distribution details updated successfully",
                  records_updated: payload.seat_distribution_details?.length || 0
                }
              });
            }
          );
        }
      }
    );
  },


  finalizemarks: function (dbkey, request, params, sessionDetails, callback) {
    let tranObj, tranCallback;
    let payload = {};

    if (request.headers['content-type'] && request.headers['content-type'].includes('multipart/form-data')) {
      payload = {
        academic_session_id: request.body.academic_session_id,
        entrance_exam_type_code: request.body.entrance_exam_type_code,
        action_by: request.body.action_by
      };

      if (request.body.marks_data) {
        try {
          payload.marks_data = JSON.parse(request.body.marks_data);
        } catch (parseError) {
          payload.marks_data = [];
        }
      } else {
        payload.marks_data = [];
      }
    } else {
      payload = request.body || params || {};
    }

    const {
      academic_session_id,
      entrance_exam_type_code,
      marks_data = [],
      action_by
    } = payload;

    let successCount = 0;
    let updateCount = 0;
    let errorCount = 0;
    let marksEntrySuccessCount = 0;
    let marksEntryUpdateCount = 0;
    let marksEntrySkipCount = 0;
    const errors = [];
    const updatedRecords = [];
    const marksEntryDebug = []; // Debug info
    let uploadedExcelPath = null;

    async.series([
      // 1. Start transaction
      function (cback) {
        DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
          if (err) return cback(err);
          tranObj = tranobj;
          tranCallback = trancallback;
          return cback();
        });
      },

      // 2. Validate required fields
      function (cback) {
        if (!academic_session_id) return cback(new Error("Academic session ID is required"));
        if (!entrance_exam_type_code) return cback(new Error("Entrance exam type code is required"));
        if (!marks_data || marks_data.length === 0) return cback(new Error("No marks data provided"));
        return cback();
      },

      // 3. Upload SINGLE EXCEL FILE (if provided)
      function (cback) {
        if (!request.files || !request.files.excel_file) return cback();

        const excelFile = request.files.excel_file;
        const folderPath = `cetmarks/${academic_session_id}/${entrance_exam_type_code}`;
        const uploadOptions = {
          file_name: `marks${Date.now()}_${entrance_exam_type_code}`,
          control_name: 'excel_file',
          folder_name: folderPath,
        };

        DOC_UPLOAD_SERVICE.docUploadWithFolder(
          dbkey,
          request,
          uploadOptions,
          sessionDetails,
          function (err, uploadRes) {
            if (err) return cback(err);
            if (uploadRes && uploadRes.file_path) uploadedExcelPath = uploadRes.file_path;
            return cback();
          }
        );
      },

      // 4. Process each record
      function (cback) {
        async.eachSeries(
          marks_data,
          function (row, rowCallback) {
            const roll_no = row.roll_no?.toString().trim();
            if (!roll_no) {
              errorCount++;
              errors.push({ roll_no: "EMPTY", error: "Empty roll number" });
              return rowCallback();
            }

            async.series([
              // 4a. Process a_cet_marks_import table
              function (cb) {
                const checkQuery = `
                                  SELECT cet_marks_import_id 
                                  FROM a_cet_marks_import 
                                  WHERE roll_no = ? 
                                  AND delete_flag = 'N'
                                  LIMIT 1
                              `;

                tranObj.query(checkQuery, [roll_no], function (err, results) {
                  if (err) return cb(err);

                  const existingRecordId = results[0] ? results[0].cet_marks_import_id : null;

                  // Common data for both insert and update
                  const commonData = {
                    academic_session_id: academic_session_id,
                    entrance_exam_type_code: entrance_exam_type_code,
                    appearing_exam: row.Appearing_Exam || row.appearing_exam || "",
                    entrance_exam_type_code_col: row.Entrance_exam_type_code || row.entrance_exam_type_code || entrance_exam_type_code,
                    exam_date: row.Exam_date || row.exam_date || null,
                    roll_no: roll_no,
                    cet_exam_center_id: row.Cet_exam_center_id || row.cet_exam_center_id || null,
                    sessioncode: row.Sessioncode || row.sessioncode || null,
                    subject_code: row.Subject_code || row.subject_code || null,
                    question_set_code: row.Question_set_code || row.question_set_code || null,
                    faculty_id: row.Faculty_id || row.faculty_id || null,
                    maximum_marks: row.maximum_marks || null,
                    total_correct: row.total_correct || null,
                    total_incorrect: row.total_incorrect || null,
                    incorrect_questions: row.incorrect_questions || null,
                    correct_questions: row.correct_questions || null,
                    obtained_marks: row.Obtained_marks || row.obtained_marks || null,
                    supporting_doc_path: uploadedExcelPath,
                    action_ip_address: sessionDetails.ip_address,
                    action_by: action_by || sessionDetails.user_id,
                  };

                  if (existingRecordId) {
                    // UPDATE existing record
                    const updateObj = {
                      table_name: "a_cet_marks_import",
                      cet_marks_import_id: existingRecordId,
                      ...commonData,
                      action_type: "U",
                      action_date: new Date(),
                      action_remark: "CET marks updated via Excel",
                      tranObj: tranObj
                    };

                    SHARED_SERVICE.validateAndUpdateInTable(
                      dbkey,
                      request,
                      updateObj,
                      sessionDetails,
                      function (err) {
                        if (err) {
                          errorCount++;
                          errors.push({ roll_no, error: err.message });
                          return cb();
                        }
                        updateCount++;
                        updatedRecords.push({
                          roll_no: roll_no,
                          cet_marks_import_id: existingRecordId
                        });
                        return cb();
                      }
                    );
                  } else {
                    // INSERT new record
                    const insertObj = {
                      table_name: "a_cet_marks_import",
                      ...commonData,
                      active_status: "Y",
                      action_type: "I",
                      action_date: new Date(),
                      action_remark: "CET marks uploaded via Excel",
                      delete_flag: "N",
                      tranObj: tranObj
                    };

                    SHARED_SERVICE.validateAndInsertInTable(
                      dbkey,
                      request,
                      insertObj,
                      sessionDetails,
                      function (err) {
                        if (err) {
                          errorCount++;
                          errors.push({ roll_no, error: err.message });
                          return cb();
                        }
                        successCount++;
                        return cb();
                      }
                    );
                  }
                });
              },

              // 4b. Process a_cet_marks_entry table (FIXED)
              function (cb) {
                // Extract ALL possible field name variations
                const reg_no = row.reg_no || row.Reg_no || row.RegNo || row.Reg_No ||
                  row.REG_NO || row.registration_no || row.Registration_No || 0;

                const degree_programme_id = row.degree_programme_id || row.Degree_programme_id ||
                  row.DegreeProgrammeId || row.Degree_Programme_Id ||
                  row.programme_id || row.Programme_id || null;

                const subject_id = row.subject_id || row.Subject_id || row.SubjectId ||
                  row.Subject_Id || row.SUBJECT_ID || row.subject_code || null;

                // cet_marks comes from obtained_marks
                const cet_marks = row.Obtained_marks || row.obtained_marks || row.cet_marks ||
                  row.Cet_marks || row.CET_Marks || row.marks || row.Marks || 0;

                // Debug: Log what we found
                marksEntryDebug.push({
                  roll_no: roll_no,
                  reg_no: reg_no,
                  degree_programme_id: degree_programme_id,
                  subject_id: subject_id,
                  cet_marks: cet_marks,
                  raw_row_keys: Object.keys(row)
                });

                // Convert roll_no to integer for the marks entry table
                const roll_no_int = parseInt(roll_no);
                if (isNaN(roll_no_int)) {
                  marksEntrySkipCount++;
                  console.log(`⚠️ Skipping marks entry for roll_no ${roll_no}: Invalid roll number format`);
                  return cb();
                }

                const checkMarksEntryQuery = `
                                  SELECT a_cet_marks_entry_id 
                                  FROM a_cet_marks_entry 
                                  WHERE roll_no = ? 
                                  AND academic_session_id = ?
                                  AND entrance_exam_type_code = ?
                                  AND delete_flag = 0
                                  LIMIT 1
                              `;

                tranObj.query(checkMarksEntryQuery, [roll_no_int, academic_session_id, entrance_exam_type_code], function (err, results) {
                  if (err) {
                    console.error(`❌ Query error for roll_no ${roll_no}:`, err);
                    errors.push({ roll_no, table: 'a_cet_marks_entry', error: 'Query failed: ' + err.message });
                    return cb();
                  }

                  const existingMarksEntryId = results[0] ? results[0].a_cet_marks_entry_id : null;

                  const marksEntryCommonData = {
                    academic_session_id: academic_session_id,
                    entrance_exam_type_code: entrance_exam_type_code,
                    reg_no: parseInt(reg_no) || 0,
                    roll_no: roll_no_int,
                    degree_programme_id: degree_programme_id,
                    subject_id: subject_id,
                    cet_marks: parseFloat(cet_marks) || 0,
                    finalized_yn: 'Y',
                    action_ip_address: sessionDetails.ip_address,
                    action_by: action_by || sessionDetails.user_id,
                    action_date: new Date()
                  };

                  console.log(`📝 Processing marks entry for roll_no ${roll_no}:`, marksEntryCommonData);

                  if (existingMarksEntryId) {
                    // UPDATE existing marks entry
                    const updateMarksObj = {
                      table_name: "a_cet_marks_entry",
                      a_cet_marks_entry_id: existingMarksEntryId,
                      ...marksEntryCommonData,
                      action_type: "U",
                      action_remark: "CET marks entry updated via Excel",
                      tranObj: tranObj
                    };

                    SHARED_SERVICE.validateAndUpdateInTable(
                      dbkey,
                      request,
                      updateMarksObj,
                      sessionDetails,
                      function (err) {
                        if (err) {
                          console.error(`❌ Update failed for roll_no ${roll_no}:`, err);
                          errors.push({ roll_no, table: 'a_cet_marks_entry', error: 'Update failed: ' + err.message });
                          return cb();
                        }
                        marksEntryUpdateCount++;
                        console.log(`✅ Updated marks entry for roll_no ${roll_no}`);
                        return cb();
                      }
                    );
                  } else {
                    // INSERT new marks entry
                    const insertMarksObj = {
                      table_name: "a_cet_marks_entry",
                      ...marksEntryCommonData,
                      active_status: "Y",
                      action_type: "I",
                      action_remark: "CET marks entry uploaded via Excel",
                      delete_flag: 0,
                      tranObj: tranObj
                    };

                    SHARED_SERVICE.validateAndInsertInTable(
                      dbkey,
                      request,
                      insertMarksObj,
                      sessionDetails,
                      function (err) {
                        if (err) {
                          console.error(`❌ Insert failed for roll_no ${roll_no}:`, err);
                          errors.push({ roll_no, table: 'a_cet_marks_entry', error: 'Insert failed: ' + err.message });
                          return cb();
                        }
                        marksEntrySuccessCount++;
                        console.log(`✅ Inserted marks entry for roll_no ${roll_no}`);
                        return cb();
                      }
                    );
                  }
                });
              },
            ], function (err) {
              if (err) {
                errorCount++;
                errors.push({ roll_no, error: err.message });
              }
              return rowCallback();
            });
          },
          function (err) {
            if (err) return cback(err);
            return cback();
          }
        );
      },
    ], function (err) {
      if (err) {
        DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
          const errorResponse = {
            success: false,
            message: err.message || "Failed to process CET marks data",
            insertedCount: 0,
            updatedCount: 0,
            errorCount: errorCount + 1,
            totalProcessed: marks_data.length,
            details: {
              errors: [...errors, { roll_no: "SYSTEM", error: err.message }],
              excelFilePath: uploadedExcelPath,
              marksEntryDebug: marksEntryDebug
            },
          };
          return callback(errorResponse);
        });
      } else {
        DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
          let message = "";
          const totalProcessed = successCount + updateCount;
          const totalMarksEntryProcessed = marksEntrySuccessCount + marksEntryUpdateCount;

          if (totalProcessed === marks_data.length) {
            if (successCount > 0 && updateCount > 0) {
              message = `✓ All ${marks_data.length} records processed successfully! (${successCount} new records inserted, ${updateCount} existing records updated)`;
            } else if (successCount > 0) {
              message = `✓ All ${successCount} new records inserted successfully!`;
            } else {
              message = `✓ All ${updateCount} existing records updated successfully!`;
            }
          } else if (totalProcessed > 0) {
            message = `⚠ Partial success: ${totalProcessed} out of ${marks_data.length} records processed (${successCount} inserted, ${updateCount} updated)`;
            if (errorCount > 0) message += `. ${errorCount} error(s) occurred`;
          } else {
            message = `✗ No records were processed.`;
            if (errorCount > 0) message += ` ${errorCount} error(s) occurred`;
          }

          // Add marks entry statistics with more detail
          if (totalMarksEntryProcessed > 0) {
            message += `\n📊 Marks Entry: ${marksEntrySuccessCount} inserted, ${marksEntryUpdateCount} updated`;
          }
          if (marksEntrySkipCount > 0) {
            message += `\n⚠️ Skipped ${marksEntrySkipCount} marks entries (missing reg_no)`;
          }

          if (uploadedExcelPath) message += `\n📄 Excel file saved: ${uploadedExcelPath}`;

          const responseMessage = {
            ...securityService.SECURITY_ERRORS.SUCCESS,
            success: true,
            message: message,
            insertedCount: successCount,
            updatedCount: updateCount,
            errorCount: errorCount,
            totalProcessed: marks_data.length,
            marksEntryStats: {
              inserted: marksEntrySuccessCount,
              updated: marksEntryUpdateCount,
              skipped: marksEntrySkipCount
            },
            excelFilePath: uploadedExcelPath,
            details: {
              inserted: successCount > 0 ? successCount : undefined,
              updated: updatedRecords.length > 0 ? updatedRecords : undefined,
              errors: errors.length > 0 ? errors : undefined,
              marksEntryDebug: marksEntryDebug.slice(0, 5) // First 5 rows for debugging
            },
          };
          return callback(null, responseMessage);
        });
      }
    });
  },

  //  exam center seat capacity
  postExamCenterSeatingCapacityold: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    const payload = request.body || params || {};
    let mainId; // To store the inserted main table ID

    async.series(
      [
        // 1. Start transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) return cback(err);
              tranObj = tranobj;
              tranCallback = trancallback;
              return cback();
            }
          );
        },

        // 2. Validation
        function (cback) {
          if (!payload.academic_session_id) {
            return cback(new Error("Academic session is required"));
          }
          if (!payload.entrance_exam_type_code) {
            return cback(new Error("Entrance exam type is required"));
          }
          if (!payload.centers || !Array.isArray(payload.centers)) {
            return cback(new Error("Invalid centers data"));
          }
          if (payload.centers.length === 0) {
            return cback(new Error("At least one center is required"));
          }
          return cback();
        },

        // 3. Insert into main table
        function (cback) {
          let insert_obj = {
            table_name: "a_cet_exam_center_main",
            academic_session_id: payload.academic_session_id,
            entrance_exam_type_code: payload.entrance_exam_type_code,
            active_status: "Y",
            action_type: "I",
            action_date: new Date(),
            action_ip_address: sessionDetails.ip_address,
            action_remark: "Exam center seating capacity saved",
            action_by: sessionDetails.user_id,
            delete_flag: "N",
          };

          SHARED_SERVICE.validateAndInsertInTable(
            dbkey,
            request,
            insert_obj,
            sessionDetails,
            function (err, res) {
              if (err) return cback(err);
              if (res.data && res.data["insertId"]) {
                mainId = res.data["insertId"];
                console.log('Main record inserted:', mainId);
                return cback();
              } else {
                return cback({
                  message: "Failed to insert into a_cet_exam_center_main",
                });
              }
            }
          );
        },

        // 4. Insert into detail table (individual center capacities)
        function (cback) {
          async.eachSeries(
            payload.centers,
            function (center, cb) {
              let insert_obj = {
                table_name: "a_cet_exam_center_detail",
                a_cet_exam_center_main_id: mainId,
                cet_exam_center_id: center.cet_exam_center_id,
                seating_capacity: center.seating_capacity,
                active_status: "Y",
                action_type: "I",
                action_date: new Date(),
                action_ip_address: sessionDetails.ip_address,
                action_remark: "Exam center capacity detail saved",
                action_by: sessionDetails.user_id,
                delete_flag: "N",
              };

              SHARED_SERVICE.validateAndInsertInTable(
                dbkey,
                request,
                insert_obj,
                sessionDetails,
                function (err, res) {
                  if (err) return cb(err);
                  if (res.data && res.data["insertId"]) {
                    console.log('Detail record inserted:', res.data["insertId"]);
                    return cb();
                  } else {
                    return cb({
                      message: "Failed to insert into a_cet_exam_center_detail",
                    });
                  }
                }
              );
            },
            function (err) {
              return cback(err);
            }
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
              return callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              return callback(null, {
                success: true,
                status: 'success',
                message: "Exam center seating capacity saved successfully",
                data: {
                  mainId: mainId,
                  centersCount: payload.centers.length
                }
              });
            }
          );
        }
      }
    );
  },

  //  exam center seat capacity
  postExamCenterSeatingCapacity: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    const payload = request.body || params || {};
    let mainId;
    let isUpdate = false;

    async.series(
      [
        // 1. Start transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) return cback(err);
              tranObj = tranobj;
              tranCallback = trancallback;
              return cback();
            }
          );
        },

        // 2. Validation
        function (cback) {
          if (!payload.academic_session_id) {
            return cback(new Error("Academic session is required"));
          }
          if (!payload.entrance_exam_type_code) {
            return cback(new Error("Entrance exam type is required"));
          }
          if (!payload.centers || !Array.isArray(payload.centers)) {
            return cback(new Error("Invalid centers data"));
          }
          if (payload.centers.length === 0) {
            return cback(new Error("At least one center is required"));
          }
          return cback();
        },

        // 3. Check if record already exists for this session and exam type
        function (cback) {
          const checkQuery = `
            SELECT a_cet_exam_center_main_id 
            FROM a_cet_exam_center_main 
            WHERE academic_session_id = ? 
            AND entrance_exam_type_code = ? 
            AND delete_flag = 'N'
            LIMIT 1
          `;

          tranObj.query(checkQuery, [payload.academic_session_id, payload.entrance_exam_type_code], function (err, result) {
            if (err) return cback(err);

            if (result && result.length > 0) {
              // Data present - we'll UPDATE
              mainId = result[0].a_cet_exam_center_main_id;
              isUpdate = true;
              console.log('Data present - will UPDATE existing record:', mainId);
            } else {
              // No data present - we'll INSERT
              mainId = null;
              isUpdate = false;
              console.log('No data present - will INSERT new record');
            }
            return cback();
          });
        },

        // 4. Handle Main Table - INSERT or UPDATE based on data check
        function (cback) {
          if (isUpdate) {
            // DATA PRESENT - Call validateAndUpdateInTable
            // FIX: Include the ID directly in the update object, not in where_condition
            let update_obj = {
              table_name: "a_cet_exam_center_main",
              a_cet_exam_center_main_id: mainId, // Include ID directly here
              academic_session_id: payload.academic_session_id,
              entrance_exam_type_code: payload.entrance_exam_type_code,
              active_status: "Y",
              action_type: "U",
              action_date: new Date(),
              action_ip_address: sessionDetails.ip_address,
              action_remark: "Exam center seating capacity updated",
              action_by: sessionDetails.user_id,
              tranObj: tranObj
            };

            console.log('Calling validateAndUpdateInTable for main record');
            SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              update_obj,
              sessionDetails,
              function (err, res) {
                if (err) {
                  console.error('Error in validateAndUpdateInTable:', err);
                  return cback(err);
                }
                console.log('Main record UPDATED successfully:', mainId);
                return cback();
              }
            );
          } else {
            // NEW DATA - Call validateAndInsertInTable
            let insert_obj = {
              table_name: "a_cet_exam_center_main",
              academic_session_id: payload.academic_session_id,
              entrance_exam_type_code: payload.entrance_exam_type_code,
              active_status: "Y",
              action_type: "I",
              action_date: new Date(),
              action_ip_address: sessionDetails.ip_address,
              action_remark: "Exam center seating capacity saved",
              action_by: sessionDetails.user_id,
              delete_flag: "N",
              tranObj: tranObj
            };

            console.log('Calling validateAndInsertInTable for main record');
            SHARED_SERVICE.validateAndInsertInTable(
              dbkey,
              request,
              insert_obj,
              sessionDetails,
              function (err, res) {
                if (err) {
                  console.error('Error in validateAndInsertInTable:', err);
                  return cback(err);
                }
                if (res.data && res.data["insertId"]) {
                  mainId = res.data["insertId"];
                  console.log('Main record INSERTED successfully:', mainId);
                  return cback();
                } else {
                  return cback({
                    message: "Failed to insert into a_cet_exam_center_main",
                  });
                }
              }
            );
          }
        },

        // 5. Handle Detail Records - UPDATE existing or INSERT new
        function (cback) {
          console.log('Processing detail records for centers:', payload.centers.length);

          async.eachSeries(
            payload.centers,
            function (center, cb) {
              // First check if detail record already exists for this center
              const checkDetailQuery = `
                SELECT a_cet_exam_center_detail_id 
                FROM a_cet_exam_center_detail 
                WHERE a_cet_exam_center_main_id = ? 
                AND cet_exam_center_id = ?
                AND delete_flag = 'N'
                LIMIT 1
              `;

              tranObj.query(checkDetailQuery, [mainId, center.cet_exam_center_id], function (err, detailResult) {
                if (err) return cb(err);

                if (detailResult && detailResult.length > 0) {
                  // Detail record exists - UPDATE it
                  const detailId = detailResult[0].a_cet_exam_center_detail_id;

                  // FIX: Include the detail ID directly in the update object
                  let update_detail_obj = {
                    table_name: "a_cet_exam_center_detail",
                    a_cet_exam_center_detail_id: detailId, // Include ID directly here
                    a_cet_exam_center_main_id: mainId,
                    cet_exam_center_id: center.cet_exam_center_id,
                    seating_capacity: center.seating_capacity,
                    active_status: "Y",
                    action_type: "U",
                    action_date: new Date(),
                    action_ip_address: sessionDetails.ip_address,
                    action_remark: "Exam center capacity updated",
                    action_by: sessionDetails.user_id,
                    tranObj: tranObj
                  };

                  console.log('Calling validateAndUpdateInTable for detail record - center:', center.cet_exam_center_id);
                  SHARED_SERVICE.validateAndUpdateInTable(
                    dbkey,
                    request,
                    update_detail_obj,
                    sessionDetails,
                    function (err, res) {
                      if (err) {
                        console.error('Error updating detail record:', err);
                        return cb(err);
                      }
                      console.log('Detail record UPDATED successfully for center:', center.cet_exam_center_id);
                      return cb();
                    }
                  );
                } else {
                  // No detail record exists - INSERT new
                  let insert_detail_obj = {
                    table_name: "a_cet_exam_center_detail",
                    a_cet_exam_center_main_id: mainId,
                    cet_exam_center_id: center.cet_exam_center_id,
                    seating_capacity: center.seating_capacity,
                    active_status: "Y",
                    action_type: "I",
                    action_date: new Date(),
                    action_ip_address: sessionDetails.ip_address,
                    action_remark: "Exam center capacity detail saved",
                    action_by: sessionDetails.user_id,
                    delete_flag: "N",
                    tranObj: tranObj
                  };

                  console.log('Calling validateAndInsertInTable for detail record - center:', center.cet_exam_center_id);
                  SHARED_SERVICE.validateAndInsertInTable(
                    dbkey,
                    request,
                    insert_detail_obj,
                    sessionDetails,
                    function (err, res) {
                      if (err) {
                        console.error('Error inserting detail record:', err);
                        return cb(err);
                      }
                      if (res.data && res.data["insertId"]) {
                        console.log('Detail record INSERTED successfully:', res.data["insertId"]);
                        return cb();
                      } else {
                        return cb({
                          message: "Failed to insert into a_cet_exam_center_detail",
                        });
                      }
                    }
                  );
                }
              });
            },
            function (err) {
              if (err) {
                console.error('Error in detail records processing:', err);
                return cback(err);
              }
              console.log('All detail records processed successfully');
              return cback();
            }
          );
        },
      ],
      // Final callback
      function (err) {
        if (err) {
          console.error('Transaction failed - rolling back:', err.message);
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              return callback(err);
            }
          );
        } else {
          console.log('Transaction successful - committing');
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              const actionMessage = isUpdate ? 'updated' : 'saved';
              return callback(null, {
                success: true,
                status: 'success',
                message: `Exam center seating capacity ${actionMessage} successfully`,
                data: {
                  mainId: mainId,
                  centersCount: payload.centers.length,
                  action: isUpdate ? 'update' : 'insert'
                }
              });
            }
          );
        }
      }
    );
  },

  //counseling Aplication signup/registration 
  postcounselingSignup: function (dbkey, request, params, sessionDetails, callback) {
      let tranObj, tranCallback;
      const payload = request.body || params || {};

      console.log("=== POST COUNSELING SIGNUP STARTED ===");
      console.log("Raw Request Body:", request.body);
      console.log("Session Details:", sessionDetails);

      // Determine exam type category
      const PAT_PET_EXAM_CODES = [1, 5];
      const examTypeCode = payload.entrance_exam_type_code;
      const isPatPet = PAT_PET_EXAM_CODES.includes(examTypeCode);
      const hasExistingRegNo = payload.reg_no && payload.reg_no !== null && payload.reg_no !== '';

      console.log("=== CRITICAL PARAMS ===");
      console.log("Exam Type Code:", examTypeCode);
      console.log("Is PAT/PET:", isPatPet);
      console.log("Has Existing Reg No:", hasExistingRegNo);
      console.log("Reg No Value:", payload.reg_no);
      console.log("======================");

      // VALIDATION: Check if reg_no is required but missing
      if (isPatPet && !hasExistingRegNo) {
          console.error("VALIDATION ERROR: PAT/PET exam type requires reg_no but it's missing");
          return callback({
              error: {
                  message: "Registration number (reg_no) is required for PAT/PET exam types"
              }
          });
      }

      async.series(
          [
              // 1. Start transaction
              function (cback) {
                  DB_SERVICE.createTransaction(
                      dbkey,
                      function (err, tranobj, trancallback) {
                          if (err) {
                              console.error('Transaction creation failed:', err);
                              return cback(err);
                          }
                          tranObj = tranobj;
                          tranCallback = trancallback;
                          // dbkey.connectionobj = tranObj;
                          console.log('Transaction started');
                          return cback();
                      }
                  );
              },

              // 2. UPDATE or INSERT based on exam type - FOLLOWING EXACT SAME STRUCTURE
              function (cback) {
                  if (isPatPet && hasExistingRegNo) {
                      console.log('🔄 UPDATE FLOW - Updating data for reg_no:', payload.reg_no);

                      // ✅ EXACTLY LIKE updateSeatDistribution - NO database_name
                      let update_obj = {
                          table_name: "a_entrance_app_main",
                          // Primary key - EXACTLY like couns_seat_distr_detail_no in working code
                          reg_no: payload.reg_no,
                          // Fields to update
                          applicant_first_name: payload.applicant_first_name,
                          applicant_middle_name: payload.applicant_middle_name?.trim() || null,
                          applicant_last_name: payload.applicant_last_name?.trim() || null,
                          mobile_no: payload.mobile_no,
                          e_mail: payload.e_mail,
                          security_question: payload.security_question,
                          security_answer: payload.security_answer,
                          login_password: payload.login_password,
                          salutation_id: payload.salutation_id,
                          academic_session_id: payload.academic_session_id,
                          entrance_exam_type_code: payload.entrance_exam_type_code,
                          degree_id: payload.degree_id,
                          dob: payload.dob,
                          gender: payload.gender,
                          domicile: payload.domicile,
                          category: payload.category,
                          pet_roll_no: payload.pet_roll_no,
                          pat_i_subject_marks: payload.pat_i_subject_marks,
                          pat_ii_subject_marks: payload.pat_ii_subject_marks,
                          pat_iii_subject_marks: payload.pat_iii_subject_marks,
                          // Action fields - EXACTLY like working code
                          action_type: "U",
                          action_date: new Date(),
                          action_ip_address: sessionDetails.ip_address,
                          action_remark: "Counseling SignUp Updated (PAT/PET)",
                          action_by: sessionDetails.user_id,
                          tranObj: tranObj
                      };

                      console.log('UPDATE OBJECT:', JSON.stringify({
                          table_name: update_obj.table_name,
                          //reg_no: update_obj.reg_no,
                          applicant_first_name: update_obj.applicant_first_name,
                          mobile_no: update_obj.mobile_no,
                          e_mail: update_obj.e_mail,
                          entrance_exam_type_code: update_obj.entrance_exam_type_code,
                          degree_id: update_obj.degree_id,
                          hasTranObj: !!update_obj.tranObj
                      }, null, 2));

                      SHARED_SERVICE.validateAndUpdateInTable(
                          dbkey,
                          request,
                          update_obj,
                          sessionDetails,
                          function (err, res) {
                              if (err) {
                                  console.error('❌ Error updating record for reg_no', payload.reg_no, ':', err.message);
                                  return cback(err);
                              } else {
                                  console.log('✅ Successfully updated record for reg_no:', payload.reg_no);
                                  payload._updatedRecord = update_obj;
                                  return cback();
                              }
                          }
                      );
                  } else {
                      // INSERT new record (12th percentage or Management)
                      console.log("INSERT flow for new registration");

                      // ✅ EXACTLY LIKE updateSeatDistribution structure
                      let insert_obj = {
                          table_name: "a_entrance_app_main",
                          applicant_first_name: payload.applicant_first_name,
                          applicant_middle_name: payload.applicant_middle_name?.trim() || null,
                          applicant_last_name: payload.applicant_last_name?.trim() || null,
                          mobile_no: payload.mobile_no,
                          e_mail: payload.e_mail,
                          security_question: payload.security_question,
                          security_answer: payload.security_answer,
                          login_password: payload.login_password,
                          salutation_id: payload.salutation_id,
                          academic_session_id: payload.academic_session_id,
                          entrance_exam_type_code: payload.entrance_exam_type_code,
                          degree_id: payload.degree_id,
                          dob: payload.dob,
                          gender: payload.gender,
                          domicile: payload.domicile,
                          category: payload.category,
                          action_type: "C",
                          action_date: new Date(),
                          action_ip_address: sessionDetails.ip_address,
                          action_remark: "Counseling SignUp Created",
                          action_by: sessionDetails.user_id,
                          delete_flag: "N",
                          active_status: "Y",
                          tranObj: tranObj
                      };

                      // Add pet_roll_no only if provided (for 12th percentage)
                      if (payload.pet_roll_no) {
                          insert_obj.pet_roll_no = payload.pet_roll_no;
                      }

                      console.log('INSERT OBJECT:', JSON.stringify({
                          table_name: insert_obj.table_name,
                          applicant_first_name: insert_obj.applicant_first_name,
                          mobile_no: insert_obj.mobile_no,
                          e_mail: insert_obj.e_mail,
                          entrance_exam_type_code: insert_obj.entrance_exam_type_code,
                          degree_id: insert_obj.degree_id,
                          hasTranObj: !!insert_obj.tranObj
                      }, null, 2));

                      SHARED_SERVICE.validateAndInsertInTable(
                          dbkey,
                          request,
                          insert_obj,
                          sessionDetails,
                          function (err, res) {
                              if (err) {
                                  console.error('❌ Insert Error:', err.message);
                                  return cback(err);
                              }
                              else if (res.data && res.data.insertId) {
                                  // Capture the newly generated registration ID
                                  payload.reg_no = res.data.insertId;

                                  // Save full record in payload
                                  payload._insertedRecord = {
                                      ...insert_obj,
                                      insertId: res.data.insertId,
                                      reg_no: res.data.insertId,
                                      login_password: payload.login_password
                                  };

                                  console.log('✅ Successfully inserted new record with reg_no:', payload.reg_no);
                                  return cback();
                              } else {
                                  console.error('❌ Unexpected insert response:', res);
                                  return cback({
                                      message: "Something went wrong inserting into a_entrance_app_main",
                                  });
                              }
                          }
                      );
                  }
              },
          ],
          
            function (err) {
          if (err) {
            DB_SERVICE.rollbackPartialTransaction(
              tranObj,
              tranCallback,
              function () {
                return callback(err);
              }
            );
          } else {
            // DB_SERVICE.commitPartialTransaction(
            //   tranObj,
            //   tranCallback,
            //   function () {
            //     return callback(null, {
            //       ...securityService.SECURITY_ERRORS.SUCCESS,
            //       message: `SignUp saved successfully. Your Registration ID is ${params.reg_no}`,
            //       // registration_id: params.reg_no, //  send separately too
            //       // inserted: params._insertedRecord || {},
            //     });
            //   }
            // );
            DB_SERVICE.commitPartialTransaction(
              tranObj,
              tranCallback,
              function () {
                // Remove circular references before sending response
                if (payload._insertedRecord) delete payload._insertedRecord.tranObj;
                if (payload._updatedRecord) delete payload._updatedRecord.tranObj;

                return callback(null, {
                  ...securityService.SECURITY_ERRORS.SUCCESS,
                  message: `SignUp saved successfully. Your Registration ID is ${payload.reg_no}`,
                  registration_id: payload.reg_no,
                  inserted: payload._insertedRecord || {},
                });
              }
            ); 
          }
        }
      );
  },

};
module.exports = cetService;
