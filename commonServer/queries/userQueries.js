var getAllUserQueryObjParam = function () {
    var q = "select * from mas_user;"
    var p = {};
    return ({ query: q, params: p });
};


module.exports.getAllUserQueryObjParam = getAllUserQueryObjParam;