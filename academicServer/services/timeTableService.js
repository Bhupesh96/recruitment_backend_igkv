var DB_SERVICE = global.DB_SERVICE;
var securityService = global.COMMON_SECURITY_SERVICE;
const DOC_UPLOAD_SERVICE = global.DOC_UPLOAD_SERVICE;
const SHARED_SERVICE = global.SHARED_SERVICE;
let format = require('date-format');
var async = require('async');

let timetable = {

    // * ////////////////// get course list ///////////////////
    getCourseListForTimeTable: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    //? //////////////save Exam Time Table ///////////////////
    saveExamTimeTable: function (dbkey, request, params, sessionDetails, callback) {
        // console.log("--------------------------------------ddddddddddddd----------------ddd---------------");
        let tranObj, tranCallback;
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
            // Step 2: Insert a_timetable_main
            function (cback1) {
                if (params.timetable_main_id === null || params.timetable_main_id === '' || params.timetable_main_id === 0) {
                    let updateParams = {
                        table_name: 'a_timetable_main',
                        academic_session_id: params.academic_session_id,
                        exam_type_id: params.exam_type_id,
                        course_year_id: params.course_year_id,
                        semester_id: params.semester_id,
                        degree_id: params.degree_id,
                        exam_paper_type_id: params.exam_paper_type_id,
                        is_finalize_yn: params.is_finalize_yn || 'N',
                        is_issue_yn: params.is_issue_yn || 'N',
                    }
                    SHARED_SERVICE.validateAndInsertInTable(dbkey, request, updateParams, sessionDetails, function (err, res) {
                        if (err) return cback1(err);
                        else if (res.data && res.data['insertId']) {
                            params.timetable_main_id = res.data['insertId']; // Primary key captured
                            return cback1();
                        } else {
                            return cback1({ message: 'Something went wrong inserting into a_timetable_main' });
                        }
                    });
                } else {
                    return cback1();
                }
            },
            // Step 3: Insert into a_timetable_detail
            function (cback2) {
                async.eachSeries(params.courserows, function (courseRow, cb) {
                    let insert_obj = {
                        table_name: 'a_timetable_detail',
                        timetable_main_id: params.timetable_main_id, // FK from main table
                        exam_shift_time_id: courseRow.exam_shift_time_id, // FK from main table

                        course_id: courseRow.course_id,
                        exam_date: courseRow.exam_date,
                        course_nature_id: courseRow.course_nature_id,
                        dean_committee_id: params.dean_committee_id,
                        is_finalize_yn: "N",
                        // action_by: sessionDetails['user_id'],
                        // action_ip_address: sessionDetails['ip_address']
                    };
                    SHARED_SERVICE.validateAndInsertInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                        if (err) return cb(err);
                        else if (res.data && res.data['insertId']) {
                            courseRow.allotment_detail_id = res.data['insertId']; // Capture PK for teacher mapping
                            return cb();
                        } else {
                            return cb({ message: 'Something went wrong inserting into course_allotment_detail' });
                        }
                    });
                }, function (err) {
                    return cback2(err);
                });
            },
        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Time Table saved successfully' });
                });
            }
        });
    },

    // ^ //////////////////Update Exam Time Table ///////////////////
    updateExamTimeTable: function (dbkey, request, params, sessionDetails, callback) {
        let tranObj, tranCallback;
        if (!params && !Array.isArray(params) || params.length < 1) {
            return callback({ message: "Select at least one record." });
        }
        async.series([
            // Step 1: Create Transaction
            function (cback) {
                DB_SERVICE.createTransaction(dbkey, function (err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    // console.log("dbkey====......> : ", dbkey);
                    return cback(err);
                });
            },
            // Step 2:  // Update a_timetable_detail table data
            function (cback2) {
                let updateParams = {
                    update_table_name: 'a_timetable_detail',
                    updateObj: {
                        exam_shift_time_id: params?.exam_shift_time_id,
                        exam_date: params?.exam_date.slice(0, 10),

                        action_ip_address: sessionDetails.ip_address,
                        action_by: sessionDetails.user_id,
                        action_type: 'U',
                        action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                    },
                    whereObj: {
                        timetable_detail_id: params?.timetable_detail_id,
                        timetable_main_id: params?.timetable_main_id,
                        course_id: params?.course_id,
                    }
                };

                SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                    if (err) return cback2(err.message || err);
                    else if (res && res.length > 0) {
                        return cback2();
                    } else {
                        return cback2({ message: `Update failed due to some internal error!` });
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
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Time Table Updated Successfully' });
                });
            }
        });

    },

    //! ////////////////// delete Exam Time Table ///////////////////
    deleteExamTimeTable: function (dbkey, request, params, sessionDetails, callback) {
        let tranObj, tranCallback;
        // console.log("params====......> : ", params);
        if (!params && !Array.isArray(params) || params.length < 1) {
            return callback({ message: "Select at least one record." });
        }
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
            // Step 2:  //! Delete a_timetable_detail table data
            function (cback2) {
                let updateParams = {
                    update_table_name: 'a_timetable_detail',
                    updateObj: {
                        action_ip_address: sessionDetails.ip_address,
                        action_by: sessionDetails.user_id,
                        delete_flag: 'Y',
                        action_type: 'D',
                        action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                    },
                    whereObj: {
                        timetable_detail_id: params?.timetable_detail_id,
                        timetable_main_id: params?.timetable_main_id,
                        course_id: params?.course_id,
                    }
                };

                SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                    if (err) return cback2(err.message || err);
                    else if (res && res.length > 0) {
                        return cback2();
                    } else {
                        return cback2({ message: `Delete failed due to some internal error!` });
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
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Time Table Deleted Successfully' });
                });
            }
        });
    },

}

module.exports = timetable