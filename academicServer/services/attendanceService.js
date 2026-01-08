
var DB_SERVICE = global.DB_SERVICE;
var securityService = global.COMMON_SECURITY_SERVICE;
const DOC_UPLOAD_SERVICE = global.DOC_UPLOAD_SERVICE;
const SHARED_SERVICE = global.SHARED_SERVICE;
var async = require('async');
let format = require('date-format');
const { log } = require('handlebars');
const path = require("path");
const fs = require("fs");

let attendance = {
    // ^ /////////////////Update Student Course Attendance////////////////////
    updateStudentCourseAttendance: function (dbkey, request, params, sessionDetails, callback) {
        let tranObj, tranCallback;
        let payload = params;
        async.series([
            // Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },
            //* Update a_student_registration_and_marks table data
            function (cback2) {
                // registration_and_marks_id
                // registration_id
                // course_id
                // course_nature_id
                // attendance_status_id
                // student_id
                // registration_main_id
                async.eachSeries(payload, function (attendanceRow, cb) {
                    let updateParams = {
                        update_table_name: 'a_student_registration_and_marks',
                        updateObj: {
                            // academic_session_id: attendanceRow.academic_session_id,
                            // dean_commeettee_id: attendanceRow.dean_commeettee_id,
                            // semester_id: attendanceRow.semester_id,
                            // subject_id: attendanceRow.subject_id,
                            attendance_status_id: attendanceRow.attendance_status_id,
                            action_ip_address: sessionDetails.ip_address,
                            action_by: sessionDetails.user_id,
                            action_type: 'U',
                            action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                        },
                        whereObj: {
                            registration_id: attendanceRow.registration_id,
                            course_nature_id: attendanceRow.course_nature_id,
                            course_id: attendanceRow.course_id
                        }
                    };

                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                        if (err) return cb(err);
                        else if (res && res.length > 0) {
                            return cb();
                        } else {
                            return cb({ message: `No record updated in a_student_registration_and_marks` });
                        }
                    });
                    // return cb();

                }, function (err) {
                    return cback2(err);
                });
            },
        ], function (err, res) {
            if (err) {
                console.error("Transaction error:", err); // Debugging
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function (err4) {
                    return callback(err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function (err5) {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Student course attendance updated successfully' });
                });
            }
        });
    },

    // * /////////////////Get Course Wise Attendance////////////////////
    getCourseWiseAttendance: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // ! /////////////////Get student attendace list//////////////////// currently used for get result notification
    getStudentAttendanceList: function (dbkey, request, params, sessionDetails, callback) {
        let { dean_committee_id, dean_committee_name_e, academic_session_name_e } = params
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, function (err, res) {
            if (err) {
                return callback(err);
            } else if (res && res.length > 0) {
                const groupedByStudent = {};
                const uniqueCoursesMap = {}; // To track unique courses for frontend

                res.forEach(item => {
                    const key = item.ue_id;

                    // Initialize student if not already grouped
                    if (!groupedByStudent[key]) {
                        const {
                            ue_id,
                            student_name,
                            registration_id,
                            student_photo_path,
                            student_signature_path,
                            // college_id,
                            // college_name_e,
                            degree_programme_id,
                            degree_programme_name_e,
                            course_year_id,
                            course_year_name_e,
                            stu_acad_status_id,
                            stu_acad_status_name_e,
                            stu_study_status_id,
                            stu_study_status_name_e,
                            semester_id,
                            semester_name_e,
                            course_registration_type_id
                        } = item;

                        groupedByStudent[key] = {
                            student_info: {
                                ue_id,
                                student_name,
                                registration_id,
                                student_photo_path,
                                student_signature_path,
                                // college_id,
                                // college_name_e,
                                degree_programme_id,
                                degree_programme_name_e,
                                course_year_id,
                                course_year_name_e,
                                stu_acad_status_id,
                                stu_acad_status_name_e,
                                stu_study_status_id,
                                stu_study_status_name_e,
                                semester_id,
                                semester_name_e,
                                remark_id: item.remark_id,
                                // section_id: item.section_id,
                                // section_name: item.section_name,
                                is_finalize_yn: item.is_finalize_yn,
                                course_registration_type_id: course_registration_type_id,
                                coursesMap: {}
                            }
                        };
                    }
                    const courseCode = item.course_code;
                    const courseNature = item.course_nature;
                    const finalMarks = item.final_marks;

                    // Add to student's course map
                    const coursesMap = groupedByStudent[key].student_info.coursesMap;

                    if (!coursesMap[courseCode]) {
                        coursesMap[courseCode] = {
                            course_code: courseCode,
                            T: null,
                            P: null
                        };
                    }

                    if (courseNature === 'T') {
                        coursesMap[courseCode].T = finalMarks;
                    } else if (courseNature === 'P') {
                        coursesMap[courseCode].P = finalMarks;
                    }

                    // Also build unique course map for frontend filtering
                    if (!uniqueCoursesMap[courseCode]) {
                        uniqueCoursesMap[courseCode] = {
                            course_code: courseCode,
                            T: null,
                            P: null
                        };
                    }

                    if (courseNature === 'T') {
                        uniqueCoursesMap[courseCode].T = '';
                    } else if (courseNature === 'P') {
                        uniqueCoursesMap[courseCode].P = '';
                    }
                });

                // Finalize student list
                const studentList = Object.values(groupedByStudent).map(studentEntry => {
                    const studentInfo = studentEntry.student_info;
                    studentInfo.courses = Object.values(studentInfo.coursesMap).map(course => {
                        if (course.T === null) delete course.T;
                        if (course.P === null) delete course.P;
                        return course;
                    });
                    delete studentInfo.coursesMap;
                    return studentInfo;
                })
                    // Sort by stu_acad_status_id (ascending)
                    .sort((a, b) => b?.courses?.length - a?.courses?.length);

                // Finalize unique courses list
                const coursesList = Object.values(uniqueCoursesMap).map(course => {
                    if (course.T === null) delete course.T;
                    if (course.P === null) delete course.P;
                    return course;
                });

                callback(null, {
                    students: studentList,
                    courses: coursesList,
                    heanders: {
                        college_id: res[0].college_id,
                        college_name_e: res[0].college_name_e,
                        degree_programme_name_e: res[0].degree_programme_name_e,
                        degree_programme_id: res[0].degree_programme_id,
                        dean_committee_name_e: dean_committee_name_e,
                        dean_committee_id: dean_committee_id,
                        academic_session_name_e: academic_session_name_e,
                        course_year_id: res[0].course_year_id,
                        course_year_name_e: res[0].course_year_name_e,
                        semester_name_e: res[0].semester_name_e,
                    }
                });
            } else {
                callback({ message: `No data found` });
            }
        });
    },

    // ^ /////////////////finalize Student Course Attendance////////////////////
    finalizeStudentCourseAttendance: function (dbkey, request, params, sessionDetails, callback) {
        let tranObj, tranCallback;
        let payload = params;
        async.series([
            // Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },
            //* Update a_student_registration_main table data
            function (cback2) {
                async.eachSeries(payload, function (attendanceRow, cb) {
                    let updateParams = {
                        update_table_name: 'a_student_registration_main_copy',
                        updateObj: {
                            is_finalize_yn: attendanceRow.is_finalize_yn,
                            action_ip_address: sessionDetails.ip_address,
                            action_by: sessionDetails.user_id,
                            action_type: 'U',
                            action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                        },
                        whereObj: {
                            registration_id: attendanceRow.registration_id,
                            ue_id: attendanceRow.ue_id
                        }
                    };

                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                        if (err) return cb(err);
                        else if (res && res.length > 0) {
                            return cb();
                        } else {
                            return cb({ message: `No record updated in a_student_registration_main` });
                        }
                    });
                    // return cb();

                }, function (err) {
                    return cback2(err);
                });
            },
        ], function (err, res) {
            if (err) {
                console.error("Transaction error:", err); // Debugging
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function (err4) {
                    return callback(err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function (err5) {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Student course attendance finalize successfully' });
                });
            }
        });
    },

    // ^ /////////////////Un-Finalize Student Course Attendance////////////////////
    unFinalizeStudentCourseAttendance: function (dbkey, request, params, sessionDetails, callback) {
        let tranObj, tranCallback;
        let payload = params;
        async.series([
            // Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },
            //* Update a_student_registration_main table data
            function (cback2) {
                async.eachSeries(payload, function (attendanceRow, cb) {
                    let updateParams = {
                        update_table_name: 'a_student_registration_main',
                        updateObj: {
                            is_finalize_yn: attendanceRow.is_finalize_yn,
                            action_ip_address: sessionDetails.ip_address,
                            action_by: sessionDetails.user_id,
                            action_type: 'U',
                            action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
                            action_remark: attendanceRow.action_remark
                        },
                        whereObj: {
                            registration_id: attendanceRow.registration_id,
                            ue_id: attendanceRow.ue_id,
                            // course_id: attendanceRow.course_id,
                            // course_nature_id: attendanceRow.course_nature_id
                        }
                    };
                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                        if (err) return cb(err);
                        else if (res && res.length > 0) {
                            return cb();
                        } else {
                            return cb({ message: `No record updated in a_student_registration_main` });
                        }
                    });
                    // return cb();
                }, function (err) {
                    return cback2(err);
                });
            },
        ], function (err, res) {
            if (err) {
                console.error("Transaction error:", err); // Debugging
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function (err4) {
                    return callback(err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function (err5) {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Student course attendance un-finalize successfully' });
                });
            }
        });
    },

    // * //////////////////// check Internal Manually Marks Entry Exist /////////////////////////
    checkInternalManuallyMarksEntryExist: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // here renamed actual is saveStudentsclubedMarks not saveStudentsclubedMarks1
    // importStudentsMarksData: async function (dbkey, request, params, sessionDetails, callback) {
    //     let tranObj, tranCallback;

    //     try {
    //         // Step 1: Check if file is provided
    //         if (!request.files) {
    //             return callback({ status: 400, message: "No file provided" });
    //         }

    //         // Set default file name
    //         params.file_name = params.module_name || "upload";

    //         // Upload file first
    //         DOC_UPLOAD_SERVICE.docUpload(dbkey, request, params, sessionDetails, async (err, res) => {
    //             if (err) return callback(err);

    //             const AdmZip = require("adm-zip");
    //             const ExcelJS = require("exceljs");
    //             const async = require("async");
    //             let students = [];

    //             if (res.buffer) {
    //                 // ✅ Handle ZIP File
    //                 if (res.extension === ".zip") {
    //                     const zip = new AdmZip(res.buffer);
    //                     const entries = zip.getEntries();

    //                     for (const entry of entries) {
    //                         if (entry.entryName.endsWith(".xlsx")) {
    //                             const workbook = new ExcelJS.Workbook();
    //                             await workbook.xlsx.load(entry.getData());
    //                             const worksheet = workbook.worksheets[0];

    //                             worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    //                                 if (rowNumber === 1) return; // skip header
    //                                 students.push({
    //                                     srno: row.getCell(1).value || null,
    //                                     export_batch_id: row.getCell(2).value || null,   // export_batch_id
    //                                     admission_session: row.getCell(3).value,                                  // admission_session
    //                                     registration_id: row.getCell(4).value,                                    // registration_id
    //                                     course_year_id: row.getCell(5).value,                                     // course_year_id
    //                                     dean_committee_id: row.getCell(6).value,                                  // dean_committee_id
    //                                     academic_session_id: row.getCell(7).value,                                // academic_session_id
    //                                     course_id: row.getCell(8).value,                                          // course_id
    //                                     ue_id: row.getCell(9).value,                                              // ue_id
    //                                     college_id: row.getCell(10).value,                                        // college_id
    //                                     student_master_id: row.getCell(11).value,                                 // student_master_id
    //                                     degree_programme_id: row.getCell(12).value,                               // degree_programme_id
    //                                     semester_id: row.getCell(13).value,                                       // semester_id
    //                                     section_id: row.getCell(14).value || null,                                // section_id
    //                                     exam_type_id: row.getCell(15).value,                                      // exam_type_id
    //                                     registration_status_id: row.getCell(16).value,                            // registration_status_id
    //                                     course_registration_type_id: row.getCell(17).value,                       // course_registration_type_id
    //                                     course_nature_id: row.getCell(18).value,                                  // course_nature_id
    //                                     remark_id: row.getCell(19).value,                                         // remark_id
    //                                     max_marks_internal: row.getCell(20).value || 0,                           // max_marks_internal
    //                                     max_marks_external: row.getCell(21).value || 0,                           // max_marks_external
    //                                     special_remark_id: row.getCell(22).value,                                 // special_remark_id
    //                                     final_marks: row.getCell(23).value,                                       // final_marks
    //                                     exam_paper_type_id: row.getCell(24).value,                             // exam_paper_type_id    
    //                                 });
    //                             });
    //                         }
    //                     }
    //                 }

    //                 // ✅ Handle Excel File
    //                 else if ([".xlsx", ".xls"].includes(res.extension)) {
    //                     const workbook = new ExcelJS.Workbook();
    //                     await workbook.xlsx.load(res.buffer);
    //                     const worksheet = workbook.worksheets[0];

    //                     worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    //                         if (rowNumber === 1) return; // skip header
    //                         students.push({
    //                             srno: row.getCell(1).value || null,
    //                             export_batch_id: row.getCell(2).value || null,   // export_batch_id
    //                             admission_session: row.getCell(3).value,                                  // admission_session
    //                             registration_id: row.getCell(4).value,                                    // registration_id
    //                             course_year_id: row.getCell(5).value,                                     // course_year_id
    //                             dean_committee_id: row.getCell(6).value,                                  // dean_committee_id
    //                             academic_session_id: row.getCell(7).value,                                // academic_session_id
    //                             course_id: row.getCell(8).value,                                          // course_id
    //                             ue_id: row.getCell(9).value,                                              // ue_id
    //                             college_id: row.getCell(10).value,                                        // college_id
    //                             student_master_id: row.getCell(11).value,                                 // student_master_id
    //                             degree_programme_id: row.getCell(12).value,                               // degree_programme_id
    //                             semester_id: row.getCell(13).value,                                       // semester_id
    //                             section_id: row.getCell(14).value || null,                                // section_id
    //                             exam_type_id: row.getCell(15).value,                                      // exam_type_id
    //                             registration_status_id: row.getCell(16).value,                            // registration_status_id
    //                             course_registration_type_id: row.getCell(17).value,                       // course_registration_type_id
    //                             course_nature_id: row.getCell(18).value,                                  // course_nature_id
    //                             remark_id: row.getCell(19).value,                                         // remark_id
    //                             max_marks_internal: row.getCell(20).value,                           // max_marks_internal
    //                             max_marks_external: row.getCell(21).value,                           // max_marks_external
    //                             special_remark_id: row.getCell(22).value,                                 // special_remark_id
    //                             final_marks: row.getCell(23).value,                                       // final_marks
    //                             exam_paper_type_id: row.getCell(24).value,
    //                         });
    //                         console.log('excel', students)
    //                     });
    //                 } else {
    //                     return callback({ status: 400, message: "Unsupported file type" });
    //                 }

    //                 // 🚀 Proceed to DB insert
    //                 async.series(
    //                     [
    //                         // Step 1: Start Transaction
    //                         function (cback) {
    //                             DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
    //                                 if (err) return cback(err);
    //                                 tranObj = tranobj;
    //                                 tranCallback = trancallback;
    //                                 dbkey = { dbkey: dbkey, connectionobj: tranObj };
    //                                 cback();
    //                             });
    //                         },

    //                         // Step 2: Bulk Insert into DB
    //                         function (cback) {
    //                             if (!students || students.length === 0) {
    //                                 return cback(new Error("No student data to insert"));
    //                             }

    //                             const insertObj = {
    //                                 table_name: "import_data_from_fireeye",
    //                                 data_arr: students.map(s => ({
    // srno: s.srno,
    // admission_session: s.admission_session,
    // student_course_year_id: s.course_year_id,
    // dean_committee_id: s.dean_committee_id,
    // academic_session_id: s.academic_session_id,
    // registration_id: s.registration_id,
    // course_year_id: s.course_year_id,
    // course_id: s.course_id,
    // ue_id: s.ue_id,
    // college_id: s.college_id,
    // student_master_id: s.student_id,
    // degree_programme_id: s.degree_programme_id,
    // student_semester_id: s.semester_id,
    // course_semester_id: s.semester_id,
    // exam_type_id: s.exam_type_id,
    // registration_status_id: s.registration_status_id,
    // course_registration_type_id: s.course_registration_type_id,
    // course_nature_id: s.course_nature_id,
    // remark_id: s.remark_id,
    // max_marks: s.max_marks_external,
    // final_marks: s.obtained_mark,
    // special_remark_id: s.special_remark_id,
    // exam_paper_type_id: s.exam_paper_type_id,
    // answerbook_no: s.answerbook_no,
    // student_course_year_id: s.course_year_id,
    // export_batch_id: s.export_batch_id,

    //                                 }))
    //                             };

    //                             SHARED_SERVICE.validateAndInsertArrInTable(
    //                                 dbkey,
    //                                 request,
    //                                 insertObj,
    //                                 sessionDetails,
    //                                 function (err) {
    //                                     if (err) return cback(err);
    //                                     cback();
    //                                 }
    //                             );
    //                         },
    //                     ],
    //                     function (err) {
    //                         if (err) {
    //                             DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
    //                                 callback(err);
    //                             });
    //                         } else {
    //                             DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
    //                                 callback(null, {
    //                                     error: false,
    //                                     message: "✅ File processed & data inserted successfully",
    //                                     inserted_count: students.length,
    //                                 });
    //                             });
    //                         }
    //                     }
    //                 );
    //             } else {
    //                 return callback({ status: 400, message: "No readable file buffer found" });
    //             }
    //         });
    //     } catch (err) {
    //         console.error(err);
    //         if (tranObj && tranCallback) {
    //             DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
    //                 callback(err);
    //             });
    //         } else {
    //             callback(err);
    //         }
    //     }
    // },



    //CLUB, INSERT AND UPDATE EXTERNAL MARKS WITH CHECKING EXISTING RECORDS

    saveStudentsclubedMarks: function (dbkey, request, payload, sessionDetails, callback) {
        let tranObj, tranCallback;

        async.series([

            // Step 1: Start Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    if (err) return cback(err);
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback();
                });
            },

            // Step 2: Loop through each student row
            function (cback) {
                async.eachSeries(payload, (student, cb) => {

                    // Step 2.1: Check if external/club record exists
                    const checkQuery = `
                    SELECT * FROM a_marks_entry_detail
                    WHERE registration_id = ? 
                      AND course_id = ? 
                      AND exam_paper_type_id = ?
                      AND exam_type_id = ?
                      AND academic_session_id = ?
                      AND course_year_id = ?
                      AND course_semester_id = ?
                      AND dean_committee_id = ?
                      AND ue_id = ?
                      AND course_nature_id = ?
                      AND college_id = ?
                      AND valuation_type_id = ?
                      AND delete_flag = 'N'
                `;

                    const checkParams = [
                        student.registration_id,
                        student.course_id,
                        student.exam_paper_type_id,
                        student.exam_type_id,
                        student.academic_session_id,
                        student.course_year_id,
                        student.semester_id,
                        student.dean_committee_id,
                        student.ue_id,
                        student.course_nature_id,
                        student.college_id,
                        student.valuation_type_id
                    ];

                    dbkey.connectionobj.query(checkQuery, checkParams, function (err, result) {
                        if (err) return cb({ status: 500, message: "Error checking existing marks", error: err });

                        if (result && result.length > 0) {
                            // ✅ Record exists → Update
                            const whereObj = {
                                registration_id: student.registration_id,
                                course_id: student.course_id,
                                exam_paper_type_id: student.exam_paper_type_id,
                                exam_type_id: student.exam_type_id,
                                academic_session_id: student.academic_session_id,
                                course_year_id: student.course_year_id,
                                course_semester_id: student.semester_id,
                                dean_committee_id: student.dean_committee_id,
                                ue_id: student.ue_id,
                                course_nature_id: student.course_nature_id,
                                college_id: student.college_id,
                                valuation_type_id: student.valuation_type_id

                            };
                            const updateObj = {
                                obtained_mark: student.obtained_mark,
                                remark_id: student.remark_id,
                                valuation_type_id: student.valuation_type_id,
                                re_reval_flag: student.re_reval_flag || 'N',
                                action_by: sessionDetails.user_id,
                                action_ip_address: sessionDetails.ip_address,
                                action_type: "U",
                                action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                            };
                            const data = {
                                log_table_name: "app_log_a_marks_entry_detail",
                                update_table_name: "a_marks_entry_detail",
                                whereObj,
                                updateObj
                            };

                            SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, data, sessionDetails, function (err) {
                                if (err) return cb({ status: 500, message: "Update failed", error: err });

                                // Update final marks table for club rows
                                if ([1, 2].includes(student.exam_paper_type_id)) {
                                    const finalWhere = {
                                        registration_id: student.registration_id,
                                        course_id: student.course_id,
                                        course_nature_id: student.course_nature_id
                                    };
                                    const finalUpdate = {
                                        final_marks: student.obtained_mark,
                                        remark_id: student.remark_id,
                                        action_by: sessionDetails.user_id,
                                        action_ip_address: sessionDetails.ip_address,
                                        action_type: "U",
                                        action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                                    };
                                    const finalData = {
                                        log_table_name: "app_log_a_student_registration_and_marks",
                                        update_table_name: "a_student_registration_and_marks",
                                        whereObj: finalWhere,
                                        updateObj: finalUpdate
                                    };
                                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, finalData, sessionDetails, cb);
                                } else cb();
                            });

                        } else {
                            // ✅ Record does not exist → Insert new row
                            const insertObj = {
                                table_name: "a_marks_entry_detail",
                                data_arr: [{
                                    ue_id: student.ue_id,
                                    registration_id: student.registration_id,
                                    college_id: student.college_id,
                                    course_id: student.course_id,
                                    dean_committee_id: student.dean_committee_id,
                                    course_year_id: student.course_year_id,
                                    academic_session_id: student.academic_session_id,
                                    course_semester_id: student.semester_id,
                                    exam_type_id: student.exam_type_id,
                                    valuation_type_id: student.valuation_type_id,
                                    obtained_mark: student.obtained_mark,
                                    remark_id: student.remark_id,
                                    exam_paper_type_id: student.exam_paper_type_id,
                                    course_nature_id: student.course_nature_id,
                                    re_reval_flag: student.re_reval_flag || 'F'
                                }]
                            };

                            SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insertObj, sessionDetails, function (err) {
                                if (err) return cb({ status: 500, message: "Insert failed", error: err });

                                // Update final marks table for club rows
                                if ([1, 2].includes(student.exam_paper_type_id)) {
                                    const finalWhere = {
                                        registration_id: student.registration_id,
                                        course_id: student.course_id,
                                        course_nature_id: student.course_nature_id
                                    };
                                    const finalUpdate = {
                                        final_marks: student.obtained_mark,
                                        remark_id: student.remark_id,
                                        action_by: sessionDetails.user_id,
                                        action_ip_address: sessionDetails.ip_address,
                                        action_type: "U"
                                    };
                                    const finalData = {
                                        log_table_name: "app_log_a_student_registration_and_marks",
                                        update_table_name: "a_student_registration_and_marks",
                                        whereObj: finalWhere,
                                        updateObj: finalUpdate
                                    };
                                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, finalData, sessionDetails, cb);
                                } else cb();
                            });
                        }
                    });

                }, cback);
            }

        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { error: false, message: "Marks processed successfully" });
                });
            }
        });
    },

    //INSERT AND UPDATE EXTERNAL MARKS WITH CHECKING EXISTING RECORDS (no clubbing filter, update all rows)
    saveStudentsMarkDirectAndUpdateInReg: function (dbkey, request, payload, sessionDetails, callback) {
        let tranObj, tranCallback;

        async.series([
            // Step 1: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    if (err) return cback({ status: 500, message: "Transaction creation failed", error: err });
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    cback();
                });
            },

            // Step 2: Loop through each student record → insert/update accordingly
            function (cback) {
                if (!payload || !Array.isArray(payload) || payload.length === 0) {
                    return cback({ status: 400, message: "No student marks data provided" });
                }

                async.eachSeries(payload, (student, cb) => {
                    // Step 2.1: Check if record already exists in marks entry detail
                    const checkQuery = `
                    SELECT * FROM a_marks_entry_detail
                    WHERE registration_id = ? 
                      AND course_id = ? 
                      AND exam_paper_type_id = ?
                      AND exam_type_id = ?
                      AND academic_session_id = ?
                      AND course_year_id = ?
                      AND course_semester_id = ?
                      AND dean_committee_id = ?
                      AND ue_id = ?
                      AND course_nature_id = ?
                      AND college_id = ?
                      AND valuation_type_id = ?
                      AND delete_flag = 'N'
                `;
                    const checkParams = [
                        student.registration_id,
                        student.course_id,
                        student.exam_paper_type_id,
                        student.exam_type_id,
                        student.academic_session_id,
                        student.course_year_id,
                        student.semester_id,
                        student.dean_committee_id,
                        student.ue_id,
                        student.course_nature_id,
                        student.college_id,
                        student.valuation_type_id
                    ];

                    dbkey.connectionobj.query(checkQuery, checkParams, function (err, result) {
                        if (err) return cb({ status: 500, message: "Error checking existing marks", error: err });

                        if (result && result.length > 0) {
                            // console.log('update case');

                            // ✅ Record exists → Update existing marks row
                            const whereObj = {
                                registration_id: student.registration_id,
                                course_id: student.course_id,
                                exam_paper_type_id: student.exam_paper_type_id,
                                exam_type_id: student.exam_type_id,
                                academic_session_id: student.academic_session_id,
                                course_year_id: student.course_year_id,
                                course_semester_id: student.semester_id,
                                dean_committee_id: student.dean_committee_id,
                                ue_id: student.ue_id,
                                course_nature_id: student.course_nature_id,
                                college_id: student.college_id,
                                valuation_type_id: student.valuation_type_id
                            };
                            const updateObj = {
                                obtained_mark: student.obtained_mark,
                                remark_id: student.remark_id,
                                valuation_type_id: student.valuation_type_id,
                                action_by: sessionDetails.user_id,
                                action_ip_address: sessionDetails.ip_address,
                                action_type: "U",
                                action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                            };
                            const data = {
                                log_table_name: "app_log_a_marks_entry_detail",
                                update_table_name: "a_marks_entry_detail",
                                whereObj,
                                updateObj
                            };

                            SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, data, sessionDetails, function (err) {
                                if (err) return cb({ status: 500, message: "Marks update failed", error: err });

                                // Step 2.2: Always update final marks in registration table
                                const regWhereObj = {
                                    course_id: student.course_id,
                                    registration_id: student.registration_id,
                                    course_nature_id: student.course_nature_id
                                };
                                const regUpdateObj = {
                                    final_marks: student.obtained_mark,
                                    remark_id: student.remark_id,
                                    action_by: sessionDetails.user_id,
                                    action_ip_address: sessionDetails.ip_address,
                                    action_type: "U",
                                    action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                                };
                                const regData = {
                                    log_table_name: "app_log_a_student_registration_and_marks",
                                    update_table_name: "a_student_registration_and_marks",
                                    whereObj: regWhereObj,
                                    updateObj: regUpdateObj
                                };

                                SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, regData, sessionDetails, cb);
                            });

                        } else {
                            // ✅ Record does not exist → Insert new marks entry
                            console.log('insert case');

                            const insertObj = {
                                table_name: "a_marks_entry_detail",
                                data_arr: [{
                                    ue_id: student.ue_id,
                                    registration_id: student.registration_id,
                                    college_id: student.college_id,
                                    course_id: student.course_id,
                                    dean_committee_id: student.dean_committee_id,
                                    course_year_id: student.course_year_id,
                                    academic_session_id: student.academic_session_id,
                                    course_semester_id: student.semester_id,
                                    exam_type_id: student.exam_type_id,
                                    valuation_type_id: student.valuation_type_id,
                                    obtained_mark: student.obtained_mark,
                                    remark_id: student.remark_id,
                                    exam_paper_type_id: student.exam_paper_type_id,
                                    course_nature_id: student.course_nature_id
                                }]
                            };

                            SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insertObj, sessionDetails, function (err) {
                                if (err) return cb({ status: 500, message: "Marks insert failed", error: err });

                                // Step 2.2: Always update registration table (same as update case)
                                const regWhereObj = {
                                    course_id: student.course_id,
                                    registration_id: student.registration_id,
                                    course_nature_id: student.course_nature_id
                                };
                                const regUpdateObj = {
                                    final_marks: student.obtained_mark,
                                    remark_id: student.remark_id,
                                    action_by: sessionDetails.user_id,
                                    action_ip_address: sessionDetails.ip_address,
                                    action_type: "U"
                                };
                                const regData = {
                                    log_table_name: "app_log_a_student_registration_and_marks",
                                    update_table_name: "a_student_registration_and_marks",
                                    whereObj: regWhereObj,
                                    updateObj: regUpdateObj
                                };

                                SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, regData, sessionDetails, cb);
                            });
                        }
                    });
                }, cback);
            }

        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    callback(null, { error: true, message: err.message || "Server error", details: err.error || null });
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    callback(null, { error: false, message: "Marks inserted/updated and final marks updated successfully" });
                });
            }
        });
    },

    //INSERT INTERNAL MARKS MANNUALY WITHOUT UPDATING FINAL MARKS (no clubbing filter, insert only)
    saveStudentMarkEntryInternalManually: function (dbkey, request, payload, sessionDetails, callback) {
        let tranObj, tranCallback;

        async.series([
            // Step 1: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    if (err) return cback({ status: 500, message: "Transaction creation failed", error: err });
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    cback();
                });
            },

            // Step 2: Process each student (Insert or Update)
            function (cback) {
                if (!payload || !Array.isArray(payload) || payload.length === 0) {
                    return cback({ status: 400, message: "No student marks data provided" });
                }

                async.eachSeries(payload, function (student, cb) {

                    const checkQuery = `
                     SELECT * FROM a_marks_entry_detail
                    WHERE registration_id = ? 
                      AND course_id = ? 
                      AND exam_paper_type_id = ?
                      AND exam_type_id = ?
                      AND academic_session_id = ?
                      AND course_year_id = ?
                      AND course_semester_id = ?
                      AND dean_committee_id = ?
                      AND ue_id = ?
                      AND course_nature_id = ?
                      AND college_id = ?
                      AND delete_flag = 'N',
                      AND valuation_type_id = ?
                `;

                    const params = [
                        student.registration_id,
                        student.course_id,
                        student.exam_paper_type_id,
                        student.exam_type_id,
                        student.academic_session_id,
                        student.course_year_id,
                        student.semester_id,
                        student.dean_committee_id,
                        student.ue_id,
                        student.course_nature_id,
                        student.college_id,
                        student.valuation_type_id
                    ];

                    // Step 2.1: Check if record exists
                    dbkey.connectionobj.query(checkQuery, params, function (err, rows) {
                        if (err) return cb({ status: 500, message: "Record check failed", error: err });

                        if (rows.length > 0) {
                            // Step 2.2: Update existing record
                            const updateData = {
                                log_table_name: "app_log_a_marks_entry_detail",
                                update_table_name: "a_marks_entry_detail",
                                whereObj: {
                                    registration_id: student.registration_id,
                                    course_id: student.course_id,
                                    exam_paper_type_id: student.exam_paper_type_id,
                                    exam_type_id: student.exam_type_id,
                                    academic_session_id: student.academic_session_id,
                                    course_year_id: student.course_year_id,
                                    course_semester_id: student.semester_id,
                                    dean_committee_id: student.dean_committee_id,
                                    ue_id: student.ue_id,
                                    course_nature_id: student.course_nature_id,
                                    college_id: student.college_id
                                },
                                updateObj: {
                                    obtained_mark: student.obtained_mark,
                                    remark_id: student.remark_id,
                                    valuation_type_id: student.valuation_type_id,
                                    action_by: sessionDetails.user_id,
                                    action_ip_address: sessionDetails.ip_address,
                                    action_type: "U",
                                    action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                                }
                            };

                            SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateData, sessionDetails, cb);

                        } else {
                            // Step 2.3: Insert new record
                            const insertObj = {
                                table_name: "a_marks_entry_detail",
                                data_arr: [{
                                    ue_id: student.ue_id,
                                    registration_id: student.registration_id,
                                    college_id: student.college_id,
                                    course_id: student.course_id,
                                    dean_committee_id: student.dean_committee_id,
                                    course_year_id: student.course_year_id,
                                    academic_session_id: student.academic_session_id,
                                    course_semester_id: student.semester_id,
                                    exam_type_id: student.exam_type_id,
                                    valuation_type_id: student.valuation_type_id,
                                    obtained_mark: student.obtained_mark,
                                    remark_id: student.remark_id,
                                    exam_paper_type_id: student.exam_paper_type_id,
                                    course_nature_id: student.course_nature_id
                                }]
                            };

                            SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insertObj, sessionDetails, cb);
                        }
                    });
                }, cback);
            }

        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    callback(null, { error: true, message: err.message || "Server error", details: err.error || null });
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    callback(null, { error: false, message: "Marks inserted/updated successfully (internal, no final update)" });
                });
            }
        });
    },

    // SAVE MARKS ENTRY THESIS MANUALLY
    saveStudentMarkEntryThesis: function (dbkey, request, payload, sessionDetails, callback) {
        let tranObj, tranCallback;

        async.series([

            // Step 1: Start Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    if (err) return cback(err);
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback();
                });
            },

            // Step 2: Loop through each student record — update both tables
            function (cback) {
                async.eachSeries(payload, (student, cb) => {

                    async.series([
                        // === Step 2.1: Update a_student_registration_main ===
                        function (cb1) {
                            const whereObj = {
                                registration_id: student.registration_id,
                                college_id: student.college_id,
                                course_year_id: student.course_year_id,
                            };
                            const updateObj = {
                                date_of_viva: student.date_of_viva,
                                thesis_title: student.thesis_title,
                                action_by: sessionDetails.user_id,
                                action_ip_address: sessionDetails.ip_address,
                                action_type: "U",
                                action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                            };

                            const data = {
                                log_table_name: "app_log_a_student_registration_main",
                                update_table_name: "a_student_registration_main",
                                whereObj,
                                updateObj
                            };

                            SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, data, sessionDetails, cb1);
                        },

                        // === Step 2.2: Update a_student_registration_and_marks ===
                        function (cb2) {
                            const finalWhere = {
                                registration_id: student.registration_id,
                                course_id: student.course_id,
                                course_nature_id: student.course_nature_id
                            };

                            const finalUpdate = {
                                remark_id: student.remark_id,
                                action_by: sessionDetails.user_id,
                                action_ip_address: sessionDetails.ip_address,
                                action_type: "U",
                                action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                            };

                            const finalData = {
                                log_table_name: "app_log_a_student_registration_and_marks",
                                update_table_name: "a_student_registration_and_marks",
                                whereObj: finalWhere,
                                updateObj: finalUpdate
                            };

                            SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, finalData, sessionDetails, cb2);
                        }

                    ], cb);

                }, cback);
            }

        ], function (err) {
            if (err) {
                // Rollback on error
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err);
                });
            } else {
                // Commit if all success
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { error: false, message: "Thesis marks saved successfully" });
                });
            }
        });
    },

    //Finalize Marks for Students (set marks_finalize = 1 in both marks entry detail and registration tables)
    updateMarksFinalizeWithClub: function (dbkey, request, payload, sessionDetails, callback) {
        let tranObj, tranCallback;

        async.series([

            // Step 1: Start Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    if (err) return cback(err);
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback();
                });
            },

            // Step 2: Loop through each student record — only update marks_finalize
            function (cback) {
                async.eachSeries(payload, (student, cb) => {

                    // === Step 2.1: Update a_marks_entry_detail ===
                    const whereObj = {
                        registration_id: student.registration_id,
                        course_id: student.course_id,
                        exam_paper_type_id: student.exam_paper_type_id,
                        exam_type_id: student.exam_type_id,
                        academic_session_id: student.academic_session_id,
                        course_year_id: student.course_year_id,
                        course_semester_id: student.semester_id,
                        dean_committee_id: student.dean_committee_id,
                        ue_id: student.ue_id,
                        course_nature_id: student.course_nature_id,
                        college_id: student.college_id,
                        valuation_type_id: student.valuation_type_id
                    };

                    const updateObj = {
                        marks_finalize: 1,
                        action_by: sessionDetails.user_id,
                        action_ip_address: sessionDetails.ip_address,
                        action_type: "U",
                        action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                    };

                    const data = {
                        log_table_name: "app_log_a_marks_entry_detail",
                        update_table_name: "a_marks_entry_detail",
                        whereObj,
                        updateObj
                    };

                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, data, sessionDetails, function (err) {
                        if (err) return cb({ status: 500, message: "Error updating a_marks_entry_detail", error: err });

                        // === Step 2.2: Update a_student_registration_and_marks ===
                        const finalWhere = {
                            registration_id: student.registration_id,
                            course_id: student.course_id,
                            course_nature_id: student.course_nature_id
                        };

                        const finalUpdate = {
                            marks_finalize: 1,
                            action_by: sessionDetails.user_id,
                            action_ip_address: sessionDetails.ip_address,
                            action_type: "U",
                            action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                        };

                        const finalData = {
                            log_table_name: "app_log_a_student_registration_and_marks",
                            update_table_name: "a_student_registration_and_marks",
                            whereObj: finalWhere,
                            updateObj: finalUpdate
                        };

                        SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, finalData, sessionDetails, cb);
                    });

                }, cback);
            }

        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { error: false, message: "Marks finalized successfully" });
                });
            }
        });
    },

    updateMarksFinalizeInternal: function (dbkey, request, payload, sessionDetails, callback) {
        let tranObj, tranCallback;

        async.series([

            // Step 1: Start Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    if (err) return cback(err);
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback();
                });
            },

            // Step 2: Loop through each student record — update only a_marks_entry_detail
            function (cback) {
                async.eachSeries(payload, (student, cb) => {

                    // === Step 2.1: Update only a_marks_entry_detail ===
                    const whereObj = {
                        registration_id: student.registration_id,
                        course_id: student.course_id,
                        exam_paper_type_id: student.exam_paper_type_id,
                        exam_type_id: student.exam_type_id,
                        academic_session_id: student.academic_session_id,
                        course_year_id: student.course_year_id,
                        course_semester_id: student.semester_id,
                        dean_committee_id: student.dean_committee_id,
                        ue_id: student.ue_id,
                        course_nature_id: student.course_nature_id,
                        college_id: student.college_id,
                        valuation_type_id: student.valuation_type_id
                    };

                    const updateObj = {
                        marks_finalize: 1,
                        action_by: sessionDetails.user_id,
                        action_ip_address: sessionDetails.ip_address,
                        action_type: "U",
                        action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                    };

                    const data = {
                        log_table_name: "app_log_a_marks_entry_detail",
                        update_table_name: "a_marks_entry_detail",
                        whereObj,
                        updateObj
                    };

                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, data, sessionDetails, cb);

                }, cback);
            }

        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { error: false, message: "Internal marks finalized successfully" });
                });
            }
        });
    },

    updateMarksUnfinalizeWithClub: function (dbkey, request, payload, sessionDetails, callback) {
        let tranObj, tranCallback;

        async.series([

            // Step 1: Start Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    if (err) return cback(err);
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback();
                });
            },

            // Step 2: Loop through each student record — only update marks_finalize
            function (cback) {
                async.eachSeries(payload, (student, cb) => {

                    // === Step 2.1: Update a_marks_entry_detail ===
                    const whereObj = {
                        registration_id: student.registration_id,
                        course_id: student.course_id,
                        exam_paper_type_id: student.exam_paper_type_id,
                        exam_type_id: student.exam_type_id,
                        academic_session_id: student.academic_session_id,
                        course_year_id: student.course_year_id,
                        course_semester_id: student.semester_id,
                        dean_committee_id: student.dean_committee_id,
                        ue_id: student.ue_id,
                        course_nature_id: student.course_nature_id,
                        college_id: student.college_id,
                        valuation_type_id: student.valuation_type_id
                    };

                    const updateObj = {
                        marks_finalize: 4,
                        action_by: sessionDetails.user_id,
                        action_ip_address: sessionDetails.ip_address,
                        action_type: "U",
                        action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                    };

                    const data = {
                        log_table_name: "app_log_a_marks_entry_detail",
                        update_table_name: "a_marks_entry_detail",
                        whereObj,
                        updateObj
                    };

                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, data, sessionDetails, function (err) {
                        if (err) return cb({ status: 500, message: "Error updating a_marks_entry_detail", error: err });

                        // === Step 2.2: Update a_student_registration_and_marks ===
                        const finalWhere = {
                            registration_id: student.registration_id,
                            course_id: student.course_id,
                            course_nature_id: student.course_nature_id
                        };

                        const finalUpdate = {
                            marks_finalize: 4,
                            action_by: sessionDetails.user_id,
                            action_ip_address: sessionDetails.ip_address,
                            action_type: "U",
                            action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                        };

                        const finalData = {
                            log_table_name: "app_log_a_student_registration_and_marks",
                            update_table_name: "a_student_registration_and_marks",
                            whereObj: finalWhere,
                            updateObj: finalUpdate
                        };

                        SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, finalData, sessionDetails, cb);
                    });

                }, cback);
            }

        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { error: false, message: "Marks unfinalized successfully" });
                });
            }
        });
    },

    updateMarksUnfinalizeInternal: function (dbkey, request, payload, sessionDetails, callback) {
        let tranObj, tranCallback;

        async.series([

            // Step 1: Start Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    if (err) return cback(err);
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback();
                });
            },

            // Step 2: Loop through each student record — update only a_marks_entry_detail
            function (cback) {
                async.eachSeries(payload, (student, cb) => {

                    // === Step 2.1: Update only a_marks_entry_detail ===
                    const whereObj = {
                        registration_id: student.registration_id,
                        course_id: student.course_id,
                        exam_paper_type_id: student.exam_paper_type_id,
                        exam_type_id: student.exam_type_id,
                        academic_session_id: student.academic_session_id,
                        course_year_id: student.course_year_id,
                        course_semester_id: student.semester_id,
                        dean_committee_id: student.dean_committee_id,
                        ue_id: student.ue_id,
                        course_nature_id: student.course_nature_id,
                        college_id: student.college_id,
                        valuation_type_id: student.valuation_type_id
                    };

                    const updateObj = {
                        marks_finalize: 4,
                        action_by: sessionDetails.user_id,
                        action_ip_address: sessionDetails.ip_address,
                        action_type: "U",
                        action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                    };

                    const data = {
                        log_table_name: "app_log_a_marks_entry_detail",
                        update_table_name: "a_marks_entry_detail",
                        whereObj,
                        updateObj
                    };

                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, data, sessionDetails, cb);

                }, cback);
            }

        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { error: false, message: "Internal marks unfinalized successfully" });
                });
            }
        });
    },

    updateMarksFinalizethesis: function (dbkey, request, payload, sessionDetails, callback) {
        let tranObj, tranCallback;

        async.series([

            // Step 1: Start Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    if (err) return cback(err);
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback();
                });
            },

            // Step 2: Loop through each student record — update only a_marks_entry_detail
            function (cback) {
                async.eachSeries(payload, (student, cb) => {

                    // === Step 2.1: Update only a_marks_entry_detail ===
                    const whereObj = {
                        registration_id: student.registration_id,
                        course_id: student.course_id,
                        course_nature_id: student.course_nature_id
                    };

                    const updateObj = {
                        marks_finalize: student.marks_finalize,
                        action_by: sessionDetails.user_id,
                        action_ip_address: sessionDetails.ip_address,
                        action_type: "U",
                        action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                    };

                    const data = {
                        log_table_name: "app_log_a_student_registration_and_marks",
                        update_table_name: "a_student_registration_and_marks",
                        whereObj,
                        updateObj
                    };

                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, data, sessionDetails, cb);

                }, cback);
            }

        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { error: false, message: "Internal marks finalized successfully" });
                });
            }
        });
    },

    insertExportDataFireeye: function (dbkey, request, payload, sessionDetails, callback) {
        let tranObj, tranCallback;

        async.series([
            // Step 1: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    if (err) return cback({ status: 500, message: "Transaction creation failed", error: err });
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    cback();
                });
            },

            // Step 2: Get Next Batch ID
            function (cback) {
                const batchQuery = `
                SELECT COALESCE(MAX(CAST(SUBSTRING(export_batch_id, 6, 10) AS UNSIGNED)), 0) + 1 AS nextBatchNo  
                FROM export_data_for_fireeye_old
            `;
                dbkey.connectionobj.query(batchQuery, [], function (err, rows) {
                    if (err) return cback({ message: "Failed to get next batch ID", error: err });
                    const nextBatchNo = rows[0]?.nextBatchNo || 1;
                    payload.export_batch_id = "BATCH" + nextBatchNo.toString().padStart(3, "0");
                    cback();
                });
            },

            // Step 3: Run SELECT query
            function (cback) {
                const selectQuery = `
                SELECT reg.admission_session,
                   reg.registration_id,
                    reg.course_year_id,
                    reg.dean_committee_id,
                    reg.academic_session_id,
                    marks.course_id,
                    reg.ue_id,
                    reg.college_id,
                    reg.student_master_id,
                    reg.degree_programme_id,
                    reg.course_year_id,
                    reg.semester_id,
                    reg.section_id,
                    reg.exam_type_id,
                    reg.registration_status_id,
                    marks.course_registration_type_id,
                    marks.course_nature_id,
                    marks.remark_id,
                    marks.max_marks_internal,
                    marks.max_marks_external,
                    marks.final_marks,
                    marks.special_remark_id,
                    exm.exam_paper_type_id
                FROM a_student_registration_main reg
                INNER JOIN a_student_registration_and_marks marks 
                    ON marks.registration_id = reg.registration_id AND marks.delete_flag = 'N'
                INNER JOIN m_exam_paper_type exm 
                    ON exm.course_nature_id = marks.course_nature_id AND exm.delete_flag = 'N'
                LEFT JOIN export_data_for_fireeye_old ex 
                    ON ex.Academic_Session_Id = reg.academic_session_id 
                    AND ex.Registration_Id = marks.registration_id 
                    AND ex.semester_id = reg.semester_id 
                    AND ex.Course_Nature_ID = marks.course_nature_id 
                    AND ex.Course_Id = marks.course_id 
                    AND ex.Degree_Programme_Id = reg.degree_programme_id 
                INNER JOIN m_college c 
                    ON c.college_id = reg.college_id AND c.delete_flag = 'N'
                INNER JOIN m_dean_committee d 
                    ON d.dean_committee_id = reg.dean_committee_id AND d.delete_flag = 'N'
                INNER JOIN m_course_year cy 
                    ON cy.course_year_id = marks.course_year_id AND cy.delete_flag = 'N'
                WHERE reg.delete_flag = 'N'
                    AND reg.academic_session_id = ?
                    AND reg.semester_id = ?
                    AND exm.exam_paper_type_id = ?
                    AND reg.degree_programme_id = ?
                    AND reg.dean_committee_id = ?
                    AND reg.course_year_id = ?
                    AND ex.SrNo IS NULL
                ORDER BY marks.course_year_id, reg.dean_committee_id
            `;

                const params = [
                    payload.academic_session_id,
                    payload.semester_id,
                    payload.exam_paper_type_id,
                    payload.degree_programme_id,
                    payload.dean_committee_id,
                    payload.course_year_id
                ];

                dbkey.connectionobj.query(selectQuery, params, function (err, rows) {
                    if (err) return cback({ message: "Data fetch failed", error: err });
                    if (!rows || rows.length === 0) return cback({ message: "No data found for insertion" });

                    payload.resultRows = rows;
                    cback();
                });
            },

            // Step 4: Insert into export_data_for_fireeye using getMultInsertTogetherWithParams
            // Step 4: Insert into export_data_for_fireeye using validateAndInsertArrInTable
            function (cback) {
                if (!payload.resultRows || payload.resultRows.length === 0)
                    return cback({ message: "No rows available for insert" });
                console.log('payloads', payload.resultRows);

                // Prepare data array for insertion
                const dataArr = payload.resultRows.map(student => ({
                    admission_session: student.admission_session,
                    course_year_id: student.course_year_id,
                    dean_committee_id: student.dean_committee_id,
                    academic_session_id: student.academic_session_id,
                    registration_id: student.registration_id,
                    course_id: student.course_id,
                    ue_id: student.ue_id,
                    college_id: student.college_id,
                    student_master_id: student.student_master_id,
                    degree_programme_id: student.degree_programme_id,
                    semester_id: student.semester_id,
                    exam_type_id: student.exam_type_id,
                    registration_status_id: student.registration_status_id,
                    course_registration_type_id: student.course_registration_type_id,
                    course_nature_id: student.course_nature_id,
                    remark_id: student.remark_id,
                    max_marks_external: student.max_marks_external,
                    max_marks_internal: student.max_marks_internal,
                    final_marks: student.final_marks,
                    special_remark_id: student.special_remark_id,
                    exam_paper_type_id: student.exam_paper_type_id,
                    answerbook_no: null,
                    export_batch_id: payload.export_batch_id,
                    created_user_id: sessionDetails.emp_id,
                    created_ip_address: sessionDetails.ip_address,
                    action_type: "C",
                    active_status: "Y"
                }));

                const insertObj = {
                    table_name: "export_data_for_fireeye_old",
                    data_arr: dataArr
                };
                console.log('start time', (new Date()).getTime());

                SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insertObj, sessionDetails, function (err, res) {
                    if (err) return cback({ message: "Insert failed", error: err });
                    console.log('end time ', (new Date()).getTime());
                    payload.insertedCount = dataArr.length;
                    cback();
                });
            }


        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    callback(null, {
                        error: true,
                        message: err.message || "Transaction failed",
                        details: err.error || null
                    });
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    callback(null, {
                        error: false,
                        message: `✅ Successfully inserted ${payload.insertedCount} rows into batch ${payload.export_batch_id}`
                    });
                });
            }
        });
    }
    ,
    // UPDATE VALIDATED DATA(MARKS) FROM FIREEYE BACK TO EXPORTED DATA TABLE
    updateValidatedMarksfromFireEyeTempToExported: function (dbkey, request, payload, sessionDetails, callback) {
        let tranObj, tranCallback;

        async.series([

            // Step 1: Start Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    if (err) return cback(err);
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback();
                });
            },

            // Step 2: Loop through each student record — update only a_marks_entry_detail
            function (cback) {
                async.eachSeries(payload.updatedRecords, (student, cb) => {

                    // === Step 2.1: Update only a_marks_entry_detail ===
                    const whereObj = {
                        registration_id: student.registration_id,
                        course_id: student.course_id,
                        course_nature_id: student.course_nature_id,
                        academic_session_id: student.academic_session_id,
                        semester_id: student.semester_id,
                        exam_paper_type_id: student.exam_paper_type_id,
                        degree_programme_id: student.degree_programme_id,
                        dean_committee_id: student.dean_committee_id,
                        course_year_id: student.course_year_id,
                        ue_id: student.ue_id,
                    };

                    const updateObj = {
                        final_marks: student.final_marks,
                        action_by: sessionDetails.user_id,
                        action_ip_address: sessionDetails.ip_address,
                        action_type: "U",
                        action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                    };


                    const data = {
                        log_table_name: "app_log_export_data_for_fireeye_old",
                        update_table_name: "export_data_for_fireeye_old",
                        whereObj,
                        updateObj
                    };

                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, data, sessionDetails, cb);

                }, cback);
            }

        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { error: false, message: "Data Updated Succesfully successfully" });
                });
            }
        });
    },

    // MARKS IMPORT FROM CSV TO FIREEYE TEMP TABLE TABLE
    importStudentsMarksData: async function (dbkey, request, params, sessionDetails, callback) {
        try {
            console.log("📥 File upload request received");

            if (!request.files || !request.files.file) {
                console.error("❌ No file found in request.files");
                return callback({ status: 400, message: "No file uploaded" });
            }

            const file = request.files.file;
            console.log("📄 Uploaded file name:", file.name);
            console.log("📦 Uploaded file size:", file.size);

            // Step 1: Define temp file path (stay in same folder)
            const tempFilePath = path.join(__dirname, file.name);
            console.log("🛣️ Using temp file path:", tempFilePath);

            // Step 2: Write file buffer to temp path (required for MariaDB)
            await fs.promises.writeFile(tempFilePath, file.data);
            console.log("✅ File temporarily written for import");

            // Step 3: Database transaction logic
            let tranObj, tranCallback;

            async.series(
                [
                    // Step 3.1: Create Transaction
                    function (cback) {
                        DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                            if (err) return cback({ status: 500, message: "Transaction creation failed", error: err });
                            tranObj = tranobj;
                            tranCallback = trancallback;
                            dbkey = { dbkey: dbkey, connectionobj: tranObj };
                            cback();
                        });
                    },

                    // Step 3.2: Load CSV data into temp_marks table
                    function (cback) {
                        const tableName = "import_data_from_fireeye";
                        const query = `
              LOAD DATA LOCAL INFILE ?
              INTO TABLE ${tableName}
              FIELDS TERMINATED BY ','
              ENCLOSED BY '"'
              LINES TERMINATED BY '\\n'
              IGNORE 1 ROWS
              (id,
                export_batch_id,
                admission_session,
                registration_id,
                course_year_id,
                dean_committee_id,
                academic_session_id,
                course_id,
                ue_id,
                college_id,
                student_master_id,
                degree_programme_id,
                semester_id,
                section_id,
                exam_type_id,
                registration_status_id,
                course_registration_type_id,
                course_nature_id,
                remark_id,
                max_marks_internal,
                max_marks_external,
                special_remark_id,
                final_marks,
                exam_paper_type_id)
            `;

                        console.log("🧾 Executing MariaDB LOAD DATA from:", tempFilePath);

                        dbkey.connectionobj.query(query, [tempFilePath], function (err, result) {
                            if (err) return cback({ message: "DB import failed", error: err });
                            console.log("✅ DB import successful:", result.affectedRows, "rows inserted");
                            params.importedCount = result.affectedRows;
                            cback();
                        });
                    },
                ],
                function (err) {
                    // Clean up temp file always
                    fs.unlink(tempFilePath, (delErr) => {
                        if (delErr) console.warn("⚠️ Failed to delete temp file:", delErr);
                        else console.log("🧹 Temp file deleted successfully");
                    });

                    if (err) {
                        console.error("❌ Error occurred:", err);
                        DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                            callback(null, {
                                error: true,
                                message: err.message || "Transaction failed",
                                details: err.error || null,
                            });
                        });
                    } else {
                        DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                            callback(null, {
                                error: false,
                                message: `✅ Successfully imported ${params.importedCount} records from file ${file.name}`,
                            });
                        });
                    }
                }
            );
        } catch (err) {
            console.error("🔥 Unexpected server error:", err);
            callback({ status: 500, message: "Internal server error", error: err });
        }
    },

    //SAVE FIRE-EYE STUDENTS MARKS WITH CLUB
    marksEntryFromFireData: function (dbkey, request, payload, sessionDetails, callback) {
        let tranObj, tranCallback;

        async.series([
            // Step 1: Start Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    if (err) return cback({ status: 500, message: "Transaction creation failed", error: err });
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    cback();
                });
            },

            // Step 2: Execute UPDATE query
            function (cback) {
                const updateQuery = `
                UPDATE a_student_registration_and_marks AS marks
            JOIN (
                SELECT 
                    reg.registration_id,
                    marks.course_id,
                    marks.course_nature_id,
                    CASE 
                        WHEN med_e.remark_id = 15 THEN 4  
                        WHEN ((marks.max_marks_internal + marks.max_marks_external)/2) <= (med_i.obtained_mark + med_e.final_marks) THEN 1 
                        ELSE 2 
                    END AS remark_id,
                    med_i.obtained_mark + med_e.final_marks AS final_marks
                FROM a_student_registration_main reg
                INNER JOIN a_student_master sm 
                    ON sm.ue_id = reg.ue_id AND sm.admission_session = reg.admission_session
                INNER JOIN a_student_registration_and_marks marks 
                    ON reg.registration_id = marks.registration_id
                LEFT JOIN (
                    SELECT registration_id, course_id, course_nature_id,
                        MAX(CASE WHEN exam_paper_type_id IN (6,5,11) AND valuation_type_id = 1 THEN obtained_mark END) AS obtained_mark,
                        MAX(CASE WHEN exam_paper_type_id IN (6,5,11) AND valuation_type_id = 1 THEN remark_id END) AS remark_id,
                        MAX(CASE WHEN exam_paper_type_id IN (6,5,11) AND valuation_type_id = 1 THEN special_remark_id END) AS special_remark_id,
                        med1.marks_finalize,
                        med1.marks_entry_detail_id  
                    FROM a_marks_entry_detail med1
                    WHERE med1.delete_flag = 'N' 
                        AND med1.academic_session_id = ?
                        AND med1.course_semester_id = ?
                        AND med1.exam_paper_type_id = ?
                    GROUP BY registration_id, course_id
                ) med_i 
                    ON med_i.registration_id = reg.registration_id 
                    AND med_i.course_id = marks.course_id 
                    AND med_i.course_nature_id = marks.course_nature_id
                LEFT JOIN (
                    SELECT registration_id, course_id, course_nature_id,
                        MAX(CASE WHEN exam_paper_type_id IN (9,12) THEN final_marks END) AS final_marks,
                        MAX(CASE WHEN exam_paper_type_id IN (9,12) THEN remark_id END) AS remark_id
                    FROM export_data_for_fireeye_old med1
                    WHERE med1.academic_session_id = ?
                        AND med1.semester_id = ?
                        AND med1.exam_paper_type_id = ?
                    GROUP BY registration_id, course_id
                ) med_e 
                    ON med_e.registration_id = reg.registration_id 
                    AND med_e.course_id = marks.course_id 
                    AND med_e.course_nature_id = marks.course_nature_id
                WHERE reg.delete_flag = 'N' 
                    AND marks.delete_flag = 'N' 
                    AND reg.academic_session_id = ?
                    AND reg.semester_id = ?
                    AND marks.course_nature_id = ?
                    AND reg.exam_type_id = ?
            ) AS src 
            ON marks.registration_id = src.registration_id 
            AND marks.course_id = src.course_id
            AND marks.course_nature_id = src.course_nature_id
            SET 
                marks.final_marks = src.final_marks,
                marks.remark_id = src.remark_id;
                `;

                const params = [
                    // med_i subquery
                    payload.academic_session_id,
                    payload.course_semester_id,
                    payload.int_exam_paper_type_id,

                    // med_e subquery
                    payload.academic_session_id2,
                    payload.semester_id,
                    payload.ext_exam_paper_type_id,

                    // main query
                    payload.academic_session_id3,
                    payload.semester_id2,
                    payload.course_nature_id,
                    payload.exam_type_id
                    // 24, 1, 6,24, 1, 9,24, 1, 1, 1
                ];

                dbkey.connectionobj.query(updateQuery, params, function (err) {
                    if (err) return cback({ status: 500, message: "Update query failed", error: err });
                    cback();
                });
            },

            // Step 3: Execute INSERT query
            function (cback) {
                const insertQuery = `
                INSERT INTO a_marks_entry_detail (
                    ue_id,
                    student_master_id,
                    registration_id,
                    course_id,
                    college_id,
                    degree_programme_id,
                    course_nature_id,
                    course_semester_id,
                    student_semester_id,
                    course_year_id,
                    student_course_year_id,
                    exam_type_id,
                    valuation_type_id,
                    academic_session_id,
                    dean_committee_id,
                    remark_id,
                    obtained_mark,
                    exam_paper_type_id
                )
                -- INTERNAL RECORDS (exam_paper_type_id = 6)
                            
                    
    SELECT 
        reg.ue_id,
        reg.ue_id AS student_master_id,
        reg.registration_id,
        marks.course_id,
        reg.college_id,
        reg.degree_programme_id,
        marks.course_nature_id,
        reg.semester_id AS course_semester_id,
        reg.semester_id AS student_semester_id,
        reg.course_year_id,
        reg.course_year_id AS student_course_year_id,
        reg.exam_type_id ,
        1 as valuation_type_id,
        reg.academic_session_id,
        reg.dean_committee_id,
        CASE 
            WHEN med_e.remark_id = 15 THEN 4  
            WHEN ((marks.max_marks_internal + marks.max_marks_external)/2) <= (med_i.obtained_mark + med_e.final_marks) THEN 1 
            ELSE 2 
        END AS remark_id,
        med_i.obtained_mark + med_e.final_marks AS obtained_mark,
    --  (marks.max_marks_internal + marks.max_marks_external)/2 AS passing,
        1 AS exam_paper_type_id       -- 👈 For CLUBBED row
    --   'CLUBBED' AS record_type
    FROM a_student_registration_main reg
    INNER JOIN a_student_master sm 
        ON sm.ue_id = reg.ue_id AND sm.admission_session = reg.admission_session
    INNER JOIN a_student_registration_and_marks marks 
        ON reg.registration_id = marks.registration_id
    LEFT JOIN (
    SELECT registration_id, course_id, course_nature_id,
        MAX(CASE WHEN exam_paper_type_id IN (6,5,11) AND valuation_type_id = 1 THEN obtained_mark END) AS obtained_mark,
        MAX(CASE WHEN exam_paper_type_id IN (6,5,11) AND valuation_type_id = 1 THEN remark_id END) AS remark_id,
        MAX(CASE WHEN exam_paper_type_id IN (6,5,11) AND valuation_type_id = 1 THEN special_remark_id END) AS special_remark_id,
        med1.marks_finalize,
        med1.marks_entry_detail_id  
    FROM a_marks_entry_detail med1
    WHERE med1.delete_flag = 'N' 
        AND med1.academic_session_id = ?
        AND med1.course_semester_id = ?
        AND med1.exam_paper_type_id = ?
    GROUP BY registration_id, course_id
    ) med_i 
    ON med_i.registration_id = reg.registration_id 
    AND med_i.course_id = marks.course_id 
    AND med_i.course_nature_id = marks.course_nature_id
    LEFT JOIN (
    SELECT registration_id, course_id, course_nature_id,
        MAX(CASE WHEN exam_paper_type_id IN (9,12) THEN final_marks END) AS final_marks,
        MAX(CASE WHEN exam_paper_type_id IN (9,12) THEN remark_id END) AS remark_id
    FROM export_data_for_fireeye_old med1
    WHERE med1.academic_session_id = ?
        AND med1.semester_id = ?
        AND med1.exam_paper_type_id = ?
    GROUP BY registration_id, course_id
    ) med_e 
    ON med_e.registration_id = reg.registration_id 
    AND med_e.course_id = marks.course_id 
    AND med_e.course_nature_id = marks.course_nature_id
    WHERE reg.delete_flag = 'N' 
    AND marks.delete_flag = 'N' 
    AND reg.academic_session_id = ?
    AND reg.semester_id = ?
    AND marks.course_nature_id = ?
    AND reg.exam_type_id = ?

    UNION ALL

    -- EXTERNAL ROW
    SELECT 
        reg.ue_id,
        reg.ue_id AS student_master_id,
        reg.registration_id,
        marks.course_id,
        reg.college_id,
        reg.degree_programme_id,
        marks.course_nature_id,
    --
        reg.semester_id AS course_semester_id,
        reg.semester_id AS student_semester_id,
        reg.course_year_id,
        reg.course_year_id AS student_course_year_id,
        reg.exam_type_id ,
        1 as valuation_type_id,
        reg.academic_session_id,
        reg.dean_committee_id,
        med_e.remark_id AS remark_id,
        med_e.final_marks as obtained_mark,
    -- (marks.max_marks_internal + marks.max_marks_external)/2 AS passing,
        9 AS exam_paper_type_id      -- 👈 For EXTERNAL row
    --   'EXTERNAL' AS record_type
    FROM a_student_registration_main reg
    INNER JOIN a_student_master sm 
        ON sm.ue_id = reg.ue_id AND sm.admission_session = reg.admission_session
    INNER JOIN a_student_registration_and_marks marks 
        ON reg.registration_id = marks.registration_id
    LEFT JOIN (
    SELECT registration_id, course_id, course_nature_id,
        MAX(CASE WHEN exam_paper_type_id IN (6,5,11) AND valuation_type_id = 1 THEN obtained_mark END) AS obtained_mark,
        MAX(CASE WHEN exam_paper_type_id IN (6,5,11) AND valuation_type_id = 1 THEN remark_id END) AS remark_id,
        MAX(CASE WHEN exam_paper_type_id IN (6,5,11) AND valuation_type_id = 1 THEN special_remark_id END) AS special_remark_id,
        med1.marks_finalize,
        med1.marks_entry_detail_id  
    FROM a_marks_entry_detail med1
    WHERE med1.delete_flag = 'N' 
        AND med1.academic_session_id = ?
        AND med1.course_semester_id = ?
        AND med1.exam_paper_type_id = ?
    GROUP BY registration_id, course_id
    ) med_i 
    ON med_i.registration_id = reg.registration_id 
    AND med_i.course_id = marks.course_id 
    AND med_i.course_nature_id = marks.course_nature_id
    LEFT JOIN (
    SELECT registration_id, course_id, course_nature_id,
        MAX(CASE WHEN exam_paper_type_id IN (9,12) THEN final_marks END) AS final_marks,
        MAX(CASE WHEN exam_paper_type_id IN (9,12) THEN remark_id END) AS remark_id
    FROM export_data_for_fireeye_old med1
    WHERE med1.academic_session_id = ?
        AND med1.semester_id = ?
        AND med1.exam_paper_type_id = ?
    GROUP BY registration_id, course_id
    ) med_e 
    ON med_e.registration_id = reg.registration_id 
    AND med_e.course_id = marks.course_id 
    AND med_e.course_nature_id = marks.course_nature_id
    WHERE reg.delete_flag = 'N' 
    AND marks.delete_flag = 'N' 
    AND reg.academic_session_id = ?
    AND reg.semester_id = ?
    AND marks.course_nature_id = ?
    AND reg.exam_type_id = ?;


            `;

                const params = [
                    // First part (CLUBBED) - med_i subquery
                    payload.academic_session_id,
                    payload.course_semester_id,
                    payload.int_exam_paper_type_id,

                    // First part (CLUBBED) - med_e subquery
                    payload.academic_session_id2,
                    payload.semester_id,
                    payload.ext_exam_paper_type_id,

                    // First part (CLUBBED) - main query
                    payload.academic_session_id3,
                    payload.semester_id2,
                    payload.course_nature_id,
                    payload.exam_type_id,

                    // Second part (EXTERNAL) - med_i subquery
                    payload.academic_session_id,
                    payload.course_semester_id,
                    payload.int_exam_paper_type_id,

                    // Second part (EXTERNAL) - med_e subquery
                    payload.academic_session_id2,
                    payload.semester_id,
                    payload.ext_exam_paper_type_id,

                    // Second part (EXTERNAL) - main query
                    payload.academic_session_id3,
                    payload.semester_id2,
                    payload.course_nature_id,
                    payload.exam_type_id
                    // 24, 1, 6,
                    // 24, 1, 9,
                    // 24, 1, 1, 1,

                    // 24, 1, 6,
                    // 24, 1, 9,
                    // 24, 1, 1, 1
                ];

                dbkey.connectionobj.query(insertQuery, params, function (err, result) {
                    if (err) {
                        console.error("Insert query error:", err);
                        return cback({ status: 500, message: "Insert query failed", error: err });
                    }
                    console.log("Insert successful, affected rows:", result.affectedRows);
                    cback();
                });
            }

        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    callback(null, { error: true, message: err.message || "Server error", details: err.error || null });
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    callback(null, { error: false, message: "Student marks updated and inserted successfully" });
                });
            }
        });
    }


}



module.exports = attendance
