var DB_SERVICE = global.DB_SERVICE;
var securityService = global.COMMON_SECURITY_SERVICE;
const SHARED_SERVICE = global.SHARED_SERVICE;
const DOC_UPLOAD_SERVICE = global.DOC_UPLOAD_SERVICE;
const ENCRYPTION_SERVICE = global.ENCRYPTION_SERVICE;
const COMMON_SERVICE = global.COMMON_SERVICE;
var async = require('async');
const { log } = require('handlebars');
let format = require('date-format');
let FILE_REPORT_VALIDATOR = require('../validators/fileReportValidator.js');
let STUDENT_PROFILE_VALIDATOR = require('../validators/studentProfileValidator.js');
let FILE_SERVICE = require('./fileService');

let studentProfileService = {

    saveGenerateUIDN: function (dbkey, request, selectedRows, sessionDetails, callback) {

        if (!Array.isArray(selectedRows) || selectedRows.length === 0) {
            return callback({
                error: true,
                message: "selectedRows is empty or invalid"
            });
        }

        let finalResult = [];
        let originalDBKey = dbkey;

        let tranObj = null;
        let tranCallback = null;
        let dbTranKey = null;

        let mainInsertedId = null;   // PK of a_student_id_main

        async.series([

            // 1️⃣ START TRANSACTION (ONLY ONCE)
            function (cback) {
                DB_SERVICE.createTransaction(originalDBKey, function (err, tranconn, trancallback) {
                    if (err) return cback(err);

                    tranObj = tranconn;
                    tranCallback = trancallback;

                    dbTranKey = {
                        dbkey: originalDBKey,
                        connectionobj: tranObj
                    };

                    return cback();
                });
            },

            // 2️⃣ CHECK IF MAIN RECORD ALREADY EXISTS
            function (cback) {

                let checkSql = `
                SELECT student_id_main_id
                FROM a_student_id_main
                WHERE admission_session = ?
                  AND college_id = ?
                  AND degree_id = ?
                  AND delete_flag = 'N'
                LIMIT 1
            `;

                let params = [
                    25,
                    selectedRows[0].college_id,
                    selectedRows[0].degree_id
                ];

                dbTranKey.connectionobj.query(checkSql, params, function (err, rows) {
                    if (err) return cback(err);

                    if (rows.length > 0) {

                        return DB_SERVICE.rollbackPartialTransaction(
                            tranObj,
                            tranCallback,
                            function () {

                                finalResult.push({
                                    exists: true,
                                    message: "UIED already exists. No insert performed."
                                });

                                return cback("SKIP_ALL");
                            }
                        );
                    }

                    return cback();
                });
            },

            // 3️⃣ INSERT FIRST TABLE (ONLY ONCE)
            function (cback) {

                let baseRow = selectedRows[0];

                let insertObj = {
                    table_name: "a_student_id_main",
                    admission_session: baseRow.academic_session_id,
                    college_id: baseRow.college_id,
                    degree_id: baseRow.degree_id
                };

                SHARED_SERVICE.validateAndInsertInTable(dbTranKey, request, insertObj, sessionDetails, function (err, res) {
                    if (err) return cback(err);

                    mainInsertedId = res.data.insertId;   // PRIMARY KEY

                    return cback();
                });
            },

            // 4️⃣ INSERT SECOND TABLE MULTIPLE ROWS
            // 4️⃣ INSERT SECOND TABLE MULTIPLE ROWS + GENERATE STUDENT_ID
            function (cback) {

                async.eachSeries(selectedRows, function (row, cbDetail) {

                    let prefix = 2000 + Number(row.academic_session_id);       // first argument to query
                    let Admission_Session = row.academic_session_id; // second argument


                    let genSql = `
                    SELECT CONCAT(
                        ?,
                        LPAD(
                            CAST(COALESCE(RIGHT(MAX(sc.student_id), 4), '0') AS UNSIGNED) + 1,
                            4,
                            '0'
                        )
                    ) AS generated_student_id
                    FROM a_student_id_main sm
                    JOIN a_student_id_detail sc 
                        ON sc.student_id_main_id = sm.student_id_main_id
                    WHERE sm.admission_session = ?
                    AND SUBSTRING(sc.student_id, 1, 4) = ?
                `;

                    dbTranKey.connectionobj.query(genSql, [prefix, Admission_Session, prefix], function (err, rows) {
                        if (err) return cbDetail(err);

                        let generatedStudentID =
                            rows[0].generated_student_id ||
                            (prefix + "0001"); // fallback if no previous ID exists

                        // NOW INSERT DETAIL ROW
                        let detailObj = {
                            table_name: "a_student_id_detail",
                            student_id_main_id: mainInsertedId,
                            student_id: generatedStudentID,
                            admission_id: row.admission_id,
                            entrance_exam_type_code: row.entrance_exam_type_code,
                            admsn_quota_id: row.Admsn_Quota_Id
                        };

                        SHARED_SERVICE.validateAndInsertInTable(
                            dbTranKey,
                            request,
                            detailObj,
                            sessionDetails,
                            function (err2, res) {
                                if (err2) return cbDetail(err2);

                                return cbDetail();
                            }
                        );
                    });

                }, function (err) {
                    return cback(err);
                });

            },


            // 5️⃣ COMMIT TRANSACTION
            function (cback) {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function (err) {
                    if (err) return cback(err);

                    finalResult.push({
                        inserted: true,
                        message: "Student ID main + detail inserted successfully.",
                        student_id_main_id: mainInsertedId
                    });

                    return cback();
                });
            }

        ], function (err) {

            if (err && err !== "SKIP_ALL") {

                return DB_SERVICE.rollbackPartialTransaction(
                    tranObj,
                    tranCallback,
                    function () {
                        return callback({
                            error: true,
                            message: "Error occurred. Transaction rolled back.",
                            details: err
                        });
                    }
                );
            }

            return callback({
                error: false,
                message: "Process completed.",
                result: finalResult
            });
        });
    },

    saveApproveUIDN: function (dbkey, request, selectedRows, sessionDetails, callback) {

        if (!Array.isArray(selectedRows) || selectedRows.length === 0) {
            return callback({
                error: true,
                message: "selectedRows is empty or invalid"
            });
        }

        let finalResult = [];
        let originalDBKey = dbkey;

        let tranObj = null;
        let tranCallback = null;
        let dbTranKey = null;

        async.series([

            // 1️⃣ START TRANSACTION
            function (cback) {
                DB_SERVICE.createTransaction(originalDBKey, function (err, tranconn, trancallback) {
                    if (err) return cback(err);

                    tranObj = tranconn;
                    tranCallback = trancallback;

                    dbTranKey = {
                        dbkey: originalDBKey,
                        connectionobj: tranObj
                    };

                    return cback();
                });
            },

            // 2️⃣ STEP-1: CHECK IF STUDENT ALREADY EXISTS
            function (cback) {

                async.eachSeries(selectedRows, function (row, cbDetail) {

                    let checkSql = `
                    SELECT 1 
                    FROM a_student_master
                    WHERE student_id = ?
                      AND admission_id = ?
                      AND admission_session = ?
                    LIMIT 1
                `;

                    let params = [
                        row.uidn,                 // student_id
                        row.admission_id,         // admission_id
                        row.academic_session_id   // admission_session
                    ];

                    dbTranKey.connectionobj.query(checkSql, params, function (err, rows) {
                        if (err) return cbDetail(err);

                        const exists = rows.length > 0;

                        finalResult.push({
                            row_index: finalResult.length + 1,
                            student_id: row.student_id,
                            uidn: row.uidn,
                            admission_id: row.admission_id,
                            admission_session: row.academic_session_id, // FIXED
                            exists: exists,
                            message: exists ? "Student already exists" : "Student does not exist",
                            seat_allotment: null    // auto-filled later
                        });

                        return cbDetail();
                    });

                }, function (err) {
                    return cback(err);
                });
            },

            // 3️⃣ STEP-2: FETCH SEAT ALLOTMENT ONLY FOR NON-EXISTING STUDENTS
            function (cback) {

                async.eachSeries(selectedRows, function (row, cbDetail) {

                    // Find the row result from Step-1
                    let resultRow = finalResult.find(
                        r => r.student_id === row.student_id &&
                            r.admission_id === row.admission_id &&
                            r.admission_session === row.academic_session_id
                    );

                    if (!resultRow) {
                        return cbDetail(new Error("Internal mapping error: resultRow not found"));
                    }

                    // If student already exists → skip
                    if (resultRow.exists === true) {
                        resultRow.seat_allotment = null;
                        return cbDetail();
                    }

                    let seatSql = `
                    SELECT  
                        subject_id,
                        student_cid,
                        admitted_category_id,
                        admitted_cast_class_id,
                        admitted_spcategory_id,
                        counseling_adm_id,
                        stu_adm_type_id,
                        entrance_exam_type_code
                    FROM igkv_admission.a_stu_couns_seat_allotment_old
                    WHERE counseling_record_id = ?
                      AND academic_session_id = ?
                `;

                    let params = [
                        row.Counseling_Record_ID,
                        row.academic_session_id
                    ];

                    dbTranKey.connectionobj.query(seatSql, params, function (err, rows) {
                        if (err) return cbDetail(err);

                        resultRow.seat_allotment = rows.length ? rows[0] : null;
                        resultRow.student_cid = resultRow.seat_allotment.student_cid
                        console.log("Seat Allotment Data:", resultRow.seat_allotment);


                        return cbDetail();
                    });

                }, function (err) {
                    return cback(err);
                });
            },

            // 4️⃣ STEP-3: CHECK a_stu_couns_app_main AND INSERT/UPDATE
            function (cback) {

                async.eachSeries(selectedRows, function (row, cbDetail) {

                    // get mapped resultRow from previous steps
                    let resRow = finalResult.find(r =>
                        r.student_id === row.student_id &&
                        r.admission_id === row.admission_id &&
                        r.admission_session === row.academic_session_id
                    );

                    if (!resRow) {
                        return cbDetail(new Error("Mapping error in Step-3"));
                    }

                    // 1️⃣ Already exists → skip
                    if (resRow.exists === true) {
                        return cbDetail();
                    }

                    // 2️⃣ No seat allotment → skip
                    if (!resRow.seat_allotment) {
                        resRow.app_main_exists = false;
                        resRow.message = "Seat allotment not found";
                        return cbDetail();
                    }

                    // 3️⃣ Check application in a_stu_couns_app_main_old
                    let appSql = `
                    SELECT 1
                    FROM igkv_admission.a_stu_couns_app_main_old
                    WHERE student_cid = ?
                    AND academic_session_id = ?
                    LIMIT 1
                `;

                    let params = [
                        resRow.seat_allotment.student_cid,
                        row.academic_session_id
                    ];

                    dbTranKey.connectionobj.query(appSql, params, function (err, rows) {

                        if (err) return cbDetail(err);

                        // 4️⃣ Not found
                        if (rows.length === 0) {
                            resRow.app_main_exists = false;
                            resRow.message = "Application not found";
                            return cbDetail();
                        }

                        // 5️⃣ Found → eligible
                        resRow.app_main_exists = true;
                        resRow.message = "Eligible for Insert and Update processing";

                        // NOW INSERT / UPDATE
                        //================ Update in Fee Collection Master =============
                        let updateParams = {
                            update_table_name: 'Fee_Collection_Master',
                            updateObj: {
                                student_id: row.uidn,
                                university_id: row.uidn,
                                action_ip_address: sessionDetails.ip_address,
                                action_by: sessionDetails.user_id,
                                action_type: 'U',
                                action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                            },
                            whereObj: {
                                applied_academic_session: row.academic_session_id,
                                academic_session: row.academic_session_id,
                                counseling_record_id: row.Counseling_Record_ID,
                                // Student_Id : null 
                            }
                        };

                        SHARED_SERVICE.insrtAndUpdtOperation(
                            dbTranKey,
                            request,
                            updateParams,
                            sessionDetails,
                            function (err, res) {

                                if (err) return cbDetail(err);

                                if (!res || res.length === 0) {
                                    return cbDetail({ message: "No record updated in Fee_Collection_Master" });
                                }

                                // return cbDetail(); 

                                // NOW UPDATE A_STUDENT_REGISTRATION_MAIN
                                let updateRegParams = {
                                    update_table_name: 'a_student_registration_main',
                                    updateObj: {
                                        student_master_id: row.uidn,
                                        ue_id: row.uidn,
                                        action_ip_address: sessionDetails.ip_address,
                                        action_by: sessionDetails.user_id,
                                        action_type: 'U',
                                        action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                                    },
                                    whereObj: {
                                        admission_session: row.academic_session_id,
                                        academic_session_id: row.academic_session_id,
                                        counseling_reg_no: row.Counseling_Record_ID,
                                        degree_id: row.degree_id,
                                        // student_master_id : null
                                    }
                                };

                                SHARED_SERVICE.insrtAndUpdtOperation(
                                    dbTranKey,
                                    request,
                                    updateRegParams,
                                    sessionDetails,
                                    function (err2, res2) {

                                        if (err2) return cbDetail(err2);

                                        if (!res2 || res2.length === 0) {
                                            return cbDetail({ message: "No record updated in A_Student_Registration_Main" });
                                        }

                                        // return cbDetail(); 
                                        let fetchSql = `
                                SELECT
                        *
                        from igkv_admission.a_stu_couns_app_main_old sm
                        inner join igkv_admission.a_stu_couns_seat_allotment_old cr
                        on cr.student_cid = sm.student_cid
                        where sm.student_cid = ?
                        and sm.academic_session_id = ?
                        and application_flag_status_id = 'v';
                                `;

                                        let fetchParams = [
                                            resRow.seat_allotment.student_cid,
                                            row.academic_session_id
                                        ];
                                        dbTranKey.connectionobj.query(fetchSql, fetchParams, function (err3, regDataRows) {
                                            if (err3) return cbDetail(err3);

                                            if (!regDataRows || regDataRows.length === 0) {
                                                return cbDetail({ message: "No registration data found for insert operation" });
                                            }

                                            let regData = regDataRows[0];
                                            console.log("Fetched Data for insert student master:", regData);



                                            // return cbDetail();
                                            let insertObj = {
                                                table_name: "a_student_master",

                                                admission_id: row.Counseling_Record_ID,
                                                univ_id: 1,
                                                student_id: row.uidn,
                                                admission_session: row.academic_session_id,
                                                salutation_e: regData.candidate_salutation_id_e,
                                                student_first_name_e: regData.candidate_first_name_e,
                                                student_middle_name_e: regData.candidate_middle_name_e || null,
                                                student_last_name_e: regData.candidate_last_name_e || null,
                                                student_first_name_h: regData.candidate_first_name_h || null,
                                                student_middle_name_h: regData.candidate_middle_name_h || null,
                                                student_last_name_h: regData.candidate_last_name_h || null,
                                                academic_session_id: regData.academic_session_id,
                                                dob: regData.dob,
                                                ue_id: row.uidn,
                                                gender_id: regData.gender_id,
                                                mobile_no: regData.mobile_no_1,
                                                mobile_no: regData.mobile_no_1 ? String(regData.mobile_no_1) : null,
                                                email_id: regData.email_id,
                                                aadhar_number: regData.aadhar_number,
                                                seat_allotment_date: regData.seat_allotment_date,
                                                verified_category_id: regData.verified_category_id,
                                                reg_no: regData.reg_no,
                                                student_photo_path: regData.student_photo_path,
                                                student_signature_path: regData.student_signature_path,
                                                college_id: regData.college_id,
                                                degree_id: regData.degree_programme_id,
                                                subject_id: regData.subject_id,
                                                course_year_id: 2,
                                                semester_id: 1,
                                                stu_adm_type_id: regData.stu_adm_type_id,
                                                stu_adm_type_id: resRow.stu_adm_type_id || regData.stu_adm_type_id || null,
                                                stu_acad_status_id: 1,
                                                stu_study_status_id: 1,
                                                stu_violation_type_id: 1,
                                                registration_process_id: 1, //for ug 1 otherwiae 2
                                                registration_type_id: 1, //
                                                registration_status_id: 1,
                                                result_finalize: '4',
                                                reset_status: 'N',
                                                transcript_gen_yn: 'N',
                                                pdc_gen_yn: 'N',
                                                degree_gen_yn: 'N',
                                                is_finalize_yn: 'N',
                                                clearance_eligible: 'N',
                                                action_ip_address: sessionDetails.ip_address,
                                                action_by: sessionDetails.user_id,
                                                action_type: "I",
                                                action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss")
                                            };

                                            SHARED_SERVICE.validateAndInsertInTable(
                                                dbTranKey,
                                                request,
                                                insertObj,
                                                sessionDetails,
                                                function (err4, res4) {
                                                    if (err4) return cbDetail(err4);
                                                    console.log("Inserted ID:", res4.data.insertId);
                                                    // Continue to next row
                                                    // return cbDetail();


                                                    let acadFetchSql = `
                                    SELECT 
                                        counseling_academic_exam_name_id, 
                                        board_university_name, 
                                        passing_year_id, 
                                        percentage, 
                                        degree_programme_id, 
                                        subject_id, 
                                        group_code_pba, 
                                        remarks, 
                                        roll_no, 
                                        total_marks, 
                                        obtained_marks
                                    FROM igkv_admission.a_stu_couns_app_academic_detail_old
                                    WHERE student_cid = ?
                                    AND application_flag_status_id = 'V';
                                `;

                                                    let acadParams = [
                                                        resRow.seat_allotment.student_cid
                                                    ];

                                                    dbTranKey.connectionobj.query(acadFetchSql, acadParams, function (err5, acadRows) {
                                                        if (err5) return cbDetail(err5);

                                                        if (!acadRows || acadRows.length === 0) {
                                                            console.log("No academic detail found, skipping.");
                                                            return cbDetail();  // continue next row
                                                        }

                                                        console.log("Academic rows:", acadRows.length);

                                                        async.eachSeries(acadRows, function (acad, cbAcad) {

                                                            let insertAcadObj = {
                                                                table_name: "a_student_academic_detail",
                                                                admission_id: row.Counseling_Record_ID,
                                                                student_id: row.uidn,
                                                                admission_session: row.academic_session_id,

                                                                counseling_academic_exam_name_id: acad.counseling_academic_exam_name_id,
                                                                board_university_name: acad.board_university_name,
                                                                year_of_passing: acad.passing_year_id,
                                                                ogpa_percent_marks: acad.percentage,
                                                                degree_id: acad.degree_programme_id,
                                                                subject_id: acad.subject_id || null,
                                                                group_code: acad.group_code_pba,
                                                                remarks: acad.remarks === "" ? null : acad.remarks,
                                                                roll_no: acad.roll_no,
                                                                total_marks: acad.total_marks,
                                                                obtained_marks: acad.obtained_marks,

                                                                action_ip_address: sessionDetails.ip_address,
                                                                action_by: sessionDetails.user_id,
                                                                action_type: "I",
                                                                action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss")
                                                            };

                                                            SHARED_SERVICE.validateAndInsertInTable(
                                                                dbTranKey,
                                                                request,
                                                                insertAcadObj,
                                                                sessionDetails,
                                                                function (err6, res6) {
                                                                    if (err6) return cbAcad(err6);

                                                                    console.log("Inserted academic row:", res6.data.insertId);
                                                                    return cbAcad();
                                                                }
                                                            );

                                                        }, function (errLoop) {
                                                            if (errLoop) return cbDetail(errLoop);

                                                            // academic step finished
                                                            // return cbDetail();
                                                            let basicFetchSql = `
                                         SELECT
                                        sm.candidate_father_name, sm.candidate_mother_name, sm.candidate_father_name_h,sm.candidate_mother_name_h,
                                        sm.applicant_guardian_name_e, sm.applicant_husband_name_e, sm.permanent_address1,sm.permanent_address2,
                                        CONCAT_WS(' ', bl_p.block_name_e,  COALESCE(dt_p.district_name_e, sm.permanent_district_name),  st_p.state_name_e
                                        ) AS permanent_address_locality,
                                        sm.permanent_pin_code, sm.permanent_block_id,sm.permanent_district_id, sm.permanent_state_id,  sm.permanent_country_name_id, sm.current_address1, sm.current_address2,
                                        CONCAT_WS(' ',
                                            bl_c.block_name_e, COALESCE(dt_c.district_name_e, sm.current_district_name), st_c.state_name_e
                                        ) AS current_address_locality, sm.current_pin_code, sm.current_block_id, sm.current_district_id,
                                        sm.current_state_id, sm.current_country_name_id, sm.mobile_no_1,
                                        sm.nationality_yn
                                        -- 'N'                    AS some_flag,
                                        -- @ases_id               AS academic_session_id
                                        FROM igkv_admission.a_stu_couns_app_main_old sm
                                        LEFT JOIN lg_state     st_p ON st_p.state_code    = sm.permanent_state_id
                                        LEFT JOIN lg_state     st_c ON st_c.state_code    = sm.current_state_id
                                        LEFT JOIN lg_district  dt_p ON dt_p.district_code = sm.permanent_district_id
                                        LEFT JOIN lg_district  dt_c ON dt_c.district_code = sm.current_district_id
                                        LEFT JOIN lg_block     bl_p ON bl_p.block_code    = sm.permanent_block_id
                                        LEFT JOIN lg_block     bl_c ON bl_c.block_code    = sm.current_block_id
                                        WHERE
                                         sm.student_cid = ?
                                         AND sm.academic_session_id = ?
                                        AND sm.application_flag_status_id = 'V';
                                `;

                                                            let basicParams = [
                                                                resRow.seat_allotment.student_cid,
                                                                row.academic_session_id
                                                            ];

                                                            dbTranKey.connectionobj.query(basicFetchSql, basicParams, function (err5, basicRows) {
                                                                if (err5) return cbDetail(err5);

                                                                if (!basicRows || basicRows.length === 0) {
                                                                    console.log("No academic detail found, skipping.");
                                                                    return cbDetail();  // continue next row
                                                                }

                                                                console.log("Academic rows:", basicRows.length);

                                                                async.eachSeries(basicRows, function (brow, cbAcad) {

                                                                    let basicInsertObj = {
                                                                        table_name: "A_Student_Basic_Details",

                                                                        admission_id: row.Counseling_Record_ID,
                                                                        student_id: row.uidn,
                                                                        father_name_e: brow.candidate_father_name || null,
                                                                        mother_name_e: brow.candidate_mother_name || null,
                                                                        father_name_h: brow.candidate_father_name_h || null,
                                                                        mother_name_h: brow.candidate_mother_name_h || null,
                                                                        guardian_name_e: brow.applicant_guardian_name_e || null,
                                                                        student_husband_name_e: brow.applicant_husband_name_e || null,

                                                                        permanent_address1: brow.permanent_address1 || null,
                                                                        permanent_address2: brow.permanent_address2 || null,

                                                                        permanent_pin_code: brow.permanent_pin_code || null,
                                                                        permanent_block_id: brow.permanent_block_id || null,
                                                                        permanent_district_id: brow.permanent_district_id || null,
                                                                        permanent_state_id: brow.permanent_state_id || null,
                                                                        permanent_country_id: brow.permanent_country_name_id || null,

                                                                        current_address1: brow.current_address1 || null,
                                                                        current_address2: brow.current_address2 || null,

                                                                        current_pin_code: brow.current_pin_code || null,
                                                                        current_block_id: brow.current_block_id || null,
                                                                        current_district_id: brow.current_district_id || null,
                                                                        current_state_id: brow.current_state_id || null,
                                                                        current_country_id: brow.current_country_name_id || null,
                                                                        residential_contact_no: brow.mobile_no_1 ? String(brow.mobile_no_1) : null,
                                                                        nationality: brow.nationality_yn || 'Indian',
                                                                        is_finalize_yn: 'N',
                                                                        admission_session: row.academic_session_id
                                                                    };

                                                                    SHARED_SERVICE.validateAndInsertInTable(
                                                                        dbTranKey,
                                                                        request,
                                                                        basicInsertObj,
                                                                        sessionDetails,
                                                                        function (err6, res6) {
                                                                            if (err6) return cbAcad(err6);

                                                                            console.log("Inserted basic detail row:", res6.data.insertId);
                                                                            return cbAcad();
                                                                        }
                                                                    );

                                                                }, function (errLoop) {
                                                                    if (errLoop) return cbDetail(errLoop);

                                                                    // academic step finished
                                                                    // return cbDetail();
                                                                    let counsFetchSql = `
                                    SELECT  sm.overall_rank,
                                            cr.admitted_category_id,cr.admitted_spcategory_id,cr.admitted_cast_class_id,cr.entrance_exam_roll_no,sm.registrationdate,sm.reg_no,cr.seat_allotment_date,cr.counseling_adm_id,cr.faculty_id,cr.degree_programme_id,cr.subject_id,cr.student_cid,cr.entrance_exam_type_code,cr.counseling_series_master_code,cr.college_id,cr.verified_category_id,cr.admsn_quota_id,cr.basic_category_id,sm.doc_verified_by,sm.verified_gender_remark,sm.dvc_status,sm.dvc_reject_remark,sm.doc_verification_date,sm.dob_verify_status,sm.basic_detail_remark,sm.remark,sm.gender_verify_status,sm.basic_detail_verify_status,sm.counseling_form_path,sm.basic_detail_verification_remark_id,sm.gender_verification_remark_id,sm.dob_verification_remark_id,sm.dvc_center_id
                                        FROM igkv_admission.a_stu_couns_app_main_old sm
                                        INNER JOIN igkv_admission.a_stu_couns_seat_allotment_old cr 
                                            ON cr.student_cid = sm.student_cid
                                        AND cr.academic_session_id = sm.academic_session_id
                                        AND cr.entrance_exam_type_code = sm.entrance_exam_type_code
                                        WHERE sm.student_cid = ?
                                        AND  sm.academic_session_id = ?
                                        AND sm.application_flag_status_id = 'V';
                                `;

                                                                    let counsParams = [
                                                                        resRow.seat_allotment.student_cid,
                                                                        row.academic_session_id
                                                                    ];

                                                                    dbTranKey.connectionobj.query(counsFetchSql, counsParams, function (err5, counsRows) {
                                                                        if (err5) return cbDetail(err5);

                                                                        if (!counsRows || counsRows.length === 0) {
                                                                            console.log("No counselling detail found, skipping.");
                                                                            return cbDetail();  // continue next row
                                                                        }

                                                                        async.eachSeries(counsRows, function (crow, cbAcad) {

                                                                            let counselingInsertObj = {
                                                                                table_name: "a_student_counseling_details",

                                                                                admission_id: row.Counseling_Record_ID,
                                                                                student_id: row.uidn,
                                                                                counseling_record_id: row.Counseling_Record_ID,
                                                                                admitted_category_id: crow.admitted_category_id,
                                                                                overall_rank: crow.overall_rank,
                                                                                special_category_id: crow.admitted_spcategory_id,
                                                                                cast_class_id: crow.admitted_cast_class_id,
                                                                                roll_no: crow.entrance_exam_roll_no,
                                                                                registration_date: crow.registrationdate,
                                                                                registration_no: crow.reg_no,
                                                                                seat_allotment_date: crow.seat_allotment_date,
                                                                                counseling_adm_id: crow.counseling_adm_id,
                                                                                faculty_id: crow.faculty_id,
                                                                                degree_id: crow.degree_programme_id,
                                                                                subject_id: crow.subject_id,
                                                                                student_cid: crow.student_cid,
                                                                                entrance_exam_type_code: crow.entrance_exam_type_code,
                                                                                counseling_series_master_code: crow.counseling_series_master_code,
                                                                                college_id: crow.college_id,
                                                                                verified_category_code: crow.verified_category_id,
                                                                                admsn_quota_id: crow.admsn_quota_id,
                                                                                basic_category_id: crow.basic_category_id,
                                                                                doc_verified_by: crow.doc_verified_by,
                                                                                verified_gender_remark: crow.verified_gender_remark === "" ? null : crow.verified_gender_remark,
                                                                                dvc_status: crow.dvc_status,
                                                                                dvc_reject_remark: crow.dvc_reject_remark,
                                                                                doc_verification_date: crow.doc_verification_date,
                                                                                dob_verify_status: crow.dob_verify_status,
                                                                                basic_detail_remark: crow.basic_detail_remark === "" ? null : crow.verified_gender_remark,
                                                                                // basic_detail_remark: crow.basic_detail_remark,
                                                                                remark: crow.remark,
                                                                                gender_verify_status: crow.gender_verify_status,
                                                                                basic_detail_verify_status: crow.basic_detail_verify_status,
                                                                                counseling_form_path: crow.counseling_form_path,
                                                                                basic_detail_verification_remark_id: crow.basic_detail_verification_remark_id,
                                                                                gender_verification_remark_id: crow.gender_verification_remark_id,
                                                                                dob_verification_remark_id: crow.dob_verification_remark_id,
                                                                                dvc_center_id: crow.dvc_center_id,
                                                                                fee_paid_for_spot_counseling: crow.fee_paid_for_spot_counseling,
                                                                                fee_paid_for_spot_counseling_created_by: crow.fee_paid_for_spot_counseling_created_by,
                                                                                fee_paid_for_spot_counseling_created_date: crow.fee_paid_for_spot_counseling_created_date,
                                                                                fee_amount_paid_at_spot_counseling: crow.fee_amount_paid_at_spot_counseling,
                                                                                admission_session: row.academic_session_id
                                                                            };

                                                                            SHARED_SERVICE.validateAndInsertInTable(
                                                                                dbTranKey,
                                                                                request,
                                                                                counselingInsertObj,
                                                                                sessionDetails,
                                                                                function (err6, res6) {
                                                                                    if (err6) return cbAcad(err6);

                                                                                    console.log("Inserted counseling detail row:", res6.data.insertId);
                                                                                    return cbAcad();
                                                                                }
                                                                            );

                                                                        }, function (errLoop) {
                                                                            if (errLoop) return cbDetail(errLoop);

                                                                            // academic step finished
                                                                            // return cbDetail();
                                                                            let docFetchSql = `
                                                SELECT  document_no,isverified_yn,issubmitted_yn,ispending_yn,remark,file_path
                                        from igkv_admission.a_stu_couns_app_document_detail_old
                                        where student_cid = ? and application_flag_status_id = 'v'
                                            `;

                                                                            let docParams = [
                                                                                resRow.seat_allotment.student_cid,
                                                                            ];

                                                                            dbTranKey.connectionobj.query(docFetchSql, docParams, function (err5, docRows) {
                                                                                if (err5) return cbDetail(err5);

                                                                                if (!docRows || docRows.length === 0) {
                                                                                    console.log("No document  detail found, skipping.");
                                                                                    return cbDetail();  // continue next row
                                                                                }

                                                                                async.eachSeries(docRows, function (drow, cbAcad) {

                                                                                    let documentsertObj = {
                                                                                        table_name: "A_Student_Document_Detail",

                                                                                        admission_id: row.Counseling_Record_ID,
                                                                                        student_id: row.uidn,
                                                                                        document_id: drow.document_no,
                                                                                        isverified_yn: drow.isverified_yn,
                                                                                        issubmitted_yn: drow.issubmitted_yn,
                                                                                        ispending_yn: drow.ispending_yn,
                                                                                        remark: drow.remark === "" ? null : drow.remark,
                                                                                        file_path: drow.file_path === "" ? null : drow.file_path,
                                                                                        action_type: "C",
                                                                                        action_by: sessionDetails.user_id,
                                                                                        action_ip_address: sessionDetails.ip_address,
                                                                                        admission_session: row.academic_session_id,
                                                                                    };

                                                                                    SHARED_SERVICE.validateAndInsertInTable(
                                                                                        dbTranKey,
                                                                                        request,
                                                                                        documentsertObj,
                                                                                        sessionDetails,
                                                                                        function (err6, res6) {
                                                                                            if (err6) return cbAcad(err6);

                                                                                            console.log("Inserted document detail row:", res6.data.insertId);
                                                                                            return cbAcad();
                                                                                        }
                                                                                    );

                                                                                }, function (errLoop) {
                                                                                    if (errLoop) return cbDetail(errLoop);

                                                                                    // academic step finished
                                                                                    // return cbDetail();
                                                                                    let empFetchSql = `
                                               select dept_name, post_held, date_of_joining, date_of_leaving, reason_for_leaving
                                        from igkv_admission.a_stu_couns_app_employement_detail
                                        WHERE -- student_cid = ? and 
                                        application_flag_status_id = 'V'
                                            `;

                                                                                    let empParams = [
                                                                                        resRow.seat_allotment.student_cid,
                                                                                    ];

                                                                                    dbTranKey.connectionobj.query(empFetchSql, empParams, function (err5, empRows) {
                                                                                        if (err5) return cbDetail(err5);

                                                                                        if (!empRows || empRows.length === 0) {
                                                                                            console.log("No document  detail found, skipping.");
                                                                                            return cbDetail();  // continue next row
                                                                                        }

                                                                                        async.eachSeries(empRows, function (erow, cbAcad) {

                                                                                            let empsertObj = {
                                                                                                table_name: "a_student_employment_detail",

                                                                                                admission_id: row.Counseling_Record_ID,
                                                                                                student_id: row.uidn,
                                                                                                document_id: erow.document_no,
                                                                                                isverified_yn: erow.isverified_yn,
                                                                                                issubmitted_yn: erow.issubmitted_yn,
                                                                                                ispending_yn: erow.ispending_yn,
                                                                                                remark: erow.remark === "" ? null : erow.remark,
                                                                                                file_path: erow.file_path === "" ? null : erow.file_path,

                                                                                                action_type: "C",
                                                                                                action_by: sessionDetails.user_id,
                                                                                                action_ip_address: sessionDetails.ip_address,
                                                                                                admission_session: row.academic_session_id,
                                                                                            };
                                                                                            SHARED_SERVICE.validateAndInsertInTable(
                                                                                                dbTranKey,
                                                                                                request,
                                                                                                empsertObj,
                                                                                                sessionDetails,
                                                                                                function (err6, res6) {
                                                                                                    if (err6) return cbAcad(err6);
                                                                                                    console.log("Inserted Employee Detail row:", res6.data.insertId);
                                                                                                    return cbAcad();
                                                                                                }
                                                                                            );

                                                                                        }, function (errLoop) {
                                                                                            if (errLoop) return cbDetail(errLoop);

                                                                                            // academic step finished
                                                                                            // return cbDetail();
                                                                                            let castFetchSql = `
                                         SELECT
                                            cast_class_id
                                            FROM
                                                igkv_admission.a_stu_couns_app_class_detail
                                            WHERE student_cid = ? AND application_flag_status_id = 'V';
                                            `;

                                                                                            let castParams = [
                                                                                                resRow.seat_allotment.student_cid,
                                                                                            ];

                                                                                            dbTranKey.connectionobj.query(castFetchSql, castParams, function (err5, castRows) {
                                                                                                if (err5) return cbDetail(err5);

                                                                                                if (!castRows || castRows.length === 0) {
                                                                                                    console.log("No cast  detail found, skipping.");
                                                                                                    return cbDetail();  // continue next row
                                                                                                }

                                                                                                async.eachSeries(castRows, function (ctrow, cbAcad) {

                                                                                                    let castcalssisertObj = {
                                                                                                        table_name: "A_Student_Cast_Class_Detail",

                                                                                                        admission_id: row.Counseling_Record_ID,
                                                                                                        student_id: row.uidn,
                                                                                                        cast_class_id: ctrow.cast_class_id,
                                                                                                        action_type: "C",
                                                                                                        action_by: sessionDetails.user_id,
                                                                                                        action_ip_address: sessionDetails.ip_address,
                                                                                                        admission_session: row.academic_session_id,
                                                                                                    };
                                                                                                    SHARED_SERVICE.validateAndInsertInTable(
                                                                                                        dbTranKey,
                                                                                                        request,
                                                                                                        castcalssisertObj,
                                                                                                        sessionDetails,
                                                                                                        function (err6, res6) {
                                                                                                            if (err6) return cbAcad(err6);
                                                                                                            console.log("Inserted cast Detail row:", res6.data.insertId);
                                                                                                            return cbAcad();
                                                                                                        }
                                                                                                    );

                                                                                                }, function (errLoop) {
                                                                                                    if (errLoop) return cbDetail(errLoop);

                                                                                                    // academic step finished
                                                                                                    // return cbDetail();
                                                                                                    let catgryFetchSql = `
                                                        SELECT
                                                            src.spcategory_id
                                                        FROM
                                                            igkv_admission.a_stu_couns_app_spcategory_detail src
                                                        WHERE
                                                            src.student_cid = ?
                                                            AND src.application_flag_status_id = 'V';
                                            `;

                                                                                                    let catrgyParams = [
                                                                                                        resRow.seat_allotment.student_cid,
                                                                                                    ];

                                                                                                    dbTranKey.connectionobj.query(catgryFetchSql, catrgyParams, function (err5, catgryRows) {
                                                                                                        if (err5) return cbDetail(err5);

                                                                                                        if (!catgryRows || catgryRows.length === 0) {
                                                                                                            console.log("No sp category  detail found, skipping.");
                                                                                                            return cbDetail();  // continue next row
                                                                                                        }

                                                                                                        async.eachSeries(catgryRows, function (ctgrow, cbAcad) {

                                                                                                            let catgryntsertObj = {
                                                                                                                table_name: "a_student_special_category_detail",

                                                                                                                admission_id: row.Counseling_Record_ID,
                                                                                                                student_id: row.uidn,
                                                                                                                spcategory_id: ctgrow.spcategory_id,
                                                                                                                action_type: "C",
                                                                                                                action_by: sessionDetails.user_id,
                                                                                                                action_ip_address: sessionDetails.ip_address,
                                                                                                                admission_session: row.academic_session_id,
                                                                                                            };
                                                                                                            SHARED_SERVICE.validateAndInsertInTable(
                                                                                                                dbTranKey,
                                                                                                                request,
                                                                                                                catgryntsertObj,
                                                                                                                sessionDetails,
                                                                                                                function (err6, res6) {
                                                                                                                    if (err6) return cbAcad(err6);
                                                                                                                    console.log("Inserted sp category Detail row:", res6.data.insertId);
                                                                                                                    return cbAcad();
                                                                                                                }
                                                                                                            );

                                                                                                        }, function (errLoop) {
                                                                                                            if (errLoop) return cbDetail(errLoop);

                                                                                                            // academic step finished
                                                                                                            // return cbDetail();
                                                                                                            let catgryFetchSql = `
                                                        select a.admission_session, a.academic_session_id, a.faculty_id, a.college_id, a.dean_committee_id, a.degree_id, a.student_id,a.subject_id, a.course_year_id, 1 as exam_type_id, a.semester_id, a.ue_id, a.admission_id, a.stu_adm_type_id, a.stu_acad_status_id, a.stu_study_status_id, a.stu_violation_type_id, 2 as registration_status_id
                                                        from a_student_master a
                                                        left join a_student_registration_main b ON b.student_master_id = a.student_id
                                                            and b.delete_flag = 'N'
                                                            and b.academic_session_id = ?
                                                        where a.admission_session = ?
                                                            and a.college_id = ?
                                                            and a.degree_id = ?
                                                            and b.student_master_id is null;
                                            `;

                                                                                                            let catrgyParams = [
                                                                                                                row.academic_session_id,
                                                                                                                row.academic_session_id,
                                                                                                                row.college_id,
                                                                                                                row.degree_programme_id

                                                                                                            ];

                                                                                                            dbTranKey.connectionobj.query(catgryFetchSql, catrgyParams, function (err5, catgryRows) {
                                                                                                                if (err5) return cbDetail(err5);

                                                                                                                if (!catgryRows || catgryRows.length === 0) {
                                                                                                                    console.log("No sp category  detail found, skipping.");
                                                                                                                    return cbDetail();  // continue next row
                                                                                                                }

                                                                                                                async.eachSeries(catgryRows, function (ctgrow, cbAcad) {

                                                                                                                    let registrationObj = {
                                                                                                                        table_name: "A_Student_Registration_Main",

                                                                                                                        admission_session: row.academic_session_id,
                                                                                                                        academic_session_id: row.academic_session_id,
                                                                                                                        student_id: row.uidn,
                                                                                                                        ue_id: row.ue_id,
                                                                                                                        admission_id: row.Counseling_Record_ID,
                                                                                                                        faculty_id: ctgrow.faculty_id || null,
                                                                                                                        college_id: ctgrow.college_id,
                                                                                                                        dean_committee_id: ctgrow.dean_committee_id,
                                                                                                                        degree_id: ctgrow.degree_id,
                                                                                                                        subject_id: ctgrow.subject_id,
                                                                                                                        course_year_id: ctgrow.course_year_id,
                                                                                                                        exam_type_id: ctgrow.exam_type_id,
                                                                                                                        semester_id: ctgrow.semester_id,

                                                                                                                        stu_adm_type_id: ctgrow.stu_adm_type_id,
                                                                                                                        stu_acad_status_id: ctgrow.stu_acad_status_id,
                                                                                                                        stu_study_status_id: ctgrow.stu_study_status_id,
                                                                                                                        stu_violation_type_id: ctgrow.stu_violation_type_id,
                                                                                                                        registration_status_id: ctgrow.registration_status_id,
                                                                                                                        action_type: "C",
                                                                                                                        action_by: sessionDetails.user_id,
                                                                                                                        action_ip_address: sessionDetails.ip_address,
                                                                                                                    };
                                                                                                                    SHARED_SERVICE.validateAndInsertInTable(
                                                                                                                        dbTranKey,
                                                                                                                        request,
                                                                                                                        registrationObj,
                                                                                                                        sessionDetails,
                                                                                                                        function (err6, res6) {
                                                                                                                            if (err6) return cbAcad(err6);
                                                                                                                            console.log("Inserted sp category Detail row:", res6.data.insertId);
                                                                                                                            return cbAcad();
                                                                                                                        }
                                                                                                                    );

                                                                                                                }, function (errLoop) {
                                                                                                                    if (errLoop) return cbDetail(errLoop);

                                                                                                                    // academic step finished
                                                                                                                    return cbDetail();
                                                                                                                });

                                                                                                            });
                                                                                                        });

                                                                                                    });
                                                                                                });

                                                                                            });
                                                                                        });

                                                                                    });
                                                                                });

                                                                            });
                                                                        });

                                                                    });
                                                                });

                                                            });
                                                        });

                                                    });

                                                }
                                            );

                                        });

                                    }
                                );
                            }
                        );
                    });

                }, function (err) {
                    return cback(err);
                });
            },


            // 4️⃣ COMMIT TRANSACTION
            function (cback) {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function (err) {
                    return cback(err);
                });
            }

        ], function (err) {

            if (err) {
                return DB_SERVICE.rollbackPartialTransaction(
                    tranObj,
                    tranCallback,
                    function () {
                        return callback({
                            error: true,
                            message: "Error in UIDN approval process",
                            details: err
                        });
                    }
                );
            }

            return callback({
                error: false,
                message: "UIDN check + seat allotment fetch completed successfully.",
                result: finalResult
            });
        });
    },

    // * get Student Login Detail for password change API we are use that query
    getStudentLoginDetail: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    //^ update student new password
    studentPasswordReset: function (dbkey, request, params, sessionDetails, callback) {
        let tranObj, tranCallback, student, password, new_password;
        async.series([
            // Step 1: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },
            function (cback1) {
                let sessionDetails_1 = { ...sessionDetails, query_id: 348 };
                studentProfileService.getStudentLoginDetail(dbkey, request, params, sessionDetails_1, async (err, res) => {
                    if (err) return cback1(err.message || err);
                    else if (res && res?.length > 0) {
                        student = res;
                        return cback1(null);
                    } else {
                        return cback1({ message: `Password Reset Failed User Not Validate!` });
                    }
                })
            },
            function (cback2) {
                new_password = COMMON_SERVICE.generateRandomPassword();
                // let password = encryptPassword(new_password);
                ENCRYPTION_SERVICE.encryptPassword(new_password)
                    .then(passwordHash => {
                        password = passwordHash;
                        cback2(null);
                    })
                    .catch(err => {
                        console.error('Password encryption error:', err);
                        return cback2(err);
                    });
            },
            // Step 2:  //^ update student new password
            function (cback2) {
                let updateParams = {
                    update_table_name: 'student_login',
                    updateObj: {
                        password: password,
                        // lastpasswordupdatedate: format(new Date(student.action_date), 'yyyy-MM-dd HH:mm:ss'),
                        lastpasswordupdatedate: student.action_date,
                        oldpassword: student.password,
                        action_ip_address: sessionDetails.ip_address,
                        action_by: sessionDetails.user_id,
                        action_type: 'U',
                        action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                    },
                    whereObj: {
                        ue_id: params?.ue_id,
                        delete_flag: 'N'
                    }
                };

                SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                    if (err) return cback2(err.message || err);
                    else if (res && res.length > 0) {
                        return cback2();
                    } else {
                        return cback2({ message: `Password reset failed due to some internal error!` });
                    }
                });
            },
        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err.message || err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Password Reset Successfully Done!.', new_password: new_password });
                });
            }
        });
    },

    // * get student list for address change
    getStudentListForAddressChange: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // * get student profile address details
    getStudentProfileAddressDetails: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // ^ update student profile address details
    updateStudentProfileAddressDetails: function (dbkey, request, params, sessionDetails, callback) {
        let tranObj, tranCallback, studentAddressUpdateDetail, status;
        async.series([
            //* Step 1: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },
            //~ Step 2: if user rejected then update address status 'R'
            function (cback1) {
                if (Array.isArray(params)) {
                    if (params[0]?.action === 'reject') {
                        status = 'R';
                    } else if (params[0]?.action === 'approve') {
                        if (Number(params[0]?.correction_status) === 1 || Number(params[1]?.correction_status) == 1) {
                            status = 'A';
                        }
                    } else {
                        status = 'R';
                    }
                    let updateParams = {
                        update_table_name: 'a_student_address_edit',
                        updateObj: {
                            complain_status_par: status,
                            action_ip_address: sessionDetails.ip_address,
                            action_by: sessionDetails.user_id,
                            action_type: 'U',
                            action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                        },
                        whereObj: {
                            id: params[0]?.id,
                            ue_id: params[0]?.ue_id,
                        }
                    };
                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                        if (err) return cback1(err);
                        else if (res && res.length > 0) {
                            return cback1(null);
                        } else {
                            return cback1({ message: `No record updated in a_student_address_edit` });
                        }
                    });
                } else {
                    return cback1({ message: 'Invalid parameters format. Expected an array.' });
                }
            },
            // * get student profile address details
            function (cback2) {
                if (status === 'A') {
                    let sessionDetails_n = { sessionDetails, query_id: 327 }
                    DB_SERVICE.getQueryDataFromId(dbkey, request, { ...params, ...params[0] }, sessionDetails_n, function (err, res) {
                        if (err) return cback2(err);
                        else if (res && res.length > 0) {
                            // console.log("studentAddressUpdateDetail : ", res);
                            studentAddressUpdateDetail = res[0];
                            return cback2(null);
                        } else {
                            return cback2({ message: `No records Found` });
                        }
                    });
                } else {
                    return cback2(null);
                }
            },
            // ^ Step 3: update student address details
            function (cback3) {
                if (status === 'A') {
                    let updateObj = {};
                    params.forEach(item => {
                        const isApproved = (item.action === 'approve' && Number(item.correction_status) === 1);
                        if (!isApproved) return;
                        //* Permanent Address
                        if (item.titleid === 'p') {
                            updateObj = {
                                ...updateObj,
                                permanent_address1: studentAddressUpdateDetail.permanent_address1,
                                permanent_address2: studentAddressUpdateDetail.permanent_address2,
                                permanent_address3: studentAddressUpdateDetail.permanent_address3,
                                permanent_block_id: studentAddressUpdateDetail.permanent_block_id,
                                permanent_district_id: studentAddressUpdateDetail.permanent_district_id,
                                permanent_state_id: studentAddressUpdateDetail.permanent_state_id,
                                permanent_country_id: studentAddressUpdateDetail.permanent_country_id,
                                permanent_pin_code: studentAddressUpdateDetail.permanent_pin_code,
                            };
                        }
                        //* Current Address
                        if (item.titleid === 'c') {
                            updateObj = {
                                ...updateObj,
                                current_address1: studentAddressUpdateDetail.current_address1,
                                current_address2: studentAddressUpdateDetail.current_address2,
                                current_address3: studentAddressUpdateDetail.current_address3,
                                current_block_id: studentAddressUpdateDetail.current_block_id,
                                current_district_id: studentAddressUpdateDetail.current_district_id,
                                current_state_id: studentAddressUpdateDetail.current_state_id,
                                current_country_id: studentAddressUpdateDetail.current_country_id,
                                current_pin_code: studentAddressUpdateDetail.current_pin_code,
                            };
                        }
                    });

                    if (Object.keys(updateObj).length === 0) {
                        return cback3({ message: "No approved address found to update." });
                    }
                    let updateParams = {
                        update_table_name: "a_student_basic_details",
                        updateObj: {
                            ...updateObj,
                            action_ip_address: sessionDetails.ip_address,
                            action_by: sessionDetails.user_id,
                            action_type: "U",
                            action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss")
                        },
                        whereObj: {
                            student_id: params[0].student_id
                        }
                    };
                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                        if (err) return cback3(err);
                        else if (res && res.length > 0) {
                            return cback3(null);
                        } else {
                            return cback3({ message: `No record updated in a_student_address_edit` });
                        }
                    });
                } else {
                    return cback3(null);
                }
            }
        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err.message || err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Address Updated Successfully.' });
                });
            }
        });
    },

    // ^ Update student mobile number
    updateStudentMobileNumber: function (dbkey, request, params, sessionDetails, callback) {
        let tranObj, tranCallback;
        async.series([
            //* Step 1: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },

            //^ Step 2: a_student_master mobile_no
            function (cback1) {
                // console.log("params ===>>> ", params);
                let updateParams = {
                    update_table_name: "a_student_master",
                    updateObj: {
                        mobile_no: params.mobile_no,
                        action_ip_address: sessionDetails.ip_address,
                        action_by: sessionDetails.user_id,
                        action_type: "U",
                        action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss")
                    },
                    whereObj: {
                        ue_id: params.ue_id
                    }
                };
                SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                    if (err) return cback1(err);
                    else if (res && res.length > 0) {
                        return cback1(null);
                    } else {
                        return cback1({ message: `No record updated in a_student_address_edit` });
                    }
                });
            },
        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err.message || err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Mobile Number Updated Successfully.' });
                });
            }
        });
    },

    // TODO under process
    updateStudentCategory: function (dbkey, request, params, sessionDetails, callback) {
        if (!request.files) return callback(new Error("No file provided"));

        console.log("request.files ===>>> ", request.files);

        let tranObj, tranCallback;
        async.series([
            //* Step 1: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },
            function (cback1) {
                // console.log("params ==> ", params);
                // console.log("-----------------sds----------------------------------");
                // let relativePath = COMMON_SERVICE.moveFile(
                //     request?.files?.file,
                //     "student_profile",
                //     "category_proof",
                //     params.ue_id,
                //     "student_corner",
                //     ".pdf"
                // );

                COMMON_SERVICE.moveFile(
                    request?.files?.file,
                    "student_profile",
                    "category_proof",
                    params.ue_id || 0,
                    "student_corner/profile/category_proof",
                    { allowed: ['.pdf'] },
                    (err, res) => {
                        if (err) return cback1(err.message || err);
                        else if (res) {
                            relativePath = res.relativePath;
                            return cback1(null);
                        } else {
                            return cback1({ message: `Fail to save File` });
                        }
                    });

                // console.log("relativePath : ", relativePath);
                // return cback1(null);
            },

            //^ Step 2: a_student_master mobile_no
            function (cback1) {
                // console.log("params ===>>> ", params);
                // let updateParams = {
                //     update_table_name: "a_student_master",
                //     updateObj: {
                //         mobile_no: params.mobile_no,
                //         action_ip_address: sessionDetails.ip_address,
                //         action_by: sessionDetails.user_id,
                //         action_type: "U",
                //         action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss")
                //     },
                //     whereObj: {
                //         ue_id: params.ue_id
                //     }
                // };
                // SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                //     if (err) return cback1(err);
                //     else if (res && res.length > 0) {
                //         return cback1(null);
                //     } else {
                //         return cback1({ message: `No record updated in a_student_address_edit` });
                //     }
                // });
                return cback1(null);
            },
        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err.message || err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Category Updated Successfully.' });
                });
            }
        });
    },

    // * get degree list for SRC
    getDegreeListForSRC: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // * get SCR list
    getSRCList: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // * get student list for PDC
    getStudentListForPDC: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // TODO generate PDC => certificate number not shown
    generatePDC: function (dbkey, request, params, sessionDetails, callback) {
        const { error } = FILE_REPORT_VALIDATOR.generatePDC(params);
        if (error) {
            callback({ message: `Validation Error: ${error.details[0].message}` });
            return;
        }
        if (params?.students?.length === 0) {
            callback({ message: `Select Atleast one student` });
            return;
        }
        let tranObj, tranCallback, studentsDetail;
        async.series([
            //* Step 1: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },
            // ? step 2: make student data array
            function (cback0) {
                studentsDetail = params?.students.map(student => ({
                    ue_id: student.ue_id,
                    degree_id: params.degree_id,
                    degree_programme_type_id: params.degree_programme_type_id,
                    degree_programme_id: params.degree_programme_id,
                    academic_session_id: params.academic_session_id,
                    degree_completed_session: student.degree_completed_session,
                    admission_session: student.admission_session,
                    college_id: params.college_id,
                    file_path: '',
                    certificate_number: ''
                }));
                return cback0(null);
            },
            //^ step 3: Update PDC generation flag in a_student_current table
            function (cback1) {
                async.each(studentsDetail, function (student, cb) {
                    let updateParams = {
                        update_table_name: "a_student_current",
                        updateObj: {
                            pdc_gen_yn: 'Y',
                            action_ip_address: sessionDetails.ip_address,
                            action_by: sessionDetails.user_id,
                            pdc_generated_by: sessionDetails.user_id,
                            action_type: "U",
                            action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                            pdc_generated_date: format(new Date(), "yyyy-MM-dd HH:mm:ss")
                        },
                        whereObj: {
                            ue_id: student.ue_id,
                            degree_id: student.degree_id,
                            academic_session_id: student.degree_completed_session,
                            admission_session: student.admission_session,
                            delete_flag: 'N'
                        }
                    };
                    // console.log("updateParams ===>>>> ", updateParams);
                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                        if (err) return cb(err.message || err);
                        else if (res && res.length > 0) {
                            return cb(null);
                        } else {
                            return cb({ message: `Record update failed in a_student_current of ue_id : ${student.ue_id}` });
                        }
                    });
                },
                    function (err) {
                        return cback1(err);
                    });
            },
            //~ Step 4: Genrate PDC
            function (cback2) {
                async.each(studentsDetail,
                    function (student, cb) {
                        FILE_SERVICE?.provisionalDegreeCertificatePdf(dbkey, request,
                            {
                                ue_id: student.ue_id
                            }, sessionDetails,
                            function (err, res) {
                                if (err) return cb(err);
                                else if (res && res.buffer) {
                                    // let relativePath = COMMON_SERVICE.moveFile(
                                    //     res.buffer, // file
                                    //     "pdc", // title
                                    //     params.degree_programme_type_id, // sub-title
                                    //     student.ue_id, // primary key
                                    //     "student_corner/results/pdc", // folder name
                                    //     ".pdf" // extension,
                                    // );
                                    // // ⭐ Save file_path inside studentsDetail
                                    // student.file_path = relativePath;
                                    // return cb(null);
                                    COMMON_SERVICE.moveFile(
                                        res.buffer, // file
                                        "pdc",
                                        params.degree_programme_type_id,
                                        student.ue_id,
                                        "student_corner/results/pdc",
                                        { allowed: ['.pdf'] },
                                        (err, res) => {
                                            if (err) return cb(err.message || err);
                                            else if (res) {
                                                student.file_path = res.relativePath;
                                                return cb(null);
                                            } else {
                                                return cb({ message: `Fail to save File` });
                                            }
                                        });
                                } else {
                                    return cb({ message: `Transcript file Generation Failed, ue_id is: ${student.ue_id}` });
                                }
                            });
                    },
                    function (err) {
                        return cback2(err);
                    });
            },
            // ? step 5: generate certificate_number and insert in a_certificate table
            function (cback3) {
                async.eachSeries(studentsDetail, function (student, cb) {

                    // 1️⃣ Fetch certificate number
                    studentProfileService.getCertificateNumber(dbkey, request, insertParams, { ...sessionDetails, query_id: 362 }, function (err, res) {
                        if (err) return cb(err.message || err);

                        if (!res || res.length === 0) {
                            return cb({ message: `Certificate Number generation failed for ue_id: ${student.ue_id}` });
                        }

                        student.certificate_number = res[0].certificate_number;

                        // 2️⃣ Insert into a_certificates
                        const insertParams = {
                            table_name: 'a_certificates',
                            ue_id: student.ue_id,
                            degree_id: student.degree_id,
                            academic_session_id: student.degree_completed_session,
                            certificate_type: 2,
                            file_path: student.file_path,
                            certificate_number: student.certificate_number,
                            is_certificate_signed: 'N',
                            generated_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                            generated_session_id: student.degree_completed_session
                        };

                        SHARED_SERVICE.validateAndInsertInTable(dbkey, request, insertParams, sessionDetails, function (err2, result) {
                            if (err2) return cb(err2.message || err2);

                            if (!result || !result.data || result.data.affectedRows !== 1) {
                                return cb({ message: `Insertion failed in a_certificates for ue_id: ${student.ue_id}` });
                            }

                            // 3️⃣ Callback only once, after both steps succeed
                            return cb(null);
                        });
                    });

                }, function (err) {
                    return cback3(err);
                });
            },

        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err.message || err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'PDC Generated Successfully.' });
                });
            }
        });
    },

    // ! delete PDC
    deletePDC: function (dbkey, request, params, sessionDetails, callback) {
        params = { ...params, students: JSON.parse(params?.students) }
        const { error } = FILE_REPORT_VALIDATOR.deletePDC(params);
        if (error) {
            callback({ message: `Validation Error: ${error.details[0].message}` });
            return;
        }
        if (params?.students?.length === 0) {
            callback({ message: `Select Atleast one student` });
            return;
        }
        let tranObj, tranCallback, studentsDetail;
        async.series([
            //* Step 1: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },
            // ? step 2: make student data array
            function (cback0) {
                studentsDetail = params?.students.map(student => ({
                    ue_id: student.ue_id,
                    degree_id: params.degree_id,
                    degree_programme_type_id: params.degree_programme_type_id,
                    degree_programme_id: params.degree_programme_id,
                    academic_session_id: params.academic_session_id,
                    degree_completed_session: student.degree_completed_session,
                    admission_session: student.admission_session,
                    college_id: params.college_id,
                    certificate_number: student.certificate_number,
                    certificate_id: student.certificate_id
                }));
                return cback0(null);
            },
            //^ Update transcript generation flag in a_student_current table
            function (cback1) {
                async.each(studentsDetail, function (student, cb) {
                    let updateParams = {
                        update_table_name: "a_student_current",
                        updateObj: {
                            pdc_gen_yn: 'N',
                            action_ip_address: sessionDetails.ip_address,
                            action_by: sessionDetails.user_id,
                            action_type: "U",
                            action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                        },
                        whereObj: {
                            ue_id: student.ue_id,
                            degree_id: student.degree_id,
                            academic_session_id: student.degree_completed_session,
                            admission_session: student.admission_session,
                            delete_flag: 'N'
                        }
                    };
                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                        if (err) return cb(err.message || err);
                        else if (res && res.length > 0) {
                            return cb(null);
                        } else {
                            return cb({ message: `Record delete failed in a_student_current of ue_id : ${student.ue_id}` });
                        }
                    });
                },
                    function (err) {
                        return cback1(err);
                    });
            },
            // ? generate certificate_number and insert in a_certificate table
            function (cback1) {
                async.eachSeries(studentsDetail, function (student, cb) {
                    // update delete flag of a_certificates
                    const updateParams2 = {
                        update_table_name: 'a_certificates',
                        updateObj: {
                            delete_flag: 'Y',
                            active_status: 'N',
                            action_type: "D",
                            action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                            action_ip_address: sessionDetails.ip_address,
                            action_by: sessionDetails.user_id,
                        },
                        whereObj: {
                            ue_id: student.ue_id,
                            degree_id: student.degree_id,
                            academic_session_id: student.degree_completed_session,
                            certificate_id: student.certificate_id,
                            delete_flag: 'N'
                        }
                    };
                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams2, sessionDetails, function (err2, result) {
                        if (err2) return cb(err2.message || err2);
                        else if (result && result.length > 0) {
                            return cb(null);
                        } else {
                            return cb({ message: `Record delete failed in a_certificates of ue_id : ${student.ue_id}` });
                        }
                    });
                }, function (err) {
                    return cback1(err);
                });
            },
        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err.message || err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'PDC Deleted Successfully.' });
                });
            }
        });
    },

    // ^ esign PDC 
    pdcEsign: function (dbkey, request, params, sessionDetails, callback) {
        const { error } = FILE_REPORT_VALIDATOR.pdcEsign(params);
        if (error) {
            callback({ message: `Validation Error: ${error.details[0].message}` });
            return;
        }
        if (params?.students?.length === 0) {
            callback({ message: `Select Atleast one student` });
            return;
        }
        let tranObj, tranCallback;
        async.series([
            //* Step 1: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },
            // ? generate update in a_certificate table
            function (cback3) {
                async.eachSeries(params.students, function (student, cb) {
                    DOC_UPLOAD_SERVICE.base64ToPdf(dbkey, request,
                        { ...params, file_path: student.file_path, file_name: student.file_name }, sessionDetails,
                        function (err, res) {
                            if (err) {
                                return cb(err);
                            } else if (res) {
                                const updateParams2 = {
                                    update_table_name: 'a_certificates',
                                    updateObj: {
                                        file_path: res.file_path,
                                        is_certificate_signed: 'Y',
                                        signed_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                                        action_type: "U",
                                        action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                                        action_ip_address: sessionDetails.ip_address,
                                        action_by: sessionDetails.user_id,
                                        signed_by: sessionDetails.user_id
                                    },
                                    whereObj: {
                                        ue_id: student.ue_id,
                                        degree_id: student.degree_id,
                                        academic_session_id: student.degree_completed_session,
                                        certificate_id: student.certificate_id,
                                        delete_flag: 'N'
                                    }
                                };
                                SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams2, sessionDetails, function (err2, result) {
                                    if (err2) return cb(err2.message || err2);
                                    else if (result && result.length > 0) {
                                        return cb(null);
                                    } else {
                                        return cb({ message: `Record esign failed in a_certificates of ue_id : ${student.ue_id}` });
                                    }
                                });
                            }
                        });
                }, function (err) {
                    return cback3(err);
                });
            },

        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err.message || err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'PDC E-Sign Done Successfully.' });
                });
            }
        });
    },

    // * get student list for trascript
    getStudentListForTranscript: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // TODO generate trascript => certificate number not shown
    generateTranscript: function (dbkey, request, params, sessionDetails, callback) {
        const { error } = FILE_REPORT_VALIDATOR.generateTranscript(params);
        if (error) {
            callback({ message: `Validation Error: ${error.details[0].message}` });
            return;
        }
        if (params?.students?.length === 0) {
            callback({ message: `Select Atleast one student` });
            return;
        }
        let tranObj, tranCallback, studentsDetail;
        async.series([
            //* Step 1: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },
            // ? step 2: make student data array
            function (cback0) {
                studentsDetail = params?.students.map(student => ({
                    ue_id: student.ue_id,
                    degree_id: params.degree_id,
                    degree_programme_type_id: params.degree_programme_type_id,
                    degree_programme_id: params.degree_programme_id,
                    academic_session_id: params.academic_session_id,
                    degree_completed_session: student.degree_completed_session,
                    college_id: params.college_id,
                    file_path: '',
                    certificate_number: ''
                }));
                return cback0(null);
            },
            //^ step 3: Update transcript generation flag in a_student_current table
            function (cback1) {
                async.each(studentsDetail, function (student, cb) {
                    let updateParams = {
                        update_table_name: "a_student_current",
                        updateObj: {
                            transcript_gen_yn: 'Y',
                            action_ip_address: sessionDetails.ip_address,
                            action_by: sessionDetails.user_id,
                            transcript_generated_by: sessionDetails.user_id,
                            action_type: "U",
                            action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                            transcript_generated_date: format(new Date(), "yyyy-MM-dd HH:mm:ss")
                        },
                        whereObj: {
                            ue_id: student.ue_id,
                            degree_id: student.degree_id,
                            academic_session_id: student.degree_completed_session,
                            admission_session: student.academic_session_id,
                            delete_flag: 'N'
                        }
                    };
                    // console.log("updateParams ===>>>> ", updateParams);
                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                        if (err) return cb(err.message || err);
                        else if (res && res.length > 0) {
                            return cb(null);
                        } else {
                            return cb({ message: `Record update failed in a_student_current of ue_id : ${student.ue_id}` });
                        }
                    });
                },
                    function (err) {
                        return cback1(err);
                    });
            },
            //~ Step 4: Genrate Trasript
            function (cback2) {
                async.each(studentsDetail,
                    function (student, cb) {
                        FILE_SERVICE?.transcriptPdf(dbkey, request,
                            {
                                ue_id: student.ue_id,
                                degree_programme_id: student.degree_programme_id
                            }, sessionDetails,
                            function (err, res) {
                                if (err) return cb(err);
                                else if (res && res.buffer) {
                                    // let relativePath = COMMON_SERVICE.moveFile(
                                    //     res.buffer, // file
                                    //     "trascript", // title
                                    //     params.degree_programme_type_id, // sub-title
                                    //     student.ue_id, // primary key
                                    //     "student_corner/results/trascript", // folder name
                                    //     ".pdf" // extension,
                                    // );
                                    // // ⭐ Save file_path inside studentsDetail
                                    // student.file_path = relativePath;
                                    // // console.log("relativePath : ", relativePath);
                                    // return cb(null);
                                    COMMON_SERVICE.moveFile(
                                        res.buffer, // file
                                        "trascript",
                                        params.degree_programme_type_id,
                                        student.ue_id,
                                        "student_corner/results/trascript",
                                        { allowed: ['.pdf'] },
                                        (err, res) => {
                                            if (err) return cb(err.message || err);
                                            else if (res) {
                                                student.file_path = res.relativePath;
                                                return cb(null);
                                            } else {
                                                return cb({ message: `Fail to save File` });
                                            }
                                        });
                                } else {
                                    return cb({ message: `Transcript file Generation Failed, ue_id is: ${student.ue_id}` });
                                }
                            });
                    },
                    function (err) {
                        return cback2(err);
                    });
            },
            // ? step 5: generate certificate_number and insert in a_certificate table
            function (cback3) {
                async.eachSeries(studentsDetail, function (student, cb) {
                    // 1️⃣ Fetch certificate number
                    studentProfileService.getCertificateNumber(dbkey, request, insertParams, { ...sessionDetails, query_id: 362 }, function (err, res) {
                        if (err) return cb(err.message || err);

                        if (!res || res.length === 0) {
                            return cb({ message: `Certificate Number generation failed for ue_id: ${student.ue_id}` });
                        }

                        student.certificate_number = res[0].certificate_number;

                        // 2️⃣ Insert into a_certificates
                        const insertParams = {
                            table_name: 'a_certificates',
                            ue_id: student.ue_id,
                            degree_id: student.degree_id,
                            academic_session_id: student.degree_completed_session,
                            certificate_type: 3,
                            file_path: student.file_path,
                            certificate_number: student.certificate_number,
                            is_certificate_signed: 'N',
                            generated_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                            generated_session_id: student.degree_completed_session
                        };

                        SHARED_SERVICE.validateAndInsertInTable(dbkey, request, insertParams, sessionDetails, function (err2, result) {
                            if (err2) return cb(err2.message || err2);

                            if (!result || !result.data || result.data.affectedRows !== 1) {
                                return cb({ message: `Insertion failed in a_certificates for ue_id: ${student.ue_id}` });
                            }
                            // 3️⃣ Callback only once, after both steps succeed
                            return cb(null);
                        });
                    });

                }, function (err) {
                    return cback3(err);
                });
            },

        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err.message || err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Transcript Generated Successfully.' });
                });
            }
        });
    },

    // ! delete transcript
    deleteTranscript: function (dbkey, request, params, sessionDetails, callback) {
        params = { ...params, students: JSON.parse(params?.students) }
        const { error } = FILE_REPORT_VALIDATOR.deleteTranscript(params);
        if (error) {
            callback({ message: `Validation Error: ${error.details[0].message}` });
            return;
        }
        if (params?.students?.length === 0) {
            callback({ message: `Select Atleast one student` });
            return;
        }
        let tranObj, tranCallback, studentsDetail;
        async.series([
            //* Step 1: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },
            // ? step 2: make student data array
            function (cback0) {
                studentsDetail = params?.students.map(student => ({
                    ue_id: student.ue_id,
                    degree_id: params.degree_id,
                    degree_programme_type_id: params.degree_programme_type_id,
                    degree_programme_id: params.degree_programme_id,
                    academic_session_id: params.academic_session_id,
                    degree_completed_session: student.degree_completed_session,
                    college_id: params.college_id,
                    certificate_number: student.certificate_number,
                    certificate_id: student.certificate_id
                }));
                return cback0(null);
            },
            //^ Update transcript generation flag in a_student_current table
            function (cback1) {
                async.each(studentsDetail, function (student, cb) {
                    let updateParams = {
                        update_table_name: "a_student_current",
                        updateObj: {
                            transcript_gen_yn: 'N',
                            action_ip_address: sessionDetails.ip_address,
                            action_by: sessionDetails.user_id,
                            action_type: "U",
                            action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                        },
                        whereObj: {
                            ue_id: student.ue_id,
                            degree_id: student.degree_id,
                            academic_session_id: student.degree_completed_session,
                            admission_session: student.academic_session_id,
                            delete_flag: 'N'
                        }
                    };
                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                        if (err) return cb(err.message || err);
                        else if (res && res.length > 0) {
                            return cb(null);
                        } else {
                            return cb({ message: `Record delete failed in a_student_current of ue_id : ${student.ue_id}` });
                        }
                    });
                },
                    function (err) {
                        return cback1(err);
                    });
            },
            // ? generate certificate_number and insert in a_certificate table
            function (cback1) {
                async.eachSeries(studentsDetail, function (student, cb) {
                    // update delete flag of a_certificates
                    const updateParams2 = {
                        update_table_name: 'a_certificates',
                        updateObj: {
                            delete_flag: 'Y',
                            active_status: 'N',
                            action_type: "D",
                            action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                            action_ip_address: sessionDetails.ip_address,
                            action_by: sessionDetails.user_id,
                        },
                        whereObj: {
                            ue_id: student.ue_id,
                            degree_id: student.degree_id,
                            academic_session_id: student.degree_completed_session,
                            certificate_id: student.certificate_id,
                            delete_flag: 'N'
                        }
                    };
                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams2, sessionDetails, function (err2, result) {
                        if (err2) return cb(err2.message || err2);
                        else if (result && result.length > 0) {
                            return cb(null);
                        } else {
                            return cb({ message: `Record delete failed in a_certificates of ue_id : ${student.ue_id}` });
                        }
                    });
                }, function (err) {
                    return cback1(err);
                });
            },
        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err.message || err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Transcript Deleted Successfully.' });
                });
            }
        });
    },

    // ^ esign trascript
    transcriptEsign: function (dbkey, request, params, sessionDetails, callback) {
        const { error } = FILE_REPORT_VALIDATOR.transcriptEsign(params);
        if (error) {
            callback({ message: `Validation Error: ${error.details[0].message}` });
            return;
        }
        if (params?.students?.length === 0) {
            callback({ message: `Select Atleast one student` });
            return;
        }
        let tranObj, tranCallback;
        async.series([
            //* Step 1: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },
            // ? generate update in a_certificate table
            function (cback3) {
                async.eachSeries(params.students, function (student, cb) {
                    DOC_UPLOAD_SERVICE.base64ToPdf(dbkey, request,
                        { ...params, file_path: student.file_path, file_name: student.file_name }, sessionDetails,
                        function (err, res) {
                            if (err) {
                                return cb(err);
                            } else if (res) {
                                const updateParams2 = {
                                    update_table_name: 'a_certificates',
                                    updateObj: {
                                        file_path: res.file_path,
                                        is_certificate_signed: 'Y',
                                        signed_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                                        action_type: "U",
                                        action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                                        action_ip_address: sessionDetails.ip_address,
                                        action_by: sessionDetails.user_id,
                                        signed_by: sessionDetails.user_id
                                    },
                                    whereObj: {
                                        ue_id: student.ue_id,
                                        degree_id: student.degree_id,
                                        academic_session_id: student.degree_completed_session,
                                        certificate_id: student.certificate_id,
                                        delete_flag: 'N'
                                    }
                                };
                                SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams2, sessionDetails, function (err2, result) {
                                    if (err2) return cb(err2.message || err2);
                                    else if (result && result.length > 0) {
                                        return cb(null);
                                    } else {
                                        return cb({ message: `Record esign failed in a_certificates of ue_id : ${student.ue_id}` });
                                    }
                                });
                            }
                        });
                }, function (err) {
                    return cback3(err);
                });
            },

        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err.message || err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Transcript E-Sign Done Successfully.' });
                });
            }
        });
    },

    // * get student profile details
    getStudentProfile: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // TODO under process
    updateStudentBasicDetails: function (dbkey, request, params, sessionDetails, callback) {
        if (!request.files) return callback({ message: "No file provided." });
        let tranObj, tranCallback, relativePath;
        async.series([
            //* Step 1: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },
            function (cback1) {
                // relativePath = COMMON_SERVICE.moveFile(
                //     request?.files?.file,
                //     "student_profile",
                //     "document_proof",
                //     params.ue_id,
                //     "student_corner/profile",
                //     ".pdf"
                // );
                // return cback1(null);
                COMMON_SERVICE.moveFile(
                    request?.files?.file, // file
                    "student_profile",
                    "document_proof",
                    params.ue_id,
                    "student_corner/profile",
                    { allowed: ['.pdf'] },
                    (err, res) => {
                        if (err) return cback1(err.message || err);
                        else if (res) {
                            relativePath = res.relativePath;
                            return cback1(null);
                        } else {
                            return cback1({ message: `Fail to save File` });
                        }
                    });
            },

            //^ Step 2: a_student_master mobile_no
            function (cback1) {
                // let updateParams = {
                //     update_table_name: "a_student_master",
                //     updateObj: {
                //         mobile_no: params.mobile_no,
                //         action_ip_address: sessionDetails.ip_address,
                //         action_by: sessionDetails.user_id,
                //         action_type: "U",
                //         action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss")
                //     },
                //     whereObj: {
                //         ue_id: params.ue_id
                //     }
                // };
                // SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                //     if (err) return cback1(err);
                //     else if (res && res.length > 0) {
                //         return cback1(null);
                //     } else {
                //         return cback1({ message: `No record updated in a_student_address_edit` });
                //     }
                // });
                return cback1(null);
            },
        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err.message || err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Basic Details Updated Successfully.' });
                });
            }
        });
    },

    // * get Student Profile Edit Report Dashboard
    getStudentProfileEditReportDashboard: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // * get Student List For Basic Details Change
    getStudentListForBasicDetailsChange: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // * get Certificate Number for all type certificates query_id = 362
    getCertificateNumber: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // * get student list for college transfer
    getStudentListForCollegeTransfer: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // * get college transferred student list
    getCollegeTransferredStudentList: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // ^ student college transfer done
    studentCollegeTransfer: function (dbkey, request, params, sessionDetails, callback) {
        const { error } = STUDENT_PROFILE_VALIDATOR.registrationCardSheet(params);
        if (error) {
            callback({ message: `Validation Error: ${error.details[0].message}` });
            return;
        }
        let { degree_programme_type_id,
            degree_programme_id,
            degree_id,
            subject_id,
            new_college_id,
            old_college_id,
            ue_id,
            student_id,
            academic_session_id,
            course_year_id,
            semester_id,
            university_transfer_order_no }
            = params;
        let tranObj, tranCallback, studentsDetail, new_registration_id;
        async.series([
            //* Step 0: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },
            //^ step 1: Update new_college_id in "a_student_master" table
            function (cback1) {
                let updateParams = {
                    update_table_name: "a_student_master",
                    updateObj: {
                        college_id: new_college_id,
                        action_ip_address: sessionDetails.ip_address,
                        action_by: sessionDetails.user_id,
                        action_type: "U",
                        action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                        action_remark: 'College Transfer'
                    },
                    whereObj: {
                        ue_id: ue_id,
                        student_id: student_id,
                        degree_id: degree_id,
                        // subject_id: subject_id,
                        academic_session_id: academic_session_id,
                        delete_flag: 'N'
                    }
                };
                SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                    if (err) return cback1(err.message || err);
                    else if (res && res.length > 0) {
                        return cback1(null);
                    } else {
                        return cback1({ message: `Record update failed in a_student_master` });
                    }
                });
            },
            //? step 2: insert record in "student_college_transfer_record" table
            function (cback2) {
                let insertObj = {
                    table_name: 'student_college_transfer_record',
                    academic_session_id: academic_session_id,
                    ue_id: ue_id,
                    new_student_id: student_id,
                    old_student_id: student_id,

                    old_college_id: old_college_id,
                    new_college_id: new_college_id,
                    college_transfer_course_year_id: course_year_id,
                    college_transfer_semester_id: semester_id,
                    university_transfer_order_no: university_transfer_order_no,
                };
                SHARED_SERVICE.validateAndInsertInTable(dbkey, request, insertObj, sessionDetails, function (err, res) {
                    if (err) return cback2(err.message || err);
                    else if (res.data && res.data['insertId']) {
                        return cback2(null);
                    } else {
                        return cback2({ message: `Record insert failed in student_college_transfer_record` });
                    }
                });
            },
            //! step 3: Update delete_flag='Y' in "a_student_registration_main" table
            function (cback3) {
                let updateParams = {
                    update_table_name: "a_student_registration_main",
                    updateObj: {
                        action_ip_address: sessionDetails.ip_address,
                        action_by: sessionDetails.user_id,
                        action_type: "D",
                        active_status: 'N',
                        delete_flag: 'Y',
                        action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                        action_remark: 'College Transfer'
                    },
                    whereObj: {
                        ue_id: ue_id,
                        student_master_id: student_id,
                        degree_programme_id: degree_programme_id,
                        academic_session_id: academic_session_id,
                        delete_flag: 'N'
                    }
                };
                SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                    if (err) return cback3(err.message || err);
                    else if (res && res.length > 0) {
                        return cback3(null);
                    } else {
                        // return cback3(null); // ! use bewlow line after database correct done
                        return cback3({ message: `Record delete failed in a_student_registration_main` });
                        // ~ if comes that error means latest data not inserted in a_student_registration_main table
                    }
                });
            },
            // * step 4: get student details from 'a_student_registration_main' table
            function (cback3) {
                let sessionDetails_3 = { ...sessionDetails, query_id: 380 };
                studentProfileService.getStudentDetailsForCollegeTransfer(dbkey, request,
                    { ...params, college_id: params.old_college_id }, sessionDetails_3, async (err, res) => {
                        if (err) return cback3(err.message || err);
                        else if (res && res?.length > 0) {
                            studentsDetail = res[0];
                            // console.log("studentsDetail ==>>> ", studentsDetail);
                            return cback3(null);
                        } else {
                            // return cback3(null); // ! use bewlow line after database correct done
                            return cback3({ message: `No records Found in a_student_registration_main table.` });
                        }
                    })
            },
            //? step 5: insert record in "a_student_registration_main" table
            function (cback5) {
                if (!studentsDetail || Object.keys(studentsDetail).length === 0) {
                    return cback5({ message: `Student details not found for registration.` });
                } else {
                    let insertObj = {
                        table_name: 'a_student_registration_main',
                        previous_registration_id: studentsDetail.registration_id,
                        ue_id: ue_id,
                        student_master_id: student_id,
                        admission_id: studentsDetail.admission_id,
                        registration_date: studentsDetail.registration_date,
                        admission_session: studentsDetail.admission_session,
                        academic_session_id: studentsDetail.academic_session_id,
                        dean_committee_id: studentsDetail.dean_committee_id,
                        college_id: new_college_id,
                        degree_id: studentsDetail.degree_id,
                        degree_programme_id: studentsDetail.degree_programme_id,
                        course_year_id: studentsDetail.course_year_id,
                        semester_id: studentsDetail.semester_id,
                        section_id: studentsDetail.section_id,
                        counseling_reg_no: studentsDetail.counseling_reg_no,
                        exam_type_id: studentsDetail.exam_type_id,
                        stu_acad_status_id: studentsDetail.stu_acad_status_id,
                        stu_study_status_id: studentsDetail.stu_study_status_id,
                        stu_violation_type_id: studentsDetail.stu_violation_type_id,
                        registration_process_id: studentsDetail.registration_process_id,
                        registration_status_id: studentsDetail.registration_status_id,
                        batch_id: studentsDetail.batch_id,
                        thesis_title: studentsDetail.thesis_title,
                        degree_programme_id: degree_programme_id,
                        // subject_id: subject_id,
                        date_of_viva: studentsDetail.date_of_viva,
                        thesis_advisor_emp_id: studentsDetail.thesis_advisor_emp_id,
                        stu_max_sem_done: studentsDetail.stu_max_sem_done,
                        stu_min_sem_done: studentsDetail.stu_min_sem_done,
                        reset_round: studentsDetail.reset_round,
                        is_finalize_yn: studentsDetail.is_finalize_yn,
                        unfinalize_remark: studentsDetail.unfinalize_remark,
                        unfinalize_by: studentsDetail.unfinalize_by,
                        unfinalize_date: studentsDetail.unfinalize_date,
                        prevent_certificate_generation: studentsDetail.prevent_certificate_generation,
                        batch_academic_session_id: studentsDetail.batch_academic_session_id,
                        batch_semester_id: studentsDetail.batch_semester_id,
                        delete_flag: 'N',
                        action_ip_address: sessionDetails.ip_address,
                        action_by: sessionDetails.user_id,
                        action_type: "C",
                        active_status: 'Y',
                        action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                    };
                    SHARED_SERVICE.validateAndInsertInTable(dbkey, request, insertObj, sessionDetails, function (err, res) {
                        if (err) return cback5(err.message || err);
                        else if (res.data && res.data['insertId']) {
                            new_registration_id = res.data['insertId'];
                            return cback5(null);
                        } else {
                            return cback5({ message: `Record insert failed in student_college_transfer_record` });
                        }
                    });
                }
            },
            //! step 6: Update delete_flag='Y' in "a_marks_entry_detail" table
            function (cback6) {
                if (!studentsDetail || Object.keys(studentsDetail).length === 0) {
                    return cback6({ message: `Student details not found for registration.` });
                } else {
                    let updateParams = {
                        update_table_name: "a_marks_entry_detail",
                        updateObj: {
                            action_ip_address: sessionDetails.ip_address,
                            action_by: sessionDetails.user_id,
                            action_type: "D",
                            active_status: 'N',
                            delete_flag: 'Y',
                            action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                            action_remark: 'College Transfer'
                        },
                        whereObj: {
                            ue_id: ue_id,
                            registration_id: studentsDetail.registration_id,
                            academic_session_id: academic_session_id,
                            college_id: old_college_id,
                            delete_flag: 'N'
                        }
                    };
                    // console.log("updateParams <<<>>> ", updateParams);
                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                        if (err) return cback6(err.message || err);
                        else if (res && res.length > 0) {
                            return cback6(null);
                        } else {
                            return cback6(null);
                            // return cback6({ message: `Record delete failed in a_marks_entry_detail` });
                        }
                    });
                }
            },
            // ^ step 7: Update registration_id with new_registration_id 'a_student_registration_and_marks'
            function (cback7) {
                if (!studentsDetail || Object.keys(studentsDetail).length === 0) {
                    return cback7({ message: `Student details not found for registration.` });
                } else if (degree_programme_type_id == 1) {
                    let updateParams = {
                        update_table_name: "a_student_registration_and_marks",
                        updateObj: {
                            registration_id: new_registration_id,
                            action_ip_address: sessionDetails.ip_address,
                            action_by: sessionDetails.user_id,
                            action_type: "U",
                            action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                            action_remark: 'College Transfer'
                        },
                        whereObj: {
                            registration_id: studentsDetail.registration_id,
                            semester_id: semester_id,
                            course_year_id: course_year_id,
                            delete_flag: 'N'
                        }
                    };
                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                        if (err) return cback7(err.message || err);
                        else if (res && res.length > 0) {
                            return cback7(null);
                        } else {
                            return cback7(null);
                            // return cback7({ message: `Record update failed in a_student_registration_and_marks` });
                        }
                    });
                } else {
                    return cback7(null);
                }
            },
        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err.message || err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null,
                        {
                            ...securityService.SECURITY_ERRORS.SUCCESS,
                            message: 'Student College Transfer Successfully Done.'
                        });
                });
            }
        });
    },

    // * get student details for college transfer
    getStudentDetailsForCollegeTransfer: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // ^ update student profile photo or sign
    updateStudentProfileSignPhoto: function (dbkey, request, params, sessionDetails, callback) {
        if (!request.files) return callback(new Error("No file provided"));

        // console.log("request.files ===>>> ", request.files);

        let tranObj, tranCallback, relativePath;
        async.series([
            //* Step 1: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },
            function (cback1) {
                // console.log("params ==> ", params);
                // let fileType = extractFileType(request?.files?.image?.name);
                // console.log("file tyle => ", fileType);
                // console.log("-----------------sds----------------------------------");
                COMMON_SERVICE.moveFile(
                    request?.files?.image,
                    "photo",
                    "profile_photo",
                    params.ue_id || 0,
                    "student_corner/profile/photo",
                    { allowed: ['.png', '.jpg', '.jpeg'] },
                    (err, res) => {
                        if (err) return cback1(err.message || err);
                        else if (res) {
                            // console.log("=-----____", res);
                            relativePath = res.relativePath;
                            return cback1(null);
                        } else {
                            return cback1({ message: `Fail to save File` });
                        }
                    })
                // console.log("relativePath : ", relativePath);
                // return cback1(null, { filePath: relativePath });

            },

            //^ Step 2: a_student_master mobile_no
            function (cback1) {
                // console.log("params ===>>> ", params);
                // let updateParams = {
                //     update_table_name: "a_student_master",
                //     updateObj: {
                //         mobile_no: params.mobile_no,
                //         action_ip_address: sessionDetails.ip_address,
                //         action_by: sessionDetails.user_id,
                //         action_type: "U",
                //         action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss")
                //     },
                //     whereObj: {
                //         ue_id: params.ue_id
                //     }
                // };
                // SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                //     if (err) return cback1(err);
                //     else if (res && res.length > 0) {
                //         return cback1(null);
                //     } else {
                //         return cback1({ message: `No record updated in a_student_address_edit` });
                //     }
                // });
                return cback1(null);
            },
        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err.message || err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, {
                        ...securityService.SECURITY_ERRORS.SUCCESS,
                        message: `${params?.image_type == 'profile' ? 'Profile' : 'Signature'} Updated Successfully Done.`,
                        image_path: relativePath
                    });
                });
            }
        });
    },

    // TODO pending => delete SRC file (dummy code written)
    deleteSRC: function (dbkey, request, params, sessionDetails, callback) {
        const { error } = FILE_REPORT_VALIDATOR.deleteSRC(params);
        if (error) {
            callback({ message: `Validation Error: ${error.details[0].message}` });
            return;
        }
        let tranObj, tranCallback;
        async.series([
            //* Step 1: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },
            // ? generate update in a_student_registration_and_marks table
            function (cback3) {
                let updateParams2 = {
                    update_table_name: 'a_student_registration_and_marks',
                    updateObj: {
                        src_file_path: null,
                        action_type: "U",
                        action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                        action_ip_address: sessionDetails.ip_address,
                        action_by: sessionDetails.user_id
                    },
                    whereObj: {
                        ue_id: params.ue_id,
                        registration_id: params.registration_id,
                        student_master_id: params.student_master_id,
                        academic_session_id: params.academic_session_id,
                        delete_flag: 'N'
                    }
                };
                SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams2, sessionDetails, function (err2, result) {
                    if (err2) return cback3(err2.message || err2);
                    else if (result && result.length > 0) {
                        return cback3(null);
                    } else {
                        return cback3({ message: `No record updated in a_student_registration_and_marks` });
                    }
                });
            },

        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err.message || err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'SRC Deleted Successfully.' });
                });
            }
        });
    },

    // TODO pending => generate SRC file (dummy code written)
    generateSRC: function (dbkey, request, params, sessionDetails, callback) {
        const { error } = FILE_REPORT_VALIDATOR.generateSRC(params);
        if (error) {
            callback({ message: `Validation Error: ${error.details[0].message}` });
            return;
        }
        let tranObj, tranCallback, relativePath;
        async.series([
            //* Step 1: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },
            // ? generate move file
            function (cback1) {
                // console.log("-----------------sds----------------------------------");
                COMMON_SERVICE.moveFile(
                    request?.files?.src_file,
                    "src",
                    "student_src",
                    params.ue_id || 0,
                    "student_corner/src",
                    ".pdf",
                    (err, res) => {
                        if (err) return cback1(err.message || err);
                        else if (res) {
                            // console.log("=-----____", res);
                            relativePath = res.relativePath;
                            return cback1(null);
                        } else {
                            return cback1({ message: `Fail to save File` });
                        }
                    })
            },
            // ? generate update in a_student_registration_and_marks table
            function (cback3) {
                let updateParams2 = {
                    update_table_name: 'a_student_registration_and_marks',
                    updateObj: {
                        src_file_path: relativePath,
                        action_type: "U",
                        action_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
                        action_ip_address: sessionDetails.ip_address,
                        action_by: sessionDetails.user_id
                    },
                    whereObj: {
                        ue_id: params.ue_id,
                        registration_id: params.registration_id,
                        student_master_id: params.student_master_id,
                        academic_session_id: params.academic_session_id,
                        delete_flag: 'N'
                    }
                };
                SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams2, sessionDetails, function (err2, result) {
                    if (err2) return cback3(err2.message || err2);
                    else if (result && result.length > 0) {
                        return cback3(null);
                    } else {
                        return cback3({ message: `No record updated in a_student_registration_and_marks` });
                    }
                });
            },

        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err.message || err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, {
                        ...securityService.SECURITY_ERRORS.SUCCESS,
                        message: 'SRC Generated Successfully.',
                        src_file_path: relativePath
                    });
                });
            }
        });
    },

}
module.exports = studentProfileService 