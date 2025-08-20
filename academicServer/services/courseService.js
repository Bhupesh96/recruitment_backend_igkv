var DB_SERVICE = global.DB_SERVICE;
var securityService = global.COMMON_SECURITY_SERVICE;
const DOC_UPLOAD_SERVICE = global.DOC_UPLOAD_SERVICE;
const SHARED_SERVICE = global.SHARED_SERVICE;
var async = require('async');
const { permissionDetailsObjectValidation, apiDetailsObjectValidation, queryDetailsObjectValidation, moduleDetailsObjectValidation, queryOtherParameterObjectValiadation, saveComponentDetailsValidation } = require('../validators/uservalidator');

let course = {
    //////////////////Course Allotment///////////////////
    saveCourseAllotment: function (dbkey, request, params, sessionDetails, callback) {
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
    
            // Step 2: Insert into course_allotment_main
            function (cback1) {
                params.table_name = 'course_allotment_main';
                SHARED_SERVICE.validateAndInsertInTable(dbkey, request, params, sessionDetails, function (err, res) {
                    if (err) return cback1(err);
                    else if (res.data && res.data['insertId']) {
                        params.Allotment_Main_ID = res.data['insertId']; // Primary key captured
                        return cback1();
                    } else {
                        return cback1({ message: 'Something went wrong inserting into course_allotment_main' });
                    }
                });
            },
    
            // Step 3: Insert into course_allotment_detail
            function (cback2) {
                async.eachSeries(params.courseRows, function (courseRow, cb) {
                    let insert_obj = {
                        table_name: 'course_allotment_detail',
                        Allotment_main_ID: params.Allotment_Main_ID, // FK from main table
                        Course_Id: courseRow.Course_Id,
                        Course_Type_Id: courseRow.Course_Type_Id,
                        Cou_Allot_Type_Id: courseRow.Cou_Allot_Type_Id,
                        // created_user_id: sessionDetails['user_id'],
                        // created_ip_address: sessionDetails['ip_address']
                    };
    
                    SHARED_SERVICE.validateAndInsertInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                        if (err) return cb(err);
                        else if (res.data && res.data['insertId']) {
                            courseRow.Allotment_Detail_ID = res.data['insertId']; // Capture PK for teacher mapping
                            return cb();
                        } else {
                            return cb({ message: 'Something went wrong inserting into course_allotment_detail' });
                        }
                    });
                }, function (err) {
                    return cback2(err);
                });
            },

            // Step 4: Insert into course_allotment_teacher_main
            function (cback3) {
                async.eachSeries(params.courseRows, function (courseRow, cb1) {
                    async.eachSeries(courseRow.teacherRows, function (teacherRow, cb2) {
                        let insert_obj = {
                            table_name: 'course_allotment_teacher_main',
                            Allotment_Detail_ID: courseRow.Allotment_Detail_ID, // FK from course_allotment_detail
                            Emp_Id: teacherRow.Emp_Id,
                            // created_user_id: sessionDetails['user_id'],
                            // created_ip_address: sessionDetails['ip_address']
                        };
                        SHARED_SERVICE.validateAndInsertInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                            if (err) return cb2(err);
                            else if (res.data && res.data['affectedRows']) return cb2();
                            else return cb2({ message: 'Something went wrong inserting into course_allotment_teacher_main' });
                        });
                    }, function (err) {
                        return cb1(err);
                    });
                }, function (err) {
                    return cback3(err);
                });
            }
    
        ], function (err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function () {
                    return callback(err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function () {
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Course Allotment saved successfully' });
                });
            }
        });
    },

    /////////////////Save Course Allotment Multiple//////
    saveCourseAllotmentForMltiClg: function(dbkey, request, finaldata, sessionDetails, callback) {
        let tranObj, tranCallback;
        const result = []; // To store the mapped output
        
        async.series([
            // Step 1: Create Transaction
            function(cback) {
                DB_SERVICE.createTransaction(dbkey, function(err, tranobj, trancallback) {
                    tranObj = tranobj;
                    tranCallback = trancallback;
                    dbkey = { dbkey: dbkey, connectionobj: tranObj };
                    return cback(err);
                });
            },
    
            // Step 2: Process each college
            function(cback) {
                async.eachSeries(finaldata.colgdata, function(college, collegeCb) {
                    const collegeAllotment = {
                        ...finaldata.acaddata,
                        College_Id: college.college_id,
                        table_name: 'course_allotment_main'
                    };
    
                    let allotmentMainId;
                    let courseDetails = [];
    
                    async.series([
                        // Insert main allotment record
                        function(seriesCb) {
                            SHARED_SERVICE.validateAndInsertInTable(
                                dbkey, request, collegeAllotment, sessionDetails, 
                                function(err, res) {
                                    if (err) return seriesCb(err);
                                    allotmentMainId = res.data.insertId;
                                    seriesCb();
                                }
                            );
                        },
    
                        // Process courses
                        function(seriesCb) {
                            async.eachSeries(finaldata.acaddata.courseRows, function(course, courseCb) {
                                const courseDetail = {
                                    table_name: 'course_allotment_detail',
                                    Allotment_main_ID: allotmentMainId,
                                    Course_Id: course.Course_Id,
                                    Course_Type_Id: course.Course_Type_Id,
                                    Cou_Allot_Type_Id: course.Cou_Allot_Type_Id,
                                    // Total_Credit: course.Total_Credit
                                };
    
                                SHARED_SERVICE.validateAndInsertInTable(
                                    dbkey, request, courseDetail, sessionDetails,
                                    function(err, res) {
                                        if (err) return courseCb(err);
                                        
                                        const allotmentDetailId = res.data.insertId;
                                        const mappedCourse = {
                                            ...course,
                                            Allotment_main_ID: allotmentMainId,
                                            teacherRows: course.teacherRows.map(teacher => ({
                                                ...teacher,
                                                Allotment_Detail_ID: allotmentDetailId
                                            }))
                                        };
    
                                        // Store for result
                                        if (!result.some(c => c.College_Id === college.college_id)) {
                                            result.push({
                                                ...collegeAllotment,
                                                courseRows: []
                                            });
                                        }
                                        result.find(c => c.College_Id === college.college_id)
                                              .courseRows.push(mappedCourse);
    
                                        // Insert teachers if any
                                        if (course.teacherRows.length > 0) {
                                            const teachers = course.teacherRows.map(teacher => ({
                                                table_name: 'course_allotment_teacher_main',
                                                Allotment_Detail_ID: allotmentDetailId,
                                                Emp_Id: teacher.Emp_id
                                            }));
    
                                            const insertObj = {
                                                table_name: 'course_allotment_teacher_main',
                                                data_arr: teachers
                                            };
    
                                            SHARED_SERVICE.validateAndInsertArrInTable(
                                                dbkey, request, insertObj, sessionDetails,
                                                function(err) {
                                                    courseCb(err);
                                                }
                                            );
                                        } else {
                                            courseCb();
                                        }
                                    }
                                );
                            }, seriesCb);
                        }
                    ], collegeCb);
                }, cback);
            }
        ], function(err) {
            if (err) {
                DB_SERVICE.rollbackPartialTransaction(tranObj, tranCallback, function() {
                    callback(err);
                });
            } else {
                DB_SERVICE.commitPartialTransaction(tranObj, tranCallback, function() {
                    callback(null, { 
                        ...securityService.SECURITY_ERRORS.SUCCESS, 
                        message: 'Allotments created successfully',
                        data: result 
                    });
                });
            }
        });
    },
    
    

    //////////////////Update Alloted Course/////////////
    updateCourseAllotment: function (dbkey, request, params, sessionDetails, callback) {
        let tranObj, tranCallback;
        
        // Debugging: Log the entire request body
        // console.log("Request body received:", request.body);
        
        // Extract the payload - use request.body since that's where your data is
        const payload = params;
        
        // Check for Allotment_Detail_ID in the payload
        if (!payload || !payload.Allotment_Detail_ID) {
            console.log("Payload structure:", payload);
            return callback({ message: `Allotment_Detail_ID is required in the request payload` });
        }
    
        const allotmentDetailId = payload.Allotment_Detail_ID;
    
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
            
            // Update course_allotment_detail table
           // Update course_allotment_detail table
           function (cback1) {
            let updateParams = {
              table_name: 'course_allotment_detail',
              Allotment_Detail_ID: payload.Allotment_Detail_ID,   // <-- MUST be here
              Allotment_Main_ID: payload.Allotment_Main_ID,
              Cou_Allot_Type_Id: payload.Cou_Allot_Type_Id,
              Course_Id: payload.Course_Id,
            //   Course_Nature: payload.Course_Nature,
              Course_Type_Id: payload.Course_Type_Id,
            // Total_Credit:payload.Total_Credit.split('+').reduce((acc,cur)=>acc+cur,0)
            };
          
            return SHARED_SERVICE.validateAndUpdateInTable(dbkey, request, updateParams, sessionDetails, function (err, res) {  
                if (err) {
                console.error("Update error:", err);
                return cback1(err);
              } else if (res && res.length > 0) {
                return cback1();
              } else {
                return cback1({ message: `No record updated in course_allotment_detail` });
              }
            });
          },
          
            // Delete existing teacher mappings
            function (cback2) {
                SHARED_SERVICE.insrtAndDltOperation(
                    dbkey, 
                    request, 
                    { 
                        delete_table_name: 'course_allotment_teacher_main', 
                        whereObj: { Allotment_Detail_ID: allotmentDetailId } 
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
                
                let data_arr = payload.teacherRows.map(teacher => {
                    return {
                        Allotment_Detail_ID: allotmentDetailId,
                        Emp_Id: teacher.Emp_Id,
                        // Course_Allotment_Teacher_Main_ID: teacher.Course_Allotment_Teacher_Main_ID
                    };
                });
                
                let insert_obj = { 
                    table_name: 'course_allotment_teacher_main', 
                    data_arr: data_arr 
                };
                
                console.log("Insert parameters:", insert_obj); // Debugging
                
                SHARED_SERVICE.validateAndInsertArrInTable(dbkey, request, insert_obj, sessionDetails, function (err, res) {
                    if (err) {
                        console.error("Insert error:", err); // Debugging
                        return cback3(err);
                    } else if (res.data && res.data.affectedRows) {
                        return cback3();
                    } else {
                        return cback3({ message: `Failed to insert teacher mappings` });
                    }
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
                    return callback(null, { ...securityService.SECURITY_ERRORS.SUCCESS, message: 'Course allotment updated successfully' });
                });
            }
        });
    },
    
    deleteCourseAllotment: function (dbkey, request, params, sessionDetails, callback) {
        SHARED_SERVICE.insrtAndDltOperationTranstion(dbkey, request, { delete_table_name: 'course_allotment_detail', log_table_name: 'app_log_course_allotment_detail', whereObj: { "Allotment_Detail_ID": params.Allotment_Detail_ID } }, sessionDetails, function (err, res) {
            if (err) {
                return callback(err);
            } else {
                return callback(null, { message: "deleted successfully." });
            }
        })
    },

    ///////////////////Update Finalize Status////////////////////
    updateFinalizeStatus: function (dbkey, request, params, sessionDetails, callback) {
        let whereObj = { "Allotment_Main_ID": params.Allotment_Main_ID };
        let updateObj = {
            "Finalize_YN": "Y",
            "action_ip_address": sessionDetails.ip_address,
            "action_by": sessionDetails.user_id,
            "action_type":'U'
        };
        let data = {log_table_name: "app_log_course_allotment_main",update_table_name: "course_allotment_main", whereObj, updateObj };
        return SHARED_SERVICE.insertAndUpdtOperationTranstion(dbkey, request, data, sessionDetails, callback);
    },

     ///////////////////Update Finalize Status////////////////////
     updateUnfinalizeStatus: function (dbkey, request, params, sessionDetails, callback) {
        let whereObj = { "Allotment_Main_ID": params.Allotment_Main_ID };
        let updateObj = {
            "Finalize_YN": "N",
            "action_ip_address": sessionDetails.ip_address,
            "action_by": sessionDetails.user_id,
            "action_type":'U'
        };
        let data = {log_table_name: "app_log_course_allotment_main",update_table_name: "course_allotment_main", whereObj, updateObj };
        return SHARED_SERVICE.insertAndUpdtOperationTranstion(dbkey, request, data, sessionDetails, callback);
    }

}

module.exports = course































































































const processQueryDetails = (dbkey, request, params, sessionDetails, callback, operationType) => {
    const { error, value } = queryDetailsObjectValidation(params, operationType);
    if (error) return callback({ message: `${error.details[0].message}` });

    if (value.query_object.other && Object.keys(value.query_object.other).length > 0) {
        for (const [key, obj] of Object.entries(value.query_object.other)) {
            const { error } = queryOtherParameterObjectValiadation(obj);
            if (error) return callback({ message: `in query_object.other.${key} ${error.details[0].message}` });
        }
    }
    let excuteQueryDbkey = global.COMMON_CONFS.map_dbkey_database[value.base_database];
    if (!excuteQueryDbkey) return callback({ message: `base database ${value.base_database} is not mapped with dbkey` })
    async.series([
        //build and test the query
        function (cback1) {
            buildAndRunEachQueryOfQueryObject(excuteQueryDbkey, value.query_object, function (err, res) {
                return cback1(err)
            })
        },
        //insert or update query
        function (cback2) {
            value.query_object = JSON.stringify(value.query_object);
            if (operationType === 1) {
                // Insert operation
                return SHARED_SERVICE.validateAndInsertInTable(
                    dbkey, request, { table_name: 'mas_custom_queries', ...value }, sessionDetails, cback2
                );
            } else {
                // Update operation
                const whereObj = { query_id: value.query_id };
                const updateObj = { query_object: value.query_object, query_name: value.query_name, module_id: value.module_id, is_permission: value.is_permission };
                const data = {
                    log_table_name: 'app_log_mas_custom_queries',
                    update_table_name: "mas_custom_queries",
                    whereObj,
                    updateObj
                };
                return SHARED_SERVICE.insertAndUpdtOperationTranstion(dbkey, request, data, sessionDetails, cback2);
            }
        }
    ], function (err, res) {
        if (err) return callback(err);
        else return callback(null, res[1]);
    })


};

const buildAndRunEachQueryOfQueryObject = (dbkey, query_object, callback) => {
    let all_permission_queryObject = DB_SERVICE.buildQuery(query_object, "A");
    let sessional_permission_queryObject = DB_SERVICE.buildQuery(query_object, "S");
    let custom_queryObject = DB_SERVICE.buildQuery(query_object, "C");
    let other_queryParamArray = []
    for (const [key, obj] of Object.entries(query_object.other)) {
        other_queryParamArray.push(DB_SERVICE.buildQuery(query_object, "A", [key]));
    }
    async.parallel([
        function (cback1) {
            if (!isSelectQuery(all_permission_queryObject.query)) return cback1({ message: `update or delete query not allowed in all_permission_queryObject:- ${all_permission_queryObject.query}`, code: 'UPDATE_DELETE_QUERY' })
            DB_SERVICE.executeQueryWithParameters(dbkey, all_permission_queryObject.query, all_permission_queryObject.params, function (err, res) {
                if (err) return cback1({ message: `in all_permission_queryObject:- ${err.sqlMessage}`, code: 'INVALID_QUERY', query: `${err.sql}` });
                return cback1(null)
            })
        },
        function (cback1) {
            if (!isSelectQuery(sessional_permission_queryObject.query)) return cback1({ message: `update or delete query not allowed in sessional_permission_queryObject:- ${sessional_permission_queryObject.query}`, code: 'UPDATE_DELETE_QUERY' })
            DB_SERVICE.executeQueryWithParameters(dbkey, sessional_permission_queryObject.query, sessional_permission_queryObject.params, function (err, res) {
                if (err) return cback1({ message: `in sessional_permission_queryObject:- ${err.sqlMessage}`, code: 'INVALID_QUERY', query: `${err.sql}` });
                return cback1(null)
            })
        },
        function (cback1) {
            if (!isSelectQuery(custom_queryObject.query)) return cback1({ message: `update or delete query not allowed in custom_permission_queryObject:- ${custom_queryObject.query}`, code: 'UPDATE_DELETE_QUERY' })
            DB_SERVICE.executeQueryWithParameters(dbkey, custom_queryObject.query, custom_queryObject.params, function (err, res) {
                if (err) return cback1({ message: `in custom_permission_queryObject:- ${err.sqlMessage}`, code: 'INVALID_QUERY', query: `${err.sql}` });;
                return cback1(null)
            })
        },
        function (cback1) {
            if (other_queryParamArray.length == 0) return cback1(null);
            DB_SERVICE.executeMultiSelQueriesWithParameters(dbkey, other_queryParamArray, function (err, res) {
                if (err) {
                    return cback1({ message: `in other:- ${err.sqlMessage}`, code: 'INVALID_QUERY', query: `${err.sql}` });
                }
                return cback1(null);
            });
        }

    ], function (err, res) {
        return callback(err, res);
    })
}

function isSelectQuery(query) {
    if (!query || typeof query !== "string") return false;
    query = query.trim().toLowerCase(); // Normalize query
    // Check if it starts with 'select' or starts with 'with' followed by a 'select'
    return query.startsWith("select") || query.startsWith("with") && query.includes("select");
}
