exports.getAllowedJsonFromPageIdQueryParamObj = function (user_id,page_id) {
    let q = `select * from page_access_control p where p.page_id = ? and p.user_id = ? ;`;
    return ({ query: q, params: [page_id,user_id] });
};