var DB_SERVICE = global.DB_SERVICE;
var securityService = global.COMMON_SECURITY_SERVICE;
const SHARED_SERVICE = global.SHARED_SERVICE;
var async = require('async');
const { log } = require('handlebars');
let format = require('date-format');

let src = {
//      insertStudentListTempTablForSrcGenrt: function (dbkey, request, selectedStudents, sessionDetails, callback) {
//     let tranObj, tranCallback;

//     async.series([

//         // 🔹 Step 1: Start Transaction
//         function (cback) {
//             DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
//                 if (err) return cback(err);
//                 tranObj = tranobj;
//                 tranCallback = trancallback;
//                 dbkey = { dbkey: dbkey, connectionobj: tranObj };
//                 return cback();
//             });
//         },

//         // 🔹 Step 2: Insert Each Row in src_student_temp
//         function (cback2) {
//             async.eachSeries(selectedStudents, function (studentRow, cb) {
                
//                 let insert_obj = {
//                     table_name: 'src_student_temp',
//                     academic_session_id: studentRow.academic_session_id,
//                     college_id: studentRow.college_id,
//                     course_year_id: studentRow.course_year_id,
//                     dean_committee_id: studentRow.dean_committee_id,
//                     semester_id: studentRow.semester_id,
//                     exam_type_id: studentRow.exam_type_id,
//                     ue_id: studentRow.ue_id,
//                     registration_id:studentRow.registration_id,


//                     // Optional metadata (uncomment if needed)
//                     // created_user_id: sessionDetails.user_id,
//                     // created_ip_address: sessionDetails.ip_address
//                 };

//                 SHARED_SERVICE.validateAndInsertInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
//                     if (err) return cb(err);
//                     else if (res.data && res.data['insertId']) {
//                         // studentRow.allotment_detail_id = res.data['insertId'];
//                         return cb();
//                     } else {
//                         return cb({ message: 'Something went wrong inserting into src_student_temp' });
//                     }
//                 });

//             }, function (err) {
//                 return cback2(err);
//             });
//         }

//     ], function (err) {
//         // 🔹 Step 3: Transaction Commit or Rollback
//         if (err) {
//             DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
//                 return callback({
//                     error: true,
//                     message: '❌ Transaction rolled back: Insert failed',
//                     details: err
//                 });
//             });
//         } else {
//             DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
//                 return callback(null, {
//                     error: false,
//                     message: '✅ SRC Detail inserted successfully',
//                     insertedRows: selectedStudents.studentRow
//                 });
//             });
//         }
//     });
// },

insertStudentListTempTablForSrcGenrt: function (dbkey, request, selectedStudents, sessionDetails, callback) {
    let tranObj, tranCallback;

    async.series([

        // 🔹 Step 1: Start Transaction
        function (cback) {
            DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                if (err) return cback(err);
                tranObj = tranobj;
                tranCallback = trancallback;
                dbkey = { dbkey: dbkey, connectionobj: tranObj };
                return cback();
            });
        },

        // 🔹 Step 2: DELETE Existing Records (Before Insert)
        function (cback1) {

            async.eachSeries(selectedStudents, function (studentRow, cbDel) {

                let deleteSql = `
                    DELETE FROM src_student_temp
                    WHERE delete_flag = ?
                      AND action_type = ?
                `;

                let params = [
                    'N',
                   'C'
                ];

                dbkey.connectionobj.query(deleteSql, params, function (err, result) {
                    if (err) return cbDel(err);
                    return cbDel();
                });

            }, function (err) {
                return cback1(err);
            });

        },

        // 🔹 Step 3: Insert Each Row in src_student_temp
        function (cback2) {
            async.eachSeries(selectedStudents, function (studentRow, cb) {
                
                let insert_obj = {
                    table_name: 'src_student_temp',
                    academic_session_id: studentRow.academic_session_id,
                    college_id: studentRow.college_id,
                    course_year_id: studentRow.course_year_id,
                    dean_committee_id: studentRow.dean_committee_id,
                    semester_id: studentRow.semester_id,
                    exam_type_id: studentRow.exam_type_id,
                    ue_id: studentRow.ue_id,
                    registration_id: studentRow.registration_id
                };

                SHARED_SERVICE.validateAndInsertInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                    if (err) return cb(err);
                    else if (res.data && res.data['insertId']) {
                        return cb();
                    } else {
                        return cb({ message: 'Something went wrong inserting into src_student_temp' });
                    }
                });

            }, function (err) {
                return cback2(err);
            });
        }

    ], function (err) {

        // 🔹 Step 4: Commit / Rollback
        if (err) {
            DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                return callback({
                    error: true,
                    message: '❌ Transaction rolled back: Delete/Insert failed',
                    details: err
                });
            });
        } else {
            DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                return callback(null, {
                    error: false,
                    message: '✅ SRC Detail inserted successfully'
                });
            });
        }
    });
},




// bulkSRCGenerate: function (dbkey, request, filters, sessionDetails, callback) {
//     let tranObj, tranCallback;

//     async.series([
//         // Step 1: Start Transaction
//         function (cback) {
//             DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
//                 if (err) return cback({ status: 500, message: "Transaction creation failed", error: err });
//                 tranObj = tranobj;
//                 tranCallback = trancallback;
//                 dbkey = { dbkey: dbkey, connectionobj: tranObj };
//                 cback();
//             });
//         },

//         // Step 2: Fetch student list for SRC insertion
//         function (cback) {
//             const selectQuery = `
//                 SELECT 
//                     srm.ue_id,
//                     srm.student_master_id AS student_id,
//                     1 AS univ_id,
//                     CONCAT(
//                         sm.student_first_name_e, ' ',
//                         IFNULL(sm.student_middle_name_e, ''), ' ',
//                         IFNULL(sm.student_last_name_e, '')
//                     ) AS student_name,
//                     srm.academic_session_id,
//                     srm.college_id,
//                     srm.degree_programme_id,
//                     srm.course_year_id,
//                     srm.exam_type_id,
//                     srm.semester_id,
//                     srm.registration_id,
//                     NULL AS reglr_total_cr_x,
//                     NULL AS reglr_gradepoint_a,
//                     NULL AS gpa,
//                     NULL AS prev_fail_total_cr_z,
//                     NULL AS prev_fail_gp_c,
//                     NULL AS previous_total_cr_y,
//                     NULL AS previous_total_gp_b,
//                     NULL AS cumulative_cr,
//                     NULL AS cumulative_gp,
//                     NULL AS percentage,
//                     NULL AS result,
//                     NULL AS generate_flag
//                 FROM a_student_registration_main srm
//                 INNER JOIN a_student_master sm ON srm.ue_id = sm.ue_id  
//                 INNER JOIN src_student_temp sst ON sst.registration_id = srm.registration_id
//                 WHERE srm.academic_session_id = ?
//                   AND srm.college_id = ?
//                   AND srm.course_year_id = ?
//                   AND srm.semester_id = ?
//                   AND srm.delete_flag = 'N'
//                   AND sm.delete_flag = 'N'
//                   AND srm.exam_type_id = ?;
//             `;

//             const params = [
//                 filters.academic_session_id,
//                 filters.college_id,
//                 filters.course_year_id,
//                 filters.semester_id,
//                 filters.exam_type_id
//             ];

//             dbkey.connectionobj.query(selectQuery, params, function (err, rows) {
//                 if (err) return cback({ status: 500, message: "Error fetching student data", error: err });
//                 if (!rows || rows.length === 0) return cback({ status: 404, message: "No students found" });
//                 filters.selectedStudents = rows;
//                 cback();
//             });
//         },

//         // Step 3: Insert into a_src_main
//         function (cback) {
//             const selectedStudents = filters.selectedStudents;

//             async.eachSeries(selectedStudents, function (student, cb) {
//                 const insertObj = {
//                     table_name: 'a_src_main',
//                     data_arr: [{
//                         ue_id: student.ue_id,
//                         univ_id: student.univ_id,
//                         student_id: student.student_id,
//                         student_name: student.student_name,
//                         academic_session_id: student.academic_session_id,
//                         college_id: student.college_id,
//                         degree_programme_id: student.degree_programme_id,
//                         course_year_id: student.course_year_id,
//                         exam_type_id: student.exam_type_id,
//                         semester_id: student.semester_id,
//                         registration_id: student.registration_id,
//                         reglr_total_cr_x: student.reglr_total_cr_x,
//                         reglr_gradepoint_a: student.reglr_gradepoint_a,
//                         gpa: student.gpa,
//                         prev_fail_total_cr_z: student.prev_fail_total_cr_z,
//                         prev_fail_gp_c: student.prev_fail_gp_c,
//                         previous_total_cr_y: student.previous_total_cr_y,
//                         previous_total_gp_b: student.previous_total_gp_b,
//                         cumulative_cr: student.cumulative_cr,
//                         cumulative_gp: student.cumulative_gp,
//                         percentage: student.percentage,
//                         result: student.result,
//                         generate_flag: student.generate_flag
//                     }]
//                 };

//                 SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insertObj, sessionDetails, function (err, res) {
//                     if (err) return cb(err);
//                     else if (res.data && res.data['affectedRows']) return cb();
//                     else return cb({ message: 'Failed to insert into a_src_main' });
//                 });
//             }, cback);
//         },

//         // Step 4: Fetch course data
//         function (cback) {
//             const courseQuery = `
//                 SELECT  
//                     sram.course_id,
//                     srm.date_of_viva,
//                     srm.thesis_title,
//                     sram.course_type_id,
//                     sram.credit_nature_id,
//                     src.src_main_id,
//                     NULL AS total_credit,
//                     'N' AS prev_fail_course_yn,
//                     NULL AS ogpa_improvement
//                 FROM a_student_registration_main srm
//                 INNER JOIN a_student_registration_and_marks sram ON srm.registration_id = sram.registration_id
//                 INNER JOIN m_course_master_main cm ON sram.course_id = cm.course_id AND cm.delete_flag = 'N'
//                 INNER JOIN a_src_main src ON src.registration_id = srm.registration_id AND src.delete_flag = 'N'
//                 INNER JOIN src_student_temp sst ON sst.registration_id = srm.registration_id
//                 WHERE srm.academic_session_id = ?
//                   AND srm.course_year_id = ?
//                   AND srm.semester_id = ?
//                   AND srm.exam_type_id = ?
//                   AND srm.college_id = ?
//                   AND srm.delete_flag = 'N'
//                   AND sram.delete_flag = 'N';
//             `;

//             const params = [
//                 filters.academic_session_id,
//                 filters.course_year_id,
//                 filters.semester_id,
//                 filters.exam_type_id,
//                 filters.college_id
//             ];

//             dbkey.connectionobj.query(courseQuery, params, function (err, rows) {
//                 if (err) return cback({ status: 500, message: "Error fetching course data", error: err });
//                 if (!rows || rows.length === 0) return cback({ status: 404, message: "No course data found" });
//                 filters.courseData = rows;
//                 cback();
//             });
//         },

//         // Step 5: Insert into a_src_coursemain
//         function (cback) {
//             const courseData = filters.courseData;

//             async.eachSeries(courseData, function (course, cb) {
//                 const insertObj = {
//                     table_name: 'a_src_coursemain',
//                     data_arr: [{
//                         src_main_id: course.src_main_id,
//                         course_id: course.course_id,
//                         course_type_id: course.course_type_id,
//                         credit_nature_id: course.credit_nature_id,
//                         total_credit: Number(course.total_credit) || 0,
//                         prev_fail_course_yn: course.prev_fail_course_yn,
//                         ogpa_improvement: course.ogpa_improvement,
//                         thesis_title: course.thesis_title,
//                         date_of_viva: course.date_of_viva
//                     }]
//                 };

//                 SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insertObj, sessionDetails, function (err, res) {
//                     if (err) return cb(err);
//                     else if (res.data && res.data['affectedRows']) return cb();
//                     else return cb({ message: 'Failed to insert into a_src_coursemain' });
//                 });
//             }, cback);
//         },

//         // ✅ Step 6: Fetch and insert into a_src_coursedetail
//         function (cback) {
//             const courseDetailQuery = `
//                 SELECT  
//                     src_cm.src_coursemain_id,
//                     src.src_main_id,
//                     sram.course_nature_id,
//                     sram.credits,
//                     sram.max_marks_external,
//                     sram.min_marks,
//                     sram.final_marks,
//                     CASE 
//                         WHEN sram.remark_id = 8 AND sram.course_nature_id = 1 THEN 9
//                         WHEN sram.remark_id = 8 AND sram.course_nature_id = 2 THEN 10
//                         ELSE sram.remark_id 
//                     END AS remark_id,
//                     CASE 
//                         WHEN sram.remark_id = 8 THEN 8
//                         WHEN sram.remark_id = 7 THEN 7
//                         WHEN sram.remark_id = 4 THEN 8
//                         WHEN sram.remark_id = 5 THEN 8
//                         ELSE NULL 
//                     END AS grade_s_us,
//                     sram.special_remark_id,
//                     sram.passed_by_grace,
//                     sram.course_registration_type_id
//                 FROM a_student_registration_main srm
//                 INNER JOIN a_student_registration_and_marks sram ON srm.registration_id = sram.registration_id
//                 INNER JOIN a_src_main src ON src.registration_id = srm.registration_id AND src.delete_flag = 'N'
//                 INNER JOIN a_src_coursemain src_cm ON src_cm.src_main_id = src.src_main_id 
//                     AND src_cm.delete_flag = 'N' 
//                     AND src_cm.course_id = sram.course_id
//                 INNER JOIN src_student_temp sst ON sst.registration_id = srm.registration_id
//                 WHERE srm.academic_session_id = ?
//                   AND srm.course_year_id = ?
//                   AND srm.semester_id = ?
//                   AND srm.exam_type_id = ?
//                   AND srm.delete_flag = 'N'
//                   AND sram.delete_flag = 'N';
//             `;

//             const params = [
//                 filters.academic_session_id,
//                 filters.course_year_id,
//                 filters.semester_id,
//                 filters.exam_type_id
//             ];

//             dbkey.connectionobj.query(courseDetailQuery, params, function (err, rows) {
//                 if (err) return cback({ status: 500, message: "Error fetching course detail data", error: err });
//                 if (!rows || rows.length === 0) return cback({ status: 404, message: "No course detail data found" });

//                 async.eachSeries(rows, function (detail, cb) {
//                     const insertObj = {
//                         table_name: 'a_src_coursedetail',
//                         data_arr: [{
//                             src_coursemain_id: detail.src_coursemain_id,
//                             src_main_id: detail.src_main_id,
//                             course_nature_id: detail.course_nature_id,
//                             credit: detail.credits,
//                             maxmark_mm: detail.max_marks_external,
//                             min_marks: detail.min_marks,
//                             marksobtained_mo: detail.final_marks,
//                             remark_id: detail.remark_id,
//                             grade_s_us: detail.grade_s_us,
//                             special_remark_id: detail.special_remark_id,
//                             passed_by_grace: detail.passed_by_grace,
//                             course_reg_type_id: detail.course_registration_type_id
//                         }]
//                     };

//                     SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insertObj, sessionDetails, cb);
//                 }, cback);
//             });
//         }

//     ], function (err) {
//         // Step 7: Commit or Rollback
//         if (err) {
//             DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
//                 callback(null, { error: true, message: err.message || "Server error", details: err.error || null });
//             });
//         } else {
//             DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
//                 callback(null, { error: false, message: "✅ Student, Course & Course Detail data inserted successfully into SRC tables" });
//             });
//         }
//     });
// },

// bulkSRCGenerate_1: function (dbkey, request, filters, sessionDetails, callback) {
//     let tranObj, tranCallback;

//     async.series([
//         // Step 1: Start Transaction
//         function (cback) {
//             DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
//                 if (err) return cback({ status: 500, message: "Transaction creation failed", error: err });
//                 tranObj = tranobj;
//                 tranCallback = trancallback;
//                 dbkey = { dbkey: dbkey, connectionobj: tranObj };
//                 cback();
//             });
//         },

//         // Step 2: Fetch student list for SRC insertion
//         function (cback) {
//             const selectQuery = `
//                 SELECT 
//                     srm.ue_id,
//                     srm.student_master_id AS student_id,
//                     1 AS univ_id,
//                     CONCAT(
//                         sm.student_first_name_e, ' ',
//                         IFNULL(sm.student_middle_name_e, ''), ' ',
//                         IFNULL(sm.student_last_name_e, '')
//                     ) AS student_name,
//                     srm.academic_session_id,
//                     srm.college_id,
//                     srm.degree_programme_id,
//                     srm.course_year_id,
//                     srm.exam_type_id,
//                     srm.semester_id,
//                     srm.registration_id,
//                     NULL AS reglr_total_cr_x,
//                     NULL AS reglr_gradepoint_a,
//                     NULL AS gpa,
//                     NULL AS prev_fail_total_cr_z,
//                     NULL AS prev_fail_gp_c,
//                     NULL AS previous_total_cr_y,
//                     NULL AS previous_total_gp_b,
//                     NULL AS cumulative_cr,
//                     NULL AS cumulative_gp,
//                     NULL AS percentage,
//                     NULL AS result,
//                     NULL AS generate_flag
//                 FROM a_student_registration_main srm
//                 INNER JOIN a_student_master sm ON srm.ue_id = sm.ue_id  
//                 INNER JOIN src_student_temp sst ON sst.registration_id = srm.registration_id
//                 WHERE srm.academic_session_id = ?
//                   AND srm.college_id = ?
//                   AND srm.course_year_id = ?
//                   AND srm.semester_id = ?
//                   AND srm.delete_flag = 'N'
//                   AND sm.delete_flag = 'N'
//                   AND srm.exam_type_id = ?;
//             `;

//             const params = [
//                 filters.academic_session_id,
//                 filters.college_id,
//                 filters.course_year_id,
//                 filters.semester_id,
//                 filters.exam_type_id
//             ];

//             dbkey.connectionobj.query(selectQuery, params, function (err, rows) {
//                 if (err) return cback({ status: 500, message: "Error fetching student data", error: err });
//                 if (!rows || rows.length === 0) return cback({ status: 404, message: "No students found" });
//                 filters.selectedStudents = rows;
//                 cback();
//             });
//         },

//         // Step 3: Insert into a_src_main
//         function (cback) {
//             const selectedStudents = filters.selectedStudents;

//             async.eachSeries(selectedStudents, function (student, cb) {
//                 const insertObj = {
//                     table_name: 'a_src_main',
//                     data_arr: [{
//                         ue_id: student.ue_id,
//                         univ_id: student.univ_id,
//                         student_id: student.student_id,
//                         student_name: student.student_name,
//                         academic_session_id: student.academic_session_id,
//                         college_id: student.college_id,
//                         degree_programme_id: student.degree_programme_id,
//                         course_year_id: student.course_year_id,
//                         exam_type_id: student.exam_type_id,
//                         semester_id: student.semester_id,
//                         registration_id: student.registration_id,
//                         reglr_total_cr_x: student.reglr_total_cr_x,
//                         reglr_gradepoint_a: student.reglr_gradepoint_a,
//                         gpa: student.gpa,
//                         prev_fail_total_cr_z: student.prev_fail_total_cr_z,
//                         prev_fail_gp_c: student.prev_fail_gp_c,
//                         previous_total_cr_y: student.previous_total_cr_y,
//                         previous_total_gp_b: student.previous_total_gp_b,
//                         cumulative_cr: student.cumulative_cr,
//                         cumulative_gp: student.cumulative_gp,
//                         percentage: student.percentage,
//                         result: student.result,
//                         generate_flag: student.generate_flag
//                     }]
//                 };

//                 SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insertObj, sessionDetails, function (err, res) {
//                     if (err) return cb(err);
//                     else if (res.data && res.data['affectedRows']) return cb();
//                     else return cb({ message: 'Failed to insert into a_src_main' });
//                 });
//             }, cback);
//         },

//         // Step 4: Fetch course data
//         function (cback) {
//             const courseQuery = `
//                 SELECT  
//                     sram.course_id,
//                     srm.date_of_viva,
//                     srm.thesis_title,
//                     sram.course_type_id,
//                     sram.credit_nature_id,
//                     src.src_main_id,
//                     NULL AS total_credit,
//                     'N' AS prev_fail_course_yn,
//                     NULL AS ogpa_improvement
//                 FROM a_student_registration_main srm
//                 INNER JOIN a_student_registration_and_marks sram ON srm.registration_id = sram.registration_id
//                 INNER JOIN m_course_master_main cm ON sram.course_id = cm.course_id AND cm.delete_flag = 'N'
//                 INNER JOIN a_src_main src ON src.registration_id = srm.registration_id AND src.delete_flag = 'N'
//                 INNER JOIN src_student_temp sst ON sst.registration_id = srm.registration_id
//                 WHERE srm.academic_session_id = ?
//                   AND srm.course_year_id = ?
//                   AND srm.semester_id = ?
//                   AND srm.exam_type_id = ?
//                   AND srm.college_id = ?
//                   AND srm.delete_flag = 'N'
//                   AND sram.delete_flag = 'N';
//             `;

//             const params = [
//                 filters.academic_session_id,
//                 filters.course_year_id,
//                 filters.semester_id,
//                 filters.exam_type_id,
//                 filters.college_id
//             ];

//             dbkey.connectionobj.query(courseQuery, params, function (err, rows) {
//                 if (err) return cback({ status: 500, message: "Error fetching course data", error: err });
//                 if (!rows || rows.length === 0) return cback({ status: 404, message: "No course data found" });
//                 filters.courseData = rows;
//                 cback();
//             });
//         },

//         // Step 5: Insert into a_src_coursemain
//         function (cback) {
//             const courseData = filters.courseData;

//             async.eachSeries(courseData, function (course, cb) {
//                 const insertObj = {
//                     table_name: 'a_src_coursemain',
//                     data_arr: [{
//                         src_main_id: course.src_main_id,
//                         course_id: course.course_id,
//                         course_type_id: course.course_type_id,
//                         credit_nature_id: course.credit_nature_id,
//                         total_credit: Number(course.total_credit) || 0,
//                         prev_fail_course_yn: course.prev_fail_course_yn,
//                         ogpa_improvement: course.ogpa_improvement,
//                         thesis_title: course.thesis_title,
//                         date_of_viva: course.date_of_viva
//                     }]
//                 };

//                 SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insertObj, sessionDetails, function (err, res) {
//                     if (err) return cb(err);
//                     else if (res.data && res.data['affectedRows']) return cb();
//                     else return cb({ message: 'Failed to insert into a_src_coursemain' });
//                 });
//             }, cback);
//         },

//         // ✅ Step 6: Fetch and insert into a_src_coursedetail
//         function (cback) {
//             const courseDetailQuery = `
//                 SELECT  
//                     src_cm.src_coursemain_id,
//                     src.src_main_id,
//                     sram.course_nature_id,
//                     sram.credits,
//                     sram.max_marks_external,
//                     sram.min_marks,
//                     sram.final_marks,
//                     CASE 
//                         WHEN sram.remark_id = 8 AND sram.course_nature_id = 1 THEN 9
//                         WHEN sram.remark_id = 8 AND sram.course_nature_id = 2 THEN 10
//                         ELSE sram.remark_id 
//                     END AS remark_id,
//                     CASE 
//                         WHEN sram.remark_id = 8 THEN 8
//                         WHEN sram.remark_id = 7 THEN 7
//                         WHEN sram.remark_id = 4 THEN 8
//                         WHEN sram.remark_id = 5 THEN 8
//                         ELSE NULL 
//                     END AS grade_s_us,
//                     sram.special_remark_id,
//                     sram.passed_by_grace,
//                     sram.course_registration_type_id
//                 FROM a_student_registration_main srm
//                 INNER JOIN a_student_registration_and_marks sram ON srm.registration_id = sram.registration_id
//                 INNER JOIN a_src_main src ON src.registration_id = srm.registration_id AND src.delete_flag = 'N'
//                 INNER JOIN a_src_coursemain src_cm ON src_cm.src_main_id = src.src_main_id 
//                     AND src_cm.delete_flag = 'N' 
//                     AND src_cm.course_id = sram.course_id
//                 INNER JOIN src_student_temp sst ON sst.registration_id = srm.registration_id
//                 WHERE srm.academic_session_id = ?
//                   AND srm.course_year_id = ?
//                   AND srm.semester_id = ?
//                   AND srm.exam_type_id = ?
//                   AND srm.delete_flag = 'N'
//                   AND sram.delete_flag = 'N';
//             `;

//             const params = [
//                 filters.academic_session_id,
//                 filters.course_year_id,
//                 filters.semester_id,
//                 filters.exam_type_id
//             ];

//             dbkey.connectionobj.query(courseDetailQuery, params, function (err, rows) {
//                 if (err) return cback({ status: 500, message: "Error fetching course detail data", error: err });
//                 if (!rows || rows.length === 0) return cback({ status: 404, message: "No course detail data found" });

//                 async.eachSeries(rows, function (detail, cb) {
//                     const insertObj = {
//                         table_name: 'a_src_coursedetail',
//                         data_arr: [{
//                             src_coursemain_id: detail.src_coursemain_id,
//                             src_main_id: detail.src_main_id,
//                             course_nature_id: detail.course_nature_id,
//                             credit: detail.credits,
//                             maxmark_mm: detail.max_marks_external,
//                             min_marks: detail.min_marks,
//                             marksobtained_mo: detail.final_marks,
//                             remark_id: detail.remark_id,
//                             grade_s_us: detail.grade_s_us,
//                             special_remark_id: detail.special_remark_id,
//                             passed_by_grace: detail.passed_by_grace,
//                             course_reg_type_id: detail.course_registration_type_id
//                         }]
//                     };

//                     SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insertObj, sessionDetails, cb);
//                 }, cback);
//             });
//         },
//          function (cback) {
//             const gradeQuery = `
//                 SELECT
//                     d.*,
//                     CASE
//                         WHEN d.credit_nature_id = 1 THEN
//                             COALESCE(
//                                 CAST(
//                                     ROUND(
//                                         (
//                                             (
//                                                 (d.theory_credit * d.theory_marksobtained) / COALESCE(NULLIF(d.theory_maxmark,0), 1)
//                                             )
//                                             +
//                                             (
//                                                 (d.practical_credit * d.practical_marksobtained) / COALESCE(NULLIF(d.practical_maxmark,0), 1)
//                                             )
//                                         ) * 10.0
//                                         / NULLIF(d.total_credit, 0)
//                                     , 2)
//                                 AS DECIMAL(18,2))
//                             , 0)
//                         ELSE NULL
//                     END AS grade_point
//                 FROM (
//                     SELECT
//                         scm.src_main_id,
//                         scm.src_coursemain_id,
//                         scm.course_id,
//                         scm.credit_nature_id,
//                         IFNULL(scd1.credit, 0) AS theory_credit,
//                         IFNULL(scd1.marksobtained_mo, 0) AS theory_marksobtained,
//                         IFNULL(scd1.maxmark_mm, 0) AS theory_maxmark,
//                         IFNULL(scd2.credit, 0) AS practical_credit,
//                         IFNULL(scd2.marksobtained_mo, 0) AS practical_marksobtained,
//                         IFNULL(scd2.maxmark_mm, 0) AS practical_maxmark,
//                         (IFNULL(scd1.credit, 0) + IFNULL(scd2.credit, 0)) AS total_credit
//                     FROM a_src_coursemain scm
//                     INNER JOIN a_src_main sm
//                         ON scm.src_main_id = sm.src_main_id
//                         AND sm.delete_flag = 'N'
//                         AND sm.academic_session_id = ?
//                         AND sm.college_id = ?
//                         AND sm.course_year_id = ?
//                         AND sm.semester_id = ?
//                     INNER JOIN src_student_temp sst
//                         ON sst.registration_id = sm.registration_id
//                     LEFT JOIN a_src_coursedetail scd1
//                         ON scm.src_main_id = scd1.src_main_id
//                         AND scm.src_coursemain_id = scd1.src_coursemain_id
//                         AND scd1.course_nature_id = 1
//                         AND scd1.delete_flag = 'N'
//                     LEFT JOIN a_src_coursedetail scd2
//                         ON scm.src_main_id = scd2.src_main_id
//                         AND scm.src_coursemain_id = scd2.src_coursemain_id
//                         AND scd2.course_nature_id = 2
//                         AND scd2.delete_flag = 'N'
//                     WHERE scm.delete_flag = 'N'
//                 ) AS d
//                 ORDER BY d.src_coursemain_id;
//             `;

//             const params = [
//                 filters.academic_session_id,
//                 filters.college_id,
//                 filters.course_year_id,
//                 filters.semester_id
//             ];

//             dbkey.connectionobj.query(gradeQuery, params, function (err, rows) {
//                 if (err) return cback({ status: 500, message: "Error fetching grade point data", error: err });
//                 if (!rows || rows.length === 0) return cback({ status: 404, message: "No course data found for grade update" });

//                 // Step 7.1: Update each record
//                 async.eachSeries(rows, (row, cb) => {
//                     const whereObj = {
//                         src_coursemain_id: row.src_coursemain_id,
//                         src_main_id: row.src_main_id,
//                         credit_nature_id: row.credit_nature_id
//                     };

//                     const updateObj = {
//                         grade_point: row.grade_point,
//                         total_credit: row.total_credit,
//                         action_by: sessionDetails.user_id,
//                         action_ip_address: sessionDetails.ip_address,
//                         action_type: "U",
//                         action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
//                     };

//                     const data = {
//                         log_table_name: "app_log_a_src_coursemain",
//                         update_table_name: "a_src_coursemain",
//                         whereObj,
//                         updateObj
//                     };

//                     SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, data, sessionDetails, cb);
//                 }, cback);
//             });
//         },
//         //     function (cback) {
//         //     const gradeQuery = `
//         //     select
//         //             sm.src_main_id,
//         //             sm.ue_id,
//         //             sm.student_id,
//         //             sm.registration_id,
//         //             calc.total_credit as reglr_total_cr_x,
//         //             cast(round(calc.sum_gp, 2) as decimal(18,2)) as reglr_gradepoint_a,
//         //             case
//         //                 when calc.total_credit = 0 then cast(0 as decimal(18,2))
//         //                 else cast(round(calc.sum_gp / nullif(calc.total_credit, 0), 2) as decimal(18,2))
//         //             end as gpa,
//         //             calc.course_count as reglr_course_count,
//         //             calc.grade_point
//         //             from a_src_main sm
//         //             join (
//         //             select
//         //                 scm.src_main_id,
//         //                 scm.grade_point,
//         //                 ifnull(sum(scm.total_credit),0) as total_credit,
//         //                 ifnull(sum( ifnull(scm.grade_point,0) * ifnull(scm.total_credit,0) ),0) as sum_gp,
//         //                 count(1) as course_count
//         //             from a_src_coursemain scm
//         //             where
//         //                 scm.delete_flag = 'N'
//         //                 and scm.prev_fail_course_yn = 'N'      
//         //                 and scm.credit_nature_id = 1           
//         //             group by scm.src_main_id
//         //             ) as calc
//         //             on sm.src_main_id = calc.src_main_id
//         //             inner join src_student_temp sst on sst.registration_id = sm.registration_id 
//         //             where
//         //             sm.delete_flag = 'N'
//         //             and sm.academic_session_id = ?
//         //             and sm.college_id = ?
//         //             and sm.course_year_id = ?
//         //             and sm.semester_id = ?
//         //             order by sm.src_main_id;
//         //     `;

//         //     const params = [
//         //         filters.academic_session_id,
//         //         filters.college_id,
//         //         filters.course_year_id,
//         //         filters.semester_id
//         //     ];

//         //     dbkey.connectionobj.query(gradeQuery, params, function (err, rows) {
//         //         if (err) return cback({ status: 500, message: "Error fetching grade point data", error: err });
//         //         if (!rows || rows.length === 0) return cback({ status: 404, message: "No course data found for grade update" });

//         //         // Step 8.1: Update each record
//         //         async.eachSeries(rows, (row, cb) => {
//         //             const whereObj = {
//         //                 src_coursemain_id: row.src_coursemain_id,
//         //                 src_main_id: row.src_main_id,
//         //                 credit_nature_id: row.credit_nature_id
//         //             };

//         //             const updateObj = {
//         //                 reglr_total_cr_x: row.reglr_total_cr_x,
//         //                 reglr_gradepoint_a: row.reglr_gradepoint_a,
//         //                 gpa: row.gpa,
//         //                 action_by: sessionDetails.user_id,
//         //                 action_ip_address: sessionDetails.ip_address,
//         //                 action_type: "U",
//         //                 action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
//         //             };

//         //             const data = {
//         //                 log_table_name: "app_log_a_src_main",
//         //                 update_table_name: "a_src_main",
//         //                 whereObj,
//         //                 updateObj
//         //             };

//         //             SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, data, sessionDetails, cb);
//         //         }, cback);
//         //     });
//         // }


//     ], function (err) {
//         // Step 7: Commit or Rollback
//         if (err) {
//             DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
//                 callback(null, { error: true, message: err.message || "Server error", details: err.error || null });
//             });
//         } else {
//             DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
//                 callback(null, { error: false, message: "✅ Student, Course & Course Detail data inserted successfully into SRC tables" });
//             });
//         }
//     });
// },

// bulkSRCGenerate_2: function (dbkey, request, filters, sessionDetails, callback) {
//     let tranObj, tranCallback;

//     async.series([
//         // Step 1: Start Transaction
//         function (cback) {
//             DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
//                 if (err) return cback({ status: 500, message: "Transaction creation failed", error: err });
//                 tranObj = tranobj;
//                 tranCallback = trancallback;
//                 dbkey = { dbkey: dbkey, connectionobj: tranObj };
//                 cback();
//             });
//         },

//         // Step 2: Fetch student list for SRC insertion
//         function (cback) {
//             const selectQuery = `
//                 CALL testSrc(?)
//             `;

//             const params = [
//                 23,
//                 // filters.college_id,
//                 // filters.course_year_id,
//                 // filters.semester_id,
//                 // filters.exam_type_id
//             ];

//             dbkey.connectionobj.query(selectQuery, params, function (err, rows) {
//                 console.log(rows);
                
//                 if (err) return cback({ status: 500, message: "Error fetching student data", error: err });
//                 if (!rows || rows.length === 0) return cback({ status: 404, message: "No students found" });
//                 filters.selectedStudents = rows;
//                 cback();
//             });
//         },

//         // Step 3: Insert into a_src_main
//         // function (cback) {
//         //     const selectedStudents = filters.selectedStudents;

//         //     async.eachSeries(selectedStudents, function (student, cb) {
//         //         const insertObj = {
//         //             table_name: 'a_src_main',
//         //             data_arr: [{
//         //                 ue_id: student.ue_id,
//         //                 univ_id: student.univ_id,
//         //                 student_id: student.student_id,
//         //                 student_name: student.student_name,
//         //                 academic_session_id: student.academic_session_id,
//         //                 college_id: student.college_id,
//         //                 degree_programme_id: student.degree_programme_id,
//         //                 course_year_id: student.course_year_id,
//         //                 exam_type_id: student.exam_type_id,
//         //                 semester_id: student.semester_id,
//         //                 registration_id: student.registration_id,
//         //                 reglr_total_cr_x: student.reglr_total_cr_x,
//         //                 reglr_gradepoint_a: student.reglr_gradepoint_a,
//         //                 gpa: student.gpa,
//         //                 prev_fail_total_cr_z: student.prev_fail_total_cr_z,
//         //                 prev_fail_gp_c: student.prev_fail_gp_c,
//         //                 previous_total_cr_y: student.previous_total_cr_y,
//         //                 previous_total_gp_b: student.previous_total_gp_b,
//         //                 cumulative_cr: student.cumulative_cr,
//         //                 cumulative_gp: student.cumulative_gp,
//         //                 percentage: student.percentage,
//         //                 result: student.result,
//         //                 generate_flag: student.generate_flag
//         //             }]
//         //         };

//         //         SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insertObj, sessionDetails, function (err, res) {
//         //             if (err) return cb(err);
//         //             else if (res.data && res.data['affectedRows']) return cb();
//         //             else return cb({ message: 'Failed to insert into a_src_main' });
//         //         });
//         //     }, cback);
//         // },

//         // // Step 4: Fetch course data
//         // function (cback) {
//         //     const courseQuery = `
//         //         SELECT  
//         //             sram.course_id,
//         //             srm.date_of_viva,
//         //             srm.thesis_title,
//         //             sram.course_type_id,
//         //             sram.credit_nature_id,
//         //             src.src_main_id,
//         //             NULL AS total_credit,
//         //             'N' AS prev_fail_course_yn,
//         //             NULL AS ogpa_improvement
//         //         FROM a_student_registration_main srm
//         //         INNER JOIN a_student_registration_and_marks sram ON srm.registration_id = sram.registration_id
//         //         INNER JOIN m_course_master_main cm ON sram.course_id = cm.course_id AND cm.delete_flag = 'N'
//         //         INNER JOIN a_src_main src ON src.registration_id = srm.registration_id AND src.delete_flag = 'N'
//         //         INNER JOIN src_student_temp sst ON sst.registration_id = srm.registration_id
//         //         WHERE srm.academic_session_id = ?
//         //           AND srm.course_year_id = ?
//         //           AND srm.semester_id = ?
//         //           AND srm.exam_type_id = ?
//         //           AND srm.college_id = ?
//         //           AND srm.delete_flag = 'N'
//         //           AND sram.delete_flag = 'N';
//         //     `;

//         //     const params = [
//         //         filters.academic_session_id,
//         //         filters.course_year_id,
//         //         filters.semester_id,
//         //         filters.exam_type_id,
//         //         filters.college_id
//         //     ];

//         //     dbkey.connectionobj.query(courseQuery, params, function (err, rows) {
//         //         if (err) return cback({ status: 500, message: "Error fetching course data", error: err });
//         //         if (!rows || rows.length === 0) return cback({ status: 404, message: "No course data found" });
//         //         filters.courseData = rows;
//         //         cback();
//         //     });
//         // },

//         // // Step 5: Insert into a_src_coursemain
//         // function (cback) {
//         //     const courseData = filters.courseData;

//         //     async.eachSeries(courseData, function (course, cb) {
//         //         const insertObj = {
//         //             table_name: 'a_src_coursemain',
//         //             data_arr: [{
//         //                 src_main_id: course.src_main_id,
//         //                 course_id: course.course_id,
//         //                 course_type_id: course.course_type_id,
//         //                 credit_nature_id: course.credit_nature_id,
//         //                 total_credit: Number(course.total_credit) || 0,
//         //                 prev_fail_course_yn: course.prev_fail_course_yn,
//         //                 ogpa_improvement: course.ogpa_improvement,
//         //                 thesis_title: course.thesis_title,
//         //                 date_of_viva: course.date_of_viva
//         //             }]
//         //         };

//         //         SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insertObj, sessionDetails, function (err, res) {
//         //             if (err) return cb(err);
//         //             else if (res.data && res.data['affectedRows']) return cb();
//         //             else return cb({ message: 'Failed to insert into a_src_coursemain' });
//         //         });
//         //     }, cback);
//         // },

//         // // ✅ Step 6: Fetch and insert into a_src_coursedetail
//         // function (cback) {
//         //     const courseDetailQuery = `
//         //         SELECT  
//         //             src_cm.src_coursemain_id,
//         //             src.src_main_id,
//         //             sram.course_nature_id,
//         //             sram.credits,
//         //             sram.max_marks_external,
//         //             sram.min_marks,
//         //             sram.final_marks,
//         //             CASE 
//         //                 WHEN sram.remark_id = 8 AND sram.course_nature_id = 1 THEN 9
//         //                 WHEN sram.remark_id = 8 AND sram.course_nature_id = 2 THEN 10
//         //                 ELSE sram.remark_id 
//         //             END AS remark_id,
//         //             CASE 
//         //                 WHEN sram.remark_id = 8 THEN 8
//         //                 WHEN sram.remark_id = 7 THEN 7
//         //                 WHEN sram.remark_id = 4 THEN 8
//         //                 WHEN sram.remark_id = 5 THEN 8
//         //                 ELSE NULL 
//         //             END AS grade_s_us,
//         //             sram.special_remark_id,
//         //             sram.passed_by_grace,
//         //             sram.course_registration_type_id
//         //         FROM a_student_registration_main srm
//         //         INNER JOIN a_student_registration_and_marks sram ON srm.registration_id = sram.registration_id
//         //         INNER JOIN a_src_main src ON src.registration_id = srm.registration_id AND src.delete_flag = 'N'
//         //         INNER JOIN a_src_coursemain src_cm ON src_cm.src_main_id = src.src_main_id 
//         //             AND src_cm.delete_flag = 'N' 
//         //             AND src_cm.course_id = sram.course_id
//         //         INNER JOIN src_student_temp sst ON sst.registration_id = srm.registration_id
//         //         WHERE srm.academic_session_id = ?
//         //           AND srm.course_year_id = ?
//         //           AND srm.semester_id = ?
//         //           AND srm.exam_type_id = ?
//         //           AND srm.delete_flag = 'N'
//         //           AND sram.delete_flag = 'N';
//         //     `;

//         //     const params = [
//         //         filters.academic_session_id,
//         //         filters.course_year_id,
//         //         filters.semester_id,
//         //         filters.exam_type_id
//         //     ];

//         //     dbkey.connectionobj.query(courseDetailQuery, params, function (err, rows) {
//         //         if (err) return cback({ status: 500, message: "Error fetching course detail data", error: err });
//         //         if (!rows || rows.length === 0) return cback({ status: 404, message: "No course detail data found" });

//         //         async.eachSeries(rows, function (detail, cb) {
//         //             const insertObj = {
//         //                 table_name: 'a_src_coursedetail',
//         //                 data_arr: [{
//         //                     src_coursemain_id: detail.src_coursemain_id,
//         //                     src_main_id: detail.src_main_id,
//         //                     course_nature_id: detail.course_nature_id,
//         //                     credit: detail.credits,
//         //                     maxmark_mm: detail.max_marks_external,
//         //                     min_marks: detail.min_marks,
//         //                     marksobtained_mo: detail.final_marks,
//         //                     remark_id: detail.remark_id,
//         //                     grade_s_us: detail.grade_s_us,
//         //                     special_remark_id: detail.special_remark_id,
//         //                     passed_by_grace: detail.passed_by_grace,
//         //                     course_reg_type_id: detail.course_registration_type_id
//         //                 }]
//         //             };

//         //             SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insertObj, sessionDetails, cb);
//         //         }, cback);
//         //     });
//         // },
//         //  function (cback) {
//         //     const gradeQuery = `
//         //         SELECT
//         //             d.*,
//         //             CASE
//         //                 WHEN d.credit_nature_id = 1 THEN
//         //                     COALESCE(
//         //                         CAST(
//         //                             ROUND(
//         //                                 (
//         //                                     (
//         //                                         (d.theory_credit * d.theory_marksobtained) / COALESCE(NULLIF(d.theory_maxmark,0), 1)
//         //                                     )
//         //                                     +
//         //                                     (
//         //                                         (d.practical_credit * d.practical_marksobtained) / COALESCE(NULLIF(d.practical_maxmark,0), 1)
//         //                                     )
//         //                                 ) * 10.0
//         //                                 / NULLIF(d.total_credit, 0)
//         //                             , 2)
//         //                         AS DECIMAL(18,2))
//         //                     , 0)
//         //                 ELSE NULL
//         //             END AS grade_point
//         //         FROM (
//         //             SELECT
//         //                 scm.src_main_id,
//         //                 scm.src_coursemain_id,
//         //                 scm.course_id,
//         //                 scm.credit_nature_id,
//         //                 IFNULL(scd1.credit, 0) AS theory_credit,
//         //                 IFNULL(scd1.marksobtained_mo, 0) AS theory_marksobtained,
//         //                 IFNULL(scd1.maxmark_mm, 0) AS theory_maxmark,
//         //                 IFNULL(scd2.credit, 0) AS practical_credit,
//         //                 IFNULL(scd2.marksobtained_mo, 0) AS practical_marksobtained,
//         //                 IFNULL(scd2.maxmark_mm, 0) AS practical_maxmark,
//         //                 (IFNULL(scd1.credit, 0) + IFNULL(scd2.credit, 0)) AS total_credit
//         //             FROM a_src_coursemain scm
//         //             INNER JOIN a_src_main sm
//         //                 ON scm.src_main_id = sm.src_main_id
//         //                 AND sm.delete_flag = 'N'
//         //                 AND sm.academic_session_id = ?
//         //                 AND sm.college_id = ?
//         //                 AND sm.course_year_id = ?
//         //                 AND sm.semester_id = ?
//         //             INNER JOIN src_student_temp sst
//         //                 ON sst.registration_id = sm.registration_id
//         //             LEFT JOIN a_src_coursedetail scd1
//         //                 ON scm.src_main_id = scd1.src_main_id
//         //                 AND scm.src_coursemain_id = scd1.src_coursemain_id
//         //                 AND scd1.course_nature_id = 1
//         //                 AND scd1.delete_flag = 'N'
//         //             LEFT JOIN a_src_coursedetail scd2
//         //                 ON scm.src_main_id = scd2.src_main_id
//         //                 AND scm.src_coursemain_id = scd2.src_coursemain_id
//         //                 AND scd2.course_nature_id = 2
//         //                 AND scd2.delete_flag = 'N'
//         //             WHERE scm.delete_flag = 'N'
//         //         ) AS d
//         //         ORDER BY d.src_coursemain_id;
//         //     `;

//         //     const params = [
//         //         filters.academic_session_id,
//         //         filters.college_id,
//         //         filters.course_year_id,
//         //         filters.semester_id
//         //     ];

//         //     dbkey.connectionobj.query(gradeQuery, params, function (err, rows) {
//         //         if (err) return cback({ status: 500, message: "Error fetching grade point data", error: err });
//         //         if (!rows || rows.length === 0) return cback({ status: 404, message: "No course data found for grade update" });

//         //         // Step 7.1: Update each record
//         //         async.eachSeries(rows, (row, cb) => {
//         //             const whereObj = {
//         //                 src_coursemain_id: row.src_coursemain_id,
//         //                 src_main_id: row.src_main_id,
//         //                 credit_nature_id: row.credit_nature_id
//         //             };

//         //             const updateObj = {
//         //                 grade_point: row.grade_point,
//         //                 total_credit: row.total_credit,
//         //                 action_by: sessionDetails.user_id,
//         //                 action_ip_address: sessionDetails.ip_address,
//         //                 action_type: "U",
//         //                 action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
//         //             };

//         //             const data = {
//         //                 log_table_name: "app_log_a_src_coursemain",
//         //                 update_table_name: "a_src_coursemain",
//         //                 whereObj,
//         //                 updateObj
//         //             };

//         //             SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, data, sessionDetails, cb);
//         //         }, cback);
//         //     });
//         // },

//     ], function (err) {
//         // Step 7: Commit or Rollback
//         if (err) {
//             DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
//                 callback(null, { error: true, message: err.message || "Server error", details: err.error || null });
//             });
//         } else {
//             DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
//                 callback(null, { error: false, message: "✅ Student, Course & Course Detail data inserted successfully into SRC tables" });
//             });
//         }
//     });
// },

bulkSRCGenerate: function (dbkey, request, payload, sessionDetails, callback) {
    let tranObj = null;
    let tranCallback = null;
    let dbTranKey = null;
    const finalResult = [];

    async.series([

        // 1️⃣ Start transaction
        function (cback) {
            DB_SERVICE.createTransaction(dbkey, function (err, tranconn, trancallback) {
                if (err) return cback(err);

                tranObj = tranconn;
                tranCallback = trancallback;

                dbTranKey = {
                    dbkey: dbkey,
                    connectionobj: tranObj
                };

                return cback();
            });
        },

        function (cback) {
            const callSql = `CALL generate_src()`; 

            dbTranKey.connectionobj.query(callSql, [], function (err, results) {
                if (err) {
                    // bubble error to series callback (will be handled by final error handler)
                    return cback(err);
                }

                // Optionally inspect results if your procedure SELECTs/returns something
                finalResult.push({
                    proc_called: 'generate_src',
                    rowsReturned: Array.isArray(results) ? results.length : 0,
                    rawResult: results
                });

                return cback();
            });
        },

        // 3️⃣ Commit transaction
        function (cback) {
            DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function (err) {
                if (err) return cback(err);

                finalResult.push({
                    committed: true,
                    message: "generate_src() executed and transaction committed"
                });

                return cback();
            });
        }

    ], function (err) {
        // final callback for async.series
        if (err) {
            // If error is thrown and we have a transaction object, rollback using helper
            if (tranObj && tranCallback) {
                return DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback({
                        error: true,
                        message: "Error during generate_src execution — transaction rolled back",
                        details: err
                    });
                });
            } else {
                // no transaction created or available
                return callback({
                    error: true,
                    message: "Error before transaction was created",
                    details: err
                });
            }
        }

        // success
        return callback(null, {
            error: false,
            message: "generate_src executed successfully",
            result: finalResult
        });
    });
},



}
module.exports = src