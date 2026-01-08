var DB_SERVICE = global.DB_SERVICE;
var securityService = global.COMMON_SECURITY_SERVICE;
const DOC_UPLOAD_SERVICE = global.DOC_UPLOAD_SERVICE;
const SHARED_SERVICE = global.SHARED_SERVICE;
var async = require("async");
const { log } = require("handlebars");
let studentProfileService = require("./studentProfileService.js");
let format = require("date-format");
// ^ for payment section
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { func } = require("joi");

let course = {
  //////////////////Course Allotment///////////////////
  saveCourseAllotment: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    async.series(
      [
        // Step 1: Create Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback(err);
            }
          );
        },

        // Step 2: Insert into course_allotment_main
        function (cback1) {
          params.table_name = "course_allotment_main";
          SHARED_SERVICE.validateAndInsertInTable(
            dbkey,
            request,
            params,
            sessionDetails,
            function (err, res) {
              if (err) return cback1(err);
              else if (res.data && res.data["insertId"]) {
                params.allotment_main_id = res.data["insertId"]; // Primary key captured
                return cback1();
              } else {
                return cback1({
                  message:
                    "Something went wrong inserting into course_allotment_main",
                });
              }
            }
          );
        },

        // Step 3: Insert into course_allotment_detail
        function (cback2) {
          async.eachSeries(
            params.courserows,
            function (courseRow, cb) {
              let insert_obj = {
                table_name: "course_allotment_detail",
                allotment_main_id: params.allotment_main_id, // FK from main table
                course_id: courseRow.course_id,
                course_type_id: courseRow.course_type_id,
                cou_allot_type_id: courseRow.cou_allot_type_id,
                course_module_id: courseRow.course_module_id,
                course_module_batch_group_id:
                  courseRow.course_module_batch_group_id,

                // created_user_id: sessionDetails['user_id'],
                // created_ip_address: sessionDetails['ip_address']
              };

              SHARED_SERVICE.validateAndInsertInTable(
                dbkey,
                request,
                insert_obj,
                sessionDetails,
                function (err, res) {
                  if (err) return cb(err);
                  else if (res.data && res.data["insertId"]) {
                    courseRow.allotment_detail_id = res.data["insertId"]; // Capture PK for teacher mapping
                    return cb();
                  } else {
                    return cb({
                      message:
                        "Something went wrong inserting into course_allotment_detail",
                    });
                  }
                }
              );
            },
            function (err) {
              return cback2(err);
            }
          );
        },

        // Step 4: Insert into course_allotment_teacher_main
        function (cback3) {
          async.eachSeries(
            params.courserows,
            function (courseRow, cb1) {
              async.eachSeries(
                courseRow.teacherRows,
                function (teacherRow, cb2) {
                  let insert_obj = {
                    table_name: "course_allotment_teacher_main",
                    allotment_detail_id: courseRow.allotment_detail_id, // FK from course_allotment_detail
                    emp_id: teacherRow.emp_id,
                    // created_user_id: sessionDetails['user_id'],
                    // created_ip_address: sessionDetails['ip_address']
                  };
                  SHARED_SERVICE.validateAndInsertInTable(
                    dbkey,
                    request,
                    insert_obj,
                    sessionDetails,
                    function (err, res) {
                      if (err) return cb2(err);
                      else if (res.data && res.data["affectedRows"])
                        return cb2();
                      else
                        return cb2({
                          message:
                            "Something went wrong inserting into course_allotment_teacher_main"
                              .res.data,
                        });
                    }
                  );
                },
                function (err) {
                  return cb1(err);
                }
              );
            },
            function (err) {
              return cback3(err);
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
                message: "Course Allotment saved successfully",
              });
            }
          );
        }
      }
    );
  },

  // save student course
  saveStudentCourse: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    let successMessage = ""; // To store dynamic message (Registered vs Deleted)

    async.series(
      [
        // ---------------------------------------------------------
        // Step 1: Create Transaction
        // ---------------------------------------------------------
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback(err);
            }
          );
        },

        // ---------------------------------------------------------
        // Step 2: Check ID -> Insert OR Delete (Update Flag)
        // ---------------------------------------------------------
        function (cback1) {
          params.action_ip_address = sessionDetails.ip_address;
          params.action_by = sessionDetails.user_id;
          params.table_name = "a_student_registration_and_marks";

          // === LOGIC BRANCHING ===
          if (params.student_registration_and_marks_id) {
            // -----------------------------------
            // CASE A: ID Exists -> PERFORM DELETE (Soft Update)
            // -----------------------------------
            params.delete_flag = "Y";
            params.active_status = "N";
            params.action_type = "D"; // 'D' for Delete action

            SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              params,
              sessionDetails,
              function (err, res) {
                if (err) return cback1(err);

                // Check if rows were actually affected
                if (res && res.length > 0) {
                  successMessage = "Course Deleted successfully";
                  return cback1();
                } else {
                  // Sometimes update returns success but 0 rows if ID not found
                  return cback1({
                    message: "Record not found or already deleted.",
                  });
                }
              }
            );
          } else {
            // -----------------------------------
            // CASE B: ID Missing -> PERFORM INSERT
            // -----------------------------------
            params.delete_flag = "N"; // Ensure it's active
            params.active_status = "Y";
            params.action_type = "C"; // 'C' for Create action

            SHARED_SERVICE.validateAndInsertInTable(
              dbkey,
              request,
              params,
              sessionDetails,
              function (err, res) {
                if (err) return cback1(err);
                else if (res.data && res.data["insertId"]) {
                  params.allotment_main_id = res.data["insertId"];
                  successMessage = "Course Registered successfully";
                  return cback1();
                } else {
                  return cback1({
                    message:
                      "Failed to insert record into a_student_registration_and_marks",
                  });
                }
              }
            );
          }
        },
      ],
      // ---------------------------------------------------------
      // Final Callback: Commit or Rollback
      // ---------------------------------------------------------
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
                message: successMessage || "Operation successful",
              });
            }
          );
        }
      }
    );
  },
  saveAcademicStatus: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    let successMessage = "";

    async.series(
      [
        // STEP 1: Begin Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback(err);
            }
          );
        },

        // STEP 2: Duplicate Check
        // (SKIP if we are deleting/updating an existing record)
        function (cback) {
          if (params.registration_id) return cback(); // <--- Skip check on Delete

          sessionDetails.query_id = 413;
          let checkParams = {
            ue_id: params.ue_id,
            academic_session_id: params.academic_session_id,
            semester_id: params.semester_id,
            degree_programme_id: params.degree_programme_id,
            course_year_id: params.course_year_id,
            exam_type_id: params.exam_type_id,
          };

          DB_SERVICE.getQueryDataFromId(
            dbkey,
            request,
            checkParams,
            sessionDetails,
            (err, res) => {
              if (err) return cback(err);
              if (res && res.length > 0) {
                return cback({
                  message:
                    "Student is already registered for this academic session/semester.",
                });
              }
              return cback();
            }
          );
        },

        // STEP 3: Insert OR Delete/Update in a_student_registration_main
        function (cback) {
          params.table_name = "a_student_registration_main";
          params.action_ip_address = sessionDetails.ip_address;
          params.action_by = sessionDetails.user_id;
          params.action_date = new Date();

          // === LOGIC BRANCHING ===
          if (params.registration_id) {
            // -----------------------------------
            // CASE A: ID Exists -> PERFORM DELETE (Soft Update)
            // -----------------------------------
            params.id = params.registration_id; // Required for Update
            params.action_type = "D";
            params.active_status = "N";
            params.delete_flag = "Y";

            SHARED_SERVICE.validateAndUpdateInTable(
              dbkey,
              request,
              params,
              sessionDetails,
              function (err, res) {
                if (err) return cback(err);
                successMessage = "Registration deleted successfully";
                return cback();
              }
            );
          } else {
            // -----------------------------------
            // CASE B: ID Missing -> PERFORM INSERT
            // -----------------------------------
            params.action_type = "C"; // Create
            params.active_status = "Y";
            params.delete_flag = "N";
            params.is_finalize_yn = "N";

            SHARED_SERVICE.validateAndInsertInTable(
              dbkey,
              request,
              params,
              sessionDetails,
              function (err, res) {
                if (err) return cback(err);

                if (res.data && res.data.insertId) {
                  params.new_registration_id = res.data.insertId;
                  successMessage = "Academic Status Registered successfully";
                  return cback();
                } else {
                  return cback({
                    message: "Failed to insert record into registration main",
                  });
                }
              }
            );
          }
        },

        // STEP 4: Update Student Master (The 'Current' status)
        // STEP 4: Update Student Master (Raw Query in Backend)
        function (cback) {
          // 1. Skip Logic: If deleting OR if "Update Current" flag is unchecked
          if (params.registration_id || params.current_update_YN !== "Y") {
            return cback();
          }

          // 2. Write the Query directly
          // Note: We use 'CASE' to handle the logic for Supplementary exams (Exam Type 2)
          let updateQuery = `
                UPDATE a_student_master 
                SET 
                    course_year_id = ?, 
                    academic_session_id = ?, 
                    semester_id = ?, 
                    stu_study_status_id = ?, 
                    stu_acad_status_id = CASE 
                                            WHEN ? = 2 THEN stu_acad_status_id 
                                            ELSE ? 
                                         END,
                    action_by = ?,
                    action_ip_address = ?,
                    action_type = 'U',
                    action_date = NOW()
                WHERE 
                    ue_id = ? 
                    AND degree_programme_id = ? 
                    AND active_status = 'Y'
            `;

          // 3. Prepare Parameters Array (Must match the order of '?' above)
          let queryParams = [
            params.course_year_id, // 1. course_year_id
            params.academic_session_id, // 2. academic_session_id
            params.semester_id, // 3. semester_id
            params.stu_study_status_id, // 4. stu_study_status_id

            params.exam_type_id, // 5. check for CASE (Exam Type)
            params.stu_acad_status_id, // 6. new stu_acad_status_id (ELSE value)

            sessionDetails.user_id, // 7. action_by
            sessionDetails.ip_address, // 8. action_ip_address

            params.ue_id, // 9. WHERE ue_id
            params.degree_programme_id, // 10. WHERE degree_programme_id
          ];

          // 4. Execute using executeQueryWithParameters
          DB_SERVICE.executeQueryWithParameters(
            dbkey,
            updateQuery,
            queryParams,
            function (err, res) {
              if (err) return cback(err);

              // Optional: Log if no rows were updated (e.g., ID mismatch)
              if (res && res.data && res.data.affectedRows === 0) {
                console.log(
                  "Master Update Skipped: No matching active student master record found."
                );
              } else {
                successMessage =
                  "Academic Status Registered and Master updated successfully";
              }

              return cback();
            }
          );
        },
      ],

      // FINAL CALLBACK
      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, () =>
            callback(err)
          );
        } else {
          DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, () => {
            return callback(null, {
              ...securityService.SECURITY_ERRORS.SUCCESS,
              message: successMessage || "Operation successful",
              registration_id: params.new_registration_id,
            });
          });
        }
      }
    );
  },
  unfinalizeStudentCourse: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    async.series(
      [
        // ----------------------------------------------------
        // STEP 1: Begin Transaction
        // ----------------------------------------------------
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback(err);
            }
          );
        },

        // ----------------------------------------------------
        // STEP 2: Validation - Check if Admit Card Exists
        // ----------------------------------------------------
        function (cback) {
          // Validation: Ensure required params exist
          if (!params.registration_id || !params.ue_id) {
            return cback({ message: "Missing Registration ID or UE ID" });
          }

          sessionDetails.query_id = 410;
          // Use dynamic params from the request
          let queryParams = {
            registration_id: params.registration_id,
            ue_id: params.ue_id,
          };

          DB_SERVICE.getQueryDataFromId(
            dbkey,
            request,
            queryParams,
            sessionDetails,
            (err, res) => {
              if (err) return cback(err);

              // Logic: If result > 0, Admit Card exists -> BLOCK ACTION
              if (res && res.length > 0) {
                return cback({
                  message:
                    "Admit Card already generated. Cannot Unfinalize student.",
                });
              }

              // If result is empty, proceed to next step
              return cback();
            }
          );
        },

        // ----------------------------------------------------
        // STEP 3: Update Registration Table
        // ----------------------------------------------------
        function (cback) {
          // Prepare update parameters
          let updateParams = {
            table_name: "a_student_registration_main",
            registration_id: params.registration_id, // Primary Key condition for Update

            // Fields to update
            is_finalize_yn: "N",
            unfinalize_remark: params.unfinalize_remark,

            // Audit Fields
            action_ip_address: sessionDetails.ip_address,
            action_by: sessionDetails.user_id,
            action_date: new Date(),
            action_type: "U", // 'U' for Update
          };

          SHARED_SERVICE.validateAndUpdateInTable(
            dbkey,
            request,
            updateParams,
            sessionDetails,
            function (err, res) {
              if (err) return cback(err);

              // Optional: Check if row was actually updated
              // if (res.affectedRows === 0) return cback({message: "Record not found"});

              return cback();
            }
          );
        },
      ],

      // ----------------------------------------------------
      // FINAL CALLBACK
      // ----------------------------------------------------
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
                message: "Student Unfinalized Successfully",
              });
            }
          );
        }
      }
    );
  },
  /////////////////Save Course Allotment Multiple//////
  saveCourseAllotmentForMltiClg: function (
    dbkey,
    request,
    finaldata,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    const result = []; // To store the mapped output

    async.series(
      [
        // Step 1: Create Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback(err);
            }
          );
        },

        // Step 2: Process each college
        function (cback) {
          async.eachSeries(
            finaldata.colgdata,
            function (college, collegeCb) {
              const collegeAllotment = {
                ...finaldata.acaddata,
                college_id: college.college_id,
                table_name: "course_allotment_main",
              };

              let allotmentMainId;
              let courseDetails = [];

              async.series(
                [
                  // Insert main allotment record
                  function (seriesCb) {
                    SHARED_SERVICE.validateAndInsertInTable(
                      dbkey,
                      request,
                      collegeAllotment,
                      sessionDetails,
                      function (err, res) {
                        if (err) return seriesCb(err);
                        allotmentMainId = res.data.insertId;
                        seriesCb();
                      }
                    );
                  },

                  // Process courses
                  function (seriesCb) {
                    async.eachSeries(
                      finaldata.acaddata.courserows,
                      function (course, courseCb) {
                        const courseDetail = {
                          table_name: "course_allotment_detail",
                          allotment_main_id: allotmentMainId,
                          course_id: course.course_id,
                          course_type_id: course.course_type_id,
                          cou_allot_type_id: course.cou_allot_type_id,
                          course_module_id: course.course_module_id,
                          course_module_batch_group_id:
                            course.course_module_batch_group_id,
                          // Total_Credit: course.Total_Credit
                        };

                        SHARED_SERVICE.validateAndInsertInTable(
                          dbkey,
                          request,
                          courseDetail,
                          sessionDetails,
                          function (err, res) {
                            if (err) return courseCb(err);

                            const allotmentDetailId = res.data.insertId;
                            const mappedCourse = {
                              ...course,
                              allotment_main_id: allotmentMainId,
                              teacherRows: course.teacherRows.map(
                                (teacher) => ({
                                  ...teacher,
                                  allotment_detail_id: allotmentDetailId,
                                })
                              ),
                            };

                            // Store for result
                            if (
                              !result.some(
                                (c) => c.college_id === college.college_id
                              )
                            ) {
                              result.push({
                                ...collegeAllotment,
                                courserows: [],
                              });
                            }
                            result
                              .find((c) => c.college_id === college.college_id)
                              .courserows.push(mappedCourse);

                            // Insert teachers if any
                            if (course.teacherRows.length > 0) {
                              const teachers = course.teacherRows.map(
                                (teacher) => ({
                                  table_name: "course_allotment_teacher_main",
                                  allotment_detail_id: allotmentDetailId,
                                  emp_id: teacher.emp_id,
                                })
                              );

                              const insertObj = {
                                table_name: "course_allotment_teacher_main",
                                data_arr: teachers,
                              };

                              SHARED_SERVICE.validateAndInsertArrInTable(
                                dbkey,
                                request,
                                insertObj,
                                sessionDetails,
                                function (err) {
                                  courseCb(err);
                                }
                              );
                            } else {
                              courseCb();
                            }
                          }
                        );
                      },
                      seriesCb
                    );
                  },
                ],
                collegeCb
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
              callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(null, {
                ...securityService.SECURITY_ERRORS.SUCCESS,
                message: "Allotments created successfully",
                data: result,
              });
            }
          );
        }
      }
    );
  },

  //////////////////Update Alloted Course/////////////
  updateCourseAllotment: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    const payload = params;
    if (!payload || !payload.allotment_detail_id) {
      console.log("Payload structure:", payload);
      return callback({
        message: `Allotment_Detail_ID is required in the request payload`,
      });
    }
    const allotmentDetailId = payload.allotment_detail_id;
    async.series(
      [
        // Create Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback(err);
            }
          );
        },

        // Update course_allotment_detail table
        function (cback1) {
          let updateParams = {
            table_name: "course_allotment_detail",
            allotment_detail_id: payload.allotment_detail_id, // <-- MUST be here
            allotment_main_id: payload.allotment_main_id,
            cou_allot_type_id: payload.cou_allot_type_id,
            course_id: payload.course_id,
            //   Course_Nature: payload.Course_Nature,
            course_type_id: payload.course_type_id,
            // Total_Credit:payload.Total_Credit.split('+').reduce((acc,cur)=>acc+cur,0)
          };
          return SHARED_SERVICE.validateAndUpdateInTable(
            dbkey,
            request,
            updateParams,
            sessionDetails,
            function (err, res) {
              if (err) {
                console.error("Update error:", err);
                return cback1(err);
              } else if (res && res.length > 0) {
                return cback1();
              } else {
                return cback1({
                  message: `No record updated in course_allotment_detail`,
                });
              }
            }
          );
        },
        // Delete existing teacher mappings
        function (cback2) {
          SHARED_SERVICE.insrtAndDltOperation(
            dbkey,
            request,
            {
              delete_table_name: "course_allotment_teacher_main",
              whereObj: { allotment_detail_id: allotmentDetailId },
            },
            sessionDetails,
            function (err, res) {
              if (err) console.error("Delete error:", err); // Debugging
              return cback2(err);
            }
          );
        },
        // Insert new teacher mappings
        function (cback3) {
          if (!payload.teacherRows || payload.teacherRows.length === 0) {
            return cback3();
          }

          let data_arr = payload.teacherRows.map((teacher) => {
            return {
              allotment_detail_id: allotmentDetailId,
              emp_id: teacher.emp_id,
              // Course_Allotment_Teacher_Main_ID: teacher.Course_Allotment_Teacher_Main_ID
            };
          });

          let insert_obj = {
            table_name: "course_allotment_teacher_main",
            data_arr: data_arr,
          };

          console.log("Insert parameters:", insert_obj); // Debugging

          SHARED_SERVICE.validateAndInsertArrInTable(
            dbkey,
            request,
            insert_obj,
            sessionDetails,
            function (err, res) {
              if (err) {
                console.error("Insert error:", err); // Debugging
                return cback3(err);
              } else if (res.data && res.data.affectedRows) {
                return cback3();
              } else {
                return cback3({ message: `Failed to insert teacher mappings` });
              }
            }
          );
        },
      ],
      function (err, res) {
        if (err) {
          console.error("Transaction error:", err); // Debugging
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function (err4) {
              return callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function (err5) {
              return callback(null, {
                ...securityService.SECURITY_ERRORS.SUCCESS,
                message: "Course allotment updated successfully",
              });
            }
          );
        }
      }
    );
  },

  //////////////// Bulk Update //////////////
  updateAllotedCourseAndTeacher: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    async.series(
      [
        // Step 1: Start Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback(err);
            }
          );
        },

        // Step 2: Process each course row
        function (cback1) {
          async.eachSeries(
            params,
            function (courseObj, cb) {
              async.series(
                [
                  // 2.1 Delete teacher rows (only if course existed earlier)
                  function (cb1) {
                    if (!courseObj.allotment_detail_id) return cb1(); // Skip for new course
                    SHARED_SERVICE.insrtAndDltOperation(
                      dbkey,
                      request,
                      {
                        delete_table_name: "course_allotment_teacher_main",
                        whereObj: {
                          allotment_detail_id: courseObj.allotment_detail_id,
                        },
                      },
                      sessionDetails,
                      cb1
                    );
                  },

                  // 2.2 Delete course detail row (only if course existed earlier)
                  function (cb2) {
                    if (!courseObj.allotment_detail_id) return cb2(); // Skip for new course
                    SHARED_SERVICE.insrtAndDltOperation(
                      dbkey,
                      request,
                      {
                        delete_table_name: "course_allotment_detail",
                        whereObj: {
                          allotment_detail_id: courseObj.allotment_detail_id,
                        },
                      },
                      sessionDetails,
                      cb2
                    );
                  },

                  // 2.3 Insert fresh course detail row (always needed)
                  function (cb3) {
                    let insert_obj = {
                      table_name: "course_allotment_detail",
                      allotment_main_id: courseObj.allotment_main_id, // 👈 common parent
                      cou_allot_type_id: courseObj.cou_allot_type_id,
                      course_id: courseObj.course_id,
                      course_type_id: courseObj.course_type_id,
                    };

                    SHARED_SERVICE.validateAndInsertInTable(
                      dbkey,
                      request,
                      insert_obj,
                      sessionDetails,
                      function (err, res) {
                        if (err) return cb3(err);

                        if (res.data && res.data["insertId"]) {
                          // Capture new PK for teacher mapping
                          courseObj.new_allotment_detail_id =
                            res.data["insertId"];
                          return cb3();
                        } else {
                          return cb3({
                            message: `Failed to insert detail row for course_id=${courseObj.course_id}`,
                          });
                        }
                      }
                    );
                  },

                  // 2.4 Insert teacher rows with new FK
                  function (cb4) {
                    if (
                      !courseObj.teacherRows ||
                      courseObj.teacherRows.length === 0
                    ) {
                      return cb4(); // No teacher mapping
                    }

                    let data_arr = courseObj.teacherRows.map((teacher) => ({
                      allotment_detail_id: courseObj.new_allotment_detail_id, // 👈 new FK
                      emp_id: teacher.emp_id,
                    }));

                    let insert_obj = {
                      table_name: "course_allotment_teacher_main",
                      data_arr: data_arr,
                    };

                    SHARED_SERVICE.validateAndInsertArrInTable(
                      dbkey,
                      request,
                      insert_obj,
                      sessionDetails,
                      function (err, res) {
                        if (err) return cb4(err);

                        if (res.data && res.data.affectedRows) return cb4();
                        return cb4({
                          message: `Failed to insert teacher mappings for course_id=${courseObj.course_id}`,
                        });
                      }
                    );
                  },
                ],
                cb
              ); // end series for one courseObj
            },
            cback1
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
                message: "Bulk course allotment rebuilt successfully",
              });
            }
          );
        }
      }
    );
  },

  //////////////// Delete Course Allotment //////////////////
  deleteCourseAllotment: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    SHARED_SERVICE.insrtAndDltOperationTranstion(
      dbkey,
      request,
      {
        delete_table_name: "course_allotment_detail",
        log_table_name: "app_log_course_allotment_detail",
        whereObj: { Allotment_Detail_ID: params.Allotment_Detail_ID },
      },
      sessionDetails,
      function (err, res) {
        if (err) {
          return callback(err);
        } else {
          return callback(null, { message: "deleted successfully." });
        }
      }
    );
  },

  ///////////////////Update Finalize Status////////////////////
  updateFinalizeStatus: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let whereObj = { allotment_main_id: params.allotment_main_id };
    let updateObj = {
      finalize_yn: "Y",
      action_ip_address: sessionDetails.ip_address,
      action_by: sessionDetails.user_id,
      action_type: "U",
    };
    let data = {
      log_table_name: "app_log_course_allotment_main",
      update_table_name: "course_allotment_main",
      whereObj,
      updateObj,
    };
    return SHARED_SERVICE.insertAndUpdtOperationTranstion(
      dbkey,
      request,
      data,
      sessionDetails,
      callback
    );
  },

  ///////////////////Update Finalize Status////////////////////
  updateUnfinalizeStatus: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let whereObj = { allotment_main_id: params.allotment_main_id };
    let updateObj = {
      finalize_yn: "N",
      action_ip_address: sessionDetails.ip_address,
      action_by: sessionDetails.user_id,
      action_type: "U",
    };
    let data = {
      log_table_name: "app_log_course_allotment_main",
      update_table_name: "course_allotment_main",
      whereObj,
      updateObj,
    };
    return SHARED_SERVICE.insertAndUpdtOperationTranstion(
      dbkey,
      request,
      data,
      sessionDetails,
      callback
    );
  },

  ////////////////////////Delete Course Allotment Particular///////////////////
  // deletePartucularCourse: function (dbkey, request, params, sessionDetails, callback) {
  //     if (!params || !params.Allotment_Detail_ID) {
  //         return callback({ message: `Allotment_Detail_ID is required in the request payload` });
  //     }

  //     const allotmentDetailId = params.Allotment_Detail_ID;

  //     async.series([
  //         // Step 1: Delete from child table first
  //         function (cback) {
  //             SHARED_SERVICE.insrtAndDltOperation(
  //                 dbkey,
  //                 request,{delete_table_name:'course_allotment_teacher_main',whereObj: { Allotment_Detail_ID: allotmentDetailId }
  //                 },
  //                 sessionDetails,
  //                 function (err, res) {
  //                     if (err) return cback(err);
  //                     return cback();
  //                 }
  //             );
  //         },

  //         // Step 2: Delete from parent table after child
  //         function (cback) {
  //             SHARED_SERVICE.insrtAndDltOperation(
  //                 dbkey,
  //                 request,
  //                 {
  //                     delete_table_name: 'course_allotment_detail',
  //                     whereObj: { Allotment_Detail_ID: allotmentDetailId }
  //                 },
  //                 sessionDetails,
  //                 function (err, res) {
  //                     if (err) return cback(err);
  //                     return cback();
  //                 }
  //             );
  //         }
  //     ],
  //     function (err) {
  //         if (err) {
  //             return callback(err);
  //         } else {
  //             return callback(null, {
  //                 ...securityService.SECURITY_ERRORS.SUCCESS,
  //                 message: 'Course allotment deleted successfully'
  //             });
  //         }
  //     });
  // },

  // deletePartucularCourse: function (dbkey, request, params, sessionDetails, callback) {
  //     if (!params || !params.Allotment_Detail_ID) {
  //         return callback({ message: `Allotment_Detail_ID is required in the request payload` });
  //     }

  //     const allotmentDetailId = params.Allotment_Detail_ID;

  //     // First delete from child table, then parent table
  //     SHARED_SERVICE.insrtAndDltOperationTranstion(
  //         dbkey,
  //         request,
  //         {
  //             delete_table_name: 'course_allotment_teacher_main',
  //             log_table_name: 'course_allotment_teacher_main_log',
  //             whereObj: { Allotment_Detail_ID: allotmentDetailId }
  //         },
  //         sessionDetails,
  //         function (err1, res1) {
  //             if (err1) {
  //                 return callback(err1);
  //             }

  //             // Now delete from parent table
  //             SHARED_SERVICE.insrtAndDltOperationTranstion(
  //                 dbkey,
  //                 request,
  //                 {
  //                     delete_table_name: 'course_allotment_detail',
  //                     log_table_name: 'course_allotment_detail_log',
  //                     whereObj: { Allotment_Detail_ID: allotmentDetailId }
  //                 },
  //                 sessionDetails,
  //                 function (err2, res2) {
  //                     if (err2) {
  //                         return callback(err2);
  //                     }

  //                     return callback(null, {
  //                         message: 'Course & teacher deleted successfully.'
  //                     });
  //                 }
  //             );
  //         }
  //     );
  // },
  deletePartucularCourse: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    // Validate input
    if (!params || !params.allotment_detail_id) {
      return callback({
        message: `allotment_detail_id is required in the request payload`,
      });
    }
    // const allotmentDetailId = req.query.allotment_detail_id;

    const allotmentDetailId = params.allotment_detail_id;

    async.series(
      [
        // Step 1: Create a single transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) return cback(err);

              tranObj = tranobj;
              tranCallback = trancallback;

              // Wrap the transactional connection into dbkey object
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback();
            }
          );
        },

        // Step 2: Delete from child table (teacher main)
        function (cback) {
          SHARED_SERVICE.insrtAndDltOperation(
            dbkey,
            request,
            {
              delete_table_name: "course_allotment_teacher_main",
              whereObj: { allotment_detail_id: allotmentDetailId },
            },
            sessionDetails,
            function (err) {
              return cback(err); // return null if success, or error if failed
            }
          );
        },

        // Step 3: Delete from parent table (course detail)
        function (cback) {
          SHARED_SERVICE.insrtAndDltOperation(
            dbkey,
            request,
            {
              delete_table_name: "course_allotment_detail",
              whereObj: { allotment_detail_id: allotmentDetailId },
            },
            sessionDetails,
            function (err) {
              return cback(err);
            }
          );
        },
      ],
      function (err) {
        if (err) {
          // ❌ Rollback if any operation failed
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              return callback(err);
            }
          );
        } else {
          // ✅ Commit if all successful
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              return callback(null, {
                ...securityService.SECURITY_ERRORS.SUCCESS,
                message:
                  "Course and associated teacher records deleted successfully .",
              });
            }
          );
        }
      }
    );
  },

  /////////////////////////// Delete Multiple Course Allotment ///////////////////////
  deleteMultipleCourse: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    let allotmentDetailIds = [];

    // Validate input
    if (!params || !params.allotment_main_id) {
      return callback({
        message: `allotment_main_id is required in the request payload`,
      });
    }

    const allotmentMainId = params.allotment_main_id;

    async.series(
      [
        // Step 1: Create a single transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) return cback(err);

              tranObj = tranobj;
              tranCallback = trancallback;

              // Wrap the transactional connection into dbkey object
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback();
            }
          );
        },

        // Step 2: Get allotment_detail_ids from detail table based on allotment_main_id
        function (cback) {
          const selectQuery =
            "SELECT allotment_detail_id FROM course_allotment_detail WHERE allotment_main_id = ?";

          dbkey.connectionobj.query(
            selectQuery,
            [allotmentMainId],
            function (err, rows) {
              if (err) {
                console.error("Error fetching allotment_detail_ids:", err);
                return cback(err);
              }

              console.log("Raw query result:", rows);

              if (rows && Array.isArray(rows) && rows.length > 0) {
                allotmentDetailIds = rows.map((row) => row.allotment_detail_id);
                console.log("Found allotment_detail_ids:", allotmentDetailIds);
              } else {
                console.log(
                  "No records found for allotment_main_id:",
                  allotmentMainId
                );
                allotmentDetailIds = [];
              }

              return cback();
            }
          );
        },

        // Step 3: Delete from third table (teacher main) using allotment_detail_ids
        function (cback) {
          if (allotmentDetailIds.length === 0) {
            console.log(
              "No allotment_detail_ids found, skipping teacher main deletion"
            );
            return cback();
          }

          // Delete each record one by one since $in is not supported
          async.each(
            allotmentDetailIds,
            function (detailId, callback) {
              SHARED_SERVICE.insrtAndDltOperation(
                dbkey,
                request,
                {
                  delete_table_name: "course_allotment_teacher_main",
                  whereObj: { allotment_detail_id: detailId },
                },
                sessionDetails,
                function (err) {
                  if (err) {
                    console.error(
                      `Error deleting teacher record for detail_id ${detailId}:`,
                      err
                    );
                  }
                  return callback(err);
                }
              );
            },
            function (err) {
              if (err) {
                console.error("Error deleting from teacher main table:", err);
              } else {
                console.log(
                  `Successfully deleted ${allotmentDetailIds.length} teacher records`
                );
              }
              return cback(err);
            }
          );
        },

        // Step 4: Delete from detail table using allotment_main_id
        function (cback) {
          SHARED_SERVICE.insrtAndDltOperation(
            dbkey,
            request,
            {
              delete_table_name: "course_allotment_detail",
              whereObj: { allotment_main_id: allotmentMainId },
            },
            sessionDetails,
            function (err) {
              if (err) {
                console.error("Error deleting from detail table:", err);
              }
              return cback(err);
            }
          );
        },

        // Step 5: Delete from main table using allotment_main_id
        function (cback) {
          SHARED_SERVICE.insrtAndDltOperation(
            dbkey,
            request,
            {
              delete_table_name: "course_allotment_main",
              whereObj: { allotment_main_id: allotmentMainId },
            },
            sessionDetails,
            function (err) {
              if (err) {
                console.error("Error deleting from main table:", err);
              }
              return cback(err);
            }
          );
        },
      ],
      function (err) {
        if (err) {
          // ❌ Rollback if any operation failed
          console.error("Transaction failed, rolling back:", err);
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              return callback(err);
            }
          );
        } else {
          // ✅ Commit if all successful
          console.log("All operations successful, committing transaction");
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              return callback(null, {
                ...securityService.SECURITY_ERRORS.SUCCESS,
                message: `Course and associated records deleted successfully. Deleted ${allotmentDetailIds.length} detail records and related teacher records.`,
              });
            }
          );
        }
      }
    );
  },

  ////////////////////////// Save Techer Section Allotment ///////////////////////
  saveTeacherSectionAllotment: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    try {
      if (!params.teachers || !Array.isArray(params.teachers)) {
        return callback({ status: 400, message: "teachers required" });
      }

      let async = require("async");
      async.eachSeries(
        params.teachers,
        (row, cb) => {
          let whereObj = {
            allotment_detail_id: row.allotment_detail_id,
            emp_id: row.emp_id,
          };

          let updateObj = {
            section_id: row.section_id,
            action_ip_address: sessionDetails.ip_address,
            action_by: sessionDetails.user_id,
            action_type: "U",
          };

          let data = {
            log_table_name: "app_log_course_allotment_teacher_main",
            update_table_name: "course_allotment_teacher_main",
            whereObj,
            updateObj,
          };

          SHARED_SERVICE.insertAndUpdtOperationTranstion(
            dbkey,
            request,
            data,
            sessionDetails,
            (err, res) => {
              if (err) return cb(err);
              cb();
            }
          );
        },
        (err) => {
          if (err) {
            return callback({
              status: 500,
              message: "Error updating teacher section allotment",
              error: err,
            });
          }
          return callback(null, {
            status: 200,
            message: "Teacher section allotment updated successfully",
          });
        }
      );
    } catch (e) {
      return callback({ status: 500, message: "Server error", error: e });
    }
  },

  ///////////////////////// Get Student List for Section Allotment ///////////////////////
  getStudentList: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(
      dbkey,
      request,
      params,
      sessionDetails,
      callback
    );
  },

  ////////////////////////// Save Student Section Allotment ///////////////////////
  //     saveStudentSectionAllotment: function (dbkey, request, params, sessionDetails, callback) {
  //     try {
  //         if (!params.sectionrows || !Array.isArray(params.sectionrows)) {
  //             return callback({ status: 400, message: "sectionrows required" });
  //         }

  //         // Prepare data rows
  //         let preparedRows = params.sectionrows.map(row => ({
  //             academic_session_id: params.academic_session_id,
  //             degree_programme_type_id: params.degree_programme_type_id,
  //             semester_id: params.semester_id,
  //             college_id: params.college_id,
  //             ue_id: row.ue_id,
  //             section_id: row.section_id || null
  //         }));

  //         // Process each row sequentially
  //         let async = require("async");
  //         async.eachSeries(preparedRows, (row, cb) => {
  //             let whereObj = {
  //                 academic_session_id: row.academic_session_id,
  //                 // degree_programme_type_id: row.degree_programme_type_id,
  //                 semester_id: row.semester_id,
  //                 college_id: row.college_id,
  //                 ue_id: row.ue_id
  //             };

  //             let updateObj = {
  //                 section_id: row.section_id,
  //                 action_ip_address: sessionDetails.ip_address,
  //                 action_by: sessionDetails.user_id,
  //                 action_type: "U"
  //             };

  //             let data = {
  //                 log_table_name: "app_log_a_student_registration_main_copy",
  //                 update_table_name: "a_student_registration_main_copy",
  //                 whereObj,
  //                 updateObj
  //             };

  //             SHARED_SERVICE.insertAndUpdtOperationTranstion(dbkey, request, data, sessionDetails, (err, res) => {
  //                 if (err) return cb(err);
  //                 cb();
  //             });
  //         }, (err) => {
  //             if (err) {
  //                 return callback({ status: 500, message: "Error updating student sections", error: err });
  //             }
  //             return callback(null, { status: 200, message: "Student section allotment updated successfully" });
  //         });

  //     } catch (e) {
  //         return callback({ status: 500, message: "Server error", error: e });
  //     }
  // },

  saveStudentSectionAllotment: function (
    dbkey,
    request,
    payload,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    async.series(
      [
        // Step 1: Create Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback(err);
            }
          );
        },

        // Step 2: Bulk Insert into section_allotment
        function (cback) {
          if (!Array.isArray(payload) || payload.length === 0) {
            return cback(new Error("No section allotment data provided"));
          }

          const insertObj = {
            table_name: "section_allotment",
            data_arr: payload.map((item) => ({
              allotment_detail_id: item.allotment_detail_id,
              degree_programme_id: item.degree_programme_id,
              section_id: item.section_id,
            })),
          };

          SHARED_SERVICE.validateAndInsertArrInTable(
            dbkey,
            request,
            insertObj,
            sessionDetails,
            function (err) {
              cback(err);
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
              callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(null, {
                ...securityService.SECURITY_ERRORS.SUCCESS,
                message: "Section allotments saved successfully",
              });
            }
          );
        }
      }
    );
  },

  ///////////////////////// Update Course Allotment by college id ///////////////////////
  updateAllotedCourseAndTeacherByCollegeId: function (
    dbkey,
    request,
    requestBody,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    let allotmentMainDetailList = [];

    async.series(
      [
        // Step 1: Start Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback(err);
            }
          );
        },

        // Step 2: Fetch all allotment_main_id + allotment_detail_id for this college_id
        function (cback) {
          const selectQuery = `
                SELECT cm.college_id, cm.allotment_main_id, cd.allotment_detail_id
FROM course_allotment_main cm  
INNER JOIN course_allotment_detail cd 
    ON cd.allotment_main_id = cm.allotment_main_id
WHERE cm.academic_session_id = 24 
    AND degree_programme_id = 1 
    AND semester_id = 1 
    AND dean_committee_id = 5 
    AND course_year_id = 2 
    AND cm.delete_flag = 'N'
    AND cm.college_id IN (
        SELECT m.college_id 
        FROM map_mas_child_clg_coursealot m
        WHERE m.m_college_id = ? AND m.delete_flag = 'N' AND   m.active_status = 'Y'
    );
            `;
          dbkey.connectionobj.query(
            selectQuery,
            [requestBody.college_id],
            function (err, rows) {
              if (err) return cback(err);
              allotmentMainDetailList = rows || [];
              return cback();
            }
          );
        },

        // Step 3: For each allotment_main_id, delete old details & insert full course list
        function (cback1) {
          async.eachSeries(
            allotmentMainDetailList,
            function (mainDetailObj, cbInner) {
              async.series(
                [
                  // 3.1 Delete old rows for this allotment_main_id
                  function (cb2) {
                    SHARED_SERVICE.insrtAndDltOperation(
                      dbkey,
                      request,
                      {
                        delete_table_name: "course_allotment_detail",
                        whereObj: {
                          allotment_main_id: mainDetailObj.allotment_main_id,
                        },
                      },
                      sessionDetails,
                      cb2
                    );
                  },

                  // 3.2 Bulk insert course list for this allotment_main_id
                  function (cb3) {
                    if (
                      !requestBody.courseList ||
                      requestBody.courseList.length === 0
                    )
                      return cb3();

                    let insertArr = requestBody.courseList.map((courseObj) => ({
                      table_name: "course_allotment_detail",
                      allotment_main_id: mainDetailObj.allotment_main_id, // assign same main_id
                      cou_allot_type_id: courseObj.cou_allot_type_id,
                      course_id: courseObj.course_id,
                      course_type_id: courseObj.course_type_id,
                      m_college_id: requestBody.college_id,
                    }));

                    SHARED_SERVICE.validateAndInsertArrInTable(
                      dbkey,
                      request,
                      insertArr,
                      sessionDetails,
                      cb3
                    );
                  },
                ],
                cbInner
              ); // series for each mainDetailObj
            },
            cback1
          ); // loop over allotmentMainDetailList
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
                message:
                  "Course allotment rebuilt successfully (Cartesian insert)",
              });
            }
          );
        }
      }
    );
  },

  // // updateAllotedCourseAndTeacherByCollegeId: function (dbkey, request, requestBody, sessionDetails, callback) {
  // //     let tranObj, tranCallback;
  // //     let allotmentMainDetailList = [];

  // //     async.series([

  // //         // Step 1: Start Transaction
  // //         function (cback) {
  // //             DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
  // //                 tranObj = tranobj;
  // //                 tranCallback = trancallback;
  // //                 dbkey = { dbkey: dbkey, connectionobj: tranObj };
  // //                 return cback(err);
  // //             });
  // //         },

  // //         // Step 2: Fetch all allotment_main_id for this college_id
  // //     function (cback) {
  // //     const selectQuery = `
  // //         SELECT DISTINCT cm.allotment_main_id
  // //         FROM course_allotment_main cm
  // //         INNER JOIN course_allotment_detail cd
  // //             ON cd.allotment_main_id = cm.allotment_main_id
  // //         WHERE cm.academic_session_id = ?
  // //           AND degree_programme_id = ?
  // //           AND semester_id = ?
  // //           AND dean_committee_id = ?
  // //           AND course_year_id = ?
  // //           AND cm.delete_flag = 'N'
  // //           AND cm.college_id IN (
  // //               SELECT m.college_id
  // //               FROM map_mas_child_clg_coursealot m
  // //               WHERE m.m_college_id = ?
  // //                 AND m.delete_flag = 'N'
  // //                 AND m.active_status = 'Y'
  // //           );
  // //     `;

  // //     const params = [
  // //         requestBody.academic_session_id,   // 1
  // //         requestBody.degree_programme_id,   // 2
  // //         requestBody.semester_id,           // 3
  // //         requestBody.dean_committee_id,     // 4
  // //         requestBody.course_year_id,        // 5
  // //         requestBody.college_id             // 6 (for m.m_college_id)
  // //     ];

  // //     dbkey.connectionobj.query(selectQuery, params, function (err, rows) {
  // //         if (err) return cback(err);
  // //         allotmentMainDetailList = rows || [];
  // //         return cback();
  // //     });
  // // },

  // //         // Step 3: Delete phase → remove all details for each main_id
  // //         function (cback) {
  // //             async.eachSeries(allotmentMainDetailList, function (mainObj, cbDel) {
  // //                 SHARED_SERVICE.insrtAndDltOperation(
  // //                     dbkey, request,
  // //                     {
  // //                         delete_table_name: 'course_allotment_detail',
  // //                         whereObj: { allotment_main_id: mainObj.allotment_main_id }
  // //                     },
  // //                     sessionDetails, cbDel
  // //                 );
  // //             }, cback);
  // //         },

  // //         // Step 4: Insert phase → reinsert courseList for each main_id
  // //         function (cback) {
  // //             async.eachSeries(allotmentMainDetailList, function (mainObj, cbIns) {
  // //                 if (!requestBody.courseList || requestBody.courseList.length === 0) return cbIns();

  // //                 let insertArr = requestBody.courseList.map(courseObj => ({
  // //                     table_name: 'course_allotment_detail',
  // //                     allotment_main_id: mainObj.allotment_main_id,
  // //                     cou_allot_type_id: courseObj.cou_allot_type_id,
  // //                     course_id: courseObj.course_id,
  // //                     course_type_id: courseObj.course_type_id,
  // //                     m_college_id: requestBody.college_id
  // //                 }));

  // //                 SHARED_SERVICE.validateAndInsertArrInTable(
  // //                     dbkey, request, insertArr, sessionDetails, cbIns
  // //                 );
  // //             }, cback);
  // //         }

  // //     ], function (err) {
  // //         if (err) {
  // //             DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
  // //                 return callback(err);
  // //             });
  // //         } else {
  // //             DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
  // //                 return callback(null, {
  // //                     ...securityService.SECURITY_ERRORS.SUCCESS,
  // //                     message: 'Course allotment rebuilt successfully (delete all, then insert)'
  // //                 });
  // //             });
  // //         }
  // //     });
  // // },
  // updateAllotedCourseAndTeacherByCollegeId: function (dbkey, request, requestBody, sessionDetails, callback) {
  //     console.log("Starting updateAllotedCourseAndTeacherByCollegeId with requestBody:", requestBody);

  //     let tranObj, tranCallback;
  //     let allotmentMainDetailList = [];

  //     async.series([

  //         // Step 1: Start Transaction
  //         function (cback) {
  //             DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
  //                 tranObj = tranobj;
  //                 tranCallback = trancallback;
  //                 dbkey = { dbkey: dbkey, connectionobj: tranObj };
  //                 return cback(err);
  //             });
  //         },

  //         // Step 2: Fetch all allotment_main_id + allotment_detail_id for this college_id
  //        function (cback) {
  //     const selectQuery = `
  //                       SELECT DISTINCT cm.allotment_main_id
  // FROM course_allotment_main cm
  // INNER JOIN course_allotment_detail cd
  //     ON cd.allotment_main_id = cm.allotment_main_id
  // WHERE cm.academic_session_id = ?
  //   AND degree_programme_id = ?
  //   AND semester_id = ?
  //   AND dean_committee_id = ?
  //   AND course_year_id = ?
  //   AND cm.delete_flag = 'N'
  //   AND cm.college_id IN (
  //       SELECT m.college_id
  //       FROM map_mas_child_clg_coursealot m
  //       WHERE m.m_college_id = ?
  //         AND m.delete_flag = 'N'
  //         AND m.active_status = 'Y'
  //   );
  //     `;

  //     const params = [
  //         requestBody.academic_session_id,   // 1
  //         requestBody.degree_programme_id,   // 2
  //         requestBody.semester_id,           // 3
  //         requestBody.dean_committee_id,     // 4
  //         requestBody.course_year_id,        // 5
  //         requestBody.college_id             // 6 (for m.m_college_id)
  //     ];
  // console.log("Executing selectQuery with params:", params);
  //     dbkey.connectionobj.query(selectQuery, params, function (err, rows) {
  //         if (err) return cback(err);
  //         allotmentMainDetailList = rows || [];
  //         console.log("Fetched allotmentMainDetailList:", allotmentMainDetailList);

  //         return cback();
  //     });
  // },

  //         // Step 3: Bulk Delete All Old Rows and Insert New Ones
  //         function (cback1) {
  //     // const allDetailIds = allotmentMainDetailList.map(obj => obj.allotment_main_id);

  //     const insertArr = [];

  //     // Prepare the insert array
  //     allotmentMainDetailList.forEach(mainDetailObj => {
  //         if (requestBody.courseList && requestBody.courseList.length > 0) {
  //             requestBody.courseList.forEach(courseObj => {
  //                 insertArr.push({
  //                     allotment_main_id: mainDetailObj.allotment_main_id,
  //                     cou_allot_type_id: courseObj.cou_allot_type_id,
  //                     course_id: courseObj.course_id,
  //                     course_module_batch_group_id:courseObj.course_module_batch_group_id,
  //                     course_module_id:courseObj.course_module_id,
  //                     course_type_id: courseObj.course_type_id,
  //                 });
  //             });
  //         }
  //     });

  //     async.series([

  //         // Step 3.1: Bulk delete old allotment_detail rows
  //         function (cb2) {

  //             async.eachSeries(allotmentMainDetailList, function (detailId, innerCb) {
  //                 SHARED_SERVICE.insrtAndDltOperation(
  //                     dbkey, request,
  //                     {
  //                         delete_table_name: 'course_allotment_detail',
  //                         whereObj: { allotment_main_id : detailId.allotment_main_id }
  //                     },
  //                     sessionDetails, innerCb
  //                 );
  //             }, cb2);
  //         },

  //         // Step 3.2: Bulk insert full course list
  //         function (cb3) {
  //             if (insertArr.length === 0) return cb3();
  //             console.log("Prepared insertArr:", insertArr);
  //             const insertObj = {
  //                 table_name:'course_allotment_detail',
  //                 data_arr:insertArr
  //             }

  //             SHARED_SERVICE.validateAndInsertArrInTable(
  //                 dbkey, request, insertObj, sessionDetails, cb3
  //             );
  //         }

  //     ], cback1);
  // }

  //     ], function (err) {
  //         if (err) {
  //             DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
  //                 return callback(err);
  //             });
  //         } else {
  //             DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
  //                 return callback(null, {
  //                     ...securityService.SECURITY_ERRORS.SUCCESS,
  //                     message: 'Course allotment rebuilt successfully (Bulk Delete + Insert)'
  //                 });
  //             });
  //         }
  //     });
  // },

  //* ======================================= Course Registration ======================================

  // ^ Api for saving course registerd by student
  saveStudentCourseRegistration: function (
    dbkey,
    request,
    payload,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    const result = [];

    async.series(
      [
        // Step 1: Create Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback(err);
            }
          );
        },

        // Step 2: Process each course individually
        /*   function(cback) {
            const savedCourses = [];
            
            async.eachSeries(payload.courses, function(course, courseCb) {
                // Prepare data for each course in exact format
                const courseData = {
                    table_name: 'a_student_registration_and_marks_copy',
                    course_id: course.course_id,
                    course_nature_id:course.course_nature_id,
                    course_type_id: course.course_type_id,
                    academic_session_id: payload.academic_session_id,
                    registration_id: payload.registration_id,
                    semester_id: payload.semester_id,
                    course_year_id: payload.year_id,
                   
                };
 
                SHARED_SERVICE.validateAndInsertInTable(
                    dbkey, request, courseData, sessionDetails,
                    function(err, res) {
                        if (err) return courseCb(err);
                        
                        savedCourses.push({
                            course_id: courseData.course_id,
                            course_type_id: courseData.course_type_id,
                            course_nature_id: courseData.course_nature_id,
                            academic_session_id: courseData.academic_session_id,
                            registration_id: courseData.registration_id,
                            semester_id: courseData.semester_id,
                            course_year_id: courseData.course_year_id,
                            id: res.data.insertId
                        });
                        
                        courseCb();
                    }
                );
            }, function(err) {
                if (err) return cback(err);
                
                // Prepare final result
                const registrationResult = {
                    message: 'Data saved successfully',
                    total_courses: savedCourses.length,
                    prepared_data: savedCourses
                };
 
                result.push(registrationResult);
                cback();
            });
        },  */

        // Step 2: Process each course individually
        function (cback) {
          course.insertCoursesRegistrationInTransaction(
            dbkey,
            request,
            payload,
            sessionDetails,
            result,
            cback
          );
        },

        // Step 3: for Updating Registration Status
        function (cback) {
          const params = {
            log_table_name: "app_log_a_student_registration_main",
            update_table_name: "a_student_registration_main",
            whereObj: { registration_id: payload.registration_id },
            updateObj: {
              registration_status_id: 1,
              action_ip_address: sessionDetails.ip_address,
              action_by: sessionDetails.user_id,
              action_type: "U",
            },
          };

          SHARED_SERVICE.insrtAndUpdtOperation(
            dbkey,
            request,
            params,
            sessionDetails,
            function (err, res) {
              if (err) return cback(err);
              // Optionally: you can log res (found rows) if needed
              return cback();
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
              callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(null, {
                ...securityService.SECURITY_ERRORS.SUCCESS,
                message: "Student course registration completed successfully",
                data: result,
              });
            }
          );
        }
      }
    );
  },

  // ^ Api for updating courseRegistration
  updateStudentCourseRegistration: function (
    dbkey,
    request,
    payload,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    const result = [];
    async.series(
      [
        // Step 1: Create Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback(err);
            }
          );
        },

        // Step 2: Delete existing data for registration_id
        function (cback2) {
          SHARED_SERVICE.insrtAndDltOperation(
            dbkey,
            request,
            {
              delete_table_name: "a_student_registration_and_marks",
              whereObj: { registration_id: payload.registration_id },
            },
            sessionDetails,
            function (err, res) {
              return cback2(err);
            }
          );
        },

        // Step 3: Insert courses after deletion

        function (cback3) {
          course.insertCoursesRegistrationInTransaction(
            dbkey,
            request,
            payload,
            sessionDetails,
            result,
            cback3
          );
        },
      ],
      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(null, {
                ...securityService.SECURITY_ERRORS.SUCCESS,
                message: "Student course registration updated successfully",
              });
            }
          );
        }
      }
    );
  },

  // * common for inserting course registration (save and update)
  insertCoursesRegistrationInTransaction: function (
    dbkey,
    request,
    payload,
    sessionDetails,
    result,
    callback
  ) {
    const savedCourses = [];
    async.eachSeries(
      payload.courses,
      function (course, courseCb) {
        const courseData = {
          table_name: "a_student_registration_and_marks",
          course_id: course.course_id,
          course_nature_id: course.course_nature_id,
          course_type_id: course.course_type_id,
          academic_session_id: course.academic_session_id,
          registration_id: payload.registration_id,
          semester_id: payload.semester_id,
          course_year_id: course.course_year_id,
          course_registration_type_id: course.course_registration_type_id,
        };

        SHARED_SERVICE.validateAndInsertInTable(
          dbkey,
          request,
          courseData,
          sessionDetails,
          function (err, res) {
            if (err) return courseCb(err);

            savedCourses.push({
              course_id: courseData.course_id,
              course_type_id: courseData.course_type_id,
              course_nature_id: courseData.course_nature_id,
              academic_session_id: courseData.academic_session_id,
              registration_id: courseData.registration_id,
              semester_id: courseData.semester_id,
              course_year_id: courseData.course_year_id,
              id: res.data.insertId,
            });

            courseCb();
          }
        );
      },
      function (err) {
        if (err) return callback(err);

        const registrationResult = {
          message: "Data saved successfully",
          total_courses: savedCourses.length,
          prepared_data: savedCourses,
        };

        console.log("result type:", typeof result);
        console.log("isArray:", Array.isArray(result));
        console.log("result value:", result);
        result.push(registrationResult);
        callback();
      }
    );
  },

  // ^ Api for getting  list of student who have paid fees
  getPaidAndUnpaidStudents: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback, transData;

    async.series(
      [
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback(err);
            }
          );
        },

        // Step 2: check condition for automatic registration
        function (cback2) {
          const d = Number(params.degree_programme_id);
          const y = Number(params.course_year_id);
          const s = Number(params.semester_id);
          const dean = Number(params.dean_committee_id);

          if (params.is_new_std === false && params.status === "paid") {
            const checkQuery = `
      SELECT 
        CASE 
          WHEN ? NOT IN (
            SELECT DISTINCT Degree_Programme_Id
            FROM M_Edu.MAP_DegT_Deg
            WHERE Degree_Programme_Type_Id = 1
          )
          THEN 1 ELSE 0
        END AS not_allowed
    `;
            dbkey.connectionobj.query(checkQuery, [d], function (err, rows) {
              if (err) return cback2(err);
              const isNotAllowed = rows[0].not_allowed === 1;
              if (
                isNotAllowed ||
                (d == 1 && y == 5 && s == 2) ||
                // (d == 13 && y == 5 && s == 2 && dean == 4) ||
                (d == 2 && y == 5 && s == 1 && dean == 4)
                // (d == 13 && y == 5 && s == 1 && dean == 5)
              ) {
                return cback2({
                  message: "Automatic Registration is not allowed.",
                });
              }
              return cback2();
            });
          } else if (params.status !== "paid") {
            if (
              ![1, 2, 3].includes(d) ||
              (d == 1 && y == 5 && s == 2) ||
              (d == 2 && y == 5 && s == 1 && dean == 4)
            ) {
              return cback2({
                message: "Automatic Registration is not allowed. tushil",
              });
            }
            return cback2();
          } else {
            return cback2();
          }
        },

        // Step 3: get student list
        function (cback3) {
          // getStudentList 173
          sessionDetails.query_id = 173;
          DB_SERVICE.getQueryDataFromId(
            dbkey,
            request,
            params,
            sessionDetails,
            (err, res) => {
              if (err) return callback(err);
              stdData = res || [];
              return cback3();
            }
          );
        },
      ],

      // Final callback
      function (err, results) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(null, stdData);
            }
          );
        }
      }
    );
  },

  // ^ Api for getting Faculty List For Registered Courses
  getFacultyListRegisteredCourses: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    DB_SERVICE.getQueryDataFromId(
      dbkey,
      request,
      params,
      sessionDetails,
      function (err, res) {
        if (err) return callback(err);
        if (!Array.isArray(res) || res.length === 0) return callback(null, []);

        // Step 1️⃣ Group and merge by course_id
        const mergedCourses = Object.values(
          res.reduce((acc, curr) => {
            const { course_id, course_name, credit, emp_name, college_name } =
              curr;
            const cleanEmp = emp_name.replace(/^\s*\d+\s*:\s*/, "").trim();

            if (!acc[course_id]) {
              acc[course_id] = {
                course_id,
                college_name: params.college_name_e,
                course_name,
                credit,
                degree_programm: params.degree_programme_name_e,
                emp_name: cleanEmp,
              };
            } else if (!acc[course_id].emp_name.includes(cleanEmp)) {
              acc[course_id].emp_name += `, ${cleanEmp}`;
            }

            return acc;
          }, {})
        );

        const formattedCourses = mergedCourses.map((course) => {
          const { credit } = course;
          if (!credit.includes("+")) return course; // skip if no '+'

          const parts = credit.split("+").map(Number);
          const total = parts.reduce((a, b) => a + b, 0);
          return { ...course, credit: `${total}(${credit})` };
        });

        // Step 3️⃣ Send final result
        return callback(null, formattedCourses);
      }
    );
  },

  //* ======================================= Exam-Services ======================================

  // ^ Api for apply-form (clearence,grace,reval)
  saveStudentExamServices: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    async.series(
      [
        // Step 1: Create Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback(err);
            }
          );
        },

        // Step 2: Insert into revaluation_main
        function (cback1) {
          params.table_name = "revaluation_main";
          SHARED_SERVICE.validateAndInsertInTable(
            dbkey,
            request,
            params,
            sessionDetails,
            function (err, res) {
              if (err) return cback1(err);
              else if (res.data && res.data["insertId"]) {
                params.revaluation_main_id = res.data["insertId"]; // Primary key captured
                return cback1();
              } else {
                return cback1({
                  message:
                    "Something went wrong inserting into revaluation_main",
                });
              }
            }
          );
        },

        // Step 3: Process each course individually in details
        function (cback2) {
          course.insertCourseExamServiceInTransaction(
            dbkey,
            request,
            params.courses,
            params.revaluation_main_id,
            sessionDetails,
            cback2
          );
        },
      ],

      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(null, {
                ...securityService.SECURITY_ERRORS.SUCCESS,
                message: "Student successfully applied for courses",
              });
            }
          );
        }
      }
    );
  },

  // ^ Api for updating apply-form (clearence,grace,reval)
  updateStudentExamServices: function (
    dbkey,
    request,
    parmas,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;
    async.series(
      [
        // Step 1: Create Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback(err);
            }
          );
        },

        // Step 2: Delete existing data for revaluation_main_id
        function (cback2) {
          SHARED_SERVICE.insrtAndDltOperation(
            dbkey,
            request,
            {
              delete_table_name: "revaluation_detail",
              whereObj: { revaluation_main_id: parmas.revaluation_main_id },
            },
            sessionDetails,
            function (err, res) {
              return cback2(err);
            }
          );
        },

        // Step 3: Insert courses after deletion
        function (cback3) {
          course.insertCourseExamServiceInTransaction(
            dbkey,
            request,
            parmas.courses,
            parmas.revaluation_main_id,
            sessionDetails,
            cback3
          );
        },
      ],
      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(null, {
                ...securityService.SECURITY_ERRORS.SUCCESS,
                message: "Student course registration updated successfully",
              });
            }
          );
        }
      }
    );
  },

  // * common for inserting exam service (save and update)
  insertCourseExamServiceInTransaction: function (
    dbkey,
    request,
    parmas,
    revaluation_main_id,
    sessionDetails,
    callback
  ) {
    async.eachSeries(
      parmas,
      function (course, courseCb) {
        const courseData = {
          table_name: "revaluation_detail   ",
          revaluation_main_id: revaluation_main_id,
          course_id: course.course_id,
        };
        SHARED_SERVICE.validateAndInsertInTable(
          dbkey,
          request,
          courseData,
          sessionDetails,
          function (err, res) {
            if (err) return courseCb(err);
            courseCb();
          }
        );
      },
      function (err) {
        if (err) return callback(err);
        callback(null, {
          message: "Data saved successfully",
        });
      }
    );
  },

  // ^ Api for apply-form (transfer,migration,duplicate-transfer,duplicate-migration)
  applyForTransferMigrationCert: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    async.series(
      [
        // Step 1: Create Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback(err);
            }
          );
        },

        // Step 2: Insert into a_transfer_certificate_apply or a_migration_apply
        function (cback1) {
          if (params.paymentType === "transfer") {
            params.table_name = "a_transfer_certificate_apply";
          } else if (params.paymentType === "migration") {
            params.table_name = "a_migration_apply";
          }

          SHARED_SERVICE.validateAndInsertInTable(
            dbkey,
            request,
            params,
            sessionDetails,
            function (err, res) {
              if (err) return cback1(err);
              else if (res.data && res.data["insertId"]) {
                params.transfer_certificate_apply_id = res.data["insertId"];
                return cback1();
              } else {
                return cback1({
                  message:
                    "Something went wrong inserting into revaluation_main",
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
              callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(null, {
                ...securityService.SECURITY_ERRORS.SUCCESS,
                message:
                  "Student successfully applied for transfer certificate",
              });
            }
          );
        }
      }
    );
  },

  //* ======================================= Payment Section ======================================

  // ^ Api for saving payment-details (user information)
  saveStudenTransactionPayeeDetail: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback, transData;

    async.series(
      [
        // Step 1: Create Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback(err);
            }
          );
        },

        // Step 2: transaction_payee_detail
        function (cback1) {
          let selectQuery = `
       SELECT transaction_payee_detail_id, payee_id 
       FROM transaction_payee_detail 
       WHERE registration_id = ?
     `;

          let queryParams = [params?.payee_detail?.registration_id];

          if (params?.payee_detail?.reval_id) {
            selectQuery += " AND reval_id = ?";
            queryParams.push(params?.payee_detail?.reval_id);
          } else if (params?.payee_detail?.purpose_id) {
            selectQuery += " AND purpose_id = ?";
            queryParams.push(params?.payee_detail?.purpose_id);
          }

          dbkey.connectionobj.query(
            selectQuery,
            queryParams,
            function (selectErr, rows) {
              if (selectErr) {
                console.error("❌ Error executing select query:", selectErr);
                return cback1(selectErr);
              }

              // * If record already exists → skip insert (go to next step)
              if (rows && rows.length > 0) {
                console.log(
                  "⚠️ Record already exists → Skipping Step 2: transaction_payee_detail"
                );
                params.skip2 = true;
                params.payee_sub_detail.transaction_payee_detail_id =
                  rows[0].transaction_payee_detail_id;
                return cback1();
              }

              // * Otherwise
              console.log(
                "🆕 No record found → Inserting into transaction_payee_detail"
              );

              params.payee_detail.table_name = "transaction_payee_detail";
              SHARED_SERVICE.validateAndInsertInTable(
                dbkey,
                request,
                params.payee_detail,
                sessionDetails,
                function (err, res) {
                  if (err) return cback1(err);

                  if (res.data && res.data["insertId"]) {
                    const insertedId = res.data["insertId"];
                    // console.log("✅ Inserted new payee_detail record with ID:", insertedId);
                    params.payee_sub_detail.transaction_payee_detail_id =
                      insertedId;
                    return cback1();
                  } else {
                    return cback1({
                      message:
                        "❌ Something went wrong inserting into transaction_payee_detail",
                    });
                  }
                }
              );
            }
          );
        },

        // Step 3: transaction_payee_sub_detail
        function (cback2) {
          if (params.skip2 === true) {
            // console.log("⚠️ Record already exists → Skipping Step 3: transaction_payee_sub_detail");
            return cback2();
          }
          params.payee_sub_detail.table_name = "transaction_payee_sub_detail";
          SHARED_SERVICE.validateAndInsertInTable(
            dbkey,
            request,
            params.payee_sub_detail,
            sessionDetails,
            function (err, res) {
              if (err) return cback2(err);
              else if (res.data && res.data["insertId"]) {
                return cback2();
              } else {
                return cback2({
                  message:
                    "Something went wrong inserting into transaction_payee_sub_detail",
                });
              }
            }
          );
        },

        // Step 4: get transaction details
        function (cback3) {
          params_for_trans = {
            purpose_id: params.payee_detail.purpose_id,
            faculty_type_code: params.payee_detail.faculty_id,
            faculty_type_code: params.payee_detail.faculty_id,
            college_id: params.payee_detail.college_id,
            college_id: params.payee_detail.college_id,
          };

          // getTransactionDetails 277
          sessionDetails.query_id = 277;
          DB_SERVICE.getQueryDataFromId(
            dbkey,
            request,
            params_for_trans,
            sessionDetails,
            (err, res) => {
              if (err) return callback(err);
              transData = res && res.length ? res[0] : null;
              // console.log("this is response data", res[0]);
              return cback3();
            }
          );
        },

        // Step 5: insert transaction details
        function (cback4) {
          course.insertStudentTransactionDetail(
            dbkey,
            request,
            transData,
            sessionDetails,
            params,
            cback4
          );
        },

        // Step 6: start payment process
        function (cback5) {
          course.initiatePayment(
            dbkey,
            request,
            transData,
            sessionDetails,
            params,
            function (err, res) {
              cback5(err, res); // Pass response upward
            }
          );
        },
      ],
      // Final callback
      function (err, results) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              // 🟢 Find Razorpay response dynamically (instead of hardcoded index)
              const paymentResponse = results?.find(
                (step) => step && step.success && step.payment
              );

              if (paymentResponse && paymentResponse.payment?.order_id) {
                // ✅ Return Razorpay order details to frontend
                callback(null, paymentResponse);
              } else {
                // 🔸 Default success message (if payment not triggered)
                callback(null, {
                  error: null,
                  data: {
                    code: "000",
                    message: "Student successfully applied for courses",
                  },
                });
              }
            }
          );
        }
      }
    );
  },

  // * inserting student transaction details
  insertStudentTransactionDetail: function (
    dbkey,
    request,
    transData,
    sessionDetails,
    params,
    callback
  ) {
    try {
      const paymentGatewayId = transData?.paymentgatewayid || 0;
      let generatedRefNo;

      // ✅ Prepare data for insert
      const transInfoData = {
        table_name: "transaction_info_copy",
        transaction_payee_detail_id:
          params?.payee_sub_detail?.transaction_payee_detail_id,
        ddo_code: transData?.ddo_code,
        merchant_code: transData?.marchent_code,
        counseling_series_master_code:
          params?.payee_detail?.counseling_series_master_code,
        paymentgatewayid: paymentGatewayId,
      };

      // console.log("🧾 Inserting transInfoData:", transInfoData);

      SHARED_SERVICE.validateAndInsertInTable(
        dbkey,
        request,
        transInfoData,
        sessionDetails,
        function (err, res) {
          if (err) return callback(err);

          if (res && res.data && res.data["insertId"]) {
            const insertedId = res.data["insertId"];
            generatedRefNo = course.generateReferenceNo(
              paymentGatewayId,
              insertedId
            );
            params.generatedRefNo = generatedRefNo;
            const updateQuery = `
               UPDATE transaction_info_copy
               SET refferance_no = ?
               WHERE transaction_id = ?
             `;
            dbkey.connectionobj.query(
              updateQuery,
              [generatedRefNo, insertedId],
              function (updateErr, updateRes) {
                if (updateErr) {
                  console.error("❌ Error updating refferance_no:", updateErr);
                  return callback(updateErr);
                }

                // console.log("✅ Reference number updated successfully in DB");
                return callback(null, {
                  message: "Transaction saved and reference number updated.",
                  reference_no: generatedRefNo,
                });
              }
            );
          } else {
            console.error("⚠️ Insert failed, no insertId returned");
            return callback({
              message:
                "Something went wrong inserting into transaction_info_copy",
            });
          }
        }
      );
    } catch (error) {
      console.error("❌ insertStudentTransactionDetail error:", error);
      callback(error);
    }
  },

  // * getting refrence number as per paymentgateway id
  generateReferenceNo(payment_gateway_id, transaction_id) {
    const paddedId = String(transaction_id || 0).padStart(15, "0");
    switch (payment_gateway_id) {
      case 1:
        return "IG" + paddedId.slice(-13);
      case 2:
        return "2" + paddedId.slice(-14);
      case 5:
        return "5" + paddedId.slice(-14);
      default:
        return "TXN" + paddedId.slice(-12);
    }
  },

  // * starting payment
  initiatePayment: async function (
    dbkey,
    request,
    transData,
    sessionDetails,
    params,
    callback
  ) {
    try {
      // 🔑 Razorpay live credentials (move these to .env later)
      // ^ for live
      // const key_id = "rzp_live_ZE2GWaDoHxm1Dx";
      // const key_secret = "lwnNC9UXHdwNdhCwBr0gWBuW";

      // ^ for test
      const key_id = "rzp_test_GFXEsqbgnvjTn9";
      const key_secret = "BWqj7lZLTx3hQ8JcQTV8I7tA";

      // 🧩 Create Razorpay instance
      const razorpay = new Razorpay({ key_id, key_secret });

      // 💰 Step 1: Calculate amount
      const baseAmount = parseFloat(params?.payee_sub_detail?.total);
      const convenienceFee = parseFloat(
        params?.payee_detail?.convenienceFee || 0
      );
      const totalAmount = (baseAmount + convenienceFee) * 100; // in paise
      // const totalAmount = 1 * 100; // in paise

      // 💾 Step 2: Prepare order payload
      const receiptNo = params?.generatedRefNo;
      const orderOptions = {
        amount: Math.round(totalAmount),
        currency: "INR",
        receipt: receiptNo,
        payment_capture: 1,
        notes: {
          payee_name: params?.payee_detail?.payee_name,
          payee_id: params?.payee_detail?.payee_id,
          purpose: params?.payee_detail?.fee_purpose_name,
        },
      };

      // 🧾 Step 3: Create Razorpay order
      const order = await razorpay.orders.create(orderOptions);
      // console.log("🟢 Razorpay Order Created:", order);

      // 📨 Step 4: Prepare response for Angular frontend
      const result = {
        success: true,
        payment: {
          order_id: order.id,
          key: key_id,
          amount: order.amount,
          currency: order.currency,
          name: params?.payee_detail?.payee_name,
          email: params?.payee_detail?.email,
          contact: params?.payee_detail?.mobile,
          purpose: params?.payee_detail?.fee_purpose_name,
          description: params?.payee_detail?.fee_purpose_name,
          receipt: receiptNo,
          payment_gateway_url: "https://checkout.razorpay.com/v1/checkout.js",
        },
      };

      // console.log("✅ Returning payment data to frontend:", result);
      callback(null, result);
    } catch (error) {
      console.error("❌ Razorpay Payment Initiation Error:", error);

      callback(null, {
        success: false,
        message: "Payment initiation failed",
        error: error?.message || error,
      });
    }
  },

  // ^ Api for verify the payment for razorpay
  razorpayPaymentVerify: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    async.series(
      [
        // Step 1️⃣: Start Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) return cback(err);
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj }; // ✅ makes dbkey.connectionobj usable
              return cback();
            }
          );
        },

        // Step 2️⃣: Verify Razorpay Payment Signature + Update DB
        function (cback) {
          const key_id = "rzp_test_GFXEsqbgnvjTn9";
          const key_secret = "BWqj7lZLTx3hQ8JcQTV8I7tA";
          const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            refNo,
          } = params;

          // Step 2.1 — Verify Signature
          const generatedSignature = crypto
            .createHmac("sha256", key_secret)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

          if (generatedSignature !== razorpay_signature) {
            console.warn(
              "⚠️ Invalid Razorpay signature for:",
              razorpay_order_id
            );
            return cback({ message: "Invalid payment signature" });
          }

          // Step 2.2 — Fetch details from Razorpay
          const razorpay = new Razorpay({ key_id, key_secret });
          Promise.all([
            razorpay.orders.fetch(razorpay_order_id),
            razorpay.payments.fetch(razorpay_payment_id),
          ])
            .then(([order, payment]) => {
              // console.log("✅ Razorpay order fetched:", order.id);
              // console.log("✅ Razorpay payment fetched:", payment.id);

              async.series(
                [
                  // Sub-step 1: Get transaction_id from refferance_no
                  function (sub1) {
                    const selectQuery = `
                       SELECT transaction_id,transaction_payee_detail_id
                       FROM transaction_info_copy
                       WHERE refferance_no = ?
                     `;
                    dbkey.connectionobj.query(
                      selectQuery,
                      [refNo],
                      function (err, rows) {
                        if (err) return sub1(err);
                        if (rows && rows.length > 0) {
                          params.transaction_id = rows[0].transaction_id;
                          params.transaction_payee_detail_id =
                            rows[0].transaction_payee_detail_id;
                          return sub1();
                        } else {
                          return sub1({
                            message:
                              "No record found for this reference number",
                          });
                        }
                      }
                    );
                  }, //end

                  // Sub-step 2: Update transaction_info_copy
                  function (sub2) {
                    const updateParams = {
                      table_name: "transaction_info_copy",
                      transaction_id: params.transaction_id,
                      bank_reff_no: payment.id,
                      bank_status:
                        order.status === "paid" ? "Success" : "Failed",
                      transaction_status: order.status === "paid" ? "S" : "F",
                      amount: payment.amount / 100,
                      payment_mode: payment.method,
                      paymentgatewayorderid: order.id,
                      statusupdatefrom: "D",
                    };

                    console.log("🧾 Updating payment record:", updateParams);

                    SHARED_SERVICE.validateAndUpdateInTable(
                      dbkey,
                      request,
                      updateParams,
                      sessionDetails,
                      function (err, res) {
                        if (err) {
                          console.error("❌ DB update error:", err);
                          return sub2(err);
                        }

                        return sub2();
                      }
                    );
                  },

                  // Sub-step 2: Update transaction_info_copy
                  function (sub3) {
                    if (order.status === "paid") {
                      const updateQuery = `
                         UPDATE transaction_payee_detail
                         SET transaction_id = ? and transaction_status "S"
                         WHERE transaction_payee_detail_id = ?
                         `;
                      dbkey.connectionobj.query(
                        updateQuery,
                        [
                          params.transaction_id,
                          params.transaction_payee_detail_id,
                        ],
                        function (updateErr, updateRes) {
                          if (updateErr) {
                            console.error(
                              "❌ Error updating transaction_id:",
                              updateErr
                            );
                            return sub3(updateErr); // stop execution if error
                          }
                          return sub3(null, {
                            message:
                              "Transaction saved and transaction_id updated.",
                          });
                        }
                      );
                    } else {
                      return sub3(); // ✅ must CALL sub3() to move to next step
                    }
                  },
                ],
                cback
              );
            })
            .catch((error) => {
              console.error("❌ Razorpay fetch error:", error);
              return cback(error);
            });
        },
      ],

      // Step 3️⃣: Commit or Rollback Transaction
      function (err) {
        if (err) {
          console.error("❌ Payment verification failed, rolling back:", err);
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(null, {
                success: true,
                message: "Payment verified and record updated successfully",
              });
            }
          );
        }
      }
    );
  },

  // ^ Api for getting response of unsuccessfull payment
  razorpayPaymentFailed: async function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    async.series(
      [
        // Step 1️⃣: Start Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) return cback(err);

              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj }; // ✅ attach to transaction
              return cback();
            }
          );
        },

        // Step 2️⃣: Fetch Razorpay payment details
        function (cback_1) {
          const { payment_id } = params;

          if (!payment_id) return cback_1(new Error("Payment ID missing"));
          const key_id = "rzp_test_GFXEsqbgnvjTn9";
          const key_secret = "BWqj7lZLTx3hQ8JcQTV8I7tA";
          const razorpay = new Razorpay({ key_id, key_secret });
          razorpay.payments
            .fetch(payment_id)
            .then((payment) => {
              params.amount = payment.amount / 100; // convert paise → INR
              params.method = payment.method;
              /*  params.currency = payment.currency;
               params.bank = payment.bank || null;
               params.wallet = payment.wallet || null;
               params.vpa = payment.vpa || null;
               params.card_last4 = payment.card ? payment.card.last4 : null;
               params.card_network = payment.card ? payment.card.network : null;
               params.card_type = payment.card ? payment.card.type : null; */
              return cback_1();
            })
            .catch((err) => {
              console.error(
                "⚠️ Failed to fetch payment details from Razorpay:",
                err
              );
              return cback_1(); // Continue without blocking, optional
            });
        },

        // Step 2️⃣: Handle Failed Payment Logging
        function (cback_2) {
          try {
            const { order_id, payment_id, refNo } = params;

            console.warn("❌ Razorpay Payment Failed:", {
              order_id,
              payment_id,
            });

            async.series(
              [
                // Sub-step 1️⃣: Get transaction_id from reference number
                function (sub1) {
                  const selectQuery = `
                     SELECT transaction_id 
                     FROM transaction_info_copy 
                     WHERE refferance_no = ?
                   `;
                  dbkey.connectionobj.query(
                    selectQuery,
                    [refNo],
                    function (err, rows) {
                      if (err) return sub1(err);

                      if (rows && rows.length > 0) {
                        params.transaction_id = rows[0].transaction_id;
                        console.log(
                          "✅ Found transaction_id:",
                          params.transaction_id
                        );
                        return sub1();
                      } else {
                        return sub1({
                          message: "No record found for this reference number",
                        });
                      }
                    }
                  );
                },

                // Sub-step 2️⃣: Update transaction_info_copy using validateAndUpdateInTable
                function (sub2) {
                  const updateParams = {
                    table_name: "transaction_info_copy",
                    transaction_id: params.transaction_id,
                    bank_reff_no: payment_id,
                    bank_status: "Failed",
                    paymentgatewayorderid: order_id,
                    transaction_status: "F",
                    amount: params.amount,
                    payment_mode: params.method,
                  };

                  // console.log(
                  //   "🧾 Updating failed payment record:",
                  //   updateParams
                  // );

                  SHARED_SERVICE.validateAndUpdateInTable(
                    dbkey,
                    request,
                    updateParams,
                    sessionDetails,
                    function (err, res) {
                      if (err) {
                        console.error("❌ DB update error:", err);
                        return sub2(err);
                      }

                      // console.log(
                      //   "✅ Payment failure updated successfully:",
                      //   res
                      // );
                      return sub2();
                    }
                  );
                },
              ],
              cback_2
            );
          } catch (error) {
            console.error("❌ Payment failure logging internal error:", error);
            return cback_2(error);
          }
        },
      ],

      // Step 3️⃣: Commit / Rollback Transaction
      function (err) {
        if (err) {
          console.error(
            "❌ Payment failure logging failed, rolling back:",
            err
          );
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              console.log("✅ Payment failure committed successfully to DB");
              callback(null, {
                success: true,
                message: "Payment failure logged successfully",
              });
            }
          );
        }
      }
    );
  },

  // ^ Api for importing payment via excel to update the payment status
  importPaymentSettlement: async function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    async.series(
      [
        // Step 1️⃣: Start Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              if (err) return cback(err);

              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              cback();
            }
          );
        },

        // Step 2️⃣: Handle File Upload and Parse Excel
        function (cback) {
          try {
            if (!request.files) {
              return cback({ status: 400, message: "No file provided" });
            }

            // console.log('params.file_name ', request.files.file.name);
            params.file_name = request?.files?.file?.name;

            // 📂 Call your docUpload() helper
            DOC_UPLOAD_SERVICE.docUpload(
              dbkey,
              request,
              params,
              sessionDetails,
              async (err, res) => {
                if (err) return cback(err);

                const { buffer, extension } = res;
                if (!buffer) {
                  return cback({
                    status: 400,
                    message: "No readable file buffer found",
                  });
                }

                // 🧩 Libraries for reading Excel/ZIP
                const ExcelJS = require("exceljs");
                const AdmZip = require("adm-zip");
                let settlementData = [];

                try {
                  // ✅ Case 1: ZIP file (may contain multiple Excel files)
                  if (extension === ".zip") {
                    const zip = new AdmZip(buffer);
                    const entries = zip.getEntries();

                    for (const entry of entries) {
                      if (entry.entryName.endsWith(".xlsx")) {
                        const workbook = new ExcelJS.Workbook();
                        await workbook.xlsx.load(entry.getData());
                        const worksheet = workbook.worksheets[0];
                        settlementData.push(
                          ...course.parseExcelSheet(worksheet)
                        );
                      }
                    }
                  }

                  // ✅ Case 2: Excel file
                  else if ([".xlsx", ".xls"].includes(extension)) {
                    const workbook = new ExcelJS.Workbook();
                    await workbook.xlsx.load(buffer);
                    const worksheet = workbook.worksheets[0];
                    settlementData.push(...course.parseExcelSheet(worksheet));
                  }

                  // ❌ Unsupported file type
                  else {
                    return cback({
                      status: 400,
                      message: "Unsupported file type",
                    });
                  }

                  if (!settlementData.length) {
                    return cback({
                      message: "No data found in uploaded file.",
                    });
                  }

                  // ✅ Store parsed data for next step
                  params.settlementData = settlementData;
                  // console.log("📦 Parsed settlement data:", settlementData);

                  // Step 2️⃣A: Loop through settlement data and update transaction_info_copy
                  async.eachSeries(
                    settlementData,
                    function (record, eachCb) {
                      const fullvalue = JSON.stringify([record]);
                      const refNo = record?.order_receipt;

                      if (!refNo) {
                        console.warn(
                          "⚠️ Missing reference number in Excel data"
                        );
                        return eachCb({
                          message: "Missing reference number in uploaded data",
                        });
                      }

                      const selectQuery = `
                       SELECT transaction_id,transaction_payee_detail_id, transaction_status, refferance_no, bank_reff_no, amount
                       FROM transaction_info_copy 
                       WHERE refferance_no = ?
                     `;

                      dbkey.connectionobj.query(
                        selectQuery,
                        [refNo],
                        function (err, rows) {
                          if (err) return eachCb(err);

                          if (!rows || rows.length === 0) {
                            // console.warn("⚠️ No record found for reference:", refNo);
                            return eachCb();
                          }
                          // console.log("this is rows", rows);

                          const {
                            transaction_id,
                            transaction_payee_detail_id,
                            transaction_status,
                            refferance_no,
                            bank_reff_no,
                            amount,
                          } = rows[0];
                          // console.log(`🔍 Found record for ${refNo} → Status: ${transaction_status}`);

                          // 🧾 Prepare updateParams based on status
                          let updateParams = {
                            table_name: "transaction_info_copy",
                            transaction_id: transaction_id,
                            verifiedstatusfrommis: "Y",
                          };

                          // If transaction failed ('F'), mark it as success
                          if (transaction_status === "F") {
                            updateParams = {
                              ...updateParams,
                              bank_status: "Success",
                              transaction_status: "S",
                              amount: record.amount,
                              update_from: params?.file_name,
                              statusupdatefrom: "M",
                            };

                            const updateQuery = `
                           UPDATE transaction_payee_detail
                           SET transaction_id = ?
                           WHERE transaction_payee_detail_id = ?
                          `;
                            dbkey.connectionobj.query(
                              updateQuery,
                              [transaction_id, transaction_payee_detail_id],
                              function (updateErr, updateRes) {
                                if (updateErr) {
                                  console.error(
                                    "❌ Error updating transaction_id:",
                                    updateErr
                                  );
                                }
                              }
                            );
                          }

                          // console.log("🧾 Updating transaction record:", updateParams);

                          // Step 1️⃣: Update main transaction table
                          SHARED_SERVICE.validateAndUpdateInTable(
                            dbkey,
                            request,
                            updateParams,
                            sessionDetails,
                            function (err, res) {
                              if (err) {
                                console.error("❌ Update error:", err);
                                return eachCb(err);
                              }

                              // console.log("✅ Updated successfully:", { refNo, status: transaction_status });

                              // Step 2️⃣: Insert into payment_setlement_report
                              const paymentsetlementreport = {
                                table_name: "payment_setlement_report",
                                refferance_no,
                                amount,
                                trans_date: course.formatDateToISO(
                                  record?.payment_captured_at
                                ),
                                settle_date: course.formatDateToISO(
                                  record?.settled_at
                                ),
                                bank_reff_no,
                                transaction_id,
                                filename: params.file_name,
                              };

                              // console.log("💾 Inserting into payment_setlement_report:", paymentsetlementreport);

                              SHARED_SERVICE.validateAndInsertInTable(
                                dbkey,
                                request,
                                paymentsetlementreport,
                                sessionDetails,
                                function (err, res1) {
                                  if (err) return eachCb(err);

                                  const insertedId = res1?.data?.insertId;
                                  if (!insertedId) {
                                    console.error(
                                      "⚠️ Insert failed: no insertId returned for report"
                                    );
                                    return eachCb({
                                      message:
                                        "Insert failed: payment_setlement_report",
                                    });
                                  }

                                  // console.log("✅ Inserted payment_setlement_report:", insertedId);

                                  // Step 3️⃣: Insert into payment_setlement_report_detail
                                  const paymentsetlementreportdetail = {
                                    table_name:
                                      "payment_setlement_report_detail",
                                    psr_id: insertedId,
                                    fullvalue: fullvalue,
                                  };

                                  // console.log("💾 Inserting into payment_setlement_report_detail:", paymentsetlementreportdetail);

                                  SHARED_SERVICE.validateAndInsertInTable(
                                    dbkey,
                                    request,
                                    paymentsetlementreportdetail,
                                    sessionDetails,
                                    function (err, res2) {
                                      if (err) return eachCb(err);

                                      const insertedDetailId =
                                        res2?.data?.insertId;
                                      if (!insertedDetailId) {
                                        console.error(
                                          "⚠️ Insert failed: no insertId returned for detail"
                                        );
                                        return eachCb({
                                          message:
                                            "Insert failed: payment_setlement_report_detail",
                                        });
                                      }

                                      // console.log("✅ Inserted payment_setlement_report_detail:", insertedDetailId);
                                      eachCb(); // Proceed to next record
                                    }
                                  );
                                }
                              );
                            }
                          );
                        }
                      );
                    },

                    // 🔚 After all records processed
                    function (err) {
                      if (err) {
                        console.error("⚠️ Settlement update loop error:", err);
                        return cback(err);
                      }

                      console.log(
                        "✅ All settlement records processed successfully!"
                      );
                      return cback();
                    }
                  );
                } catch (err2) {
                  console.error("❌ Error reading Excel:", err2);
                  cback(err2);
                }
              }
            );
          } catch (error) {
            console.error("❌ File processing error:", error);
            cback(error);
          }
        },
      ],

      // Step 4️⃣: Commit or Rollback
      function (err) {
        if (err) {
          console.error("❌ Settlement import failed, rolling back:", err);
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(null, {
                success: true,
                message: "✅ Payment Settlement processed successfully!",
                inserted_count: params.settlementData?.length || 0,
                preview: params.settlementData || [],
              });
            }
          );
        }
      }
    );
  },

  // * Helper function — parses Excel rows (kept inside same object)
  parseExcelSheet(worksheet) {
    const rows = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      rows.push({
        merchants_id: row.getCell(1).value || null,
        transaction_entity: row.getCell(2).value || null,
        entity_id: row.getCell(3).value,
        amount: row.getCell(4).value,
        currency: row.getCell(5).value,
        credit: row.getCell(8).value,
        payment_method: row.getCell(10).value,
        entity_created_at: row.getCell(13).value,
        payment_captured_at: row.getCell(14).value,
        entity_description: row.getCell(18).value,
        order_id: row.getCell(19).value,
        payment_id: row.getCell(20).value,
        order_receipt: row.getCell(21).value || null,
        settlement_id: row.getCell(26).value,
        settled_at: row.getCell(27).value,
        Payments_ARN: row.getCell(39).value,
        Payments_RRN: row.getCell(40).value,
      });
    });
    return rows;
  },

  // * convert to standard format
  formatDateToISO(dateStr) {
    if (!dateStr) return null;
    // Split by "/" → [DD, MM, YYYY]
    const [day, month, year] = dateStr.split("/");
    if (!day || !month || !year) return null;
    return `${year}-${month}-${day}`; // → YYYY-MM-DD
  },

  // ^ Api for getting student payment details
  getPaymentDetails: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    async.series(
      [
        // Step 1️⃣: Start transaction
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

        // Step 2️⃣: Fetch payment + optional certificate details
        function (cback) {
          let selectQuery = `
          SELECT registration_id, reval_id, transaction_id
          FROM transaction_payee_detail
          WHERE registration_id = ?
        `;

          let queryParams = [params.registration_id];

          if (params.reval_id) {
            selectQuery += " AND reval_id = ?";
            queryParams.push(params.reval_id);
          } else if (params.fee_purpose_id) {
            selectQuery += " AND purpose_id = ?";
            queryParams.push(params.fee_purpose_id);
          }
          console.log("hello", params.reval_id);
          console.log("hello", params.fee_purpose_id);
          console.log("hello", selectQuery);

          dbkey.connectionobj.query(
            selectQuery,
            queryParams,
            function (err, rows) {
              if (err) return cback(err);

              params.transaction_id = rows?.[0]?.transaction_id || null;
              console.log("rows", rows);
              console.log("rows", params.transaction_id);

              // Fetch main payment data
              DB_SERVICE.getQueryDataFromId(
                dbkey,
                request,
                params,
                sessionDetails,
                function (err, paymentData) {
                  if (err) return cback(err);

                  params.paymentData = paymentData;

                  // If certificate required, fetch certificate details
                  if (params.is_cert === "Y") {
                    let certQuery = "";
                    let tableName = "";
                    console.log("called 1");

                    if (params.fee_purpose_id == 26) {
                      tableName = "a_transfer_certificate_apply";
                    } else if (params.fee_purpose_id == 24) {
                      tableName = "a_migration_apply";
                    }

                    if (tableName) {
                      console.log("i am called", tableName);

                      certQuery = `
    SELECT Student_Id,
           apply_academic_session_id,
           degree_programme_id,
           original_duplicate,
           is_approved,
           is_generated
    FROM ${tableName}
    WHERE student_Id = ?
      AND delete_Flag = 'N'
      AND admission_session = ?
  `;
                    }

                    dbkey.connectionobj.query(
                      certQuery,
                      [params.student_id, params.admission_session_id],
                      function (err, rows) {
                        if (err) return cback(err);
                        console.log("tushil", params);
                        console.log("rawte", certQuery);

                        console.log("bhupesh", rows);

                        params.certificate_data = rows?.[0] || null;
                        console.log(
                          "certificate data",
                          params.certificate_data
                        );

                        return cback();
                      }
                    );
                  } else {
                    return cback();
                  }
                }
              );
            }
          );
        },
      ],

      // Step 3️⃣: Commit or rollback
      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(null, {
                transaction_id: params.transaction_id,
                payData: params.paymentData?.[0],
                certificateData: params.certificate_data || null,
              });
            }
          );
        }
      }
    );
  },

  // * ///////////////get registered student list//////
  getStuWiseRegCourses: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    // console.log("dbkey : ", dbkey);
    // console.log("params : ", params);
    // console.log("sessionDetails : ",sessionDetails);
    return DB_SERVICE.getQueryDataFromId(
      dbkey,
      request,
      params,
      sessionDetails,
      callback
    );
  },

  //* /////////////////////// Get Registered Course ///////////////////////
  getRegisteredCourseList: function (
    dbkey,
    request,
    params,
    sessionDetails,
    callback
  ) {
    // console.log("sessionDetails : ===>>>>>> ", sessionDetails);
    // query_id = 156
    return DB_SERVICE.getQueryDataFromId(
      dbkey,
      request,
      params,
      sessionDetails,
      callback
    );
  },

  //* ======================================= Certificates (Transfer and Migration) Section ======================================
  // ^ Api for updating remark & behaviour
  updateRemarkBehaviorTransferCertificate: function (
    dbkey,
    request,
    param,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    async.series(
      [
        // Step 1: Create Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback(err);
            }
          );
        },

        // Step 2: Update remark and behavior (SINGLE DATA)
        function (cback2) {
          if (!param || !param.student_id) {
            return cback2(new Error("Invalid input data"));
          }

          const updateParams = {
            log_table_name: "a_transfer_certificate_apply_log",
            update_table_name: "a_transfer_certificate_apply",
            whereObj: {
              student_id: param.student_id,
              delete_flag: "N",
            },
            updateObj: {
              behavior: param.behavior_id,
              remark: param.remark,
              action_ip_address: sessionDetails.ip_address,
              action_by: sessionDetails.user_id,
              action_type: "U",
            },
          };

          SHARED_SERVICE.insrtAndUpdtOperation(
            dbkey,
            request,
            updateParams,
            sessionDetails,
            function (err) {
              if (err) return cback2(err);
              return cback2();
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
              callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(null, {
                ...securityService.SECURITY_ERRORS.SUCCESS,
                message: "Student transfer detail updated successfully",
              });
            }
          );
        }
      }
    );
  },

  approveGenerateTransferCertificate: function (
    dbkey,
    request,
    param,
    sessionDetails,
    callback
  ) {
    let tranObj, tranCallback;

    async.series(
      [
        // Step 1: Create Transaction
        function (cback) {
          DB_SERVICE.createTransaction(
            dbkey,
            function (err, tranobj, trancallback) {
              tranObj = tranobj;
              tranCallback = trancallback;
              dbkey = { dbkey: dbkey, connectionobj: tranObj };
              return cback(err);
            }
          );
        },

        // Step 2: Update approve and generate transfer certificate
        function (cback2) {
          async.eachSeries(
            param,
            function (student, cb) {
              async.series(
                [
                  // ✅ 1. UPDATE approval + generation
                  function (s1) {
                    const updateParams = {
                      log_table_name: "a_transfer_certificate_apply_log",
                      update_table_name: "a_transfer_certificate_apply",
                      whereObj: {
                        ue_id: student.ue_id,
                        degree_programme_id: student.degree_programme_id,
                        original_duplicate: student.originalduplicate,
                        delete_flag: "N",
                      },
                      updateObj: {
                        is_approved: 1,
                        is_generated: 1,
                        transfer_certificate_approved_date: format(
                          new Date(),
                          "yyyy-MM-dd HH:mm:ss"
                        ),
                        transfer_certificate_generated_date: format(
                          new Date(),
                          "yyyy-MM-dd HH:mm:ss"
                        ),
                        transfer_certificate_approved_by:
                          sessionDetails.user_id,
                        transfer_certificate_generated_by:
                          sessionDetails.user_id,
                        action_ip_address: sessionDetails.ip_address,
                        action_by: sessionDetails.user_id,
                        action_type: "U",
                      },
                    };

                    SHARED_SERVICE.insrtAndUpdtOperation(
                      dbkey,
                      request,
                      updateParams,
                      sessionDetails,
                      s1
                    );
                  },

                  // ✅ STEP 2: Get certificate number
                  function (s2) {
                    studentProfileService.getCertificateNumber(
                      dbkey,
                      request,
                      {
                        academic_session_id: student.academic_session_id,
                        certificate_type: 6,
                        degree_programme_type_id:
                          student.degree_programme_type_id,
                      },
                      { ...sessionDetails, query_id: 362 },
                      function (err, res) {
                        console.log(res);
                        if (err || !res?.[0]?.certificate_number) {
                          return s2("Certificate number generation failed");
                        }
                        student.certificate_number = res[0].certificate_number;
                        s2();
                      }
                    );
                  },

                  // ✅ STEP 3: Insert certificate
                  function (s3) {
                    const insertParams = {
                      table_name: "a_certificates",
                      ue_id: student.ue_id,
                      degree_id: student.degree_id,
                      degree_programme_type_id:
                        student.degree_programme_type_id,
                      academic_session_id: student.academic_session_id,
                      certificate_number: student.certificate_number,
                      certificate_type: 6,
                      is_certificate_signed: "N",
                      generated_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                    };

                    SHARED_SERVICE.validateAndInsertInTable(
                      dbkey,
                      request,
                      insertParams,
                      sessionDetails,
                      s3
                    );
                  },
                ],
                cb
              ); // ✅ cb called ONLY ONCE PER STUDENT
            },
            cback2
          ); // ✅ call after all students complete
        },
      ],
      function (err) {
        if (err) {
          DB_SERVICE.rollbackPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(err);
            }
          );
        } else {
          DB_SERVICE.commitPartialTransaction(
            tranObj,
            tranCallback,
            function () {
              callback(null, {
                ...securityService.SECURITY_ERRORS.SUCCESS,
                message: "Student transfer detail updated successfully",
              });
            }
          );
        }
      }
    );
  },
};

module.exports = course;
