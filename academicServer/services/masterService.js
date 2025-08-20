var async = require('async');
let masterService = { 
// add service functions here
 
getAcademicSession: function (dbkey, request, params, sessionDetails, callback) {
  return callback(null, { message: "getAcademicSession called successfully" });
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

getCourseForUpdate: function (dbkey, request, params, sessionDetails, callback) {
      DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, function (err, res) {
        if (err) return callback(err);
        if (!res || res.length === 0) return callback(null, { courseRows: [] });
    
        const courseRows = [];
        const map = new Map();
    
        res.forEach(row => {
          const key = row.Allotment_Detail_ID; 
    
          if (!map.has(key)) {
            const courseObj = {
              Allotment_Detail_ID: row.Allotment_Detail_ID,
              Allotment_Main_ID: row.Allotment_Main_ID,
              Course_Id: row.Course_Id,
              Course_Type_Id: row.Course_Type_Id,
              Cou_Allot_Type_Id: row.Cou_Allot_Type_Id,
              course_name: row.course_name,
              Course_Type_Name_E: row.Course_Type_Name_E,
              Cou_Allot_Type_Name_E: row.Cou_Allot_Type_Name_E,
              course_nature: row.course_nature,
              Credit: row.Credit,
              Finalize_YN: row.Finalize_YN,
              teacherRows: []
            };
            map.set(key, courseObj);
            courseRows.push(courseObj);
          }
    
          map.get(key).teacherRows.push({
            Allotment_Detail_ID: row.Allotment_Detail_ID,
            Emp_Id: row.Emp_Id,
            emp_name: row.emp_name,
            Course_Allotment_Teacher_Main_ID:row.Course_Allotment_Teacher_Main_ID   
          });
        });
    
        return callback(null, { courseRows });
      });
    }
    

      

    
    }
module.exports = masterService
