var async = require('async');
let masterService = {
  // add service functions here

  getCollegeList1: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getCollegeList1: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getAcademicSession1: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getDegreePrograamList: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getSemesterList: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getDegreewiseCourseYearList: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getCourseForAllot: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getCourseTypeList: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getCourseAllotmentTypeList: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getTeacherForCrsAlt: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getChildClgForCrsAllot: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getCourseYearDeanCmtiforCourAllot: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getYearDeancmtList: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getMasterCollege: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getCourseForUpdate: function (dbkey, request, params, sessionDetails, callback) {
    DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, function (err, res) {
      if (err) return callback(err);
      if (!res || res.length === 0) return callback(null, { courserows: [] });

      const courserows = [];
      const map = new Map();

      res.forEach(row => {
        const key = row.allotment_detail_id;

        if (!map.has(key)) {
          const courseobj = {
            allotment_detail_id: row.allotment_detail_id,
            allotment_main_id: row.allotment_main_id,
            course_id: row.course_id,
            course_type_id: row.course_type_id,
            cou_allot_type_id: row.cou_allot_type_id,
            course_name: row.course_name,
            course_type_name_e: row.course_type_name_e,
            cou_allot_type_name_e: row.cou_allot_type_name_e,
            course_nature: row.course_nature,
            credit: row.credit,
            course_module_id: row.course_module_id,
            module_name: row.module_name,
            course_module_batch_group_id: row.course_module_batch_group_id,
            course_module_batch_group_name_e: row.course_module_batch_group_name_e,
            eligible_course: row.eligible_course,
            section_required: row.section_required,
            //    finalize_yn: row.finalize_yn,
            teacherRows: []
          };
          map.set(key, courseobj);
          courserows.push(courseobj);
        }


        map.get(key).teacherRows.push({
          allotment_detail_id: row.allotment_detail_id,
          emp_id: row.emp_id,
          emp_name: row.emp_name,
          course_allotment_teacher_main_id: row.course_allotment_teacher_main_id,
          section_id: row.section_id,
          section_name: row.section_name,
        });
      });

      return callback(null, { courserows });
    });
  },

  getCourseList: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  checkCourseAllotment: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  checkCourseFinalizeStatus: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },
  getDegreeProgramType: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },
  getCourseYearList: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },
  getDeanCommitee: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },
  getCourseModule: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },
  getModuleBatchGroup: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },
  getSectionList: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getDegreeProgramType: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getAttendanceStatus: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getCourseYear: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getCollege: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getFaculty: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },
  getUniversity: function (dbkey, request, params, sessionDetails, callback) {
    // query_id = 223
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },
  getCourseTeacherForSectionAllot: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },
  getStudentsCount: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },
  getValuationType: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },
  getExamType: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },
  getRemark: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },
  getExamPaperType: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getUniversity: function (dbkey, request, params, sessionDetails, callback) {
    // query_id = 223
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },
  getFeePaidDetailByStudent: function (dbkey, request, params, sessionDetails, callback) {
    // query_id = 222
    // console.log("sessionDetails : => ", sessionDetails);
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

  getExamShiftTime: function (dbkey, request, params, sessionDetails, callback) {
    return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
  },

}
module.exports = masterService
