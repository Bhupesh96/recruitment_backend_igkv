
var getLoginDetailsQuery = function (emp_id) {
   let  q = `SELECT group_CONCAT(e.designation_id) as designation_ids,ul.user_name,ul.password,ul.password_flag,ul.user_id,ul.active_status  FROM user_login ul 
INNER JOIN employee_designation_mapping e ON e.emp_id = ul.emp_id
WHERE ul.emp_id = ? 
 `;
    var p = [emp_id];
    return { query: q, params: p };
}
module.exports.getLoginDetailsQuery = getLoginDetailsQuery;

module.exports.getSessionDetailQuery = function (session_id) {
    return { query: "select * from sessions where session_id=? ", params: [session_id] };
}

var getdeletesessionquery = function (session_id) {
    return { query: `delete from sessions where session_id="${session_id}"`, params: [] };
}

var getdeleteUserAllSessionquery = function (user_id) {
    return { query: `delete from sessions where user_id="${user_id}"`, params: [] };
}
var getUserSessionDetailsquery = function (user_id) {
    return { query: `select * from sessions where user_id=?`, params: [user_id] };
}
module.exports.getApiPermissionQuery = (api,post_id,page_id)=>{
    return { query: `select * from access_post_page_api appa
INNER JOIN master_api_names man ON man.api_id = appa.api_id
WHERE appa.post_id = ? AND appa.page_id = ? AND man.api_name = '${api}'`, params: [post_id,page_id] };
}

module.exports.getApiPermissionQuery_ = (api,post_id)=>{
    return { query: `SELECT m.post_id,m.access_type FROM map_post_api m
INNER JOIN mas_api man ON man.api_id = m.api_id
WHERE man.api_name = '${api}' AND m.post_id = ?`, params: [post_id] };
}


module.exports.getUserSessionDetailsquery = getUserSessionDetailsquery;
module.exports.getdeleteUserAllSessionquery = getdeleteUserAllSessionquery;
module.exports.getdeletesessionquery = getdeletesessionquery;
