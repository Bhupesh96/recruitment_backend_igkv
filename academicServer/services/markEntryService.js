var DB_SERVICE = global.DB_SERVICE;
var securityService = global.COMMON_SECURITY_SERVICE;
const DOC_UPLOAD_SERVICE = global.DOC_UPLOAD_SERVICE;
const SHARED_SERVICE = global.SHARED_SERVICE;
const COMMON_SERVICE = global.COMMON_SERVICE;
var async = require('async');
let format = require('date-format');
const fs = require('fs')
const PuppeteerHTMLPDF = require('puppeteer-html-pdf');
const handlebars = require('handlebars');
// let { getStudentAttendanceList } = require("./attendanceService.js");

// ✅ Register custom helpers
handlebars.registerHelper('ifCond', function (v1, operator, v2, options) {
    switch (operator) {
        case '==': return (v1 == v2) ? options.fn(this) : options.inverse(this);
        case '===': return (v1 === v2) ? options.fn(this) : options.inverse(this);
        case '!=': return (v1 != v2) ? options.fn(this) : options.inverse(this);
        case '!==': return (v1 !== v2) ? options.fn(this) : options.inverse(this);
        case '<': return (v1 < v2) ? options.fn(this) : options.inverse(this);
        case '<=': return (v1 <= v2) ? options.fn(this) : options.inverse(this);
        case '>': return (v1 > v2) ? options.fn(this) : options.inverse(this);
        case '>=': return (v1 >= v2) ? options.fn(this) : options.inverse(this);
        default: return options.inverse(this);
    }
});

handlebars.registerHelper('eq', function (a, b) {
    return a === b;
});

handlebars.registerHelper('inc', function (value) {
    return parseInt(value, 10) + 1;
});

handlebars.registerHelper('hasSubColumn', function (subColumns, type, options) {
    return subColumns && subColumns[type] ? options.fn(this) : options.inverse(this);
});

let markEntry = {
    // ? ///////////////////// generate Result Notification ////////////////////////////////////
    generateResultNotification: function (dbkey, request, params, sessionDetails, callback) {
        let tranObj, tranCallback;
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
            //* insert exam_result_notification table data
            function (cback2) {
                // async.eachSeries(collection, iteratorFn, finalCallback)
                async.eachOfSeries(params?.data,
                    function (data, index, cb) {
                        let updateParams = {
                            table_name: 'exam_result_notification',
                            ...data
                        }
                        SHARED_SERVICE.validateAndInsertInTable(dbkey, request, updateParams, sessionDetails, function (err, res) {
                            if (err) return cb(err.message || err);
                            else if (res && res.data.affectedRows === 1) {
                                //^ ✅ Inject insertId directly into the data object
                                params.data[index].exam_result_notification_id = res.data.insertId;
                                return cb(null);
                            } else {
                                return cb({ message: `Insertion failed in exam_result_notification` });
                            }
                        });
                    },
                    function (err) {
                        return cback2(err);
                    });
            },
            function (cback3) {
                async.eachSeries(params.data, function (row, cb) {
                    let update_params = {
                        ...params,
                        ...row
                    }
                    if (params.valuation_type_id === 1) {
                        studentsForExamResultNotificationList_Evaluation(dbkey, request, update_params, sessionDetails, function (err, buffer) {
                            if (err) return cb(err);
                            if (!Buffer.isBuffer(buffer)) return cb(buffer); //! we get there error message there 

                            // let relativePath = COMMON_SERVICE.moveFile(
                            //     buffer,
                            //     "result_notification",
                            //     params.exam_type_name_e,
                            //     row.exam_result_notification_id,
                            //     "result_notification",
                            //     ".pdf"
                            // );
                            let relativePath
                            COMMON_SERVICE.moveFile(
                                buffer,
                                "result_notification",
                                params.exam_type_name_e,
                                row.exam_result_notification_id,
                                "result_notification",
                                { allowed: ['.pdf',] },
                                (err, res) => {
                                    if (err) return cb(err.message || err);
                                    else if (res) {
                                        // console.log("=-----____", res);
                                        relativePath = res.relativePath;
                                        return cb(null);
                                    } else {
                                        return cb({ message: `Fail to save File` });
                                    }
                                })

                            const updateParams = {
                                update_table_name: 'exam_result_notification',
                                updateObj: {
                                    declared_date: format(new Date(), 'yyyy-MM-dd'),
                                    is_declared: 'Y',
                                    // file_name: `result_notification_${row.exam_result_notification_id}.pdf`,
                                    file_path: relativePath || "",
                                    action_ip_address: sessionDetails.ip_address,
                                    action_by: sessionDetails.user_id,
                                    action_type: 'U',
                                    action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                                },
                                whereObj: {
                                    exam_result_notification_id: row.exam_result_notification_id
                                }
                            };

                            SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                                if (err) return cb(err.message || err);
                                if (!res || res.length === 0) return cb({ message: `No record updated in exam_result_notification` });
                                return cb(); // Done
                            });
                        });
                    } else if (params.valuation_type_id === 2) {
                        studentsForExamResultNotificationList_Revaluation(dbkey, request, update_params, sessionDetails, function (err, buffer) {
                            if (err) return cb(err);
                            if (!Buffer.isBuffer(buffer)) return cb(buffer); //! we get there error message there 

                            // let relativePath = COMMON_SERVICE.moveFile(
                            //     buffer,
                            //     "result_notification",
                            //     params.exam_type_name_e,
                            //     row.exam_result_notification_id,
                            //     "result_notification",
                            //     ".pdf"
                            // );
                            let relativePath;
                            COMMON_SERVICE.moveFile(
                                buffer,
                                "result_notification",
                                params.exam_type_name_e,
                                row.exam_result_notification_id,
                                "result_notification",
                                { allowed: ['.pdf',] },
                                (err, res) => {
                                    if (err) return cb(err.message || err);
                                    else if (res) {
                                        // console.log("=-----____", res);
                                        relativePath = res.relativePath;
                                        return cb(null);
                                    } else {
                                        return cb({ message: `Fail to save File` });
                                    }
                                });

                            const updateParams = {
                                update_table_name: 'exam_result_notification',
                                updateObj: {
                                    declared_date: format(new Date(), 'yyyy-MM-dd'),
                                    is_declared: 'Y',
                                    // file_name: `result_notification_${row.exam_result_notification_id}.pdf`,
                                    file_path: relativePath || "",
                                    action_ip_address: sessionDetails.ip_address,
                                    action_by: sessionDetails.user_id,
                                    action_type: 'U',
                                    action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                                },
                                whereObj: {
                                    exam_result_notification_id: row.exam_result_notification_id
                                }
                            };

                            SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                                if (err) return cb(err.message || err);
                                if (!res || res.length === 0) return cb({ message: `No record updated in exam_result_notification` });
                                return cb(); // Done
                            });
                        });
                    } else {
                        return cb(); // Done
                    }
                }, function (err) {
                    return cback3(err); // Final callback
                });
            }
        ], function (err, res) {
            if (err) {
                console.error("Transaction error:", err); // Debugging
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function (err4) {
                    return callback(err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function (err5) {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Result Notification Generated Successfully' });
                });
            }
        });
    },

    // * ///////////////////// generate Result Notification ////////////////////////////////////
    getExamResultNotificationList: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // * ///////////////////// generate Result Notification ////////////////////////////////////
    evaluationExamResultNotification: function (dbkey, request, params, sessionDetails, callback) {
        // console.log("sessionDetails : => ", sessionDetails);
        let { dean_committee_id, dean_committee_name_e, academic_session_name_e } = params
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, function (err, res) {
            if (err) {
                return callback(err);
            } else if (res && res.length > 0) {
                if (params.valuation_type_id === 1) {
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
                                    course_code: item.course_code,
                                    // section_name: item.section_name,
                                    is_finalize_yn: item.is_finalize_yn,
                                    course_registration_type_id: course_registration_type_id,
                                    coursesMap: {}
                                }
                            };
                        }
                        const courseCode = item.course_code;
                        const courseNature = item.course_nature;
                        const finalMarks = item.final_marks || "-";

                        // Add to student's course map
                        const coursesMap = groupedByStudent[key].student_info.coursesMap;

                        if (!coursesMap[courseCode]) {
                            coursesMap[courseCode] = {
                                course_code: courseCode,
                                T: null,
                                T_remark_id: null,
                                P: null,
                                P_remark_id: null
                            };
                        }

                        if (courseNature === 'T') {
                            coursesMap[courseCode].T = finalMarks;
                            coursesMap[courseCode].T_remark_id = item.remark_id;
                        } else if (courseNature === 'P') {
                            coursesMap[courseCode].P = finalMarks;
                            coursesMap[courseCode].P_remark_id = item.remark_id;
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

                    const studentList = Object.values(groupedByStudent).map(studentEntry => {
                        const studentInfo = studentEntry.student_info;

                        let FC_T = 0;
                        let FC_P = 0;

                        studentInfo.courses = Object.values(studentInfo.coursesMap).map(course => {
                            // Check Theory part
                            if (course.T !== null && course.T !== undefined && course.T_remark_id !== 1 && course.T_remark_id !== 7) {
                                FC_T++;
                            }

                            // Check Practical part
                            if (course.P !== null && course.P !== undefined && course.P_remark_id !== 1 && course.P_remark_id !== 7) {
                                FC_P++;
                            }

                            if (course.T === null) delete course.T;
                            if (course.P === null) delete course.P;
                            return course;
                        });

                        studentInfo.FC_T = FC_T;
                        studentInfo.FC_P = FC_P;

                        delete studentInfo.coursesMap;
                        return studentInfo;
                    });

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
                } else if (params.valuation_type_id === 2) {
                    let student = res[0];
                    callback(null, {
                        students: res,
                        heanders: {
                            college_id: student.college_id,
                            college_name_e: student.college_name_e,
                            degree_programme_name_e: student.degree_programme_name_e,
                            degree_programme_id: student.degree_programme_id,
                            dean_committee_name_e: dean_committee_name_e,
                            dean_committee_id: dean_committee_id,
                            academic_session_name_e: academic_session_name_e,
                            course_year_id: student.course_year_id,
                            course_year_name_e: student.course_year_name_e,
                            semester_name_e: student.semester_name_e,
                        }
                    });
                } else {
                    callback(null, res);
                }
            } else {
                callback({ message: `No data found` });
            }
        });
    },

    //! ////////////////// delete Exam Time Table ///////////////////
    deleteExamResultNotification: function (dbkey, request, params, sessionDetails, callback) {
        let tranObj, tranCallback;
        // console.log("params====......> : ", params);
        if (!params.exam_result_notification_id) {
            return callback({ message: "Select exam_result_notification_id for delete!" });
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
            // Step 2:  //! Delete exam_result_notification table data
            function (cback2) {
                let updateParams = {
                    update_table_name: 'exam_result_notification',
                    updateObj: {
                        action_ip_address: sessionDetails.ip_address,
                        action_by: sessionDetails.user_id,
                        delete_flag: 'Y',
                        action_type: 'D',
                        action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
                    },
                    whereObj: {
                        exam_result_notification_id: params?.exam_result_notification_id,
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
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Exam Time Table Deleted Successfully!' });
                });
            }
        });
    },

    // ^ ///////////////////// esign to result notification ////////////////////////////////////
    esignResultNotification: function (dbkey, request, params, sessionDetails, callback) {
        let tranObj, tranCallback;
        let tempFileLocations = [];
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
            function (cback2) {
                async.eachSeries(params?.data, function (element, cb) {
                    DOC_UPLOAD_SERVICE.base64ToPdf(dbkey, request,
                        { ...params, file_path: element.file_path, file_name: element.file_name }, sessionDetails,
                        function (err, res) {
                            if (err) {
                                return cb(err);
                            } else if (res) {
                                tempFileLocations.push(res.file_path);
                                return cb(); // Done
                            }
                        });
                }, function (err) {
                    return cback2(err); // Final callback
                });
            },
            function (cback3) {
                async.eachOfSeries(params?.data, function (element, index, cb) {
                    let updateParams = {
                        update_table_name: 'exam_result_notification',
                        updateObj: {
                            file_path: tempFileLocations[index],
                            signed_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
                            signed_by: sessionDetails.user_id,
                            is_notification_signed: 'Y',
                            action_ip_address: sessionDetails.ip_address,
                            action_by: sessionDetails.user_id,
                            action_type: 'U',
                            action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
                        },
                        whereObj: {
                            exam_result_notification_id: element.exam_result_notification_id
                        }
                    };

                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                        if (err) return cb(err);
                        else if (res && res.length > 0) {
                            return cb();
                        } else {
                            return cb({ message: `No record updated in exam_result_notification` });
                        }
                    });
                }, function (err) {
                    return cback3(err);
                });
            }
        ], function (err, res) {
            if (err) {
                console.error("Transaction error:", err); // Debugging
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function (err4) {
                    return callback(err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function (err5) {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'E-sign successfully done.' });
                });
            }
        });
    },

    // ^ ///////////////////// publish result notification ////////////////////////////////////
    publishResultNotification: function (dbkey, request, params, sessionDetails, callback) {
        let tranObj, tranCallback;
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
            function (cback3) {
                async.eachOfSeries(params?.data, function (element, index, cb) {
                    let updateParams = {
                        update_table_name: 'exam_result_notification',
                        updateObj: {
                            is_published: 'Y',
                            published_by: sessionDetails.user_id,
                            published_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
                            action_ip_address: sessionDetails.ip_address,
                            action_by: sessionDetails.user_id,
                            action_type: 'U',
                            action_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
                        },
                        whereObj: {
                            exam_result_notification_id: element.exam_result_notification_id
                        }
                    };
                    SHARED_SERVICE.insrtAndUpdtOperation(dbkey, request, updateParams, sessionDetails, function (err, res) {
                        if (err) return cb(err);
                        else if (res && res.length > 0) {
                            return cb();
                        } else {
                            return cb({ message: `No record updated in exam_result_notification` });
                        }
                    });
                }, function (err) {
                    return cback3(err);
                });
            }
        ], function (err, res) {
            if (err) {
                console.error("Transaction error:", err); // Debugging
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function (err4) {
                    return callback(err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function (err5) {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Result notification published successfully done.' });
                });
            }
        });
    },

}

module.exports = markEntry


function studentsForExamResultNotificationList_Evaluation(dbkey, request, params, sessionDetails, callback) {
    let landscape = params['orientation'] == 'landscape'
    let buffer;
    let pageInfo;
    async.series([
        function (cback) {
            let sessionDetails_0 = { ...sessionDetails, query_id: 223 };
            COMMON_SERVICE.getUniversityHeading(dbkey, request, params, sessionDetails_0, function (err, uniHtml) {
                if (err) return cback(err.message || err);
                pageInfo = uniHtml;
                return cback(null); // Proceed to next step
            });
        },
        function (cback2) {
            const raw_html = fs.readFileSync('assets/templates/academic/result_notification_evaluation.html', 'utf8');
            sessionDetails = { ...sessionDetails, query_id: 271 };
            let tempParam = {
                registration_status_id: 1,
                ...params
            }
            markEntry.evaluationExamResultNotification(dbkey, request, tempParam, sessionDetails, async function (err, res) {
                if (err) return cback2(err);

                if (res && res.students && res.students.length > 0) {
                    // Info fields
                    const infoFields = [
                        { label: 'College', valueKey: 'college_name_e', fullWidth: true },
                        { label: 'Degree Programme', valueKey: 'degree_programme_name_e' },
                        { label: 'Dean Committee', valueKey: 'dean_committee_name_e' },
                        { label: 'Session', valueKey: 'academic_session_name_e' },
                        { label: 'Year', valueKey: 'course_year_name_e' },
                        { label: 'Semester', valueKey: 'semester_name_e' }
                    ];

                    // Step 1: Group course codes and identify if they have T and/or P
                    const courseColumnMap = {};

                    res.courses.forEach(course => {
                        const code = course.course_code;
                        if (!courseColumnMap[code]) {
                            courseColumnMap[code] = { label: code, subColumns: {} };
                        }
                        if (course.T !== undefined) {
                            courseColumnMap[code].subColumns.T = `${code}_T`;
                        }
                        if (course.P !== undefined) {
                            courseColumnMap[code].subColumns.P = `${code}_P`;
                        }
                    });

                    // Step 2: Build table columns with nested structure
                    const tableColumns = [
                        { key: 'index', label: 'S.No.' },
                        { key: 'student_name', label: 'Student Name' },
                        { key: 'ue_id', label: 'UE ID' }
                    ];

                    Object.values(courseColumnMap).forEach(course => {
                        if (course.subColumns.T || course.subColumns.P) {
                            tableColumns.push({
                                label: course.label,
                                subColumns: course.subColumns
                            });
                        }
                    });

                    const groupedReports = {
                        'Regular Students': {
                            course_registration_type_id: 1,
                            course_registration_type_name_e: 'Regular Students',
                            degree_programme_name_e: '',
                            students: []
                        },
                        'Repeat Students': {
                            course_registration_type_id: 2,
                            course_registration_type_name_e: 'Repeat Students',
                            degree_programme_name_e: '',
                            students: []
                        }
                    };

                    res.students.forEach(stu => {
                        const groupKey = stu.course_registration_type_id === 1 ? 'Regular Students' : 'Repeat Students';

                        const row = {
                            ue_id: stu.ue_id,
                            student_name: stu.student_name,
                            FC_T: stu.FC_T,
                            FC_P: stu.FC_P
                        };

                        // Assign degree_programme_name only once (optional)
                        groupedReports[groupKey].degree_programme_name_e ||= stu.degree_programme_name_e;

                        // Add course values
                        stu.courses.forEach(c => {
                            if (c.T !== undefined) row[`${c.course_code}_T`] = c.T;
                            if (c.P !== undefined) row[`${c.course_code}_P`] = c.P;
                        });

                        groupedReports[groupKey].students.push(row);
                    });

                    tableColumns.push(
                        { label: 'FC', subColumns: { T: 'FC_T', P: 'FC_P' } },
                    )

                    let totalColspan = 0;
                    tableColumns.forEach(col => {
                        if (col.subColumns) {
                            totalColspan += (col.subColumns.T ? 1 : 0) + (col.subColumns.P ? 1 : 0);
                        } else {
                            totalColspan += 1;
                        }
                    });

                    // Combine groups in desired order
                    const orderedGroups = [
                        groupedReports['Regular Students'],
                        groupedReports['Repeat Students']
                    ];

                    // Reassign index globally across groups
                    let globalIndex = 1;
                    orderedGroups.forEach(group => {
                        group.students.forEach(student => {
                            student.index = globalIndex++;
                        });
                    });

                    // Final context for the template
                    const context = {
                        infoFields,
                        infoData: res.heanders,
                        tableColumns,
                        groupedReports: orderedGroups,
                        totalColspan,
                        pageInfo,
                        title: `${params.exam_type_name_e} Examination Notification`,
                        universityHeading: pageInfo?.universityHeading || `<div></div>`,
                    };

                    const compiledTemplate = handlebars.compile(raw_html);
                    const filledTemplate = compiledTemplate(context);

                    const options = {
                        format: 'A4',
                        margin: { top: '5mm', right: '2mm', bottom: '10mm', left: '2mm' },
                        printBackground: true,
                        displayHeaderFooter: true,
                        landscape: true,
                        headerTemplate: pageInfo?.border || `<div></div>`,
                        footerTemplate: pageInfo?.footer || `<div></div>`
                    };

                    const htmlPDF = new PuppeteerHTMLPDF();
                    htmlPDF.setOptions(options);
                    buffer = await htmlPDF.create(filledTemplate);

                    // Return the PDF buffer in the callback
                    return cback2(null);
                } else {
                    return cback2({ message: "No records found." }, null);
                }
            });
        },
    ], function (err, res) {
        if (err) {
            return callback({ message: `PDF generation failed - ${err.message}` }, null);
        } else {
            return callback(null, buffer);
        }
    });
};

function studentsForExamResultNotificationList_Revaluation(dbkey, request, params, sessionDetails, callback) {
    let landscape = params['orientation'] == 'landscape'
    let buffer;
    let pageInfo;
    async.series([
        function (cback) {
            let sessionDetails_0 = { ...sessionDetails, query_id: 223 };
            COMMON_SERVICE.getUniversityHeading(dbkey, request, params, sessionDetails_0, function (err, uniHtml) {
                if (err) return cback(err.message || err);
                pageInfo = uniHtml;
                return cback(null); // Proceed to next step
            });
        },
        function (cback2) {
            const raw_html = fs.readFileSync('assets/templates/academic/result_notification_revaluation.html', 'utf8');
            sessionDetails = { ...sessionDetails, query_id: 271 };
            let tempParam = {
                registration_status_id: 1,
                revaluation: 1,
                ...params
            }
            markEntry.evaluationExamResultNotification(dbkey, request, tempParam, sessionDetails, async function (err, res) {
                if (err) return cback2(err);
                if (res && res.students && res.students.length > 0) {
                    // --- 🧮 Step 1: Group by ue_id ---
                    const groupedStudents = {};
                    res.students.forEach(stu => {
                        if (!groupedStudents[stu.ue_id]) {
                            groupedStudents[stu.ue_id] = {
                                ue_id: stu.ue_id,
                                student_name: stu.student_name,
                                courses: []
                            };
                        }
                        groupedStudents[stu.ue_id].courses.push({
                            course_code: stu.course_code,
                            remark_short_name_e: stu.remark_short_name_e,
                            evaluation_marks: stu.evaluation_marks_o,
                            revaluation_marks: stu.revaluation_marks_o,
                        });
                    });

                    // --- 🧮 Step 2: Add index and rowspan count ---
                    let index = 1;
                    const finalStudents = Object.values(groupedStudents).map(stu => ({
                        index: index++,
                        ue_id: stu.ue_id,
                        student_name: stu.student_name,
                        rowspan: stu.courses.length, // 🟢 number of rows to merge
                        courses: stu.courses
                    }));

                    // --- 🧩 Step 3: Build template context ---
                    const context = {
                        infoData: res.heanders,
                        students: finalStudents,
                        pageInfo,
                        title: `Examination Notification ${params.exam_type_name_e}`,
                        universityHeading: pageInfo?.universityHeading || `<div></div>`,
                    };

                    const compiledTemplate = handlebars.compile(raw_html);
                    const filledTemplate = compiledTemplate(context);

                    const options = {
                        format: 'A4',
                        margin: { top: '5mm', right: '2mm', bottom: '10mm', left: '2mm' },
                        printBackground: true,
                        displayHeaderFooter: true,
                        landscape: false,
                        headerTemplate: pageInfo?.border || `<div></div>`,
                        footerTemplate: pageInfo?.footer || `<div></div>`
                    };

                    const htmlPDF = new PuppeteerHTMLPDF();
                    htmlPDF.setOptions(options);
                    buffer = await htmlPDF.create(filledTemplate);

                    // Return the PDF buffer in the callback
                    return cback2(null);
                } else {
                    return cback2({ message: "No records found." }, null);
                }
            });
        },
    ], function (err, res) {
        if (err) {
            return callback({ message: `PDF generation failed - ${err.message}` }, null);
        } else {
            return callback(null, buffer);
        }
    });
};